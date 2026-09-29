<?php
// Router for PHP's built-in server, mirroring the .htaccess rules the tests
// depend on: /go serves go.html (extensionless URLs); _lib/ and _leads/ are closed.
//   php -S 127.0.0.1:8099 -t site tests/router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = $_SERVER['DOCUMENT_ROOT'];
// As their .htaccess files do on the host: nothing in _lib/ or _leads/ is served.
if (preg_match('#^/_(lib|leads)/#', $path)) {
    http_response_code(403);
    return true;
}
if ($path !== '/' && !pathinfo($path, PATHINFO_EXTENSION) && is_file($root . $path . '.html')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($root . $path . '.html');
    return true;
}
return false;
