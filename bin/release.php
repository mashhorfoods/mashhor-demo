<?php
/**
 * بوابة الإصدار — GATE 03.
 *
 * The workflow's third gate is a go/no-go decision, and a decision needs a
 * record: what was run, what it said, and what remains open. This runs every
 * gate in the project, in order, against a target, and then asks the seven
 * questions that are about *releasing* rather than about the code —
 * the ones a green test suite cannot answer:
 *
 *   · is debugging off, and are errors hidden from visitors
 *   · is the session cookie marked Secure, over a URL that is https
 *   · is the installer closed, and the recovery door shut
 *   · does the package contain no environment file and no key
 *   · is there a backup, and does anyone know how to restore it
 *   · is the database the one production will actually use
 *   · is anything still marked as unfinished in the tree
 *
 * The answer is one of three, and each means something different:
 *
 *   GO           every gate passed and every release condition holds
 *   GO WITH …    the gates passed; a release condition needs a person to do
 *                something outside this repository before the package is
 *                uploaded (set a value in .env on the host, take a backup)
 *   NO-GO        a gate failed, or a condition that makes a release unsafe
 *
 * Usage:
 *   php bin/release.php [baseUrl] [--quick] [--only=verify,security] [--json]
 *
 *   --quick   skip the four slowest browser gates; a smoke run, not a gate
 *   --only    run just these, by name
 *   --json    machine-readable, for a pipeline
 *
 * It runs the suites, so the same warning applies: point it at staging.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$ROOT = dirname(__DIR__);
$BASE = 'http://127.0.0.1:8088';
foreach ($argv as $i => $a) {
    if ($i > 0 && !str_starts_with($a, '--')) { $BASE = rtrim($a, '/'); break; }
}
function flag(string $n): bool { return in_array("--{$n}", $GLOBALS['argv'], true); }
function opt(string $n, ?string $d = null): ?string {
    foreach ($GLOBALS['argv'] as $a) if (str_starts_with($a, "--{$n}=")) return substr($a, strlen($n) + 3);
    return $d;
}
$QUICK = flag('quick');
$JSON  = flag('json');
$ONLY  = ($o = opt('only')) ? array_map('trim', explode(',', $o)) : null;

/* ------------------------------------------------------------------ */
/* the gates, in the order a person would want to see them fail        */
/* ------------------------------------------------------------------ */
$GATES = [
    ['verify',   'الوظائف — كل نقطة نهاية عبر قاعدة البيانات', ['php', 'bin/verify.php', $BASE], false],
    ['authz',    'الصلاحيات — كل مسار في كل دور',              ['php', 'bin/qa-authz.php', $BASE], false],
    ['security', 'الأمن — الأسئلة التي يسألها المهاجم',        ['php', 'bin/qa-security.php', $BASE], false],
    ['migrate',  'الترحيل — المخطّط على MySQL',                 ['php', 'bin/qa-migrate.php', '--env=/tmp/qa-mysql.env'], true],
    ['browser',  'الصفحات — في متصفّح حقيقي، بأربعة عروض',      ['node', 'bin/qa-browser.js', $BASE], true],
    ['controls', 'الأزرار — لا زرّ مربوط بلا شيء',              ['node', 'bin/qa-controls.js', $BASE], true],
    ['public',   'الموقع العام — الرأس والنموذج و404',          ['node', 'bin/qa-public.js', $BASE], true],
    ['ux',       'التجربة — الفشل والفراغ ولوحة المفاتيح',      ['node', 'bin/qa-ux.js', $BASE], true],
    ['a11y',     'إمكانية الوصول — التباين والتركيز و320 بكسل', ['node', 'bin/qa-a11y.js', $BASE], true],
    ['perf',     'الأداء — الوزن والرسم والصور',                ['node', 'bin/qa-perf.js', $BASE], true],
];

$results = [];
$totalPass = 0; $totalFail = 0;
$ran = 0; $skipped = [];

function runGate(array $cmd, string $root): array
{
    $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $t0 = microtime(true);
    $p = proc_open($cmd, $descriptors, $pipes, $root);
    if (!is_resource($p)) return ['code' => 127, 'out' => 'could not start', 'ms' => 0];
    $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    $code = proc_close($p);
    return ['code' => $code, 'out' => (string) $out, 'ms' => (int) ((microtime(true) - $t0) * 1000)];
}

/* Both harness families end with the same sentence, so one reader serves
   all ten rather than each gate needing its own parser. */
