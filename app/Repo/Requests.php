<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Transportation requests — the core of §13 through §19.
 *
 * create() is one transaction covering the customer, the request, its opening
 * history row, its note, its reference number and the notification. Any
 * failure rolls all of it back, so the states §18 names as unacceptable —
 * a customer with no request, a request with no customer — cannot occur.
 */
final class Repo_Requests
{
    /* ---- reference numbers (§16) ------------------------------------- */

    /**
     * REQ-YYYY-NNNN, allocated under a row lock inside the caller's
     * transaction. The counter is per year, so January starts at 0001 again,
     * and the four-digit tail widens rather than truncating past 9999 — the
     * defect Stage 16 found in the demo id builder, fixed here at the source.
     */
    public static function nextRef(?string $year = null): string
    {
        $year  = $year ?? gmdate('Y');
        $scope = 'request:' . $year;

        $row = Db::lockRow('SELECT next_value FROM id_sequences WHERE scope = ?', [$scope]);
        if ($row === null) {
            try {
                Db::run('INSERT INTO id_sequences (scope, next_value, updated_at) VALUES (?,?,?)',
                    [$scope, 2, Db::now()]);
                return sprintf('REQ-%s-%04d', $year, 1);
            } catch (PDOException $e) {
                /* another writer created it between our read and our insert */
                $row = Db::lockRow('SELECT next_value FROM id_sequences WHERE scope = ?', [$scope]);
                if ($row === null) throw $e;
            }
        }
        $n = (int) $row['next_value'];
        Db::run('UPDATE id_sequences SET next_value = ?, updated_at = ? WHERE scope = ?',
            [$n + 1, Db::now(), $scope]);
        return sprintf('REQ-%s-%04d', $year, $n);
    }

    /* ---- duplicate detection (§19) ----------------------------------- */

    /**
     * A fingerprint of what makes a trip the trip it is. Two submissions that
     * agree on all of it inside the dedupe window are the same request sent
     * twice — a double click, a browser retry, a refresh. Change any of it and
     * it is a different trip, which §19 says must not be merged.
     */
    public static function fingerprint(array $d): string
    {
        return hash('sha256', implode('|', [
            $d['phone'], $d['service'], $d['from'], $d['to'], $d['date'], $d['time'] ?? '', $d['notes'] ?? '',
        ]));
    }

    public static function findRecentSubmission(string $fingerprint, int $windowMinutes): ?array
    {
        $since = gmdate('Y-m-d H:i:s', time() - $windowMinutes * 60);
        return Db::one(
            'SELECT s.fingerprint, s.created_at, r.id, r.ref, r.status
               FROM request_submissions s JOIN requests r ON r.id = s.request_id
              WHERE s.fingerprint = ? AND s.created_at >= ?',
            [$fingerprint, $since]
        );
    }

    /* ---- creation ------------------------------------------------------ */

