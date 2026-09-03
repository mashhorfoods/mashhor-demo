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
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');

/* --- STAGE 6C · content security policy -------------------------------------
 *
 * These pages hold the whole administrative surface: every customer, every
 * request, the session that reaches all of it. If anything ever gets markup
 * into one of them — a customer's own name rendered unescaped, a note pasted
 * from a request — script injected that way runs with the operator's full
 * authority. This is what stops it running at all.
 *
 * The nonce is fresh per response and stamped onto the page's own scripts as
 * it is streamed, which is the one thing the file used to promise it would
 * never do: "nothing is injected into it". That promise is narrowed rather
 * than broken — the only change made to the markup is a nonce attribute on
 * <script>, and nothing else about the page is touched. It has to be done
 * here, because a nonce that is written into the file is not a nonce.
 *
 * Why the policy reads as it does:
 *   script-src   the nonce alone. No 'self', no 'unsafe-inline': a script the
 *                server did not stamp does not run, whatever its source.
 *   style-src    'unsafe-inline' — the stylesheets are inline and so are a
 *                few layout attributes. A style cannot execute; the injection
 *                that matters is a script, and that one is closed.
 *   img-src      'self' and data:, for the inline SVG icons and file previews.
 *   connect-src  'self' — the API and nothing else. An exfiltration attempt
 *                has nowhere to send to.
 *   frame-ancestors  'self', matching X-Frame-Options for older browsers.
 *
 * No third-party host is named here any more, and that is the point: the
 * admin pages used to link their typefaces from fonts.googleapis.com, which
 * told Google when each of the operator's staff signed in and left the
 * dashboard without its typography whenever Google was unreachable. The
 * twelve faces are served from /fonts now, so 'self' is the whole list and
 * anything reaching outward is refused rather than allowed.
 */
$nonce = base64_encode(random_bytes(16));
header(
    "Content-Security-Policy: default-src 'self'; "
    . "script-src 'nonce-{$nonce}'; "
    . "style-src 'self' 'unsafe-inline'; "
    . "img-src 'self' data:; "
    . "font-src 'self'; "
    . "connect-src 'self'; "
    . "form-action 'self'; "
    . "base-uri 'none'; "
    . "frame-ancestors 'self'; "
    . "frame-src 'none'; "
    . "object-src 'none'"
);

$page = (string) file_get_contents($real);
/* Every <script> on the page, whether it carries a src or is inline. The
   lookahead is what keeps it from matching a tag it has already stamped. */
$page = preg_replace(
    '/<script(?![^>]*\bnonce=)(?=[\s>])/i',
    '<script nonce="' . htmlspecialchars($nonce, ENT_QUOTES, 'UTF-8') . '"',
    $page
) ?? $page;

echo $page;
