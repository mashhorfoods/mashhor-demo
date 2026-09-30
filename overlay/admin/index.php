<?php
/* =============================================================================
   /admin/ — Pixora's control page for campaign requests.

   Reads the leads lead.php stores (leads.csv), and keeps its own small state
   next to them (admin-state.json: status + internal note per request). No
   database, no dependencies, PHP 7.4+.

   What it does
     - sign in with one password (hash in config.php; the owner sets it),
       wrong-password lockout per address, session cookie that is HttpOnly,
       SameSite=Strict and Secure on HTTPS, CSRF token on every change;
     - list requests newest first, with totals, search and filters
       (status, source, campaign, service);
     - per request: reply on WhatsApp with a ready greeting, call, set a
       status (new / contacted / agreed / not interested), keep a note;
     - export what is on screen to a CSV that opens in Excel with Arabic intact.

   Scripts: only ./admin.js (external), so the site's Content-Security-Policy
   in .htaccess covers this page without a new hash.
   ============================================================================= */

declare(strict_types=1);
require __DIR__ . '/config.php';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

const SERVICES = [
    'branding'   => 'الهوية والتصميم',
    'websites'   => 'المواقع الإلكترونية',
    'social'     => 'إدارة وسائل التواصل',
    'marketing'  => 'التسويق الرقمي والإعلانات',
    'integrated' => 'الحلول الرقمية المتكاملة',
    'unsure'     => 'يحتاج استشارة',
];
const STATUSES = [
    'new'       => 'جديد',
    'contacted' => 'تم التواصل',
    'won'       => 'تم الاتفاق',
    'lost'      => 'غير مهتم',
];
const PLATFORMS = [
    'snapchat' => 'سناب شات', 'instagram' => 'إنستغرام', 'facebook' => 'فيسبوك', 'meta' => 'ميتا',
    'tiktok' => 'تيك توك', 'x' => 'إكس', 'google' => 'جوجل', 'youtube' => 'يوتيوب',
    'linkedin' => 'لينكدإن', 'direct' => 'مباشر',
];

/* ---- Session ---------------------------------------------------------------- */

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('pixora_admin');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php'), '/') . '/',
    'secure'   => $https,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

// Two idle hours and the session ends.
if (isset($_SESSION['seen']) && time() - $_SESSION['seen'] > 7200) {
    $_SESSION = [];
    session_regenerate_id(true);
}
$_SESSION['seen'] = time();
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function here(array $params = []): string
{
    $query = http_build_query(array_filter($params, static fn ($v) => $v !== '' && $v !== null));
    return './' . ($query ? '?' . $query : '');
}

function redirect(string $to): void
{
    header('Location: ' . $to, true, 303);
    exit;
}

