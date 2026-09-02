<?php
/**
 * One-time browser installer.
 *
 * It exists because a shared-hosting account may have no usable terminal: SSH
 * can be off or refusing, and a cron job may never fire. The three setup steps
 * still have to run, so this file runs them from a browser instead — calling
 * app/Setup.php, the same code bin/migrate.php, bin/seed.php and
 * bin/seed-content.php call, so a browser install and a terminal install
 * produce the same database.
 *
 * It is not a general administration tool and it is not meant to stay:
 *
 *   §1  Nothing happens without SETUP_TOKEN. The token lives in .env, above
 *       the web root, so only whoever controls the server can set it. A request
 *       without it, or with the wrong one, gets a bare 404 — the same answer
 *       any absent file gets, so its existence is not disclosed.
 *   §2  It refuses to run once a Super Admin exists. That closes the window an
 *       installer normally leaves open, where a stranger who reaches it first
 *       creates the first account.
 *   §3  It deletes itself after a successful install, and bin/preflight.php
 *       fails if it is ever found on the server again.
 *   §4  It creates. It never drops a table, never overwrites edited content,
 *       and never prints a configured secret.
 */
declare(strict_types=1);

define('AUN_APP', true);
require_once __DIR__ . '/app/bootstrap.php';

/* --- §1 · the gate -------------------------------------------------------- */
$expected = (string) Env::get('SETUP_TOKEN', '');
$given    = (string) ($_GET['t'] ?? $_POST['t'] ?? '');

if ($expected === '' || strlen($expected) < 16 || !hash_equals($expected, $given)) {
    /* A wrong token is indistinguishable from a missing file. The delay costs
       a legitimate operator nothing and makes guessing pointless. */
    if ($given !== '') usleep(400000);
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo "<!doctype html><meta charset=utf-8><title>404</title><h1>404</h1>";
    exit;
}

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');

$T = htmlspecialchars($given, ENT_QUOTES, 'UTF-8');

/* --- state ---------------------------------------------------------------- */
$connected = false;
try { $connected = Db::ping(); } catch (Throwable $e) { $connected = false; }
$installed = $connected && Setup::isInstalled();
$missing   = [];
if ($connected) { try { $missing = Schema::missingTables(); } catch (Throwable $e) { $missing = []; } }

$report   = [];
$password = null;
$done     = false;
$error    = null;

