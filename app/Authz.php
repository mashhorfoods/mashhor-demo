<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Server-side authorization (§10).
 *
 * The permission matrix here is the one the المستخدمون والصلاحيات module
 * already defines — the same three roles, the same eight modules, the same
 * view/edit pairs. It was previously enforced only by hiding buttons, which
 * is not enforcement at all. This is the authority now; the frontend keeps
 * hiding buttons because that is good UX, and the two are allowed to disagree
 * only in the direction of the server saying no.
 *
 * §35 forbids new roles, so `super`, `admin` and `content` are the whole set
 * and there is no code path that creates a fourth.
 */
final class Authz
{
    public const MODULES = [
        'home', 'requests', 'customers', 'services', 'content', 'reports', 'users', 'settings',
    ];

    /**
     * Mirrors preset() in admin/users.html exactly. `super` gets everything;
     * `content` sees the site's content and nothing about people or their
     * trips; `admin` runs the day-to-day and is the only role whose matrix the
     * users module may adjust.
     */
    public static function preset(string $role): array
    {
        $p = [];
        foreach (self::MODULES as $m) $p[$m] = ['view' => false, 'edit' => false];

        if ($role === 'super') {
            foreach (self::MODULES as $m) $p[$m] = ['view' => true, 'edit' => true];
            return $p;
        }
        if ($role === 'content') {
            $p['home']     = ['view' => true,  'edit' => false];
            $p['services'] = ['view' => true,  'edit' => true];
            $p['content']  = ['view' => true,  'edit' => true];
            return $p;
        }
        /* admin */
        $p['home']      = ['view' => true, 'edit' => false];
        $p['requests']  = ['view' => true, 'edit' => true];
        $p['customers'] = ['view' => true, 'edit' => true];
        $p['services']  = ['view' => true, 'edit' => true];
        $p['content']   = ['view' => true, 'edit' => true];
        $p['reports']   = ['view' => true, 'edit' => false];
        return $p;
    }

    /**
     * A stored matrix may narrow an `admin`, never widen anyone. `super` and
     * `content` are fixed roles in the approved design, so their stored matrix
     * is ignored outright — otherwise a row edited in the database would be a
     * privilege escalation path.
     */
    public static function permissions(array $user): array
    {
        $role = (string) ($user['role'] ?? '');
        $base = self::preset($role);
        if ($role !== 'admin') return $base;

        $stored = $user['permissions'] ?? null;
        if (!is_string($stored) || $stored === '') return $base;
        $decoded = json_decode($stored, true);
        if (!is_array($decoded)) return $base;

        $out = [];
        foreach (self::MODULES as $m) {
            $view = $base[$m]['view'] && !empty($decoded[$m]['view']);
            $edit = $base[$m]['edit'] && !empty($decoded[$m]['edit']);
            /* edit without view is incoherent; treat it as view too */
            $out[$m] = ['view' => $view || $edit, 'edit' => $edit];
        }
        return $out;
    }

    public static function can(?array $user, string $module, string $ability = 'view'): bool
    {
        if ($user === null) return false;
        if (!in_array($module, self::MODULES, true)) return false;
        $p = self::permissions($user);
        return !empty($p[$module][$ability]);
    }

    /**
     * The one call every protected handler makes. Authentication first, then
     * authorization — a request with no session gets 401 so the frontend knows
     * to send the person to the login page; a request from the wrong role gets
     * 403 so it knows not to (§11, §12).
     */
    public static function require(string $module, string $ability = 'view'): array
    {
        $u = Auth::user();
        if ($u === null) {
            Log::write('info', 'unauthenticated request rejected', [
                'path' => Http::path(), 'ip' => Http::ip(),
            ]);
            Http::unauthenticated();
        }
        if (!self::can($u, $module, $ability)) {
            Log::write('warn', 'authorization denied', [
                'user_id' => $u['id'], 'role' => $u['role'],
                'module'  => $module, 'ability' => $ability, 'path' => Http::path(),
            ]);
            Http::forbidden();
        }
        return $u;
    }

    /**
     * Which modules this account may read.
     *
     * Needed because three endpoints are gated on `home:view` — the dashboard
     * summary, the activity log and the notification bell — and every role
     * that can sign in has that. The gate is right: all three are part of the
     * shell. What was wrong is that they answered with everything, so a
     * Content Manager who is refused /api/admin/requests with a 403 could read
     * the same requests through them: beneficiary names and phone numbers in
     * the summary's recent list, 220 request entries in the log, and 440
     * notifications titled with the beneficiary's name.
     *
     * A module gate on the route is not enough when the route's payload spans
     * modules. The payload has to be filtered too, and this is what filters
     * it.
     */
    public static function visibleModules(?array $user): array
    {
        $out = [];
        foreach (self::MODULES as $m) if (self::can($user, $m, 'view')) $out[] = $m;
        return $out;
    }

    /**
     * The module an activity entry or a notification belongs to.
     *
     * activity_log.module and Authz::MODULES agree on every value but one:
     * `media` is its own module in the log and lives under `services` in the
     * permission matrix, because that is how the routes gate it.
     */
    public const RECORD_MODULE = [
        'media' => 'services',
    ];

    public static function moduleOf(string $recordModule): string
    {
        return self::RECORD_MODULE[$recordModule] ?? $recordModule;
    }

    /** Whether this account may read a record belonging to that module. */
    public static function canSeeRecord(?array $user, string $recordModule): bool
    {
        $m = self::moduleOf($recordModule);
        if (!in_array($m, self::MODULES, true)) return false;
        return self::can($user, $m, 'view');
    }

    public static function isSuper(?array $user): bool
    {
        return $user !== null && (string) $user['role'] === 'super';
    }
}
