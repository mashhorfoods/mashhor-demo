<?php
/**
 * المرحلة 16 — الأمن كدورة حياة، لا كخانة تُعلَّم في النهاية.
 *
 * The ninth gate, and the adversarial one. bin/qa-authz.php asks whether the
 * right role reaches the right route; this asks the questions an attacker
 * would ask once inside that answer:
 *
 *   §1  SESSION      does the token change at the moment privilege changes,
 *                    does it die when it should, and can it be read by script
 *   §2  CSRF         is the token bound to the session that was issued it, or
 *                    is any well-formed token good enough
 *   §3  INJECTION    do payloads reach SQL, and does what an operator types
 *                    survive into the published HTML as markup
 *   §4  IDOR         can a record be reached by guessing its identifier
 *   §5  ASSIGNMENT   can a field the form never showed be set by sending it
 *   §6  UPLOAD       what happens to a PHP file called .webp, and to an SVG
 *                    with a script in it
 *   §7  TRAVERSAL    does a path parameter escape its directory
 *   §8  BRUTE FORCE  does guessing get slower, and does it stop
 *   §9  SECRETS      does anything the web can serve contain key material
 *
 * Every case is executed against the real endpoints and then checked in the
 * database or on disk, because "the endpoint returned 400" and "the row was
 * not written" are different claims.
 *
 * Usage:  php bin/qa-security.php http://127.0.0.1:8088 [--email= --password=]
 *
 * WRITES. Same warning as bin/verify.php — never point it at real data.
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

if (Env::isProduction() && !flag('allow-writes')) {
    fwrite(STDERR, "\nRefusing to run: APP_ENV is production. This suite writes.\n\n");
    exit(3);
}

final class Client
{
    public array $cookies = [];
    public bool $follow = false;
    public function __construct(private string $base) {}

    public function request(string $method, string $path, $body = null, array $headers = []): array
    {
        $h = ['Accept: application/json'];
        foreach ($headers as $k => $v) $h[] = "{$k}: {$v}";
        if ($this->cookies !== []) {
            $pairs = [];
            foreach ($this->cookies as $k => $v) $pairs[] = "{$k}={$v}";
            $h[] = 'Cookie: ' . implode('; ', $pairs);
        }
        $opts = ['http' => [
            'method' => $method, 'header' => $h, 'ignore_errors' => true, 'timeout' => 20,
            'follow_location' => $this->follow ? 1 : 0, 'max_redirects' => $this->follow ? 20 : 1,
        ]];
        if ($body !== null) {
            if (is_array($body)) {
                $opts['http']['header'][] = 'Content-Type: application/json';
                $opts['http']['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
            } else {
                $hasType = false;
                foreach ($opts['http']['header'] as $line) {
                    if (stripos($line, 'Content-Type:') === 0) { $hasType = true; break; }
                }
                if (!$hasType) $opts['http']['header'][] = 'Content-Type: application/x-www-form-urlencoded';
                $opts['http']['content'] = $body;
            }
        }
        $raw = @file_get_contents($this->base . $path, false, stream_context_create($opts));
        $status = 0; $setCookies = []; $headers = [];
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) $status = (int) $m[1];
            if (stripos($line, 'Set-Cookie:') === 0) $setCookies[] = substr($line, 11);
            $c = strpos($line, ':');
            if ($c !== false) $headers[strtolower(substr($line, 0, $c))] = trim(substr($line, $c + 1));
        }
        foreach ($setCookies as $c) {
            $first = trim(explode(';', $c)[0]);
            [$k, $v] = array_pad(explode('=', $first, 2), 2, '');
            $k = trim($k);
            if ($v === '') unset($this->cookies[$k]); else $this->cookies[$k] = $v;
        }
        return ['status' => $status, 'body' => $raw === false ? null : json_decode($raw, true),
                'raw' => (string) $raw, 'cookies' => $setCookies, 'headers' => $headers];
    }
    public function get(string $p, array $h = []): array { return $this->request('GET', $p, null, $h); }
    public function post(string $p, $b, array $h = []): array { return $this->request('POST', $p, $b, $h); }
    public function csrf(): string { return (string) ($this->get('/api/csrf')['body']['token'] ?? ''); }

    public function upload(string $path, string $bytes, string $sendAs, string $token, string $type = 'image/webp'): array
    {
        $boundary = '----aun' . bin2hex(random_bytes(8));
        $body  = "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"csrf_token\"\r\n\r\n{$token}\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Disposition: form-data; name=\"file\"; filename=\"{$sendAs}\"\r\n";
        $body .= "Content-Type: {$type}\r\n\r\n{$bytes}\r\n";
        $body .= "--{$boundary}--\r\n";
        return $this->request('POST', $path, $body, [
            'Content-Type' => 'multipart/form-data; boundary=' . $boundary,
            'X-CSRF-Token' => $token,
        ]);
    }

    public function login(string $email, string $password): array
    {
        $t = $this->csrf();
        return $this->post('/api/auth/login',
            ['csrf_token' => $t, 'email' => $email, 'password' => $password],
            ['X-CSRF-Token' => $t]);
    }
}

$pass = 0; $fail = 0; $lines = []; $failed = [];
function check(string $group, string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail, $lines, $failed;
    $ok ? $pass++ : $fail++;
    $lines[] = sprintf('  %s %-62s %s', $ok ? 'PASS' : 'FAIL', $name, $detail);
    if (!$ok) $failed[] = "{$group} / {$name} {$detail}";
}
function section(string $t): void { global $lines; $lines[] = "\n" . $t; }
function clearRateBucket(): void { Db::run('DELETE FROM rate_hits'); }

$EMAIL = (string) opt('email', 'noura@aunaldrb.com');
$PASSWORD = (string) opt('password', 'Recovery-01-Local-Dev');
$SESSION_COOKIE = (string) (Env::get('SESSION_COOKIE') ?: 'aun_sid');

clearRateBucket();

/* ================================================================== */
section('§1  الجلسة — الرمز، عمره، ومن يستطيع قراءته');
/* ================================================================== */

