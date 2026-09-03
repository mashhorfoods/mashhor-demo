<?php
/**
 * Account recovery — the way back in when nobody can sign in.
 *
 * The dashboard can already change a password: a person changes their own
 * from الإعدادات, and a Super Admin resets anyone's from المستخدمون. Both
 * require being signed in, which is exactly what is missing in the one case
 * that matters — the sole Super Admin has forgotten the password, or locked
 * the account out with failed attempts, and there is no terminal on this
 * hosting plan to run a script from.
 *
 * This file answers that case and nothing else:
 *
 *   §1  It is inert unless RECOVERY_TOKEN is set in .env, above the web root,
 *       where only whoever controls the server can put it. Without it — or
 *       with the wrong one — every request gets a bare 404, the same answer an
 *       absent file gets, so its existence is not disclosed. Repeated wrong
 *       tokens from one address stop being answered at all.
 *   §2  It touches administrator accounts only: set a password, clear a lock,
 *       re-enable an account, and — only when no Super Admin is left at all —
 *       create one. It cannot read a request, a customer or a page.
 *   §3  It never displays a password. The operator types the new one; there is
 *       nothing generated here to show, and nothing is written to the log.
 *   §4  Every action it takes is written to the activity log as «استعادة
 *       الدخول», so a recovery is visible afterwards rather than silent.
 *
 * Remove RECOVERY_TOKEN from .env once you are back in. bin/preflight.php
 * reports it as an open door for as long as it is set.
 */
declare(strict_types=1);

define('AUN_APP', true);
require_once __DIR__ . '/app/bootstrap.php';

/* --- §1 · the gate -------------------------------------------------------- */

/** Wrong tokens are counted per address; enough of them and this file is mute. */
function recovery_throttle(string $ip, bool $failed): bool
{
    $dir  = AUN_ROOT . '/app/storage';
    $file = $dir . '/recovery-attempts.json';
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $now  = time();
    $data = [];
    if (is_file($file)) {
        $raw = @file_get_contents($file);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($decoded)) $data = $decoded;
    }
    /* forget anything older than an hour */
    foreach ($data as $k => $stamps) {
        $data[$k] = array_values(array_filter((array) $stamps, static fn($t) => $t > $now - 3600));
        if ($data[$k] === []) unset($data[$k]);
    }
    $key   = hash('sha256', $ip);
    $count = count($data[$key] ?? []);
    if ($failed) {
        $data[$key][] = $now;
        $count++;
    }
    @file_put_contents($file, json_encode($data), LOCK_EX);
    return $count < 10;
}

function recovery_404(): void
{
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo "<!doctype html><meta charset=utf-8><title>404</title><h1>404</h1>";
    exit;
}

$expected = (string) Env::get('RECOVERY_TOKEN', '');
$given    = (string) ($_GET['t'] ?? $_POST['t'] ?? '');
$ip       = Http::ip();

/* A short token is not a token. 24 characters, because unlike the installer
   this file is not deleted after use and may sit behind the token for a while. */
$tokenOk = $expected !== '' && strlen($expected) >= 24 && hash_equals($expected, $given);

if (!recovery_throttle($ip, $given !== '' && !$tokenOk)) recovery_404();
if (!$tokenOk) {
    if ($given !== '') usleep(400000);
    recovery_404();
}

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

$T = htmlspecialchars($given, ENT_QUOTES, 'UTF-8');
function e(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }

/* --- state ---------------------------------------------------------------- */
$connected = false;
try { $connected = Db::ping(); } catch (Throwable $e) { $connected = false; }

$supers  = [];
$notice  = null;
$error   = null;
$field   = null;

if ($connected) {
    try { $supers = Repo_Users::supers(); } catch (Throwable $e) { $error = 'قاعدة البيانات متصلة لكن جداول النظام غير جاهزة.'; }
}

/* How the activity log names what happens here. There is no session — this is
   the path taken precisely because nobody can sign in — so the entry carries
   no actor id and is labelled for what it was, rather than attributed to a
   person who was not the one signed in. */
