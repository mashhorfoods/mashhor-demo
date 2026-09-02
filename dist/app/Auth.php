<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Authentication and session handling (§06, §07, §08, §09).
 *
 * Sessions are rows, not signed cookies. The cookie carries a random token;
 * the row carries its SHA-256. That buys three things a stateless token does
 * not: logout can actually revoke, a leaked database dump cannot be replayed
 * as a live login, and an expiry can be enforced on the server rather than
 * trusted from the client.
 *
 * Nothing in this file ever returns, logs or serialises a password hash.
 */
final class Auth
{
    private static ?array $user    = null;
    private static ?array $session = null;
    private static bool   $checked = false;

    /* ---- password handling (§06) ------------------------------------- */

    public static function algo(): string
    {
        /* Argon2id where the host compiled it in — Hostinger's PHP 8 does —
           and bcrypt where it did not. Either way, never plaintext, and never
           an unsalted digest. */
        return defined('PASSWORD_ARGON2ID') && in_array('argon2id', password_algos(), true)
            ? PASSWORD_ARGON2ID
            : PASSWORD_BCRYPT;
    }

    public static function hash(string $plain): string
    {
        return password_hash($plain, self::algo());
    }

    public static function verify(string $plain, string $hash): bool
    {
        return $hash !== '' && password_verify($plain, $hash);
    }

    /* ---- login (§08) --------------------------------------------------- */

    public const LOCK_THRESHOLD = 8;      /* failures before a temporary lock */
    public const LOCK_MINUTES   = 15;

    /**
     * Returns the session token on success, or null. The caller gets one
     * message for every failure mode on purpose: telling an attacker that an
     * address exists but the password was wrong is an account enumeration
     * oracle. The distinction is recorded in the log, where it belongs (§27).
     */
    public static function attempt(string $email, string $password, ?string &$reason = null): ?string
    {
        $email = mb_strtolower(trim($email));
        $user  = Repo_Users::findByEmail($email);
        $now   = Db::now();

        if ($user === null) {
            /* compare against a real hash anyway, so a missing account and a
               wrong password take the same time */
            password_verify($password, '$2y$12$usesomesillystringfooobarbazquxquuxcorgegraultgarplyC');
            $reason = 'no_such_user';
            Log::write('warn', 'login failed', ['email' => $email, 'reason' => 'no_such_user', 'ip' => Http::ip()]);
            return null;
        }

        if ($user['locked_until'] !== null && $user['locked_until'] > $now) {
            $reason = 'locked';
            Log::write('warn', 'login blocked: account locked', ['user_id' => $user['id'], 'ip' => Http::ip()]);
            return null;
        }

        if (!(int) $user['is_active']) {
            $reason = 'inactive';
            Log::write('warn', 'login failed: account disabled', ['user_id' => $user['id'], 'ip' => Http::ip()]);
            return null;
        }

        if (!self::verify($password, (string) $user['password_hash'])) {
            $reason = 'bad_password';
            Repo_Users::registerFailure((int) $user['id'], self::LOCK_THRESHOLD, self::LOCK_MINUTES);
            Log::write('warn', 'login failed', ['user_id' => $user['id'], 'reason' => 'bad_password', 'ip' => Http::ip()]);
            return null;
        }

        /* the cost factor may have moved since the hash was written */
        if (password_needs_rehash((string) $user['password_hash'], self::algo())) {
            Repo_Users::setPassword((int) $user['id'], self::hash($password));
        }

        Repo_Users::registerSuccess((int) $user['id']);
        $reason = null;
        return self::startSession((int) $user['id']);
    }

    /* ---- session lifecycle -------------------------------------------- */

    public static function cookieName(): string
    {
        return (string) Env::get('SESSION_COOKIE', 'aun_sid');
    }

    private static function token(): string
    {
        return bin2hex(random_bytes(32));
    }

    public static function tokenHash(string $token): string
    {
        return hash('sha256', $token);
    }

    private static function absoluteExpiry(): string
    {
        return gmdate('Y-m-d H:i:s', time() + Env::int('SESSION_ABSOLUTE_HOURS', 12) * 3600);
    }

    /** The CSRF token minted with the session, readable for the rest of the request. */
    private static ?string $freshCsrf = null;

    public static function freshCsrf(): ?string { return self::$freshCsrf; }

    public static function startSession(int $userId): string
    {
        $token = self::token();
        $csrf  = self::token();
        $now   = Db::now();
        $sid   = self::tokenHash($token);

        Db::run(
            'INSERT INTO sessions (id, user_id, csrf_hash, ip, user_agent, created_at, last_seen_at, expires_at)
             VALUES (?,?,?,?,?,?,?,?)',
            [
                $sid, $userId, self::tokenHash($csrf),
                Http::ip(), Http::userAgent(), $now, $now, self::absoluteExpiry(),
            ]
        );

        self::sendCookie(self::cookieName(), $token, time() + Env::int('SESSION_ABSOLUTE_HOURS', 12) * 3600);
        /* the CSRF token is the one thing the client is meant to read back, so
           it is deliberately not HttpOnly — it is not a credential on its own */
        self::sendCookie('aun_csrf', $csrf, 0, false);

        /* The cookie has been sent but $_COOKIE belongs to the request that
           arrived, so re-reading it here would find nothing and the rest of
           this request would look unauthenticated. Hydrate directly instead. */
        self::hydrate($sid);
        self::$freshCsrf = $csrf;
        return $token;
    }

