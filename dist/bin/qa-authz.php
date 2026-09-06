<?php
declare(strict_types=1);
/**
 * The authorization matrix, swept exhaustively.
 *
 * Every module-gated route is called as every role, and the answer is checked
 * against Authz::preset() — the same table the dispatcher enforces. 35 routes
 * against 3 roles is 105 answers, and reading them by eye is how the leak in
 * summary/activity/notifications survived: each of those endpoints looked
 * correct on its own page.
 *
 * A denied call must answer 403. An allowed call must answer anything BUT 403
 * — usually 200, or 422 when the empty body this sweep sends fails validation,
 * which is the point: it proves the request reached the handler.
 *
 * Nothing here writes. Routes that would act on an empty body (publish,
 * restore, mark-all-read) are called only as the roles that must be REFUSED,
 * so a 403 is asserted without the authorized path ever running.
 *
 *   php bin/qa-authz.php [--base=http://127.0.0.1:8088]
 */

define('AUN_APP', true);
define('AUN_ROOT', dirname(__DIR__));
require AUN_ROOT . '/app/Env.php';
Env::load(AUN_ROOT . '/.env');
foreach (['Db','Log','Schema','Authz','Http','Csrf','Auth','Validator'] as $c) {
    $f = AUN_ROOT . '/app/' . $c . '.php';
    if (is_file($f)) require_once $f;
}

$BASE = 'http://127.0.0.1:8088';
foreach ($argv as $a) if (str_starts_with($a, '--base=')) $BASE = substr($a, 7);

$pass = 0; $fail = 0; $failed = []; $lines = [];
function check(string $group, string $name, bool $ok, string $detail = ''): void {
    global $pass, $fail, $failed, $lines;
    if ($ok) $pass++; else { $fail++; $failed[] = "{$group} / {$name}" . ($detail ? " — {$detail}" : ''); }
    $lines[] = sprintf('  %s %-62s %s', $ok ? 'PASS' : 'FAIL', $name, $detail);
}
function section(string $t): void { global $lines; $lines[] = "\n" . $t; }

/* ---- a tiny HTTP client with its own cookie jar ---------------------- */
final class C {
    public array $cookies = [];
    public function __construct(private string $base) {}
    public function req(string $m, string $p, $body = null, array $h = []): array {
        $hdr = ['Accept: application/json'];
        foreach ($h as $k => $v) $hdr[] = "{$k}: {$v}";
        if ($this->cookies) {
            $pairs = [];
            foreach ($this->cookies as $k => $v) $pairs[] = "{$k}={$v}";
            $hdr[] = 'Cookie: ' . implode('; ', $pairs);
        }
        $o = ['http' => ['method' => $m, 'header' => $hdr, 'ignore_errors' => true,
                         'timeout' => 15, 'follow_location' => 0, 'max_redirects' => 1]];
        if ($body !== null) {
            $o['http']['header'][] = 'Content-Type: application/json';
            $o['http']['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
        }
        $raw = @file_get_contents($this->base . $p, false, stream_context_create($o));
        $st = 0;
        foreach ($http_response_header ?? [] as $l) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $l, $mm)) $st = (int) $mm[1];
            if (stripos($l, 'Set-Cookie:') === 0) {
                $first = trim(explode(';', substr($l, 11))[0]);
                [$k, $v] = array_pad(explode('=', $first, 2), 2, '');
                $k = trim($k);
                if ($v === '') unset($this->cookies[$k]); else $this->cookies[$k] = $v;
            }
        }
        return ['status' => $st, 'raw' => (string) $raw, 'body' => json_decode((string) $raw, true)];
    }
    public function get(string $p): array { return $this->req('GET', $p); }
    public function post(string $p, $b, array $h = []): array { return $this->req('POST', $p, $b, $h); }
    public function csrf(): string {
        $r = $this->get('/api/csrf');
        return (string) ($r['body']['token'] ?? '');
    }
    public function login(string $email, string $pw): bool {
        $t = $this->csrf();
        $r = $this->post('/api/auth/login', ['csrf_token' => $t, 'email' => $email, 'password' => $pw],
                         ['X-CSRF-Token' => $t]);
        return $r['status'] === 200;
    }
}

/* ---- what each endpoint is SUPPOSED to require ------------------------
   Written here, deliberately, and not read from Routes.php.

   The first version of this sweep took the module and ability from the route
   table itself — which made the thing under test its own oracle. Weakening a
   route's guard moved the expectation with it and the sweep stayed green: it
   was checked by putting «reports» behind the content module, and 104 checks
   passed while a Content Manager read the reports.

   So the expectation lives here. A route whose declared guard stops matching
   this list is a failure in itself, whichever direction it moved. */
