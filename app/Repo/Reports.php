<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * التقارير — RECOVERY 03.
 *
 * The approved scope, from the Stage 02 UX architecture, module 08, verbatim:
 *
 *     "Basic request and customer counts over a period"
 *     Main flow — pick a report and a period, read the answer in words, then
 *     the breakdown, then open any figure as a filtered request list.
 *     States — loading, error with retry, and an empty period that offers a
 *     wider one instead of a row of zeroes.
 *     Access — Super Admin, Admin.
 *     Patterns — P01 list, P02 search and filter, P09 states, P10 return.
 *
 * That is the whole specification, and it is the whole implementation. No
 * export is named anywhere in it, so there is none (§18). No chart is named,
 * so there is none (§16). §29's list of the metrics a transport company
 * "normally" reports — rates, averages, retention, growth, forecasts — is
 * absent from the spec and therefore absent from here, however easy the data
 * would make them.
 *
 * Everything below is a SELECT. This class has no INSERT, no UPDATE and no
 * DELETE, and assertReadOnly() is what keeps that true rather than merely
 * intended (§25).
 */
final class Repo_Reports
{
    /** The two approved reports. There is no third. */
    public const REPORTS = [
        'requests'  => 'طلبات النقل خلال الفترة',
        'customers' => 'العملاء خلال الفترة',
    ];

    /**
     * A request carries two dates and the specification says only "a period".
     * Guessing which one would be exactly the undocumented assumption §12
     * forbids, so the basis is an explicit, labelled choice and the answer
     * says which one it used.
     */
    public const BASES = [
        'created' => ['col' => 'r.created_at', 'label' => 'تاريخ تسجيل الطلب'],
        'trip'    => ['col' => 'r.trip_date',  'label' => 'تاريخ الرحلة'],
    ];

    public const PERIODS = [
        'today'     => 'اليوم',
        'week'      => 'آخر 7 أيام',
        'month'     => 'آخر 30 يوماً',
        'thismonth' => 'هذا الشهر',
        'lastmonth' => 'الشهر الماضي',
        'year'      => 'هذه السنة',
        'custom'    => 'فترة محددة',
    ];

    /** Every statement this class runs must be a read. */
    private static function assertReadOnly(string $sql): void
    {
        if (preg_match('/\b(insert|update|delete|drop|alter|create|replace|truncate)\b/i', $sql)) {
            Log::write('error', 'a report attempted a write', ['sql' => 'suppressed']);
            throw new RuntimeException('reports are read-only');
        }
    }
    private static function all(string $sql, array $p = []): array
    {
        self::assertReadOnly($sql);
        return Db::all($sql, $p);
    }
    private static function value(string $sql, array $p = [])
    {
        self::assertReadOnly($sql);
        return Db::value($sql, $p);
    }

    /* ---- period resolution (§06) ------------------------------------- */

    /**
     * Returns ['from' => 'YYYY-MM-DD', 'to' => 'YYYY-MM-DD', 'label' => …] or
     * null with $error set. Dates are calendar days in the system's own
     * convention — everything is stored and compared in UTC, and nothing here
     * changes that (§06).
     */
    public static function resolvePeriod(string $period, ?string $from, ?string $to, ?string &$error = null): ?array
    {
        $today = gmdate('Y-m-d');
        $error = null;

        switch ($period) {
            case 'today':     $a = $today; $b = $today; break;
            case 'week':      $a = gmdate('Y-m-d', strtotime($today . ' -6 days')); $b = $today; break;
            case 'month':     $a = gmdate('Y-m-d', strtotime($today . ' -29 days')); $b = $today; break;
            case 'thismonth': $a = gmdate('Y-m-01'); $b = $today; break;
            case 'lastmonth':
                $a = gmdate('Y-m-01', strtotime('first day of last month', strtotime($today)));
                $b = gmdate('Y-m-t', strtotime($a));
                break;
            case 'year':      $a = gmdate('Y-01-01'); $b = $today; break;
            case 'custom':
                if (!self::validDate($from) || !self::validDate($to)) {
                    $error = 'أدخل تاريخي بداية ونهاية صحيحين.';
                    return null;
                }
                /* a range that ends before it starts is an error, not something
                   to silently swap — the operator asked for something that does
                   not exist and should be told */
                if ($to < $from) { $error = 'تاريخ النهاية قبل تاريخ البداية.'; return null; }
                if (self::daysBetween($from, $to) > 3660) {
                    $error = 'الفترة أطول من عشر سنوات.';
                    return null;
                }
                $a = $from; $b = $to;
                break;
            default:
                $error = 'فترة غير معروفة.';
                return null;
        }

        return [
            'key'   => $period,
            'from'  => $a,
            'to'    => $b,
            'days'  => self::daysBetween($a, $b) + 1,
            'label' => $period === 'custom'
                ? ($a === $b ? $a : ($a . ' — ' . $b))
                : (self::PERIODS[$period] ?? $period),
        ];
    }

