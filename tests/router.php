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
// The forwarding rules, read from the built .htaccess (its FORWARD block).
$rules = @file_get_contents($root . '/.htaccess') ?: '';
if (preg_match('/# FORWARD:START(.*?)# FORWARD:END/s', $rules, $block)) {
    preg_match_all('/RewriteRule\s+(\S+)\s+(\S+)\s+\[([^\]]*)\]/', $block[1], $found, PREG_SET_ORDER);
    foreach ($found as [, $pattern, $target, $flags]) {
        $re = '#' . str_replace('#', '\\#', $pattern) . '#' . (stripos($flags, 'NC') !== false ? 'i' : '');
        if (preg_match($re, ltrim($path, '/'))) {
            header('Location: ' . $target, true, 301);
            return true;
        }
    }
}
if ($path !== '/' && !pathinfo($path, PATHINFO_EXTENSION) && is_file($root . $path . '.html')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($root . $path . '.html');
    return true;
}
// Missing, as on the host (ErrorDocument 404): the 404 page, with its status.
$asked = rawurldecode(strtok($_SERVER['REQUEST_URI'], '?'));
if (!is_file($root . $path) && !is_dir($root . $path) && !is_file($root . $asked)) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    readfile($root . '/404.html');
    return true;
}
return false;
