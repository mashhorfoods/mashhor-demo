<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * The database connection (§03).
 *
 * One PDO handle for the request, opened lazily so an endpoint that needs no
 * database never pays for one. Credentials come from Env and appear in no
 * exception that reaches a client: a PDOException message carries the DSN, so
 * connect() catches it, logs the detail and rethrows a DbUnavailable that the
 * error handler turns into a generic response (§26).
 *
 * MySQL is production, on Hostinger. SQLite is supported so the verification
 * suite in bin/verify.php can run the §30–§32 matrices anywhere, including a
 * machine with no database server. SQL is kept to the portable subset both
 * accept; the only per-driver differences are isolated in Schema.php and in
 * lockRow() below.
 */
final class DbUnavailable extends RuntimeException {}

final class Db
{
    private static ?PDO $pdo = null;
    private static string $driver = '';
    private static int $txDepth = 0;

    public static function driver(): string
    {
        if (self::$driver === '') self::$driver = strtolower((string) Env::get('DB_DRIVER', 'mysql'));
        return self::$driver;
    }

    public static function isMysql(): bool { return self::driver() === 'mysql'; }

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) return self::$pdo;

        $driver = self::driver();
        try {
            if ($driver === 'sqlite') {
                $path = (string) Env::get('DB_SQLITE_PATH', 'app/storage/aun.sqlite');
                if ($path !== ':memory:' && $path[0] !== '/') $path = AUN_ROOT . '/' . $path;
                if ($path !== ':memory:') {
                    $dir = dirname($path);
                    if (!is_dir($dir)) @mkdir($dir, 0750, true);
                }
                $pdo = new PDO('sqlite:' . $path, null, null, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]);
                $pdo->exec('PRAGMA foreign_keys = ON');
                $pdo->exec('PRAGMA journal_mode = WAL');
                $pdo->exec('PRAGMA busy_timeout = 5000');
            } else {
                $host    = (string) Env::get('DB_HOST', 'localhost');
                $port    = Env::int('DB_PORT', 3306);
                $name    = Env::require('DB_NAME');
                $user    = Env::require('DB_USER');
                $pass    = (string) Env::get('DB_PASS', '');
                $charset = (string) Env::get('DB_CHARSET', 'utf8mb4');

                $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $host, $port, $name, $charset);
                $pdo = new PDO($dsn, $user, $pass, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::ATTR_STRINGIFY_FETCHES  => false,
                    /* a short connect timeout keeps a dead database from
                       holding a shared-hosting worker open for a minute */
                    PDO::ATTR_TIMEOUT            => 5,
                ]);
                /* strict mode turns a silently truncated column into an error,
                   which is what we want for an audit-bearing schema */
                $pdo->exec("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
                $pdo->exec("SET SESSION time_zone = '+00:00'");
            }
        } catch (PDOException $e) {
            Log::write('error', 'database connection failed', [
                'driver' => $driver,
                /* the message can carry host and dbname; Log scrubs it, and it
                   never reaches the client either way */
                'detail' => $e->getMessage(),
            ]);
            throw new DbUnavailable('database unavailable', 0, $e);
        }

        self::$pdo = $pdo;
        return $pdo;
    }

    /** Has the connection been opened and is it answering? Used by /api/health. */
    public static function ping(): bool
    {
        try {
            self::pdo()->query('SELECT 1')->fetchColumn();
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }

    public static function run(string $sql, array $params = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($params);
        return $st;
    }

    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function value(string $sql, array $params = [])
    {
        $v = self::run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function lastId(): string
    {
        return (string) self::pdo()->lastInsertId();
    }

    /**
     * Nested-safe transaction (§18). An inner transaction joins the outer one
     * rather than committing half of it; only the outermost commit is real.
     */
    public static function transaction(callable $fn)
    {
        $pdo = self::pdo();
        if (self::$txDepth === 0) $pdo->beginTransaction();
        self::$txDepth++;
        try {
            $out = $fn($pdo);
            self::$txDepth--;
            if (self::$txDepth === 0) $pdo->commit();
            return $out;
        } catch (Throwable $e) {
            self::$txDepth--;
            if (self::$txDepth === 0 && $pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public static function inTransaction(): bool
    {
        return self::$pdo instanceof PDO && self::$pdo->inTransaction();
    }

    /**
     * Row lock for the id sequence. MySQL takes a real lock; SQLite serialises
     * writers for the whole transaction anyway, so the plain read is already
     * exclusive there.
     */
    public static function lockRow(string $sql, array $params = []): ?array
    {
        if (self::isMysql()) $sql .= ' FOR UPDATE';
        return self::one($sql, $params);
    }

    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }

    /** Test seam — bin/verify.php points the suite at a scratch database. */
    public static function reset(): void
    {
        self::$pdo = null;
        self::$driver = '';
        self::$txDepth = 0;
    }
}
