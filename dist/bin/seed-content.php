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
 * undo their work. The work itself lives in app/Setup.php.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$force = in_array('--force', $argv, true);

try {
    if (!Db::ping()) { fwrite(STDERR, "Cannot reach the database.\n"); exit(2); }
    Schema::migrate();

    foreach (Setup::content($force) as $l) fwrite(STDOUT, $l . "\n");
    foreach (Setup::settings($force) as $l) fwrite(STDOUT, $l . "\n");
    fwrite(STDOUT, "\n");
    foreach (Setup::publishTarget() as $l) fwrite(STDOUT, $l . "\n");
} catch (DbUnavailable $e) {
    fwrite(STDERR, "Database unavailable.\n");
    exit(2);
}
