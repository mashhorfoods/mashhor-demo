<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * The API surface.
 *
 * Two families, and the boundary between them is the point of §12 and §24:
 *
 *   public  — GET /api/csrf, POST /api/requests, GET /api/health
 *   admin   — everything else, every one of which calls Authz::require()
 *             before it touches anything
 *
 * No administrative endpoint is reachable through the public flow. A route
 * that forgets its Authz::require() is a hole, so the table below marks each
 * route's module and ability and dispatch() enforces it before the handler
 * runs — a handler cannot forget what it never had to remember.
 */
final class Routes
{
    /**
     * [method, path, auth, handler]
     * auth is null for public routes, or [module, ability] for protected ones.
     */
    public static function table(): array
    {
        return [
            /* ---- public ------------------------------------------------ */
            ['GET',  '/api/health',   null, 'health'],
            ['GET',  '/api/csrf',     null, 'csrf'],
            ['POST', '/api/requests', null, 'createRequest'],

            /* ---- session ----------------------------------------------- */
            ['POST', '/api/auth/login',  null,      'login'],
            ['POST', '/api/auth/logout', 'session', 'logout'],
            ['GET',  '/api/auth/me',     'session', 'me'],

            /* ---- admin ------------------------------------------------- */
            ['GET',  '/api/admin/summary',        ['home', 'view'],      'summary'],
            ['GET',  '/api/admin/requests',       ['requests', 'view'],  'listRequests'],
            ['GET',  '/api/admin/requests/show',  ['requests', 'view'],  'showRequest'],
            ['POST', '/api/admin/requests/status',['requests', 'edit'],  'setStatus'],
            ['POST', '/api/admin/requests/notes', ['requests', 'edit'],  'addNote'],
            ['GET',  '/api/admin/customers',      ['customers', 'view'], 'listCustomers'],
            ['GET',  '/api/admin/services',       ['services', 'view'],  'listServices'],
            ['POST', '/api/admin/services/save',  ['services', 'edit'],  'saveService'],
            ['GET',  '/api/admin/media',          ['services', 'view'],  'listMedia'],
            ['GET',  '/api/admin/users',          ['users', 'view'],     'listUsers'],
            ['POST', '/api/admin/users/save',     ['users', 'edit'],     'saveUser'],
            ['GET',  '/api/admin/activity',       ['home', 'view'],      'listActivity'],
            ['GET',  '/api/admin/notifications',  ['home', 'view'],      'listNotifications'],
            ['POST', '/api/admin/notifications/read', ['home', 'view'],  'readNotification'],
            ['GET',  '/api/admin/settings',       ['settings', 'view'],  'listSettings'],
            ['POST', '/api/admin/settings/save',  ['settings', 'edit'],  'saveSettings'],
        ];
    }

    /** Methods that change state must carry a CSRF token; reads need none. */
    private const CSRF_EXEMPT = ['/api/health', '/api/csrf'];

    public static function dispatch(): void
    {
        $method = Http::method();
        $path   = Http::path();

        if ($method === 'OPTIONS') { http_response_code(204); exit; }

        $allowedMethods = [];
        foreach (self::table() as [$m, $p, $auth, $handler]) {
            if ($p !== $path) continue;
            $allowedMethods[] = $m;
            if ($m !== $method) continue;

            if (!in_array($path, self::CSRF_EXEMPT, true)
                && in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
                Csrf::require();
            }

            $user = null;
            if ($auth === 'session') {
                $user = Auth::require();
            } elseif (is_array($auth)) {
                $user = Authz::require($auth[0], $auth[1]);
            }

            self::$handler($user);
            return;   /* handlers always exit through Http; this is a guard */
        }

        if ($allowedMethods !== []) Http::methodNotAllowed($allowedMethods);
        Http::notFound();
    }

    /* =================================================================== */
    /* public                                                              */
    /* =================================================================== */

