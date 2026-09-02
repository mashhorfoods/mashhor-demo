<?php
/**
 * Seed the reference data the approved system already defines, and create the
 * first administrator.  Usage:
 *
 *   php bin/seed.php --admin-email=you@example.com --admin-name="اسمك" [--admin-password=…]
 *
 * The password is generated and printed once if you do not supply one. It is
 * printed to your terminal and nowhere else: not the log, not the database
 * (only its hash), not any response (§06).
 *
 * The work itself lives in app/Setup.php, so that this script and the browser
 * installer produce byte-for-byte the same database.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

function arg(string $name, ?string $default = null): ?string
{
    foreach ($GLOBALS['argv'] as $a) {
        if (str_starts_with($a, "--{$name}=")) return substr($a, strlen($name) + 3);
    }
    return $default;
}

function say(array $lines): void { foreach ($lines as $l) fwrite(STDOUT, $l . "\n"); }

try {
    if (!Db::ping()) { fwrite(STDERR, "Cannot reach the database.\n"); exit(2); }
    Schema::migrate();

    say(Setup::services());
    say(Setup::media());

    $email = arg('admin-email');
    if ($email === null) {
        fwrite(STDOUT, "no --admin-email given; skipping administrator creation\n");
        exit(0);
    }
    $res = Setup::admin($email, (string) arg('admin-name', 'مدير النظام'), arg('admin-password'));
    say($res['lines']);
    if ($res['password'] !== null) {
        fwrite(STDOUT, "\n  password: {$res['password']}\n\n"
            . "  Shown once. It is not written to the log or the database —\n"
            . "  only its hash is stored. Save it now, then change it.\n\n");
    }
} catch (DbUnavailable $e) {
    fwrite(STDERR, "Database unavailable.\n");
    exit(2);
}
