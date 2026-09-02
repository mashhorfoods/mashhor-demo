<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Production-safe logging (§27).
 *
 * Useful internally, silent externally. Everything written here passes through
 * redact(), which removes any key that could carry a password, a session token,
 * an API secret or a database credential — a log that leaks is a breach with a
 * timestamp on it. Phone numbers are masked because a log is not the place to
 * accumulate customer contact details.
 */
final class Log
{
    private const SECRET_KEYS = [
        'password', 'pass', 'pwd', 'password_hash', 'secret', 'token', 'csrf',
        'csrf_token', 'session', 'sid', 'cookie', 'authorization', 'api_key',
        'apikey', 'db_pass', 'app_key', 'hash',
    ];

    public static function dir(): string
    {
        return AUN_ROOT . '/app/storage/logs';
    }

    public static function write(string $level, string $message, array $context = []): void
    {
        $line = json_encode([
            'at'    => gmdate('Y-m-d\TH:i:s\Z'),
            'level' => $level,
            'msg'   => self::scrub($message),
            'ctx'   => self::redact($context),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $dir = self::dir();
        if (!is_dir($dir)) @mkdir($dir, 0750, true);
        $file = $dir . '/app-' . gmdate('Y-m-d') . '.log';
        @file_put_contents($file, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
    }

    public static function exception(Throwable $e): void
    {
        self::write('error', get_class($e) . ': ' . $e->getMessage(), [
            'file'  => self::relative($e->getFile()),
            'line'  => $e->getLine(),
            /* the trace stays internal; it is never part of any response */
            'trace' => array_slice(explode("\n", self::scrub($e->getTraceAsString())), 0, 12),
        ]);
    }

    /** Paths in the log are project-relative — an absolute path names the host. */
    private static function relative(string $path): string
    {
        return str_starts_with($path, AUN_ROOT) ? ltrim(substr($path, strlen(AUN_ROOT)), '/') : basename($path);
    }

    private static function scrub(string $s): string
    {
        $s = str_replace(AUN_ROOT, '{root}', $s);
        /* a PDO message can carry the DSN, which carries the host and database */
        $s = preg_replace('/\b(?:host|dbname|user|password)=[^\s;\'"]+/i', '$0=***', $s) ?? $s;
        return mb_substr($s, 0, 2000);
    }

    private static function redact(array $ctx): array
    {
        $out = [];
        foreach ($ctx as $k => $v) {
            $key = strtolower((string) $k);
            $secret = false;
            foreach (self::SECRET_KEYS as $needle) {
                if (str_contains($key, $needle)) { $secret = true; break; }
            }
            if ($secret)                 { $out[$k] = '[redacted]'; continue; }
            if ($key === 'phone')        { $out[$k] = self::maskPhone((string) $v); continue; }
            if (is_array($v))            { $out[$k] = self::redact($v); continue; }
            if (is_scalar($v) || $v === null) {
                $out[$k] = is_string($v) ? mb_substr(self::scrub($v), 0, 400) : $v;
                continue;
            }
            $out[$k] = '[' . get_debug_type($v) . ']';
        }
        return $out;
    }

    private static function maskPhone(string $p): string
    {
        $d = preg_replace('/\D+/', '', $p) ?? '';
        return strlen($d) < 5 ? '***' : substr($d, 0, 3) . str_repeat('*', max(0, strlen($d) - 5)) . substr($d, -2);
    }
}
