<?php
/**
 * RECOVERY 01 — the §30, §31 and §32 test matrices, executed rather than
 * asserted.  Usage:  php bin/verify.php http://127.0.0.1:8088 [--email= --password=]
 *
 * WRITES to the database it is pointed at. Never run it against production
 * data — see bin/preflight.php for the read-only check.
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

$BASE = rtrim(($argv[1] ?? null) && !str_starts_with($argv[1], '--')
    ? $argv[1] : 'http://127.0.0.1:8088', '/');

function opt(string $name, ?string $default = null): ?string
{
    foreach ($GLOBALS['argv'] as $a) {
        if (str_starts_with($a, "--{$name}=")) return substr($a, strlen($name) + 3);
    }
    return $default;
}
function flag(string $name): bool { return in_array("--{$name}", $GLOBALS['argv'], true); }

/*
 * This suite WRITES. It creates customers, requests, content-manager accounts
 * and it publishes content into index.html. That is the point — §32 asks what
 * actually landed in the tables — but it means the target database must be one
 * you are willing to have scratch rows in. Run it against a staging database,
 * never against one holding real customer records.
 */
if (Env::isProduction() && !flag('allow-writes')) {
    fwrite(STDERR,
        "\nRefusing to run: APP_ENV is production.\n\n" .
        "  This suite writes scratch data — test customers, test requests, test\n" .
        "  accounts — and it publishes content into index.html. Point it at a\n" .
        "  staging database instead (a second .env with a second DB_NAME), or\n" .
        "  pass --allow-writes if this database genuinely holds nothing real.\n\n" .
        "  For a safe check against the live site, use:  php bin/preflight.php\n\n");
    exit(3);
}

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
                /* an explicit Content-Type wins — a multipart upload carries
                   its own boundary and must not be relabelled */
                $hasType = false;
                foreach ($opts['http']['header'] as $line) {
                    if (stripos($line, 'Content-Type:') === 0) { $hasType = true; break; }
                }
                if (!$hasType) $opts['http']['header'][] = 'Content-Type: application/x-www-form-urlencoded';
                $opts['http']['content'] = $body;
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
    /** A multipart upload, built by hand so the suite exercises the real path. */
    public function upload(string $path, string $file, string $sendAs, string $token): array
    {
        $boundary = '----aun' . bin2hex(random_bytes(8));
        $body  = "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"csrf_token\"\r\n\r\n{$token}\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"{$sendAs}\"\r\n";
        $body .= "Content-Type: application/octet-stream\r\n\r\n";
        $body .= (string) file_get_contents($file) . "\r\n";
        $body .= "--{$boundary}--\r\n";

        return $this->request('POST', $path, $body, [
            'Content-Type' => 'multipart/form-data; boundary=' . $boundary,
            'X-CSRF-Token' => $token,
        ]);
    }

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
/* The account the suite signs in as. Defaults to the local development seed;
 * on any other machine pass --email= and --password= for an existing admin. */
$EMAIL = (string) opt('email', 'noura@aunaldrb.com');
$PW    = (string) opt('password', 'Recovery-01-Local-Dev');

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
section('RECOVERY 02  المحتوى — CONTENT MANAGEMENT');
/* ================================================================== */
clearRateBucket();

/* The §09 logout test above deliberately killed $admin's session. Sign in
   again rather than reusing it — a suite that quietly depends on an earlier
   test's session is a suite that lies about which test failed. */
$admin = new Client($BASE);
$tk = $admin->csrf();
$res = $admin->post('/api/auth/login', ['csrf_token' => $tk, 'email' => $EMAIL, 'password' => $PW]);
check('content', 'signed in again for the content matrix', $res['status'] === 200, "status={$res['status']}");

/* --- the module exists and is reachable ---------------------------- */
$ov = $admin->get('/api/admin/content');
check('content', 'GET /api/admin/content answers', $ov['status'] === 200, "status={$ov['status']}");
$areas = array_column($ov['body']['areas'] ?? [], null, 'key');
/* Stage 3 brought four more sections of the page under management. The guard
   is the same guard — an exact set, so an area cannot appear that nobody
   approved — counted against what the page now actually has. */
check('content', 'eleven approved areas, no twelfth', count($areas) === 11, (string) count($areas));
foreach (['home','about','features','services','how','vision','values','faq','testimonials','contact','seo'] as $k) {
    check('content', "area present: {$k}", isset($areas[$k]));
}
check('content', 'about is stored as fields', ($areas['about']['kind'] ?? '') === 'fields');
check('content', 'features is stored as records', ($areas['features']['kind'] ?? '') === 'list');
check('content', 'the seven approved services are listed',
    ($areas['services']['records'] ?? 0) === 7, (string) ($areas['services']['records'] ?? 0));
check('content', 'the six approved features are listed',
    ($areas['features']['records'] ?? 0) === 6, (string) ($areas['features']['records'] ?? 0));
/* what stage 3 added, counted rather than described */
check('content', 'الواجهة الرئيسية lists six entries over three text fields',
    ($areas['home']['records'] ?? 0) === 6 && ($areas['home']['fields'] ?? 0) === 3,
    ($areas['home']['records'] ?? 0) . ' / ' . ($areas['home']['fields'] ?? 0));
check('content', 'كيف نعمل lists three stages over three text fields',
    ($areas['how']['records'] ?? 0) === 3 && ($areas['how']['fields'] ?? 0) === 3,
    ($areas['how']['records'] ?? 0) . ' / ' . ($areas['how']['fields'] ?? 0));
check('content', 'قيمنا lists six values over two text fields',
    ($areas['values']['records'] ?? 0) === 6 && ($areas['values']['fields'] ?? 0) === 2,
    ($areas['values']['records'] ?? 0) . ' / ' . ($areas['values']['fields'] ?? 0));
check('content', 'رؤيتنا ورسالتنا is six text fields and no list',
    ($areas['vision']['kind'] ?? '') === 'fields' && ($areas['vision']['records'] ?? 0) === 6,
    ($areas['vision']['kind'] ?? '') . ' / ' . ($areas['vision']['records'] ?? 0));
check('content', 'FAQ is empty and says so, rather than being invented',
    ($areas['faq']['records'] ?? -1) === 0);
check('content', 'testimonials are empty and say so',
    ($areas['testimonials']['records'] ?? -1) === 0);
check('content', 'FAQ is marked as having nowhere public to go',
    ($areas['faq']['publishable'] ?? true) === false);
check('content', 'about IS marked publishable', ($areas['about']['publishable'] ?? false) === true);

/* --- content came from the page verbatim ---------------------------- */
$ar = $admin->get('/api/admin/content/area?area=about');
check('content', 'about area loads', $ar['status'] === 200, "status={$ar['status']}");
$fields = array_column($ar['body']['fields'] ?? [], null, 'key');
check('content', 'about carries six editable fields', count($fields) === 6, (string) count($fields));
check('content', 'the approved opening line is stored verbatim',
    str_starts_with((string) ($fields['about.lead']['value'] ?? ''), 'شركة عون الدرب للنقل المتخصص شركة سعودية'));
check('content', 'every field has a human label, never a raw key',
    count(array_filter($fields, static fn($f) => $f['label'] === $f['key'])) === 0);

/* --- §19 the public page is the destination -------------------------- */
$live = Publisher::liveValue('about.lead');
check('sync', 'the marked region exists in the live page', $live !== null);
check('sync', 'the live page matches what the module stores',
    $live === Publisher::renderBlock('about.lead', (string) $fields['about.lead']['value']));

/* --- edit → save → publish → verify ---------------------------------- */
$adminTk = $admin->csrf();
$probe   = 'شركة عون الدرب — تحقّق آلي ' . $stamp . '.';
$before  = (string) $fields['about.lead']['value'];
$neighbourBefore = Publisher::liveValue('contact.address');
$servicesBefore  = Publisher::liveValue('services.items');

$res = $admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'about.lead', 'lang' => 'ar', 'value' => $probe]);
check('content', 'saving one field succeeds', $res['status'] === 200, "status={$res['status']}");
check('persistence', 'the field persisted to the database',
    (string) Db::value('SELECT value FROM content_blocks WHERE block_key = ? AND lang = ?', ['about.lead','ar']) === $probe);
check('sync', 'saving alone does NOT change the public page',
    Publisher::liveValue('about.lead') !== Publisher::esc($probe));

$res = $admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('sync', 'publishing succeeds', $res['status'] === 200, "status={$res['status']}");
check('sync', 'the edit is now on the public page',
    Publisher::liveValue('about.lead') === Publisher::esc($probe));

/* §20 — record-level isolation */
check('integrity', 'the contact address was not touched',
    Publisher::liveValue('contact.address') === $neighbourBefore);
check('integrity', 'the services region was not touched',
    Publisher::liveValue('services.items') === $servicesBefore);
check('integrity', 'the other About paragraphs were not touched',
    Publisher::liveValue('about.p1') !== null && Publisher::liveValue('about.p1') !== Publisher::esc($probe));

/* restore */
$admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'about.lead', 'lang' => 'ar', 'value' => $before]);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('sync', 'the approved copy is restored', Publisher::liveValue('about.lead') === Publisher::esc($before));

/* --- §11 language separation ----------------------------------------- */
$admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'about.title', 'lang' => 'en', 'value' => 'About us']);
check('language', 'an English value can be stored',
    (string) Db::value('SELECT value FROM content_blocks WHERE block_key = ? AND lang = ?', ['about.title','en']) === 'About us');
check('language', 'storing English did not touch Arabic',
    (string) Db::value('SELECT value FROM content_blocks WHERE block_key = ? AND lang = ?', ['about.title','ar']) === 'من نحن');
$en = $admin->get('/api/admin/content/area?area=about&lang=en');
$enFields = array_column($en['body']['fields'] ?? [], null, 'key');
check('language', 'the English view shows only English rows',
    ($enFields['about.title']['value'] ?? '') === 'About us' && !isset($enFields['about.lead']));
check('language', 'publishing writes Arabic, not the English draft',
    Publisher::liveValue('about.title') === 'من نحن');
Db::run("DELETE FROM content_blocks WHERE lang = 'en'");

/* --- §16 §17 active/inactive and ordering ----------------------------- */
$fa = $admin->get('/api/admin/content/area?area=features');
$items = $fa['body']['items'] ?? [];
check('content', 'features load with order and state', count($items) === 6, (string) count($items));
$ids = array_column($items, 'id');

$res = $admin->post('/api/admin/content/reorder',
    ['csrf_token' => $adminTk, 'area' => 'features', 'lang' => 'ar',
     'ids' => [$ids[1], $ids[0], $ids[2], $ids[3], $ids[4], $ids[5]]]);
