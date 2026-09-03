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
        self::rotate($file);
    }

    /* ---- keeping the log from becoming the problem (STAGE 6D) ---------- */

    /** How long a day's log is kept. A month is long enough to investigate. */
    public const KEEP_DAYS = 30;

    /** How large one day's file may get before it stops being appended to. */
    public const MAX_BYTES = 5242880;   /* 5 MB */

    /**
     * Log rotation, done on the write path because there is nowhere else to
     * do it: this hosting plan has no working cron and no logrotate, and a log
     * that is never pruned is a slow outage — a shared-hosting disk quota
     * filled by a loop that logs a warning per request takes the database down
     * with it, and every write after that fails silently.
     *
     * Two limits, checked cheaply:
     *
     *   §1  A single day's file that passes MAX_BYTES is moved aside once, to
     *       .1, and a fresh one started. The old .1 is dropped. That bounds a
     *       runaway to twice the limit instead of the whole disk, and it keeps
     *       the most recent entries — which are the ones that explain what is
     *       happening — rather than the first ones.
     *   §2  Files older than KEEP_DAYS go. The sweep runs at most once a day,
     *       guarded by a marker file, so the cost is one stat() per request
     *       and a directory listing per day.
     *
     * Everything here is best-effort and silent: a log that cannot be pruned
     * must never become an error of its own, and must never reach a response.
     */
    private static function rotate(string $file): void
    {
        /* §1 — one oversized file */
        $size = @filesize($file);
        if (is_int($size) && $size > self::MAX_BYTES) {
            @unlink($file . '.1');
            @rename($file, $file . '.1');
        }

        /* §2 — at most one sweep a day */
        $dir    = self::dir();
        $marker = $dir . '/.last-sweep';
        $today  = gmdate('Y-m-d');
        if (@file_get_contents($marker) === $today) return;
        @file_put_contents($marker, $today, LOCK_EX);
        self::sweep();
    }

    /** Delete log files older than KEEP_DAYS. Returns how many went. */
    public static function sweep(int $keepDays = self::KEEP_DAYS): int
    {
        $cutoff = time() - $keepDays * 86400;
        $gone   = 0;
        foreach (glob(self::dir() . '/app-*.log*') ?: [] as $f) {
            /* the date is in the name, so a file whose mtime was touched by a
               backup or an upload is still judged by the day it belongs to */
            if (!preg_match('/app-(\d{4}-\d{2}-\d{2})\.log/', basename($f), $m)) continue;
            $day = strtotime($m[1] . ' 00:00:00 UTC');
            if ($day !== false && $day >= $cutoff) continue;
            if (@unlink($f)) $gone++;
        }
        return $gone;
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