function checkCsrf(): void
{
    if (!hash_equals($_SESSION['csrf'], (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('انتهت صلاحية الصفحة. ارجع وحدّثها ثم أعد المحاولة.');
    }
}

/* ---- Storage (the same places lead.php writes to) -------------------------- */

require dirname(__DIR__) . '/_lib/storage.php';

function readJson(?string $file): array
{
    if ($file === null || !is_file($file)) {
        return [];
    }
    return json_decode((string) file_get_contents($file), true) ?: [];
}

function writeJson(?string $file, array $data): bool
{
    if ($file === null) {
        return false;
    }
    return file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) !== false;
}

function readLeads(?string $dir): array
{
    $file = $dir === null ? null : $dir . '/leads.csv';
    if ($file === null || !is_file($file) || !($handle = fopen($file, 'r'))) {
        return [];
    }
    $header = fgetcsv($handle, 0, ',', '"', '\\');
    if (!$header) {
        return [];
    }
    $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
    $leads = [];
    while (($row = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
        if (count($row) !== count($header)) {
            continue;
        }
        // lead.php prefixes formula-like cells with ' for spreadsheets; undo it.
        $row = array_map(static fn ($v) => preg_match("/^'[=+\\-@]/", (string) $v) ? substr((string) $v, 1) : (string) $v, $row);
        $lead = array_combine($header, $row);
        // Campaign leads keep their id (received_at|whatsapp); a site message
        // without a number is told apart by its email.
        $lead['id'] = substr(sha1($lead['received_at'] . '|' . ($lead['whatsapp'] !== '' ? $lead['whatsapp'] : $lead['location'])), 0, 12);
        $lead['email'] = strpos($lead['location'], '@') !== false ? $lead['location'] : '';
        $leads[] = $lead;
    }
    fclose($handle);
    return array_reverse($leads);
}

$dir = pixoraStorageDir();
$stateFile = $dir === null ? null : $dir . '/admin-state.json';
$attemptsFile = $dir === null ? null : $dir . '/admin-attempts.json';
$action = (string) ($_POST['action'] ?? $_GET['action'] ?? '');
$signedIn = !empty($_SESSION['admin']);

/* ---- Actions that need no session ------------------------------------------ */

$setupHash = null;
$loginError = '';

if ($action === 'setup' && ADMIN_PASSWORD_HASH === '' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();
    $password = (string) ($_POST['password'] ?? '');
    if (strlen($password) < 10) {
        $loginError = 'اختر كلمة مرور من 10 أحرف على الأقل.';
    } elseif ($password !== (string) ($_POST['confirm'] ?? '')) {
        $loginError = 'كلمتا المرور غير متطابقتين.';
    } else {
        // Shown once, never stored: the owner pastes it into config.php.
        $setupHash = password_hash($password, PASSWORD_DEFAULT);
    }
}

if ($action === 'login' && ADMIN_PASSWORD_HASH !== '' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();
    $who = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|pixora-admin');
    $attempts = readJson($attemptsFile);
    $recent = array_values(array_filter((array) ($attempts[$who] ?? []), static fn ($t) => $t > time() - ADMIN_LOCKOUT));
    if (count($recent) >= ADMIN_MAX_ATTEMPTS) {
        $loginError = 'محاولات كثيرة. انتظر ربع ساعة ثم حاول مجددًا.';
    } elseif (password_verify((string) ($_POST['password'] ?? ''), ADMIN_PASSWORD_HASH)) {
        unset($attempts[$who]);
        writeJson($attemptsFile, $attempts);
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        redirect(here());
    } else {
        $recent[] = time();
        $attempts[$who] = $recent;
        writeJson($attemptsFile, $attempts);
        $loginError = 'كلمة المرور غير صحيحة.';
    }
}

if ($action === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();
    $_SESSION = [];
    session_regenerate_id(true);
    redirect(here());
}

/* ---- Signed-in actions ------------------------------------------------------ */

$filters = [
    'q'        => trim((string) ($_GET['q'] ?? '')),
    'status'   => (string) ($_GET['status'] ?? ''),
    'source'   => (string) ($_GET['source'] ?? ''),
    'campaign' => (string) ($_GET['campaign'] ?? ''),
    'service'  => (string) ($_GET['service'] ?? ''),
];

$flash = '';
if ($signedIn && $action === 'update' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    checkCsrf();
    $id = (string) ($_POST['id'] ?? '');
    $status = (string) ($_POST['status'] ?? 'new');
    if (preg_match('/^[a-f0-9]{12}$/', $id) && isset(STATUSES[$status])) {
        $state = readJson($stateFile);
        $state[$id] = [
            'status'  => $status,
            'note'    => mb_substr(trim((string) ($_POST['note'] ?? '')), 0, 1000),
            'updated' => gmdate('c'),
        ];
        $_SESSION['flash'] = writeJson($stateFile, $state) ? 'تم الحفظ.' : 'تعذّر الحفظ — تحقق من صلاحيات مجلد الطلبات.';
    }
    $back = [];
    foreach ($filters as $key => $value) {
        $back[$key] = (string) ($_POST['f_' . $key] ?? '');
    }
    redirect(here($back) . '#lead-' . $id);
}
if (isset($_SESSION['flash'])) {
    $flash = $_SESSION['flash'];
    unset($_SESSION['flash']);
}

$leads = [];
$state = [];
if ($signedIn) {
    $state = readJson($stateFile);
    foreach (readLeads($dir) as $lead) {
        $lead['status'] = $state[$lead['id']]['status'] ?? 'new';
        $lead['admin_note'] = $state[$lead['id']]['note'] ?? '';
        $leads[] = $lead;
    }
}

$visible = array_values(array_filter($leads, static function (array $lead) use ($filters): bool {
    foreach (['status', 'source', 'campaign', 'service'] as $key) {
        if ($filters[$key] !== '' && ($lead[$key] ?? '') !== $filters[$key]) {
            return false;
        }
    }
    if ($filters['q'] !== '') {
        $haystack = implode(' ', [$lead['name'], $lead['whatsapp'], $lead['location'], $lead['note'], $lead['ref'] ?? '', $lead['admin_note']]);
        if (mb_stripos($haystack, $filters['q']) === false) {
            return false;
        }
    }
    return true;
}));

if ($signedIn && $action === 'export') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="pixora-leads-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['التاريخ', 'الاسم', 'واتساب', 'الدولة / المدينة', 'الخدمة', 'ملاحظة العميل', 'الحالة', 'ملاحظة داخلية', 'المصدر', 'الحملة', 'المسار', 'الجهاز', 'رقم المرجع'], ',', '"', '\\');
    foreach ($visible as $lead) {
        $row = [$lead['received_at'], $lead['name'], $lead['whatsapp'], $lead['location'], SERVICES[$lead['service']] ?? $lead['service'],
            $lead['note'], STATUSES[$lead['status']], $lead['admin_note'], $lead['source'] ?? '', $lead['campaign'] ?? '',
            $lead['path'] ?? '', $lead['device'] ?? '', $lead['ref'] ?? ''];
        fputcsv($out, array_map(static fn ($v) => preg_match('/^[=+\-@]/', (string) $v) ? "'" . $v : $v, $row), ',', '"', '\\');
    }
    exit;
}

/* ---- View helpers ------------------------------------------------------------ */

function when(string $iso): string
{
    try {
        $date = new DateTime($iso);
        $date->setTimezone(new DateTimeZone('Asia/Riyadh'));
        return $date->format('Y-m-d · H:i');
    } catch (Exception $e) {
        return $iso;
    }
}

function platform(string $source): string
{
    return PLATFORMS[$source] ?? $source;
}

function waReply(array $lead): string
{
    $service = SERVICES[$lead['service']] ?? 'مشروعك';
    $text = "مرحبًا {$lead['name']}، معك فريق بيكسورا 👋\nوصلنا طلبك بخصوص {$service}، ويسعدنا نساعدك. متى يناسبك نتحدث؟";
    return 'https://wa.me/' . ltrim($lead['whatsapp'], '+') . '?text=' . rawurlencode($text);
}

function options(array $values, string $selected, string $all): string
{
    $html = '<option value="">' . e($all) . '</option>';
    foreach ($values as $value => $label) {
        $html .= '<option value="' . e((string) $value) . '"' . ((string) $value === $selected ? ' selected' : '') . '>' . e($label) . '</option>';
    }
    return $html;
}

$counts = ['all' => count($leads), 'new' => 0, 'week' => 0];
$sources = [];
$campaigns = [];
foreach ($leads as $lead) {
    if ($lead['status'] === 'new') $counts['new']++;
    if (strtotime($lead['received_at']) > time() - 7 * 86400) $counts['week']++;
    if (($lead['source'] ?? '') !== '') $sources[$lead['source']] = ($sources[$lead['source']] ?? 0) + 1;
    if (($lead['campaign'] ?? '') !== '') $campaigns[$lead['campaign']] = $lead['campaign'];
}
arsort($sources);
$topSource = $sources ? platform((string) array_key_first($sources)) : '—';
$sourceOptions = [];
foreach (array_keys($sources) as $source) {
    $sourceOptions[$source] = platform((string) $source);
}
$csrf = e($_SESSION['csrf']);
?>
<!doctype html>
<html lang="ar" dir="rtl" class="no-js">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="color-scheme" content="dark" />
  <title>لوحة الطلبات — Pixora</title>
  <!-- SHARED-STYLES: the site's own stylesheet (tokens, fonts, buttons, fields), linked by the build (finalize.py) -->
  <style>
    @layer components {
      body { min-block-size: 100svh; }
      .a-top { position: sticky; inset-block-start: 0; z-index: var(--z-header); border-block-end: var(--border-hairline); background-color: rgba(32,32,32,0.92); backdrop-filter: blur(12px); }
      .a-top__inner { display: flex; align-items: center; justify-content: space-between; gap: var(--space-16); min-block-size: 72px; }
      .a-top__end { display: flex; align-items: center; gap: var(--space-12); }
      .a-main { padding-block: var(--space-48) var(--space-96); }
      .a-title { font-size: var(--text-h2); font-weight: var(--weight-bold); line-height: var(--leading-heading); margin-block-end: var(--space-32); }
      .a-stats { display: grid; gap: var(--space-16); grid-template-columns: repeat(2, minmax(0, 1fr)); margin-block-end: var(--space-40); }
      @media (min-width: 48em) { .a-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-24); } }
      .a-stat { padding: var(--space-24); border: var(--border-hairline); border-radius: var(--radius-lg); background-color: var(--color-bg-sunken); }
      .a-stat b { display: block; font-size: var(--text-h2); color: var(--color-text-primary); font-family: "Poppins", var(--font-arabic); }
      .a-stat--accent b { color: var(--color-accent); }
      .a-stat span { font-size: var(--text-small); color: var(--color-text-muted); }
      .a-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-12); margin-block-end: var(--space-40); padding: var(--space-24); border: var(--border-hairline); border-radius: var(--radius-lg); }
      .a-filters > :first-child { grid-column: 1 / -1; }
      @media (min-width: 64em) { .a-filters { grid-template-columns: 2fr repeat(4, 1fr) auto auto; align-items: end; } .a-filters > :first-child { grid-column: auto; } }
      .a-list { display: grid; gap: var(--space-24); margin: 0; padding: 0; list-style: none; }
      .a-lead { display: grid; gap: var(--space-24); padding: var(--space-24); border: var(--border-hairline); border-radius: var(--radius-lg); background-color: var(--color-bg-sunken); scroll-margin-block-start: 96px; }
      @media (min-width: 64em) { .a-lead { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); padding: var(--space-32); gap: var(--space-40); } }
      .a-lead--new { border-inline-start: 3px solid var(--color-accent); }
      .a-lead__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-8) var(--space-16); margin-block-end: var(--space-12); }
      .a-lead__name { font-size: var(--text-h4); font-weight: var(--weight-bold); }
      .a-lead__time { font-size: var(--text-small); color: var(--color-text-muted); direction: ltr; unicode-bidi: isolate; }
      .a-lead__meta { display: grid; gap: var(--space-4); color: var(--color-text-secondary); font-size: var(--text-body-sm); }
      .a-lead__meta bdi { color: var(--color-text-primary); }
      .a-lead__quote { margin-block-start: var(--space-12); padding: var(--space-12) var(--space-16); border-radius: var(--radius-md); background-color: var(--color-surface); white-space: pre-line; }
      .a-tags { display: flex; flex-wrap: wrap; gap: var(--space-8); margin-block-start: var(--space-16); }
      .a-tag { display: inline-flex; align-items: center; min-block-size: 28px; padding-inline: var(--space-12); border-radius: var(--radius-pill); border: var(--border-hairline); font-size: var(--text-label); color: var(--color-text-secondary); }
      .a-tag--status-new { border-color: var(--color-accent); color: var(--color-accent); }
      .a-tag--status-won { border-color: var(--color-success); color: var(--color-success); }
      .a-tag--status-lost { color: var(--color-text-muted); }
      .a-actions { display: flex; flex-wrap: wrap; gap: var(--space-12); margin-block-end: var(--space-16); }
      .a-actions .c-btn { flex: 1 1 10rem; }
      .a-form { display: grid; gap: var(--space-12); }
      .a-empty { padding: var(--space-64) var(--space-24); text-align: center; color: var(--color-text-muted); border: 1px dashed var(--color-border-strong); border-radius: var(--radius-lg); }
      .a-flash { margin-block-end: var(--space-24); padding: var(--space-12) var(--space-16); border-radius: var(--radius-pill); background-color: var(--color-accent-subtle); color: var(--color-accent); }
      .a-gate { min-block-size: 100svh; display: grid; place-items: center; padding: var(--space-24); }
      .a-gate__card { inline-size: min(100%, 26rem); display: grid; gap: var(--space-24); padding: var(--space-40) var(--space-32); border: var(--border-hairline); border-radius: var(--radius-lg); background-color: var(--color-bg-sunken); }
      .a-error { color: var(--color-danger); font-size: var(--text-body-sm); }
      .a-code { direction: ltr; text-align: left; padding: var(--space-16); border-radius: var(--radius-md); background-color: var(--color-bg-deep); font-family: ui-monospace, monospace; font-size: var(--text-small); overflow-wrap: anywhere; user-select: all; }
      .a-muted { color: var(--color-text-muted); font-size: var(--text-small); }
    }
  </style>
  <script defer src="./admin.js"></script>
