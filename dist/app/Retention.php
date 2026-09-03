<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * How long the two ledgers are kept (STAGE 6E).
 *
 * Three tables grow with use and nothing ever removed a row from any of them:
 *
 *   activity_log        one row per administrative action, forever
 *   content_publishes   one row per publish, forever — and only the newest
 *                       is ever read (Publisher::lastPublish())
 *   notifications       one row per new request and per status change,
 *                       forever — while the bell shows fifty
 *
 * Left alone they are a slow version of the same failure the log rotation in
 * Log:: was written for: a shared-hosting disk that fills, a backup that gets
 * heavier every month until it stops fitting through the restore path, and an
 * activity page whose COUNT(*) walks more rows every week.
 *
 * The care this needs is not the care a log file needs, though. The activity
 * log is an audit trail — it is the answer to "who changed this, and when" —
 * so deleting from it silently would be worse than letting it grow. Three
 * rules follow from that:
 *
 *   §1  A window long enough to be useful. A year by default: long enough to
 *       settle any dispute about a request or a content change, short enough
 *       that the table stays small. Set ACTIVITY_KEEP_DAYS in .env to change
 *       it; anything under 30 days is refused, because a retention policy
 *       that cannot answer "what happened last month" is not one.
 *   §2  A second limit by row count, so a runaway — a loop that logs on every
 *       request — is bounded in hours rather than in days. The newest rows
 *       are the ones kept.
 *   §3  Every deletion is itself recorded in the activity log. A gap in an
 *       audit trail with nothing explaining it is indistinguishable from
 *       tampering; a row saying how many entries went, and how old they were,
 *       is not.
 *
 * content_publishes needs none of that ceremony: nothing reads past the first
 * row, so a bounded tail is kept purely so a person can still see the last
 * few publishes, and the rest goes without comment.
 *
 * notifications needs none of it either, for a different reason. A
 * notification is a nudge about a request, not a record of one: the request
 * itself is in `requests` and is never deleted, so removing the nudge loses
 * nothing that cannot still be found. Two things follow. The window is short
 * — ninety days, against the log's year — and the deletion is not written to
 * the activity log, because there is no gap for anyone to wonder about.
 *
 * One consequence worth naming rather than discovering: notify() is made
 * idempotent by a unique dedupe_key, so deleting an old notification lets the
 * same key be inserted again. For 'new:REQ-…' that can never happen — a
 * request is created once. For 'st:REQ-…:confirmed' it can, if a request is
 * moved back and forward again months later — and then notifying again is
 * right, because it did just happen again.
 *
 * The sweep runs at most once a day, on sign-in — infrequent, always behind a
 * real person, and never on a page the public can reach. bin/prune.php runs
 * the same code from a terminal or a cron job for a host that has one.
 */
final class Retention
{
    public const ACTIVITY_KEEP_DAYS_DEFAULT = 365;
    public const ACTIVITY_KEEP_DAYS_MIN     = 30;
    public const ACTIVITY_MAX_ROWS_DEFAULT  = 50000;
    public const PUBLISH_KEEP_ROWS_DEFAULT  = 200;
    public const PUBLISH_KEEP_ROWS_MIN      = 10;
    public const NOTIFICATION_KEEP_DAYS_DEFAULT = 90;
    public const NOTIFICATION_KEEP_DAYS_MIN     = 7;
    /* The bell reads at most 200 rows, so the floor is 200: retention must
       never be the reason a notification is missing from a list that could
       still have shown it. */
    public const NOTIFICATION_MAX_ROWS_DEFAULT  = 500;
    public const NOTIFICATION_MAX_ROWS_MIN      = 200;

    public static function activityKeepDays(): int
    {
        return max(self::ACTIVITY_KEEP_DAYS_MIN,
            Env::int('ACTIVITY_KEEP_DAYS', self::ACTIVITY_KEEP_DAYS_DEFAULT));
    }

    public static function activityMaxRows(): int
    {
        return max(1000, Env::int('ACTIVITY_MAX_ROWS', self::ACTIVITY_MAX_ROWS_DEFAULT));
    }