    /**
     * A deployment check that names no secret (§22). It reports whether each
     * required variable is *set*, never what it holds, and whether the schema
     * is present — enough to diagnose a bad upload, useless to an attacker.
     */
    private static function health(?array $u): void
    {
        $dbUp    = Db::ping();
        $missing = $dbUp ? Schema::missingTables() : Schema::tables();
        Http::json([
            'ok'      => $dbUp && $missing === [],
            'app'     => ['env' => Env::isProduction() ? 'production' : 'development', 'php' => PHP_VERSION],
            'db'      => ['driver' => Db::driver(), 'connected' => $dbUp, 'missingTables' => $missing],
            'config'  => Env::presence(['APP_KEY', 'DB_NAME', 'DB_USER', 'DB_PASS', 'APP_URL']),
            'https'   => Http::isHttps(),
            'hashing' => Auth::algo() === PASSWORD_BCRYPT ? 'bcrypt' : 'argon2id',
        ], ($dbUp && $missing === []) ? 200 : 503);
    }

    private static function csrf(?array $u): void
    {
        $t = Csrf::issue();
        Http::ok(['token' => $t['token'], 'scope' => $t['scope']]);
    }

    /**
     * POST /api/requests — §13 through §19.
     *
     * Public, and deliberately narrow: it accepts exactly the fields the
     * approved form has, creates exactly one request in status جديد, and
     * returns exactly the reference the page prints. There is no parameter
     * that lets a caller choose a status, a source or a customer.
     */
    private static function createRequest(?array $u): void
    {
        $ip = Http::ip();
        RateLimit::enforce(
            'req:' . $ip,
            Env::int('REQUESTS_RATE_PER_HOUR', 8),
            3600,
            'وصلت إلى الحد المسموح من الطلبات. حاول بعد قليل أو اتصل بنا مباشرة.'
        );

        $input = Http::input();

        /* §14 — an unexpected payload structure is rejected outright */
        $v = new Validator($input);
        $v->rejectUnknown(['csrf_token', 'website', 'name', 'phone', 'service',
                           'from', 'to', 'date', 'time', 'notes']);

        /* the honeypot: a person cannot see the field, so anything in it is a
           bot. Answered as a success so the bot does not learn to avoid it,
           and nothing is written. */
        $trap = $input['website'] ?? '';
        if (is_string($trap) && trim($trap) !== '') {
            Log::write('info', 'honeypot triggered', ['ip' => $ip]);
            Http::ok(['id' => 'REQ-' . gmdate('Y') . '-0000', 'accepted' => true]);
        }

        $v->text('name', true, 2, 80, 'الاسم');
        $v->phone('phone', true, 'رقم الجوال');
        $v->choice('service', Repo_Content::serviceTitles(true), true, 'الخدمة المطلوبة');
        $v->text('from', true, 3, 160, 'مكان الانطلاق');
        $v->text('to', true, 3, 160, 'الوجهة');
        $v->date('date', true, 'تاريخ الرحلة', true);
        if (($input['time'] ?? '') !== '') $v->time('time', false, 'وقت الرحلة');
        $v->multiline('notes', 500, 'الملاحظات');

        if (!$v->passed()) {
            /* §31 — a rejected submission creates nothing */
            Http::invalid($v->errors());
        }

        $c = $v->clean();
        $result = Repo_Requests::create([
            'name'    => $c['name'],
            'phone'   => $c['phone'],
            'service' => $c['service'],
            'from'    => $c['from'],
            'to'      => $c['to'],
            'date'    => $c['date'],
            'time'    => $c['time'] ?? null,
            'notes'   => $c['notes'] ?? null,
        ], null, 'website');

        Log::write('info', 'request created', [
            'ref' => $result['ref'], 'duplicate' => $result['duplicate'], 'ip' => $ip,
        ]);

        /* `id` is the field index.html reads to decide the submission worked */
        Http::json([
            'ok'        => true,
            'id'        => $result['ref'],
            'status'    => 'new',
            'duplicate' => $result['duplicate'],
        ], $result['duplicate'] ? 200 : 201);
    }

