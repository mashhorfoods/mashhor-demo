<?php
// Router for PHP's built-in server, mirroring the one .htaccess rule the
// campaign depends on: /go serves go.html (extensionless URLs).
//   php -S 127.0.0.1:8099 -t pixora/site pixora/tests/router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = $_SERVER['DOCUMENT_ROOT'];
if ($path !== '/' && !pathinfo($path, PATHINFO_EXTENSION) && is_file($root . $path . '.html')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($root . $path . '.html');
    return true;
}
return false;
