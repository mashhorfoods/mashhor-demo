<?php
/**
 * فحص الموقع من الخارج — بلا SSH وبلا وصول إلى الخادم.
 *
 * bin/preflight.php reads .env, opens the database and inspects the disk, so
 * it can only run on the server itself. But four of the things it reports are
 * not facts about the disk at all — they are facts about what the server
 * *sends*: the certificate, the headers LiteSpeed actually applies, whether
 * text is compressed, and where the redirects go. Every one of those is
 * visible to any HTTP client anywhere.
 *
 * So this script needs nothing but an internet connection. Run it from your
 * own computer:
 *
 *     php bin/remote-check.php https://aunaldrb.com
 *
 * It reads only. It never signs in, never posts, never touches the database,
 * and asks for no credential — so there is nothing it can damage and nothing
 * it can leak. It is safe against the live site as often as you like.
 *
 * PASS  the server does it
 * WARN  worth knowing, not a reason to stop
 * FAIL  fix before the site is open to visitors
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$BASE = rtrim($argv[1] ?? 'https://aunaldrb.com', '/');
if (!preg_match('#^https?://#', $BASE)) $BASE = 'https://' . $BASE;
$HOST = (string) parse_url($BASE, PHP_URL_HOST);
$IS_HTTPS = str_starts_with($BASE, 'https://');

$pass = 0; $warn = 0; $fail = 0; $lines = []; $failed = [];

function out(string $mark, string $name, string $detail = ''): void
{
    global $pass, $warn, $fail, $lines, $failed;
    if ($mark === 'PASS') $pass++; elseif ($mark === 'WARN') $warn++; else { $fail++; $failed[] = $name . ' — ' . $detail; }
    $lines[] = sprintf('  %-4s %-52s %s', $mark, $name, $detail);
}
function ok(string $n, bool $c, string $d = '', bool $soft = false): void
{
    out($c ? 'PASS' : ($soft ? 'WARN' : 'FAIL'), $n, $d);
}
function section(string $t): void { global $lines; $lines[] = "\n" . $t; }

/**
 * One request. Returns status, headers (lower-cased keys), body and the final
 * URL after redirects — or after none, when $follow is false, because "where
 * does it redirect to" is one of the questions.
 */
function req(string $url, array $o = []): array
{
    $follow  = $o['follow']  ?? false;
    $method  = $o['method']  ?? 'GET';
    $headers = $o['headers'] ?? [];
    $h = ['User-Agent: aun-remote-check/1.0', 'Accept: */*'];
    foreach ($headers as $k => $v) $h[] = "{$k}: {$v}";

    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER         => true,
            CURLOPT_NOBODY         => $method === 'HEAD',
            CURLOPT_FOLLOWLOCATION => $follow,
            CURLOPT_MAXREDIRS      => 10,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER     => $h,
            CURLOPT_ENCODING       => $o['encoding'] ?? '',   /* '' = offer all we support */
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_CERTINFO       => true,
        ]);
        $raw = curl_exec($c);
        if ($raw === false) {
            $err = curl_error($c); curl_close($c);
            return ['status' => 0, 'headers' => [], 'body' => '', 'error' => $err, 'final' => $url];
        }
        $info = curl_getinfo($c);
        curl_close($c);
        $head = substr($raw, 0, $info['header_size']);
        $body = substr($raw, $info['header_size']);
        return ['status' => (int) $info['http_code'], 'headers' => parseHeaders($head),
                'body' => (string) $body, 'error' => null, 'final' => (string) $info['url'],
                'certinfo' => $info['certinfo'] ?? [], 'raw_head' => $head];
    }

    /* no curl extension — streams still answer every question but the cert */
    $ctx = stream_context_create(['http' => [
        'method' => $method, 'header' => implode("\r\n", $h), 'ignore_errors' => true,
        'follow_location' => $follow ? 1 : 0, 'max_redirects' => $follow ? 10 : 1, 'timeout' => 20,
    ], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'capture_peer_cert' => true]]);
    $body = @file_get_contents($url, false, $ctx);
    $hdr  = $http_response_header ?? [];
    $status = 0;
    foreach ($hdr as $l) if (preg_match('#^HTTP/\S+\s+(\d{3})#', $l, $m)) $status = (int) $m[1];
    return ['status' => $status, 'headers' => parseHeaders(implode("\r\n", $hdr)),
            'body' => (string) $body, 'error' => $body === false ? 'request failed' : null,
            'final' => $url, 'certinfo' => [], 'raw_head' => implode("\r\n", $hdr)];
}

