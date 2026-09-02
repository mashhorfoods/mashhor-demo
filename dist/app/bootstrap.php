<?php
/**
 * عون الدرب للنقل المتخصص — backend bootstrap.
 *
 * Loaded by api/index.php and by the scripts in bin/. Nothing under app/ is
 * ever served directly: app/.htaccess denies the whole directory, and every
 * file guards on AUN_APP so a misconfigured host that ignores .htaccess still
 * returns an empty response rather than source.
 */
declare(strict_types=1);

if (!defined('AUN_APP')) { http_response_code(404); exit; }

define('AUN_ROOT', dirname(__DIR__));
define('AUN_START', microtime(true));

require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Log.php';
require_once __DIR__ . '/Db.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Validator.php';
require_once __DIR__ . '/Csrf.php';
require_once __DIR__ . '/RateLimit.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Authz.php';
require_once __DIR__ . '/Schema.php';
require_once __DIR__ . '/Repo/Users.php';
require_once __DIR__ . '/Repo/Customers.php';
require_once __DIR__ . '/Repo/Requests.php';
require_once __DIR__ . '/Repo/Content.php';
require_once __DIR__ . '/Repo/Activity.php';
require_once __DIR__ . '/Repo/Cms.php';
require_once __DIR__ . '/Repo/Reports.php';
require_once __DIR__ . '/Publisher.php';
require_once __DIR__ . '/Setup.php';
require_once __DIR__ . '/Routes.php';

Env::load();

/*
 * Errors are never printed. In production the browser gets a controlled JSON
 * body and the detail goes to the log; in development the detail also goes to
 * the response, which is why APP_DEBUG must stay false on a public host.
 * §20, §21, §26.
 */
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '0');   /* Log:: writes the file itself, with redaction */

set_error_handler(static function (int $no, string $str, string $file, int $line): bool {
    if (!(error_reporting() & $no)) return false;
    throw new ErrorException($str, 0, $no, $file, $line);
});

set_exception_handler(static function (Throwable $e): void {
    Log::exception($e);
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, get_class($e) . ': ' . $e->getMessage() . ' @ '
            . $e->getFile() . ':' . $e->getLine() . PHP_EOL);
        exit(1);
    }
    Http::fail(500, 'server_error', 'تعذّر إتمام العملية. حاول مرة أخرى.');
});

register_shutdown_function(static function (): void {
    $e = error_get_last();
    if ($e === null || !in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) return;
    Log::write('fatal', $e['message'], ['file' => $e['file'], 'line' => $e['line']]);
    if (PHP_SAPI !== 'cli' && !headers_sent()) {
        Http::fail(500, 'server_error', 'تعذّر إتمام العملية. حاول مرة أخرى.');
    }
});