    public static function publishKeepRows(): int
    {
        return max(self::PUBLISH_KEEP_ROWS_MIN,
            Env::int('PUBLISH_KEEP_ROWS', self::PUBLISH_KEEP_ROWS_DEFAULT));
    }

    public static function notificationKeepDays(): int
    {
        return max(self::NOTIFICATION_KEEP_DAYS_MIN,
            Env::int('NOTIFICATION_KEEP_DAYS', self::NOTIFICATION_KEEP_DAYS_DEFAULT));
    }

    public static function notificationMaxRows(): int
    {
        return max(self::NOTIFICATION_MAX_ROWS_MIN,
            Env::int('NOTIFICATION_MAX_ROWS', self::NOTIFICATION_MAX_ROWS_DEFAULT));
    }

    private static function marker(): string
    {
        return AUN_ROOT . '/app/storage/.last-prune';
    }

    /**
     * Run the sweep unless it has already run today.
     *
     * Returns what it removed, or null when it did not run. Everything here is
     * best-effort: housekeeping that throws would turn a full disk into a
     * failed login, which is the opposite of helping.
     */
    public static function sweep(bool $force = false): ?array
    {
        $today = gmdate('Y-m-d');
        if (!$force && @file_get_contents(self::marker()) === $today) return null;

        $dir = dirname(self::marker());
        if (!is_dir($dir)) @mkdir($dir, 0750, true);
        @file_put_contents(self::marker(), $today, LOCK_EX);

        try {
            return self::run();
        } catch (Throwable $e) {
            Log::exception($e);
            return null;
        }
    }

    /** The sweep itself, with no once-a-day guard. */
    public static function run(): array
    {
        $activity      = self::pruneActivity();
        $publishes     = self::prunePublishes();
        $notifications = self::pruneNotifications();

        /* §3 — the log records its own pruning, so a gap is never unexplained.
           Written only when something actually went, so a quiet day adds
           nothing to the table this exists to keep small. */
        if ($activity['removed'] > 0 || $publishes > 0) {
            $parts = [];
            if ($activity['removed'] > 0) {
                $parts[] = 'حذف ' . $activity['removed'] . ' سجلاً من سجل النشاط أقدم من '
                    . self::activityKeepDays() . ' يوماً';
            }
            if ($publishes > 0) {
                $parts[] = 'حذف ' . $publishes . ' سجل نشر قديم';
            }
            Repo_Activity::record(null, 'settings', 'edit', 'retention', null, null,
                mb_substr(implode('، ', $parts) . '.', 0, 255), 'الصيانة التلقائية');
            Log::write('info', 'retention sweep', [
                'activity_removed'  => $activity['removed'],
                'publishes_removed' => $publishes,
            ]);
        }

        /* Deliberately outside the block above: a removed notification is not
           a gap in anything, so it is written to the application log where an
           operator can see it and NOT to the activity log, which exists to
           record what people did. */
        if ($notifications['removed'] > 0) {
            Log::write('info', 'retention sweep: notifications', [
                'removed' => $notifications['removed'],
                'byAge'   => $notifications['byAge'],
                'byCount' => $notifications['byCount'],
            ]);
        }

        return [
            'activity'      => $activity,
            'publishes'     => $publishes,
            'notifications' => $notifications,
        ];
    }

    /**
     * §1 by age, then §2 by count.
     *
     * The order matters: the age window is the policy and the row cap is the
     * emergency brake, so the brake is only ever reached by a table that the
     * policy alone could not hold down.
     */
    public static function pruneActivity(): array
    {
        $cutoff = gmdate('Y-m-d H:i:s', time() - self::activityKeepDays() * 86400);
        $byAge  = self::deleteInBatches('activity_log', 'created_at < ?', [$cutoff]);

        $byCount = 0;
        $max     = self::activityMaxRows();
        $total   = (int) Db::value('SELECT COUNT(*) FROM activity_log');
        if ($total > $max) {
            /* Keep the newest $max. The id is monotonic, so the boundary is a
               single value rather than a scan. */
            $floor = Db::value(
                'SELECT id FROM activity_log ORDER BY id DESC LIMIT 1 OFFSET ' . ($max - 1)
            );
            if ($floor !== null) {
                $byCount = self::deleteInBatches('activity_log', 'id < ?', [(int) $floor]);
            }
        }

        return ['removed' => $byAge + $byCount, 'byAge' => $byAge, 'byCount' => $byCount];
    }