function tally(string $out): array
{
    if (preg_match_all('/(\d+)\s+passed,\s+(\d+)\s+failed/', $out, $m)) {
        $i = count($m[1]) - 1;
        return [(int) $m[1][$i], (int) $m[2][$i]];
    }
    if (preg_match('/(\d+)\s+of\s+(\d+)\s+have a handler/', $out, $m)) {
        return [(int) $m[1], (int) $m[2] - (int) $m[1]];
    }
    return [0, 0];
}

if (!$JSON) {
    fwrite(STDOUT, "\n" . str_repeat('═', 78) . "\n");
    fwrite(STDOUT, "  بوابة الإصدار — GATE 03\n");
    fwrite(STDOUT, '  ' . $BASE . '   ' . gmdate('Y-m-d H:i') . " UTC\n");
    fwrite(STDOUT, str_repeat('═', 78) . "\n\n");
}

foreach ($GATES as [$name, $label, $cmd, $slow]) {
    if ($ONLY !== null && !in_array($name, $ONLY, true)) { $skipped[] = $name; continue; }
    if ($ONLY === null && $QUICK && $slow) { $skipped[] = $name; continue; }
    if (!$JSON) fwrite(STDOUT, sprintf('  %-9s %-44s ', $name, $label));
    /* Every gate signs in, several times. Ten of them back to back from one
       address is far more sign-ins in ten minutes than a person makes in a
       week, so the limiter starts refusing — and a gate that cannot sign in
       does not fail loudly, it just measures less: «الأزرار» examined 15
       controls instead of 64 and still said 0 dead. The limiter is doing its
       job; the runner has to stop tripping it. */
    try { Db::run('DELETE FROM rate_hits'); Db::run('UPDATE users SET failed_attempts = 0, locked_until = NULL'); }
    catch (Throwable $e) { /* a target that is not this database */ }
    $r = runGate($cmd, $GLOBALS['ROOT']);
    [$p, $f] = tally($r['out']);
    $totalPass += $p; $totalFail += $f;
    $ok = $r['code'] === 0;
    $results[$name] = ['ok' => $ok, 'pass' => $p, 'fail' => $f, 'code' => $r['code'],
                       'ms' => $r['ms'], 'out' => $r['out']];
    $ran++;
    if (!$JSON) {
        fwrite(STDOUT, sprintf("%s  %d/%d  %ds\n", $ok ? '✓' : '✗', $p, $p + $f, (int) round($r['ms'] / 1000)));
    }
}

/* ------------------------------------------------------------------ */
/* the release conditions — about shipping, not about the code         */
/* ------------------------------------------------------------------ */
$cond = [];
function condition(string $key, string $q, string $verdict, string $detail = ''): void
{
    /* verdict: pass | act | block
       "act" is not a failure — it is something a person does on the host
       before the package is uploaded, and it cannot be true in this repo. */
    $GLOBALS['cond'][] = ['key' => $key, 'q' => $q, 'verdict' => $verdict, 'detail' => $detail];
}

$envFile = null;
foreach ([dirname($ROOT) . '/.env', $ROOT . '/.env', $ROOT . '/app/.env'] as $c) {
    if (is_file($c)) { $envFile = $c; break; }
}
$env = $envFile ? (string) @file_get_contents($envFile) : '';
$val = static function (string $k) use ($env): ?string {
    if (preg_match('/^[ \t]*' . preg_quote($k, '/') . '[ \t]*=[ \t]*(.*)$/m', $env, $m)) {
        return trim(preg_replace('/\s+#.*$/', '', $m[1]));
    }
    return null;
};

/* 1 · debugging */
$debug = strtolower((string) $val('APP_DEBUG'));
condition('debug', 'التصحيح مطفأ ولا تظهر أخطاء الخادم للزائر',
    ($debug === 'false' || $debug === '0' || $debug === '') ? 'pass' : 'block',
    'APP_DEBUG=' . ($debug === '' ? '(unset)' : $debug));

/* 2 · the cookie and the address it travels over */
$secure = strtolower((string) $val('SESSION_COOKIE_SECURE'));
$url    = (string) $val('APP_URL');
$isLocal = str_contains($url, '127.0.0.1') || str_contains($url, 'localhost');
condition('cookie', 'ملف الجلسة مقصور على HTTPS',
    $isLocal ? 'act' : (($secure === 'true' || $secure === '1') ? 'pass' : 'block'),
    'SESSION_COOKIE_SECURE=' . ($secure ?: '(unset)') . '  APP_URL=' . ($url ?: '(unset)')
    . ($isLocal ? '  ← هذا .env تطويري؛ يُتحقَّق منه على المضيف' : ''));

/* 3 · the two doors that must be shut */
$setup = $val('SETUP_TOKEN');
$recov = $val('RECOVERY_TOKEN');
condition('installer', 'المثبِّت مغلق',
    ($setup === null || $setup === '') ? 'pass' : 'block',
    $setup ? 'SETUP_TOKEN is set — install.php will answer' : 'SETUP_TOKEN unset — install.php answers 404');