</head>
<body>
<?php if (!$signedIn): ?>
  <main class="a-gate">
    <div class="a-gate__card">
      <span class="c-brand" aria-hidden="true"><span class="c-brand__word">PI<span class="c-brand__accent">X</span>ORA</span></span>
<?php if (ADMIN_PASSWORD_HASH === ''): ?>
<?php if ($setupHash !== null): ?>
      <h1 class="t-h3">خطوة أخيرة</h1>
      <p class="t-body-sm">افتح الملف <bdi dir="ltr">admin/config.php</bdi> على الاستضافة (hPanel ← File Manager) واستبدل السطر الذي يبدأ بـ <bdi dir="ltr">const ADMIN_PASSWORD_HASH</bdi> بهذا السطر، ثم احفظ وحدّث الصفحة:</p>
      <p class="a-code">const ADMIN_PASSWORD_HASH = '<?= e($setupHash) ?>';</p>
      <p class="a-muted">لم تُحفظ كلمة المرور في أي مكان — هذا السطر هو الشيء الوحيد الذي يثبتها.</p>
<?php else: ?>
      <h1 class="t-h3">إعداد لوحة الطلبات</h1>
      <p class="t-body-sm">اختر كلمة المرور التي ستدخل بها. ستحصل على سطر واحد تلصقه في ملف الإعدادات.</p>
      <form method="post" class="a-form" autocomplete="off">
        <input type="hidden" name="action" value="setup" />
        <input type="hidden" name="csrf" value="<?= $csrf ?>" />
        <p class="c-field"><label class="c-field__label" for="pw">كلمة المرور (10 أحرف على الأقل)</label>
          <input class="c-field__control" id="pw" name="password" type="password" minlength="10" required autocomplete="new-password" /></p>
        <p class="c-field"><label class="c-field__label" for="pw2">أعد كتابتها</label>
          <input class="c-field__control" id="pw2" name="confirm" type="password" minlength="10" required autocomplete="new-password" /></p>
        <?php if ($loginError): ?><p class="a-error" role="alert"><?= e($loginError) ?></p><?php endif; ?>
        <button class="c-btn c-btn--primary c-btn--block" type="submit">أنشئ سطر الإعداد</button>
      </form>