    /**
     * The same two limits as the activity log, with a shorter window and no
     * entry written about it.
     *
     * notification_reads is not swept here and does not need to be: its rows
     * cascade with the notification they belong to, so the per-account read
     * state goes exactly when the thing it was about does.
     */
    public static function pruneNotifications(): array
    {
        $cutoff = gmdate('Y-m-d H:i:s', time() - self::notificationKeepDays() * 86400);
        $byAge  = self::deleteInBatches('notifications', 'created_at < ?', [$cutoff]);

        $byCount = 0;
        $max     = self::notificationMaxRows();
        if ((int) Db::value('SELECT COUNT(*) FROM notifications') > $max) {
            $floor = Db::value(
                'SELECT id FROM notifications ORDER BY id DESC LIMIT 1 OFFSET ' . ($max - 1)
            );
            if ($floor !== null) {
                $byCount = self::deleteInBatches('notifications', 'id < ?', [(int) $floor]);
            }
        }

        return ['removed' => $byAge + $byCount, 'byAge' => $byAge, 'byCount' => $byCount];
    }

    /**
     * Only the newest row is ever read, so the rest is history kept for a
     * person to look at. A bounded tail is enough for that.
     */
    public static function prunePublishes(): int
    {
        $keep  = self::publishKeepRows();
        $total = (int) Db::value('SELECT COUNT(*) FROM content_publishes');
        if ($total <= $keep) return 0;

        $floor = Db::value(
            'SELECT id FROM content_publishes ORDER BY id DESC LIMIT 1 OFFSET ' . ($keep - 1)
        );
        if ($floor === null) return 0;
        return self::deleteInBatches('content_publishes', 'id < ?', [(int) $floor]);
    }

    /**
     * A DELETE that removes 40,000 rows in one statement holds the table for
     * as long as it takes, on a database shared with everyone else on the
     * host. In batches it is the same work, released between each one.
     *
     * The two drivers need different statements for that. MySQL takes a LIMIT
     * on DELETE but refuses a subquery that names the table being deleted
     * from (error 1093); SQLite is the other way round unless it was compiled
     * with an option Hostinger's is not. So each gets the form it supports,
     * rather than one form that happens to work on the machine it was written
     * on and fails on the one it ships to.
     */
    private static function deleteInBatches(string $table, string $where, array $params, int $batch = 500): int
    {
        $sql = Db::isMysql()
            ? "DELETE FROM {$table} WHERE {$where} LIMIT {$batch}"
            : "DELETE FROM {$table} WHERE rowid IN "
              . "(SELECT rowid FROM {$table} WHERE {$where} LIMIT {$batch})";

        $gone = 0;
        for ($i = 0; $i < 200; $i++) {          /* 100k rows, then it waits for tomorrow */
            $n = Db::run($sql, $params)->rowCount();
            $gone += $n;
            if ($n < $batch) break;
        }
        return $gone;
    }

    /** What the two tables hold right now — for preflight and for the report. */
    public static function status(): array
    {
        return [
            'activity' => [
                'rows'     => (int) Db::value('SELECT COUNT(*) FROM activity_log'),
                'oldest'   => Db::value('SELECT MIN(created_at) FROM activity_log'),
                'keepDays' => self::activityKeepDays(),
                'maxRows'  => self::activityMaxRows(),
            ],
            'publishes' => [
                'rows'     => (int) Db::value('SELECT COUNT(*) FROM content_publishes'),
                'oldest'   => Db::value('SELECT MIN(created_at) FROM content_publishes'),
                'keepRows' => self::publishKeepRows(),
            ],
            'notifications' => [
                'rows'     => (int) Db::value('SELECT COUNT(*) FROM notifications'),
                'oldest'   => Db::value('SELECT MIN(created_at) FROM notifications'),
                'keepDays' => self::notificationKeepDays(),
                'maxRows'  => self::notificationMaxRows(),
            ],
            'lastSweep' => is_file(self::marker())
                ? trim((string) @file_get_contents(self::marker())) : null,
        ];
    }
}