condition('recovery', 'باب الاستعادة مغلق',
    ($recov === null || $recov === '') ? 'pass' : 'block',
    $recov ? 'RECOVERY_TOKEN is set — recover.php will answer' : 'RECOVERY_TOKEN unset — recover.php answers 404');

/* 4 · the package carries no secret */
$leaks = [];
if (is_file($ROOT . '/dist/.env')) $leaks[] = 'dist/.env exists';
foreach (['dist/app/storage/aun.sqlite', 'dist/router-dev.php'] as $x) {
    if (file_exists($ROOT . '/' . $x)) $leaks[] = $x . ' exists';
}
condition('package', 'الحزمة لا تحمل ملف بيئة ولا قاعدة بيانات',
    $leaks === [] ? 'pass' : 'block', implode(' | ', $leaks));

/* 4b · the package is the current source.
   Not by timestamps: bin/verify.php publishes into index.html as part of its
   own test and puts the content back, so the file's mtime moves on every run
   while its content is identical, and a freshness check built on mtimes
   refused every package the moment the suite had been run. build.js records
   the digest of everything it read; this recomputes them. */
$stampFile = $ROOT . '/.build-stamp.json';
$stamp = is_file($stampFile) ? json_decode((string) file_get_contents($stampFile), true) : null;
if (!is_array($stamp) || !isset($stamp['sources'])) {
    condition('freshness', 'الحزمة مبنيّة من المصدر الحالي', 'block',
        'لا يوجد .build-stamp.json — شغّل node build.js');
} else {
    $drift = [];
    foreach ($stamp['sources'] as $rel => $want) {
        $abs = $ROOT . '/' . $rel;
        if (!is_file($abs)) { $drift[] = $rel . ' (حُذف)'; continue; }
        $have = substr(hash('sha256', (string) file_get_contents($abs)), 0, 16);
        if ($have !== $want) $drift[] = $rel;
    }
    condition('freshness', 'الحزمة مبنيّة من المصدر الحالي',
        $drift === [] ? 'pass' : 'block',
        $drift === []
            ? (count($stamp['sources']) . ' ملفاً مطابقاً · بُنيت ' . substr((string) ($stamp['builtAt'] ?? ''), 0, 19))
            : ('تغيّر بعد البناء: ' . implode(', ', array_slice($drift, 0, 4))
               . (count($drift) > 4 ? ' و' . (count($drift) - 4) . ' غيرها' : '')));
}

/* 5 · a backup exists and someone knows how to restore it */
$hasBackupTool = is_file($ROOT . '/bin/backup.php');
$restoreDocumented = str_contains((string) @file_get_contents($ROOT . '/DEPLOY.md'), 'backup')
    || str_contains((string) @file_get_contents($ROOT . '/دليل-المشغل.html'), 'نسخة احتياطية');
condition('backup', 'توجد وسيلة نسخ احتياطي واستعادة، وموثّقة',
    ($hasBackupTool && $restoreDocumented) ? 'act' : 'block',
    ($hasBackupTool ? 'bin/backup.php ✓' : 'no backup tool') . ' · ' .
    ($restoreDocumented ? 'موثّقة في دليل المشغّل' : 'غير موثّقة') .
    ' — أخذ نسخة قبل الرفع فعلٌ على المضيف');

/* 6 · the database production will actually use */
$driver = strtolower((string) $val('DB_DRIVER'));
condition('database', 'محرّك قاعدة البيانات هو الذي سيعمل عليه الإصدار',
    $isLocal ? 'act' : ($driver === 'mysql' ? 'pass' : 'block'),
    'DB_DRIVER=' . ($driver ?: '(unset)')
    . ($isLocal ? '  ← هذا .env تطويري' : ''));

/* 7 · nothing in the tree still says it is unfinished */
$todo = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($ROOT, FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
    $rel = substr($f->getPathname(), strlen($ROOT) + 1);
    if (preg_match('#^(\.git|node_modules|dist|ux)/#', $rel)) continue;
    if (!preg_match('/\.(php|js|html)$/', $rel)) continue;
    if ($f->getSize() > 2_000_000) continue;
    $body = (string) @file_get_contents($f->getPathname());
    /* Only an annotation counts, not the word in prose.
       The first version of this looked for the bare words and reported four
       files: a phone format «+966 5X XXX XXXX», two pages describing this
       very check in Arabic, and — five times — the line in this file that
       lists what to look for. A marker is an annotation someone wrote against
       code, so it is required to look like one: a comment opener, then the
       word, then a colon or a space and something after it. */
    if (preg_match_all('#(?://|/\*|\#|<!--)\s*(FIXME|HACK)\b#', $body, $m)) {
        $todo[] = $rel . ' ×' . count($m[0]);
    }
}
condition('unfinished', 'لا شيء في الشجرة معلَّم بأنه معطوب',
    $todo === [] ? 'pass' : 'block', implode(' | ', array_slice($todo, 0, 4)));