<?php endif; ?>
<?php else: ?>
      <h1 class="t-h3">لوحة الطلبات</h1>
      <form method="post" class="a-form">
        <input type="hidden" name="action" value="login" />
        <input type="hidden" name="csrf" value="<?= $csrf ?>" />
        <p class="c-field"><label class="c-field__label" for="pw">كلمة المرور</label>
          <input class="c-field__control" id="pw" name="password" type="password" required autofocus autocomplete="current-password" /></p>
        <?php if ($loginError): ?><p class="a-error" role="alert"><?= e($loginError) ?></p><?php endif; ?>
        <button class="c-btn c-btn--primary c-btn--block" type="submit">دخول</button>
      </form>
<?php endif; ?>
    </div>
  </main>
<?php else: ?>
  <header class="a-top">
    <div class="l-container a-top__inner">
      <span class="c-brand"><span class="c-brand__word">PI<span class="c-brand__accent">X</span>ORA</span><span class="c-brand__tagline">لوحة الطلبات</span></span>
      <div class="a-top__end">
        <a class="c-btn c-btn--secondary" href="<?= e(here($filters + ['action' => 'export'])) ?>">تصدير Excel</a>
        <form method="post"><input type="hidden" name="action" value="logout" /><input type="hidden" name="csrf" value="<?= $csrf ?>" />
          <button class="c-btn c-btn--ghost" type="submit">خروج</button></form>
      </div>
    </div>
  </header>
  <main class="a-main">
    <div class="l-container">
      <h1 class="a-title">الطلبات</h1>
      <?php if ($flash): ?><p class="a-flash" role="status"><?= e($flash) ?></p><?php endif; ?>
      <?php if ($dir === null): ?><p class="a-flash">لم يُعثر على مجلد الطلبات بعد — سيظهر تلقائيًا مع أول طلب يصل من صفحة الحملة.</p><?php endif; ?>

      <div class="a-stats">
        <div class="a-stat"><b><?= $counts['all'] ?></b><span>كل الطلبات</span></div>
        <div class="a-stat a-stat--accent"><b><?= $counts['new'] ?></b><span>بانتظار التواصل</span></div>
        <div class="a-stat"><b><?= $counts['week'] ?></b><span>آخر 7 أيام</span></div>
        <div class="a-stat"><b><?= e($topSource) ?></b><span>أكثر مصدر</span></div>
      </div>

      <form class="a-filters" method="get" role="search">
        <p class="c-field"><label class="c-field__label" for="q">بحث</label>
          <input class="c-field__control" id="q" name="q" type="search" value="<?= e($filters['q']) ?>" placeholder="اسم، رقم، مدينة، رقم مرجع…" /></p>
        <p class="c-field"><label class="c-field__label" for="f-status">الحالة</label>
          <select class="c-field__control c-field__select" id="f-status" name="status" data-autosubmit><?= options(STATUSES, $filters['status'], 'الكل') ?></select></p>
        <p class="c-field"><label class="c-field__label" for="f-source">المصدر</label>
          <select class="c-field__control c-field__select" id="f-source" name="source" data-autosubmit><?= options($sourceOptions, $filters['source'], 'الكل') ?></select></p>
        <p class="c-field"><label class="c-field__label" for="f-campaign">الحملة</label>
          <select class="c-field__control c-field__select" id="f-campaign" name="campaign" data-autosubmit><?= options($campaigns, $filters['campaign'], 'الكل') ?></select></p>
        <p class="c-field"><label class="c-field__label" for="f-service">الخدمة</label>
          <select class="c-field__control c-field__select" id="f-service" name="service" data-autosubmit><?= options(SERVICES, $filters['service'], 'الكل') ?></select></p>
        <button class="c-btn c-btn--primary" type="submit">تطبيق</button>
        <a class="c-btn c-btn--ghost" href="./">مسح</a>
      </form>

      <?php if (!$visible): ?>
        <p class="a-empty"><?= $leads ? 'لا توجد طلبات تطابق هذا البحث.' : 'لا توجد طلبات بعد. أول طلب يُرسَل من صفحة الحملة أو نموذج الموقع سيظهر هنا.' ?></p>
      <?php else: ?>
      <p class="a-muted" style="margin-block-end: var(--space-16)">يُعرض <?= count($visible) ?> من <?= count($leads) ?></p>
      <ol class="a-list">
        <?php foreach ($visible as $lead): ?>
        <li class="a-lead<?= $lead['status'] === 'new' ? ' a-lead--new' : '' ?>" id="lead-<?= e($lead['id']) ?>">
          <div>
            <div class="a-lead__head">
              <h2 class="a-lead__name"><?= e($lead['name']) ?></h2>
              <span class="a-lead__time"><?= e(when($lead['received_at'])) ?></span>
            </div>
            <div class="a-lead__meta">
              <?php if ($lead['whatsapp'] !== ''): ?><span>واتساب: <bdi dir="ltr"><?= e($lead['whatsapp']) ?></bdi></span><?php endif; ?>
              <?php if ($lead['email'] !== ''): ?><span>البريد: <bdi dir="ltr"><?= e($lead['email']) ?></bdi></span><span class="a-tag">من نموذج الموقع</span>
              <?php else: ?><span>الدولة / المدينة: <bdi><?= e($lead['location']) ?></bdi></span><?php endif; ?>
              <span>الخدمة: <bdi><?= e(SERVICES[$lead['service']] ?? $lead['service']) ?></bdi></span>
            </div>
            <?php if ($lead['note'] !== ''): ?><p class="a-lead__quote"><?= e($lead['note']) ?></p><?php endif; ?>
            <div class="a-tags">
              <span class="a-tag a-tag--status-<?= e($lead['status']) ?>"><?= e(STATUSES[$lead['status']]) ?></span>
              <?php if (($lead['source'] ?? '') !== ''): ?><span class="a-tag">المصدر: <?= e(platform($lead['source'])) ?></span><?php endif; ?>
              <?php if (($lead['campaign'] ?? '') !== ''): ?><span class="a-tag">الحملة: <bdi dir="ltr"><?= e($lead['campaign']) ?></bdi></span><?php endif; ?>
              <?php if (($lead['path'] ?? '') !== ''): ?><span class="a-tag">المسار: <?= e(str_replace(['site-form', 'portfolio', 'contact', '>'], ['نموذج الموقع', 'الأعمال', 'التواصل', ' ← '], $lead['path'])) ?></span><?php endif; ?>
              <?php if (($lead['device'] ?? '') !== ''): ?><span class="a-tag"><?= e(['mobile' => 'جوال', 'tablet' => 'جهاز لوحي', 'desktop' => 'حاسوب'][$lead['device']] ?? $lead['device']) ?></span><?php endif; ?>
              <?php if (($lead['ref'] ?? '') !== ''): ?><span class="a-tag"><bdi dir="ltr"><?= e($lead['ref']) ?></bdi></span><?php endif; ?>
            </div>
          </div>
          <div>
            <div class="a-actions">
              <?php if ($lead['whatsapp'] !== ''): ?>
              <a class="c-btn c-btn--primary" href="<?= e(waReply($lead)) ?>" target="_blank" rel="noopener noreferrer">رد على واتساب</a>
              <a class="c-btn c-btn--secondary" href="tel:<?= e($lead['whatsapp']) ?>">اتصال</a>
              <?php endif; ?>
              <?php if ($lead['email'] !== ''): ?>
              <a class="c-btn <?= $lead['whatsapp'] !== '' ? 'c-btn--secondary' : 'c-btn--primary' ?>" href="mailto:<?= e($lead['email']) ?>?subject=<?= e(rawurlencode('بيكسورا — بخصوص رسالتك')) ?>">رد بالبريد</a>
              <?php endif; ?>
            </div>
            <form class="a-form" method="post">
              <input type="hidden" name="action" value="update" />
              <input type="hidden" name="csrf" value="<?= $csrf ?>" />
              <input type="hidden" name="id" value="<?= e($lead['id']) ?>" />
              <?php foreach ($filters as $key => $value): ?><input type="hidden" name="f_<?= e($key) ?>" value="<?= e($value) ?>" /><?php endforeach; ?>
              <p class="c-field"><label class="c-field__label" for="s-<?= e($lead['id']) ?>">الحالة</label>
                <select class="c-field__control c-field__select" id="s-<?= e($lead['id']) ?>" name="status" data-autosubmit>
                  <?php foreach (STATUSES as $value => $label): ?><option value="<?= e($value) ?>"<?= $lead['status'] === $value ? ' selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?>
                </select></p>
              <p class="c-field"><label class="c-field__label" for="n-<?= e($lead['id']) ?>">ملاحظة داخلية</label>
                <textarea class="c-field__control" id="n-<?= e($lead['id']) ?>" name="note" rows="2" maxlength="1000" placeholder="لا يراها العميل"><?= e($lead['admin_note']) ?></textarea></p>
              <button class="c-btn c-btn--secondary" type="submit">حفظ</button>
            </form>
          </div>
        </li>
        <?php endforeach; ?>
      </ol>
      <?php endif; ?>
    </div>
  </main>
<?php endif; ?>
</body>
</html>
