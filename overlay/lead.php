<?php
/* =============================================================================
   lead.php — receives the campaign form (go.html#contact).

   The main site's contact form deliberately has no server: it opens the
   visitor's mail app. The campaign form cannot work that way — it promises
   "تم استلام طلبك", and that sentence may only appear once the request is
   really held somewhere. So this endpoint:

     1. validates the five fields (the same rules as go.js);
     2. appends the lead, with its campaign context, to a CSV kept OUTSIDE the
        web root when the host allows it (../pixora-leads/), or else in
        ./_leads/, which ships with an .htaccess that refuses every request;
     3. emails it to the approved address;
     4. answers {"ok":true} only if step 2 or 3 succeeded — otherwise 503, and
        the page offers WhatsApp with the details pre-written instead.

   No database, no dependencies, no third party. PHP 7.4+.
   A browser without JavaScript posts here directly and is redirected to
   go.html#sent (or back to the form) instead of receiving JSON.
   ============================================================================= */

declare(strict_types=1);

const LEAD_TO = 'muhalabsalah@gmail.com';
const RATE_LIMIT = 5;          // requests …
const RATE_WINDOW = 600;       // … per IP per ten minutes

const SERVICES = [
    'branding'   => 'الهوية والتصميم',
    'websites'   => 'المواقع الإلكترونية',
    'social'     => 'إدارة وسائل التواصل',
    'marketing'  => 'التسويق الرقمي والإعلانات',
    'integrated' => 'الحلول الرقمية المتكاملة',
    'unsure'     => 'غير متأكد — يحتاج استشارة',
];
const TRACKED = ['source', 'medium', 'campaign', 'content', 'term', 'landing', 'entry', 'device', 'path', 'ref'];

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

$wantsJson = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;

function finish(int $status, array $body, bool $json, string $redirect): void
{
    if ($json) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
    } else {
        header('Location: ' . $redirect, true, 303);
    }
    exit;
}

$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
$sentUrl = $base . '/go#sent';
$formUrl = $base . '/go?error=1#contact';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    finish(405, ['ok' => false, 'error' => 'method'], true, $formUrl);
}

/* ---- Input ---------------------------------------------------------------- */

function field(string $name, int $max): string
{
    $value = $_POST[$name] ?? '';
    if (!is_string($value)) {
        return '';
    }
    // Control characters out (keeps line breaks in the note), then trim and cap.
    $value = preg_replace('/[^\P{C}\n]+/u', '', $value) ?? '';
    $value = trim(preg_replace('/\s*\n\s*/u', "\n", $value) ?? '');
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max * 2);
}

function length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : (int) preg_match_all('/./su', $value);
}

// Bots fill the hidden "company" field; people never see it. Answer as if it
// worked so the bot learns nothing, and keep nothing.
if (field('company', 100) !== '') {
    finish(200, ['ok' => true], $wantsJson, $sentUrl);
}

$name     = str_replace("\n", ' ', field('name', 80));
$location = str_replace("\n", ' ', field('location', 80));
$service  = field('service', 20);
$note     = field('note', 600);

// Arabic-Indic and Persian digits → Latin, then strip spacing and punctuation.
$phone = strtr(field('whatsapp', 30), [
    '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
    '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
]);
$phone = preg_replace('/[\s\-().\x{200E}\x{200F}]/u', '', $phone) ?? '';
if (strpos($phone, '00') === 0) {
    $phone = '+' . substr($phone, 2);
}

$errors = [];
if (length($name) < 2)                       $errors['name'] = 'required';
if (!preg_match('/^\+?\d{8,15}$/', $phone))  $errors['whatsapp'] = 'invalid';
if (length($location) < 2)                   $errors['location'] = 'required';
if (!array_key_exists($service, SERVICES))   $errors['service'] = 'invalid';
if ($errors) {
    finish(422, ['ok' => false, 'errors' => $errors], $wantsJson, $formUrl);
}