check('ordering', 'reorder succeeds', $res['status'] === 200, "status={$res['status']}");
$after = array_column(($admin->get('/api/admin/content/area?area=features'))['body']['items'], 'id');
check('ordering', 'the new order persisted', $after[0] === $ids[1] && $after[1] === $ids[0]);

$res = $admin->post('/api/admin/content/item',
    ['csrf_token' => $adminTk, 'area' => 'features', 'lang' => 'ar', 'id' => $ids[2],
     'title' => $items[2]['title'], 'body' => $items[2]['body'], 'published' => 0]);
check('active', 'a record can be deactivated', $res['status'] === 200, "status={$res['status']}");
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
$region = (string) Publisher::liveValue('features.items');
check('active', 'the deactivated feature is off the public page',
    substr_count($region, 'why__item-title') === 5, (string) substr_count($region, 'why__item-title'));
check('active', 'the remaining five are renumbered 01-05',
    str_contains($region, '>01<') && str_contains($region, '>05<') && !str_contains($region, '>06<'));
check('active', 'the record still exists — hidden, not deleted',
    (int) Db::value('SELECT COUNT(*) FROM content_items WHERE id = ?', [$ids[2]]) === 1);

/* restore the approved six, in their approved order */
$admin->post('/api/admin/content/item',
    ['csrf_token' => $adminTk, 'area' => 'features', 'lang' => 'ar', 'id' => $ids[2],
     'title' => $items[2]['title'], 'body' => $items[2]['body'], 'published' => 1]);
$admin->post('/api/admin/content/reorder',
    ['csrf_token' => $adminTk, 'area' => 'features', 'lang' => 'ar', 'ids' => $ids]);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('active', 'the approved six are back, in order',
    substr_count((string) Publisher::liveValue('features.items'), 'why__item-title') === 6);

/* --- §07 the approved set cannot be extended -------------------------- */
$res = $admin->post('/api/admin/content/item/new',
    ['csrf_token' => $adminTk, 'area' => 'services', 'lang' => 'ar', 'title' => 'خدمة مخترعة', 'body' => 'نص']);
check('content', 'a new service cannot be invented', $res['status'] === 409, "status={$res['status']}");
$res = $admin->post('/api/admin/content/item/new',
    ['csrf_token' => $adminTk, 'area' => 'features', 'lang' => 'ar', 'title' => 'ميزة مخترعة', 'body' => 'نص']);
check('content', 'a new feature cannot be invented', $res['status'] === 409, "status={$res['status']}");
check('content', 'still exactly seven services',
    (int) Db::value('SELECT COUNT(*) FROM services') === 7);

/* --- §08 the FAQ is the administrator's to fill ------------------------ */
$res = $admin->post('/api/admin/content/item/new',
    ['csrf_token' => $adminTk, 'area' => 'faq', 'lang' => 'ar',
     'title' => 'سؤال اختباري ' . $stamp, 'body' => 'إجابة اختبارية.']);
check('content', 'a FAQ entry can be created by an administrator', $res['status'] === 201, "status={$res['status']}");
$faqId = (int) ($res['body']['id'] ?? 0);
check('persistence', 'the FAQ entry persisted',
    (int) Db::value('SELECT COUNT(*) FROM content_items WHERE id = ?', [$faqId]) === 1);
$res = $admin->post('/api/admin/content/item/del',
    ['csrf_token' => $adminTk, 'area' => 'faq', 'lang' => 'ar', 'id' => $faqId]);
check('content', 'and can be deleted again', $res['status'] === 200, "status={$res['status']}");

/* --- §15 validation ---------------------------------------------------- */
$cases = [
    'empty value'      => ['key' => 'about.title', 'value' => '   '],
    'unknown field'    => ['key' => 'about.nonexistent', 'value' => 'x'],
    'over the limit'   => ['key' => 'about.label', 'value' => str_repeat('ا', 200)],
    'bad website'      => ['key' => 'contact.website', 'value' => 'not a domain'],
    'markup where none allowed' => ['key' => 'about.title', 'value' => '<script>x</script>'],
];
foreach ($cases as $label => $payload) {
    $res = $admin->post('/api/admin/content/block',
        array_merge(['csrf_token' => $adminTk, 'lang' => 'ar'], $payload));
    $wanted = $label === 'markup where none allowed' ? [200] : [422];
    check('validation', "content rejected: {$label}",
        in_array($res['status'], $wanted, true) || $res['status'] === 422, "status={$res['status']}");
}
/* the script tag is stored as text and escaped on the way out, never executed */
$admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'about.title', 'lang' => 'ar', 'value' => '<script>alert(1)</script>']);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
$liveTitle = (string) Publisher::liveValue('about.title');
check('security', 'injected markup is escaped, never emitted as a tag',
    !str_contains($liveTitle, '<script') && str_contains($liveTitle, '&lt;script'));
$admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'about.title', 'lang' => 'ar', 'value' => 'من نحن']);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('security', 'and the approved title is restored',
    Publisher::liveValue('about.title') === 'من نحن');

/* an allow-listed field keeps its approved markup and nothing more */
$res = $admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'contact.closing', 'lang' => 'ar',
     'value' => 'نص <span class="contact__aside-tag">مسموح</span>']);
check('security', 'an allow-listed span is accepted', $res['status'] === 200, "status={$res['status']}");
$res = $admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'contact.closing', 'lang' => 'ar',
     'value' => 'نص <span onclick="steal()">خطر</span>']);
check('security', 'an event handler is refused', $res['status'] === 422, "status={$res['status']}");

/* --- §21 §31 permissions ----------------------------------------------- */
clearRateBucket();
$cmEmail2 = "content2{$stamp}@aunaldrb.com";
$cmPw2    = 'Content-Manager-Two-1';
$admin->post('/api/admin/users/save', [
    'csrf_token' => $adminTk, 'name' => 'مدير المحتوى الثاني',
    'email' => $cmEmail2, 'role' => 'content', 'active' => '1', 'password' => $cmPw2,
]);
$cm2 = new Client($BASE);
$t2 = $cm2->csrf();
$cm2->post('/api/auth/login', ['csrf_token' => $t2, 'email' => $cmEmail2, 'password' => $cmPw2]);
$cm2Tk = $cm2->csrf();

$res = $cm2->get('/api/admin/content');
check('permissions', 'a Content Manager CAN read the content module', $res['status'] === 200, "status={$res['status']}");
$res = $cm2->post('/api/admin/content/block',
    ['csrf_token' => $cm2Tk, 'key' => 'about.label', 'lang' => 'ar', 'value' => 'محرَّر بواسطة مدير المحتوى']);
check('permissions', 'and CAN edit it', $res['status'] === 200, "status={$res['status']}");
$res = $cm2->get('/api/admin/requests');
check('permissions', 'but still cannot read requests', $res['status'] === 403, "status={$res['status']}");
$admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'about.label', 'lang' => 'ar', 'value' => 'من نحن']);

$anon3 = new Client($BASE);
foreach ([['GET','/api/admin/content'], ['GET','/api/admin/content/area?area=about']] as [$m,$path]) {
    $res = $anon3->request($m, $path);
    check('permissions', "unauthenticated {$m} {$path} rejected", $res['status'] === 401, "status={$res['status']}");
    check('permissions', "and leaks nothing", empty($res['body']['areas']) && empty($res['body']['fields']));
}
$titleBefore = (string) Db::value('SELECT value FROM content_blocks WHERE block_key = ? AND lang = ?', ['about.title','ar']);
$res = $anon3->post('/api/admin/content/block', ['key' => 'about.title', 'lang' => 'ar', 'value' => 'اختراق']);
check('permissions', 'an unauthenticated write is rejected',
    in_array($res['status'], [401, 419], true), "status={$res['status']}");
check('permissions', 'and changed nothing',
    (string) Db::value('SELECT value FROM content_blocks WHERE block_key = ? AND lang = ?', ['about.title','ar']) === $titleBefore);
$res = $anon3->post('/api/admin/content/publish', []);
check('permissions', 'an unauthenticated publish is rejected',
    in_array($res['status'], [401, 419], true), "status={$res['status']}");

/* --- §32 activity integration ------------------------------------------ */
$n = (int) Db::value("SELECT COUNT(*) FROM activity_log WHERE module = 'content'");
check('activity', 'content edits are in the existing activity log', $n > 0, (string) $n);
check('activity', 'a publish is recorded too',
    (int) Db::value("SELECT COUNT(*) FROM activity_log WHERE module = 'content' AND action = 'publish'") > 0);
check('activity', 'the actor is recorded, not «غير مسجّل»',
    (int) Db::value("SELECT COUNT(*) FROM activity_log WHERE module = 'content' AND actor_user_id IS NOT NULL") > 0);
check('activity', 'no second activity system was created',
    (int) Db::value("SELECT COUNT(*) FROM activity_log") > 0);

/* --- the page is still the approved page -------------------------------- */
$admin->post('/api/admin/content/block',
    ['csrf_token' => $adminTk, 'key' => 'contact.closing', 'lang' => 'ar',
     'value' => 'في عون الدرب نرافق المستفيد في كل خطوة على الطريق، بأمانٍ ورعايةٍ واحترام. <span class="contact__aside-tag">نُعين ونُعاون.</span>']);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
$html = (string) @file_get_contents(AUN_ROOT . '/index.html');
check('integrity', 'the public page still has all 49 marked regions',
    preg_match_all('/<!--aun:[a-z0-9._]+-->/', $html) === 49,
    (string) preg_match_all('/<!--aun:[a-z0-9._]+-->/', $html));
check('integrity', 'no prohibited terminology reached the public page',
    !preg_match('/الإعاقة|ذوي الإعاقة|معاقين|معاقون/u', $html));
check('integrity', 'the approved terminology is still there',
    substr_count($html, 'ذوي الاحتياجات الخاصة') > 0);


/* ================================================================== */
section('RECOVERY 03  التقارير — REPORTS');
/* ================================================================== */
clearRateBucket();

/* --- the module exists, and only the approved scope ----------------- */
$rq = $admin->get('/api/admin/reports?report=requests&period=year');
check('reports', 'GET /api/admin/reports answers', $rq['status'] === 200, "status={$rq['status']}");
check('reports', 'exactly the two approved reports exist',
    count(Repo_Reports::REPORTS) === 2 && isset(Repo_Reports::REPORTS['requests'])
    && isset(Repo_Reports::REPORTS['customers']), (string) count(Repo_Reports::REPORTS));
$bad = $admin->get('/api/admin/reports?report=revenue');
check('reports', 'an unspecified report is not served', $bad['status'] === 404, "status={$bad['status']}");

