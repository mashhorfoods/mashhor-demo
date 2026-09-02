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
            ['POST', '/api/admin/services/reorder', ['services', 'edit'], 'reorderServices'],
            ['GET',  '/api/admin/media',          ['services', 'view'],  'listMedia'],
            ['GET',  '/api/admin/users',          ['users', 'view'],     'listUsers'],
            ['POST', '/api/admin/users/save',     ['users', 'edit'],     'saveUser'],
            ['GET',  '/api/admin/activity',       ['home', 'view'],      'listActivity'],
            ['GET',  '/api/admin/notifications',  ['home', 'view'],      'listNotifications'],
            ['POST', '/api/admin/notifications/read', ['home', 'view'],  'readNotification'],
            /* المحتوى — RECOVERY 02. Every one of these is gated on the
               `content` module, which the approved matrix grants to Super
               Admin and Content Manager, and to an Admin unless narrowed. */
            ['GET',  '/api/admin/content',          ['content', 'view'], 'contentOverview'],
            ['GET',  '/api/admin/content/area',     ['content', 'view'], 'contentArea'],
            ['POST', '/api/admin/content/block',    ['content', 'edit'], 'saveBlock'],
            ['POST', '/api/admin/content/item',     ['content', 'edit'], 'saveItem'],
            ['POST', '/api/admin/content/item/new', ['content', 'edit'], 'createItem'],
            ['POST', '/api/admin/content/item/del', ['content', 'edit'], 'deleteItem'],
            ['POST', '/api/admin/content/reorder',  ['content', 'edit'], 'reorderItems'],
            ['POST', '/api/admin/content/publish',  ['content', 'edit'], 'publishContent'],

            /* التقارير — RECOVERY 03. One endpoint, GET only, gated on the
               `reports` module that the approved matrix grants to Super Admin
               and Admin and withholds from Content Manager. There is no POST
               here: a report cannot change anything (§25). */
            ['GET',  '/api/admin/reports',        ['reports', 'view'],   'report'],

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

    /**
     * The approved terminology, enforced where it can actually be enforced.
     * الخدمات has always refused these forms in the browser; refusing them
     * here too is what makes the rule hold against a direct API call.
     */
    private const BANNED_TERMS = [
        'ذوي الإعاقة', 'ذوى الإعاقة', 'الإعاقة', 'إعاقة',
        'معاق', 'معاقين', 'معاقون', 'المعاقين',
    ];

    private static function bannedTerm(?string $text): ?string
    {
        if ($text === null || $text === '') return null;
        foreach (self::BANNED_TERMS as $t) {
            if (mb_strpos($text, $t) !== false) return $t;
        }
        return null;
    }

    private static function saveService(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'title', 'description', 'published', 'order', 'image']);
        $id = (int) ($in['id'] ?? 0);
        if ($id <= 0) $v->error('id', 'الخدمة غير محددة.');
        $title = $v->text('title', true, 2, 160, 'عنوان الخدمة');
        $desc  = $v->multiline('description', 1000, 'وصف الخدمة');

        $bad = self::bannedTerm($title);
        if ($bad !== null) {
            $v->error('title', 'المصطلح «' . $bad . '» غير معتمد. استخدم «ذوي الاحتياجات الخاصة».');
        }
        $bad = self::bannedTerm($desc);
        if ($bad !== null) {
            $v->error('description', 'المصطلح «' . $bad . '» غير معتمد. استخدم «ذوي الاحتياجات الخاصة».');
        }

        $image = Validator::tidy((string) ($in['image'] ?? ''));
        if ($image !== '') {
            if (!preg_match('#^(img|brand)/[A-Za-z0-9._-]+$#', $image)) {
                $v->error('image', 'مرجع صورة غير صالح.');
            } elseif (Db::value('SELECT 1 FROM media_assets WHERE path = ?', [$image]) === null) {
                $v->error('image', 'هذه الصورة غير موجودة في مكتبة الوسائط.');
            }
        }

        if (!$v->passed()) Http::invalid($v->errors());
        $svc = Db::one('SELECT * FROM services WHERE id = ?', [$id]);
        if ($svc === null) Http::notFound();

        $fields = [
            'title'        => $title,
            'description'  => $desc ?? '',
            'is_published' => $v->bool('published', true) ? 1 : 0,
        ];
        if ($image !== '') $fields['image_path'] = $image;

        /* an order given here re-sequences the whole set, so two services can
           never share a position */
        if (isset($in['order'])) {
            $target = max(1, min(99, (int) $in['order']));
            $ids = array_map(static fn(array $r): int => (int) $r['id'],
                Db::all('SELECT id FROM services ORDER BY sort_order ASC, id ASC'));
            $ids = array_values(array_filter($ids, static fn(int $x): bool => $x !== $id));
            array_splice($ids, min($target - 1, count($ids)), 0, [$id]);
            Repo_Content::reorderServices($ids, $u);
        }

        Repo_Content::updateService($id, $fields, $u);
        Http::ok(['id' => $id]);
    }

    private static function reorderServices(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'ids']);
        $ids = $in['ids'] ?? null;
        if (!is_array($ids) || $ids === []) Http::invalid(['ids' => 'ترتيب غير صالح.']);
        Http::ok(['reordered' => Repo_Content::reorderServices($ids, $u)]);
    }

    private static function listMedia(?array $u): void
    {
        /* usage is computed from the live page, never stored — §12 of the
           media module's own design, preserved */
        $usage = Repo_Content::mediaUsage();
        $rows = array_map(static function (array $m) use ($usage): array {
            $row = Repo_Content::publicMedia($m);
            $row['usedIn'] = $usage[$row['path']] ?? [];
            return $row;
        }, Repo_Content::media());
        Http::ok(['rows' => $rows]);
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


    /* =================================================================== */
    /* المحتوى — RECOVERY 02                                                */
    /* =================================================================== */

    /** The language a request is about. Arabic unless English is asked for. */
    private static function lang(): string
    {
        $l = strtolower((string) (Http::query('lang') ?? (Http::input()['lang'] ?? 'ar')));
        return in_array($l, Schema::LANGS, true) ? $l : 'ar';
    }

    private static function contentOverview(?array $u): void
    {
        $lang = self::lang();
        $last = Publisher::lastPublish();
        Http::ok([
            'lang'   => $lang,
            'areas'  => Repo_Cms::overview($lang),
            'canEdit'=> Authz::can($u, 'content', 'edit'),
            'publish'=> [
                'target'    => Publisher::target() === null ? null : basename((string) Publisher::target()),
                'writable'  => Publisher::writable(),
                'lastAt'    => $last['created_at'] ?? null,
                'lastBy'    => $last['actor_label'] ?? null,
                'lastOk'    => $last === null ? null : (bool) (int) $last['ok'],
                'lastNote'  => $last['note'] ?? null,
            ],
        ]);
    }

    /**
     * One content area, with everything the editor needs to draw itself: the
     * text fields with their labels and limits, and the records with their
     * order and published state.
     */
    private static function contentArea(?array $u): void
    {
        $area = (string) (Http::query('area') ?? '');
        if (!isset(Schema::CONTENT_AREAS[$area])) Http::notFound();
        $lang = self::lang();

        $fields = [];
        foreach (Repo_Cms::blocks($lang, $area) as $key => $row) {
            $fields[] = [
                'key'       => $key,
                'label'     => Repo_Cms::FIELD_LABELS[$key] ?? $key,
                'value'     => (string) $row['value'],
                'max'       => Repo_Cms::FIELD_MAX[$key] ?? 500,
                'multiline' => isset(Repo_Cms::FIELD_MULTILINE[$key]),
                'html'      => isset(Repo_Cms::FIELD_HTML[$key]),
                'updatedAt' => $row['updated_at'],
            ];
        }

        $items = [];
        if ($area === 'services') {
            /* the service records themselves live in `services` from
               RECOVERY 01 and are not duplicated (§38) */
            $tmpl = [];
            foreach (Repo_Cms::items('services', $lang) as $t) $tmpl[(string) $t['item_key']] = $t;
            foreach (Repo_Content::services() as $svc) {
                $t = $tmpl[(string) $svc['slug']] ?? null;
                $items[] = [
                    'id'        => (int) $svc['id'],
                    'key'       => (string) $svc['slug'],
                    'title'     => (string) $svc['title'],
                    'body'      => (string) $svc['description'],
                    'image'     => $svc['image_path'],
                    'order'     => (int) $svc['sort_order'],
                    'published' => (bool) (int) $svc['is_published'],
                    'updatedAt' => $svc['updated_at'],
                    'syncs'     => $t !== null,
                ];
            }
        } elseif (in_array($area, ['features', 'faq', 'testimonials'], true)) {
            foreach (Repo_Cms::items($area, $lang) as $r) {
                $items[] = [
                    'id'        => (int) $r['id'],
                    'key'       => $r['item_key'],
                    'title'     => (string) ($r['title'] ?? ''),
                    'body'      => (string) ($r['body'] ?? ''),
                    'attribution' => $r['attribution'],
                    'image'     => $r['image_path'],
                    'order'     => (int) $r['sort_order'],
                    'published' => (bool) (int) $r['is_published'],
                    'updatedAt' => $r['updated_at'],
                    'syncs'     => $r['markup'] !== null && $r['markup'] !== '',
                ];
            }
        }

        Http::ok([
            'area'   => $area,
            'label'  => Schema::CONTENT_AREAS[$area],
            'lang'   => $lang,
            'fields' => $fields,
            'items'  => $items,
            'canEdit'=> Authz::can($u, 'content', 'edit'),
            /* whether the public page has a region for this area at all */
            'publishable' => in_array($area, ['about', 'features', 'services', 'contact'], true),
            'canCreate'   => in_array($area, ['faq', 'testimonials'], true),
        ]);
    }

    /** One field, one language, one row — §11 and §20 in one call. */
    private static function saveBlock(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'key', 'lang', 'value']);
        $key  = Validator::tidy((string) ($in['key'] ?? ''));
        $lang = self::lang();

        if (!isset(Repo_Cms::FIELD_LABELS[$key])) Http::invalid(['key' => 'حقل غير معروف.']);
        $max = Repo_Cms::FIELD_MAX[$key] ?? 500;
        $raw = $in['value'] ?? '';
        if (!is_string($raw)) Http::invalid(['value' => 'قيمة غير صالحة.']);

        $value = isset(Repo_Cms::FIELD_MULTILINE[$key]) || isset(Repo_Cms::FIELD_HTML[$key])
            ? Validator::tidyMultiline($raw)
            : Validator::tidy($raw);

        if ($value === '')            Http::invalid(['value' => 'لا يمكن ترك هذا الحقل فارغاً.']);
        if (mb_strlen($value) > $max) Http::invalid(['value' => "النص أطول من الحد المسموح ({$max} حرفاً)."]);

        /* an inline-markup field must survive the allow-list unchanged, or the
           administrator has typed markup the page will not carry */
        if (isset(Repo_Cms::FIELD_HTML[$key])) {
            $rendered = Publisher::inline($value);
            if (str_contains($rendered, '&lt;')) {
                Http::invalid(['value' => 'يُسمح فقط بـ <br> و <b> و <em> و <span class="…">.']);
            }
        }
        if ($key === 'contact.website'
            && !preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/i', $value)) {
            Http::invalid(['value' => 'أدخل نطاقاً صحيحاً مثل aunaldrb.com']);
        }

        $before = Repo_Cms::block($key, $lang);
        if ($before !== null && (string) $before['value'] === $value) {
            Http::ok(['key' => $key, 'lang' => $lang, 'changed' => false]);
        }

        Repo_Cms::saveBlock($key, $lang, $value, $u);
        Repo_Activity::record($u, 'content', 'edit', 'content_block', $key,
            Repo_Cms::FIELD_LABELS[$key] ?? $key,
            'تحديث محتوى «' . (Schema::CONTENT_AREAS[explode('.', $key)[0]] ?? $key) . '»');
        Http::ok(['key' => $key, 'lang' => $lang, 'changed' => true]);
    }

    /** One record. Services are updated in their own table, not copied here. */
    private static function saveItem(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'area', 'lang', 'id', 'title', 'body',
                           'attribution', 'image', 'published']);
        $area = Validator::tidy((string) ($in['area'] ?? ''));
        $lang = self::lang();
        $id   = (int) ($in['id'] ?? 0);
        if (!isset(Schema::CONTENT_AREAS[$area]) || $id <= 0) Http::invalid(['id' => 'السجل غير محدد.']);

        $title = $v->text('title', $area !== 'testimonials', 2, 200, 'العنوان');
        $body  = $v->multiline('body', 1200, 'النص');
        if ($area === 'testimonials' && ($body === null || $body === '')) {
            $v->error('body', 'نص الرأي مطلوب.');
        }
        if ($area === 'faq' && ($body === null || $body === '')) {
            $v->error('body', 'نص الإجابة مطلوب.');
        }
        $image = Validator::tidy((string) ($in['image'] ?? ''));
        if ($image !== '' && !preg_match('#^(img|brand)/[A-Za-z0-9._-]+$#', $image)) {
            $v->error('image', 'مرجع صورة غير صالح.');
        }
        if ($image !== '' && Db::value('SELECT 1 FROM media_assets WHERE path = ?', [$image]) === null) {
            $v->error('image', 'هذه الصورة غير موجودة في مكتبة الوسائط.');
        }
        if (!$v->passed()) Http::invalid($v->errors());

        $published = $v->bool('published', true);

        if ($area === 'services') {
            $svc = Db::one('SELECT * FROM services WHERE id = ?', [$id]);
            if ($svc === null) Http::notFound();
            Repo_Content::updateService($id, [
                'title'        => $title,
                'description'  => $body ?? '',
                'is_published' => $published ? 1 : 0,
                'image_path'   => $image !== '' ? $image : $svc['image_path'],
            ], $u);
            /* keep the publishing template's copy in step with the record */
            $t = Db::one('SELECT id FROM content_items WHERE collection = ? AND lang = ? AND item_key = ?',
                ['services', $lang, (string) $svc['slug']]);
            if ($t !== null) {
                Repo_Cms::updateItem((int) $t['id'], [
                    'title' => $title, 'body' => $body ?? '',
                    'is_published' => $published ? 1 : 0,
                ], $u);
            }
            Http::ok(['id' => $id]);
        }

        $row = Repo_Cms::item($id);
        if ($row === null || (string) $row['collection'] !== $area || (string) $row['lang'] !== $lang) {
            Http::notFound();
        }
        Repo_Cms::updateItem($id, [
            'title'       => $title,
            'body'        => $body ?? '',
            'attribution' => Validator::tidy((string) ($in['attribution'] ?? '')) ?: null,
            'image_path'  => $image !== '' ? $image : null,
            'is_published'=> $published ? 1 : 0,
        ], $u);
        Repo_Activity::record($u, 'content', 'edit', $area, (string) $id,
            (string) ($title ?? $row['title']),
            'تحديث سجل في «' . Schema::CONTENT_AREAS[$area] . '»');
        Http::ok(['id' => $id]);
    }

    /**
     * §08/§09 — new records are accepted only where the site has no approved
     * set to protect. The six features and seven services are the approved
     * content and cannot be added to; the FAQ and the testimonials are empty
     * and are the administrator's to fill.
     */
    private static function createItem(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'area', 'lang', 'title', 'body', 'attribution']);
        $area = Validator::tidy((string) ($in['area'] ?? ''));
        if (!in_array($area, ['faq', 'testimonials'], true)) {
            Http::fail(409, 'not_extensible',
                'لا يمكن إضافة سجل جديد إلى هذا القسم — محتواه معتمد ومحدد.');
        }
        $lang  = self::lang();
        $title = $v->text('title', $area === 'faq', 2, 200, $area === 'faq' ? 'السؤال' : 'الاسم');
        $body  = $v->multiline('body', 1200, $area === 'faq' ? 'الإجابة' : 'نص الرأي');
        if ($body === null || $body === '') $v->error('body', 'النص مطلوب.');
        if (!$v->passed()) Http::invalid($v->errors());

        $id = Repo_Cms::createItem($area, $lang, [
            'title' => $title,
            'body'  => $body,
            'attribution' => Validator::tidy((string) ($in['attribution'] ?? '')) ?: null,
            'is_published' => 1,
        ], $u);
        Repo_Activity::record($u, 'content', 'create', $area, (string) $id, (string) $title,
            'إضافة سجل إلى «' . Schema::CONTENT_AREAS[$area] . '»');
        Http::ok(['id' => $id], 201);
    }

    private static function deleteItem(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'area', 'lang', 'id']);
        $area = Validator::tidy((string) ($in['area'] ?? ''));
        $id   = (int) ($in['id'] ?? 0);
        if (!in_array($area, ['faq', 'testimonials'], true)) {
            Http::fail(409, 'not_deletable',
                'لا يمكن حذف سجل من هذا القسم — استخدم «غير نشط» لإخفائه.');
        }
        $row = Repo_Cms::item($id);
        if ($row === null || (string) $row['collection'] !== $area) Http::notFound();
        Repo_Cms::deleteItem($id);
        Repo_Activity::record($u, 'content', 'edit', $area, (string) $id,
            (string) ($row['title'] ?? ''), 'حذف سجل من «' . Schema::CONTENT_AREAS[$area] . '»');
        Http::ok(['id' => $id]);
    }

    private static function reorderItems(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'area', 'lang', 'ids']);
        $area = Validator::tidy((string) ($in['area'] ?? ''));
        $ids  = $in['ids'] ?? null;
        if (!isset(Schema::CONTENT_AREAS[$area]) || !is_array($ids) || $ids === []) {
            Http::invalid(['ids' => 'ترتيب غير صالح.']);
        }
        $lang = self::lang();

        if ($area === 'services') {
            $n = Db::transaction(static function () use ($ids, $u, $lang): int {
                $i = 0;
                foreach (array_values($ids) as $id) {
                    $svc = Db::one('SELECT id, slug FROM services WHERE id = ?', [(int) $id]);
                    if ($svc === null) continue;
                    $i++;
                    Db::run('UPDATE services SET sort_order = ?, updated_at = ? WHERE id = ?',
                        [$i, Db::now(), (int) $svc['id']]);
                    $t = Db::one('SELECT id FROM content_items WHERE collection = ? AND lang = ? AND item_key = ?',
                        ['services', $lang, (string) $svc['slug']]);
                    if ($t !== null) Repo_Cms::updateItem((int) $t['id'], ['sort_order' => $i], $u);
                }
                return $i;
            });
        } else {
            $n = Repo_Cms::reorder($area, $lang, $ids, $u);
        }

        Repo_Activity::record($u, 'content', 'edit', $area, null, Schema::CONTENT_AREAS[$area],
            'تغيير ترتيب «' . Schema::CONTENT_AREAS[$area] . '»');
        Http::ok(['reordered' => $n]);
    }

    /** §19 — write the stored content back into the live page. */
    private static function publishContent(?array $u): void
    {
        $r = Publisher::publish($u);
        if (!$r['ok']) {
            Log::write('warn', 'content publish failed', ['note' => $r['note']]);
            Http::fail(500, 'publish_failed',
                $r['note'] ?? 'تعذّر تحديث صفحة الموقع. حاول مرة أخرى.');
        }
        Repo_Activity::record($u, 'content', 'publish', 'site', $r['target'], $r['target'],
            'نشر المحتوى إلى صفحة الموقع (' . $r['regions'] . ' منطقة)');
        Http::ok($r);
    }


    /* =================================================================== */
    /* التقارير — RECOVERY 03                                               */
    /* =================================================================== */

    /**
     * The approved scope is "basic request and customer counts over a period".
     * This answers exactly that, for one of the two approved reports, over one
     * period, on one explicitly named date basis.
     *
     * GET only. It selects and it returns; there is no branch in it that
     * writes, and no activity row is recorded — §27 is explicit that reading a
     * report should not generate activity noise.
     */
    private static function report(?array $u): void
    {
        $report = (string) (Http::query('report') ?? 'requests');
        if (!isset(Repo_Reports::REPORTS[$report])) Http::notFound();

        $basis = (string) (Http::query('basis') ?? 'created');
        if (!isset(Repo_Reports::BASES[$basis])) $basis = 'created';

        $err = null;
        $period = Repo_Reports::resolvePeriod(
            (string) (Http::query('period') ?? 'month'),
            Http::query('from'), Http::query('to'), $err
        );
        if ($period === null) Http::invalid(['period' => $err ?? 'فترة غير صالحة.']);

        /* filters are only the ones the spec's own dimensions allow (§05):
           the five approved statuses and the existing service records */
        $filters = [];
        $status = (string) (Http::query('status') ?? '');
        if ($status !== '') {
            if (!in_array($status, Schema::STATUSES, true)) Http::invalid(['status' => 'حالة غير معروفة.']);
            $filters['status'] = $status;
        }
        $service = (string) (Http::query('service') ?? '');
        if ($service !== '') {
            if (!in_array($service, Repo_Reports::serviceOptions(), true)) {
                Http::invalid(['service' => 'خدمة غير معروفة.']);
            }
            $filters['service'] = $service;
        }

        $out = [
            'report'  => $report,
            'title'   => Repo_Reports::REPORTS[$report],
            'basis'   => ['key' => $basis, 'label' => Repo_Reports::BASES[$basis]['label']],
            'period'  => $period,
            'filters' => ['status' => $filters['status'] ?? '', 'service' => $filters['service'] ?? ''],
            'services'=> Repo_Reports::serviceOptions(),
            'statuses'=> Schema::STATUS_LABEL,
            'sources' => Schema::SOURCE_LABEL,
        ];

        if ($report === 'requests') {
            $out['data'] = Repo_Reports::requests($basis, $period, $filters);
            $empty = $out['data']['total'] === 0;
        } else {
            $out['data'] = Repo_Reports::customers($basis, $period);
            $page = max(1, (int) (Http::query('page') ?? '1'));
            $per  = 10;
            $list = Repo_Reports::customerRows($basis, $period, $per, ($page - 1) * $per);
            $out['data']['rows']  = array_map(static fn(array $r): array => [
                /* §09 §20 — the name, the count and the date. Nothing else. */
                'id'     => (int) $r['id'],
                'name'   => (string) $r['name'],
                'count'  => (int) $r['n'],
                'lastAt' => $r['last_at'],
            ], $list['rows']);
            $out['data']['rowsTotal'] = $list['total'];
            $out['data']['page'] = $page;
            $out['data']['per']  = $per;
            $empty = $out['data']['active'] === 0;
        }

        /* §13 — an empty period offers a wider one instead of a row of zeroes */
        $out['empty'] = $empty;
        if ($empty) $out['suggest'] = Repo_Reports::suggestWider($basis, $period);

        Http::ok($out);
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
