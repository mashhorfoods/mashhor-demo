<?php
/**
 * RECOVERY 01 — the §30, §31 and §32 test matrices, executed rather than
 * asserted.  Usage:  php bin/verify.php http://127.0.0.1:8088
 *
 * Every case drives the real HTTP endpoints through the real database. It
 * creates its own scratch data and checks what actually landed in the tables,
 * because "the endpoint returned 201" and "a row exists" are different claims
 * and §32 asks for the second one.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$BASE = rtrim($argv[1] ?? 'http://127.0.0.1:8088', '/');

/* ------------------------------------------------------------------ */
/* a tiny HTTP client with its own cookie jar, so sessions are real    */
/* ------------------------------------------------------------------ */
final class Client
{
    public array $cookies = [];
    public function __construct(private string $base) {}

    public function request(string $method, string $path, $body = null, array $headers = []): array
    {
        $url = $this->base . $path;
        $h   = ['Accept: application/json'];
        foreach ($headers as $k => $v) $h[] = "{$k}: {$v}";
        if ($this->cookies !== []) {
            $pairs = [];
            foreach ($this->cookies as $k => $v) $pairs[] = "{$k}={$v}";
            $h[] = 'Cookie: ' . implode('; ', $pairs);
        }
        $opts = ['http' => [
            'method'        => $method,
            'header'        => $h,
            'ignore_errors' => true,
            'timeout'       => 15,
        ]];
        if ($body !== null) {
            if (is_array($body)) {
                $opts['http']['header'][] = 'Content-Type: application/json';
                $opts['http']['content']  = json_encode($body, JSON_UNESCAPED_UNICODE);
            } else {
                $opts['http']['header'][] = 'Content-Type: application/x-www-form-urlencoded';
                $opts['http']['content']  = $body;
            }
        }
        $raw = @file_get_contents($url, false, stream_context_create($opts));
        $status = 0;
        $setCookies = [];
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) $status = (int) $m[1];
            if (stripos($line, 'Set-Cookie:') === 0) $setCookies[] = substr($line, 11);
        }
        foreach ($setCookies as $c) {
            $first = trim(explode(';', $c)[0]);
            [$k, $v] = array_pad(explode('=', $first, 2), 2, '');
            $k = trim($k);
            if ($v === '' ) unset($this->cookies[$k]); else $this->cookies[$k] = $v;
        }
        $json = $raw === false ? null : json_decode($raw, true);
        return ['status' => $status, 'body' => $json, 'raw' => (string) $raw, 'cookies' => $setCookies];
    }

    public function get(string $p, array $h = []): array  { return $this->request('GET', $p, null, $h); }
    public function post(string $p, $b, array $h = []): array { return $this->request('POST', $p, $b, $h); }

    /** Fetch a CSRF token into this client's jar and return it. */
    public function csrf(): string
    {
        $r = $this->get('/api/csrf');
        return (string) ($r['body']['token'] ?? '');
    }
}

/* ------------------------------------------------------------------ */
$pass = 0; $fail = 0; $lines = [];

function check(string $group, string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail, $lines;
    $ok ? $pass++ : $fail++;
    $lines[] = sprintf('  %s %-58s %s', $ok ? 'PASS' : 'FAIL', $name, $detail);
    if (!$ok) $GLOBALS['failed'][] = "{$group} / {$name} {$detail}";
}
function section(string $t): void { global $lines; $lines[] = "\n" . $t; }
$failed = [];

/**
 * The public endpoint is rate limited per IP, and this suite deliberately
 * sends far more submissions from one address than a person ever would. That
 * is the limiter working, not a bug — so the bucket is cleared between phases,
 * and the limiter gets a test of its own at the end instead.
 */
function clearRateBucket(): void
{
    Db::run('DELETE FROM rate_hits');
}

$stamp = substr((string) time(), -6);
$PHONE = '05' . str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
$TOMORROW = gmdate('Y-m-d', time() + 86400);

