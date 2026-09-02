<?php
/**
 * RECOVERY 02 — load the public website's current content into the database.
 *
 *   php bin/seed-content.php [--force]
 *
 * The values come from index.html itself, extracted verbatim at the moment the
 * markers were added. Nothing here was written for the dashboard: §05 and §33
 * forbid inventing or rewriting approved copy, so the seed is a transcription,
 * and the file it transcribes is the source of truth.
 *
 * Re-running is safe. Existing rows are left alone unless --force is given,
 * so a seed run after an administrator has edited something does not quietly
 * undo their work.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$force = in_array('--force', $argv, true);
$file  = AUN_ROOT . '/app/storage/cms-seed.json';

if (!is_file($file)) {
    fwrite(STDERR, "Seed file not found: app/storage/cms-seed.json\n");
    exit(2);
}
$seed = json_decode((string) file_get_contents($file), true);
if (!is_array($seed)) { fwrite(STDERR, "Seed file is not valid JSON.\n"); exit(2); }

try {
    if (!Db::ping()) { fwrite(STDERR, "Cannot reach the database.\n"); exit(2); }
    Schema::migrate();

    /* ---- text blocks --------------------------------------------------- */
    $added = 0; $kept = 0;
    foreach (($seed['blocks'] ?? []) as $key => $value) {
        $existing = Repo_Cms::block((string) $key, 'ar');
        if ($existing !== null && !$force) { $kept++; continue; }
        Repo_Cms::saveBlock((string) $key, 'ar', (string) $value, null);
        $added++;
    }
    fwrite(STDOUT, "content blocks: {$added} written, {$kept} left as they were\n");

    /* ---- features ------------------------------------------------------- */
    $n = 0;
    foreach (($seed['items']['features'] ?? []) as $f) {
        $key = 'feature-' . $f['order'];
        $exists = Db::one('SELECT id FROM content_items WHERE collection = ? AND lang = ? AND item_key = ?',
            ['features', 'ar', $key]);
        if ($exists !== null && !$force) continue;
        if ($exists !== null) {
            /* --force refreshes the publishing template but never the copy an
               administrator may have edited since */
            Db::run('UPDATE content_items SET markup = ?, updated_at = ? WHERE id = ?',
                [$f['markup'], Db::now(), $exists['id']]);
            continue;
        }
        Repo_Cms::createItem('features', 'ar', [
            'item_key' => $key, 'title' => $f['title'], 'body' => $f['body'],
            'markup' => $f['markup'], 'is_published' => 1,
        ], null);
        $n++;
    }
    fwrite(STDOUT, "features: {$n} added, " . count(Repo_Cms::items('features', 'ar')) . " total\n");

    /* ---- services -------------------------------------------------------
       The service records themselves already exist from RECOVERY 01 and are
       NOT duplicated (§38: reuse what exists). What is stored here is the
       publishing template for each one, keyed by the slug both tables share. */
    $n = 0;
    foreach (($seed['items']['services'] ?? []) as $s) {
        $svc = Repo_Content::findServiceByTitle($s['title']);
        $key = $svc === null ? ('service-' . $s['order']) : (string) $svc['slug'];
        $exists = Db::one('SELECT id FROM content_items WHERE collection = ? AND lang = ? AND item_key = ?',
            ['services', 'ar', $key]);
        if ($exists !== null && !$force) continue;
        if ($exists !== null) {
            Db::run('UPDATE content_items SET markup = ?, updated_at = ? WHERE id = ?',
                [$s['markup'], Db::now(), $exists['id']]);
            continue;
        }
        Repo_Cms::createItem('services', 'ar', [
            'item_key' => $key, 'title' => $s['title'], 'body' => $s['body'],
            'image_path' => $s['image'], 'markup' => $s['markup'],
            'is_published' => $svc === null ? 1 : (int) $svc['is_published'],
        ], null);
        $n++;
    }
    fwrite(STDOUT, "services: {$n} publishing templates added, "
        . count(Repo_Cms::items('services', 'ar')) . " total\n");

    /* ---- الأسئلة الشائعة و آراء العملاء ---------------------------------
       Deliberately empty. index.html has no FAQ section and no testimonials
       section — its own structured-data comments say so — and §08, §09 and
       §26 all forbid inventing entries to fill the gap. The editors exist and
       work; there is simply nothing approved to put in them yet. */
    fwrite(STDOUT, "faq: " . count(Repo_Cms::items('faq', 'ar'))
        . " (no FAQ section exists on the public site — nothing seeded)\n");
    fwrite(STDOUT, "testimonials: " . count(Repo_Cms::items('testimonials', 'ar'))
        . " (no testimonials section exists on the public site — nothing seeded)\n");

    /* ---- الإعدادات ------------------------------------------------------
       The values the settings module has always shown. They are the real
       company details from the public site, not placeholders, and they are
       written once so the module has something to load instead of a literal
       map in its own script. Re-running never overwrites an edited value. */
    $SETTINGS = [
        'company' => [
            'cName' => 'شركة عون الدرب للنقل المتخصص',
            'cTag'  => 'نُعين ونُعاون',
            'cDesc' => 'نقل متخصص في الرياض لكبار السن وذوي الاحتياجات الخاصة والمرضى، بمركبات مجهزة وطاقم مدرب، في بيئة تحترم الإنسانية.',
            'cAddr' => 'الرياض · شارع ابن كثير · حي السليمانية · 12233',
        ],
        'contact' => [
            'cPhone' => '+966 53 554 4352',
            'cWa'    => '+966 53 554 4352',
            'cEmail' => '',
            'cSite'  => 'https://aunaldrb.com/',
            'sTw'    => '',
            'sIg'    => '',
        ],
        'site' => [
            'siteLive' => true,
            'sTitle'   => 'عون الدرب للنقل المتخصص | نقل كبار السن وذوي الاحتياجات الخاصة بالرياض',
            'sDesc'    => 'نقل متخصص في الرياض لكبار السن وذوي الاحتياجات الخاصة والمرضى: مركبات مجهزة للكراسي المتحركة والسرير الطبي، وطاقم مدرب، ومساندة عند الحاجة — على مدار الساعة.',
            'sUrl'     => 'https://aunaldrb.com/',
        ],
        'notif'  => ['nNew' => true, 'nStale' => true, 'nStatus' => false, 'nContent' => true],
        'system' => ['tz' => 0, 'sess' => '60', 'digits' => 0],
    ];
    $wrote = 0; $left = 0;
    foreach ($SETTINGS as $cat => $fields) {
        foreach ($fields as $name => $value) {
            $exists = Db::value('SELECT 1 FROM settings WHERE category = ? AND name = ?', [$cat, $name]);
            if ($exists && !$force) { $left++; continue; }
            $now = Db::now();
            if ($exists) {
                Db::run('UPDATE settings SET value = ?, updated_at = ? WHERE category = ? AND name = ?',
                    [Repo_Content::encode($value), $now, $cat, $name]);
            } else {
                Db::run('INSERT INTO settings (category, name, value, updated_at) VALUES (?,?,?,?)',
                    [$cat, $name, Repo_Content::encode($value), $now]);
            }
            $wrote++;
        }
    }
    fwrite(STDOUT, "settings: {$wrote} written, {$left} left as they were\n");

    $t = Publisher::target();
    fwrite(STDOUT, "\npublish target: " . ($t === null ? 'NOT FOUND' : $t)
        . ($t !== null && is_writable($t) ? " (writable)" : " (NOT writable)") . "\n");
} catch (DbUnavailable $e) {
    fwrite(STDERR, "Database unavailable.\n");
    exit(2);
}