    /**
     * $data is already validated and normalised. $actor is null for a public
     * submission — the website form is the actor then, and that is what the
     * history row records.
     *
     * Returns ['ref' => …, 'id' => …, 'duplicate' => bool].
     */
    public static function create(array $data, ?array $actor, string $source): array
    {
        $windowMinutes = Env::int('REQUESTS_DEDUPE_MINUTES', 10);
        $fingerprint   = self::fingerprint($data);

        $existing = self::findRecentSubmission($fingerprint, $windowMinutes);
        if ($existing !== null) {
            /* the caller gets the id it already has, and no second record is
               written — the retry is answered as if it were the first attempt */
            Log::write('info', 'duplicate submission answered from fingerprint', [
                'ref' => $existing['ref'],
            ]);
            return ['ref' => (string) $existing['ref'], 'id' => (int) $existing['id'], 'duplicate' => true];
        }

        return Db::transaction(static function () use ($data, $actor, $source, $fingerprint): array {
            $now = Db::now();

            $customer = Repo_Customers::findOrCreate($data['phone'], $data['name']);
            $service  = Repo_Content::findServiceByTitle($data['service']);

            $ref = self::nextRef();
            Db::run(
                'INSERT INTO requests
                   (ref, customer_id, service_id, service_title, origin, destination,
                    trip_date, trip_time, notes, status, source, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [
                    $ref, $customer['id'], $service === null ? null : (int) $service['id'],
                    $data['service'], $data['from'], $data['to'],
                    $data['date'], $data['time'] ?? null, $data['notes'] ?? null,
                    'new',              /* §15 — public submissions enter as جديد, always */
                    $source, $now, $now,
                ]
            );
            $id = (int) Db::lastId();

            $actorLabel = $actor === null
                ? ($source === 'website' ? 'نموذج الموقع' : 'النظام')
                : (string) $actor['name'];

            Db::run(
                'INSERT INTO request_status_history
                   (request_id, from_status, to_status, actor_user_id, actor_label, created_at)
                 VALUES (?,?,?,?,?,?)',
                [$id, null, 'new', $actor === null ? null : (int) $actor['id'], $actorLabel, $now]
            );

            /* the fingerprint is written inside the transaction, so a rolled
               back request leaves no fingerprint claiming it exists */
            Db::run('INSERT INTO request_submissions (fingerprint, request_id, created_at) VALUES (?,?,?)',
                [$fingerprint, $id, $now]);

            Repo_Activity::record($actor, 'requests', 'create', 'request', $ref,
                $ref, 'طلب ' . $data['name'] . ' — ' . $data['service']
                    . ' (' . (Schema::SOURCE_LABEL[$source] ?? $source) . ')', $actorLabel);

            Repo_Activity::notify('new_request', 'new:' . $ref,
                'طلب جديد من ' . $data['name'] . ' — ' . $data['service'],
                Schema::SOURCE_LABEL[$source] ?? $source, $id);

            return ['ref' => $ref, 'id' => $id, 'duplicate' => false];
        });
    }

    /* ---- status transitions ------------------------------------------- */

    /** The lifecycle the طلبات النقل module already enforces, now server-side. */
    public const ORDER = ['new', 'review', 'confirmed', 'done'];
    public const FINAL = ['done', 'cancel'];

    public static function allowedMoves(string $current): array
    {
        if (in_array($current, self::FINAL, true)) return [];
        $out = [];
        $i = array_search($current, self::ORDER, true);
        if ($i === false) return [];
        for ($j = $i + 1; $j < count(self::ORDER); $j++) $out[] = self::ORDER[$j];
        $out[] = 'cancel';
        for ($k = 0; $k < $i; $k++) $out[] = self::ORDER[$k];
        return $out;
    }

    public static function changeStatus(int $id, string $to, array $actor): array
    {
        if (!in_array($to, Schema::STATUSES, true)) {
            Http::invalid(['status' => 'حالة غير معروفة.']);
        }
        return Db::transaction(static function () use ($id, $to, $actor): array {
            $r = Db::lockRow('SELECT * FROM requests WHERE id = ?', [$id]);
            if ($r === null) Http::notFound();
            $from = (string) $r['status'];
            if ($from === $to) return ['ref' => (string) $r['ref'], 'status' => $to, 'changed' => false];

            if (!in_array($to, self::allowedMoves($from), true)) {
                Http::fail(409, 'invalid_transition',
                    'لا يمكن نقل الطلب من «' . (Schema::STATUS_LABEL[$from] ?? $from)
                    . '» إلى «' . (Schema::STATUS_LABEL[$to] ?? $to) . '».');
            }

            $now = Db::now();
            Db::run('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?', [$to, $now, $id]);
            Db::run(
                'INSERT INTO request_status_history
                   (request_id, from_status, to_status, actor_user_id, actor_label, created_at)
                 VALUES (?,?,?,?,?,?)',
                [$id, $from, $to, (int) $actor['id'], (string) $actor['name'], $now]
            );
            Repo_Activity::record($actor, 'requests', 'status', 'request', (string) $r['ref'],
                (string) $r['ref'],
                'تغيير الحالة إلى «' . (Schema::STATUS_LABEL[$to] ?? $to) . '»');

            if (in_array($to, ['confirmed', 'done', 'cancel'], true)) {
                Repo_Activity::notify('status', 'st:' . $r['ref'] . ':' . $to,
                    'الطلب ' . $r['ref'] . ' أصبح «' . (Schema::STATUS_LABEL[$to] ?? $to) . '»',
                    (string) $actor['name'], $id);
            }
            return ['ref' => (string) $r['ref'], 'status' => $to, 'changed' => true];
        });
    }

    public static function addNote(int $id, string $body, array $actor): array
    {
        return Db::transaction(static function () use ($id, $body, $actor): array {
            $r = Db::one('SELECT id, ref FROM requests WHERE id = ?', [$id]);
            if ($r === null) Http::notFound();
            $now = Db::now();
            Db::run(
                'INSERT INTO request_notes (request_id, body, author_user_id, author_label, created_at)
                 VALUES (?,?,?,?,?)',
                [$id, $body, (int) $actor['id'], (string) $actor['name'], $now]
            );
            Repo_Activity::record($actor, 'requests', 'note', 'request', (string) $r['ref'],
                (string) $r['ref'], 'إضافة ملاحظة على الطلب');
            return ['id' => (int) Db::lastId(), 'createdAt' => $now];
        });
    }

    /* ---- reads --------------------------------------------------------- */

    public static function findByRef(string $ref): ?array
    {
        return Db::one(
            'SELECT r.*, c.name AS customer_name, c.phone AS customer_phone
               FROM requests r JOIN customers c ON c.id = r.customer_id
              WHERE r.ref = ?',
            [$ref]
        );
    }

    public static function search(array $f): array
    {
        $where = [];
        $params = [];
        if (!empty($f['status'])) { $where[] = 'r.status = ?';  $params[] = $f['status']; }
        if (!empty($f['source'])) { $where[] = 'r.source = ?';  $params[] = $f['source']; }
        if (!empty($f['service'])){ $where[] = 'r.service_title = ?'; $params[] = $f['service']; }
        if (!empty($f['customer'])) { $where[] = 'r.customer_id = ?'; $params[] = (int) $f['customer']; }
        if (!empty($f['q'])) {
            $q = '%' . $f['q'] . '%';
            $digits = preg_replace('/\D+/', '', (string) $f['q']) ?? '';
            $where[] = '(r.ref LIKE ? OR c.name LIKE ?' . ($digits !== '' ? ' OR c.phone LIKE ?' : '') . ')';
            $params[] = $q; $params[] = $q;
            if ($digits !== '') $params[] = '%' . $digits . '%';
        }
        $sql = 'SELECT r.*, c.name AS customer_name, c.phone AS customer_phone
                  FROM requests r JOIN customers c ON c.id = r.customer_id';
        if ($where !== []) $sql .= ' WHERE ' . implode(' AND ', $where);

        $total = (int) Db::value(
            'SELECT COUNT(*) FROM requests r JOIN customers c ON c.id = r.customer_id'
            . ($where !== [] ? ' WHERE ' . implode(' AND ', $where) : ''),
            $params
        );

        $per  = max(1, min(100, (int) ($f['per'] ?? 20)));
        $page = max(1, (int) ($f['page'] ?? 1));
        $sql .= ' ORDER BY r.created_at DESC, r.id DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per);

        return ['rows' => Db::all($sql, $params), 'total' => $total, 'page' => $page, 'per' => $per];
    }

    public static function history(int $id): array
    {
        return Db::all(
            'SELECT from_status, to_status, actor_label, created_at
               FROM request_status_history WHERE request_id = ? ORDER BY created_at ASC, id ASC',
            [$id]
        );
    }

    public static function notes(int $id): array
    {
        return Db::all(
            'SELECT id, body, author_label, created_at
               FROM request_notes WHERE request_id = ? ORDER BY created_at ASC, id ASC',
            [$id]
        );
    }

    public static function counts(): array
    {
        $out = array_fill_keys(Schema::STATUSES, 0);
        foreach (Db::all('SELECT status, COUNT(*) AS n FROM requests GROUP BY status') as $r) {
            $out[(string) $r['status']] = (int) $r['n'];
        }
        $out['total'] = array_sum($out);
        return $out;
    }

    public static function publicRow(array $r, bool $full = false): array
    {
        $out = [
            'id'          => (string) $r['ref'],
            'name'        => (string) $r['customer_name'],
            'phone'       => (string) $r['customer_phone'],
            'customerId'  => (int) $r['customer_id'],
            'service'     => (string) $r['service_title'],
            'from'        => (string) $r['origin'],
            'to'          => (string) $r['destination'],
            'date'        => (string) $r['trip_date'],
            'time'        => $r['trip_time'],
            'status'      => (string) $r['status'],
            'statusLabel' => Schema::STATUS_LABEL[(string) $r['status']] ?? (string) $r['status'],
            'source'      => Schema::SOURCE_LABEL[(string) $r['source']] ?? (string) $r['source'],
            'created'     => (string) $r['created_at'],
        ];
        if ($full) {
            $out['notesText'] = $r['notes'];
            $out['moves']     = self::allowedMoves((string) $r['status']);
            $out['hist']      = array_map(static fn(array $h): array => [
                'to' => (string) $h['to_status'],
                'w'  => (string) $h['actor_label'],
                'd'  => (string) $h['created_at'],
            ], self::history((int) $r['id']));
            $out['notes'] = array_map(static fn(array $n): array => [
                'id' => (int) $n['id'],
                't'  => (string) $n['body'],
                'w'  => (string) $n['author_label'],
                'd'  => (string) $n['created_at'],
            ], self::notes((int) $r['id']));
        }
        return $out;
    }
}