    /* =================================================================== */
    /* session                                                             */
    /* =================================================================== */

    private static function login(?array $u): void
    {
        $ip = Http::ip();
        RateLimit::enforce('login:' . $ip, 10, 900,
            'محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.');

        $input = Http::input();
        $v = new Validator($input);
        $v->rejectUnknown(['csrf_token', 'email', 'password']);
        $v->email('email', true, 'البريد الإلكتروني');
        $pw = $input['password'] ?? '';
        if (!is_string($pw) || $pw === '') $v->error('password', 'كلمة المرور مطلوبة.');
        if (!$v->passed()) Http::invalid($v->errors());

        $reason = null;
        $token = Auth::attempt((string) $v->clean()['email'], (string) $pw, $reason);
        if ($token === null) {
            /* one message for every failure — §06's account-state check is
               recorded in the log, not handed to whoever is guessing */
            Http::fail(401, 'invalid_credentials',
                'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        }

        $user = Auth::user();
        Log::write('info', 'login succeeded', ['user_id' => $user['id'], 'ip' => $ip]);
        Repo_Activity::record($user, 'users', 'login', 'user', (string) $user['id'],
            (string) $user['name'], 'تسجيل دخول إلى لوحة التحكم');
        Auth::pruneExpired();

        Http::ok(['user' => Auth::publicUser($user), 'csrf' => Csrf::issue()['token']]);
    }

    private static function logout(?array $u): void
    {
        Auth::logout();
        Http::ok(['loggedOut' => true]);
    }

    private static function me(?array $u): void
    {
        Http::ok([
            'user'   => Auth::publicUser($u),
            'unread' => Repo_Activity::unreadCount((int) $u['id']),
        ]);
    }

    /* =================================================================== */
    /* admin                                                               */
    /* =================================================================== */

    private static function summary(?array $u): void
    {
        $counts = Repo_Requests::counts();
        $recent = Repo_Requests::search(['per' => 5, 'page' => 1]);
        Http::ok([
            'counts'    => $counts,
            'customers' => (int) Db::value('SELECT COUNT(*) FROM customers'),
            'recent'    => array_map([Repo_Requests::class, 'publicRow'], $recent['rows']),
            'activity'  => array_map([Repo_Activity::class, 'publicRow'],
                              Repo_Activity::search(['per' => 4])['rows']),
            'unread'    => Repo_Activity::unreadCount((int) $u['id']),
        ]);
    }

    private static function listRequests(?array $u): void
    {
        $r = Repo_Requests::search([
            'q'       => Http::query('q', ''),
            'status'  => Http::query('status', ''),
            'source'  => Http::query('source', ''),
            'service' => Http::query('service', ''),
            'customer'=> Http::query('customer', ''),
            'page'    => (int) Http::query('page', '1'),
            'per'     => (int) Http::query('per', '20'),
        ]);
        Http::ok([
            'rows'  => array_map([Repo_Requests::class, 'publicRow'], $r['rows']),
            'total' => $r['total'], 'page' => $r['page'], 'per' => $r['per'],
        ]);
    }

    private static function showRequest(?array $u): void
    {
        $ref = (string) Http::query('id', '');
        $row = Repo_Requests::findByRef($ref);
        if ($row === null) Http::notFound();
        Http::ok(['request' => Repo_Requests::publicRow($row, true)]);
    }

    private static function setStatus(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'status']);
        $ref = Validator::tidy((string) ($in['id'] ?? ''));
        $to  = Validator::tidy((string) ($in['status'] ?? ''));
        if ($ref === '') $v->error('id', 'رقم الطلب مطلوب.');
        if (!in_array($to, Schema::STATUSES, true)) $v->error('status', 'حالة غير معروفة.');
        if (!$v->passed()) Http::invalid($v->errors());

        $row = Repo_Requests::findByRef($ref);
        if ($row === null) Http::notFound();
        $out = Repo_Requests::changeStatus((int) $row['id'], $to, $u);
        Http::ok($out);
    }