/* ------------------------------------------------------------------ */
/* A gate that could not run is not a gate that failed, and it is not a gate
   that passed either. The MySQL suite needs a MySQL to point at; when there
   is none, saying "NO-GO: the schema is wrong" would be a lie, and saying
   nothing would approve a release whose database was never checked. */
foreach ($results as $name => $r) {
    if ($r['ok']) continue;
    if ($r['fail'] === 0 && preg_match('/DbUnavailable|database unavailable|could not start|Connection refused/i', $r['out'])) {
        $results[$name]['unavailable'] = true;
    }
}
$unavailable = array_keys(array_filter($results, static fn ($r) => !empty($r['unavailable'])));
$gateFail = 0;
foreach ($results as $r) if (!$r['ok'] && empty($r['unavailable'])) $gateFail++;
$blocked = array_values(array_filter($cond, static fn ($c) => $c['verdict'] === 'block'));
$actions = array_values(array_filter($cond, static fn ($c) => $c['verdict'] === 'act'));

$decision = $gateFail > 0 || $blocked !== [] ? 'NO-GO'
          : ($actions !== [] ? 'GO WITH ACTIONS' : 'GO');
/* A partial run cannot approve a release. It can still refuse one. */
if ($decision !== 'NO-GO' && ($QUICK || $ONLY !== null || $unavailable !== [])) {
    $decision = 'PARTIAL — لا يعتمد إصداراً';
}

if ($JSON) {
    $slim = [];
    foreach ($results as $k => $v) $slim[$k] = ['ok' => $v['ok'], 'pass' => $v['pass'], 'fail' => $v['fail'], 'ms' => $v['ms']];
    fwrite(STDOUT, json_encode([
        'base' => $BASE, 'at' => gmdate('c'), 'decision' => $decision,
        'gates' => $slim, 'conditions' => $cond,
        'totals' => ['pass' => $totalPass, 'fail' => $totalFail, 'gatesRun' => $ran],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    exit($decision === 'NO-GO' ? 1 : 0);
}

fwrite(STDOUT, "\n  شروط الإصدار — ما لا تجيب عنه مجموعة اختبارات خضراء\n");
fwrite(STDOUT, '  ' . str_repeat('─', 74) . "\n");
foreach ($cond as $c) {
    $mark = ['pass' => '✓', 'act' => '•', 'block' => '✗'][$c['verdict']];
    fwrite(STDOUT, sprintf("  %s %-48s %s\n", $mark, $c['q'], $c['detail']));
}

fwrite(STDOUT, "\n" . str_repeat('═', 78) . "\n");
fwrite(STDOUT, sprintf("  %d فحصاً في %d بوابة · %d إخفاق\n", $totalPass + $totalFail, $ran, $totalFail));
if ($skipped !== []) fwrite(STDOUT, '  لم تُشغَّل: ' . implode(', ', $skipped) . "\n");
if ($unavailable !== []) {
    fwrite(STDOUT, '  تعذّر تشغيلها هنا (هدفها غير متاح): ' . implode(', ', $unavailable) . "\n");
}
fwrite(STDOUT, "\n  القرار:  {$decision}\n");
if ($gateFail > 0) {
    fwrite(STDOUT, "\n  البوابات المخفقة:\n");
    foreach ($results as $k => $r) {
        if ($r['ok']) continue;
        fwrite(STDOUT, "    · {$k} ({$r['fail']} إخفاق)\n");
        foreach (array_slice(array_filter(explode("\n", $r['out']),
                 static fn ($l) => str_contains($l, 'FAIL')), 0, 4) as $l) {
            fwrite(STDOUT, '        ' . trim($l) . "\n");
        }
    }
}
if ($blocked !== []) {
    fwrite(STDOUT, "\n  شروط مانعة:\n");
    foreach ($blocked as $c) fwrite(STDOUT, "    ✗ {$c['q']} — {$c['detail']}\n");
}
if ($actions !== []) {
    fwrite(STDOUT, "\n  أفعال على المضيف قبل الرفع — ليست إخفاقات:\n");
    foreach ($actions as $c) fwrite(STDOUT, "    • {$c['q']}\n       {$c['detail']}\n");
}
fwrite(STDOUT, str_repeat('═', 78) . "\n");
exit($decision === 'NO-GO' ? 1 : 0);
