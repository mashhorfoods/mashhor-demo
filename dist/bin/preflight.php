<?php
/**
 * Read-only deployment check.  Usage:  php bin/preflight.php [--url=https://…]
 *
 * Answers one question after an upload: did this deploy actually work, and is
 * it safe to open? Every check either reads a file, reads the database, or
 * makes an ordinary HTTP request. Nothing is written, nothing is created and
 * nothing is deleted, so it is safe to run against the live site as often as
 * you like — unlike bin/verify.php, which writes scratch data and must never
 * be pointed at a database holding real records.
 *
 * No secret value is ever printed: keys and passwords are reported as present
 * or missing, never echoed (§06).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$URL = null;
foreach ($argv as $a) if (str_starts_with($a, '--url=')) $URL = rtrim(substr($a, 6), '/');
$URL ??= rtrim((string) Env::get('APP_URL', ''), '/');

$pass = 0; $warn = 0; $fail = 0; $notes = [];

function section(string $t): void { fwrite(STDOUT, "\n" . $t . "\n" . str_repeat('-', 74) . "\n"); }

/** @param bool|null $ok  true = pass, false = fail, null = warning */
function check(string $label, ?bool $ok, string $detail = ''): void
{
    global $pass, $warn, $fail, $notes;
    if ($ok === true)       { $pass++; $tag = 'PASS'; }
    elseif ($ok === null)   { $warn++; $tag = 'WARN'; $notes[] = "WARN  {$label}" . ($detail ? " — {$detail}" : ''); }
    else                    { $fail++; $tag = 'FAIL'; $notes[] = "FAIL  {$label}" . ($detail ? " — {$detail}" : ''); }
    fwrite(STDOUT, sprintf("  %-4s %-52s %s\n", $tag, $label, $detail));
}

