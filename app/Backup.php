<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Backup and restore (Stage 6).
 *
 * Everything anyone has typed into this system — the services, the page text,
 * the company's contact details, every request and every customer — exists in
 * exactly one database, on one shared-hosting account. A dropped table, a
 * mistaken bulk edit or a hosting incident and it is gone, because until now
 * there was no second copy and no way to make one from inside the dashboard.
 *
 * What a backup is here:
 *
 *   §1  One JSON file, downloaded through the browser by a Super Admin. Plain
 *       text on purpose: it can be read, diffed and repaired by hand, and it
 *       does not depend on this code still existing to be useful.
 *   §2  It carries data, never credentials. No password hashes, no session
 *       rows, no CSRF tokens, nothing from .env. A backup that leaks must not
 *       be a way into the system — so what it holds is what the dashboard
 *       already shows to the person who downloaded it.
 *   §3  It lists the accounts that existed, by name, address and role, because
 *       after a disaster that is worth knowing. Restore never recreates them:
 *       an account with no password is not an account, and recover.php is the
 *       documented way back in.
 *
 * What a restore is:
 *
 *   §4  A full replace of the tables the backup covers, inside one
 *       transaction. Either the whole file lands or nothing changes.
 *   §5  It writes a snapshot of the current data to app/storage/backups/
 *       first, so restoring the wrong file is itself reversible.
 *   §6  It never touches users, sessions or the migration ledger. Whoever is
 *       signed in stays signed in, and the schema is the schema.
 *   §7  index.html is not part of it. The website is republished from the
 *       restored records through النشر, which is the same path every other
 *       change takes.
 */
final class Backup
{
    public const FORMAT = 1;

    /**
     * The tables a backup carries, in the order they must be written.
     *
     * The order is the foreign-key order: a request points at a customer and a
     * service, a note points at a request. Restoring in this order means no
     * row ever references one that has not been written yet, and deleting in
     * the reverse order means no row is ever orphaned mid-delete.
     */
    public const TABLES = [
        'settings',
        'media_assets',
        'services',
        'content_blocks',
        'content_items',
        'content_publishes',
        'customers',
        'requests',
        'request_status_history',
        'request_notes',
        'id_sequences',
        'activity_log',
        'notifications',
        /* After notifications, because each row points at one. It is here at
           all because a restore DELETEs notifications, and that cascades:
           without carrying the read state, restoring a backup silently marked
           every notification unread again for everyone. */
        'notification_reads',
    ];

    /**
     * Deliberately absent, and why:
     *
     *   users, sessions      — credentials and live logins (§2, §6)
     *   guest_sessions, rate_hits, request_submissions
     *                        — throttling state, seconds old and worthless
     *   migrations           — the schema ledger; restoring it would let an old
     *                          backup claim a migration ran that did not
     */
    public const EXCLUDED = [
        'users', 'sessions', 'guest_sessions', 'rate_hits', 'request_submissions',
        'migrations',
    ];

    public static function dir(): string
    {
        return AUN_ROOT . '/app/storage/backups';
    }

    /** A name that sorts chronologically and says what it is. */
    public static function filename(string $prefix = 'aun-backup'): string
    {
        return $prefix . '-' . gmdate('Y-m-d-His') . '.json';
    }

    /**
     * The whole backup as an array. Built in memory because the largest table
     * here is the activity log, and a shared-hosting install's is measured in
     * thousands of short rows, not millions.
     */
    public static function build(): array
    {
        $tables = [];
        $counts = [];
        foreach (self::TABLES as $t) {
            $rows = Db::all("SELECT * FROM {$t}");
            $tables[$t] = $rows;
            $counts[$t] = count($rows);
        }

        /* §3 — who could sign in, for the record. Never a hash. */
        $accounts = [];
        foreach (Repo_Users::all() as $u) {
            $accounts[] = [
                'name'   => (string) $u['name'],
                'email'  => (string) $u['email'],
                'role'   => (string) $u['role'],
                'active' => (bool) (int) $u['is_active'],
            ];
        }

        return [
            'aun_backup'  => self::FORMAT,
            'created_at'  => gmdate('Y-m-d\TH:i:s\Z'),
            'driver'      => Db::driver(),
            'counts'      => $counts,
            'accounts'    => $accounts,
            'accounts_note' => 'للعلم فقط — لا تُستعاد الحسابات ولا كلمات المرور من نسخة احتياطية.',
            'tables'      => $tables,
        ];
    }

    public static function encode(array $backup): string
    {
        return (string) json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    }

