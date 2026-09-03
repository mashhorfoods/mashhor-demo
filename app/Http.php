<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Request reading and response writing (§20).
 *
 * Every response leaves through this class, so the shape is consistent and the
 * failure vocabulary is fixed: a client sees a code and a sentence it can show
 * a person, never a database message, a stack trace or a path.
 */
final class Http
{
    private static array $input = [];
    private static bool  $read  = false;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function path(): string
    {
        $uri  = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $path = parse_url($uri, PHP_URL_PATH);
        $path = is_string($path) ? $path : '/';
        return '/' . trim($path, '/');
    }

    /** The client's address, trusting a proxy header only when one is configured. */
    public static function ip(): string
    {
        $trust = Env::get('TRUSTED_PROXY_HEADER');
        if ($trust !== null && $trust !== '') {
            $key = 'HTTP_' . strtoupper(str_replace('-', '_', $trust));
            if (!empty($_SERVER[$key])) {
                $first = trim(explode(',', (string) $_SERVER[$key])[0]);
                if (filter_var($first, FILTER_VALIDATE_IP)) return $first;
            }
        }
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
    }

    public static function userAgent(): string
    {
        return mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return isset($_SERVER[$key]) ? (string) $_SERVER[$key] : null;
    }

    public static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') return true;
        return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    }

    /**
     * The body, whatever it was sent as. The public form posts FormData; the
     * admin pages post JSON. Both land in one array so handlers never care.
     */
    public static function input(): array
    {
        if (self::$read) return self::$input;
        self::$read = true;

        $type = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        if (str_contains($type, 'application/json')) {
            $raw = file_get_contents('php://input');
            if (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
                /* a JSON body that is not an object is a malformed payload, not
                   an empty one — §14 rejects unexpected payload structures */
                self::$input = is_array($decoded) ? $decoded : ['__malformed' => true];
            }
        } elseif (self::method() === 'GET') {
            self::$input = $_GET;
        } else {
            self::$input = $_POST;
            if (self::$input === [] && $_GET !== []) self::$input = $_GET;
        }
        return self::$input;
    }

    public static function query(string $key, ?string $default = null): ?string
    {
        return isset($_GET[$key]) && is_scalar($_GET[$key]) ? (string) $_GET[$key] : $default;
    }

    public static function json(array $body, int $status = 200, array $headers = []): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store, private');
            header('X-Content-Type-Options: nosniff');
            header('Referrer-Policy: strict-origin-when-cross-origin');
            /* STAGE 6C — a JSON response has no resources and no reason to be
               framed. Saying so closes the one way a browser could be talked
               into treating an API reply as a document: a mis-sniffed body, or
               this endpoint loaded in a frame to be read across origins. */
            header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox");
            header('X-Frame-Options: DENY');
            foreach ($headers as $h) header($h);
        }
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function ok(array $data = [], int $status = 200): void
    {
        self::json($data + ['ok' => true], $status);
    }

    /**
     * The single failure shape. `message` is written for a person to read;
     * `code` is written for the frontend to branch on. Nothing else is ever
     * added here — no exception text, no query, no path (§20, §26).
     */
    public static function fail(int $status, string $code, string $message, array $extra = []): void
    {
        $body = ['ok' => false, 'error' => ['code' => $code, 'message' => $message]] + $extra;
        self::json($body, $status);
    }

    /** 422 with per-field messages, exactly the shape index.html already reads. */
    public static function invalid(array $errors, string $message = 'تحقّق من الحقول المميّزة.'): void
    {
        self::json([
            'ok'     => false,
            'error'  => ['code' => 'validation_failed', 'message' => $message],
            'errors' => $errors,
        ], 422);
    }

    public static function unauthenticated(): void
    {
        self::fail(401, 'unauthenticated', 'الجلسة غير صالحة أو انتهت. سجّل الدخول من جديد.');
    }

    public static function forbidden(): void
    {
        self::fail(403, 'forbidden', 'ليست لديك صلاحية لتنفيذ هذا الإجراء.');
    }

    public static function notFound(): void
    {
        self::fail(404, 'not_found', 'العنصر المطلوب غير موجود.');
    }

    public static function methodNotAllowed(array $allowed): void
    {
        if (!headers_sent()) header('Allow: ' . implode(', ', $allowed));
        self::fail(405, 'method_not_allowed', 'طريقة الطلب غير مدعومة.');
    }
}