/* ================================================================== */
section('§33  DEPLOYMENT / HEALTH');
/* ================================================================== */
$anon = new Client($BASE);
$h = $anon->get('/api/health');
check('health', 'GET /api/health answers 200', $h['status'] === 200, "status={$h['status']}");
check('health', 'database connected', (bool) ($h['body']['db']['connected'] ?? false));
check('health', 'schema complete', ($h['body']['db']['missingTables'] ?? ['?']) === []);
check('health', 'health body carries no credential values',
    !preg_match('/(DB_PASS|password)"\s*:\s*"[^"]+"/i', $h['raw'])
    && !str_contains($h['raw'], 'aun.sqlite'));
check('health', 'password hashing is argon2id or bcrypt',
    in_array($h['body']['hashing'] ?? '', ['argon2id', 'bcrypt'], true), (string) ($h['body']['hashing'] ?? ''));

/* ================================================================== */
section('§31  PUBLIC REQUEST API — POST /api/requests');
/* ================================================================== */
$pub = new Client($BASE);
$token = $pub->csrf();
check('requests', 'GET /api/csrf issues a token', preg_match('/^[0-9a-f]{64}$/', $token) === 1);

$valid = [
    'csrf_token' => $token, 'name' => 'مستفيد الاختبار ' . $stamp, 'phone' => $PHONE,
    'service' => 'النقل بواسطة الكرسي المتحرك', 'from' => 'حي الملقا، الرياض',
    'to' => 'مستشفى الملك فيصل التخصصي', 'date' => $TOMORROW, 'time' => '09:30',
    'notes' => 'ملاحظة اختبار',
];
$r = $pub->post('/api/requests', http_build_query($valid));
$ref = (string) ($r['body']['id'] ?? '');
check('requests', 'valid submission is accepted', $r['status'] === 201, "status={$r['status']}");
check('requests', 'a request id is returned', preg_match('/^REQ-\d{4}-\d{4,}$/', $ref) === 1, $ref);
check('requests', 'status is جديد (new)', ($r['body']['status'] ?? '') === 'new');

/* §32 — the record must actually be in the database, not merely reported */
$row = Repo_Requests::findByRef($ref);
check('persistence', 'record exists in the database', $row !== null);
check('persistence', 'stored status is new', $row !== null && $row['status'] === 'new');
check('persistence', 'stored source is website', $row !== null && $row['source'] === 'website');
check('persistence', 'notes were preserved verbatim', $row !== null && $row['notes'] === 'ملاحظة اختبار');
check('persistence', 'trip time preserved', $row !== null && $row['trip_time'] === '09:30');

/* §17 — customer association */
$cust = Repo_Customers::findByPhone($PHONE);
check('customer', 'customer created and linked', $cust !== null && $row !== null
    && (int) $row['customer_id'] === (int) $cust['id']);
check('customer', 'phone stored in canonical 05XXXXXXXX form',
    $cust !== null && preg_match('/^05\d{8}$/', (string) $cust['phone']) === 1, (string) ($cust['phone'] ?? ''));

/* the opening history row and the notification */
$hist = $row === null ? [] : Repo_Requests::history((int) $row['id']);
check('audit', 'opening status-history row written', count($hist) === 1 && $hist[0]['to_status'] === 'new');
check('audit', 'history records the website form as actor',
    count($hist) === 1 && $hist[0]['actor_label'] === 'نموذج الموقع');
check('audit', 'activity_log row written for the creation',
    (int) Db::value('SELECT COUNT(*) FROM activity_log WHERE target_id = ? AND action = ?', [$ref, 'create']) === 1);
check('audit', 'notification created for the new request',
    (int) Db::value('SELECT COUNT(*) FROM notifications WHERE dedupe_key = ?', ['new:' . $ref]) === 1);

/* §19 — duplicate submission */
$pub2 = new Client($BASE);
$t2 = $pub2->csrf();
$dup = $pub2->post('/api/requests', http_build_query(array_merge($valid, ['csrf_token' => $t2])));
check('duplicate', 'identical resubmission is not a second record',
    ($dup['body']['id'] ?? '') === $ref && ($dup['body']['duplicate'] ?? false) === true, (string) ($dup['body']['id'] ?? ''));
check('duplicate', 'only one row exists for that trip',
    (int) Db::value('SELECT COUNT(*) FROM requests WHERE ref = ?', [$ref]) === 1);