/* A session token that survives the moment privilege changes is a session
   fixation: anyone who could set the cookie before sign-in still holds a
   valid one after it. */
$c = new Client($BASE);
$c->get('/api/csrf');
$before = $c->cookies[$SESSION_COOKIE] ?? null;
$login = $c->login($EMAIL, $PASSWORD);
$after = $c->cookies[$SESSION_COOKIE] ?? null;
check('session', 'تسجيل الدخول ينجح', $login['status'] === 200, 'status=' . $login['status']);
check('session', 'ورمز الجلسة يتغيّر عند الدخول — لا تثبيت للجلسة',
    $after !== null && $after !== $before,
    $before === null ? 'no pre-login cookie at all (better still)' : 'rotated');

/* the cookie a browser holds must be unreadable to script and not sent
   cross-site */
$attrs = '';
foreach ($login['cookies'] as $line) {
    if (str_starts_with(trim($line), $SESSION_COOKIE . '=')) $attrs = strtolower($line);
}
check('session', 'ملف تعريف الجلسة محجوب عن الجافاسكربت (HttpOnly)',
    str_contains($attrs, 'httponly'), $attrs === '' ? 'no Set-Cookie seen' : '');
check('session', 'ولا يُرسل من موقع آخر (SameSite)',
    str_contains($attrs, 'samesite=lax') || str_contains($attrs, 'samesite=strict'),
    $attrs === '' ? '' : (str_contains($attrs, 'samesite') ? 'present' : 'missing'));
check('session', 'ومحدود بمسار التطبيق', str_contains($attrs, 'path=/'), '');

/* the token in the database is not the token in the cookie */
/* the primary key of a session row IS the digest of the cookie token, so a
   copy of the database is not a set of usable sessions */
$row = $after === null ? null : Db::one('SELECT id FROM sessions WHERE id = ?', [hash('sha256', $after)]);
check('session', 'الخادم يخزّن بصمة الرمز لا الرمز نفسه',
    $row !== null && (string) $row['id'] !== (string) $after && strlen((string) $row['id']) >= 40,
    $row === null ? 'no row for this token digest' : ('len=' . strlen((string) $row['id'])));