    /** Load a session row by its id and make it the current one. */
    private static function hydrate(string $sessionId): void
    {
        $row = Db::one(
            'SELECT s.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                    u.is_active AS user_active, u.permissions AS user_permissions
               FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.id = ?',
            [$sessionId]
        );
        self::$checked = true;
        self::$session = $row;
        self::$user = $row === null ? null : [
            'id'          => (int) $row['user_id'],
            'name'        => (string) $row['user_name'],
            'email'       => (string) $row['user_email'],
            'role'        => (string) $row['user_role'],
            'permissions' => $row['user_permissions'],
        ];
    }

    public static function sendCookie(string $name, string $value, int $expires, bool $httpOnly = true): void
    {
        if (headers_sent()) return;
        $secure = Env::bool('SESSION_COOKIE_SECURE', true) && (Http::isHttps() || Env::isProduction());
        setcookie($name, $value, [
            'expires'  => $expires,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => $httpOnly,
            'samesite' => 'Lax',
        ]);
    }

    public static function clearCookie(string $name): void
    {
        self::sendCookie($name, '', time() - 3600);
    }

    /**
     * Resolve the current session, if any. A session is valid only when the
     * row exists, is not revoked, has not passed its absolute expiry, has been
     * seen inside the idle window, and belongs to an account that is still
     * active. Any one of those failing is a rejection (§07, §30).
     */
    public static function current(): ?array
    {
        if (self::$checked) return self::$session;
        self::$checked = true;
        self::$session = null;
        self::$user    = null;

        $raw = $_COOKIE[self::cookieName()] ?? '';
        if (!is_string($raw) || !preg_match('/^[0-9a-f]{64}$/', $raw)) return null;

        $row = Db::one(
            'SELECT s.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                    u.is_active AS user_active, u.permissions AS user_permissions
               FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.id = ?',
            [self::tokenHash($raw)]
        );
        if ($row === null) return null;

        $now = Db::now();
        if ($row['revoked_at'] !== null)  return null;
        if ($row['expires_at'] <= $now)   { Repo_Users::revokeSession((string) $row['id'], 'expired'); return null; }
        if (!(int) $row['user_active'])   { Repo_Users::revokeSession((string) $row['id'], 'user_disabled'); return null; }

        $idle = Env::int('SESSION_IDLE_MINUTES', 120);
        if ($idle > 0 && strtotime((string) $row['last_seen_at'] . ' UTC') + $idle * 60 < time()) {
            Repo_Users::revokeSession((string) $row['id'], 'idle');
            return null;
        }

        /* touch at most once a minute — a write on every request is a lot of
           writes for a shared-hosting database and buys nothing */
        if (strtotime((string) $row['last_seen_at'] . ' UTC') + 60 < time()) {
            Db::run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [$now, $row['id']]);
        }

        self::$session = $row;
        self::$user = [
            'id'          => (int) $row['user_id'],
            'name'        => (string) $row['user_name'],
            'email'       => (string) $row['user_email'],
            'role'        => (string) $row['user_role'],
            'permissions' => $row['user_permissions'],
        ];
        return self::$session;
    }

    public static function user(): ?array
    {
        self::current();
        return self::$user;
    }

    public static function id(): ?int
    {
        $u = self::user();
        return $u === null ? null : (int) $u['id'];
    }

    public static function label(): string
    {
        $u = self::user();
        return $u === null ? 'النظام' : (string) $u['name'];
    }

    public static function check(): bool
    {
        return self::current() !== null;
    }

    /** §09 — logout must make the session unusable, not merely drop the cookie. */
    public static function logout(): void
    {
        $s = self::current();
        if ($s !== null) {
            Repo_Users::revokeSession((string) $s['id'], 'logout');
            Log::write('info', 'logout', ['user_id' => $s['user_id']]);
        }
        self::clearCookie(self::cookieName());
        self::clearCookie('aun_csrf');
        self::$session = null;
        self::$user    = null;
        self::$checked = true;
        self::$freshCsrf = null;
    }

    /** Rejects the request unless a valid session is present. */
    public static function require(): array
    {
        $u = self::user();
        if ($u === null) Http::unauthenticated();
        return $u;
    }

    /** The safe shape of a user for any response — never the hash. */
    public static function publicUser(array $u): array
    {
        return [
            'id'    => (int) $u['id'],
            'name'  => (string) $u['name'],
            'email' => (string) $u['email'],
            'role'  => (string) $u['role'],
            'roleLabel' => Schema::ROLE_LABEL[(string) $u['role']] ?? (string) $u['role'],
            'permissions' => Authz::permissions($u),
        ];
    }

    /** Housekeeping — called opportunistically, never on the request path. */
    public static function pruneExpired(): void
    {
        $now = Db::now();
        Db::run('DELETE FROM sessions WHERE expires_at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]);
        Db::run('DELETE FROM guest_sessions WHERE expires_at < ?', [$now]);
        Db::run('DELETE FROM rate_hits WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]);
        Db::run('DELETE FROM request_submissions WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 7 * 86400)]);
    }
}