/* a genuinely different trip from the same customer must NOT be merged */
$other = array_merge($valid, ['csrf_token' => $t2, 'to' => 'مركز التأهيل الشامل']);
$r3 = $pub2->post('/api/requests', http_build_query($other));
check('duplicate', 'a different destination is a new request',
    ($r3['body']['id'] ?? '') !== $ref && $r3['status'] === 201, (string) ($r3['body']['id'] ?? ''));
check('customer', 'the second request reuses the same customer',
    (int) Db::value('SELECT COUNT(*) FROM customers WHERE phone = ?', [$PHONE]) === 1);

/* §14 — validation */
clearRateBucket();
$before = (int) Db::value('SELECT COUNT(*) FROM requests');
$cases = [
    'missing name'        => ['name' => ''],
    'missing phone'       => ['phone' => ''],
    'malformed phone'     => ['phone' => '12345'],
    'unknown service'     => ['service' => 'خدمة غير معتمدة'],
    'impossible date'     => ['date' => '2026-02-30'],
    'past date'           => ['date' => '2020-01-01'],
    'malformed time'      => ['time' => '99:99'],
    'missing destination' => ['to' => ''],
];
foreach ($cases as $label => $override) {
    clearRateBucket();
    $c = new Client($BASE);
    $tk = $c->csrf();
    $res = $c->post('/api/requests', http_build_query(array_merge($valid, $override, [
        'csrf_token' => $tk, 'from' => 'حي النرجس، الرياض ' . $label,
    ])));
    check('validation', "rejected: {$label}", $res['status'] === 422, "status={$res['status']}");
    check('validation', "field error returned: {$label}", !empty($res['body']['errors']));
}
clearRateBucket();
$unknown = new Client($BASE);
$tk = $unknown->csrf();
$res = $unknown->post('/api/requests', http_build_query(array_merge($valid, [
    'csrf_token' => $tk, 'status' => 'confirmed',
])));
check('validation', 'rejected: unexpected field in payload', $res['status'] === 422, "status={$res['status']}");
$res = $unknown->post('/api/requests', ['csrf_token' => $tk, 'name' => ['array']]);
check('validation', 'rejected: wrong data type', $res['status'] === 422, "status={$res['status']}");
check('validation', 'no record was created by any rejected submission',
    (int) Db::value('SELECT COUNT(*) FROM requests') === $before,
    'before=' . $before . ' after=' . Db::value('SELECT COUNT(*) FROM requests'));

/* §15 — a public caller cannot choose a status */
check('status', 'public submissions can never be created confirmed',
    (int) Db::value("SELECT COUNT(*) FROM requests WHERE source='website' AND status<>'new' AND id NOT IN (SELECT request_id FROM request_status_history WHERE actor_user_id IS NOT NULL)") === 0);

/* CSRF */
clearRateBucket();
$noCsrf = new Client($BASE);
$res = $noCsrf->post('/api/requests', http_build_query(array_merge($valid, ['csrf_token' => ''])));
check('csrf', 'submission without a token is rejected', $res['status'] === 419, "status={$res['status']}");

/* honeypot */
clearRateBucket();
$hp = new Client($BASE);
$tk = $hp->csrf();
$countBefore = (int) Db::value('SELECT COUNT(*) FROM requests');
$res = $hp->post('/api/requests', http_build_query(array_merge($valid, [
    'csrf_token' => $tk, 'website' => 'http://spam.example', 'from' => 'حي الياسمين',
])));
check('abuse', 'honeypot submission writes no record',
    (int) Db::value('SELECT COUNT(*) FROM requests') === $countBefore);

/* §24 — the limiter must actually stop a flood */
clearRateBucket();
$limit = Env::int('REQUESTS_RATE_PER_HOUR', 8);
$flood = new Client($BASE);
$ft = $flood->csrf();
$blocked = false;
for ($i = 0; $i <= $limit + 1; $i++) {
    $res = $flood->post('/api/requests', http_build_query(array_merge($valid, [
        'csrf_token' => $ft, 'from' => 'حي الاختبار رقم ' . $i,
    ])));
    if ($res['status'] === 429) { $blocked = true; break; }
}
check('abuse', 'repeated submissions are throttled', $blocked, "limit={$limit}");
check('abuse', 'the throttle response leaks nothing',
    !str_contains($res['raw'] ?? '', 'rate_hits'));
