<?php
/**
 * Development router for PHP's built-in server. It reproduces what
 * api/.htaccess, admin/.htaccess and the root .htaccess do on Apache and
 * LiteSpeed, so `php -S` behaves like the real host:
 *
 *   php -S 127.0.0.1:8088 -t . router-dev.php
 *
 * It is a development tool. The production rules are the .htaccess files —
 * this file is never uploaded (build.js does not ship it).
 */
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

/* the API front controller */
if ($path === '/api' || str_starts_with($path, '/api/')) {
    require __DIR__ . '/api/index.php';
    return true;
}

/* nothing under app/ or bin/, and no dotfile or working document, is servable */
if (preg_match('#^/(app|bin)/#', $path)
    || preg_match('#(^|/)\.[^/]#', $path)
    || preg_match('#\.(env|ini|log|sqlite|sqlite3|db|md|yml|yaml|lock)$#i', $path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    return true;
}

/* every admin page goes through the session guard */
if ($path === '/admin' || $path === '/admin/') {
    $_GET['page'] = 'dashboard.html';
    require __DIR__ . '/admin/guard.php';
    return true;
}
if (preg_match('#^/admin/([a-z0-9][a-z0-9-]*\.html)$#', $path, $m)) {
    $_GET['page'] = $m[1];
    require __DIR__ . '/admin/guard.php';
    return true;
}

return false;   /* everything else is a static file */