/* --- run ------------------------------------------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$installed && $connected) {
    $email = trim((string) ($_POST['email'] ?? ''));
    $name  = trim((string) ($_POST['name'] ?? ''));
    if ($name === '') $name = 'مدير النظام';

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'أدخل بريداً إلكترونياً صحيحاً.';
    } else {
        try {
            $report = array_merge(
                ['— قاعدة البيانات —'],           Setup::migrate(),
                ['', '— الخدمات والوسائط —'],     Setup::services(), Setup::media(),
                ['', '— المحتوى —'],              Setup::content(), Setup::settings(),
                ['', '— النشر —'],                Setup::publishTarget()
            );
            $admin    = Setup::admin($email, $name, null);
            $report   = array_merge($report, ['', '— الحساب —'], $admin['lines']);
            $password = $admin['password'];
            $done     = Setup::isInstalled();

            /* §3 — remove the installer once it has done its single job. */
            if ($done) {
                register_shutdown_function(static function (): void { @unlink(__FILE__); });
            }
        } catch (Throwable $e) {
            Log::exception($e);
            $error = 'تعذّر إكمال التثبيت. التفاصيل مسجّلة في app/storage/logs/ ولم تُعرض هنا.';
        }
    }
}
?>
<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>تثبيت لوحة تحكم عون الدرب</title>
<style>
  :root{--navy:#22406F;--blue:#4975BA;--mist:#EEF3FA;--ink:#1E2733;--slate:#5A6675;
        --line:#E1E8F1;--ok:#2E7D64;--okbg:#EAF5F0;--warn:#B0791C;--warnbg:#FBF3E4;
        --err:#C0433B;--errbg:#FBEDEC;--panel:#fff;--ground:#F7F9FC}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ground);color:var(--ink);font-size:16px;line-height:1.7;
       font-family:"Segoe UI","Noto Naskh Arabic",Tahoma,Arial,sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:40px 22px 80px}
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:28px}
  .mark{width:44px;height:44px;border-radius:10px;background:var(--navy);color:#fff;
        display:grid;place-items:center;font-size:22px;font-weight:700}
  .brand b{display:block;font-size:17px}
  .brand span{display:block;font-size:13px;color:var(--slate)}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;
        padding:26px;margin-bottom:18px}
  h1{margin:0 0 6px;font-size:23px}
  h2{margin:0 0 12px;font-size:16px}
  p{margin:0 0 14px;color:var(--slate)}
  dl.state{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:0 0 4px;font-size:15px}
  dl.state dt{color:var(--slate)}
  dl.state dd{margin:0;font-weight:600}
  .pill{display:inline-block;padding:2px 10px;border-radius:100px;font-size:13px;font-weight:600}
  .pill.ok{background:var(--okbg);color:var(--ok)}
  .pill.no{background:var(--warnbg);color:var(--warn)}
  .pill.er{background:var(--errbg);color:var(--err)}
  label{display:block;font-size:14px;font-weight:600;margin:16px 0 6px}
  input[type=email],input[type=text]{width:100%;padding:11px 13px;font:inherit;
        border:1px solid #CBD4E1;border-radius:8px;background:#fff;color:var(--ink)}
  input:focus{outline:2px solid var(--blue);outline-offset:1px}
  button{margin-top:22px;width:100%;padding:13px;font:inherit;font-weight:700;color:#fff;
         background:var(--navy);border:0;border-radius:8px;cursor:pointer;min-height:48px}
  button:hover{background:#1A3358}
  pre{background:#0F1722;color:#DCE6F2;border-radius:10px;padding:16px 18px;overflow-x:auto;
      font-family:Consolas,"Courier New",monospace;font-size:13px;line-height:1.65;
      direction:ltr;text-align:left;white-space:pre-wrap;margin:0}
  .pw{background:var(--okbg);border:1px solid var(--ok);border-radius:10px;padding:18px;margin:0 0 18px}
  .pw code{display:block;direction:ltr;text-align:left;font-size:19px;font-weight:700;
           background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px;margin:10px 0;
           font-family:Consolas,monospace;word-break:break-all}
  .note{background:var(--warnbg);border:1px solid var(--warn);border-radius:10px;padding:16px;font-size:15px}
  .note b{color:var(--warn)}
  .err{background:var(--errbg);border:1px solid var(--err);border-radius:10px;padding:16px;color:var(--err)}
  ul{margin:0;padding-inline-start:22px;color:var(--slate)}
  li{margin-bottom:6px}
  a{color:var(--navy)}
</style>

<div class="wrap">

  <div class="brand">
    <div class="mark">ع</div>
    <div><b>عون الدرب</b><span>تثبيت لوحة التحكم</span></div>
  </div>

<?php if ($done): ?>

  <div class="card">
    <h1>تم التثبيت بنجاح</h1>
    <p>أُنشئت الجداول، وحُمّلت الخدمات والمحتوى المعتمد، وأُنشئ حساب المدير العام.</p>
    <?php if ($password !== null): ?>
      <div class="pw">
        <b>كلمة المرور — تُعرض مرة واحدة فقط</b>
        <code><?= htmlspecialchars($password, ENT_QUOTES, 'UTF-8') ?></code>
        انسخها الآن. لا تُحفظ في السجل ولا في قاعدة البيانات — يُخزَّن تجزئتها فقط.
        سجّل الدخول ثم غيّرها من صفحة المستخدمين.
      </div>
    <?php endif; ?>
    <div class="note">
      <b>حُذف هذا الملف تلقائياً.</b> تأكّد من اختفاء <code>install.php</code> من
      <code>public_html</code>، واحذفه يدوياً إن بقي. واحذف كذلك سطر
      <code>SETUP_TOKEN</code> من ملف <code>.env</code> — لم يعد له عمل.
    </div>
    <p style="margin-top:18px"><a href="/admin/">الانتقال إلى لوحة التحكم ←</a></p>
  </div>

  <div class="card">
    <h2>تقرير التثبيت</h2>
    <pre><?= htmlspecialchars(implode("\n", $report), ENT_QUOTES, 'UTF-8') ?></pre>
  </div>

<?php elseif ($installed): ?>

  <div class="card">
    <h1>النظام مُثبَّت بالفعل</h1>
    <p>يوجد حساب مدير عام، ولن يقوم هذا الملف بأي عمل. هذا هو السلوك المقصود:
       المثبّت يعمل مرة واحدة فقط.</p>
    <div class="note">
      <b>احذف <code>install.php</code> الآن</b> من <code>public_html</code>، واحذف سطر
      <code>SETUP_TOKEN</code> من <code>.env</code>.
    </div>
    <p style="margin-top:18px"><a href="/admin/">الانتقال إلى لوحة التحكم ←</a></p>
  </div>

<?php else: ?>

  <div class="card">
    <h1>الحالة الحالية</h1>
    <dl class="state">
      <dt>الاتصال بقاعدة البيانات</dt>
      <dd><?= $connected ? '<span class="pill ok">متصل</span>' : '<span class="pill er">غير متصل</span>' ?></dd>
      <dt>الجداول الناقصة</dt>
      <dd><?= $connected ? count($missing) . ' من ' . count(Schema::tables()) : '—' ?></dd>
      <dt>إصدار PHP</dt>
      <dd><?= htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8') ?></dd>
    </dl>
  </div>

  <?php if (!$connected): ?>
    <div class="card">
      <div class="err">
        لا يمكن الوصول إلى قاعدة البيانات. راجع قيم <code>DB_NAME</code> و
        <code>DB_USER</code> و <code>DB_PASS</code> في ملف <code>.env</code>.
        السبب الدقيق مسجّل في <code>app/storage/logs/</code> ولم يُعرض هنا.
      </div>
    </div>
  <?php else: ?>
    <div class="card">
      <h1>تشغيل التثبيت</h1>
      <p>سيتم تنفيذ الخطوات التالية مرة واحدة:</p>
      <ul>
        <li>إنشاء جداول قاعدة البيانات.</li>
        <li>تحميل الخدمات السبع المعتمدة وفهرس الوسائط.</li>
        <li>تحميل نصوص الموقع والإعدادات كما هي في الصفحة العامة — دون إضافة أو تعديل.</li>
        <li>إنشاء حساب المدير العام، وتوليد كلمة مرور تُعرض مرة واحدة.</li>
      </ul>
      <?php if ($error !== null): ?>
        <div class="err" style="margin-top:16px"><?= htmlspecialchars($error, ENT_QUOTES, 'UTF-8') ?></div>
      <?php endif; ?>
      <form method="post" action="install.php">
        <input type="hidden" name="t" value="<?= $T ?>">
        <label for="email">البريد الإلكتروني للمدير العام</label>
        <input id="email" name="email" type="email" required dir="ltr"
               value="<?= htmlspecialchars((string) ($_POST['email'] ?? 'aunaldrb@gmail.com'), ENT_QUOTES, 'UTF-8') ?>">
        <label for="name">الاسم الظاهر</label>
        <input id="name" name="name" type="text"
               value="<?= htmlspecialchars((string) ($_POST['name'] ?? 'مدير النظام'), ENT_QUOTES, 'UTF-8') ?>">
        <button type="submit">تشغيل التثبيت</button>
      </form>
    </div>
  <?php endif; ?>

  <?php if ($report !== []): ?>
    <div class="card">
      <h2>التقرير</h2>
      <pre><?= htmlspecialchars(implode("\n", $report), ENT_QUOTES, 'UTF-8') ?></pre>
    </div>
  <?php endif; ?>

<?php endif; ?>

</div>