    private static function addNote(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'body']);
        $ref  = Validator::tidy((string) ($in['id'] ?? ''));
        $body = $v->multiline('body', 1000, 'الملاحظة');
        if ($ref === '')  $v->error('id', 'رقم الطلب مطلوب.');
        if ($body === null || $body === '') $v->error('body', 'اكتب نص الملاحظة أولاً.');
        if (!$v->passed()) Http::invalid($v->errors());

        $row = Repo_Requests::findByRef($ref);
        if ($row === null) Http::notFound();
        Http::ok(Repo_Requests::addNote((int) $row['id'], (string) $body, $u));
    }

    private static function listCustomers(?array $u): void
    {
        $rows = Repo_Customers::listWithStats((string) Http::query('q', ''));
        Http::ok(['rows' => array_map([Repo_Customers::class, 'publicRow'], $rows)]);
    }

    private static function listServices(?array $u): void
    {
        Http::ok(['rows' => array_map([Repo_Content::class, 'publicService'], Repo_Content::services())]);
    }

    private static function saveService(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'title', 'description', 'published', 'order']);
        $id = (int) ($in['id'] ?? 0);
        if ($id <= 0) $v->error('id', 'الخدمة غير محددة.');
        $title = $v->text('title', true, 2, 160, 'عنوان الخدمة');
        $desc  = $v->multiline('description', 1000, 'وصف الخدمة');
        if (!$v->passed()) Http::invalid($v->errors());
        if (Db::one('SELECT id FROM services WHERE id = ?', [$id]) === null) Http::notFound();

        Repo_Content::updateService($id, [
            'title'        => $title,
            'description'  => $desc ?? '',
            'is_published' => $v->bool('published', true) ? 1 : 0,
        ], $u);
        Http::ok(['id' => $id]);
    }

    private static function listMedia(?array $u): void
    {
        Http::ok(['rows' => array_map([Repo_Content::class, 'publicMedia'], Repo_Content::media())]);
    }

    private static function listUsers(?array $u): void
    {
        Http::ok(['rows' => array_map([Repo_Users::class, 'publicRow'], Repo_Users::all())]);
    }

    /**
     * §10 in its sharpest form. The two guards below are the ones a frontend
     * cannot enforce: an operator must not raise their own role, and the last
     * active Super Admin must not be removed — both are one request away
     * otherwise, whatever the UI shows.
     */
    private static function saveUser(?array $u): void
    {
        $in = Http::input();
        $v  = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'name', 'email', 'role', 'active', 'password', 'permissions']);

        $id     = isset($in['id']) ? (int) $in['id'] : 0;
        $name   = $v->text('name', true, 2, 120, 'الاسم');
        $email  = $v->email('email', true, 'البريد الإلكتروني');
        $role   = $v->choice('role', Schema::ROLES, true, 'الدور');
        $active = $v->bool('active', true);
        if (!$v->passed()) Http::invalid($v->errors());

        $target = $id > 0 ? Repo_Users::find($id) : null;
        if ($id > 0 && $target === null) Http::notFound();

        if ($id === (int) $u['id']) {
            if ($role !== (string) $u['role']) {
                Http::fail(409, 'self_role_change', 'لا يمكنك تغيير دورك بنفسك.');
            }
            if (!$active) {
                Http::fail(409, 'self_deactivate', 'لا يمكنك تعطيل حسابك بنفسك.');
            }
        }
        if ($target !== null && (string) $target['role'] === 'super'
            && ($role !== 'super' || !$active)
            && Repo_Users::activeSuperCount($id) === 0) {
            Http::fail(409, 'last_super_admin',
                'لا يمكن إزالة آخر مدير نظام فعّال. عيّن مديراً آخر أولاً.');
        }

        $perms = null;
        if ($role === 'admin' && isset($in['permissions']) && is_array($in['permissions'])) {
            /* stored, but Authz::permissions() still intersects with the preset
               so a stored matrix can only ever narrow */
            $perms = $in['permissions'];
        }

        if ($id > 0) {
            Repo_Users::update($id, [
                'name' => $name, 'email' => $email, 'role' => $role,
                'is_active' => $active ? 1 : 0,
                'permissions' => $perms === null ? null : json_encode($perms, JSON_UNESCAPED_UNICODE),
            ]);
            if (!$active || $role !== (string) $target['role']) {
                Repo_Users::revokeAllSessions($id, 'role or state changed');
            }
            Repo_Activity::record($u, 'users', 'edit', 'user', (string) $id, (string) $name,
                'تحديث بيانات الحساب');
            Http::ok(['id' => $id]);
        }

        $pw = $in['password'] ?? '';
        if (!is_string($pw) || mb_strlen($pw) < 12) {
            Http::invalid(['password' => 'كلمة المرور يجب ألا تقل عن 12 حرفاً.']);
        }
        if (Repo_Users::findByEmail((string) $email) !== null) {
            Http::invalid(['email' => 'هذا البريد مستخدم بالفعل.']);
        }
        $newId = Repo_Users::create((string) $name, (string) $email, $pw, (string) $role, $active, $perms);
        Repo_Activity::record($u, 'users', 'invite', 'user', (string) $newId, (string) $name,
            'إنشاء حساب بدور «' . (Schema::ROLE_LABEL[(string) $role] ?? $role) . '»');
        Http::ok(['id' => $newId], 201);
    }

    private static function listActivity(?array $u): void
    {
        $r = Repo_Activity::search([
            'q'      => Http::query('q', ''),
            'module' => Http::query('module', ''),
            'action' => Http::query('action', ''),
            'actor'  => Http::query('actor', ''),
            'since'  => Http::query('since', ''),
            'page'   => (int) Http::query('page', '1'),
            'per'    => (int) Http::query('per', '20'),
        ]);
        Http::ok([
            'rows'  => array_map([Repo_Activity::class, 'publicRow'], $r['rows']),
            'total' => $r['total'], 'page' => $r['page'], 'per' => $r['per'],
        ]);
    }

    private static function listNotifications(?array $u): void
    {
        $rows = Repo_Activity::notifications((int) $u['id']);
        Http::ok([
            'rows'   => array_map([Repo_Activity::class, 'publicNotification'], $rows),
            'unread' => Repo_Activity::unreadCount((int) $u['id']),
        ]);
    }

    private static function readNotification(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'all', 'read']);
        if (!$v->passed()) Http::invalid($v->errors());

        if (!empty($in['all'])) {
            Repo_Activity::markRead((int) $u['id'], null);
        } else {
            $id = (int) ($in['id'] ?? 0);
            if ($id <= 0) Http::invalid(['id' => 'التنبيه غير محدد.']);
            $read = !isset($in['read']) || !in_array(strtolower((string) $in['read']), ['0', 'false', 'no'], true);
            $read ? Repo_Activity::markRead((int) $u['id'], $id)
                  : Repo_Activity::markUnread((int) $u['id'], $id);
        }
        Http::ok(['unread' => Repo_Activity::unreadCount((int) $u['id'])]);
    }

    private static function listSettings(?array $u): void
    {
        Http::ok(['settings' => Repo_Content::settings(Http::query('category'))]);
    }

    private static function saveSettings(?array $u): void
    {
        $in = Http::input();
        $category = Validator::tidy((string) ($in['category'] ?? ''));
        $values   = $in['values'] ?? null;
        if ($category === '' || !is_array($values)) {
            Http::invalid(['category' => 'الفئة أو القيم غير صحيحة.']);
        }
        $flat = [];
        foreach ($values as $k => $val) {
            if (!is_scalar($val) && $val !== null) continue;
            $flat[(string) $k] = $val === null ? null : (string) $val;
        }
        Repo_Content::saveSettings($category, $flat, $u);
        Http::ok(['category' => $category, 'saved' => count($flat)]);
    }
}