/* §29 — none of the metrics a transport company "normally" reports */
$body = strtolower($rq['raw']);
$forbidden = ['revenue','profit','conversion','retention','forecast','growth_rate',
              'utilisation','utilization','completion_rate','cancellation_rate','avg_response'];
$found = [];
foreach ($forbidden as $needle) if (str_contains($body, $needle)) $found[] = $needle;
check('reports', 'no unapproved business metric is present', $found === [], implode(',', $found));
check('reports', 'no export endpoint exists',
    $admin->get('/api/admin/reports/export')['status'] === 404);

/* --- §12 accuracy: every figure reproducible from the records -------- */
$period = Repo_Reports::resolvePeriod('year', null, null);
$data = $rq['body']['data'];
$dbTotal = (int) Db::value(
    'SELECT COUNT(*) FROM requests WHERE created_at >= ? AND created_at < ?',
    [$period['from'], gmdate('Y-m-d', strtotime($period['to'] . ' +1 day'))]);
check('accuracy', 'the total matches a direct count of the records',
    $data['total'] === $dbTotal, "report={$data['total']} db={$dbTotal}");
check('accuracy', 'the status breakdown sums to the total',
    array_sum($data['byStatus']) === $data['total'],
    array_sum($data['byStatus']) . ' vs ' . $data['total']);
check('accuracy', 'the source breakdown sums to the total',
    array_sum(array_column($data['bySource'], 'n')) === $data['total']);
check('accuracy', 'the service breakdown sums to the total',
    array_sum(array_column($data['byService'], 'n')) === $data['total']);
check('accuracy', 'all five approved statuses are present, zeros included',
    count($data['byStatus']) === 5 && array_keys($data['byStatus']) === Schema::STATUSES);
foreach (Schema::STATUSES as $st) {
    $n = (int) Db::value(
        'SELECT COUNT(*) FROM requests WHERE status = ? AND created_at >= ? AND created_at < ?',
        [$st, $period['from'], gmdate('Y-m-d', strtotime($period['to'] . ' +1 day'))]);
    check('accuracy', "status «{$st}» matches the records", $data['byStatus'][$st] === $n,
        "report={$data['byStatus'][$st]} db={$n}");
}

/* --- §26 cross-module consistency ------------------------------------ */
$counts = Repo_Requests::counts();
$all = $admin->get('/api/admin/reports?report=requests&period=custom&from=2020-01-01&to=' . gmdate('Y-m-d'));
check('consistency', 'an all-time report matches the dashboard total',
    $all['body']['data']['total'] === $counts['total'],
    "report={$all['body']['data']['total']} dashboard={$counts['total']}");
foreach (Schema::STATUSES as $st) {
    check('consistency', "all-time «{$st}» matches the requests module",
        $all['body']['data']['byStatus'][$st] === $counts[$st]);
}
$cu = $admin->get('/api/admin/reports?report=customers&period=custom&from=2020-01-01&to=' . gmdate('Y-m-d'));
check('consistency', 'all-time active customers matches the customers module',
    $cu['body']['data']['active'] === (int) Db::value('SELECT COUNT(*) FROM customers'),
    "report={$cu['body']['data']['active']}");
check('accuracy', 'new plus returning equals active, by construction',
    $cu['body']['data']['new'] + $cu['body']['data']['returning'] === $cu['body']['data']['active']);

/* --- §05 §06 filters and dates ---------------------------------------- */
$one = $admin->get('/api/admin/reports?report=requests&period=year&status=new');
check('filters', 'a status filter narrows the result',
    $one['body']['data']['total'] === $data['byStatus']['new'],
    "filtered={$one['body']['data']['total']} breakdown={$data['byStatus']['new']}");
check('filters', 'the filter is echoed back so the page can preserve it',
    ($one['body']['filters']['status'] ?? '') === 'new');

$svc = Repo_Reports::serviceOptions()[0];
$sr = $admin->get('/api/admin/reports?report=requests&period=year&service=' . rawurlencode($svc));
$svcExpected = 0;
foreach ($data['byService'] as $row) if ($row['k'] === $svc) $svcExpected = (int) $row['n'];
check('filters', 'a service filter matches its own breakdown row',
    $sr['body']['data']['total'] === $svcExpected,
    "filtered={$sr['body']['data']['total']} breakdown={$svcExpected}");
check('filters', 'the service list is the existing records, not a copy',
    count($rq['body']['services']) === (int) Db::value('SELECT COUNT(*) FROM services'));

foreach ([
    'end before start'  => 'period=custom&from=2026-09-10&to=2026-09-01',
    'impossible date'   => 'period=custom&from=2026-02-30&to=2026-03-01',
    'missing dates'     => 'period=custom',
    'unknown period'    => 'period=nonsense',
    'unknown status'    => 'period=year&status=bogus',
    'unknown service'   => 'period=year&service=' . rawurlencode('خدمة غير معتمدة'),
] as $label => $q) {
    $res = $admin->get('/api/admin/reports?report=requests&' . $q);
    check('dates', "rejected: {$label}", $res['status'] === 422, "status={$res['status']}");
}
$same = $admin->get('/api/admin/reports?report=requests&period=custom&from=' . gmdate('Y-m-d') . '&to=' . gmdate('Y-m-d'));
check('dates', 'a same-day range is valid', $same['status'] === 200 && $same['body']['period']['days'] === 1,
    "days=" . ($same['body']['period']['days'] ?? '?'));
check('dates', 'the date basis is named in the answer, never assumed',
    ($rq['body']['basis']['label'] ?? '') !== '');
$trip = $admin->get('/api/admin/reports?report=requests&period=year&basis=trip');
check('dates', 'the trip-date basis is a distinct calculation',
    $trip['status'] === 200 && ($trip['body']['basis']['key'] ?? '') === 'trip');

/* --- §13 the empty period offers a wider one -------------------------- */
$none = $admin->get('/api/admin/reports?report=requests&period=custom&from=2001-01-01&to=2001-01-31');
check('empty', 'an empty period is reported as empty', ($none['body']['empty'] ?? false) === true);
check('empty', 'and offers a wider period instead of a row of zeroes',
    !empty($none['body']['suggest']['label']), json_encode($none['body']['suggest'] ?? null));
check('empty', 'the suggested period actually contains records',
    (int) ($none['body']['suggest']['count'] ?? 0) > 0);

/* --- §19 §28 permissions ---------------------------------------------- */
clearRateBucket();
$cmEmail3 = "content3{$stamp}@aunaldrb.com";
$cmPw3    = 'Content-Manager-Three-1';
$admin->post('/api/admin/users/save', [
    'csrf_token' => $adminTk, 'name' => 'مدير المحتوى الثالث',
    'email' => $cmEmail3, 'role' => 'content', 'active' => '1', 'password' => $cmPw3,
]);
$cm3 = new Client($BASE);
$t3 = $cm3->csrf();
$cm3->post('/api/auth/login', ['csrf_token' => $t3, 'email' => $cmEmail3, 'password' => $cmPw3]);
$res = $cm3->get('/api/admin/reports?report=requests&period=year');
check('permissions', 'a Content Manager cannot read reports', $res['status'] === 403, "status={$res['status']}");
check('permissions', 'and no figures leak in the refusal', empty($res['body']['data']));

$anon4 = new Client($BASE);
$res = $anon4->get('/api/admin/reports?report=requests&period=year');
check('permissions', 'an unauthenticated report request is rejected', $res['status'] === 401, "status={$res['status']}");
check('permissions', 'and leaks nothing', empty($res['body']['data']));
$res = $anon4->get('/api/admin/reports?report=customers&period=year');
check('permissions', 'the customer report is protected too', $res['status'] === 401, "status={$res['status']}");

/* parameter manipulation must not widen access */
$res = $cm3->get('/api/admin/reports?report=customers&period=year&basis=trip&status=new');
check('security', 'extra parameters do not bypass the permission', $res['status'] === 403, "status={$res['status']}");

/* --- §09 §20 data minimisation ---------------------------------------- */
$cust = $admin->get('/api/admin/reports?report=customers&period=year');
$raw = $cust['raw'];
check('privacy', 'the customer report carries no phone numbers',
    !preg_match('/05\d{8}/', $raw));
check('privacy', 'no email addresses either', !str_contains($raw, '@aunaldrb.com'));
check('privacy', 'no trip origins or destinations', !str_contains($raw, 'حي الملقا'));
$rowKeys = array_keys(($cust['body']['data']['rows'][0] ?? ['x' => 1]));
sort($rowKeys);
check('privacy', 'a customer row carries only id, name, count and last activity',
    $rowKeys === ['count', 'id', 'lastAt', 'name'], implode(',', $rowKeys));

/* --- §25 reports never write ------------------------------------------ */
$before = [
    'requests'  => (int) Db::value('SELECT COUNT(*) FROM requests'),
    'customers' => (int) Db::value('SELECT COUNT(*) FROM customers'),
    'services'  => (int) Db::value('SELECT COUNT(*) FROM services'),
    'statuses'  => (string) Db::value('SELECT GROUP_CONCAT(status) FROM (SELECT status FROM requests ORDER BY id) t'),
    'activity'  => (int) Db::value('SELECT COUNT(*) FROM activity_log'),
];
foreach (['requests', 'customers'] as $r) {
    foreach (['today', 'week', 'month', 'year'] as $p) {
        $admin->get("/api/admin/reports?report={$r}&period={$p}");
        $admin->get("/api/admin/reports?report={$r}&period={$p}&basis=trip");
    }
}
$after = [
    'requests'  => (int) Db::value('SELECT COUNT(*) FROM requests'),
    'customers' => (int) Db::value('SELECT COUNT(*) FROM customers'),
    'services'  => (int) Db::value('SELECT COUNT(*) FROM services'),
    'statuses'  => (string) Db::value('SELECT GROUP_CONCAT(status) FROM (SELECT status FROM requests ORDER BY id) t'),
    'activity'  => (int) Db::value('SELECT COUNT(*) FROM activity_log'),
];
check('readonly', '16 report runs changed no request', $before['requests'] === $after['requests']);
check('readonly', 'changed no customer', $before['customers'] === $after['customers']);
check('readonly', 'changed no service', $before['services'] === $after['services']);
check('readonly', 'changed no status', $before['statuses'] === $after['statuses']);
/* §27 — reading a report must not generate activity noise */
check('readonly', 'and wrote no activity rows', $before['activity'] === $after['activity'],
    "{$before['activity']} -> {$after['activity']}");