$tracking = [];
foreach (TRACKED as $key) {
    $value = field('t_' . $key, 100);
    $tracking[$key] = preg_replace('/[^\p{L}\p{N} _.:\/|>+-]/u', '', $value) ?? '';
}
if (!preg_match('/^PX-[2-9A-HJKMNP-Z]{5}$/', $tracking['ref'])) {
    $tracking['ref'] = '';
}

/* ---- Storage -------------------------------------------------------------- */

require __DIR__ . '/_lib/storage.php';

$dir = pixoraStorageDir(true);

// Rate limit per IP, stored as a hash — the address itself is never written.
if ($dir !== null) {
    $ipKey = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|pixora');
    $rateFile = $dir . '/rate.json';
    $handle = @fopen($rateFile, 'c+');
    if ($handle && flock($handle, LOCK_EX)) {
        $rates = json_decode((string) stream_get_contents($handle), true) ?: [];
        $now = time();
        foreach ($rates as $key => $stamps) {
            $rates[$key] = array_values(array_filter((array) $stamps, static fn ($t) => $t > $now - RATE_WINDOW));
            if (!$rates[$key]) unset($rates[$key]);
        }
        $limited = count($rates[$ipKey] ?? []) >= RATE_LIMIT;
        if (!$limited) {
            $rates[$ipKey][] = $now;
        }
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, (string) json_encode($rates));
        flock($handle, LOCK_UN);
        fclose($handle);
        if ($limited) {
            finish(429, ['ok' => false, 'error' => 'rate'], $wantsJson, $formUrl);
        }
    }
}

$receivedAt = gmdate('Y-m-d\TH:i:s\Z');
$row = array_merge(
    [$receivedAt, $name, $phone, $location, $service, $note],
    array_values($tracking)
);

$stored = false;
if ($dir !== null) {
    $file = $dir . '/leads.csv';
    $isNew = !file_exists($file);
    $handle = @fopen($file, 'a');
    if ($handle && flock($handle, LOCK_EX)) {
        if ($isNew) {
            fwrite($handle, "\xEF\xBB\xBF"); // BOM, so Excel reads the Arabic correctly
            fputcsv($handle, array_merge(['received_at', 'name', 'whatsapp', 'location', 'service', 'note'], TRACKED));
        }
        // A cell that starts with = + - @ is a formula to a spreadsheet.
        $safe = array_map(static fn ($v) => preg_match('/^[=+\-@\t\r]/', (string) $v) ? "'" . $v : $v, $row);
        $stored = fputcsv($handle, $safe) !== false;
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

/* ---- Email ---------------------------------------------------------------- */

$host = preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
$host = preg_replace('/^www\./i', '', $host);
$waLink = 'https://wa.me/' . ltrim($phone, '+');
$subject = 'طلب جديد — ' . $name . ' — ' . SERVICES[$service];
$lines = [
    'طلب جديد من صفحة الحملة',
    '',
    'الاسم: ' . $name,
    'واتساب: ' . $phone . '  (' . $waLink . ')',
    'الدولة / المدينة: ' . $location,
    'الخدمة: ' . SERVICES[$service],
    'ملاحظة: ' . ($note !== '' ? $note : '—'),
    '',
    '— مصدر الطلب —',
];
foreach ($tracking as $key => $value) {
    $lines[] = str_pad($key, 9) . ': ' . ($value !== '' ? $value : '—');
}
$lines[] = 'received : ' . $receivedAt;
$body = implode("\r\n", $lines);

$headers = implode("\r\n", [
    'From: Pixora Website <no-reply@' . $host . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: Pixora lead form',
]);
$mailed = false;
if (function_exists('mail')) {
    $mailed = @mail(LEAD_TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
}

if (!$stored && !$mailed) {
    error_log('pixora lead.php: lead could not be stored or mailed');
    finish(503, ['ok' => false, 'error' => 'unavailable'], $wantsJson, $formUrl);
}

finish(200, ['ok' => true, 'ref' => $tracking['ref']], $wantsJson, $sentUrl);