check('session', 'ولا يوجد صف يحمل الرمز كما هو',
    $after !== null && Db::one('SELECT id FROM sessions WHERE id = ?', [$after]) === null);

/* signing out must destroy the row, not merely clear the cookie — a stolen
   token has to stop working server-side */
$c2 = new Client($BASE);
$c2->login($EMAIL, $PASSWORD);
$stolen = $c2->cookies[$SESSION_COOKIE] ?? '';
$t = $c2->csrf();
$c2->post('/api/auth/logout', ['csrf_token' => $t], ['X-CSRF-Token' => $t]);
$replay = new Client($BASE);
$replay->cookies[$SESSION_COOKIE] = $stolen;
$rep = $replay->get('/api/admin/summary');
check('session', 'الخروج يُبطل الجلسة على الخادم لا في المتصفح فقط',
    $rep['status'] === 401, 'replayed token → ' . $rep['status']);

/* an expired session must be refused. The row is aged directly rather than
   waiting out the clock. */
$c3 = new Client($BASE);
$c3->login($EMAIL, $PASSWORD);
$live = $c3->cookies[$SESSION_COOKIE] ?? '';
check('session', 'الجلسة الحيّة تعمل قبل التقادم', $c3->get('/api/admin/summary')['status'] === 200);
$hash = hash('sha256', $live);
$old  = gmdate('Y-m-d H:i:s', time() - 86400 * 3);
Db::run('UPDATE sessions SET last_seen_at = ?, created_at = ?, expires_at = ? WHERE id = ?',
    [$old, $old, gmdate('Y-m-d H:i:s', time() - 3600), $hash]);
$expired = $c3->get('/api/admin/summary');
check('session', 'وتُرفض بعد انقضاء مهلتها', $expired['status'] === 401,
    'aged 3 days → ' . $expired['status']);

/* ================================================================== */
section('§2  CSRF — الرمز مربوط بالجلسة التي أُصدر لها');
/* ================================================================== */
clearRateBucket();
$a = new Client($BASE); $a->login($EMAIL, $PASSWORD);
$b = new Client($BASE); $b->login($EMAIL, $PASSWORD);
$tokenA = $a->csrf();
$tokenB = $b->csrf();

$noToken = $a->post('/api/admin/requests/status', ['id' => 'REQ-2026-0001', 'status' => 'confirmed']);
check('csrf', 'طلب بلا رمز يُرفض', in_array($noToken['status'], [400, 403, 419], true), 'status=' . $noToken['status']);

$wrong = $a->post('/api/admin/requests/status',
    ['csrf_token' => str_repeat('a', 64), 'id' => 'REQ-2026-0001', 'status' => 'confirmed'],
    ['X-CSRF-Token' => str_repeat('a', 64)]);
check('csrf', 'ورمز مختلَق يُرفض', in_array($wrong['status'], [400, 403, 419], true), 'status=' . $wrong['status']);

/* the interesting case: a real token, but one issued to a different session */
$crossed = $a->post('/api/admin/requests/status',
    ['csrf_token' => $tokenB, 'id' => 'REQ-2026-0001', 'status' => 'confirmed'],
    ['X-CSRF-Token' => $tokenB]);
check('csrf', 'ورمز صحيح من جلسة أخرى يُرفض',
    $tokenA === $tokenB ? false : in_array($crossed['status'], [400, 403, 419], true),
    $tokenA === $tokenB ? 'both sessions were issued the same token' : ('status=' . $crossed['status']));

/* ================================================================== */
section('§3  الحقن — إلى قاعدة البيانات، وإلى الصفحة المنشورة');
/* ================================================================== */
clearRateBucket();
$s = new Client($BASE); $s->login($EMAIL, $PASSWORD);

$rowsBefore = (int) (Db::one('SELECT COUNT(*) AS n FROM customers')['n'] ?? 0);

/* Getting this oracle right took three tries, and the two wrong ones are
   worth recording because both looked like findings.
   
   The endpoint searches `c.name LIKE ? OR c.phone LIKE ?`, and the second
   parameter is the *digits* of the query. So a search for "zzqq" strips to
   an empty digit string, becomes '%%', and matches every phone in the table:
   an ordinary miss returns everything. Comparing a payload against the size
   of the table therefore called a correct endpoint injectable, and comparing
   it against a lettered control did the same for the opposite reason.
   
   What actually distinguishes data from instructions here is this: a payload
   treated as a literal must return exactly what any other string carrying the
   same digits returns. So each payload is paired with a control built from
   its own digits, and the two must agree. */
