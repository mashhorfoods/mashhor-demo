<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Services, media references and settings.
 *
 * The seven approved services are the source of truth for what the public form
 * may submit, so a service lookup is also a validation rule (§14): a request
 * naming a service that is not published is rejected rather than stored.
 * §35 forbids new business features, so nothing here creates an eighth.
 */
final class Repo_Content
{
    /* ---- services ------------------------------------------------------ */

    public static function services(bool $publishedOnly = false): array
    {
        $sql = 'SELECT * FROM services';
        if ($publishedOnly) $sql .= ' WHERE is_published = 1';
        $sql .= ' ORDER BY sort_order ASC, id ASC';
        return Db::all($sql);
    }

    public static function serviceTitles(bool $publishedOnly = true): array
    {
        return array_map(
            static fn(array $s): string => (string) $s['title'],
            self::services($publishedOnly)
        );
    }

    public static function findServiceByTitle(string $title): ?array
    {
        return Db::one('SELECT * FROM services WHERE title = ?', [$title]);
    }

    public static function findServiceBySlug(string $slug): ?array
    {
        return Db::one('SELECT * FROM services WHERE slug = ?', [$slug]);
    }

    public static function updateService(int $id, array $fields, array $actor): void
    {
        $allowed = ['title', 'description', 'sort_order', 'is_published', 'image_path'];
        $set = [];
        $params = [];
        foreach ($fields as $k => $v) {
            if (!in_array($k, $allowed, true)) continue;
            $set[] = "{$k} = ?";
            $params[] = $v;
        }
        if ($set === []) return;
        $set[] = 'updated_at = ?';
        $params[] = Db::now();
        $params[] = $id;
        Db::transaction(static function () use ($set, $params, $id, $actor): void {
            Db::run('UPDATE services SET ' . implode(', ', $set) . ' WHERE id = ?', $params);
            $s = Db::one('SELECT slug, title FROM services WHERE id = ?', [$id]);
            Repo_Activity::record($actor, 'services', 'edit', 'service',
                (string) ($s['slug'] ?? $id), (string) ($s['title'] ?? ''),
                'تحديث بيانات الخدمة المنشورة على الموقع');
        });
    }

    public static function publicService(array $s): array
    {
        return [
            'id'          => (int) $s['id'],
            'slug'        => (string) $s['slug'],
            'title'       => (string) $s['title'],
            'description' => (string) $s['description'],
            'order'       => (int) $s['sort_order'],
            'published'   => (bool) (int) $s['is_published'],
            'image'       => $s['image_path'],
            'updatedAt'   => (string) $s['updated_at'],
        ];
    }

    /* ---- media --------------------------------------------------------- */

    public static function media(): array
    {
        return Db::all('SELECT * FROM media_assets ORDER BY uploaded_at DESC, id DESC');
    }

    public static function upsertMedia(array $a): void
    {
        $existing = Db::one('SELECT id FROM media_assets WHERE path = ?', [$a['path']]);
        if ($existing !== null) {
            Db::run(
                'UPDATE media_assets SET filename=?, mime=?, width=?, height=?, bytes=? WHERE id=?',
                [$a['filename'], $a['mime'] ?? null, $a['width'] ?? null, $a['height'] ?? null,
                 $a['bytes'] ?? null, $existing['id']]
            );
            return;
        }
        Db::run(
            'INSERT INTO media_assets (path, filename, mime, width, height, bytes, uploaded_at)
             VALUES (?,?,?,?,?,?,?)',
            [$a['path'], $a['filename'], $a['mime'] ?? null, $a['width'] ?? null,
             $a['height'] ?? null, $a['bytes'] ?? null, $a['uploaded_at'] ?? Db::now()]
        );
    }

    public static function publicMedia(array $m): array
    {
        return [
            'id'       => (int) $m['id'],
            'path'     => (string) $m['path'],
            'name'     => (string) $m['filename'],
            'mime'     => $m['mime'],
            'width'    => $m['width'] === null ? null : (int) $m['width'],
            'height'   => $m['height'] === null ? null : (int) $m['height'],
            'bytes'    => $m['bytes'] === null ? null : (int) $m['bytes'],
            'uploaded' => (string) $m['uploaded_at'],
        ];
    }

    /* ---- settings ------------------------------------------------------- */

    public static function settings(?string $category = null): array
    {
        $sql = 'SELECT category, name, value, updated_at FROM settings';
        $params = [];
        if ($category !== null) { $sql .= ' WHERE category = ?'; $params[] = $category; }
        $out = [];
        foreach (Db::all($sql . ' ORDER BY category, name', $params) as $r) {
            $out[(string) $r['category']][(string) $r['name']] = $r['value'];
        }
        return $out;
    }

    public static function saveSettings(string $category, array $values, array $actor): void
    {
        Db::transaction(static function () use ($category, $values, $actor): void {
            $now = Db::now();
            foreach ($values as $name => $value) {
                $exists = Db::value('SELECT 1 FROM settings WHERE category = ? AND name = ?',
                    [$category, (string) $name]);
                if ($exists) {
                    Db::run('UPDATE settings SET value=?, updated_at=?, updated_by=? WHERE category=? AND name=?',
                        [$value, $now, (int) $actor['id'], $category, (string) $name]);
                } else {
                    Db::run('INSERT INTO settings (category, name, value, updated_at, updated_by) VALUES (?,?,?,?,?)',
                        [$category, (string) $name, $value, $now, (int) $actor['id']]);
                }
            }
            Repo_Activity::record($actor, 'settings', 'edit', 'settings', $category, $category,
                'تحديث إعدادات النظام');
        });
    }
}