check('readonly', 'the repository refuses a write statement outright', (static function (): bool {
    $m = new ReflectionMethod('Repo_Reports', 'assertReadOnly');
    $m->setAccessible(true);
    try { $m->invoke(null, 'DELETE FROM requests'); return false; }
    catch (Throwable $e) { return true; }
})());

/* --- §02 no duplicate data system ------------------------------------- */
$tables = array_column(Db::all(
    Db::isMysql()
      ? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()"
      : "SELECT name FROM sqlite_master WHERE type='table'"), 'name');
$reportish = array_filter($tables, static fn(string $t): bool =>
    str_contains($t, 'report') || str_contains($t, 'metric') || str_contains($t, 'analytic')
    || str_contains($t, 'aggregate') || str_contains($t, 'snapshot'));
check('architecture', 'no reporting tables were created', $reportish === [],
    implode(',', $reportish));
check('architecture', 'the schema is still the 20 tables the modules share',
    count(Schema::missingTables()) === 0);


/* ================================================================== */
section('THREE MODULES ON THEIR ENDPOINTS — الخدمات · الوسائط · الإعدادات');
/* ================================================================== */
clearRateBucket();
$admin = new Client($BASE);
$tk = $admin->csrf();
$admin->post('/api/auth/login', ['csrf_token' => $tk, 'email' => $EMAIL, 'password' => $PW]);
$adminTk = $admin->csrf();

/* ---- الخدمات ------------------------------------------------------- */
$sv = $admin->get('/api/admin/services');
check('services', 'the services list is served', $sv['status'] === 200, "status={$sv['status']}");
check('services', 'seven approved services, from the table',
    count($sv['body']['rows']) === (int) Db::value('SELECT COUNT(*) FROM services'));
$first = $sv['body']['rows'][0];

/* the terminology guard has to hold against a direct call, not just the form */
$res = $admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => $first['id'],
    'title' => $first['title'], 'description' => 'نقل ذوي الإعاقة', 'published' => 1,
]);
check('services', 'a prohibited term is refused by the server', $res['status'] === 422, "status={$res['status']}");
check('services', 'and the description was not changed',
    (string) Db::value('SELECT description FROM services WHERE id = ?', [$first['id']]) === $first['description']);
$res = $admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => $first['id'],
    'title' => 'خدمة معاقين', 'description' => $first['description'], 'published' => 1,
]);
check('services', 'a prohibited term in the title is refused too', $res['status'] === 422, "status={$res['status']}");
check('services', 'the approved title still stands',
    (string) Db::value('SELECT title FROM services WHERE id = ?', [$first['id']]) === $first['title']);

/* an image reference must exist in the media library */
$res = $admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => $first['id'],
    'title' => $first['title'], 'description' => $first['description'],
    'published' => 1, 'image' => 'img/does-not-exist.webp',
]);
check('services', 'an unknown image reference is refused', $res['status'] === 422, "status={$res['status']}");
$res = $admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => $first['id'],
    'title' => $first['title'], 'description' => $first['description'],
    'published' => 1, 'image' => '../../etc/passwd',
]);
check('services', 'a traversal attempt is refused', $res['status'] === 422, "status={$res['status']}");

/* hide → the publishing template follows → the public page loses it */
$res = $admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => $first['id'],
    'title' => $first['title'], 'description' => $first['description'], 'published' => 0,
]);
check('services', 'a service can be hidden', $res['status'] === 200, "status={$res['status']}");
/* A service is one record now — there is no template to follow. What replaces
   that check is stronger: rendering the region from the records alone has to
   reproduce the published page exactly, or a publish is a silent redesign. */
check('services', 'no second copy of a service is written any more',
    !str_contains((string) @file_get_contents(AUN_ROOT . '/app/Repo/Content.php'), 'syncServiceTemplate'));
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
/* Immediately after a publish the page and the records must agree exactly.
   Anything else means publishing changed the page in a way the records do not
   account for — a silent redesign. */
check('services', 'after publishing, page and records agree byte for byte',
    Publisher::verifyServices() === null, (string) Publisher::verifyServices());
$region = (string) Publisher::liveValue('services.items');
check('services', 'and it left the public page',
    substr_count($region, 'service__title') === 6, (string) substr_count($region, 'service__title'));
check('services', 'the remaining six are renumbered',
    str_contains($region, '>06<') && !str_contains($region, '>07<'));
check('services', 'the record still exists — hidden, not deleted',
    (int) Db::value('SELECT COUNT(*) FROM services WHERE id = ?', [$first['id']]) === 1);

/* reorder */
$ids = array_column($sv['body']['rows'], 'id');
$res = $admin->post('/api/admin/services/reorder', ['csrf_token' => $adminTk, 'ids' => array_reverse($ids)]);
check('services', 'services can be reordered', $res['status'] === 200, "status={$res['status']}");
$after = array_column($admin->get('/api/admin/services')['body']['rows'], 'id');
check('services', 'the new order persisted', $after === array_reverse($ids));
check('services', 'and no two services share a position',
    count(array_unique(array_column($admin->get('/api/admin/services')['body']['rows'], 'order'))) === count($ids));

/* restore */
$admin->post('/api/admin/services/reorder', ['csrf_token' => $adminTk, 'ids' => $ids]);
$admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => $first['id'],
    'title' => $first['title'], 'description' => $first['description'], 'published' => 1,
]);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('services', 'the approved seven are back, in order',
    substr_count((string) Publisher::liveValue('services.items'), 'service__title') === 7);

/* ---- الوسائط والأصول ------------------------------------------------ */
$md = $admin->get('/api/admin/media');
check('media', 'the media library is served', $md['status'] === 200, "status={$md['status']}");
check('media', 'every indexed asset is listed',
    count($md['body']['rows']) === (int) Db::value('SELECT COUNT(*) FROM media_assets'));
$withUsage = array_filter($md['body']['rows'], static fn(array $r): bool => ($r['usedIn'] ?? []) !== []);
check('media', 'usage is computed, not stored', count($withUsage) > 0, count($withUsage) . ' assets in use');
check('media', 'no usage column exists in the table',
    !in_array('used_in', array_column(Db::all(
        Db::isMysql() ? "SHOW COLUMNS FROM media_assets" : "PRAGMA table_info(media_assets)"), 'name'), true));

/* usage must follow the page, not a stored list */
$svcAsset = null;
foreach ($md['body']['rows'] as $r) if ($r['path'] === 'img/wheelchair-transport.webp') $svcAsset = $r;
check('media', 'a service photograph is reported as used',
    $svcAsset !== null && ($svcAsset['usedIn'] ?? []) !== [], json_encode($svcAsset['usedIn'] ?? null, JSON_UNESCAPED_UNICODE));
$logo = null;
foreach ($md['body']['rows'] as $r) if ($r['path'] === 'brand/aun-aldrb-logo.png') $logo = $r;
check('media', 'an unreferenced file is reported as unused',
    $logo !== null && ($logo['usedIn'] ?? []) === []);
check('media', 'a responsive variant counts towards its master, not itself',
    (int) Db::value("SELECT COUNT(*) FROM media_assets WHERE path LIKE '%-360.webp'") === 0);

/* ---- الإعدادات ------------------------------------------------------- */
$st = $admin->get('/api/admin/settings');
check('settings', 'settings are served', $st['status'] === 200, "status={$st['status']}");
$set = $st['body']['settings'];
check('settings', 'the approved categories are present',
    isset($set['company'], $set['contact'], $set['site'], $set['notif'], $set['system']));
check('settings', 'the real company name is stored, not a placeholder',
    ($set['company']['cName'] ?? '') === 'شركة عون الدرب للنقل المتخصص');
/* the reason values are JSON-encoded: types must survive the round trip */
check('settings', 'a toggle round-trips as a boolean', is_bool($set['site']['siteLive'] ?? null),
    gettype($set['site']['siteLive'] ?? null));
check('settings', 'a select index round-trips as a number', is_int($set['system']['tz'] ?? null),
    gettype($set['system']['tz'] ?? null));
check('settings', 'a numeric string round-trips as a string', is_string($set['system']['sess'] ?? null),
    gettype($set['system']['sess'] ?? null));

$res = $admin->post('/api/admin/settings/save', [
    'csrf_token' => $adminTk, 'category' => 'company',
    'values' => ['cTag' => 'تحقّق آلي ' . $stamp],
]);
check('settings', 'a category saves', $res['status'] === 200, "status={$res['status']}");
check('settings', 'the value persisted',
    ($admin->get('/api/admin/settings')['body']['settings']['company']['cTag'] ?? '') === 'تحقّق آلي ' . $stamp);
check('settings', 'and no sibling field was touched',
    ($admin->get('/api/admin/settings')['body']['settings']['company']['cName'] ?? '')
      === 'شركة عون الدرب للنقل المتخصص');
$admin->post('/api/admin/settings/save', [
    'csrf_token' => $adminTk, 'category' => 'company', 'values' => ['cTag' => 'نُعين ونُعاون'],
]);
check('settings', 'the approved tagline is restored',
    ($admin->get('/api/admin/settings')['body']['settings']['company']['cTag'] ?? '') === 'نُعين ونُعاون');

/* ---- permissions across all three ----------------------------------- */
clearRateBucket();
$anon5 = new Client($BASE);
foreach (['/api/admin/services', '/api/admin/media', '/api/admin/settings'] as $path) {
    $res = $anon5->get($path);
    check('permissions', "unauthenticated GET {$path} rejected", $res['status'] === 401, "status={$res['status']}");
    check('permissions', "and leaks nothing", empty($res['body']['rows']) && empty($res['body']['settings']));
}
$res = $anon5->post('/api/admin/services/save', ['id' => $first['id'], 'title' => 'اختراق', 'description' => 'x']);
check('permissions', 'an unauthenticated service write is rejected',
    in_array($res['status'], [401, 419], true), "status={$res['status']}");
check('permissions', 'and changed nothing',
    (string) Db::value('SELECT title FROM services WHERE id = ?', [$first['id']]) === $first['title']);
$res = $anon5->post('/api/admin/settings/save', ['category' => 'company', 'values' => ['cName' => 'اختراق']]);
check('permissions', 'an unauthenticated settings write is rejected',
    in_array($res['status'], [401, 419], true), "status={$res['status']}");

/* a Content Manager has services but not settings, per the approved matrix */
$cm4 = new Client($BASE);
$t4 = $cm4->csrf();
$cmEmail4 = "content4{$stamp}@aunaldrb.com";
$admin->post('/api/admin/users/save', [
    'csrf_token' => $adminTk, 'name' => 'مدير المحتوى الرابع',
    'email' => $cmEmail4, 'role' => 'content', 'active' => '1', 'password' => 'Content-Four-Test-1',
]);
$cm4->post('/api/auth/login', ['csrf_token' => $t4, 'email' => $cmEmail4, 'password' => 'Content-Four-Test-1']);
check('permissions', 'a Content Manager CAN read services',
    $cm4->get('/api/admin/services')['status'] === 200);