$countFor = static function (string $q) use ($s): array {
    $r = $s->get('/api/admin/customers?q=' . rawurlencode($q));
    return [$r['status'], is_array($r['body']['rows'] ?? null) ? count($r['body']['rows']) : -1];
};
$SQLI = [
    "' OR '1'='1",
    "'; DROP TABLE customers; --",
    "1' UNION SELECT null,null,null,null,null,null,null,null --",
    "\\'; DELETE FROM requests WHERE '1'='1",
    "%' OR 1=1 --",
    "') OR ('x'='x",
    "1; SELECT sleep(3)",
];
$leaked = [];
foreach ($SQLI as $payload) {
    [$st, $n] = $countFor($payload);
    if ($st >= 500) { $leaked[] = "HTTP {$st} on «" . substr($payload, 0, 18) . '»'; continue; }
    /* a control carrying the same digits and nothing else that could match */
    $control = 'qqzz' . preg_replace('/\D+/', '', $payload) . 'zzqq';
    [, $cn] = $countFor($control);
    if ($n !== $cn) {
        $leaked[] = "«" . substr($payload, 0, 20) . "» {$n} rows, literal control {$cn}";
    }
}
$rowsAfter = (int) (Db::one('SELECT COUNT(*) AS n FROM customers')['n'] ?? 0);
check('injection', 'حمولات SQL تُطابق ما يُطابقه نص حرفيّ بالأرقام نفسها',
    $leaked === [], implode(' | ', $leaked));
check('injection', 'ولا تُتلف الجدول', $rowsAfter === $rowsBefore, "{$rowsBefore} → {$rowsAfter}");

/* and the oracle is not one that always agrees: two strings with different
   digits must give different answers, or the check above proves nothing */
[, $a1] = $countFor('qqzz0501zzqq');
[, $a2] = $countFor('qqzz0599999999zzqq');
check('injection', 'والمقياس نفسه يميّز — رقمان مختلفان يعطيان نتيجتين',
    $a1 !== $a2, "0501→{$a1}  0599999999→{$a2}");

/* The publish step writes HTML from operator input. That is the one place in
   this system where a string typed into a form becomes markup on a page the
   public loads, so it is the one that has to be proven. */
$XSS = '"><img src=x onerror=alert(1)><script>alert(2)</script>';
$svc = $s->get('/api/admin/services');
$slug = (string) (($svc['body']['rows'][0]['slug'] ?? '') ?: '');
$storedOk = false; $publishedSafe = null; $apiSafe = null; $saveStatus = 0; $saveSaid = '';
if ($slug !== '') {
    $orig = $svc['body']['rows'][0];
    $tk = $s->csrf();
    $save = $s->post('/api/admin/services/save', [
        'csrf_token' => $tk, 'slug' => $slug,
        'title' => 'خدمة ' . $XSS,
        'description' => (string) $orig['description'],
        'order' => $orig['order'], 'published' => $orig['published'],
    ], ['X-CSRF-Token' => $tk]);
    $storedOk = $save['status'] === 200;
    $saveStatus = $save['status'];
    $saveSaid = (string) ($save['body']['errors']['title'] ?? $save['body']['error']['message'] ?? '');

    /* read it back through the API: the raw value may legitimately come back
       as typed — what matters is that it is data, not markup */
    $back = $s->get('/api/admin/services');
    foreach (($back['body']['rows'] ?? []) as $r) {
        if (($r['slug'] ?? '') === $slug) $apiSafe = is_string($r['title'] ?? null);
    }
    if ($saveStatus >= 400) $apiSafe = true;   /* nothing was stored to come back */

    /* and then through the publish pipeline, into the file the public loads */
    $tk = $s->csrf();
    $pub = $s->post('/api/admin/content/publish', ['csrf_token' => $tk], ['X-CSRF-Token' => $tk]);
    $html = (string) @file_get_contents(AUN_ROOT . '/index.html');
    $publishedSafe = !str_contains($html, 'onerror=alert(1)')
        && !str_contains($html, '<script>alert(2)</script>');

    /* put it back exactly as it was, before anything else reads it */
    $tk = $s->csrf();
    $s->post('/api/admin/services/save', [
        'csrf_token' => $tk, 'slug' => $slug, 'title' => (string) $orig['title'],
        'description' => (string) $orig['description'],
        'order' => $orig['order'], 'published' => $orig['published'],
    ], ['X-CSRF-Token' => $tk]);
    $tk = $s->csrf();
    $s->post('/api/admin/content/publish', ['csrf_token' => $tk], ['X-CSRF-Token' => $tk]);
}
/* Two answers are both correct here and the gate must accept either: store
   it as text, or refuse it outright. What would not be correct is storing it
   and then emitting it as markup, which is what the next two lines test. */
