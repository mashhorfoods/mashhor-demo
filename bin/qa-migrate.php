<?php
/**
 * Do the migrations actually get an OLDER database to the same place as a new
 * one?
 *
 * bin/migrate.php proves the migrations run. It does not prove the thing that
 * matters on the client's server, which is not an empty database: it is a
 * database installed months ago, holding real content, that has to arrive at
 * exactly the schema a fresh install produces — with nothing dropped on the
 * way and no column left behind.
 *
 * So this builds both, side by side, and compares them:
 *
 *   §1  A fresh install: every migration, from empty.
 *   §2  An old install: only the migrations that existed at the time, then
 *       real content written into it, then the rest of the migrations.
 *   §3  The two schemas compared table by table and column by column. Any
 *       difference is a migration that only works on a new database, which is
 *       the one case nobody tests and the only case the client has.
 *   §4  The content written in §2 re-read afterwards, because a migration
 *       that reshapes a table can take the rows with it.
 *
 * It runs entirely against its own databases and never reads the configured
 * one, so it is safe next to a running system. Usage:
 *
 *   php bin/qa-migrate.php --env=/path/to/env-with-DB_NAME-for-scratch
 *
 * The env it is given is used for the connection; DB_NAME is replaced with a
 * scratch name per phase, so the named database is never touched either.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);

require_once dirname(__DIR__) . '/app/Env.php';

$envPath = null;
foreach ($argv as $a) if (str_starts_with($a, '--env=')) $envPath = substr($a, 6);
if ($envPath === null || !is_file($envPath)) {
    fwrite(STDERR, "usage: php bin/qa-migrate.php --env=<file>\n");
    exit(2);
}

/* Load the given file FIRST, so bootstrap's own Env::load() finds the work
   already done and leaves it alone. */
Env::load($envPath);
require_once dirname(__DIR__) . '/app/bootstrap.php';

if (Db::driver() !== 'mysql') {
    fwrite(STDERR, "this check needs mysql — the client's host runs it, and the column\n"
        . "types a migration adds differ between the two engines\n");
    exit(2);
}

$pass = 0; $fail = 0; $out = [];
function ck(string $name, bool $ok, string $detail = ''): void {
    global $pass, $fail, $out;
    $ok ? $pass++ : $fail++;
    $out[] = sprintf('  %s %-56s %s', $ok ? 'PASS' : 'FAIL', $name, $detail);
}
function say(string $s): void { global $out; $out[] = "\n" . $s; }

/** Everything a schema comparison needs: tables, columns, types, nullability. */
function shapeOf(): array
{
    $shape = [];
    foreach (Schema::tables() as $t) {
        $cols = [];
        foreach (Db::all("SHOW FULL COLUMNS FROM `{$t}`") as $c) {
            $cols[(string) $c['Field']] = strtolower(
                (string) $c['Type'] . '|' . (string) $c['Null'] . '|' . (string) $c['Key']);
        }
        ksort($cols);
        $shape[$t] = $cols;
    }
    ksort($shape);
    return $shape;
}

function useDatabase(string $name): void
{
    Db::reset();
    /* the scratch databases are created by the harness that calls this */
    Db::pdo()->exec("USE `{$name}`");
}

$base = (string) Env::require('DB_NAME');
$fresh = $base . '_fresh';
$old   = $base . '_old';

