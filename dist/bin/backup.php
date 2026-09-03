<?php
/**
 * Write a backup to app/storage/backups/, or restore one from a file.
 *
 * The dashboard does both — this is the same code from a terminal, for a host
 * that has one and for a cron job that can call it. It is the whole reason
 * app/Backup.php is a class rather than two route handlers.
 *
 *   php bin/backup.php                     write a snapshot
 *   php bin/backup.php --list              show what is in app/storage/backups
 *   php bin/backup.php --restore FILE      replace the data with that file
 *
 * A restore asks before it deletes anything, unless --yes is given.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$args    = array_slice($argv, 1);
$yes     = in_array('--yes', $args, true);
$list    = in_array('--list', $args, true);
$restore = null;
foreach ($args as $i => $a) {
    if ($a === '--restore') $restore = $args[$i + 1] ?? null;
    if (str_starts_with($a, '--restore=')) $restore = substr($a, 10);
}

function out(string $s = ''): void { fwrite(STDOUT, $s . PHP_EOL); }
function bail(string $s): never { fwrite(STDERR, $s . PHP_EOL); exit(1); }

if (!Db::ping()) bail('لا يمكن الاتصال بقاعدة البيانات. راجع ملف .env.');

if ($list) {
    $files = glob(Backup::dir() . '/*.json') ?: [];
    if ($files === []) { out('لا توجد نسخ احتياطية في ' . Backup::dir()); exit(0); }
    rsort($files);
    out('النسخ الاحتياطية في ' . Backup::dir() . ':');
    foreach ($files as $f) {
        out(sprintf('  %-38s %8.1f KB   %s',
            basename($f), filesize($f) / 1024, gmdate('Y-m-d H:i', (int) filemtime($f)) . 'Z'));
    }
    exit(0);
}

if ($restore !== null) {
    if (!is_file($restore)) bail('الملف غير موجود: ' . $restore);
    $data = json_decode((string) file_get_contents($restore), true);
    $problem = Backup::problem($data);
    if ($problem !== null) bail($problem);

    out('سيُستبدل محتوى الجداول التالية بما في الملف:');
    foreach (Backup::describe($data) as $t => $n) {
        out(sprintf('  %-26s %6d سجل', $t, $n));
    }
    out('');
    out('لا تُستعاد الحسابات ولا كلمات المرور — تبقى كما هي.');
    if (!$yes) {
        out('اكتب "yes" للمتابعة:');
        $answer = trim((string) fgets(STDIN));
        if ($answer !== 'yes') bail('أُلغيت الاستعادة. لم يتغيّر شيء.');
    }
    $snapshot = Backup::writeSnapshot('before-restore');
    out('حُفظت نسخة من الوضع الحالي: ' . basename($snapshot));
    $report = Backup::restore($data);
    out('استُعيد ' . array_sum($report) . ' سجلاً.');
    out('الموقع لم يتغيّر — انشره من لوحة التحكم ليعكس ما استُعيد.');
    exit(0);
}

$path = Backup::writeSnapshot();
out('كُتبت النسخة الاحتياطية:');
out('  ' . $path);
out(sprintf('  %.1f KB', filesize($path) / 1024));
$b = json_decode((string) file_get_contents($path), true);
foreach (($b['counts'] ?? []) as $t => $n) out(sprintf('  %-26s %6d', $t, $n));
