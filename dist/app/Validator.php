<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Server-side validation (§14).
 *
 * The public form validates in the browser too, but that is a convenience for
 * the person filling it in. This is the rule. Every field the form can send is
 * named here; anything else in the payload is a malformed submission and the
 * request is rejected rather than quietly trimmed.
 *
 * Messages are in Arabic because index.html prints them verbatim under the
 * field they belong to.
 */
final class Validator
{
    private array $data;
    private array $errors = [];
    private array $clean  = [];

    public function __construct(array $data) { $this->data = $data; }

    public function errors(): array { return $this->errors; }
    public function clean(): array  { return $this->clean; }
    public function passed(): bool  { return $this->errors === []; }

    public function error(string $field, string $message): void
    {
        if (!isset($this->errors[$field])) $this->errors[$field] = $message;
    }

    private function raw(string $field): ?string
    {
        $v = $this->data[$field] ?? null;
        if (is_array($v)) { $this->error($field, 'قيمة غير صالحة.'); return null; }
        if ($v === null) return null;
        if (!is_scalar($v)) { $this->error($field, 'قيمة غير صالحة.'); return null; }
        return (string) $v;
    }

    /** Normalise before validating: trim, collapse runs of whitespace, strip control chars. */
    public static function tidy(?string $v): string
    {
        if ($v === null) return '';
        $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? $v;
        $v = preg_replace('/\s+/u', ' ', $v) ?? $v;
        return trim($v);
    }

    /** Same, but newlines survive — notes are a paragraph, not a line. */
    public static function tidyMultiline(?string $v): string
    {
        if ($v === null) return '';
        $v = str_replace(["\r\n", "\r"], "\n", $v);
        $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? $v;
        $v = preg_replace('/[ \t]+/u', ' ', $v) ?? $v;
        $v = preg_replace('/\n{3,}/u', "\n\n", $v) ?? $v;
        return trim($v);
    }

    public function text(string $field, bool $required, int $min, int $max, string $label): ?string
    {
        $v = self::tidy($this->raw($field));
        if ($v === '') {
            if ($required) $this->error($field, "{$label} مطلوب.");
            $this->clean[$field] = null;
            return null;
        }
        if (mb_strlen($v) < $min) { $this->error($field, "{$label} قصير جداً."); return null; }
        if (mb_strlen($v) > $max) { $this->error($field, "{$label} أطول من الحد المسموح ({$max} حرفاً)."); return null; }
        $this->clean[$field] = $v;
        return $v;
    }

    public function multiline(string $field, int $max, string $label): ?string
    {
        $v = self::tidyMultiline($this->raw($field));
        if ($v === '') { $this->clean[$field] = null; return null; }
        if (mb_strlen($v) > $max) { $this->error($field, "{$label} أطول من الحد المسموح ({$max} حرفاً)."); return null; }
        $this->clean[$field] = $v;
        return $v;
    }

    /**
     * Saudi mobile. Accepted as the person is likely to type it — with or
     * without +966, with or without a leading zero, with spaces or dashes —
     * and stored in exactly one canonical form, 05XXXXXXXX, so the customer
     * lookup in §17 cannot miss a match on formatting alone.
     */
    public static function normalisePhone(string $raw): ?string
    {
        $d = preg_replace('/\D+/', '', $raw) ?? '';
        if ($d === '') return null;
        if (str_starts_with($d, '00966')) $d = substr($d, 5);
        elseif (str_starts_with($d, '966')) $d = substr($d, 3);
        if (str_starts_with($d, '0')) $d = substr($d, 1);
        /* what remains must be a mobile line: 5 followed by eight digits */
        if (!preg_match('/^5\d{8}$/', $d)) return null;
        return '0' . $d;
    }

    public function phone(string $field, bool $required, string $label): ?string
    {
        $raw = self::tidy($this->raw($field));
        if ($raw === '') {
            if ($required) $this->error($field, "{$label} مطلوب.");
            $this->clean[$field] = null;
            return null;
        }
        $p = self::normalisePhone($raw);
        if ($p === null) {
            $this->error($field, 'أدخل رقم جوال سعودي صحيح يبدأ بـ 05.');
            return null;
        }
        $this->clean[$field] = $p;
        return $p;
    }

    /** One of a fixed list — the seven approved services, never anything else. */
    public function choice(string $field, array $allowed, bool $required, string $label): ?string
    {
        $v = self::tidy($this->raw($field));
        if ($v === '') {
            if ($required) $this->error($field, "{$label} مطلوب.");
            $this->clean[$field] = null;
            return null;
        }
        if (!in_array($v, $allowed, true)) {
            $this->error($field, "اختر {$label} من القائمة.");
            return null;
        }
        $this->clean[$field] = $v;
        return $v;
    }

    /**
     * A real calendar date, not merely a string shaped like one: checkdate
     * rejects 2026-02-30, which a regex would pass.
     */
    public function date(string $field, bool $required, string $label, bool $notPast = false): ?string
    {
        $v = self::tidy($this->raw($field));
        if ($v === '') {
            if ($required) $this->error($field, "{$label} مطلوب.");
            $this->clean[$field] = null;
            return null;
        }
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m)) {
            $this->error($field, 'صيغة التاريخ غير صحيحة.');
            return null;
        }
        [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        if (!checkdate($mo, $d, $y)) { $this->error($field, 'هذا التاريخ غير موجود.'); return null; }
        if ($y < 2020 || $y > 2100)  { $this->error($field, 'التاريخ خارج المدى المقبول.'); return null; }
        if ($notPast && $v < gmdate('Y-m-d')) {
            $this->error($field, 'لا يمكن طلب رحلة في تاريخ مضى.');
            return null;
        }
        $this->clean[$field] = $v;
        return $v;
    }

    public function time(string $field, bool $required, string $label): ?string
    {
        $v = self::tidy($this->raw($field));
        if ($v === '') {
            if ($required) $this->error($field, "{$label} مطلوب.");
            $this->clean[$field] = null;
            return null;
        }
        /* browsers send HH:MM, and HH:MM:SS when a step is set */
        if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/', $v, $m)) {
            $this->error($field, 'صيغة الوقت غير صحيحة.');
            return null;
        }
        $this->clean[$field] = $m[1] . ':' . $m[2];
        return $this->clean[$field];
    }

    public function email(string $field, bool $required, string $label): ?string
    {
        $v = mb_strtolower(self::tidy($this->raw($field)));
        if ($v === '') {
            if ($required) $this->error($field, "{$label} مطلوب.");
            $this->clean[$field] = null;
            return null;
        }
        if (mb_strlen($v) > 190 || !filter_var($v, FILTER_VALIDATE_EMAIL)) {
            $this->error($field, 'البريد الإلكتروني غير صحيح.');
            return null;
        }
        $this->clean[$field] = $v;
        return $v;
    }

    public function bool(string $field, bool $default = false): bool
    {
        $v = $this->raw($field);
        if ($v === null || $v === '') { $this->clean[$field] = $default; return $default; }
        $b = in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
        $this->clean[$field] = $b;
        return $b;
    }

    /**
     * §14 — an unexpected payload structure is rejected. A submission carrying
     * fields the form does not have is either a probe or a client we do not
     * control; either way it does not get to write a record.
     */
    public function rejectUnknown(array $allowed): void
    {
        if (isset($this->data['__malformed'])) {
            $this->error('_payload', 'صيغة الطلب غير مقبولة.');
            return;
        }
        foreach (array_keys($this->data) as $k) {
            if (!in_array((string) $k, $allowed, true)) {
                $this->error('_payload', 'صيغة الطلب غير مقبولة.');
                return;
            }
        }
    }
}
