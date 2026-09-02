<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Configuration comes from a .env file that is never committed and never
 * served. Nothing in this class ever echoes a value: §03 and §22 forbid
 * credentials in source, and the same rule applies to error output.
 */
final class Env
{
    private static array $vars = [];
    private static bool $loaded = false;

    /** Above the web root first — a host that mis-serves dotfiles cannot reach it there. */
    public static function candidates(): array
    {
        return [
            dirname(AUN_ROOT) . '/.env',   /* /home/<user>/.env  — preferred */
            AUN_ROOT . '/.env',            /* project root       — local dev */
            AUN_ROOT . '/app/.env',        /* inside app/        — denied by .htaccess */
        ];
    }

    public static function load(?string $path = null): void
    {
        if (self::$loaded && $path === null) return;
        $files = $path !== null ? [$path] : self::candidates();
        foreach ($files as $file) {
            if (!is_file($file) || !is_readable($file)) continue;
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#') continue;
                $eq = strpos($line, '=');
                if ($eq === false) continue;
                $k = trim(substr($line, 0, $eq));
                $v = trim(substr($line, $eq + 1));
                /* strip an inline comment only when the value is not quoted */
                if ($v !== '' && $v[0] !== '"' && $v[0] !== "'") {
                    $hash = strpos($v, ' #');
                    if ($hash !== false) $v = rtrim(substr($v, 0, $hash));
                } elseif ($v !== '' && ($v[0] === '"' || $v[0] === "'")) {
                    $q = $v[0];
                    $end = strrpos($v, $q);
                    if ($end > 0) $v = substr($v, 1, $end - 1);
                }
                if ($k !== '' && !array_key_exists($k, self::$vars)) self::$vars[$k] = $v;
            }
            break;   /* the first file that exists wins; no merging, no surprises */
        }
        self::$loaded = true;
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        if (array_key_exists($key, self::$vars)) return self::$vars[$key];
        $v = getenv($key);
        return $v === false ? $default : $v;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $v = self::get($key);
        if ($v === null || $v === '') return $default;
        return in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    }

    public static function int(string $key, int $default): int
    {
        $v = self::get($key);
        return ($v === null || $v === '' || !is_numeric($v)) ? $default : (int) $v;
    }

    public static function require(string $key): string
    {
        $v = self::get($key);
        if ($v === null || $v === '') {
            /* names the key, never the value, and never what the file contains */
            throw new RuntimeException("Missing required configuration: {$key}");
        }
        return $v;
    }

    public static function isProduction(): bool
    {
        return strtolower((string) self::get('APP_ENV', 'production')) === 'production';
    }

    public static function debug(): bool
    {
        return self::bool('APP_DEBUG', false) && !self::isProduction();
    }

    /** For the health endpoint: which keys are set, never what they hold. */
    public static function presence(array $keys): array
    {
        $out = [];
        foreach ($keys as $k) {
            $v = self::get($k);
            $out[$k] = ($v !== null && $v !== '');
        }
        return $out;
    }
}
