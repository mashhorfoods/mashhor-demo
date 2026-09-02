<?php
/**
 * Apply pending migrations.  Usage:  php bin/migrate.php [--status]
 *
 * Safe to run repeatedly and safe to run against a populated database: every
 * statement is CREATE ... IF NOT EXISTS and nothing drops or rewrites a table
 * that holds data (§05).
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

$status = in_array('--status', $argv, true);

try {
    if (!Db::ping()) {
        fwrite(STDERR, "Cannot reach the database. Check .env — the values are not printed here.\n");
        exit(2);
    }
    fwrite(STDOUT, "driver: " . Db::driver() . "\n");

    if ($status) {
        $missing = Schema::missingTables();
        fwrite(STDOUT, $missing === []
            ? "schema: complete (" . count(Schema::tables()) . " tables)\n"
            : "schema: missing " . implode(', ', $missing) . "\n");
        exit($missing === [] ? 0 : 1);
    }

    $applied = Schema::migrate(true);
    fwrite(STDOUT, $applied === []
        ? "nothing to apply — schema is current\n"
        : "applied " . count($applied) . " migration(s)\n");

    $missing = Schema::missingTables();
    if ($missing !== []) {
        fwrite(STDERR, "still missing: " . implode(', ', $missing) . "\n");
        exit(1);
    }
    fwrite(STDOUT, "schema verified: " . count(Schema::tables()) . " tables present\n");
} catch (DbUnavailable $e) {
    fwrite(STDERR, "Database unavailable. The detail is in app/storage/logs/, not here.\n");
    exit(2);
}