const RECOVERY_ACTOR = 'استعادة الدخول';

/* --- act ------------------------------------------------------------------ */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $connected && $error === null) {
    $action = (string) ($_POST['action'] ?? '');
    $id     = (int) ($_POST['id'] ?? 0);
    $target = $id > 0 ? Repo_Users::find($id) : null;

    try {
        if ($action === 'create') {
            if (Repo_Users::activeSuperCount() > 0) {
                $error = 'يوجد مدير عام فعّال بالفعل — لا يُنشأ حساب جديد من هنا.';
            } else {
                $email = trim((string) ($_POST['email'] ?? ''));
                $name  = trim((string) ($_POST['name'] ?? ''));
                if ($name === '') $name = 'مدير النظام';
                $pw    = (string) ($_POST['password'] ?? '');
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $error = 'أدخل بريداً إلكترونياً صحيحاً.'; $field = 'email';
                } elseif (Repo_Users::findByEmail($email) !== null) {
                    $error = 'هذا البريد مستخدم بالفعل.'; $field = 'email';
                } elseif (($p = Auth::passwordProblem($pw, $email, $name)) !== null) {
                    $error = $p; $field = 'password';
                } else {
                    $newId = Repo_Users::create($name, $email, $pw, 'super', true, null);
                    Repo_Activity::record(null, 'users', 'invite', 'user', (string) $newId, $name,
                        'إنشاء مدير عام من صفحة استعادة الدخول', RECOVERY_ACTOR);
                    Log::write('warn', 'super admin created through recovery', ['user_id' => $newId, 'ip' => $ip]);
                    $notice = 'أُنشئ حساب مدير عام باسم «' . $name . '». سجّل الدخول به الآن.';
                    $supers = Repo_Users::supers();
                }
            }
        } elseif ($target === null) {
            $error = 'الحساب المطلوب غير موجود.';
        } elseif ((string) $target['role'] !== 'super') {
            /* Only administrator accounts, and only the top role — this page
               is for restoring administration, not for editing staff. */
            $error = 'هذه الصفحة تتعامل مع حسابات المدير العام فقط.';
        } elseif ($action === 'password') {
            $pw = (string) ($_POST['password'] ?? '');
            $p  = Auth::passwordProblem($pw, (string) $target['email'], (string) $target['name']);
            if ($p !== null) { $error = $p; $field = 'password-' . $id; }
            else {
                /* Every session for the account goes: the old password is the
                   reason we are here, and anything opened with it must end. */
                Auth::changePassword($id, $pw, null);
                Repo_Activity::record(null, 'users', 'edit', 'user', (string) $id, (string) $target['name'],
                    'إعادة تعيين كلمة المرور من صفحة استعادة الدخول', RECOVERY_ACTOR);
                Log::write('warn', 'password reset through recovery', ['user_id' => $id, 'ip' => $ip]);
                $notice = 'غُيّرت كلمة المرور لحساب «' . $target['name'] . '». سجّل الدخول بها الآن.';
            }
        } elseif ($action === 'unlock') {
            Repo_Users::unlock($id);
            Repo_Activity::record(null, 'users', 'edit', 'user', (string) $id, (string) $target['name'],
                'إلغاء قفل الحساب من صفحة استعادة الدخول', RECOVERY_ACTOR);
            $notice = 'أُلغي القفل عن حساب «' . $target['name'] . '».';
        } elseif ($action === 'enable') {
            Repo_Users::update($id, ['is_active' => 1]);
            Repo_Users::unlock($id);
            Repo_Activity::record(null, 'users', 'edit', 'user', (string) $id, (string) $target['name'],
                'إعادة تفعيل الحساب من صفحة استعادة الدخول', RECOVERY_ACTOR);
            $notice = 'أُعيد تفعيل حساب «' . $target['name'] . '».';
        } else {
            $error = 'إجراء غير معروف.';
        }
    } catch (Throwable $ex) {
        Log::exception($ex);
        $error = 'تعذّر تنفيذ الإجراء. التفاصيل مسجّلة في app/storage/logs/ ولم تُعرض هنا.';
    }

    if ($connected && $error === null) {
        try { $supers = Repo_Users::supers(); } catch (Throwable $ex) { /* list stays as it was */ }
    }
}