check('injection', 'اسم خدمة يحوي وسماً يُخزَّن كنص أو يُرفض',
    $slug !== '' && ($storedOk || $saveStatus >= 400),
    $slug === '' ? 'no service to test with' : ('save → ' . $saveStatus));
check('injection', 'ويعود من الواجهة نصاً لا بنية', $apiSafe === true);
check('injection', 'ولا يصل إلى index.html كوسم قابل للتنفيذ', $publishedSafe === true,
    $publishedSafe === false ? 'the payload reached the published page' : '');

/* the same question on the channel the public itself writes to */
clearRateBucket();
$pubC = new Client($BASE);
$tk = $pubC->csrf();
$phone = '05' . str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
$sub = $pubC->post('/api/requests', [
    'csrf_token' => $tk, 'name' => 'زائر ' . $XSS, 'phone' => $phone,
    'service' => 'النقل بواسطة الكرسي المتحرك', 'from' => 'حي النرجس', 'to' => 'مستشفى',
    'date' => gmdate('Y-m-d', time() + 86400), 'notes' => $XSS,
], ['X-CSRF-Token' => $tk]);
$ref = (string) ($sub['body']['id'] ?? '');
$stored = $ref !== '' ? Db::one('SELECT * FROM requests WHERE ref = ?', [$ref]) : null;
check('injection', 'الطلب العام يقبل الحمولة كنص ويخزّنها كما هي',
    $sub['status'] < 400 || $sub['status'] === 422, 'status=' . $sub['status']);
if ($stored !== null) {
    check('injection', 'ولا يُخزَّن شيء مُفسَّر أو منقوص',
        str_contains((string) ($stored['notes'] ?? ''), 'onerror')
        || ($stored['notes'] ?? '') === '', 'stored verbatim');
    $rid = (int) $stored['id'];
    Db::run('DELETE FROM request_status_history WHERE request_id = ?', [$rid]);
    Db::run('DELETE FROM request_notes WHERE request_id = ?', [$rid]);
    Db::run('DELETE FROM requests WHERE id = ?', [$rid]);
    Db::run('DELETE FROM customers WHERE phone = ?', [$phone]);
}

/* ================================================================== */
section('§4  الوصول بالتخمين — معرّف صحيح لا يكفي');
/* ================================================================== */
clearRateBucket();
/* a Content Manager has no business reading a request, however well they
   guess its reference */
$cm = 'sec-cm-' . substr((string) time(), -6) . '@aunaldrb.com';
$cmPass = 'Sec-Gate-' . bin2hex(random_bytes(6));
$adm = new Client($BASE); $adm->login($EMAIL, $PASSWORD);
$tk = $adm->csrf();
$made = $adm->post('/api/admin/users/save', [
    'csrf_token' => $tk, 'name' => 'مدير محتوى للفحص', 'email' => $cm,
    'role' => 'content', 'active' => true, 'password' => $cmPass,
], ['X-CSRF-Token' => $tk]);
$cmId = (string) ($made['body']['id'] ?? '');
$anyReq = Db::one('SELECT ref FROM requests ORDER BY id DESC LIMIT 1');
$reqId = (string) ($anyReq['ref'] ?? '');
$cmC = new Client($BASE);
$cmLogin = $cmC->login($cm, $cmPass);
if ($cmLogin['status'] === 200 && $reqId !== '') {
    $peek = $cmC->get('/api/admin/requests/show?id=' . rawurlencode($reqId));
    check('idor', 'مدير المحتوى لا يقرأ طلباً بمعرّفه', $peek['status'] === 403, 'status=' . $peek['status']);
    $peek2 = $cmC->get('/api/admin/users');
    check('idor', 'ولا يقرأ قائمة المستخدمين', $peek2['status'] === 403, 'status=' . $peek2['status']);
} else {
    check('idor', 'حساب فحص مدير المحتوى أُنشئ ودخل', false,
        'login status=' . $cmLogin['status'] . ' id=' . ($cmId ?: 'none'));
}