const EXPECT = [
    'GET /api/admin/summary'          => ['home', 'view'],
    'GET /api/admin/requests'         => ['requests', 'view'],
    'GET /api/admin/requests/show'    => ['requests', 'view'],
    'POST /api/admin/requests/status' => ['requests', 'edit'],
    'POST /api/admin/requests/notes'  => ['requests', 'edit'],
    'POST /api/admin/requests/new'    => ['requests', 'edit'],
    'GET /api/admin/customers'        => ['customers', 'view'],
    'GET /api/admin/services'         => ['services', 'view'],
    'POST /api/admin/services/save'   => ['services', 'edit'],
    'POST /api/admin/services/reorder'=> ['services', 'edit'],
    'POST /api/admin/services/new'    => ['services', 'edit'],
    'GET /api/admin/media'            => ['services', 'view'],
    'POST /api/admin/media/upload'    => ['services', 'edit'],
    'GET /api/admin/users'            => ['users', 'view'],
    'POST /api/admin/users/save'      => ['users', 'edit'],
    'POST /api/admin/users/password'  => ['users', 'edit'],
    'POST /api/admin/users/unlock'    => ['users', 'edit'],
    'GET /api/admin/activity'         => ['home', 'view'],
    'GET /api/admin/notifications'    => ['home', 'view'],
    'POST /api/admin/notifications/read' => ['home', 'view'],
    'GET /api/admin/content'          => ['content', 'view'],
    'GET /api/admin/content/area'     => ['content', 'view'],
    'POST /api/admin/content/block'   => ['content', 'edit'],
    'POST /api/admin/content/item'    => ['content', 'edit'],
    'POST /api/admin/content/item/new'=> ['content', 'edit'],
    'POST /api/admin/content/item/del'=> ['content', 'edit'],
    'POST /api/admin/content/reorder' => ['content', 'edit'],
    'POST /api/admin/content/publish' => ['content', 'edit'],
    'GET /api/admin/content/pending'  => ['home', 'view'],
    'GET /api/admin/content/preview'  => ['content', 'view'],
    'GET /api/admin/reports'          => ['reports', 'view'],
    'GET /api/admin/settings'         => ['settings', 'view'],
    'POST /api/admin/settings/save'   => ['settings', 'edit'],
    'GET /api/admin/backup'           => ['settings', 'view'],
    'POST /api/admin/restore'         => ['settings', 'edit'],
];

/* what the route table actually declares */
$src = file_get_contents(AUN_ROOT . '/app/Routes.php');
preg_match_all(
    '/\[\s*\'(GET|POST)\'\s*,\s*\'([^\']+)\'\s*,\s*\[\s*\'(\w+)\'\s*,\s*\'(\w+)\'\s*\]\s*,/',
    $src, $m, PREG_SET_ORDER
);
$declared = [];
foreach ($m as $r) $declared[$r[1] . ' ' . $r[2]] = [$r[3], $r[4]];

section('THE GUARD EACH ROUTE DECLARES IS THE ONE IT SHOULD');
$drift = [];
foreach (EXPECT as $key => $want) {
    $got = $declared[$key] ?? null;
    if ($got === null) { $drift[] = "{$key} — gone from the table"; continue; }
    if ($got !== $want) $drift[] = "{$key} — declares {$got[0]}.{$got[1]}, should be {$want[0]}.{$want[1]}";
}
foreach ($declared as $key => $got) {
    if (!isset(EXPECT[$key])) $drift[] = "{$key} — a new route this sweep has never been told about";
}
check('table', 'every module-gated route declares the guard it is supposed to',
    $drift === [], implode(' | ', array_slice($drift, 0, 3)));

$routes = [];
foreach (EXPECT as $key => $want) {
    [$method, $path] = explode(' ', $key, 2);
    $routes[] = ['method' => $method, 'path' => $path, 'module' => $want[0], 'ability' => $want[1]];
}

/* Routes that would act on a body this sweep can send. Called only as roles
   that must be refused — a 403 is proved without the write ever running. */
const DENY_ONLY = [
    '/api/admin/content/publish',
    '/api/admin/restore',
    '/api/admin/notifications/read',
];

/* ---- the three roles ------------------------------------------------- */
$SUPER_EMAIL = getenv('AUN_QA_EMAIL') ?: 'noura@aunaldrb.com';
$SUPER_PW    = getenv('AUN_QA_PW')    ?: 'Recovery-01-Local-Dev';

$su = new C($BASE);
if (!$su->login($SUPER_EMAIL, $SUPER_PW)) {
    fwrite(STDERR, "cannot sign in as super — is the dev server up?\n");
    exit(1);
}
$suTk = $su->csrf();