    private static function validDate(?string $d): bool
    {
        if ($d === null || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m)) return false;
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) && (int) $m[1] >= 2000 && (int) $m[1] <= 2100;
    }
    private static function daysBetween(string $a, string $b): int
    {
        return (int) round((strtotime($b . ' UTC') - strtotime($a . ' UTC')) / 86400);
    }

    /**
     * The date column compared against the period. `created_at` is a datetime
     * and `trip_date` a date, so the upper bound is expressed as "< the day
     * after" rather than "<= the last day" — otherwise every request logged
     * after midnight on the closing day would fall outside a range that
     * visibly includes that day.
     */
    private static function where(string $basis, array $period): array
    {
        $col = self::BASES[$basis]['col'];
        $end = gmdate('Y-m-d', strtotime($period['to'] . ' +1 day'));
        return ["({$col} >= ? AND {$col} < ?)", [$period['from'], $end]];
    }

    /* ---- report 1 · requests over a period ---------------------------- */

    public static function requests(string $basis, array $period, array $filters): array
    {
        [$clause, $params] = self::where($basis, $period);
        $extra = '';
        if (!empty($filters['status'])) { $extra .= ' AND r.status = ?';        $params[] = $filters['status']; }
        if (!empty($filters['service'])){ $extra .= ' AND r.service_title = ?'; $params[] = $filters['service']; }

        $base = "FROM requests r WHERE {$clause}{$extra}";
        $total = (int) self::value("SELECT COUNT(*) {$base}", $params);

        /* the five approved statuses, always all five, in lifecycle order —
           a status with no requests in the period is a zero, not a gap */
        $byStatus = array_fill_keys(Schema::STATUSES, 0);
        foreach (self::all("SELECT r.status, COUNT(*) AS n {$base} GROUP BY r.status", $params) as $row) {
            $byStatus[(string) $row['status']] = (int) $row['n'];
        }

        $byService = self::all(
            "SELECT r.service_title AS k, COUNT(*) AS n {$base} GROUP BY r.service_title ORDER BY n DESC, k ASC",
            $params
        );
        $bySource = self::all(
            "SELECT r.source AS k, COUNT(*) AS n {$base} GROUP BY r.source ORDER BY n DESC, k ASC",
            $params
        );

        return [
            'total'     => $total,
            'byStatus'  => $byStatus,
            'byService' => $byService,
            'bySource'  => $bySource,
        ];
    }

    /* ---- report 2 · customers over a period ---------------------------
       Three counts, all of them plain: how many distinct customers had a
       request in the period, how many of them were new (their first request
       anywhere falls inside it), and how many were returning. New plus
       returning equals active, by construction — no rate, no retention
       figure, no growth number (§29). */

    public static function customers(string $basis, array $period): array
    {
        [$clause, $params] = self::where($basis, $period);

        $active = (int) self::value(
            "SELECT COUNT(DISTINCT r.customer_id) FROM requests r WHERE {$clause}", $params);

        /* "new" is decided by the customer's own first request, on the same
           basis the period uses — not by when the customer row was written,
           which would count a customer twice if their first request were
           later re-dated */
        $col = self::BASES[$basis]['col'];
        $bare = str_replace('r.', '', $col);
        $end  = gmdate('Y-m-d', strtotime($period['to'] . ' +1 day'));
        $new = (int) self::value(
            "SELECT COUNT(*) FROM (
                SELECT r.customer_id, MIN({$col}) AS first_seen
                  FROM requests r GROUP BY r.customer_id
             ) f WHERE f.first_seen >= ? AND f.first_seen < ?",
            [$period['from'], $end]
        );

        return [
            'active'    => $active,
            'new'       => $new,
            'returning' => max(0, $active - $new),
            'allTime'   => (int) self::value('SELECT COUNT(*) FROM customers'),
        ];
    }

    /**
     * The customers a period touched, with the minimum §09 and §20 allow: the
     * name, the number of requests, and when they were last active. No phone
     * number, no addresses, no trip details — a count report does not need
     * them, so it does not get them.
     */
    public static function customerRows(string $basis, array $period, int $limit, int $offset): array
    {
        [$clause, $params] = self::where($basis, $period);
        $total = (int) self::value(
            "SELECT COUNT(*) FROM (SELECT r.customer_id FROM requests r WHERE {$clause} GROUP BY r.customer_id) t",
            $params
        );
        $rows = self::all(
            "SELECT c.id, c.name, COUNT(r.id) AS n, MAX(r.created_at) AS last_at
               FROM requests r JOIN customers c ON c.id = r.customer_id
              WHERE {$clause}
              GROUP BY c.id, c.name
              ORDER BY n DESC, last_at DESC
              LIMIT " . max(1, min(100, $limit)) . " OFFSET " . max(0, $offset),
            $params
        );
        return ['rows' => $rows, 'total' => $total];
    }

    /**
     * §13 — an empty period must offer a wider one rather than a row of
     * zeroes. This finds the narrowest preset period that would actually
     * return something, and the date of the nearest record either way, so the
     * page can say where the data actually is.
     */
    public static function suggestWider(string $basis, array $period): ?array
    {
        $col = self::BASES[$basis]['col'];
        $order = ['week', 'month', 'thismonth', 'year'];
        foreach ($order as $p) {
            $wider = self::resolvePeriod($p, null, null);
            if ($wider === null) continue;
            if ($wider['from'] >= $period['from'] && $wider['to'] <= $period['to']) continue;
            [$clause, $params] = self::where($basis, $wider);
            $n = (int) self::value("SELECT COUNT(*) FROM requests r WHERE {$clause}", $params);
            if ($n > 0) return ['key' => $p, 'label' => self::PERIODS[$p], 'count' => $n];
        }
        /* nothing in any preset — say where the records actually are */
        $earliest = self::value("SELECT MIN({$col}) FROM requests r");
        $latest   = self::value("SELECT MAX({$col}) FROM requests r");
        if ($earliest === null) return null;
        return ['key' => 'custom', 'from' => substr((string) $earliest, 0, 10),
                'to' => substr((string) $latest, 0, 10),
                'label' => 'كامل السجل', 'count' => (int) self::value('SELECT COUNT(*) FROM requests')];
    }

    /** The service list the filter offers — the existing records, not a copy. */
    public static function serviceOptions(): array
    {
        return array_map(
            static fn(array $s): string => (string) $s['title'],
            Db::all('SELECT title FROM services ORDER BY sort_order ASC, id ASC')
        );
    }
}