/* ================================================================== */
section('§5  الحقول التي لم يعرضها النموذج');
/* ================================================================== */
clearRateBucket();
$s = new Client($BASE); $s->login($EMAIL, $PASSWORD);
$tk = $s->csrf();
/* the public form takes eight fields. Sending a ninth must not set it. */
clearRateBucket();
$phone2 = '05' . str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
$pubC2 = new Client($BASE);
$tk2 = $pubC2->csrf();
$extra = $pubC2->post('/api/requests', [
    'csrf_token' => $tk2, 'name' => 'اختبار الحقول', 'phone' => $phone2,
    'service' => 'النقل بواسطة الكرسي المتحرك', 'from' => 'حي الملقا', 'to' => 'عيادة',
    'date' => gmdate('Y-m-d', time() + 86400),
    /* none of these are the visitor's to set */
    'status' => 'completed', 'id' => 'REQ-1999-0001', 'source' => 'phone',
    'created_at' => '1999-01-01 00:00:00',
], ['X-CSRF-Token' => $tk2]);
$ref2 = (string) ($extra['body']['id'] ?? '');
if ($extra['status'] >= 400) {
    /* refusing the whole submission is the stricter answer and is also correct */
    check('assignment', 'حقل خارج النموذج يُرفض الطلب كله أو يُتجاهل', true, 'rejected: ' . $extra['status']);
} else {
    $r2 = $ref2 !== '' ? Db::one('SELECT * FROM requests WHERE ref = ?', [$ref2]) : null;
    check('assignment', 'الحالة لا تُضبط من الطلب الوارد',
        $r2 !== null && ($r2['status'] ?? '') === 'new', 'status=' . ($r2['status'] ?? '?'));
    check('assignment', 'ورقم الطلب يضعه النظام لا المُرسِل',
        $ref2 !== 'REQ-1999-0001', 'ref=' . $ref2);
    check('assignment', 'والمصدر يُحدَّد من القناة لا من الحمولة',
        $r2 !== null && ($r2['source'] ?? '') === 'website', 'source=' . ($r2['source'] ?? '?'));
    if ($r2 !== null) {
        $rid2 = (int) $r2['id'];
        Db::run('DELETE FROM request_status_history WHERE request_id = ?', [$rid2]);
        Db::run('DELETE FROM request_notes WHERE request_id = ?', [$rid2]);
        Db::run('DELETE FROM requests WHERE id = ?', [$rid2]);
        Db::run('DELETE FROM customers WHERE phone = ?', [$phone2]);
    }
}

/* an operator cannot promote themselves by sending a role they do not hold */
if ($cmId !== '' && $cmLogin['status'] === 200) {
    $tk = $cmC->csrf();
    $selfPromote = $cmC->post('/api/admin/users/save',
        ['csrf_token' => $tk, 'id' => $cmId, 'name' => 'مدير محتوى للفحص',
         'email' => $cm, 'role' => 'super', 'active' => true],
        ['X-CSRF-Token' => $tk]);
    $nowRole = (string) (Db::one('SELECT role FROM users WHERE id = ?', [$cmId])['role'] ?? '');
    check('assignment', 'مدير المحتوى لا يستطيع ترقية نفسه',
        $selfPromote['status'] === 403 && $nowRole === 'content',
        'status=' . $selfPromote['status'] . ' role=' . $nowRole);
}

