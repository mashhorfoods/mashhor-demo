<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * CSRF protection.
 *
 * The public form already carries a hidden `csrf_token` field marked "filled
 * by the server", but index.html is a static file — no server fills anything.
 * So the token is issued by GET /api/csrf against a short-lived guest session,
 * and the page fetches it on load. Admin requests use their own session's
 * token.
 *
 * The token is compared with hash_equals against a stored SHA-256, so the
 * comparison is constant-time and the database never holds a usable token.
 */
final class Csrf
{
    public const GUEST_COOKIE  = 'aun_gsid';
    public const HEADER        = 'X-CSRF-Token';
    private const GUEST_HOURS  = 4;

    /** Issues (or reuses) a token for whoever is calling — admin or anonymous. */
    public static function issue(): array
    {
        $session = Auth::current();
        if ($session !== null) {
            /* a session minted during this very request has a token that no
               $_COOKIE can carry yet — the browser has not sent it back */
            $fresh = Auth::freshCsrf();
            if ($fresh !== null) return ['token' => $fresh, 'scope' => 'session'];

            /* an admin session already has a token; rotating it here would
               invalidate a form the operator has open in another tab */
            $token = $_COOKIE['aun_csrf'] ?? '';
            if (is_string($token) && preg_match('/^[0-9a-f]{64}$/', $token)
                && hash_equals((string) $session['csrf_hash'], hash('sha256', $token))) {
                return ['token' => $token, 'scope' => 'session'];
            }
            $token = bin2hex(random_bytes(32));
            Db::run('UPDATE sessions SET csrf_hash = ? WHERE id = ?',
                [hash('sha256', $token), $session['id']]);
            Auth::sendCookie('aun_csrf', $token, 0, false);
            return ['token' => $token, 'scope' => 'session'];
        }

        $existing = self::guest();
        if ($existing !== null) {
            $token = $_COOKIE['aun_csrf'] ?? '';
            if (is_string($token) && preg_match('/^[0-9a-f]{64}$/', $token)
                && hash_equals((string) $existing['csrf_hash'], hash('sha256', $token))) {
                return ['token' => $token, 'scope' => 'guest'];
            }
        }

        $sid   = bin2hex(random_bytes(32));
        $token = bin2hex(random_bytes(32));
        Db::run(
            'INSERT INTO guest_sessions (id, csrf_hash, ip, created_at, expires_at) VALUES (?,?,?,?,?)',
            [
                hash('sha256', $sid), hash('sha256', $token), Http::ip(),
                Db::now(), gmdate('Y-m-d H:i:s', time() + self::GUEST_HOURS * 3600),
            ]
        );
        Auth::sendCookie(self::GUEST_COOKIE, $sid, time() + self::GUEST_HOURS * 3600);
        Auth::sendCookie('aun_csrf', $token, 0, false);
        return ['token' => $token, 'scope' => 'guest'];
    }

    private static function guest(): ?array
    {
        $sid = $_COOKIE[self::GUEST_COOKIE] ?? '';
        if (!is_string($sid) || !preg_match('/^[0-9a-f]{64}$/', $sid)) return null;
        return Db::one(
            'SELECT * FROM guest_sessions WHERE id = ? AND expires_at > ?',
            [hash('sha256', $sid), Db::now()]
        );
    }

    /** Reads the token from wherever the caller put it — field or header. */
    private static function presented(): ?string
    {
        $input = Http::input();
        $t = $input['csrf_token'] ?? null;
        if (is_string($t) && $t !== '') return $t;
        $h = Http::header(self::HEADER);
        return (is_string($h) && $h !== '') ? $h : null;
    }

    public static function valid(): bool
    {
        $token = self::presented();
        if ($token === null || !preg_match('/^[0-9a-f]{64}$/', $token)) return false;
        $hash = hash('sha256', $token);

        $session = Auth::current();
        if ($session !== null) return hash_equals((string) $session['csrf_hash'], $hash);

        $guest = self::guest();
        return $guest !== null && hash_equals((string) $guest['csrf_hash'], $hash);
    }

    /** Rejects the request unless a matching token was presented. */
    public static function require(): void
    {
        if (self::valid()) return;
        Log::write('warn', 'csrf rejected', ['path' => Http::path(), 'ip' => Http::ip()]);
        Http::fail(419, 'csrf_failed',
            'انتهت صلاحية النموذج. حدّث الصفحة وأعد المحاولة.');
    }
}