function parseHeaders(string $raw): array
{
    $h = [];
    foreach (preg_split('/\r?\n/', $raw) as $line) {
        $c = strpos($line, ':');
        if ($c === false) continue;
        $h[strtolower(trim(substr($line, 0, $c)))] = trim(substr($line, $c + 1));
    }
    return $h;
}
function hdr(array $r, string $k): string { return (string) ($r['headers'][strtolower($k)] ?? ''); }

/* ================================================================== */
fwrite(STDOUT, "\n" . str_repeat('=', 74) . "\n");
fwrite(STDOUT, "  فحص خارجي — {$BASE}\n");
fwrite(STDOUT, '  ' . gmdate('Y-m-d H:i') . " UTC · لا يحتاج وصولاً إلى الخادم\n");
fwrite(STDOUT, str_repeat('=', 74) . "\n");

section('الوصول والشهادة');
$home = req($BASE . '/', ['follow' => true]);
if ($home['error'] !== null && $home['status'] === 0) {
    out('FAIL', 'الموقع يستجيب', $home['error']);
    fwrite(STDOUT, implode("\n", $lines) . "\n\nتعذّر الوصول إلى الموقع — لا يمكن إكمال الفحص.\n");
    exit(2);
}
ok('الموقع يستجيب', $home['status'] === 200, 'status=' . $home['status']);
ok('يُقدَّم عبر HTTPS', str_starts_with($home['final'], 'https://'), $home['final']);

/* the certificate, and how long is left on it */
if ($IS_HTTPS && !empty($home['certinfo'][0])) {
    $ci = $home['certinfo'][0];
    $until = strtotime((string) ($ci['Expire date'] ?? ''));
    $days = $until ? (int) floor(($until - time()) / 86400) : -1;
    ok('الشهادة صالحة ولم تنتهِ', $days > 0,
        $days >= 0 ? "تنتهي بعد {$days} يوماً · " . (string) ($ci['Issuer'] ?? '') : 'تعذّرت القراءة');
    if ($days > 0 && $days < 21) out('WARN', 'وتُجدَّد قريباً', "{$days} يوماً متبقّية");
} elseif ($IS_HTTPS) {
    out('WARN', 'تفاصيل الشهادة', 'تحتاج امتداد curl لقراءتها — التحقّق من الصلاحية تمّ بنجاح الاتصال');
}

/* http -> https, and www -> bare */
if ($IS_HTTPS) {
    $plain = req('http://' . $HOST . '/');
    ok('http يُحوَّل إلى https تحويلاً دائماً',
        in_array($plain['status'], [301, 308], true) && str_starts_with(hdr($plain, 'location'), 'https://'),
        $plain['status'] . ' → ' . (hdr($plain, 'location') ?: '—'));
    $www = req('https://www.' . $HOST . '/');
    ok('www يُحوَّل إلى النطاق المجرّد',
        $www['status'] === 0 || in_array($www['status'], [301, 308], true),
        $www['status'] === 0 ? 'www غير معرَّف — لا بأس' : ($www['status'] . ' → ' . (hdr($www, 'location') ?: '—')),
        true);
}

section('رؤوس الحماية — كما يرسلها الخادم فعلاً');
$H = [
    'Content-Security-Policy'   => ['content-security-policy', true],
    'Strict-Transport-Security' => ['strict-transport-security', $IS_HTTPS],
    'X-Frame-Options'           => ['x-frame-options', true],
    'X-Content-Type-Options'    => ['x-content-type-options', true],
    'Referrer-Policy'           => ['referrer-policy', true],
    'Permissions-Policy'        => ['permissions-policy', false],
];
foreach ($H as $label => [$key, $required]) {
    $v = hdr($home, $key);
    ok($label, $v !== '', $v !== '' ? mb_strimwidth($v, 0, 58, '…') : 'غائب', !$required);
}
$csp = hdr($home, 'content-security-policy');
if ($csp !== '') {
    ok('وسياسة المحتوى تسمّي السكربتات ببصماتها',
        str_contains($csp, 'sha256-') && !str_contains($csp, "'unsafe-inline'"),
        str_contains($csp, "'unsafe-inline'") ? "تحتوي 'unsafe-inline'" : 'بالبصمات');
}
$hsts = hdr($home, 'strict-transport-security');
if ($hsts !== '') {
    preg_match('/max-age=(\d+)/', $hsts, $m);
    $age = (int) ($m[1] ?? 0);
    ok('ومدّة HSTS سنة على الأقل', $age >= 31536000, "max-age={$age}", true);
}