/* ================================================================== */
section('§6  الرفع — ما الذي يُقبل، وأين يهبط');
/* ================================================================== */
clearRateBucket();
$s = new Client($BASE); $s->login($EMAIL, $PASSWORD);

/* a PHP file wearing an image extension */
$tk = $s->csrf();
$php = $s->upload('/api/admin/media/upload', "<?php echo 'executed'; ?>\n", 'shell.webp', $tk);
check('upload', 'ملف PHP باسم صورة يُرفض', $php['status'] >= 400, 'status=' . $php['status']);

/* an SVG carrying a script — the format the brief's own upload dialog once
   advertised, and the reason it no longer does */
$tk = $s->csrf();
$svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
$svgUp = $s->upload('/api/admin/media/upload', $svg, 'logo.svg', $tk, 'image/svg+xml');
check('upload', 'وSVG يحمل سكربتاً يُرفض', $svgUp['status'] >= 400, 'status=' . $svgUp['status']);

/* a real image with PHP appended after the image data */
$tk = $s->csrf();
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$poly = $s->upload('/api/admin/media/upload', $png . "\n<?php echo 'x'; ?>", 'tiny.png', $tk, 'image/png');
check('upload', 'وصورة صالحة مذيّلة بكود تُرفض (أو تُخزَّن بلا تنفيذ)',
    $poly['status'] >= 400, 'status=' . $poly['status'] . ' — 1x1 png is under the 200px minimum');

/* and nothing the uploader can reach executes, whatever lands there */
$ht = (string) @file_get_contents(AUN_ROOT . '/.htaccess');
check('upload', 'ومجلد الصور لا يُنفِّذ شيئاً',
    preg_match('/<(?:Files|FilesMatch)[^>]*(?:php|\\\\.ph)/i', $ht) === 1
    || str_contains($ht, 'php_flag engine off')
    || (string) @file_get_contents(AUN_ROOT . '/img/.htaccess') !== '',
    'root .htaccess or img/.htaccess must refuse execution');

/* ================================================================== */
section('§7  الخروج من المجلد — ../ في وسيط مسار');
/* ================================================================== */
$TRAVERSAL = ['../../.env', '..%2f..%2f.env', 'img/../../.env', '....//....//.env',
              '/etc/passwd', 'img/../app/config.php'];
$escaped = [];
foreach ($TRAVERSAL as $p) {
    $r = $s->get('/api/admin/media/show?path=' . rawurlencode($p));
    if ($r['status'] === 200 && (str_contains($r['raw'], 'DB_PASS') || str_contains($r['raw'], 'root:'))) {
        $escaped[] = $p;
    }
    $r2 = $s->get('/' . ltrim($p, '/'));
    if ($r2['status'] === 200 && (str_contains($r2['raw'], 'DB_PASS') || str_contains($r2['raw'], 'APP_KEY'))) {
        $escaped[] = 'GET /' . $p;
    }
}
check('traversal', 'لا وسيط مسار يخرج من مجلده', $escaped === [], implode(' | ', $escaped));

/* the two files that must never be served, however they are asked for */
foreach (['/.env', '/app/bootstrap.php', '/app/storage/aun.sqlite', '/.git/config'] as $p) {
    $r = (new Client($BASE))->get($p);
    check('traversal', "لا يُخدَم {$p}", $r['status'] !== 200 || trim($r['raw']) === '',
        'status=' . $r['status']);
}

/* ================================================================== */
section('§8  التخمين — يبطؤ ثم يتوقف');
/* ================================================================== */
clearRateBucket();
$guess = new Client($BASE);
$statuses = [];
for ($i = 0; $i < 12; $i++) {
    $r = $guess->login($EMAIL, 'definitely-not-the-password-' . $i);
    $statuses[] = $r['status'];
    if ($r['status'] === 429) break;
}
check('bruteforce', 'المحاولات الخاطئة تُرفض', !in_array(200, $statuses, true), implode(',', $statuses));
check('bruteforce', 'وتتوقف قبل الوصول إلى اثنتي عشرة محاولة',
    in_array(429, $statuses, true) || (int) (Db::one('SELECT COUNT(*) AS n FROM users WHERE locked_until IS NOT NULL')['n'] ?? 0) > 0,
    count($statuses) . ' attempts, last=' . end($statuses));

