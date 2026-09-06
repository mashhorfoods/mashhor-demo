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
/* The address is clean in production — /admin/requests — and a request that
   still names the file is redirected there permanently. Both are reproduced
   here so the local server behaves like the host and the gates test what
   actually ships. */
if (preg_match('#^/admin/([a-z0-9][a-z0-9-]*)\.html$#', $path, $m)) {
    $qs = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY) ?? '');
    header('Location: /admin/' . $m[1] . ($qs !== '' ? '?' . $qs : ''), true, 301);
    return true;
}
if (preg_match('#^/admin/([a-z0-9][a-z0-9-]*)$#', $path, $m)) {
    $_GET['page'] = $m[1] . '.html';
    require __DIR__ . '/admin/guard.php';
    return true;
}

/* Everything else is a static file — and when there is no such file the host
   answers 404 and serves 404.html (root .htaccess, ErrorDocument). PHP's
   built-in server does not: it fell back to index.html with a 200, so every
   wrong address looked like the home page. That is a soft 404 — the shape of
   error a crawler indexes as a duplicate of the home page — and it made the
   public gate read a pass where production would have failed. */
$file = __DIR__ . rawurldecode($path);
if ($path !== '/' && !is_file($file)) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/404.html');
    return true;
}

return false;   /* everything else is a static file */
