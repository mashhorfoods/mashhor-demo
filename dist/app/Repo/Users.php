<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Administrator accounts and their sessions.
 *
 * Every read that can reach a client goes through publicRow(), which never
 * selects password_hash. The one query that does select it is findByEmail(),
 * used solely by Auth::attempt() and never returned anywhere (§06).
 */
final class Repo_Users
{
    private const PUBLIC_COLS =
        'id, name, email, role, is_active, permissions, last_login_at, created_at, updated_at';

    public static function findByEmail(string $email): ?array
    {
        return Db::one('SELECT * FROM users WHERE email = ?', [mb_strtolower(trim($email))]);
    }

    public static function find(int $id): ?array
    {
        return Db::one('SELECT ' . self::PUBLIC_COLS . ' FROM users WHERE id = ?', [$id]);
    }

    public static function all(): array
    {
        return Db::all('SELECT ' . self::PUBLIC_COLS . ' FROM users ORDER BY created_at ASC, id ASC');
    }

    public static function activeSuperCount(?int $excludingId = null): int
    {
        $sql    = "SELECT COUNT(*) FROM users WHERE role = 'super' AND is_active = 1";
        $params = [];
        if ($excludingId !== null) { $sql .= ' AND id <> ?'; $params[] = $excludingId; }
        return (int) Db::value($sql, $params);
    }

    public static function create(string $name, string $email, string $password, string $role, bool $active, ?array $permissions): int
    {
        if (!in_array($role, Schema::ROLES, true)) {
            throw new InvalidArgumentException('unknown role');
        }
        $now = Db::now();
        Db::run(
            'INSERT INTO users (name, email, password_hash, role, is_active, permissions, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?)',
            [
                $name, mb_strtolower($email), Auth::hash($password), $role, $active ? 1 : 0,
                $permissions === null ? null : json_encode($permissions, JSON_UNESCAPED_UNICODE),
                $now, $now,
            ]
        );
        return (int) Db::lastId();
    }

    public static function update(int $id, array $fields): void
    {
        $allowed = ['name', 'email', 'role', 'is_active', 'permissions'];
        $set = [];
        $params = [];
        foreach ($fields as $k => $v) {
            if (!in_array($k, $allowed, true)) continue;
            $set[] = "{$k} = ?";
            $params[] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v;
        }
        if ($set === []) return;
        $set[] = 'updated_at = ?';
        $params[] = Db::now();
        $params[] = $id;
        Db::run('UPDATE users SET ' . implode(', ', $set) . ' WHERE id = ?', $params);
    }

    public static function setPassword(int $id, string $hash): void
    {
        Db::run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [$hash, Db::now(), $id]);
    }

    /** Clears a temporary lock. Used by a password reset and by recovery. */
    public static function unlock(int $id): void
    {
        Db::run('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
            [Db::now(), $id]);
    }

    /**
     * The accounts that can still administer the system. recover.php lists
     * these so an operator can see which address to recover — it is behind a
     * token that only whoever controls the server can set, and it shows a name
     * and an address, never a hash.
     */
    public static function supers(): array
    {
        return Db::all('SELECT ' . self::PUBLIC_COLS . " FROM users WHERE role = 'super' ORDER BY id ASC");
    }

    public static function registerFailure(int $id, int $threshold, int $lockMinutes): void
    {
        Db::run('UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = ? WHERE id = ?',
            [Db::now(), $id]);
        $n = (int) Db::value('SELECT failed_attempts FROM users WHERE id = ?', [$id]);
        if ($n >= $threshold) {
            Db::run('UPDATE users SET locked_until = ? WHERE id = ?',
                [gmdate('Y-m-d H:i:s', time() + $lockMinutes * 60), $id]);
            Log::write('warn', 'account temporarily locked after repeated failures', ['user_id' => $id]);
        }
    }

    public static function registerSuccess(int $id): void
    {
        Db::run(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?',
            [Db::now(), Db::now(), $id]
        );
    }

    public static function revokeSession(string $sessionId, string $why): void
    {
        Db::run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
            [Db::now(), $sessionId]);
        Log::write('info', 'session revoked', ['reason' => $why]);
    }

    /** Used when an account is disabled or its role changes under it (§10). */
    public static function revokeAllSessions(int $userId, string $why): void
    {
        Db::run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
            [Db::now(), $userId]);
        Log::write('info', 'all sessions revoked for user', ['user_id' => $userId, 'reason' => $why]);
    }

    /** The shape the users module consumes. Never carries a hash. */
    public static function publicRow(array $u): array
    {
        return [
            'id'          => (int) $u['id'],
            'name'        => (string) $u['name'],
            'email'       => (string) $u['email'],
            'role'        => (string) $u['role'],
            'roleLabel'   => Schema::ROLE_LABEL[(string) $u['role']] ?? (string) $u['role'],
            'active'      => (bool) (int) $u['is_active'],
            'permissions' => Authz::permissions($u),
            'lastLoginAt' => $u['last_login_at'],
            'createdAt'   => $u['created_at'],
        ];
    }
}
