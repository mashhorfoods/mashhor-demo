<?php
/**
 * عون الدرب للنقل المتخصص — API front controller.
 *
 * Every /api/* request arrives here, routed by api/.htaccess. This file is
 * deliberately the only PHP file under the document root that does anything:
 * the application lives in app/, which the server refuses to serve.
 */
declare(strict_types=1);

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

/* §25 — frontend and backend share one origin on this deployment, so there is
   no CORS to configure and none is added. A cross-origin allowance that is not
   needed is a hole that is not needed either. If the admin is ever served from
   a second hostname, set APP_CORS_ORIGIN and the exact origin is echoed back —
   never a wildcard, and never with credentials. */
$corsOrigin = Env::get('APP_CORS_ORIGIN');
if ($corsOrigin !== null && $corsOrigin !== '') {
    $sent = Http::header('Origin');
    $allowed = array_map('trim', explode(',', $corsOrigin));
    if ($sent !== null && in_array($sent, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $sent);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, Accept');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    }
}

Routes::dispatch();
