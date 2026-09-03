<?php
/**
 * Run the retention sweep from a terminal, or from a cron job on a host that
 * has one. The same code the dashboard runs on sign-in — app/Retention.php is
 * a class rather than a handler so that this can exist.
 *
 *   php bin/prune.php            show what the two ledgers hold, change nothing
 *   php bin/prune.php --run      sweep now, ignoring the once-a-day guard
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

function out(string $s = ''): void { fwrite(STDOUT, $s . PHP_EOL); }

if (!Db::ping()) { fwrite(STDERR, 'لا يمكن الاتصال بقاعدة البيانات. راجع ملف .env.' . PHP_EOL); exit(1); }

$before = Retention::status();

out('سجل النشاط');
out(sprintf('  السجلات        %d', $before['activity']['rows']));
out(sprintf('  أقدم سجل       %s', (string) ($before['activity']['oldest'] ?? '—')));
out(sprintf('  مدة الحفظ      %d يوماً (ACTIVITY_KEEP_DAYS)', $before['activity']['keepDays']));
out(sprintf('  الحد الأقصى    %d سجل (ACTIVITY_MAX_ROWS)', $before['activity']['maxRows']));
out('');
out('سجل النشر');
out(sprintf('  السجلات        %d', $before['publishes']['rows']));
out(sprintf('  أقدم سجل       %s', (string) ($before['publishes']['oldest'] ?? '—')));
out(sprintf('  المحفوظ        آخر %d سجل (PUBLISH_KEEP_ROWS)', $before['publishes']['keepRows']));
out('');
out('التنبيهات');
out(sprintf('  السجلات        %d', $before['notifications']['rows']));
out(sprintf('  أقدم تنبيه     %s', (string) ($before['notifications']['oldest'] ?? '—')));
out(sprintf('  مدة الحفظ      %d يوماً (NOTIFICATION_KEEP_DAYS)', $before['notifications']['keepDays']));
out(sprintf('  الحد الأقصى    %d تنبيه (NOTIFICATION_MAX_ROWS)', $before['notifications']['maxRows']));
out('');
out('آخر تنظيف: ' . ($before['lastSweep'] ?? 'لم يُنفَّذ بعد'));

if (!in_array('--run', array_slice($argv, 1), true)) {
    out('');
    out('لم يُحذف شيء. أضف --run للتنفيذ.');
    exit(0);
}

$r = Retention::sweep(true);
$after = Retention::status();
out('');
out(sprintf('حُذف من سجل النشاط: %d (بالعمر %d، بالعدد %d)',
    $r['activity']['removed'], $r['activity']['byAge'], $r['activity']['byCount']));
out(sprintf('حُذف من سجل النشر : %d', $r['publishes']));
out(sprintf('حُذف من التنبيهات : %d (بالعمر %d، بالعدد %d)',
    $r['notifications']['removed'], $r['notifications']['byAge'], $r['notifications']['byCount']));
out(sprintf('المتبقي           : %d سجل نشاط، %d سجل نشر، %d تنبيه',
    $after['activity']['rows'], $after['publishes']['rows'], $after['notifications']['rows']));
