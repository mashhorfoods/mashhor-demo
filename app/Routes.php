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
            /* Stage 6 — a signed-in person can change their own password. It
               needs the current one, so a borrowed session cannot lock the
               owner out of their own account. */
            ['POST', '/api/auth/password', 'session', 'changeOwnPassword'],

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
            /* Stage 4 — a service can be added. It starts hidden, so nothing
               reaches the website until someone looks at it and publishes. */
            ['POST', '/api/admin/services/new',   ['services', 'edit'],  'createService'],
            ['GET',  '/api/admin/media',          ['services', 'view'],  'listMedia'],
            /* Stage 4 — and a picture can be added to the library, which was
               read-only and could only ever hold what the deployment shipped. */
            ['POST', '/api/admin/media/upload',   ['services', 'edit'],  'uploadMedia'],
            ['GET',  '/api/admin/users',          ['users', 'view'],     'listUsers'],
            ['POST', '/api/admin/users/save',     ['users', 'edit'],     'saveUser'],
            /* Stage 6 — a Super Admin can set another account's password and
               clear its lock. Until now a forgotten password had no answer
               short of editing the database by hand. */
            ['POST', '/api/admin/users/password', ['users', 'edit'],     'resetUserPassword'],
            ['POST', '/api/admin/users/unlock',   ['users', 'edit'],     'unlockUser'],
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
            /* What is saved but not yet on the website. Gated on `home` view
               because every module that edits site content shows the count,
               and every role that can sign in has that. */
            ['GET',  '/api/admin/content/pending',  ['home', 'view'],    'contentPending'],
            /* The page as it would look, rendered in memory and returned as
               HTML to a signed-in administrator. Nothing is written, so there
               is no preview file to leak, to serve by accident, or to forget
               to delete. */
            ['GET',  '/api/admin/content/preview',  ['content', 'view'], 'contentPreview'],

            /* التقارير — RECOVERY 03. One endpoint, GET only, gated on the
               `reports` module that the approved matrix grants to Super Admin
               and Admin and withholds from Content Manager. There is no POST
               here: a report cannot change anything (§25). */
            ['GET',  '/api/admin/reports',        ['reports', 'view'],   'report'],

            ['GET',  '/api/admin/settings',       ['settings', 'view'],  'listSettings'],
            ['POST', '/api/admin/settings/save',  ['settings', 'edit'],  'saveSettings'],

            /* Stage 6 — النسخ الاحتياطي. Gated on the settings module and
               narrowed to `super` inside the handlers: a backup is every
               customer and every request in one file, and a restore replaces
               all of it. Neither is a day-to-day action. */
            ['GET',  '/api/admin/backup',        ['settings', 'view'],  'downloadBackup'],
            ['POST', '/api/admin/restore',       ['settings', 'edit'],  'restoreBackup'],
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
        /* STAGE 6E — the two ledgers that grow with use and never shrank.
           Here for the same reason pruneExpired() is: sign-in is infrequent,
           always behind a real person, and never on a page the public can
           reach. It runs at most once a day and never raises. */
        Retention::sweep();

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

    /**
     * The dashboard's opening figures — each part only for an account allowed
     * to know it.
     *
     * The route is gated on `home:view`, which every role that can sign in
     * has, and that is right: this is the shell's own endpoint. What was wrong
     * is that it answered with everything regardless of role. A Content
     * Manager — refused /api/admin/requests and /api/admin/customers with a
     * 403 — was handed the request counts, the customer count, and a `recent`
     * list carrying each beneficiary's name, PHONE NUMBER, pickup address and
     * destination. A module gate on the route means nothing when the payload
     * spans modules.
     *
     * Absent rather than zero, deliberately: a tile that reads 0 is a claim
     * about the business, and «لا توجد طلبات» is a different statement from
     * «لا ترى الطلبات». The dashboard hides what it is not sent.
     */
    private static function summary(?array $u): void
    {
        $body = [];

        if (Authz::can($u, 'requests', 'view')) {
            $body['counts'] = Repo_Requests::counts();
            $body['recent'] = array_map([Repo_Requests::class, 'publicRow'],
                Repo_Requests::search(['per' => 5, 'page' => 1])['rows']);
        }
        if (Authz::can($u, 'customers', 'view')) {
            $body['customers'] = (int) Db::value('SELECT COUNT(*) FROM customers');
        }

        /* the log and the bell are filtered the same way they are filtered on
           their own endpoints — one rule, applied everywhere it applies */
        $body['activity'] = array_map([Repo_Activity::class, 'publicRow'],
            Repo_Activity::search(['per' => 4, 'modules' => Authz::visibleModules($u)])['rows']);
        $body['unread'] = Repo_Activity::unreadCount((int) $u['id'], Repo_Activity::visibleKinds($u));

        /* so the page knows what it was NOT sent, and hides those tiles rather
           than drawing them empty */
        $body['visible'] = [
            'requests'  => Authz::can($u, 'requests', 'view'),
            'customers' => Authz::can($u, 'customers', 'view'),
        ];
        Http::ok($body);
    }

    private static function createService(?array $u): void
    {
        $res = Repo_Content::createService(Http::input(), (array) $u);
        if (!$res['ok']) Http::invalid(['form' => $res['error'] ?? 'تعذّر إنشاء الخدمة.']);
        Http::ok(['id' => $res['id'], 'slug' => $res['slug']], 201);
    }

    /**
     * A picture, uploaded.
     *
     * multipart rather than JSON, so the body is read from $_FILES; the CSRF
     * token travels in the form the same way it does everywhere else, and the
     * dispatcher has already checked it and the caller's permission before
     * this runs.
     */
    private static function uploadMedia(?array $u): void
    {
        $file = $_FILES['file'] ?? null;
        if (!is_array($file)) Http::invalid(['file' => 'لم يصل أي ملف.']);
        $res = Repo_Content::storeUpload($file, (array) $u);
        if (!$res['ok']) Http::invalid(['file' => $res['error'] ?? 'تعذّر رفع الصورة.']);
        Http::ok(['asset' => $res['asset']], 201);
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
        /* The dashboard used to carry the limits as literals and drifted from
           the server twice — once from the module's own rules, once from PHP's.
           They travel with the list now, so the dialog can only say what this
           server will actually accept. */
        $mimes = [];
        foreach (Repo_Content::UPLOAD_TYPES as $t) $mimes[] = $t[1];
        Http::ok(['rows' => $rows, 'limits' => [
            'maxBytes' => Repo_Content::uploadLimitBytes(),
            'maxMb'    => round(Repo_Content::uploadLimitBytes() / 1048576, 1),
            'minPx'    => 200,
            'types'    => $mimes,
        ]]);
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

        $pw = is_string($in['password'] ?? null) ? (string) $in['password'] : '';
        /* One policy, decided in Auth, so the users module, the installer and
           the recovery page cannot disagree about what is strong enough. */
        $problem = Auth::passwordProblem($pw, (string) $email, (string) $name);
        if ($problem !== null) Http::invalid(['password' => $problem]);
        if (Repo_Users::findByEmail((string) $email) !== null) {
            Http::invalid(['email' => 'هذا البريد مستخدم بالفعل.']);
        }
        $newId = Repo_Users::create((string) $name, (string) $email, $pw, (string) $role, $active, $perms);
        Repo_Activity::record($u, 'users', 'invite', 'user', (string) $newId, (string) $name,
            'إنشاء حساب بدور «' . (Schema::ROLE_LABEL[(string) $role] ?? $role) . '»');
        Http::ok(['id' => $newId], 201);
    }

    /**
     * Stage 6 — changing your own password.
     *
     * The current password is required: a session is a bearer token, and an
     * unattended browser must not be enough to take an account over. Every
     * OTHER session for the account is revoked, because the old password may
     * be the reason it is being changed.
     */
    private static function changeOwnPassword(?array $u): void
    {
        $in = Http::input();
        $v  = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'current', 'password']);
        if (!$v->passed()) Http::invalid($v->errors());

        $current = is_string($in['current'] ?? null) ? (string) $in['current'] : '';
        $next    = is_string($in['password'] ?? null) ? (string) $in['password'] : '';

        /* Deliberately rate-limited: this endpoint verifies a password, so it
           is a password oracle for anyone who reaches a logged-in browser. */
        RateLimit::enforce('pwchange:' . (int) $u['id'], 10, 600,
            'محاولات كثيرة لتغيير كلمة المرور. انتظر قليلاً ثم أعد المحاولة.');

        $row = Repo_Users::findByEmail((string) $u['email']);
        if ($row === null || !Auth::verify($current, (string) $row['password_hash'])) {
            Log::write('warn', 'password change refused: wrong current password',
                ['user_id' => $u['id'], 'ip' => Http::ip()]);
            Http::invalid(['current' => 'كلمة المرور الحالية غير صحيحة.']);
        }
        if ($current === $next) {
            Http::invalid(['password' => 'كلمة المرور الجديدة مطابقة للحالية.']);
        }
        $problem = Auth::passwordProblem($next, (string) $u['email'], (string) $u['name']);
        if ($problem !== null) Http::invalid(['password' => $problem]);

        Auth::changePassword((int) $u['id'], $next, Auth::sessionId());
        Repo_Activity::record($u, 'users', 'edit', 'user', (string) $u['id'], (string) $u['name'],
            'تغيير كلمة المرور الخاصة بالحساب');
        /* The response says it worked. It never carries the password back. */
        Http::ok(['othersSignedOut' => true]);
    }

    /**
     * Stage 6 — a Super Admin sets someone else's password.
     *
     * Restricted to `super` beyond the module gate: an Admin with the users
     * module could otherwise set a Super Admin's password and take the system
     * over. The new password is typed by the person doing the reset, so it is
     * never generated and never displayed — §06 forbids showing a password
     * and there is nothing here to show.
     */
    private static function resetUserPassword(?array $u): void
    {
        if (!Authz::isSuper($u)) {
            Log::write('warn', 'password reset denied: not a super admin',
                ['user_id' => $u['id'], 'role' => $u['role']]);
            Http::forbidden();
        }
        $in = Http::input();
        $v  = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'password']);
        if (!$v->passed()) Http::invalid($v->errors());

        $id = (int) ($in['id'] ?? 0);
        $target = $id > 0 ? Repo_Users::find($id) : null;
        if ($target === null) Http::notFound();

        $next = is_string($in['password'] ?? null) ? (string) $in['password'] : '';
        $problem = Auth::passwordProblem($next, (string) $target['email'], (string) $target['name']);
        if ($problem !== null) Http::invalid(['password' => $problem]);

        /* Their sessions all go: whoever held one was relying on a password
           that no longer opens the account. */
        Auth::changePassword($id, $next, $id === (int) $u['id'] ? Auth::sessionId() : null);
        Repo_Activity::record($u, 'users', 'edit', 'user', (string) $id, (string) $target['name'],
            'إعادة تعيين كلمة المرور');
        Http::ok(['id' => $id]);
    }

    /** Stage 6 — clear a lock left by repeated failed logins. */
    private static function unlockUser(?array $u): void
    {
        if (!Authz::isSuper($u)) Http::forbidden();
        $in = Http::input();
        $v  = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id']);
        if (!$v->passed()) Http::invalid($v->errors());

        $id = (int) ($in['id'] ?? 0);
        $target = $id > 0 ? Repo_Users::find($id) : null;
        if ($target === null) Http::notFound();

        Repo_Users::unlock($id);
        Repo_Activity::record($u, 'users', 'edit', 'user', (string) $id, (string) $target['name'],
            'إلغاء قفل الحساب');
        Http::ok(['id' => $id]);
    }

    /**
     * Stage 6 — download everything as one JSON file.
     *
     * Not Http::json(): this is a file the browser saves, so it carries a
     * download disposition and its own content type. It still passes through
     * the same authorization the rest of the API does, and it still refuses
     * to be cached.
     */
    private static function downloadBackup(?array $u): void
    {
        if (!Authz::isSuper($u)) {
            Log::write('warn', 'backup denied: not a super admin',
                ['user_id' => $u['id'], 'role' => $u['role']]);
            Http::forbidden();
        }

        /* One download a minute is plenty, and it stops a stolen session from
           quietly pulling the whole customer list over and over. */
        RateLimit::enforce('backup:' . (int) $u['id'], 6, 600,
            'طلبات كثيرة لتنزيل النسخة الاحتياطية. انتظر قليلاً ثم أعد المحاولة.');

        $data = Backup::build();
        $body = Backup::encode($data);
        $name = Backup::filename();

        Repo_Activity::record($u, 'settings', 'edit', 'backup', null, $name,
            'تنزيل نسخة احتياطية من البيانات');
        Log::write('info', 'backup downloaded', ['user_id' => $u['id'], 'bytes' => strlen($body)]);

        if (!headers_sent()) {
            http_response_code(200);
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $name . '"');
            header('Content-Length: ' . strlen($body));
            header('Cache-Control: no-store, private');
            header('X-Content-Type-Options: nosniff');
        }
        echo $body;
        exit;
    }

    /**
     * Stage 6 — restore from an uploaded backup file.
     *
     * Three things stand between a mis-click and losing the live data: only a
     * Super Admin may call it, the request must carry the exact confirmation
     * word, and a snapshot of what is there now is written to disk before
     * anything is deleted. The replacement itself is one transaction.
     */
    private const RESTORE_CONFIRM = 'استعادة';

    private static function restoreBackup(?array $u): void
    {
        if (!Authz::isSuper($u)) {
            Log::write('warn', 'restore denied: not a super admin',
                ['user_id' => $u['id'], 'role' => $u['role']]);
            Http::forbidden();
        }

        $inAll   = Http::input();
        $confirm = is_string($inAll['confirm'] ?? null) ? trim((string) $inAll['confirm']) : '';
        if ($confirm !== self::RESTORE_CONFIRM) {
            Http::invalid(['confirm' => 'اكتب كلمة «' . self::RESTORE_CONFIRM . '» للتأكيد.']);
        }

        /* Two ways in, because one of them has a ceiling the operator does not
           control. A multipart upload is capped by upload_max_filesize, which
           is 2 MB on a default PHP and smaller than a real backup of this
           system within the first year — measured, not guessed. So the file
           may also arrive as the JSON body of the request, which is capped by
           post_max_size instead, and that is the path the dashboard uses. */
        $data = null;
        $in   = Http::input();
        if (isset($in['backup']) && is_array($in['backup'])) {
            $data = $in['backup'];
        } else {
            $file = $_FILES['file'] ?? null;
            $err  = is_array($file) ? (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) : UPLOAD_ERR_NO_FILE;
            if ($err !== UPLOAD_ERR_OK) {
                /* Named exactly, because "choose a file first" when the file
                   WAS chosen and the server dropped it is a message that sends
                   someone looking in the wrong place for an hour. */
                Http::invalid(['file' => match ($err) {
                    UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE =>
                        'الملف أكبر من الحد الذي يسمح به الخادم للرفع ('
                        . (string) ini_get('upload_max_filesize') . '). ارفع هذا الحد من إعدادات '
                        . 'PHP في لوحة الاستضافة، أو استعد من سطر الأوامر عبر bin/backup.php.',
                    UPLOAD_ERR_PARTIAL   => 'انقطع رفع الملف قبل اكتماله. أعد المحاولة.',
                    UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE =>
                        'تعذّر على الخادم حفظ الملف المرفوع مؤقتاً.',
                    default => 'اختر ملف النسخة الاحتياطية أولاً.',
                }]);
            }
            if (!is_uploaded_file((string) ($file['tmp_name'] ?? ''))) {
                Http::invalid(['file' => 'اختر ملف النسخة الاحتياطية أولاً.']);
            }
            $raw = @file_get_contents((string) $file['tmp_name']);
            if (!is_string($raw) || $raw === '') Http::invalid(['file' => 'الملف فارغ.']);
            $data = json_decode($raw, true);
        }
        $problem = Backup::problem($data);
        if ($problem !== null) Http::invalid(['file' => $problem]);

        try {
            /* §5 — what is here now, saved before it is replaced. A restore of
               the wrong file is then itself undoable. */
            $snapshot = Backup::writeSnapshot('before-restore');
            $report   = Backup::restore($data);
        } catch (Throwable $e) {
            Log::exception($e);
            Http::fail(500, 'restore_failed',
                'تعذّرت الاستعادة ولم تتغيّر البيانات. التفاصيل مسجّلة في السجل.');
        }

        Repo_Activity::record($u, 'settings', 'edit', 'backup', null,
            (string) ($data['created_at'] ?? ''),
            'استعادة البيانات من نسخة احتياطية');
        Log::write('warn', 'data restored from backup', [
            'user_id' => $u['id'],
            'from'    => (string) ($data['created_at'] ?? ''),
            'rows'    => array_sum($report),
        ]);

        Http::ok([
            'restored' => $report,
            'total'    => array_sum($report),
            'from'     => $data['created_at'] ?? null,
            /* Named so it can be found again; the path is inside app/storage,
               which is not servable, so naming it discloses nothing. */
            'snapshot' => basename($snapshot),
            /* The website still shows what it showed a moment ago — the
               restored records reach it through النشر, like every other
               change. Said plainly so nobody assumes otherwise. */
            'note'     => 'استُعيدت البيانات. الموقع لم يتغيّر بعد — انشره من صفحة المحتوى ليعكس ما استُعيد.',
        ]);
    }

    private static function listActivity(?array $u): void
    {
        $r = Repo_Activity::search([
            /* the reader's own modules, always — a module named in the query
               can only narrow this, never widen it */
            'modules' => Authz::visibleModules($u),
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
            /* STAGE 6E — the page says the log cannot be edited or deleted
               from the dashboard, which is still true; entries do now age out
               on a schedule, so the page has to say that too rather than let
               someone find a gap and wonder. Sent from the server so the
               number on screen is the number in force. */
            'retention' => ['keepDays' => Retention::activityKeepDays()],
        ]);
    }

    private static function listNotifications(?array $u): void
    {
        /* Every notification this system raises is about a transport request
           and its title carries the beneficiary's name, so the bell shows only
           what the account may read. For a Content Manager that is nothing,
           and an empty bell is the correct answer rather than a leak. */
        $kinds = Repo_Activity::visibleKinds($u);
        $rows  = Repo_Activity::notifications((int) $u['id'], 50, $kinds);
        Http::ok([
            'rows'   => array_map([Repo_Activity::class, 'publicNotification'], $rows),
            'unread' => Repo_Activity::unreadCount((int) $u['id'], $kinds),
        ]);
    }

    private static function readNotification(?array $u): void
    {
        $in = Http::input();
        $v = new Validator($in);
        $v->rejectUnknown(['csrf_token', 'id', 'all', 'read']);
        if (!$v->passed()) Http::invalid($v->errors());

        $kinds = Repo_Activity::visibleKinds($u);
        if (!empty($in['all'])) {
            Repo_Activity::markRead((int) $u['id'], null, $kinds);
        } else {
            $id = (int) ($in['id'] ?? 0);
            if ($id <= 0) Http::invalid(['id' => 'التنبيه غير محدد.']);
            /* An account that cannot be shown a notification cannot mark it
               either — otherwise the id alone tells it the notification exists
               and lets it change state it may not read. */
            if (!Repo_Activity::mayRead($u, $id)) Http::notFound();
            $read = !isset($in['read']) || !in_array(strtolower((string) $in['read']), ['0', 'false', 'no'], true);
            $read ? Repo_Activity::markRead((int) $u['id'], $id)
                  : Repo_Activity::markUnread((int) $u['id'], $id);
        }
        Http::ok(['unread' => Repo_Activity::unreadCount((int) $u['id'], $kinds)]);
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

    private static function contentPending(?array $u): void
    {
        Http::ok(['pending' => Publisher::pending()]);
    }

    /**
     * The published page with every pending change applied, for one look
     * before it goes live.
     *
     * Two things are injected and nothing else is: a <base> so the page's
     * relative links to images and fonts still resolve while it is served
     * from an /api path, and a robots directive, belt and braces, in case a
     * crawler ever reaches a URL that already requires a session.
     */
    private static function contentPreview(?array $u): void
    {
        $html = Publisher::previewHtml();
        if ($html === null) {
            Http::ok(['error' => ['message' => 'تعذّر تجهيز المعاينة.']], 503);
            return;
        }
        $inject = '<base href="/">' . "\n" . '<meta name="robots" content="noindex,nofollow">';
        $html = preg_replace('~(<head[^>]*>)~i', '$1' . "\n" . $inject, $html, 1) ?? $html;

        if (!headers_sent()) {
            header('Content-Type: text/html; charset=utf-8');
            header('Cache-Control: no-store, private');
            header('X-Robots-Tag: noindex, nofollow');
            header('X-Content-Type-Options: nosniff');
            header('Referrer-Policy: no-referrer');
            /* STAGE 6C — the preview renders the public page's markup, which
               carries its analytics tag. A preview is for looking at, so the
               external script is refused and the beacon has nowhere to go:
               previewing a change must not register as a visit, and must not
               tell anyone outside that a change is being considered. The
               page's own inline scripts still run, so what is shown is what
               the website would look like rather than its no-JavaScript
               fallback. */
            header("Content-Security-Policy: default-src 'self'; "
                . "script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                . "img-src 'self' data:; font-src 'self'; connect-src 'none'; "
                . "form-action 'none'; base-uri 'none'; frame-ancestors 'self'; object-src 'none'");
        }
        echo $html;
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
            foreach (Repo_Content::services() as $svc) {
                $items[] = [
                    'id'        => (int) $svc['id'],
                    'key'       => (string) $svc['slug'],
                    'title'     => (string) $svc['title'],
                    'body'      => (string) $svc['description'],
                    'image'     => $svc['image_path'],
                    'order'     => (int) $svc['sort_order'],
                    'published' => (bool) (int) $svc['is_published'],
                    'updatedAt' => $svc['updated_at'],
                    /* a service is one record now; it always publishes */
                    'syncs'     => true,
                ];
            }
        } elseif (isset(Schema::AREA_COLLECTIONS[$area])) {
            $rows = [];
            foreach (Schema::AREA_COLLECTIONS[$area] as $collection) {
                foreach (Repo_Cms::items($collection, $lang) as $r) {
                    $r['collection'] = $collection;
                    $rows[] = $r;
                }
            }
            foreach ($rows as $r) {
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
                    'collection'=> $r['collection'] ?? $area,
                    /* shaped collections publish from the record itself; the
                       older ones still carry their own markup */
                    'syncs'     => ($r['markup'] !== null && $r['markup'] !== '')
                                   || in_array((string) ($r['collection'] ?? ''), Publisher::shapedCollections(), true),
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