function fetch(string $url, array $headers = []): array
{
    $opts = ['http' => [
        'method' => 'GET', 'ignore_errors' => true, 'timeout' => 15,
        'follow_location' => 0,
        'header' => array_merge(['Accept: */*', 'User-Agent: aun-preflight'], $headers),
    ], 'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]];
    $raw = @file_get_contents($url, false, stream_context_create($opts));
    $status = 0; $hdr = [];
    foreach ($http_response_header ?? [] as $i => $line) {
        if ($i === 0 && preg_match('#HTTP/\S+\s+(\d{3})#', $line, $m)) { $status = (int) $m[1]; continue; }
        if (str_contains($line, ':')) {
            [$k, $v] = explode(':', $line, 2);
            $hdr[strtolower(trim($k))] = trim($v);
        }
    }
    return ['status' => $status, 'headers' => $hdr, 'body' => (string) $raw];
}

fwrite(STDOUT, "\nعون الدرب — deployment preflight\n");
fwrite(STDOUT, "target: " . ($URL !== '' ? $URL : '(no APP_URL set; HTTP checks skipped)') . "\n");

/* ================================================================== */
section('RUNTIME');
/* ================================================================== */
check('PHP 8.0 or newer', version_compare(PHP_VERSION, '8.0.0', '>='), PHP_VERSION);
foreach (['pdo', 'pdo_mysql', 'mbstring', 'json', 'openssl'] as $ext) {
    $needed = $ext !== 'pdo_mysql' || Env::get('DB_DRIVER', 'mysql') === 'mysql';
    if (!$needed) continue;
    check("extension {$ext}", extension_loaded($ext) ?: null, extension_loaded($ext) ? '' : 'not loaded');
}
check('argon2id available for password hashing',
    defined('PASSWORD_ARGON2ID') ? true : null,
    defined('PASSWORD_ARGON2ID') ? '' : 'falls back to bcrypt, which is acceptable');

/* ================================================================== */
section('CONFIGURATION');
/* ================================================================== */
$envPath = null;
foreach (Env::candidates() as $c) if (is_file($c)) { $envPath = $c; break; }
check('.env found', $envPath !== null, $envPath ? basename(dirname($envPath)) . '/' . basename($envPath) : 'none of the candidate paths exist');
if ($envPath !== null) {
    $inRoot = str_starts_with(realpath($envPath) ?: '', realpath(AUN_ROOT) ?: '');
    check('.env is above the web root', $inRoot ? null : true,
        $inRoot ? 'it is inside the site directory; move it one level above public_html' : '');
    $perm = substr(sprintf('%o', fileperms($envPath)), -3);
    check('.env is not world-readable', ((int) $perm[2]) === 0 ? true : null, "mode {$perm}");
}
check('APP_ENV is production', Env::isProduction() ? true : null, (string) Env::get('APP_ENV', '(unset)'));
check('APP_DEBUG is off', !Env::debug(), Env::debug() ? 'debug output would leak internals to visitors' : '');
$key = (string) Env::get('APP_KEY', '');
check('APP_KEY is set and long enough', strlen($key) >= 32, $key === '' ? 'missing' : strlen($key) . ' chars');
$secureCookie = Env::bool('SESSION_COOKIE_SECURE', false);
check('SESSION_COOKIE_SECURE is true',
    $secureCookie ? true : (Env::isProduction() ? false : null),
    $secureCookie ? '' : 'session cookies would be sent over plain HTTP'
        . (Env::isProduction() ? '' : ' — acceptable only on a local development machine'));
if (Env::get('DB_DRIVER', 'mysql') === 'mysql') {
    foreach (['DB_NAME', 'DB_USER', 'DB_PASS'] as $k) {
        check("{$k} is present", ((string) Env::get($k, '')) !== '', '');   // value never printed
    }
}

/* ================================================================== */
section('DATABASE');
/* ================================================================== */
$dbUp = false;
try { $dbUp = Db::ping(); } catch (Throwable $e) { $dbUp = false; }
check('database reachable', $dbUp, $dbUp ? Db::driver() : 'connection failed — check .env values');

if ($dbUp) {
    check('driver is mysql', Db::isMysql() ? true : null,
        Db::isMysql() ? '' : Db::driver() . ' — sqlite is for local development only');
    if (Db::isMysql()) {
        $cs = (string) Db::value("SELECT @@character_set_database");
        $co = (string) Db::value("SELECT @@collation_database");
        check('database charset is utf8mb4', str_starts_with($cs, 'utf8mb4'), $cs);
        check('collation stores Arabic correctly', str_starts_with($co, 'utf8mb4'), $co);
    }
    $missing = Schema::missingTables();
    check('schema complete', $missing === [],
        $missing === [] ? count(Schema::tables()) . ' tables' : 'missing ' . implode(', ', $missing));

    if ($missing === []) {
        $supers = (int) Db::value("SELECT COUNT(*) FROM users WHERE role = 'super' AND is_active = 1");
        check('at least one active Super Admin exists', $supers > 0, "{$supers}");
        check('only one Super Admin, or deliberately more', $supers <= 1 ? true : null,
            $supers > 1 ? "{$supers} accounts hold full access" : '');
        $locked = (int) Db::value('SELECT COUNT(*) FROM users WHERE locked_until IS NOT NULL');
        check('no account is currently locked out', $locked === 0 ? true : null,
            $locked > 0 ? "{$locked} locked — there is no reset flow yet, stage C of ROADMAP.md" : '');
        $services = (int) Db::value('SELECT COUNT(*) FROM services');
        check('services seeded', $services > 0, "{$services} rows");
        $media = (int) Db::value('SELECT COUNT(*) FROM media_assets');
        check('media index seeded', $media > 0, "{$media} rows");
        $weak = (int) Db::value("SELECT COUNT(*) FROM users WHERE password_hash IS NULL OR password_hash = ''");
        check('every account has a password hash', $weak === 0, $weak > 0 ? "{$weak} without one" : '');
    }
}

/* ================================================================== */
section('FILESYSTEM');
/* ================================================================== */
$index = AUN_ROOT . '/index.html';
check('index.html present', is_file($index), is_file($index) ? round(filesize($index) / 1024) . ' KB' : 'missing');
check('index.html writable by PHP', is_writable($index),
    is_writable($index) ? '' : 'publishing content from المحتوى will fail');
check('index.html directory writable', is_writable(AUN_ROOT),
    is_writable(AUN_ROOT) ? '' : 'the atomic rename the publisher uses needs this');
foreach (['api/index.php', 'app/bootstrap.php', 'admin/login.html', 'admin/guard.php', '.htaccess', 'admin/.htaccess'] as $f) {
    check("{$f} uploaded", is_file(AUN_ROOT . '/' . $f), is_file(AUN_ROOT . '/' . $f) ? '' : 'missing from the upload');
}
check('bin/verify.php is NOT on the server', !is_file(AUN_ROOT . '/bin/verify.php') ? true : null,
    is_file(AUN_ROOT . '/bin/verify.php') ? 'delete it once you are done — it writes scratch data' : '');

/* The installer is meant to remove itself. If it is still here after the system
   is installed, that removal failed and it must be deleted by hand. */
$installer = is_file(AUN_ROOT . '/install.php');
$setupDone = $dbUp && Setup::isInstalled();
check('install.php is NOT on the server',
    !$installer ? true : ($setupDone ? false : null),
    !$installer ? ''
        : ($setupDone
            ? 'the system is installed — delete install.php now, and SETUP_TOKEN from .env'
            : 'still awaiting the install run; it deletes itself when it succeeds'));
check('SETUP_TOKEN has been removed from .env',
    ((string) Env::get('SETUP_TOKEN', '')) === '' ? true : ($setupDone ? false : null),
    ((string) Env::get('SETUP_TOKEN', '')) === '' ? ''
        : ($setupDone ? 'installation is complete — delete the line' : 'in use for the pending install'));

/* Stage 6 — recover.php is meant to ship closed. It answers 404 to everything
   unless RECOVERY_TOKEN is set, so its presence is fine and the token's is
   not: while the line is in .env, anyone holding it can set a Super Admin's
   password without signing in. That is the point of the page, and the reason
   the token is supposed to come out again the moment it has been used. */
$recToken = (string) Env::get('RECOVERY_TOKEN', '');
check('RECOVERY_TOKEN is NOT set in .env',
    $recToken === '' ? true : false,
    $recToken === ''
        ? 'recover.php answers 404 to everyone'
        : 'recover.php is OPEN to whoever holds the token — delete the line now that you are back in');
check('RECOVERY_TOKEN, if set at all, is long enough to matter',
    $recToken === '' ? true : (strlen($recToken) >= 24 ? null : false),
    $recToken === '' ? '' : 'length=' . strlen($recToken) . ' (minimum 24; shorter is ignored and the page stays 404)');

/* ================================================================== */
if ($URL !== '') {
section('OVER HTTP');
/* ================================================================== */
$home = fetch($URL . '/');
check('the public site answers', $home['status'] === 200, "status={$home['status']}");
check('served over HTTPS', str_starts_with($URL, 'https://') ? true : null,
    str_starts_with($URL, 'https://') ? '' : 'no certificate in use');

$health = fetch($URL . '/api/health');
check('/api/health answers', $health['status'] === 200, "status={$health['status']}");
check('and leaks no credentials',
    !preg_match('/(DB_PASS|DB_USER|password|APP_KEY)"\s*:\s*"[^"]+"/i', $health['body']));

$adm = fetch($URL . '/admin/');
check('the dashboard refuses an anonymous visitor',
    in_array($adm['status'], [301, 302, 303, 401, 403], true), "status={$adm['status']}");
check('and returns no dashboard markup with it',
    !str_contains($adm['body'], 'aun-shell') && strlen($adm['body']) < 2048, strlen($adm['body']) . ' bytes');

foreach (['/.env', '/app/bootstrap.php', '/app/Env.php', '/bin/seed.php'] as $p) {
    $r = fetch($URL . $p);
    check("{$p} is not served", in_array($r['status'], [401, 403, 404], true), "status={$r['status']}");
}

$h = $home['headers'];
/* PHP's built-in development server does not read .htaccess, so a missing
 * header there says nothing about the real host. Downgrade, don't lie. */
$local = (bool) preg_match('#^https?://(127\.0\.0\.1|localhost)#', $URL);
$hdr = static fn(bool $present): ?bool => $present ? true : ($local ? null : false);
$why = $local ? 'absent (the dev server ignores .htaccess)' : 'absent';
check('X-Content-Type-Options set', $hdr(isset($h['x-content-type-options'])), $h['x-content-type-options'] ?? $why);
check('X-Frame-Options set', $hdr(isset($h['x-frame-options'])), $h['x-frame-options'] ?? $why);
check('Referrer-Policy set', $hdr(isset($h['referrer-policy'])), $h['referrer-policy'] ?? $why);
check('Content-Security-Policy set', isset($h['content-security-policy']) ? true : null,
    $h['content-security-policy'] ?? 'absent — stage C of ROADMAP.md');
check('Strict-Transport-Security set', isset($h['strict-transport-security']) ? true : null,
    $h['strict-transport-security'] ?? 'absent — stage C of ROADMAP.md, deliberately last');
check('compression negotiated', isset($h['content-encoding']) ? true : null,
    $h['content-encoding'] ?? 'not applied to HTML');

/* ------------------------------------------------------------------ */
/* canonical host — the real domain, or one we are staging on?         */
/* ------------------------------------------------------------------ */
$host      = strtolower((string) parse_url($URL, PHP_URL_HOST));
$canonical = (bool) preg_match('/^(www\\.)?aunaldrb\\.com$/', $host);
$robots    = strtolower($h['x-robots-tag'] ?? '');

if ($local) {
    check('canonical-host rules', null,
        'skipped — the development server does not apply .htaccess');
} elseif ($canonical) {
    check('this is the canonical domain', true, $host);
    check('nothing is telling crawlers to ignore the site',
        !str_contains($robots, 'noindex'),
        $robots !== '' ? "X-Robots-Tag: {$robots}" : '');
} else {
    check('serving from a temporary domain', null,
        "{$host} — the page's canonical URL still names aunaldrb.com");
    check('crawlers are told not to index the temporary copy',
        str_contains($robots, 'noindex'),
        $robots !== '' ? "X-Robots-Tag: {$robots}" : 'absent — section 3b of .htaccess is not being applied');
}

/* A plain-http request must reach https on the SAME host. A redirect that
 * lands anywhere else means .htaccess still names a domain. */
$plain = $local ? null : fetch('http://' . $host . '/');
if ($plain === null) {
    /* nothing to say: there is no https on a local development server */
} elseif (in_array($plain['status'], [301, 302, 307, 308], true)) {
    $to = strtolower((string) parse_url($plain['headers']['location'] ?? '', PHP_URL_HOST));
    check('http redirects to https on this same host', $to === $host || $to === '',
        'to ' . ($plain['headers']['location'] ?? '(no Location)'));
} else {
    check('plain http is redirected to https', $plain['status'] === 200 ? null : false,
        "status={$plain['status']}");
}

}

/* ================================================================== */
fwrite(STDOUT, "\n" . str_repeat('=', 74) . "\n");
fwrite(STDOUT, sprintf("  %d passed, %d warnings, %d failed\n", $pass, $warn, $fail));
fwrite(STDOUT, str_repeat('=', 74) . "\n");
if ($notes !== []) {
    fwrite(STDOUT, "\n");
    foreach ($notes as $n) fwrite(STDOUT, "  {$n}\n");
}
fwrite(STDOUT, $fail === 0
    ? "\nNothing is blocking. Warnings are known gaps, not surprises.\n\n"
    : "\nFix the failures before opening the site to visitors.\n\n");
exit($fail === 0 ? 0 : 1);
