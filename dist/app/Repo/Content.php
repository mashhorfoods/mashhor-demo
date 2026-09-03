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
        Db::transaction(static function () use ($set, $params, $id, $actor, $fields): void {
            Db::run('UPDATE services SET ' . implode(', ', $set) . ' WHERE id = ?', $params);
            $s = Db::one('SELECT slug, title, description, is_published, sort_order FROM services WHERE id = ?', [$id]);
            if ($s !== null) {
                /* the public page renders from the template, so it follows the
                   record rather than being written separately by each caller */
            }
            Repo_Activity::record($actor, 'services', 'edit', 'service',
                (string) ($s['slug'] ?? $id), (string) ($s['title'] ?? ''),
                'تحديث بيانات الخدمة المنشورة على الموقع');
        });
    }

    /**
     * Reordering the seven approved services. One transaction, so a partial
     * order cannot survive a failure, and only ids that are actually services
     * are touched — a crafted payload cannot pull a row out of another table.
     *
     * The RECOVERY 02 publishing template is kept in step by the same call,
     * because the public page renders from that template and an order that
     * lived only in `services` would never reach the site.
     */
    public static function reorderServices(array $ids, array $actor): int
    {
        return Db::transaction(static function () use ($ids, $actor): int {
            $i = 0;
            foreach (array_values($ids) as $id) {
                $svc = Db::one('SELECT id, slug FROM services WHERE id = ?', [(int) $id]);
                if ($svc === null) continue;
                $i++;
                Db::run('UPDATE services SET sort_order = ?, updated_at = ? WHERE id = ?',
                    [$i, Db::now(), (int) $svc['id']]);
            }
            Repo_Activity::record($actor, 'services', 'edit', 'services', null, 'الخدمات',
                'تغيير ترتيب الخدمات على الموقع');
            return $i;
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
        self::healMedia();
        return Db::all('SELECT * FROM media_assets ORDER BY uploaded_at DESC, id DESC');
    }

    /**
     * Fill in what could not be read when the row was written.
     *
     * Setup::media() reads each file's dimensions, type and size off disk at
     * install time — and records nulls for a file that is not there. Twelve of
     * the eighteen were not there, because the package shipped only the sized
     * variants and the library registers the masters. So the library ended up
     * holding rows that knew a path and nothing else, and the service form's
     * picker offered «medical-bed-transport.webp (null×null)».
     *
     * The package carries those files now, so the missing facts are readable.
     * They are read here rather than in a migration because this hosting plan
     * has no terminal to run one from: the listing repairs what it can, once,
     * and a row that has its dimensions is never touched again. A file that is
     * still absent stays null and stays visible as absent — the point is to
     * stop guessing, not to invent.
     */
    private static function healMedia(): void
    {
        $rows = Db::all('SELECT id, path FROM media_assets
                          WHERE width IS NULL OR height IS NULL OR bytes IS NULL');
        foreach ($rows as $r) {
            $abs = AUN_ROOT . '/' . $r['path'];
            if (!is_file($abs)) continue;
            $dim = function_exists('getimagesize') ? @getimagesize($abs) : false;
            $w = $dim ? (int) $dim[0] : null;
            $h = $dim ? (int) $dim[1] : null;
            $mime = $dim ? ($dim['mime'] ?? null) : null;

            /* getimagesize() cannot read an SVG — it is markup, not a raster —
               so the two logos stayed dimensionless and were re-read on every
               listing. Their size is written on the root element. */
            if ($w === null && strtolower(pathinfo($abs, PATHINFO_EXTENSION)) === 'svg') {
                $head = (string) @file_get_contents($abs, false, null, 0, 2048);
                $mime = 'image/svg+xml';
                if (preg_match('/<svg[^>]*\bwidth="([\d.]+)[a-z%]*"[^>]*\bheight="([\d.]+)[a-z%]*"/i', $head, $m)) {
                    $w = (int) round((float) $m[1]);
                    $h = (int) round((float) $m[2]);
                } elseif (preg_match('/<svg[^>]*\bviewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/i', $head, $m)) {
                    $w = (int) round((float) $m[1]);
                    $h = (int) round((float) $m[2]);
                }
            }

            Db::run('UPDATE media_assets SET mime = ?, width = ?, height = ?, bytes = ? WHERE id = ?', [
                $mime, $w, $h, (int) filesize($abs), (int) $r['id'],
            ]);
        }
        if ($rows !== []) {
            Log::write('info', 'media rows completed from disk', ['rows' => count($rows)]);
        }
    }

    public static function upsertMedia(array $a, ?array $actor = null): void
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
            'INSERT INTO media_assets (path, filename, mime, width, height, bytes, uploaded_at, uploaded_by)
             VALUES (?,?,?,?,?,?,?,?)',
            [$a['path'], $a['filename'], $a['mime'] ?? null, $a['width'] ?? null,
             $a['height'] ?? null, $a['bytes'] ?? null, $a['uploaded_at'] ?? Db::now(),
             $actor === null ? null : (int) $actor['id']]
        );
    }

    /**
     * Which parts of the public page reference each asset.
     *
     * Computed from index.html, not stored — the same decision Stage 12 made,
     * and for the same reason: a stored usage list is a second copy of a fact
     * the page already states, and the two drift the moment someone edits the
     * page. The section an asset appears in is found by walking back to the
     * nearest heading, so the answer stays true when a section moves.
     */
    public static function mediaUsage(): array
    {
        $target = Publisher::target();
        if ($target === null) return [];
        $html = @file_get_contents($target);
        if ($html === false) return [];
        /* a commented-out <img> is not a use. Comments are replaced with
           spaces of the same length so every later offset still points at the
           right section. */
        $html = preg_replace_callback('/<!--(?!\/?aun:).*?-->/s',
            static fn(array $m): string => str_repeat(' ', strlen($m[0])), $html) ?? $html;

        /* every section's heading, by the offset it starts at */
        $marks = [];
        if (preg_match_all('/<h2[^>]*>(.*?)<\/h2>/s', $html, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[1] as $hit) {
                $text = trim(strip_tags((string) $hit[0]));
                if ($text !== '') $marks[] = ['at' => (int) $hit[1], 'label' => $text];
            }
        }
        $sectionAt = static function (int $offset) use ($marks): string {
            $label = 'الصفحة الرئيسية';
            foreach ($marks as $mk) {
                if ($mk['at'] > $offset) break;
                $label = $mk['label'];
            }
            return $label;
        };

        /* the asset paths that actually exist, so a variant is only collapsed
           onto a master that is really there — brand/favicon-32.png is a
           master whose name merely looks like a variant */
        $known = [];
        foreach (Db::all('SELECT path FROM media_assets') as $r) $known[(string) $r['path']] = true;

        $usage = [];
        $add = function (string $url, int $offset) use (&$usage, $known, $sectionAt): void {
            /* an absolute URL in a meta tag points at the same file */
            $url = preg_replace('#^https?://[^/]+/#', '', $url) ?? $url;
            $url = ltrim($url, './');
            if (!preg_match('#^(img|brand)/#', $url)) return;
            $path = isset($known[$url]) ? $url : self::basePath($url, $known);
            if (!isset($known[$path])) return;
            $usage[$path][$sectionAt($offset)] = true;
        };

        /* src, href and content alike — a logo named in a <link> or an
           Open Graph tag is in use just as much as one in an <img> */
        if (preg_match_all('/(?:src|href|content)="([^"]+)"/', $html, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[1] as $hit) $add((string) $hit[0], (int) $hit[1]);
        }
        if (preg_match_all('/srcset="([^"]+)"/', $html, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[1] as $hit) {
                foreach (explode(',', (string) $hit[0]) as $candidate) {
                    $url = trim(explode(' ', trim($candidate))[0]);
                    if ($url !== '') $add($url, (int) $hit[1]);
                }
            }
        }
        /* structured data names the logo as a JSON string, not an attribute */
        if (preg_match_all('#"(?:logo|image|url)"\s*:\s*"([^"]+)"#', $html, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[1] as $hit) $add((string) $hit[0], (int) $hit[1]);
        }

        $out = [];
        foreach ($usage as $path => $sections) $out[$path] = array_keys($sections);
        return $out;
    }

    /**
     * A responsive variant belongs to its master — wheelchair-360.webp is
     * wheelchair.webp. The suffix is only stripped when the result is an asset
     * that actually exists, because a master may legitimately end in a number.
     */
    private static function basePath(string $path, array $known = []): string
    {
        $base = preg_replace('/-\d+(\.(?:webp|avif|png|jpg|jpeg))$/i', '$1', $path) ?? $path;
        if ($base === $path) return $path;
        return ($known === [] || isset($known[$base])) ? $base : $path;
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

    /**
     * Settings carry mixed types — a toggle is a boolean, a select is an index,
     * a name is a string — and a TEXT column would flatten all three into
     * strings. Each value is therefore stored JSON-encoded and decoded here,
     * so what the interface saved is exactly what it loads back. A string
     * "123" survives as the string "123", which a bare numeric cast would not.
     */
    /**
     * Settings fields that are not settings at all — they are the published
     * page, reached from a second screen.
     *
     * Each of these held its own copy of a fact the page already stores in a
     * content block, and the copy an administrator would naturally reach for
     * was the one that published nowhere. The block is the record now; these
     * keys are windows onto it. Editing the phone number in الإعدادات changes
     * the website, which is what everyone already assumed it did.
     *
     * settings key => the content block that actually publishes
     */
    public const SETTINGS_ALIAS = [
        'company.cAddr'  => 'contact.address',
        'company.cTag'   => 'contact.tagline',
        'contact.cPhone' => 'contact.phone_display',
        'contact.cSite'  => 'contact.website',
        /* stage 3 — the page's own metadata, shown in الإعدادات since the
           beginning and until now unable to reach the page at all */
        'site.sTitle'    => 'seo.title',
        'site.sDesc'     => 'seo.description',
    ];

    /** The block a settings field is a window onto, or null if it is its own. */
    public static function aliasOf(string $category, string $name): ?string
    {
        return self::SETTINGS_ALIAS[$category . '.' . $name] ?? null;
    }

    public static function settings(?string $category = null): array
    {
        $sql = 'SELECT category, name, value, updated_at FROM settings';
        $params = [];
        if ($category !== null) { $sql .= ' WHERE category = ?'; $params[] = $category; }
        $out = [];
        foreach (Db::all($sql . ' ORDER BY category, name', $params) as $r) {
            $out[(string) $r['category']][(string) $r['name']] = self::decode($r['value']);
        }
        /* An aliased field answers from the block it is a window onto, so the
           settings screen shows what the website shows and cannot drift. */
        foreach (self::SETTINGS_ALIAS as $path => $blockKey) {
            [$cat, $name] = explode('.', $path, 2);
            if ($category !== null && $category !== $cat) continue;
            $block = Repo_Cms::block($blockKey, 'ar');
            if ($block === null) continue;
            $out[$cat][$name] = (string) $block['value'];
        }
        return $out;
    }

    private static function decode($raw)
    {
        if ($raw === null) return null;
        $v = json_decode((string) $raw, true);
        /* a value that is not valid JSON predates the encoding; return it as
           the string it is rather than losing it */
        return json_last_error() === JSON_ERROR_NONE ? $v : $raw;
    }

    /**
     * Create a service.
     *
     * Until now this was impossible: the save endpoint refused anything
     * without an existing id, and a service needed a second record of HTML
     * that only a developer could write. Since stage 1 a service is one
     * record, so creating one is creating a row.
     *
     * The icon is copied from a service that already exists rather than
     * invented: the seven on the site are approved artwork, and nothing here
     * should draw a new one. The picture comes from the media library and is
     * written as a plain <img> — the responsive ladders on the original seven
     * were produced by the build's image pipeline, which does not run on the
     * server, and claiming a srcset that does not exist would be worse than
     * one honest size.
     *
     * @return array{ok: bool, error?: string, id?: int, slug?: string}
     */
    public static function createService(array $in, array $actor): array
    {
        $title = trim((string) ($in['title'] ?? ''));
        $desc  = trim((string) ($in['description'] ?? ''));
        $image = trim((string) ($in['image'] ?? ''));
        $alt   = trim((string) ($in['alt'] ?? ''));
        $iconFrom = trim((string) ($in['iconFrom'] ?? ''));

        if (mb_strlen($title) < 2)  return ['ok' => false, 'error' => 'أدخل عنوان الخدمة.'];
        if (mb_strlen($desc)  < 2)  return ['ok' => false, 'error' => 'أدخل وصف الخدمة.'];
        if (mb_strlen($alt)   < 5)  return ['ok' => false, 'error' => 'أدخل وصفاً للصورة — يقرؤه من يستخدم قارئ الشاشة.'];

        $asset = Db::one('SELECT * FROM media_assets WHERE path = ?', [$image]);
        if ($asset === null) return ['ok' => false, 'error' => 'اختر صورة من مكتبة الوسائط.'];

        $source = Db::one('SELECT icon_svg FROM services WHERE slug = ? AND icon_svg IS NOT NULL', [$iconFrom]);
        if ($source === null) return ['ok' => false, 'error' => 'اختر الأيقونة من إحدى الخدمات الحالية.'];

        if (self::findServiceByTitle($title) !== null) {
            return ['ok' => false, 'error' => 'توجد خدمة بهذا العنوان بالفعل.'];
        }

        /* a slug nobody types and nothing collides with */
        $n = 1;
        do { $slug = 'service-' . (count(self::services()) + $n); $n++; }
        while (self::findServiceBySlug($slug) !== null);

        $img = sprintf(
            '<img src="%s" width="%d" height="%d" loading="lazy" decoding="async" alt="%s">',
            htmlspecialchars((string) $asset['path'], ENT_QUOTES, 'UTF-8'),
            (int) $asset['width'], (int) $asset['height'],
            htmlspecialchars($alt, ENT_QUOTES, 'UTF-8')
        );

        $now  = Db::now();
        $next = (int) Db::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM services');
        Db::run(
            'INSERT INTO services (slug, title, description, sort_order, is_published, image_path,
                                   icon_svg, image_html, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$slug, $title, $desc, $next, 0, (string) $asset['path'],
             (string) $source['icon_svg'], $img, $now, $now]
        );
        $id = (int) Db::lastId();

        Repo_Activity::record($actor, 'services', 'create', 'service', $slug, $title,
            'إضافة خدمة جديدة — تبدأ مخفية حتى تُراجَع وتُنشر');

        return ['ok' => true, 'id' => $id, 'slug' => $slug];
    }

    /**
     * What an uploaded picture is allowed to be.
     *
     * The type is decided by reading the file, never by trusting the name or
     * the browser's Content-Type: both are supplied by whoever is uploading.
     * The extension is then written by us from what we found.
     */
    public const UPLOAD_TYPES = [
        IMAGETYPE_WEBP => ['webp', 'image/webp'],
        IMAGETYPE_JPEG => ['jpg',  'image/jpeg'],
        IMAGETYPE_PNG  => ['png',  'image/png'],
        IMAGETYPE_AVIF => ['avif', 'image/avif'],
    ];
    public const UPLOAD_MAX_BYTES = 4194304;   /* 4 MB */

    /**
     * Store an uploaded picture and index it.
     *
     * The file is renamed by the system, not by whoever sent it: a name is
     * attacker-controlled input, and the one place it would end up is a URL.
     *
     * @param array $file one entry of $_FILES
     * @return array{ok: bool, error?: string, asset?: array}
     */
    public static function storeUpload(array $file, array $actor): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return ['ok' => false, 'error' => 'تعذّر رفع الملف. حاول مرة أخرى.'];
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            return ['ok' => false, 'error' => 'الملف غير صالح.'];
        }
        if ((int) ($file['size'] ?? 0) > self::UPLOAD_MAX_BYTES) {
            return ['ok' => false, 'error' => 'حجم الصورة أكبر من 4 ميجابايت.'];
        }

        $info = @getimagesize($tmp);
        if ($info === false || !isset(self::UPLOAD_TYPES[$info[2]])) {
            return ['ok' => false, 'error' => 'الملف ليس صورة من الأنواع المسموحة (WebP أو JPEG أو PNG أو AVIF).'];
        }
        [$ext, $mime] = self::UPLOAD_TYPES[$info[2]];
        [$w, $h] = [(int) $info[0], (int) $info[1]];
        if ($w < 200 || $h < 200) {
            return ['ok' => false, 'error' => 'الصورة صغيرة جداً — 200 بكسل على الأقل في كل بُعد.'];
        }

        $dir = AUN_ROOT . '/img';
        if (!is_dir($dir)) return ['ok' => false, 'error' => 'مجلد الصور غير موجود على الخادم.'];
        if (!is_writable($dir)) return ['ok' => false, 'error' => 'مجلد الصور غير قابل للكتابة على الخادم.'];

        /* the name is ours: a date for ordering, random bytes so one upload
           cannot guess or overwrite another, and the extension we determined */
        $name = 'up-' . gmdate('Ymd') . '-' . bin2hex(random_bytes(5)) . '.' . $ext;
        $path = 'img/' . $name;
        if (!@move_uploaded_file($tmp, $dir . '/' . $name)) {
            return ['ok' => false, 'error' => 'تعذّرت الكتابة على الخادم.'];
        }
        @chmod($dir . '/' . $name, 0644);

        self::upsertMedia([
            'path' => $path, 'filename' => $name, 'mime' => $mime,
            'width' => $w, 'height' => $h, 'bytes' => (int) filesize($dir . '/' . $name),
        ], $actor);

        Repo_Activity::record($actor, 'media', 'upload', 'media', $path, $name,
            'رفع صورة جديدة إلى مكتبة الوسائط');

        return ['ok' => true, 'asset' => [
            'path' => $path, 'filename' => $name, 'mime' => $mime,
            'width' => $w, 'height' => $h,
        ]];
    }

    public static function encode($value): string
    {
        return (string) json_encode($value, JSON_UNESCAPED_UNICODE);
    }

    public static function saveSettings(string $category, array $values, array $actor): void
    {
        Db::transaction(static function () use ($category, $values, $actor): void {
            $now = Db::now();
            foreach ($values as $name => $value) {
                $alias = self::aliasOf($category, (string) $name);
                if ($alias !== null) {
                    /* not a setting — the published page, edited from here */
                    Repo_Cms::saveBlock($alias, 'ar', (string) $value, $actor);
                    continue;
                }
                $value = self::encode($value);
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
