<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Activity log and notifications.
 *
 * Stage 14 built both by deriving them from whatever the other modules
 * happened to store, and printed «غير مسجّل» wherever no actor existed. That
 * refusal is no longer necessary: every mutation now calls record() with the
 * authenticated user, so the actor is written down at the moment it acts.
 *
 * The log is append-only. There is no update and no delete here, and no route
 * exposes one — §10's audit surface is worth nothing if it can be edited.
 */
final class Repo_Activity
{
    public static function record(
        ?array $actor,
        string $module,
        string $action,
        ?string $targetType = null,
        ?string $targetId = null,
        ?string $targetLabel = null,
        string $summary = '',
        ?string $actorLabelOverride = null
    ): void {
        Db::run(
            'INSERT INTO activity_log
               (actor_user_id, actor_label, module, action, target_type, target_id, target_label, summary, created_at)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [
                $actor === null ? null : (int) $actor['id'],
                $actorLabelOverride ?? ($actor === null ? 'النظام' : (string) $actor['name']),
                $module, $action, $targetType, $targetId,
                $targetLabel === null ? null : mb_substr($targetLabel, 0, 200),
                mb_substr($summary, 0, 255),
                Db::now(),
            ]
        );
    }

    public static function search(array $f): array
    {
        $where = [];
        $params = [];
        if (!empty($f['module'])) { $where[] = 'module = ?'; $params[] = $f['module']; }
        if (!empty($f['action'])) { $where[] = 'action = ?'; $params[] = $f['action']; }
        if (!empty($f['actor']))  { $where[] = 'actor_label = ?'; $params[] = $f['actor']; }
        if (!empty($f['since']))  { $where[] = 'created_at >= ?'; $params[] = $f['since']; }
        if (!empty($f['q'])) {
            $q = '%' . $f['q'] . '%';
            $where[] = '(target_label LIKE ? OR summary LIKE ? OR actor_label LIKE ?)';
            $params[] = $q; $params[] = $q; $params[] = $q;
        }
        $clause = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);
        $total  = (int) Db::value('SELECT COUNT(*) FROM activity_log' . $clause, $params);

        $per  = max(1, min(100, (int) ($f['per'] ?? 20)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $rows = Db::all(
            'SELECT * FROM activity_log' . $clause
            . ' ORDER BY created_at DESC, id DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per),
            $params
        );
        return ['rows' => $rows, 'total' => $total, 'page' => $page, 'per' => $per];
    }

    public static function publicRow(array $a): array
    {
        return [
            'id'      => (int) $a['id'],
            'at'      => (string) $a['created_at'],
            'who'     => (string) $a['actor_label'],
            'module'  => (string) $a['module'],
            'action'  => (string) $a['action'],
            'target'  => $a['target_label'],
            'targetId'=> $a['target_id'],
            'summary' => (string) $a['summary'],
        ];
    }

    /* ---- notifications -------------------------------------------------- */

    /**
     * dedupe_key makes notify() idempotent: the same event recorded twice —
     * a retried write, a replayed job — updates nothing and inserts nothing.
     */
    public static function notify(string $kind, string $dedupeKey, string $title, ?string $meta, ?int $requestId): void
    {
        $exists = Db::value('SELECT 1 FROM notifications WHERE dedupe_key = ?', [$dedupeKey]);
        if ($exists) return;
        try {
            Db::run(
                'INSERT INTO notifications (kind, dedupe_key, title, meta, request_id, created_at)
                 VALUES (?,?,?,?,?,?)',
                [$kind, $dedupeKey, mb_substr($title, 0, 255), $meta, $requestId, Db::now()]
            );
        } catch (PDOException $e) {
            /* a concurrent writer won the unique index; that is the intent */
        }
    }

    /** Per-account read state — what localStorage could not do. */
    public static function notifications(int $userId, int $limit = 50): array
    {
        return Db::all(
            'SELECT n.*, r.ref AS request_ref,
                    CASE WHEN nr.notification_id IS NULL THEN 0 ELSE 1 END AS is_read
               FROM notifications n
               LEFT JOIN requests r ON r.id = n.request_id
               LEFT JOIN notification_reads nr
                      ON nr.notification_id = n.id AND nr.user_id = ?
              ORDER BY n.created_at DESC, n.id DESC
              LIMIT ' . max(1, min(200, $limit)),
            [$userId]
        );
    }

    public static function unreadCount(int $userId): int
    {
        return (int) Db::value(
            'SELECT COUNT(*) FROM notifications n
              LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
             WHERE nr.notification_id IS NULL',
            [$userId]
        );
    }

    public static function markRead(int $userId, ?int $notificationId): void
    {
        $now = Db::now();
        if ($notificationId === null) {
            $rows = Db::all(
                'SELECT n.id FROM notifications n
                  LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = ?
                 WHERE nr.notification_id IS NULL',
                [$userId]
            );
            foreach ($rows as $r) {
                Db::run('INSERT INTO notification_reads (notification_id, user_id, read_at) VALUES (?,?,?)',
                    [(int) $r['id'], $userId, $now]);
            }
            return;
        }
        $exists = Db::value('SELECT 1 FROM notification_reads WHERE notification_id = ? AND user_id = ?',
            [$notificationId, $userId]);
        if ($exists) return;
        try {
            Db::run('INSERT INTO notification_reads (notification_id, user_id, read_at) VALUES (?,?,?)',
                [$notificationId, $userId, $now]);
        } catch (PDOException $e) { /* already read; nothing to do */ }
    }

    public static function markUnread(int $userId, int $notificationId): void
    {
        Db::run('DELETE FROM notification_reads WHERE notification_id = ? AND user_id = ?',
            [$notificationId, $userId]);
    }

    public static function publicNotification(array $n): array
    {
        return [
            'id'    => (int) $n['id'],
            'kind'  => (string) $n['kind'],
            'title' => (string) $n['title'],
            'meta'  => $n['meta'],
            'ref'   => $n['request_ref'] ?? null,
            'at'    => (string) $n['created_at'],
            'read'  => (bool) (int) $n['is_read'],
        ];
    }
}