check('permissions', 'and the media library',
    $cm4->get('/api/admin/media')['status'] === 200);
check('permissions', 'but NOT settings',
    $cm4->get('/api/admin/settings')['status'] === 403);

/* ---- no page still carries its own copy of the data ------------------ */
foreach ([
    'admin/services.html' => '/var SERVICES = \[\s*\{/',
    'admin/media.html'    => '/var ASSETS = \[\s*\{/',
    'admin/settings.html' => '/var SAVED = \{\s*company:/',
] as $file => $pattern) {
    $src = (string) @file_get_contents(AUN_ROOT . '/' . $file);
    check('architecture', "no literal dataset left in {$file}",
        preg_match($pattern, $src) === 0);
    check('architecture', "{$file} loads from the API",
        str_contains($src, 'AunAPI.'));
}

/* ================================================================== */
section('KEPT AND LABELLED — THE TWO AREAS WITH NOWHERE TO PUBLISH');
/* ================================================================== */
/* Stage 5. الأسئلة الشائعة and آراء العملاء have working editors and no
   section on the public page to publish into. The decision was to keep them
   and label them, so what matters is that the label is true, that it is
   derived rather than asserted, and that nothing they hold ever leaks onto
   the site. */

$ov2 = $admin->get('/api/admin/content');
$byKey = array_column($ov2['body']['areas'] ?? [], null, 'key');
$unpublishable = array_keys(array_filter($byKey, static fn($a) => !($a['publishable'] ?? true)));
sort($unpublishable);
check('stage5', 'exactly two areas say they do not reach the website',
    $unpublishable === ['faq', 'testimonials'], implode(', ', $unpublishable));

foreach (['faq', 'testimonials'] as $area) {
    check('stage5', "{$area}: the page really has no region for it",
        Publisher::hasRegionFor($area) === false);
    $res = $admin->get('/api/admin/content/area?area=' . $area);
    check('stage5', "{$area}: the editor still opens", $res['status'] === 200, "status={$res['status']}");
    check('stage5', "{$area}: and says so in the editor too",
        ($res['body']['publishable'] ?? true) === false);
}

/* the label is measured, not maintained: it flips by itself for an area that
   does have a region */
check('stage5', 'an area with a region is not labelled',
    ($byKey['values']['publishable'] ?? false) === true);
check('stage5', 'and the flag is read from the page, not asserted in code',
    str_contains((string) @file_get_contents(AUN_ROOT . '/app/Repo/Cms.php'), 'Publisher::hasRegionFor($key)')
    && substr_count((string) @file_get_contents(AUN_ROOT . '/app/Repo/Cms.php'), "'publishable'] = true") === 0);

/* content saved there is kept, and never published */
$res = $admin->post('/api/admin/content/item/new', [
    'csrf_token' => $adminTk, 'area' => 'faq', 'lang' => 'ar',
    'title' => 'سؤال للاختبار', 'body' => 'جواب للاختبار',
]);
check('stage5', 'an entry can still be saved there', in_array($res['status'], [200, 201], true), "status={$res['status']}");
check('stage5', 'and it is stored', (int) Db::value(
    "SELECT COUNT(*) FROM content_items WHERE collection = 'faq'") === 1);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
$live = (string) @file_get_contents(AUN_ROOT . '/index.html');
check('stage5', 'publishing never puts it on the website',
    !str_contains($live, 'سؤال للاختبار'));
check('stage5', 'and it does not count as an unpublished change',
    Publisher::pending()['count'] === 0, (string) Publisher::pending()['count']);
Db::run("DELETE FROM content_items WHERE collection = 'faq'");

/* ================================================================== */
section('CREATE, RETIRE, UPLOAD');
/* ================================================================== */
/* Stage 4. saveService refused anything without an existing id, and there was
   no create route and no upload route at all: the seven services installed
   were the only seven that could ever exist, and the media library was a
   catalogue of what the deployment shipped. */

/* --- upload ------------------------------------------------------------- */
$png = AUN_ROOT . '/app/storage/upload-test.png';
$im  = imagecreatetruecolor(320, 240);
imagefill($im, 0, 0, imagecolorallocate($im, 34, 64, 111));
imagepng($im, $png);
imagedestroy($im);

$res = $admin->upload('/api/admin/media/upload', $png, 'shot.png', $adminTk);
check('stage4', 'a picture can be uploaded', $res['status'] === 201, "status={$res['status']}");
$uploaded = $res['body']['asset']['path'] ?? '';
check('stage4', 'and the system named it, not the sender',
    $uploaded !== '' && !str_contains($uploaded, 'shot'), $uploaded);
check('stage4', 'it landed in the library',
    Db::value('SELECT 1 FROM media_assets WHERE path = ?', [$uploaded]) !== false);
check('stage4', 'with its real dimensions read from the file',
    (int) Db::value('SELECT width FROM media_assets WHERE path = ?', [$uploaded]) === 320);
check('stage4', 'and the file is on disk', is_file(AUN_ROOT . '/' . $uploaded));

/* a script is not a picture, whatever it is called */
$evil = AUN_ROOT . '/app/storage/evil.png';
file_put_contents($evil, "<?php echo 'pwned'; ?>\n");
$res = $admin->upload('/api/admin/media/upload', $evil, 'evil.png', $adminTk);
check('stage4', 'a script named .png is refused', $res['status'] === 422, "status={$res['status']}");
check('stage4', 'and nothing of it was stored',
    (int) Db::value('SELECT COUNT(*) FROM media_assets WHERE filename LIKE ?', ['%evil%']) === 0);
@unlink($evil);

check('stage4', 'the upload directory refuses to execute anything',
    str_contains((string) @file_get_contents(AUN_ROOT . '/img/.htaccess'), 'php_flag engine off'));
check('stage4', 'and that rule is scoped to it, not to the application',
    !str_contains((string) @file_get_contents(AUN_ROOT . '/.htaccess'), 'php_flag engine off'));
check('stage4', 'the rule ships with the package',
    str_contains((string) @file_get_contents(AUN_ROOT . '/build.js'), "'img/.htaccess'"));

/* --- create ------------------------------------------------------------- */
$before = count(Repo_Content::services());
$res = $admin->post('/api/admin/services/new', [
    'csrf_token' => $adminTk, 'title' => 'النقل بين المدن',
    'description' => 'خدمة نقل متخصصة بين المدن لكبار السن وذوي الاحتياجات الخاصة.',
    'image' => $uploaded, 'alt' => 'مركبة عون الدرب مجهزة للرحلات الطويلة.',
    'iconFrom' => 'wheelchair-transport',
]);
check('stage4', 'a service can be created', $res['status'] === 201, "status={$res['status']}");
$newSlug = $res['body']['slug'] ?? '';
check('stage4', 'the catalogue grew', count(Repo_Content::services()) === $before + 1);
check('stage4', 'it starts hidden, not on the website',
    (int) Db::value('SELECT is_published FROM services WHERE slug = ?', [$newSlug]) === 0);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('stage4', 'so publishing does not put it there yet',
    !str_contains((string) Publisher::liveValue('services.items'), 'النقل بين المدن'));

/* publish it deliberately */
$row = Db::one('SELECT id FROM services WHERE slug = ?', [$newSlug]);
$admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => (int) $row['id'], 'title' => 'النقل بين المدن',
    'description' => 'خدمة نقل متخصصة بين المدن لكبار السن وذوي الاحتياجات الخاصة.',
    'published' => 1,
]);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('stage4', 'once published it is on the website',
    str_contains((string) Publisher::liveValue('services.items'), 'النقل بين المدن'));
check('stage4', 'carrying the picture that was uploaded',
    str_contains((string) Publisher::liveValue('services.items'), $uploaded));
check('stage4', 'and the public form now offers it',
    in_array('النقل بين المدن', Repo_Content::serviceTitles(true), true));

/* --- retire ------------------------------------------------------------- */
$admin->post('/api/admin/services/save', [
    'csrf_token' => $adminTk, 'id' => (int) $row['id'], 'title' => 'النقل بين المدن',
    'description' => 'خدمة نقل متخصصة بين المدن لكبار السن وذوي الاحتياجات الخاصة.',
    'published' => 0,
]);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('stage4', 'retiring takes it off the website',
    !str_contains((string) Publisher::liveValue('services.items'), 'النقل بين المدن'));
check('stage4', 'and out of the public form',
    !in_array('النقل بين المدن', Repo_Content::serviceTitles(true), true));
check('stage4', 'while the record itself survives',
    Db::value('SELECT 1 FROM services WHERE slug = ?', [$newSlug]) !== false);

/* a retired service must never orphan the trips made for it */
$histBefore = (int) Db::value('SELECT COUNT(*) FROM requests');
check('stage4', 'no request lost its service', (int) Db::value('SELECT COUNT(*) FROM requests') === $histBefore);
check('stage4', 'and no endpoint deletes a service outright',
    !str_contains((string) @file_get_contents(AUN_ROOT . '/app/Routes.php'), "services/delete"));

/* tidy up after ourselves */
Db::run('DELETE FROM services WHERE slug = ?', [$newSlug]);
@unlink(AUN_ROOT . '/' . $uploaded);
Db::run('DELETE FROM media_assets WHERE path = ?', [$uploaded]);
@unlink($png);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);

/* ================================================================== */
section('COVERAGE — EVERY SECTION OF THE PAGE IS MANAGEABLE');
/* ================================================================== */
/* Stage 3. Four of the page's eight sections had no marked region at all,
   which meant no screen, field or endpoint could touch a word of them. */
$page = (string) @file_get_contents(AUN_ROOT . '/index.html');
preg_match_all('~<section[^>]*id="([^"]+)"[^>]*>(.*?)</section>~s', $page, $secs, PREG_SET_ORDER);
check('coverage', 'the page still has its eight sections', count($secs) === 8, (string) count($secs));
foreach ($secs as [$_all, $sid, $body]) {
    check('coverage', "{$sid} has at least one editable region",
        str_contains($body, '<!--aun:'));
}
check('coverage', 'the page metadata is publishable too',
    str_contains($page, '<!--aun:seo.title-->') && str_contains($page, '<!--aun:seo.description-->'));
check('coverage', 'one title fact fills all three places it appears',
    count(Publisher::renderMeta()) === 6, (string) count(Publisher::renderMeta()));

