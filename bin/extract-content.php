<?php
/**
 * Read the published page into the content records.  php bin/extract-content.php
 *
 * A development tool, not part of the deployment. Stage 3 added markers to four
 * sections that had never been editable; this fills the records behind them
 * from the page itself, so the first thing an administrator sees in the editor
 * is what the website already says. It transcribes; it never writes new copy.
 *
 * It is safe to re-run: a record that already exists is left alone unless
 * --force is given, and it prints what it did either way.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$force = in_array('--force', $argv, true);

/** The text an escaped region was written from. */
function plainOf(string $rendered): string
{
    $s = str_replace(['<br>', '<br/>', '<br />'], "\n", $rendered);
    return html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

$BLOCKS = [
    'home.eyebrow', 'home.title', 'home.lead',
    'how.label', 'how.title', 'how.lead',
    'vision.label', 'vision.title',
    'vision.vision_kicker', 'vision.vision_text',
    'vision.mission_kicker', 'vision.mission_text',
    'values.label', 'values.title',
];

/* which capture groups pull the words out of one rendered item */
$ITEMS = [
    'home.audience' => ['~<li class="hero__aud-card">.*?</li>~s',
                        '~class="hero__aud-title">([^<]*)<~', '~class="hero__aud-desc">([^<]*)<~'],
    'home.trust'    => ['~<div class="hero__trust">.*?</div>\s*</div>~s',
                        '~<b>([^<]*)</b>~', '~<span>([^<]*)</span>~'],
    'how.items'     => ['~<li class="hww__stage" data-reveal>.*?</li>~s',
                        '~class="hww__stage-title">([^<]*)<~', '~class="hww__stage-desc">([^<]*)<~'],
    'values.items'  => ['~<li class="value" data-reveal>.*?</li>~s',
                        '~class="value__name">([^<]*)<~', '~class="value__desc">([^<]*)<~'],
];

$target = Publisher::target();
if ($target === null) { fwrite(STDERR, "The marked page was not found.\n"); exit(2); }
$html = (string) file_get_contents($target);

$wrote = 0; $kept = 0;

foreach ($BLOCKS as $key) {
    $region = Publisher::readRegion($html, $key);
    if ($region === null) { fwrite(STDOUT, "  ! no region for {$key}\n"); continue; }
    if (Repo_Cms::block($key, 'ar') !== null && !$force) { $kept++; continue; }
    $value = isset(Repo_Cms::FIELD_HTML[$key]) ? $region : plainOf($region);
    Repo_Cms::saveBlock($key, 'ar', $value, null);
    $wrote++;
}
fwrite(STDOUT, "blocks: {$wrote} written, {$kept} left as they were\n");

foreach ($ITEMS as $collection => [$itemPat, $titlePat, $bodyPat]) {
    $region = Publisher::readRegion($html, $collection);
    if ($region === null) { fwrite(STDOUT, "  ! no region for {$collection}\n"); continue; }
    $have = count(Repo_Cms::items($collection, 'ar'));
    if ($have > 0 && !$force) {
        fwrite(STDOUT, "{$collection}: {$have} already there, left alone\n");
        continue;
    }
    preg_match_all($itemPat, $region, $m);
    $n = 0;
    foreach ($m[0] as $i => $item) {
        preg_match($titlePat, $item, $t);
        preg_match($bodyPat, $item, $b);
        preg_match('~<svg class="ico"[^>]*>.*?</svg>~s', $item, $ic);
        $id = Repo_Cms::createItem($collection, 'ar', [
            'item_key'     => $collection . '-' . ($i + 1),
            'title'        => html_entity_decode($t[1] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8'),
            'body'         => html_entity_decode($b[1] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8'),
            'is_published' => 1,
        ], null);
        if (isset($ic[0])) {
            Db::run('UPDATE content_items SET icon_svg = ? WHERE id = ?', [$ic[0], (int) $id]);
        }
        $n++;
    }
    fwrite(STDOUT, "{$collection}: {$n} transcribed from the page\n");
}
