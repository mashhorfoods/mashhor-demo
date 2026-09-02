<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Request throttling (§24).
 *
 * A sliding window counted in the database, because shared hosting has no
 * shared memory between PHP workers — APCu is per-process there and would
 * count a fraction of the traffic. The table is pruned on write, so it stays
 * small without a cron job the hosting plan may not offer.
 */
final class RateLimit
{
    /** Returns the number of hits remaining; 0 means this one is over the limit. */
    public static function hit(string $bucket, int $limit, int $windowSeconds): int
    {
        $since = gmdate('Y-m-d H:i:s', time() - $windowSeconds);
        Db::run('DELETE FROM rate_hits WHERE bucket = ? AND created_at < ?', [$bucket, $since]);

        $used = (int) Db::value(
            'SELECT COUNT(*) FROM rate_hits WHERE bucket = ? AND created_at >= ?',
            [$bucket, $since]
        );
        if ($used >= $limit) return 0;

        Db::run('INSERT INTO rate_hits (bucket, created_at) VALUES (?,?)', [$bucket, Db::now()]);
        return $limit - $used - 1;
    }

    public static function enforce(string $bucket, int $limit, int $windowSeconds, string $message): void
    {
        if (self::hit($bucket, $limit, $windowSeconds) > 0) return;
        Log::write('warn', 'rate limit reached', ['bucket' => $bucket, 'limit' => $limit]);
        if (!headers_sent()) header('Retry-After: ' . $windowSeconds);
        Http::fail(429, 'rate_limited', $message);
    }
}