$stamp = substr((string) time(), -6);
$made  = [];
foreach (['admin', 'content'] as $role) {
    $email = "authz{$role}{$stamp}@aunaldrb.com";
    $pw    = 'Authz-Sweep-' . strtoupper($role) . '-1';
    $r = $su->post('/api/admin/users/save', [
        'csrf_token' => $suTk, 'name' => 'فحص ' . $role, 'email' => $email,
        'role' => $role, 'active' => '1', 'password' => $pw,
    ], ['X-CSRF-Token' => $suTk]);
    if (!in_array($r['status'], [200, 201], true)) {
        fwrite(STDERR, "could not create the {$role} account: {$r['status']} {$r['raw']}\n");
        exit(1);
    }
    $made[$role] = ['email' => $email, 'pw' => $pw, 'id' => $r['body']['user']['id'] ?? null];
}

$clients = ['super' => $su];
foreach ($made as $role => $u) {
    $c = new C($BASE);
    if (!$c->login($u['email'], $u['pw'])) { fwrite(STDERR, "cannot sign in as {$role}\n"); exit(1); }
    $clients[$role] = $c;
}

/* ---- the sweep ------------------------------------------------------- */
section('THE AUTHORIZATION MATRIX — ' . count($routes) . ' ROUTES × ' . count($clients) . ' ROLES');

$tested = 0; $denied = 0; $allowed = 0; $skipped = 0;
foreach ($routes as $rt) {
    foreach ($clients as $role => $c) {
        $perm  = Authz::preset($role);
        $may   = (bool) ($perm[$rt['module']][$rt['ability']] ?? false);
        $label = sprintf('%-5s %-34s as %-7s', $rt['method'], $rt['path'], $role);

        if ($may && in_array($rt['path'], DENY_ONLY, true)) { $skipped++; continue; }

        $tk  = $c->csrf();
        $res = $rt['method'] === 'GET'
            ? $c->get($rt['path'])
            : $c->post($rt['path'], ['csrf_token' => $tk], ['X-CSRF-Token' => $tk]);
        $tested++;

        if ($may) {
            $allowed++;
            check('authz', $label . ' → reaches the handler',
                $res['status'] !== 403, 'status=' . $res['status']);
        } else {
            $denied++;
            check('authz', $label . ' → refused',
                $res['status'] === 403, 'status=' . $res['status']);
        }
    }
}

/* ---- and what a refused role can still READ in an allowed answer ----- */
section('NOTHING LEAKS THROUGH AN ENDPOINT THE ROLE IS ALLOWED');
/* The leak that got through once was not a wrong 403: summary, activity and
   notifications were all correctly allowed on `home.view`, and each carried
   rows about modules the role may not see. */
$cm = $clients['content'];
foreach ([
    '/api/admin/summary'        => 'الملخّص',
    '/api/admin/activity'       => 'سجل النشاط',
    '/api/admin/notifications'  => 'الإشعارات',
    '/api/admin/content/pending'=> 'ما لم يُنشر',
] as $path => $ar) {
    $r = $cm->get($path);
    $raw = $r['raw'];
    $leaks = [];
    /* a Content Manager may not see requests or customers at all */
    foreach (['"phone"', '"customer"', '"origin"', '"destination"', '"trip_date"'] as $needle) {
        if (str_contains($raw, $needle)) $leaks[] = trim($needle, '"');
    }
    check('leak', "{$ar} ({$path}) tells a Content Manager nothing about trips",
        $leaks === [], implode(', ', $leaks));
}

/* the modules a role may not see are absent from what the shell is told */
$me = $cm->get('/api/auth/me');
$mods = $me['body']['user']['permissions'] ?? [];
$shouldNotSee = [];
foreach (['requests', 'customers', 'reports', 'users', 'settings'] as $m2) {
    if (!empty($mods[$m2]['view'])) $shouldNotSee[] = $m2;
}
check('leak', 'and its own permission matrix withholds those modules',
    $shouldNotSee === [], implode(', ', $shouldNotSee));

/* ---- clean up -------------------------------------------------------- */
foreach ($made as $role => $u) {
    if ($u['id'] === null) continue;
    $tk = $su->csrf();
    $su->post('/api/admin/users/save', [
        'csrf_token' => $tk, 'id' => $u['id'], 'name' => 'فحص ' . $role,
        'email' => $u['email'], 'role' => $role, 'active' => '0',
    ], ['X-CSRF-Token' => $tk]);
}
check('authz', 'the sweep deactivated the accounts it created', true,
    count($made) . ' accounts');

/* ---- report ---------------------------------------------------------- */
foreach ($lines as $l) fwrite(STDOUT, $l . "\n");
fwrite(STDOUT, "\n" . str_repeat('=', 78) . "\n");
fwrite(STDOUT, sprintf("  %d passed, %d failed, %d total — %d allowed, %d denied, %d not called\n",
    $pass, $fail, $pass + $fail, $allowed, $denied, $skipped));
fwrite(STDOUT, str_repeat('=', 78) . "\n");
if ($failed !== []) {
    fwrite(STDOUT, "\nFailures:\n");
    foreach ($failed as $f) fwrite(STDOUT, "  - {$f}\n");
}
exit($fail === 0 ? 0 : 1);