$root = Db::pdo();
foreach ([$fresh, $old] as $db) {
    $root->exec("DROP DATABASE IF EXISTS `{$db}`");
    $root->exec("CREATE DATABASE `{$db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
}

/* ---------------------------------------------------------------- §1 */
say('§1  A FRESH INSTALL — every migration, from empty');
useDatabase($fresh);
$applied = Schema::migrate(false);
ck('all migrations applied', count($applied) === count(Schema::migrations()),
    count($applied) . ' of ' . count(Schema::migrations()));
ck('no table is missing', Schema::missingTables() === [], json_encode(Schema::missingTables()));
$freshShape = shapeOf();
ck('the schema has every table', count($freshShape) === count(Schema::tables()),
    count($freshShape) . ' tables');

/* ---------------------------------------------------------------- §2 */
say('§2  AN OLDER INSTALL — the first two migrations, real content, then the rest');
useDatabase($old);
/* the state a database installed before stage 3 was in. The ledger table is
   created by migrate() rather than by any migration, so it is created the same
   way here before the two rows are written into it. */
Schema::ensureLedger();
Schema::m0001();
Db::run('INSERT INTO migrations (name, applied_at) VALUES (?,?)', ['0001_core', Db::now()]);
Schema::m0002();
Db::run('INSERT INTO migrations (name, applied_at) VALUES (?,?)', ['0002_content', Db::now()]);
ck('it starts at 0002', (int) Db::value('SELECT COUNT(*) FROM migrations') === 2);
ck('and lacks what the later migrations add',
    !in_array('icon_svg', Schema::columns('services'), true));

/* real content, of the kinds the later migrations reshape */
$uid = Repo_Users::create('مدير الترحيل', 'migrate@aunaldrb.com', 'Migration-Test-Pass-1', 'super', true, null);
Db::run('INSERT INTO services (slug, title, description, sort_order, is_published, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)',
    ['legacy-service', 'خدمة قديمة', 'وصف الخدمة القديمة', 1, 1, Db::now(), Db::now()]);
Db::run('INSERT INTO content_blocks (lang, block_key, value, updated_at) VALUES (?,?,?,?)',
    ['ar', 'about.body', 'نص قديم عن الشركة', Db::now()]);
/* the two settings rows migration 0004 and 0006 move onto blocks */
foreach ([['contact', 'cPhone', '"011 245 6789"'], ['site', 'sTitle', '"عنوان قديم"'],
          ['site', 'sDesc', '"وصف قديم"'], ['company', 'cAddr', '"عنوان قديم للشركة"']] as $s) {
    Db::run('INSERT INTO settings (category, name, value, updated_at) VALUES (?,?,?,?)',
        [$s[0], $s[1], $s[2], Db::now()]);
}
$cust = Repo_Customers::findOrCreate('0501234567', 'عميل قديم');
ck('content, settings, a service, a user and a customer are in place',
    (int) Db::value('SELECT COUNT(*) FROM services') === 1
    && (int) Db::value('SELECT COUNT(*) FROM settings') === 4
    && (int) Db::value('SELECT COUNT(*) FROM users') === 1);

$rest = Schema::migrate(false);
ck('the remaining migrations apply to it', count($rest) === count(Schema::migrations()) - 2,
    implode(', ', $rest));
ck('and the ledger is complete',
    (int) Db::value('SELECT COUNT(*) FROM migrations') === count(Schema::migrations()));

/* §4 — the content survived */
ck('the old service survived', (int) Db::value('SELECT COUNT(*) FROM services WHERE slug = ?', ['legacy-service']) === 1);
ck('its title is untouched',
    (string) Db::value('SELECT title FROM services WHERE slug = ?', ['legacy-service']) === 'خدمة قديمة');
ck('the old content block survived',
    str_contains((string) Db::value('SELECT value FROM content_blocks WHERE block_key = ?', ['about.body']), 'نص قديم'));
ck('the account survived and can still be found', Repo_Users::findByEmail('migrate@aunaldrb.com') !== null);
ck('and its password still verifies',
    Auth::verify('Migration-Test-Pass-1', (string) Repo_Users::findByEmail('migrate@aunaldrb.com')['password_hash']));
ck('the customer survived', Repo_Customers::findByPhone('0501234567') !== null);

/* the moves migrations 0004 and 0006 make */
ck('0004 moved the phone off settings onto a block',
    (int) Db::value('SELECT COUNT(*) FROM settings WHERE category = ? AND name = ?', ['contact', 'cPhone']) === 0
    && (int) Db::value('SELECT COUNT(*) FROM content_blocks WHERE block_key = ?', ['contact.phone_display']) === 1);
ck('and the value moved with it, not just the row',
    str_contains((string) Db::value('SELECT value FROM content_blocks WHERE block_key = ?', ['contact.phone_display']), '245'));
ck('0006 moved the search title and description too',
    (int) Db::value('SELECT COUNT(*) FROM settings WHERE category = ? AND name IN (?,?)', ['site', 'sTitle', 'sDesc']) === 0
    && (int) Db::value('SELECT COUNT(*) FROM content_blocks WHERE block_key IN (?,?)', ['seo.title', 'seo.description']) === 2);
ck('and those values moved with them',
    (string) Db::value('SELECT value FROM content_blocks WHERE block_key = ?', ['seo.title']) === 'عنوان قديم');
ck('0003 added the service columns to a table that already had rows',
    in_array('icon_svg', Schema::columns('services'), true)
    && in_array('image_html', Schema::columns('services'), true));

$oldShape = shapeOf();

/* ---------------------------------------------------------------- §3 */
say('§3  THE TWO SCHEMAS COMPARED — an upgraded database must equal a new one');
$missingTables = array_diff(array_keys($freshShape), array_keys($oldShape));
$extraTables   = array_diff(array_keys($oldShape), array_keys($freshShape));
ck('the upgraded database has every table a fresh one has',
    $missingTables === [], implode(', ', $missingTables));
ck('and no table a fresh one does not', $extraTables === [], implode(', ', $extraTables));

$diffs = [];
foreach ($freshShape as $table => $cols) {
    if (!isset($oldShape[$table])) continue;
    foreach ($cols as $col => $spec) {
        if (!isset($oldShape[$table][$col])) { $diffs[] = "{$table}.{$col} missing after upgrade"; continue; }
        if ($oldShape[$table][$col] !== $spec) {
            $diffs[] = "{$table}.{$col}: fresh={$spec} upgraded={$oldShape[$table][$col]}";
        }
    }
    foreach ($oldShape[$table] as $col => $spec) {
        if (!isset($cols[$col])) $diffs[] = "{$table}.{$col} exists only after upgrade";
    }
}
ck('every column matches in name, type, nullability and key',
    $diffs === [], $diffs === [] ? count($freshShape, COUNT_RECURSIVE) . ' columns compared'
                                 : implode(' ; ', array_slice($diffs, 0, 4)));

/* ---------------------------------------------------------------- §5 */
say('§5  RE-RUNNING CHANGES NOTHING');
$again = Schema::migrate(false);
ck('a second migrate applies nothing', $again === [], implode(', ', $again));
ck('and the schema is unchanged', shapeOf() === $oldShape);

/* clean up after itself */
Db::reset();
Db::pdo()->exec("DROP DATABASE IF EXISTS `{$fresh}`");
Db::pdo()->exec("DROP DATABASE IF EXISTS `{$old}`");

foreach ($out as $l) fwrite(STDOUT, $l . "\n");
fwrite(STDOUT, "\n" . str_repeat('=', 78) . "\n");
fwrite(STDOUT, sprintf("  %d passed, %d failed, %d total\n", $pass, $fail, $pass + $fail));
fwrite(STDOUT, str_repeat('=', 78) . "\n");
exit($fail === 0 ? 0 : 1);