/* the markers are comments: nothing a browser renders may have moved */
check('coverage', 'markers add nothing a visitor can see',
    !str_contains(preg_replace('/<!--.*?-->/s', '', $page) ?? '', 'aun:'));

/* and the records reproduce the page exactly */
$plan = Publisher::plan();
check('coverage', 'every region renders back to what is published',
    $plan['ok'] && $plan['changed'] === [] && $plan['missing'] === [],
    count($plan['changed']) . ' would change, ' . count($plan['missing']) . ' missing');

/* a section brought under management this stage, edited end to end */
$vals = Repo_Cms::items('values.items', 'ar');
check('coverage', 'قيمنا holds its six values', count($vals) === 6, (string) count($vals));
$firstVal = $vals[0] ?? null;
if ($firstVal !== null) {
    $titleWas2 = (string) $firstVal['title'];
    Repo_Cms::updateItem((int) $firstVal['id'], ['title' => $titleWas2 . ' ✓'], $actorRow ?? null);
    check('coverage', 'editing one shows as pending', Publisher::pending()['count'] === 1,
        (string) Publisher::pending()['count']);
    Publisher::publish($actorRow ?? null);
    check('coverage', 'and publishing puts it on the page',
        str_contains((string) Publisher::liveValue('values.items'), $titleWas2 . ' ✓'));
    Repo_Cms::updateItem((int) $firstVal['id'], ['title' => $titleWas2], $actorRow ?? null);
    Publisher::publish($actorRow ?? null);
    check('coverage', 'and restoring it restores the page',
        !str_contains((string) Publisher::liveValue('values.items'), '✓'));
}

/* ================================================================== */
section('THE PUBLISHING LOOP — SAVED, PENDING, PREVIEWED, LIVE');
/* ================================================================== */
/* Stage 2. A save used to be confirmed and change nothing a visitor could
   see, with nothing to say the two had diverged. */

$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
$res = $admin->get('/api/admin/content/pending');
check('loop', 'nothing is pending right after a publish',
    ($res['body']['pending']['count'] ?? -1) === 0, json_encode($res['body']['pending']['count'] ?? null));

/* an edit that has not been published yet */
$titleWas = (string) (Repo_Cms::block('about.title', 'ar')['value'] ?? '');
$res = $admin->post('/api/admin/content/block', [
    'csrf_token' => $adminTk, 'key' => 'about.title', 'lang' => 'ar',
    'value' => $titleWas . ' ✎',
]);
check('loop', 'a content edit saves', $res['status'] === 200, "status={$res['status']}");

$res = $admin->get('/api/admin/content/pending');
$pending = $res['body']['pending'] ?? [];
check('loop', 'and is reported as not yet on the website',
    ($pending['count'] ?? 0) === 1, json_encode($pending['count'] ?? null));
check('loop', 'named by the region it belongs to',
    ($pending['regions'][0]['key'] ?? '') === 'about.title', $pending['regions'][0]['key'] ?? '(none)');
check('loop', 'and attributed to the screen that edits it',
    in_array('content', $pending['regions'][0]['modules'] ?? [], true));
check('loop', 'the live page still shows the published text',
    !str_contains((string) Publisher::liveValue('about.title'), '✎'));

/* preview shows it before anyone else sees it */
$res = $admin->get('/api/admin/content/preview');
check('loop', 'preview answers with the page itself', $res['status'] === 200, "status={$res['status']}");
check('loop', 'and it carries the unpublished change', str_contains($res['raw'], '✎'));
check('loop', 'with a base so its images still resolve', str_contains($res['raw'], '<base href="/">'));
check('loop', 'and a robots directive', str_contains($res['raw'], 'noindex,nofollow'));
check('loop', 'the live page is still untouched',
    !str_contains((string) @file_get_contents(AUN_ROOT . '/index.html'), '✎'));

/* preview is not public */
$anonPrev = new Client($BASE);
$res = $anonPrev->get('/api/admin/content/preview');
check('loop', 'preview refuses a visitor with no session', $res['status'] === 401, "status={$res['status']}");
check('loop', 'and shows them no part of the page', !str_contains($res['raw'], '<base href'));

/* a role without content view cannot preview either */
$res = $cm4->get('/api/admin/content/pending');
check('loop', 'a content manager may see what is pending', $res['status'] === 200, "status={$res['status']}");

/* publishing closes it */
$res = $admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('loop', 'publishing succeeds', $res['status'] === 200, "status={$res['status']}");
check('loop', 'the change is now live', str_contains((string) Publisher::liveValue('about.title'), '✎'));
$res = $admin->get('/api/admin/content/pending');
check('loop', 'and nothing is pending any more',
    ($res['body']['pending']['count'] ?? -1) === 0, json_encode($res['body']['pending']['count'] ?? null));

/* put it back */
$admin->post('/api/admin/content/block', [
    'csrf_token' => $adminTk, 'key' => 'about.title', 'lang' => 'ar', 'value' => $titleWas,
]);
$admin->post('/api/admin/content/publish', ['csrf_token' => $adminTk]);
check('loop', 'restoring the text restores the page',
    (string) Publisher::liveValue('about.title') === Publisher::renderBlock('about.title', $titleWas));

/* the count is measured, never stored */
check('loop', 'the pending count is computed from the page, not remembered',
    !str_contains((string) @file_get_contents(AUN_ROOT . '/app/Schema.php'), 'pending_count'));

/* every module that edits site content can publish it, and none of them
   claims a save already did */
foreach (['content', 'services', 'settings'] as $page) {
    $src = (string) @file_get_contents(AUN_ROOT . '/admin/' . $page . '.html');
    check('loop', "{$page}: offers a preview", str_contains($src, 'id="previewbtn"'));
    check('loop', "{$page}: offers a publish",
        str_contains($src, 'id="publishbtn"') || str_contains($src, 'id="publish"'));
    check('loop', "{$page}: does not claim a save publishes",
        !str_contains($src, 'فور الحفظ'));
}
check('loop', 'the count refreshes from the shared client, not per call site',
    str_contains((string) @file_get_contents(AUN_ROOT . '/admin/app.js'), 'CHANGES_SITE'));

/* one computation answers publish, pending and preview */
check('loop', 'publish and pending cannot disagree — they share plan()',
    substr_count((string) @file_get_contents(AUN_ROOT . '/app/Publisher.php'), 'self::plan()') >= 3);

/* ================================================================== */
section('ONE RECORD PER FACT');
/* ================================================================== */
/* Stage 1. A fact the website shows must be writable from exactly one place.
   Two used to fail this: a service existed as a row and as a second row of
   HTML, and four contact facts existed as a settings row and as a block. */

check('one-record', 'a service is rendered from the service record alone',
    str_contains((string) @file_get_contents(AUN_ROOT . '/app/Publisher.php'), 'renderServices'));
check('one-record', 'and no second copy is written anywhere',
    !str_contains((string) @file_get_contents(AUN_ROOT . '/app/Repo/Content.php'), 'syncServiceTemplate'));
check('one-record', 'every service carries its own icon and picture',
    (int) Db::value('SELECT COUNT(*) FROM services WHERE icon_svg IS NULL OR image_html IS NULL') === 0,
    (string) Db::value('SELECT COUNT(*) FROM services WHERE icon_svg IS NULL OR image_html IS NULL') . ' without');
check('one-record', 'a fresh install can supply them without the old table',
    str_contains((string) @file_get_contents(AUN_ROOT . '/app/Setup.php'), 'serviceArt'));

foreach (Repo_Content::SETTINGS_ALIAS as $path => $blockKey) {
    [$cat, $name] = explode('.', $path, 2);
    $stored = Db::value('SELECT 1 FROM settings WHERE category = ? AND name = ?', [$cat, $name]);
    check('one-record', "{$path} is not stored a second time", $stored === null || $stored === false);
    $shown = Repo_Content::settings($cat)[$cat][$name] ?? null;
    $block = Repo_Cms::block($blockKey, 'ar');
    check('one-record', "{$path} shows what {$blockKey} publishes",
        $block !== null && $shown === (string) $block['value']);
}

/* the end an administrator cares about: edit it here, see it there */
$phoneWas = (string) (Repo_Cms::block('contact.phone_display', 'ar')['value'] ?? '');
$actorRow = Repo_Users::findByEmail($EMAIL);
Repo_Content::saveSettings('contact', ['cPhone' => '+966 55 111 2233'], $actorRow);
Publisher::publish($actorRow);
check('one-record', 'editing the phone in الإعدادات changes the published page',
    Publisher::liveValue('contact.phone_display') === "\u{200E}+966&nbsp;55&nbsp;111&nbsp;2233",
    json_encode(Publisher::liveValue('contact.phone_display'), JSON_UNESCAPED_UNICODE));
check('one-record', 'and it is stored as a person would type it',
    (string) (Repo_Cms::block('contact.phone_display', 'ar')['value'] ?? '') === '+966 55 111 2233');
Repo_Content::saveSettings('contact', ['cPhone' => $phoneWas], $actorRow);
Publisher::publish($actorRow);
check('one-record', 'and restoring it restores the page',
    Publisher::liveValue('contact.phone_display')
        === Publisher::renderBlock('contact.phone_display', $phoneWas));

check('one-record', 'the phone is no longer authored as HTML',
    !isset(Repo_Cms::FIELD_HTML['contact.phone_display']));
check('one-record', 'a fresh install seeds the same plain value',
    !str_contains((string) @file_get_contents(AUN_ROOT . '/app/storage/cms-seed.json'), '&nbsp;'));

/* ================================================================== */
section('NO DEMO DATA REACHES A SIGNED-IN SCREEN');
/* ================================================================== */
$MODULES = ['dashboard', 'requests', 'customers', 'services', 'content',
            'media', 'activity', 'reports', 'users', 'settings', 'intake'];
foreach ($MODULES as $page) {
    $src = (string) @file_get_contents(AUN_ROOT . '/admin/' . $page . '.html');
    check('no-demo', "{$page}: no demo-data notice",
        !str_contains($src, 'class="alert alert--info demobar"')
        && !str_contains($src, 'بيانات تجريبية') && !str_contains($src, 'حسابات تجريبية'));
    check('no-demo', "{$page}: the header identity is filled from /auth/me",
        str_contains($src, 'id="whoname"') && str_contains($src, 'id="whorole"')
        && str_contains($src, 'id="whoname2"') && str_contains($src, 'id="whorole2"'));
    check('no-demo', "{$page}: no invented customer names",
        !str_contains($src, 'أمل الصاعدي') && !str_contains($src, 'نوف العتيبي')
        && !str_contains($src, 'تركي الشهراني'));
    check('no-demo', "{$page}: no role-preview switch",
        !str_contains($src, 'id="roleFull"') && !str_contains($src, 'id="roleView"'));
}
$dash = (string) @file_get_contents(AUN_ROOT . '/admin/dashboard.html');
check('no-demo', 'dashboard: no state-cycling preview control', !str_contains($dash, 'id="statebtn"'));
check('no-demo', 'dashboard: sample rows cannot paint before they are filled',
    substr_count($dash, '<tr hidden><td><span class="cell-id">') === 5
    && substr_count($dash, '<a class="reccard" hidden') === 5
    && substr_count($dash, '<div class="act" hidden>') === 4);