    /** Write a copy to app/storage/backups/ and return its path. */
    public static function writeSnapshot(string $prefix = 'aun-backup'): string
    {
        $dir = self::dir();
        if (!is_dir($dir)) @mkdir($dir, 0750, true);
        $path = $dir . '/' . self::filename($prefix);
        file_put_contents($path, self::encode(self::build()), LOCK_EX);
        self::pruneSnapshots();
        return $path;
    }

    /** Keep the last ten snapshots; a shared-hosting disk is not large. */
    public static function pruneSnapshots(int $keep = 10): int
    {
        $files = glob(self::dir() . '/*.json') ?: [];
        if (count($files) <= $keep) return 0;
        sort($files);                       /* the names sort chronologically */
        $stale = array_slice($files, 0, count($files) - $keep);
        foreach ($stale as $f) @unlink($f);
        return count($stale);
    }

    /**
     * Is this decoded JSON a backup this code can restore?
     *
     * Returns an Arabic sentence naming the problem, or null when it is fine.
     * Deliberately strict: a restore replaces everything, so a file that is
     * merely *probably* a backup is not good enough.
     */
    public static function problem($data): ?string
    {
        if (!is_array($data))                        return 'الملف ليس نسخة احتياطية صالحة.';
        if (($data['aun_backup'] ?? null) === null)  return 'الملف ليس نسخة احتياطية من هذا النظام.';
        if ((int) $data['aun_backup'] !== self::FORMAT) {
            return 'صيغة النسخة الاحتياطية غير مدعومة (' . (int) $data['aun_backup'] . ').';
        }
        if (!isset($data['tables']) || !is_array($data['tables'])) {
            return 'النسخة الاحتياطية لا تحتوي على أي بيانات.';
        }
        foreach ($data['tables'] as $name => $rows) {
            if (!in_array($name, self::TABLES, true)) {
                /* A file naming a table this code does not restore is either
                   from a newer version or has been edited. Either way, stop. */
                return 'النسخة الاحتياطية تحتوي على جدول غير معروف: ' . (string) $name;
            }
            if (!is_array($rows)) return 'بيانات الجدول «' . (string) $name . '» تالفة.';
            foreach ($rows as $r) {
                if (!is_array($r)) return 'بيانات الجدول «' . (string) $name . '» تالفة.';
            }
        }
        return null;
    }

    /** A one-line summary of what a file would restore, for the confirmation. */
    public static function describe(array $data): array
    {
        $out = [];
        foreach (self::TABLES as $t) {
            $out[$t] = isset($data['tables'][$t]) ? count($data['tables'][$t]) : 0;
        }
        return $out;
    }

    /**
     * Replace the covered tables with what the backup holds.
     *
     * Every column written is checked against the columns the table actually
     * has, so a backup taken before a migration cannot inject a stale column
     * name into an INSERT, and a hand-edited file cannot introduce one. A
     * column the table has and the backup does not simply takes its default.
     */
    public static function restore(array $data): array
    {
        $problem = self::problem($data);
        if ($problem !== null) throw new RuntimeException($problem);

        $report = [];
        Db::transaction(static function () use ($data, &$report): void {
            /* delete in reverse dependency order */
            foreach (array_reverse(self::TABLES) as $t) {
                Db::run("DELETE FROM {$t}");
            }
            foreach (self::TABLES as $t) {
                $rows = $data['tables'][$t] ?? [];
                if (!is_array($rows) || $rows === []) { $report[$t] = 0; continue; }
                $cols = Schema::columns($t);

                /* The one table whose rows point at something a restore does
                   not carry. Accounts are never restored, so after a disaster
                   in which they were recreated their ids are new, and a read
                   row naming an old one would fail the foreign key and take
                   the whole transaction — and the whole restore — down with
                   it. A read mark is not worth that, so the ones that no
                   longer refer to anybody are dropped instead. */
                $knownUsers = null;
                if ($t === 'notification_reads') {
                    $knownUsers = [];
                    foreach (Db::all('SELECT id FROM users') as $u) $knownUsers[(int) $u['id']] = true;
                }

                $n = 0;
                foreach ($rows as $row) {
                    if ($knownUsers !== null && !isset($knownUsers[(int) ($row['user_id'] ?? 0)])) continue;
                    $use = [];
                    foreach ($row as $k => $v) {
                        if (in_array((string) $k, $cols, true) && (is_scalar($v) || $v === null)) {
                            $use[(string) $k] = $v;
                        }
                    }
                    if ($use === []) continue;
                    $names = array_keys($use);
                    Db::run(
                        "INSERT INTO {$t} (" . implode(',', $names) . ') VALUES ('
                        . implode(',', array_fill(0, count($names), '?')) . ')',
                        array_values($use)
                    );
                    $n++;
                }
                $report[$t] = $n;
            }
        });
        return $report;
    }
}