/* and the refusal says nothing about whether the account exists */
clearRateBucket();
$noSuch = (new Client($BASE))->login('nobody-' . time() . '@aunaldrb.com', 'whatever-123456');
clearRateBucket();
$realWrong = (new Client($BASE))->login($EMAIL, 'wrong-password-entirely');
$m1 = (string) ($noSuch['body']['error']['message'] ?? $noSuch['raw']);
$m2 = (string) ($realWrong['body']['error']['message'] ?? $realWrong['raw']);
check('bruteforce', 'ورسالة الرفض لا تكشف وجود الحساب من عدمه',
    $noSuch['status'] === $realWrong['status'] && $m1 === $m2,
    $m1 === $m2 ? '' : 'unknown≠wrong-password');
clearRateBucket();
Db::run('UPDATE users SET failed_attempts = 0, locked_until = NULL');

/* ================================================================== */
section('§9  الأسرار — لا شيء يخدمه الخادم يحوي مفتاحاً');
/* ================================================================== */
/* \s matches a newline, so `APP_KEY=` with nothing after it matched the S of
   the SESSION_COOKIE line below — and .env.example, whose whole point is that
   every value is blank, was reported as a leaked key. Same-line whitespace
   only, and a value of at least six characters, since a one-character value
   is a placeholder rather than a secret. */
$SECRET_SHAPES = [
    '/^[ \t]*APP_KEY[ \t]*=[ \t]*\S{6,}/m',
    '/^[ \t]*DB_PASS[ \t]*=[ \t]*\S{6,}/m',
    '/^[ \t]*SETUP_TOKEN[ \t]*=[ \t]*\S{6,}/m',
    '/^[ \t]*RECOVERY_TOKEN[ \t]*=[ \t]*\S{6,}/m',
    '/-----BEGIN [A-Z ]*PRIVATE KEY-----/',
    '/[\'"]?password[\'"]?\s*=>\s*[\'"][^\'"]{6,}[\'"]/i',
];
$exposed = [];
$servable = [];
foreach (['dist'] as $dir) {
    $root = AUN_ROOT . '/' . $dir;
    if (!is_dir($root)) continue;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (!$f->isFile()) continue;
        $rel = substr($f->getPathname(), strlen($root));
        /* app/ and bin/ are refused by the root .htaccess; everything else in
           the package is fetchable by anyone who knows the address */
        if (preg_match('#^/(app|bin)/#', $rel)) continue;
        if ($f->getSize() > 3_000_000) continue;
        $servable[] = $rel;
        $body = (string) @file_get_contents($f->getPathname());
        foreach ($SECRET_SHAPES as $re) {
            if (preg_match($re, $body)) { $exposed[] = $rel . ' ~ ' . $re; break; }
        }
    }
}
check('secrets', 'لا ملف قابل للتقديم في الحزمة يحوي مفتاحاً',
    $exposed === [], implode(' | ', array_slice($exposed, 0, 4)));
check('secrets', 'والحزمة نفسها فُحصت لا افتُرضت', count($servable) > 50, count($servable) . ' files scanned');

/* .env is never in the package at all */
check('secrets', 'ولا يُشحن ملف البيئة إطلاقاً',
    !file_exists(AUN_ROOT . '/dist/.env'), '');

/* the shipped JavaScript talks to the API and knows no credentials */
$appJs = (string) @file_get_contents(AUN_ROOT . '/dist/admin/app.js');
check('secrets', 'وسكربت اللوحة لا يحمل بيانات اعتماد',
    $appJs !== '' && !preg_match('/(password|secret|api[_-]?key)\s*[:=]\s*[\'"][^\'"]{6,}/i', $appJs));

/* ---- tidy up the scratch account -------------------------------- */
if ($cmId !== '') {
    Db::run('DELETE FROM sessions WHERE user_id = ?', [$cmId]);
    Db::run('UPDATE users SET is_active = 0, email = ? WHERE id = ?', ['retired-' . $cmId . '@invalid', $cmId]);
    check('cleanup', 'حساب الفحص عُطِّل بعد الانتهاء', true, 'id=' . $cmId);
}
clearRateBucket();

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