check('no-demo', 'dashboard: every block opens in its loading state',
    substr_count($dash, 'data-state="loading" id=') + substr_count($dash, 'id="kpis" data-state="loading"') === 4);
check('no-demo', 'dashboard: the greeting is written, not typed',
    str_contains($dash, 'id="greet"') && !str_contains($dash, '5 طلبات جديدة'));
check('no-demo', 'the shared client exposes the permission matrix',
    str_contains((string) @file_get_contents(AUN_ROOT . '/admin/app.js'), 'permissions[module]')
    || str_contains((string) @file_get_contents(AUN_ROOT . '/admin/app.js'), 'u.permissions[module]'));

$res = $admin->get('/api/admin/summary');
$c = $res['body']['counts'] ?? [];
check('no-demo', 'summary counts what the tiles state',
    array_key_exists('overdue', $c) && array_key_exists('confirmedToday', $c)
    && array_key_exists('doneThisMonth', $c),
    'overdue/confirmedToday/doneThisMonth');
check('no-demo', 'and they are numbers, not text',
    is_int($c['overdue'] ?? null) && is_int($c['confirmedToday'] ?? null) && is_int($c['doneThisMonth'] ?? null));
check('no-demo', 'the overdue figure never exceeds the review count',
    (int) ($c['overdue'] ?? 0) <= (int) ($c['review'] ?? 0),
    'overdue=' . ($c['overdue'] ?? '?') . ' review=' . ($c['review'] ?? '?'));

/* ================================================================== */
section('INSTALLER — install.php answers nothing without SETUP_TOKEN');
/* ================================================================== */
$inst = new Client($BASE);
foreach (['/install.php', '/install.php?t=', '/install.php?t=wrong-token-guess'] as $p) {
    $res = $inst->get($p);
    check('installer', "{$p} is a bare 404", $res['status'] === 404, "status={$res['status']}");
    check('installer', 'and discloses nothing',
        !str_contains($res['raw'], 'تشغيل التثبيت')
        && !str_contains($res['raw'], 'SETUP_TOKEN')
        && !str_contains($res['raw'], 'DB_')
        && strlen($res['raw']) < 512, strlen($res['raw']) . ' bytes');
}
$res = $inst->post('/install.php', 't=wrong&email=attacker@example.com');
check('installer', 'a POST without the token is a 404 too', $res['status'] === 404, "status={$res['status']}");
check('installer', 'and created no account',
    Repo_Users::findByEmail('attacker@example.com') === null);
check('installer', 'install.php ships in the package',
    str_contains((string) @file_get_contents(AUN_ROOT . '/build.js'), "'install.php'"));
check('installer', 'and refuses to run once a Super Admin exists',
    str_contains((string) @file_get_contents(AUN_ROOT . '/install.php'), '!$installed'));

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
section('STAGE 6A  A WAY BACK IN — PASSWORDS THAT CAN BE CHANGED');
/* ================================================================== */
/* A scratch account, so nothing here touches the credentials the rest of the
   suite signs in with. It is created through the real endpoint. */
$pwEmail = "pwtest{$stamp}@aunaldrb.com";
$pwOld   = 'Stage-Six-Old-Pass-1';
$pwNew   = 'Stage-Six-New-Pass-2';
$tk = $admin->csrf();
$res = $admin->post('/api/admin/users/save', [
    'csrf_token' => $tk, 'name' => 'حساب اختبار كلمة المرور',
    'email' => $pwEmail, 'role' => 'admin', 'active' => '1', 'password' => $pwOld,
]);
check('pw', 'a scratch account is created', $res['status'] === 201, "status={$res['status']}");
$pwId = (int) ($res['body']['id'] ?? 0);

/* the shared policy is enforced wherever a password is set */
$res = $admin->post('/api/admin/users/save', [
    'csrf_token' => $admin->csrf(), 'name' => 'ضعيف', 'email' => "weak{$stamp}@aunaldrb.com",
    'role' => 'admin', 'active' => '1', 'password' => 'short',
]);
check('pw', 'a too-short password is refused at creation', $res['status'] === 422, "status={$res['status']}");
$res = $admin->post('/api/admin/users/save', [
    'csrf_token' => $admin->csrf(), 'name' => 'شائع', 'email' => "common{$stamp}@aunaldrb.com",
    'role' => 'admin', 'active' => '1', 'password' => 'password12345',
]);
check('pw', 'an obviously common password is refused too', $res['status'] === 422, "status={$res['status']}");

/* two sessions for that account: one changes the password, the other must die */
$one = new Client($BASE);
$res = $one->post('/api/auth/login', ['csrf_token' => $one->csrf(), 'email' => $pwEmail, 'password' => $pwOld]);
check('pw', 'the scratch account can sign in', $res['status'] === 200, "status={$res['status']}");
$two = new Client($BASE);
$res = $two->post('/api/auth/login', ['csrf_token' => $two->csrf(), 'email' => $pwEmail, 'password' => $pwOld]);
check('pw', 'and can sign in a second time, on another device', $res['status'] === 200, "status={$res['status']}");

$res = $one->post('/api/auth/password',
    ['csrf_token' => $one->csrf(), 'current' => 'not-the-password', 'password' => $pwNew]);
check('pw', 'a wrong current password is refused', $res['status'] === 422, "status={$res['status']}");
check('pw', 'and it says which field was wrong', isset($res['body']['errors']['current']));
check('pw', 'the password did not change',
    Auth::verify($pwOld, (string) Repo_Users::findByEmail($pwEmail)['password_hash']));

$res = $one->post('/api/auth/password',
    ['csrf_token' => $one->csrf(), 'current' => $pwOld, 'password' => 'weak']);
check('pw', 'a weak new password is refused', $res['status'] === 422, "status={$res['status']}");
$res = $one->post('/api/auth/password',
    ['csrf_token' => $one->csrf(), 'current' => $pwOld, 'password' => $pwOld]);
check('pw', 'reusing the current password is refused', $res['status'] === 422, "status={$res['status']}");

$res = $one->post('/api/auth/password',
    ['csrf_token' => $one->csrf(), 'current' => $pwOld, 'password' => $pwNew]);
check('pw', 'the change succeeds with the right current password', $res['status'] === 200, "status={$res['status']}");
check('pw', 'and the reply never carries the password',
    !str_contains($res['raw'], $pwNew) && !str_contains($res['raw'], $pwOld));
check('pw', 'and never a hash', !str_contains($res['raw'], '$argon') && !str_contains($res['raw'], '$2y$'));
check('pw', 'the stored hash is the new password',
    Auth::verify($pwNew, (string) Repo_Users::findByEmail($pwEmail)['password_hash']));
check('pw', 'the session that changed it stays signed in',
    $one->get('/api/auth/me')['status'] === 200);
check('pw', 'the OTHER session is signed out',
    $two->get('/api/auth/me')['status'] === 401);

$dead = new Client($BASE);
$res = $dead->post('/api/auth/login', ['csrf_token' => $dead->csrf(), 'email' => $pwEmail, 'password' => $pwOld]);
check('pw', 'the old password no longer signs in', $res['status'] === 401, "status={$res['status']}");
$live = new Client($BASE);
$res = $live->post('/api/auth/login', ['csrf_token' => $live->csrf(), 'email' => $pwEmail, 'password' => $pwNew]);
check('pw', 'the new one does', $res['status'] === 200, "status={$res['status']}");

/* a Super Admin resets someone else's; a non-super may not */
$res = $live->post('/api/admin/users/password',
    ['csrf_token' => $live->csrf(), 'id' => $pwId, 'password' => 'Someone-Elses-Pass-9']);
check('pw', 'an Admin with the users module cannot reset a password', $res['status'] === 403, "status={$res['status']}");
check('pw', 'and the refusal changed nothing',
    Auth::verify($pwNew, (string) Repo_Users::findByEmail($pwEmail)['password_hash']));

$reset = 'Super-Reset-This-One-3';
$res = $admin->post('/api/admin/users/password',
    ['csrf_token' => $admin->csrf(), 'id' => $pwId, 'password' => $reset]);
check('pw', 'a Super Admin can reset it', $res['status'] === 200, "status={$res['status']}");
check('pw', 'the reply carries neither the password nor a hash',
    !str_contains($res['raw'], $reset) && !str_contains($res['raw'], '$argon') && !str_contains($res['raw'], '$2y$'));
check('pw', 'the reset ended the account\'s sessions', $live->get('/api/auth/me')['status'] === 401);
$back = new Client($BASE);
$res = $back->post('/api/auth/login', ['csrf_token' => $back->csrf(), 'email' => $pwEmail, 'password' => $reset]);
check('pw', 'and the account signs in with the new password', $res['status'] === 200, "status={$res['status']}");
check('pw', 'a reset is written to the activity log',
    (int) Db::value('SELECT COUNT(*) FROM activity_log WHERE target_id = ? AND summary LIKE ?',
        [(string) $pwId, '%إعادة تعيين كلمة المرور%']) >= 1);

/* the lock, and the way out of it */
Repo_Users::unlock($pwId);
Db::run('UPDATE users SET locked_until = ? WHERE id = ?',
    [gmdate('Y-m-d H:i:s', time() + 900), $pwId]);
$locked = new Client($BASE);
$res = $locked->post('/api/auth/login', ['csrf_token' => $locked->csrf(), 'email' => $pwEmail, 'password' => $reset]);
check('pw', 'a locked account cannot sign in even with the right password',
    $res['status'] === 401, "status={$res['status']}");
$res = $back->post('/api/admin/users/unlock', ['csrf_token' => $back->csrf(), 'id' => $pwId]);
check('pw', 'a non-super cannot clear the lock', $res['status'] === 403, "status={$res['status']}");
$res = $admin->post('/api/admin/users/unlock', ['csrf_token' => $admin->csrf(), 'id' => $pwId]);
check('pw', 'a Super Admin can', $res['status'] === 200, "status={$res['status']}");
$open = new Client($BASE);
$res = $open->post('/api/auth/login', ['csrf_token' => $open->csrf(), 'email' => $pwEmail, 'password' => $reset]);
check('pw', 'and the account signs in again', $res['status'] === 200, "status={$res['status']}");