clearRateBucket();

/* ================================================================== */
section('§30  AUTHENTICATION MATRIX');
/* ================================================================== */
$EMAIL = 'noura@aunaldrb.com';
$PW    = 'Recovery-01-Local-Dev';

/* invalid login */
clearRateBucket();
$bad = new Client($BASE);
$tk  = $bad->csrf();
$res = $bad->post('/api/auth/login', ['csrf_token' => $tk, 'email' => $EMAIL, 'password' => 'wrong-password']);
check('auth', 'invalid password is rejected', $res['status'] === 401, "status={$res['status']}");
check('auth', 'no session cookie issued on failure',
    !array_key_exists('aun_sid', $bad->cookies) || $bad->cookies['aun_sid'] === '');
check('auth', 'failure message does not distinguish account existence',
    ($res['body']['error']['message'] ?? '') === 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');

$ghost = new Client($BASE);
$tk = $ghost->csrf();
$res2 = $ghost->post('/api/auth/login', ['csrf_token' => $tk, 'email' => 'nobody@aunaldrb.com', 'password' => 'whatever12345']);
check('auth', 'unknown account gives the identical response',
    $res2['status'] === $res['status']
    && ($res2['body']['error']['message'] ?? '') === ($res['body']['error']['message'] ?? ''));

/* unauthenticated API */
$anon2 = new Client($BASE);
foreach (['/api/admin/requests', '/api/admin/customers', '/api/admin/users',
          '/api/admin/activity', '/api/admin/settings', '/api/admin/summary'] as $p) {
    $res = $anon2->get($p);
    check('protected-api', "unauthenticated GET {$p} rejected", $res['status'] === 401, "status={$res['status']}");
    check('protected-api', "no data leaked by {$p}", empty($res['body']['rows']) && empty($res['body']['counts']));
}
$res = $anon2->post('/api/admin/requests/status', ['id' => $ref, 'status' => 'confirmed']);
check('protected-api', 'unauthenticated status change rejected', in_array($res['status'], [401, 419], true), "status={$res['status']}");
check('protected-api', 'status unchanged after the rejected call',
    (string) Db::value('SELECT status FROM requests WHERE ref = ?', [$ref]) === 'new');

/* valid login */
$admin = new Client($BASE);
$tk = $admin->csrf();
$res = $admin->post('/api/auth/login', ['csrf_token' => $tk, 'email' => $EMAIL, 'password' => $PW]);
check('auth', 'valid login succeeds', $res['status'] === 200, "status={$res['status']}");
check('auth', 'session cookie issued', !empty($admin->cookies['aun_sid']));
check('auth', 'response never carries a password hash',
    !str_contains($res['raw'], 'password_hash') && !str_contains($res['raw'], '$2y$') && !str_contains($res['raw'], '$argon'));
check('auth', 'session cookie is HttpOnly',
    (bool) count(array_filter($res['cookies'], static fn($c) => str_contains($c, 'aun_sid=') && stripos($c, 'HttpOnly') !== false)));
check('auth', 'session cookie is SameSite=Lax',
    (bool) count(array_filter($res['cookies'], static fn($c) => str_contains($c, 'aun_sid=') && stripos($c, 'SameSite=Lax') !== false)));
check('auth', 'role reported is super', ($res['body']['user']['role'] ?? '') === 'super');

$me = $admin->get('/api/auth/me');
check('session', 'session is recognised by a protected route', $me['status'] === 200, "status={$me['status']}");

/* §32 — the session survives a new client that presents the same cookie */
$reopened = new Client($BASE);
$reopened->cookies = $admin->cookies;
$again = $reopened->get('/api/auth/me');
check('session', 'session persists across a fresh connection', $again['status'] === 200);

/* authorized admin work */
$adminTk = $admin->csrf();
$list = $admin->get('/api/admin/requests?per=5');
check('protected-api', 'authorized list request succeeds', $list['status'] === 200 && isset($list['body']['rows']));

$res = $admin->post('/api/admin/requests/status',
    ['csrf_token' => $adminTk, 'id' => $ref, 'status' => 'review']);
check('authz', 'authorized status change succeeds', $res['status'] === 200, "status={$res['status']}");
check('persistence', 'status change persisted to the database',
    (string) Db::value('SELECT status FROM requests WHERE ref = ?', [$ref]) === 'review');
check('audit', 'status change recorded with the real actor',
    (string) Db::value('SELECT actor_label FROM request_status_history WHERE request_id = ? ORDER BY id DESC LIMIT 1',
        [(int) $row['id']]) === 'نورة العتيبي');

/* an illegal transition is refused by the server, not merely hidden */
$res = $admin->post('/api/admin/requests/status',
    ['csrf_token' => $adminTk, 'id' => $ref, 'status' => 'nonexistent']);
check('authz', 'unknown status rejected', $res['status'] === 422, "status={$res['status']}");

/* a content manager may not touch requests */
$cmEmail = "content{$stamp}@aunaldrb.com";
$cmPw    = 'Content-Manager-Test-1';
$res = $admin->post('/api/admin/users/save', [
    'csrf_token' => $adminTk, 'name' => 'مدير المحتوى للاختبار',
    'email' => $cmEmail, 'role' => 'content', 'active' => '1', 'password' => $cmPw,
]);
check('authz', 'super admin can create an account', $res['status'] === 201, "status={$res['status']}");

$cm = new Client($BASE);
$tk = $cm->csrf();
$res = $cm->post('/api/auth/login', ['csrf_token' => $tk, 'email' => $cmEmail, 'password' => $cmPw]);
check('authz', 'content manager can sign in', $res['status'] === 200, "status={$res['status']}");
$cmTk = $cm->csrf();

$res = $cm->get('/api/admin/requests');
check('authz', 'authenticated but unauthorized read is 403', $res['status'] === 403, "status={$res['status']}");
check('authz', 'no request data leaked to the wrong role', empty($res['body']['rows']));
$res = $cm->post('/api/admin/requests/status', ['csrf_token' => $cmTk, 'id' => $ref, 'status' => 'confirmed']);
check('authz', 'authenticated but unauthorized write is 403', $res['status'] === 403, "status={$res['status']}");
check('authz', 'the unauthorized write changed nothing',
    (string) Db::value('SELECT status FROM requests WHERE ref = ?', [$ref]) === 'review');
$res = $cm->get('/api/admin/users');
check('authz', 'content manager cannot list users', $res['status'] === 403, "status={$res['status']}");
$res = $cm->get('/api/admin/services');
check('authz', 'content manager CAN read services', $res['status'] === 200, "status={$res['status']}");

/* §10 — the guards a frontend cannot enforce */
$meRow = Repo_Users::findByEmail($EMAIL);
$res = $admin->post('/api/admin/users/save', [
    'csrf_token' => $adminTk, 'id' => (int) $meRow['id'], 'name' => 'نورة العتيبي',
    'email' => $EMAIL, 'role' => 'admin', 'active' => '1',
]);
check('authz', 'an operator cannot change their own role', $res['status'] === 409, "status={$res['status']}");
check('authz', 'role unchanged after that attempt',
    (string) Db::value('SELECT role FROM users WHERE id = ?', [(int) $meRow['id']]) === 'super');

/* §09 — logout */
$res = $admin->post('/api/auth/logout', ['csrf_token' => $adminTk]);
check('logout', 'logout succeeds', $res['status'] === 200, "status={$res['status']}");
$res = $admin->get('/api/auth/me');
check('logout', 'session rejected after logout', $res['status'] === 401, "status={$res['status']}");

/* the critical one: an old cookie must not work again (§09) */
$stale = new Client($BASE);
$stale->cookies = ['aun_sid' => $reopened->cookies['aun_sid'] ?? ''];
$res = $stale->get('/api/admin/requests');
check('logout', 'a previously valid cookie is dead after logout', $res['status'] === 401, "status={$res['status']}");

/* forged and expired sessions */
$forged = new Client($BASE);
$forged->cookies = ['aun_sid' => str_repeat('a', 64)];
$res = $forged->get('/api/auth/me');
check('session', 'a forged session token is rejected', $res['status'] === 401, "status={$res['status']}");

$admin2 = new Client($BASE);
$tk = $admin2->csrf();
$admin2->post('/api/auth/login', ['csrf_token' => $tk, 'email' => $EMAIL, 'password' => $PW]);
$sid = hash('sha256', (string) $admin2->cookies['aun_sid']);
Db::run('UPDATE sessions SET expires_at = ? WHERE id = ?', [gmdate('Y-m-d H:i:s', time() - 60), $sid]);
$res = $admin2->get('/api/admin/requests');
check('session', 'an expired session is rejected', $res['status'] === 401, "status={$res['status']}");

/* a disabled account's live session dies with it */
$cmRow = Repo_Users::findByEmail($cmEmail);
Db::run('UPDATE users SET is_active = 0 WHERE id = ?', [(int) $cmRow['id']]);
$res = $cm->get('/api/admin/services');
check('session', 'disabling an account kills its live session', $res['status'] === 401, "status={$res['status']}");

/* ================================================================== */
section('§20 §26  ERROR AND DISCLOSURE SAFETY');
/* ================================================================== */
$probe = new Client($BASE);
$leaky = ['SQLSTATE', 'PDOException', 'Stack trace', '/home/', 'aun.sqlite', 'password_hash',
          '$2y$', '$argon2', 'DB_PASS', 'Fatal error', 'Warning:', 'on line'];
$probes = [
    ['GET',  '/api/admin/requests?status=%27%20OR%201%3D1--'],
    ['GET',  '/api/admin/requests/show?id=%27%20OR%20%271%27%3D%271'],
    ['GET',  '/api/nope'],
    ['POST', '/api/requests'],
];
foreach ($probes as [$m, $p]) {
    $res = $probe->request($m, $p, $m === 'POST' ? '' : null);
    $found = [];
    foreach ($leaky as $needle) if (stripos($res['raw'], $needle) !== false) $found[] = $needle;
    check('disclosure', "no internals leaked by {$m} {$p}", $found === [], implode(',', $found));
}
$res = $probe->get('/api/admin/requests?status=%27%20OR%201%3D1--');
check('injection', 'injected filter returns no rows rather than everything',
    in_array($res['status'], [200, 401], true) && empty($res['body']['rows']));

/* the app directory must never be served */
foreach (['/app/Db.php', '/app/bootstrap.php', '/.env', '/app/.env'] as $p) {
    $res = $probe->get($p);
    $exposed = $res['status'] === 200 && (str_contains($res['raw'], '<?php') || str_contains($res['raw'], 'DB_PASS'));
    check('disclosure', "not served: {$p}", !$exposed, "status={$res['status']}");
}

/* ================================================================== */
section('§32  PERSISTENCE ACROSS A RESTART');
/* ================================================================== */
Db::reset();
$after = Repo_Requests::findByRef($ref);
check('persistence', 'request survives a fresh database connection', $after !== null);
check('persistence', 'its status change survived too', $after !== null && $after['status'] === 'review');
check('persistence', 'the customer survived', Repo_Customers::findByPhone($PHONE) !== null);
check('persistence', 'the activity log survived',
    (int) Db::value('SELECT COUNT(*) FROM activity_log WHERE target_id = ?', [$ref]) >= 2);

/* ================================================================== */
foreach ($lines as $l) fwrite(STDOUT, $l . "\n");
fwrite(STDOUT, "\n" . str_repeat('=', 78) . "\n");
fwrite(STDOUT, sprintf("  %d passed, %d failed, %d total\n", $pass, $fail, $pass + $fail));
fwrite(STDOUT, str_repeat('=', 78) . "\n");
if ($failed !== []) {
    fwrite(STDOUT, "\nFailures:\n");
    foreach ($failed as $f) fwrite(STDOUT, "  - {$f}\n");
}
exit($fail === 0 ? 0 : 1);
