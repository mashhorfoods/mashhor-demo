<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Customers (§17).
 *
 * The العملاء module already treats the phone number as the customer's
 * identity — it derives one customer per distinct number. That is preserved
 * here as a unique index rather than a convention, so two requests from the
 * same number can only ever attach to one customer row.
 *
 * findOrCreate() runs inside the caller's transaction. It does not commit, and
 * it must not: §18 requires that a failure after this point leaves no customer
 * behind.
 */
final class Repo_Customers
{
    public static function findByPhone(string $phone): ?array
    {
        return Db::one('SELECT * FROM customers WHERE phone = ?', [$phone]);
    }

    public static function find(int $id): ?array
    {
        return Db::one('SELECT * FROM customers WHERE id = ?', [$id]);
    }

    /**
     * Returns [id, created]. `created` tells the caller whether this was a new
     * customer, which the activity log records and the notification wording
     * does not — a returning customer is not news.
     *
     * The unique index is the real guard: two concurrent submissions from the
     * same number both miss the SELECT, one INSERT wins, and the loser re-reads
     * rather than failing. Checking then inserting without that catch is the
     * classic duplicate-customer race.
     */
    public static function findOrCreate(string $phone, string $name): array
    {
        $existing = self::findByPhone($phone);
        if ($existing !== null) {
            /* a later submission may carry a fuller name than the first one;
               never overwrite a name with a shorter one, and never blank it */
            if ($name !== '' && mb_strlen($name) > mb_strlen((string) $existing['name'])) {
                Db::run('UPDATE customers SET name = ?, updated_at = ? WHERE id = ?',
                    [$name, Db::now(), $existing['id']]);
            }
            return ['id' => (int) $existing['id'], 'created' => false];
        }

        $now = Db::now();
        try {
            Db::run('INSERT INTO customers (phone, name, created_at, updated_at) VALUES (?,?,?,?)',
                [$phone, $name, $now, $now]);
            return ['id' => (int) Db::lastId(), 'created' => true];
        } catch (PDOException $e) {
            $again = self::findByPhone($phone);
            if ($again !== null) return ['id' => (int) $again['id'], 'created' => false];
            throw $e;
        }
    }

    /**
     * The list the العملاء module shows: one row per customer with the counts
     * it displays, computed in SQL rather than by loading every request.
     */
    public static function listWithStats(string $q = '', int $limit = 200): array
    {
        $sql = 'SELECT c.id, c.phone, c.name, c.created_at,
                       COUNT(r.id)      AS request_count,
                       MAX(r.created_at) AS last_activity,
                       MIN(r.created_at) AS first_activity,
                       (SELECT r3.source FROM requests r3
                         WHERE r3.customer_id = c.id
                         ORDER BY r3.created_at ASC, r3.id ASC LIMIT 1) AS first_source,
                       SUM(CASE WHEN r.status = \'done\' THEN 1 ELSE 0 END) AS done_count,
                       MAX(r.trip_date)  AS last_trip_date,
                       (SELECT r2.status FROM requests r2
                         WHERE r2.customer_id = c.id
                         ORDER BY r2.created_at DESC, r2.id DESC LIMIT 1) AS last_status,
                       (SELECT r4.service_title FROM requests r4
                         WHERE r4.customer_id = c.id
                         ORDER BY r4.created_at DESC, r4.id DESC LIMIT 1) AS last_service
                  FROM customers c
                  LEFT JOIN requests r ON r.customer_id = c.id';
        $params = [];
        if ($q !== '') {
            $sql .= ' WHERE c.name LIKE ? OR c.phone LIKE ?';
            $params[] = '%' . $q . '%';
            $params[] = '%' . preg_replace('/\D+/', '', $q) . '%';
        }
        $sql .= ' GROUP BY c.id, c.phone, c.name, c.created_at
                  ORDER BY last_activity DESC, c.id DESC
                  LIMIT ' . max(1, min(500, $limit));
        return Db::all($sql, $params);
    }

    public static function publicRow(array $c): array
    {
        return [
            'id'           => (int) $c['id'],
            'name'         => (string) $c['name'],
            'phone'        => (string) $c['phone'],
            'requestCount' => isset($c['request_count']) ? (int) $c['request_count'] : null,
            'lastActivity' => $c['last_activity'] ?? null,
            'lastTripDate' => $c['last_trip_date'] ?? null,
            'lastStatus'   => $c['last_status'] ?? null,
            'lastService'  => $c['last_service'] ?? null,
            'firstActivity'=> $c['first_activity'] ?? null,
            'firstSource'  => isset($c['first_source'])
                                ? (Schema::SOURCE_LABEL[(string) $c['first_source']] ?? $c['first_source'])
                                : null,
            'doneCount'    => isset($c['done_count']) ? (int) $c['done_count'] : null,
            'createdAt'    => $c['created_at'] ?? null,
        ];
    }
}
