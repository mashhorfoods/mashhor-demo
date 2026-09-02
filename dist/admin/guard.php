<?php
/**
 * Protected admin routes (§11).
 *
 * admin/.htaccess sends every request for an admin page here first. The
 * session is checked before a single byte of the page is read, so an
 * unauthenticated visitor gets a redirect and nothing else — §11 is explicit
 * that protected page data must not be leaked before redirecting, and a
 * client-side "check then hide" does exactly that.
 *
 * The page is then streamed from disk. It is still the same static HTML the
 * earlier stages built; nothing is injected into it and no markup changes.
 */
declare(strict_types=1);

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

/* Which page was asked for. Only files that exist in this directory and end
   in .html are servable — no traversal, no arbitrary read. */
$requested = (string) (Http::query('page') ?? '');
if ($requested === '') {
    $path = Http::path();                       /* /admin/requests.html */
    $requested = basename($path);
}
if ($requested === '' || $requested === 'admin') $requested = 'dashboard.html';

if (!preg_match('/^[a-z0-9][a-z0-9-]{0,60}\.html$/', $requested)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}

$file = __DIR__ . '/' . $requested;
$real = realpath($file);
if ($real === false || !str_starts_with($real, __DIR__ . DIRECTORY_SEPARATOR) || !is_file($real)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not found';
    exit;
}

/* The login page is the one page that must stay reachable without a session. */
$public = ['login.html'];

if (!in_array($requested, $public, true)) {
    $ok = false;
    try {
        $ok = Auth::check();
    } catch (Throwable $e) {
        /* A database that is down must not become an open door. */
        Log::exception($e);
        $ok = false;
    }
    if (!$ok) {
        /* Where the operator was heading, so login can return them there.
           Only a bare page name survives — never an absolute or foreign URL. */
        $next = preg_match('/^[a-z0-9][a-z0-9-]{0,60}\.html$/', $requested) ? $requested : 'dashboard.html';
        header('Location: /admin/login.html?next=' . rawurlencode($next), true, 302);
        header('Cache-Control: no-store, private');
        exit;
    }
}

/* An admin page must never be cached: a page held in the browser's history
   would otherwise still render after logout (§09). */
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
/* SAMEORIGIN, not DENY: cross-origin framing is what clickjacking needs, and
   blocking it outright also blocks same-origin tooling for no extra safety. */
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');

readfile($real);