$now = time();
?>
<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>استعادة الدخول — عون الدرب</title>
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
  .acct{border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:14px}
  .acct__h{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:4px}
  .acct__n{font-weight:700;font-size:16px}
  .acct__e{direction:ltr;text-align:left;display:block;font-family:Consolas,monospace;
           font-size:14px;color:var(--slate);margin-bottom:14px}
  .pill{display:inline-block;padding:2px 10px;border-radius:100px;font-size:13px;font-weight:600}
  .pill.ok{background:var(--okbg);color:var(--ok)}
  .pill.no{background:var(--warnbg);color:var(--warn)}
  .pill.er{background:var(--errbg);color:var(--err)}
  label{display:block;font-size:14px;font-weight:600;margin:16px 0 6px}
  input[type=email],input[type=text],input[type=password]{width:100%;padding:11px 13px;font:inherit;
        border:1px solid #CBD4E1;border-radius:8px;background:#fff;color:var(--ink)}
  input[type=password]{direction:ltr;text-align:left;font-family:Consolas,monospace}
  input:focus{outline:2px solid var(--blue);outline-offset:1px}
  .row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-top:6px}
  .row form{margin:0}
  .grow{flex:1 1 260px;min-width:0}
  button{padding:12px 18px;font:inherit;font-weight:700;color:#fff;
         background:var(--navy);border:0;border-radius:8px;cursor:pointer;min-height:46px}
  button:hover{background:#1A3358}
  button.ghost{background:#fff;color:var(--navy);border:1px solid #CBD4E1}
  button.ghost:hover{background:var(--mist)}
  .ok-box{background:var(--okbg);border:1px solid var(--ok);border-radius:10px;padding:16px;margin-bottom:18px}
  .note{background:var(--warnbg);border:1px solid var(--warn);border-radius:10px;padding:16px;font-size:15px}
  .note b{color:var(--warn)}
  .err{background:var(--errbg);border:1px solid var(--err);border-radius:10px;padding:16px;
       color:var(--err);margin-bottom:18px}
  ul{margin:0;padding-inline-start:22px;color:var(--slate)}
  li{margin-bottom:6px}
  code{background:var(--mist);border-radius:4px;padding:1px 5px;font-family:Consolas,monospace;font-size:14px}
  a{color:var(--navy)}
</style>

<div class="wrap">

  <div class="brand">
    <div class="mark">ع</div>
    <div><b>عون الدرب</b><span>استعادة الدخول إلى لوحة التحكم</span></div>
  </div>

<?php if ($notice !== null): ?>
  <div class="ok-box"><?= e($notice) ?> <a href="/admin/">الانتقال إلى تسجيل الدخول ←</a></div>
<?php endif; ?>
<?php if ($error !== null): ?>
  <div class="err"><?= e($error) ?></div>
<?php endif; ?>

<?php if (!$connected): ?>

  <div class="card">
    <h1>لا يمكن الوصول إلى قاعدة البيانات</h1>
    <p>لا يمكن استعادة حساب دون قاعدة بيانات. راجع بيانات الاتصال في ملف
       <code>.env</code> ثم أعد تحميل هذه الصفحة.</p>
    <p><a href="/api/health">فحص حالة النظام ←</a></p>
  </div>

<?php elseif ($supers === []): ?>

  <div class="card">
    <h1>لا يوجد أي حساب مدير عام</h1>
    <p>لا يستطيع أحد إدارة النظام الآن. أنشئ حساباً واحداً من هنا، ثم احذف
       <code>RECOVERY_TOKEN</code> من <code>.env</code>.</p>
    <form method="post">
      <input type="hidden" name="t" value="<?= $T ?>">
      <input type="hidden" name="action" value="create">
      <label for="name">الاسم</label>
      <input id="name" name="name" type="text" autocomplete="off" placeholder="مدير النظام">
      <label for="email">البريد الإلكتروني</label>
      <input id="email" name="email" type="email" required autocomplete="off" dir="ltr" style="direction:ltr;text-align:left">
      <label for="password">كلمة المرور — <?= Auth::PASSWORD_MIN ?> حرفاً على الأقل</label>
      <input id="password" name="password" type="password" required autocomplete="new-password">
      <div class="row"><button type="submit">إنشاء حساب مدير عام</button></div>
    </form>
  </div>

<?php else: ?>

  <div class="card">
    <h1>حسابات المدير العام</h1>
    <p>اختر الحساب الذي تريد استعادته. لا تُعرض كلمات المرور هنا ولا في أي مكان
       آخر — يُخزَّن منها تجزئة فقط، وأنت من يكتب الكلمة الجديدة.</p>

    <?php foreach ($supers as $s):
        $sid    = (int) $s['id'];
        $active = (bool) (int) $s['is_active'];
        $locked = false; /* find() does not select the lock column */
        $row    = Db::one('SELECT locked_until, failed_attempts FROM users WHERE id = ?', [$sid]);
        if ($row !== null && $row['locked_until'] !== null) {
            $locked = strtotime((string) $row['locked_until'] . ' UTC') > $now;
        }
    ?>
      <div class="acct">
        <div class="acct__h">
          <span class="acct__n"><?= e((string) $s['name']) ?></span>
          <?= $active ? '<span class="pill ok">فعّال</span>' : '<span class="pill er">معطّل</span>' ?>
          <?= $locked ? '<span class="pill no">مقفل مؤقتاً</span>' : '' ?>
        </div>
        <span class="acct__e"><?= e((string) $s['email']) ?></span>

        <form method="post">
          <input type="hidden" name="t" value="<?= $T ?>">
          <input type="hidden" name="action" value="password">
          <input type="hidden" name="id" value="<?= $sid ?>">
          <label for="p<?= $sid ?>">كلمة مرور جديدة</label>
          <div class="row">
            <span class="grow"><input id="p<?= $sid ?>" name="password" type="password"
                   required autocomplete="new-password" minlength="<?= Auth::PASSWORD_MIN ?>"></span>
            <button type="submit">تعيين كلمة المرور</button>
          </div>
        </form>

        <div class="row" style="margin-top:14px">
          <?php if ($locked): ?>
          <form method="post">
            <input type="hidden" name="t" value="<?= $T ?>">
            <input type="hidden" name="action" value="unlock">
            <input type="hidden" name="id" value="<?= $sid ?>">
            <button class="ghost" type="submit">إلغاء القفل</button>
          </form>
          <?php endif; ?>
          <?php if (!$active): ?>
          <form method="post">
            <input type="hidden" name="t" value="<?= $T ?>">
            <input type="hidden" name="action" value="enable">
            <input type="hidden" name="id" value="<?= $sid ?>">
            <button class="ghost" type="submit">إعادة تفعيل الحساب</button>
          </form>
          <?php endif; ?>
        </div>
      </div>
    <?php endforeach; ?>
  </div>

<?php endif; ?>

  <div class="card">
    <h2>بعد الانتهاء</h2>
    <div class="note">
      <b>احذف سطر <code>RECOVERY_TOKEN</code> من ملف <code>.env</code>.</b>
      ما دام موجوداً، فهذه الصفحة تعمل. وبدونه لا تُجيب هذا الملف على أي طلب —
      يردّ بـ 404 كأي ملف غير موجود.
    </div>
    <ul style="margin-top:14px">
      <li>كل إجراء هنا مسجَّل في «سجل النشاط» باسم «استعادة الدخول».</li>
      <li>تغيير كلمة المرور ينهي كل الجلسات المفتوحة لذلك الحساب.</li>
      <li><code>bin/preflight.php</code> ينبّهك ما دام الرمز موجوداً على الخادم.</li>
    </ul>
  </div>

</div>