section('الضغط والتخزين');
$gz = req($BASE . '/', ['headers' => ['Accept-Encoding' => 'gzip, br'], 'encoding' => 'identity']);
$enc = hdr($gz, 'content-encoding');
ok('صفحة HTML تُضغَط قبل إرسالها', in_array($enc, ['gzip', 'br', 'deflate', 'zstd'], true), $enc ?: 'بلا ضغط');
$cc = hdr($home, 'cache-control');
ok('وصفحة HTML لا تُخزَّن طويلاً',
    $cc === '' || preg_match('/no-cache|no-store|max-age=0|must-revalidate/i', $cc) === 1,
    $cc ?: '(بلا رأس — مقبول)', true);

/* a static asset should be cached hard; the manifest is one that always exists */
$asset = req($BASE . '/img/manifest.json');
if ($asset['status'] === 200) {
    $acc = hdr($asset, 'cache-control');
    preg_match('/max-age=(\d+)/', $acc, $m);
    ok('والأصول الثابتة تُخزَّن طويلاً', (int) ($m[1] ?? 0) >= 86400, $acc ?: 'بلا رأس', true);
}

section('ما يجب ألّا يُخدَم');
foreach (['/.env', '/app/bootstrap.php', '/app/Env.php', '/app/storage/aun.sqlite',
          '/bin/seed.php', '/bin/preflight.php', '/.git/config', '/install.php',
          '/recover.php', '/.build-stamp.json'] as $p) {
    $r = req($BASE . $p);
    $blocked = in_array($r['status'], [401, 403, 404], true) || trim($r['body']) === '';
    ok('محجوب: ' . $p, $blocked, 'status=' . $r['status']);
}

section('لوحة التحكم');
$adm = req($BASE . '/admin/dashboard');
ok('الزائر المجهول لا يرى اللوحة',
    in_array($adm['status'], [301, 302, 303, 401, 403], true), 'status=' . $adm['status']);
ok('ولا تُرسَل معه أي بنية للوحة',
    !str_contains($adm['body'], 'aun-shell') && strlen($adm['body']) < 4096,
    strlen($adm['body']) . ' bytes');
$login = req($BASE . '/admin/login');
ok('صفحة الدخول تُقدَّم', $login['status'] === 200, 'status=' . $login['status']);
ok('ومحجوبة عن محرّكات البحث',
    str_contains(strtolower(hdr($login, 'x-robots-tag')), 'noindex'),
    hdr($login, 'x-robots-tag') ?: 'غائب');
$dotted = req($BASE . '/admin/login.html');
ok('والعنوان بامتداد .html يُحوَّل إلى النظيف',
    in_array($dotted['status'], [301, 308], true) && str_contains(hdr($dotted, 'location'), '/admin/login'),
    $dotted['status'] . ' → ' . (hdr($dotted, 'location') ?: '—'));

section('الواجهة والصفحة العامة');
$health = req($BASE . '/api/health');
ok('/api/health يجيب', $health['status'] === 200, 'status=' . $health['status']);
ok('ولا يكشف بيانات اعتماد',
    preg_match('/(DB_PASS|DB_USER|APP_KEY|password)"\s*:\s*"[^"]+"/i', $health['body']) !== 1);
ok('الصفحة العامة تحمل اسم النشاط',
    str_contains($home['body'], 'عون الدرب'), strlen($home['body']) . ' bytes');
/* the one wording rule the whole project is held to */
$banned = [];
foreach (['ذوي الإعاقة', 'الإعاقة', 'معاق', 'معاقين', 'معاقون'] as $w) {
    if (str_contains($home['body'], $w)) $banned[] = $w;
}
ok('والمصطلح المعتمد وحده يظهر فيها', $banned === [], implode('، ', $banned));
$notfound = req($BASE . '/this-page-does-not-exist-' . bin2hex(random_bytes(4)));
ok('عنوان غير موجود يردّ 404', $notfound['status'] === 404, 'status=' . $notfound['status']);

/* ================================================================== */
fwrite(STDOUT, implode("\n", $lines) . "\n");
fwrite(STDOUT, "\n" . str_repeat('=', 74) . "\n");
fwrite(STDOUT, sprintf("  %d passed, %d warnings, %d failed\n", $pass, $warn, $fail));
fwrite(STDOUT, str_repeat('=', 74) . "\n");
if ($failed !== []) {
    fwrite(STDOUT, "\nما يجب إصلاحه قبل فتح الموقع للزوّار:\n");
    foreach ($failed as $f) fwrite(STDOUT, "  - {$f}\n");
} else {
    fwrite(STDOUT, "\nلا إخفاق. ما لا يزال خارج قياس هذا الفحص: محتوى .env وقاعدة\n"
        . "البيانات وصلاحيات الملفات — وهي التي يقيسها bin/preflight.php على الخادم.\n");
}
exit($fail === 0 ? 0 : 1);