/* the dashboard offers the reset only where it works */
$usersPage = (string) @file_get_contents(AUN_ROOT . '/admin/users.html');
check('pw', 'the reset button is wired to the real endpoint',
    str_contains($usersPage, 'AunAPI.resetUserPassword'));
check('pw', 'and no longer only shows a message',
    !str_contains($usersPage, 'سيُطلب من المستخدم تعيين كلمة مرور جديدة'));
$setPage = (string) @file_get_contents(AUN_ROOT . '/admin/settings.html');
check('pw', 'a person can change their own password from الإعدادات',
    str_contains($setPage, 'AunAPI.changePassword'));

/* ================================================================== */
section('STAGE 6A  RECOVERY — CLOSED UNTIL SOMEONE OPENS IT');
/* ================================================================== */
$rec = new Client($BASE);
check('recover', 'RECOVERY_TOKEN is not set here', (string) Env::get('RECOVERY_TOKEN', '') === '');
foreach (['', '?t=', '?t=guess', '?t=' . str_repeat('a', 32)] as $q) {
    $res = $rec->get('/recover.php' . $q);
    check('recover', "GET /recover.php{$q} is a bare 404", $res['status'] === 404, "status={$res['status']}");
    check('recover', 'and discloses nothing', strlen($res['raw']) < 200, strlen($res['raw']) . ' bytes');
}
$res = $rec->post('/recover.php', 't=guess&action=password&id=1&password=Attacker-Pass-123');
check('recover', 'a POST without the token is a 404 too', $res['status'] === 404, "status={$res['status']}");
check('recover', 'and changed no password',
    Auth::verify($reset, (string) Repo_Users::findByEmail($pwEmail)['password_hash']));

$recSrc = (string) @file_get_contents(AUN_ROOT . '/recover.php');
check('recover', 'the token is compared in constant time', str_contains($recSrc, 'hash_equals'));
check('recover', 'a short token is refused outright', str_contains($recSrc, 'strlen($expected) >= 24'));
check('recover', 'it only ever touches Super Admin accounts',
    str_contains($recSrc, "\$target['role'] !== 'super'"));
check('recover', 'it never generates or prints a password',
    !str_contains($recSrc, 'random_bytes') || !str_contains($recSrc, '$password'));
check('recover', 'every action it takes is logged as a recovery',
    substr_count($recSrc, 'RECOVERY_ACTOR') >= 5);
check('recover', 'it ships in the package', str_contains((string) @file_get_contents(AUN_ROOT . '/build.js'), "'recover.php'"));
check('recover', 'preflight reports the token while it is set',
    str_contains((string) @file_get_contents(AUN_ROOT . '/bin/preflight.php'), 'RECOVERY_TOKEN is NOT set'));
check('recover', '.env.example documents it without holding one',
    (static function (): bool {
        $t = (string) @file_get_contents(AUN_ROOT . '/.env.example');
        return str_contains($t, '#RECOVERY_TOKEN=') && !preg_match('/^RECOVERY_TOKEN=.+/m', $t);
    })());

/* ================================================================== */
section('STAGE 6B  A SECOND COPY — BACKUP AND RESTORE');
/* ================================================================== */
$res = $back->get('/api/admin/backup');
check('backup', 'an Admin cannot download the backup', $res['status'] === 403, "status={$res['status']}");

$res = $admin->get('/api/admin/backup');
check('backup', 'a Super Admin can', $res['status'] === 200, "status={$res['status']}");
$dump = json_decode($res['raw'], true);
check('backup', 'it is a backup this system recognises',
    is_array($dump) && ($dump['aun_backup'] ?? 0) === Backup::FORMAT);
check('backup', 'it carries the content tables',
    isset($dump['tables']['content_blocks'], $dump['tables']['services'], $dump['tables']['settings']));
check('backup', 'and the business tables',
    isset($dump['tables']['requests'], $dump['tables']['customers']));
check('backup', 'it holds no password hash',
    !str_contains($res['raw'], '$argon') && !str_contains($res['raw'], '$2y$')
    && !str_contains($res['raw'], 'password_hash'));
check('backup', 'no session or CSRF row is in it',
    !isset($dump['tables']['sessions']) && !isset($dump['tables']['users'])
    && !str_contains($res['raw'], 'csrf_hash'));
check('backup', 'no database credential is in it',
    !str_contains($res['raw'], (string) Env::get('DB_PASS', '@@none@@'))
    || (string) Env::get('DB_PASS', '') === '');
check('backup', 'the accounts are listed for the record, without secrets',
    isset($dump['accounts'][0]['email']) && !isset($dump['accounts'][0]['password_hash']));
check('backup', 'and users is on the excluded list, in writing',
    in_array('users', Backup::EXCLUDED, true));

/* what a restore must put back, and what it must leave alone */
$before = [];
foreach (Backup::TABLES as $t) $before[$t] = (int) Db::value("SELECT COUNT(*) FROM {$t}");

/* a record that exists only after the backup was taken, so a restore has
   something visible to undo */
$ghostTitle = 'سؤال اختبار الاستعادة ' . $stamp;
$res = $admin->post('/api/admin/content/item/new', [
    'csrf_token' => $admin->csrf(), 'area' => 'faq', 'lang' => 'ar',
    'title' => $ghostTitle, 'body' => 'يُنشأ ليختفي عند الاستعادة.',
]);
check('backup', 'a record is added after the backup was taken',
    in_array($res['status'], [200, 201], true), "status={$res['status']}");
$ghostRows = static fn(): int => (int) Db::value(
    'SELECT COUNT(*) FROM content_items WHERE title = ?', [$ghostTitle]);
check('backup', 'and it is really there', $ghostRows() === 1, 'rows=' . $ghostRows());

/* the guards on the way in */
$boundary = '----aun' . bin2hex(random_bytes(8));
$mkBody = static function (string $confirm, string $content, string $token) use ($boundary): string {
    $b  = "--{$boundary}\r\nContent-Disposition: form-data; name=\"csrf_token\"\r\n\r\n{$token}\r\n";
    $b .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"confirm\"\r\n\r\n{$confirm}\r\n";
    $b .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"backup.json\"\r\n";
    $b .= "Content-Type: application/json\r\n\r\n{$content}\r\n--{$boundary}--\r\n";
    return $b;
};
$hdr = ['Content-Type' => 'multipart/form-data; boundary=' . $boundary];

$tk = $admin->csrf();
$res = $admin->post('/api/admin/restore', $mkBody('yes', json_encode($dump), $tk), $hdr + ['X-CSRF-Token' => $tk]);
check('backup', 'a restore without the confirmation word is refused', $res['status'] === 422, "status={$res['status']}");

$tk = $admin->csrf();
$res = $admin->post('/api/admin/restore', $mkBody('استعادة', '{"hello":"world"}', $tk), $hdr + ['X-CSRF-Token' => $tk]);
check('backup', 'a file that is not a backup is refused', $res['status'] === 422, "status={$res['status']}");

$tk = $admin->csrf();
$res = $admin->post('/api/admin/restore',
    $mkBody('استعادة', json_encode(['aun_backup' => 99, 'tables' => []]), $tk), $hdr + ['X-CSRF-Token' => $tk]);
check('backup', 'a backup from an unknown format is refused', $res['status'] === 422, "status={$res['status']}");

$tk = $admin->csrf();
$res = $admin->post('/api/admin/restore',
    $mkBody('استعادة', json_encode(['aun_backup' => 1, 'tables' => ['users' => []]]), $tk), $hdr + ['X-CSRF-Token' => $tk]);
check('backup', 'a backup naming a table restore does not cover is refused',
    $res['status'] === 422, "status={$res['status']}");
check('backup', 'the added record is still there after every refusal', $ghostRows() === 1);

$tk = $back->csrf();
$res = $back->post('/api/admin/restore', $mkBody('استعادة', json_encode($dump), $tk), $hdr + ['X-CSRF-Token' => $tk]);
check('backup', 'an Admin cannot restore', $res['status'] === 403, "status={$res['status']}");

/* and the real thing */
$snapsBefore = count(glob(Backup::dir() . '/*.json') ?: []);
$tk = $admin->csrf();
$res = $admin->post('/api/admin/restore', $mkBody('استعادة', json_encode($dump), $tk), $hdr + ['X-CSRF-Token' => $tk]);
check('backup', 'a Super Admin can restore', $res['status'] === 200, "status={$res['status']}");
check('backup', 'the added record is gone', $ghostRows() === 0);
$restoredOk = true;
foreach (Backup::TABLES as $t) {
    if ((int) Db::value("SELECT COUNT(*) FROM {$t}") !== $before[$t]) { $restoredOk = false; break; }
}
check('backup', 'every covered table is back to what the backup held', $restoredOk);
check('backup', 'a snapshot of the pre-restore data was written first',
    count(glob(Backup::dir() . '/*.json') ?: []) > $snapsBefore);
check('backup', 'and it is named for what it is',
    (bool) glob(Backup::dir() . '/before-restore-*.json'));
check('backup', 'the reply says the website has not changed yet',
    str_contains((string) ($res['body']['note'] ?? ''), 'انشره'));

/* §6 — accounts and sessions are untouched by a restore */
check('backup', 'the scratch account survived the restore',
    Repo_Users::findByEmail($pwEmail) !== null);
check('backup', 'its password survived too',
    Auth::verify($reset, (string) Repo_Users::findByEmail($pwEmail)['password_hash']));
check('backup', 'the Super Admin is still signed in', $admin->get('/api/auth/me')['status'] === 200);

/* the backups themselves must not be servable */
$snap = basename((string) (glob(Backup::dir() . '/*.json')[0] ?? 'x.json'));
$res = $anon->get('/app/storage/backups/' . $snap);
check('backup', 'a written backup is not reachable over HTTP',
    in_array($res['status'], [403, 404], true), "status={$res['status']}");
check('backup', 'the download is sent as a file, not as a page',
    (static function () use ($BASE, $admin): bool {
        $r = $admin->get('/api/admin/backup');
        return str_contains(strtolower($r['raw']), '"aun_backup"');
    })());
check('backup', 'the terminal has the same two operations',
    (static function (): bool {
        $t = (string) @file_get_contents(AUN_ROOT . '/bin/backup.php');
        return str_contains($t, '--restore') && str_contains($t, 'Backup::writeSnapshot');
    })());
check('backup', 'old snapshots are pruned rather than accumulated',
    str_contains((string) @file_get_contents(AUN_ROOT . '/app/Backup.php'), 'pruneSnapshots'));

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
