<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * المحتوى — the content records (RECOVERY 02).
 *
 * Two shapes, because the site's editable content has exactly two: a heading
 * or a paragraph that appears once and is addressed by key, and a record that
 * is one of many and needs an order and a published flag.
 *
 * Every write is record-level (§20). Saving the About lead issues one UPDATE
 * against one primary key; there is no path here that writes a whole section,
 * a whole language, or a whole collection at once, so editing Arabic cannot
 * touch English and editing one FAQ cannot touch another.
 */
final class Repo_Cms
{
    public const COLLECTIONS = ['features', 'services', 'faq', 'testimonials'];

    /* =================================================================== */
    /* singleton text blocks                                               */
    /* =================================================================== */

    /** Keyed by block_key, for the language asked for and no other. */
    public static function blocks(string $lang, ?string $area = null): array
    {
        $sql = 'SELECT * FROM content_blocks WHERE lang = ?';
        $params = [$lang];
        if ($area !== null) { $sql .= ' AND block_key LIKE ?'; $params[] = $area . '.%'; }
        $out = [];
        foreach (Db::all($sql . ' ORDER BY block_key', $params) as $r) {
            $out[(string) $r['block_key']] = $r;
        }
        return $out;
    }

    public static function block(string $key, string $lang): ?array
    {
        return Db::one('SELECT * FROM content_blocks WHERE block_key = ? AND lang = ?', [$key, $lang]);
    }

    /**
     * One key, one language, one row. The composite primary key is what makes
     * §11 structural rather than a convention: there is no expression here
     * that can reach the other language's row.
     */
    public static function saveBlock(string $key, string $lang, string $value, ?array $actor): void
    {
        $now = Db::now();
        $by  = $actor === null ? null : (int) $actor['id'];
        $exists = Db::value('SELECT 1 FROM content_blocks WHERE block_key = ? AND lang = ?', [$key, $lang]);
        if ($exists) {
            Db::run('UPDATE content_blocks SET value = ?, updated_at = ?, updated_by = ?
                      WHERE block_key = ? AND lang = ?', [$value, $now, $by, $key, $lang]);
        } else {
            Db::run('INSERT INTO content_blocks (block_key, lang, value, updated_at, updated_by)
                     VALUES (?,?,?,?,?)', [$key, $lang, $value, $now, $by]);
        }
    }

    /* =================================================================== */
    /* repeatable items                                                    */
    /* =================================================================== */

    public static function items(string $collection, string $lang, bool $publishedOnly = false): array
    {
        $sql = 'SELECT * FROM content_items WHERE collection = ? AND lang = ?';
        if ($publishedOnly) $sql .= ' AND is_published = 1';
        return Db::all($sql . ' ORDER BY sort_order ASC, id ASC', [$collection, $lang]);
    }

    public static function item(int $id): ?array
    {
        return Db::one('SELECT * FROM content_items WHERE id = ?', [$id]);
    }

    public static function createItem(string $collection, string $lang, array $f, ?array $actor): int
    {
        $now = Db::now();
        $next = (int) Db::value(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM content_items WHERE collection = ? AND lang = ?',
            [$collection, $lang]
        );
        Db::run(
            'INSERT INTO content_items
               (collection, item_key, lang, sort_order, is_published, title, body, attribution,
                image_path, markup, created_at, updated_at, updated_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $collection, $f['item_key'] ?? null, $lang, $next,
                isset($f['is_published']) ? (int) $f['is_published'] : 1,
                $f['title'] ?? null, $f['body'] ?? null, $f['attribution'] ?? null,
                $f['image_path'] ?? null, $f['markup'] ?? null,
                $now, $now, $actor === null ? null : (int) $actor['id'],
            ]
        );
        return (int) Db::lastId();
    }

    /**
     * §20 in one method: only the columns named are written, only for the row
     * named, and `markup`, `collection` and `lang` are not among them — the
     * publishing template and the record's identity are not editable content.
     */
    public static function updateItem(int $id, array $f, ?array $actor): void
    {
        $allowed = ['title', 'body', 'attribution', 'image_path', 'is_published', 'sort_order'];
        $set = [];
        $params = [];
        foreach ($f as $k => $v) {
            if (!in_array($k, $allowed, true)) continue;
            $set[] = "{$k} = ?";
            $params[] = $v;
        }
        if ($set === []) return;
        $set[] = 'updated_at = ?';  $params[] = Db::now();
        $set[] = 'updated_by = ?';  $params[] = $actor === null ? null : (int) $actor['id'];
        $params[] = $id;
        Db::run('UPDATE content_items SET ' . implode(', ', $set) . ' WHERE id = ?', $params);
    }

    public static function deleteItem(int $id): void
    {
        Db::run('DELETE FROM content_items WHERE id = ?', [$id]);
    }

    /**
     * Reorder by handing back the ids in their new order. Done in one
     * transaction so a half-applied order cannot survive a failure, and
     * restricted to ids that actually belong to the collection so a crafted
     * payload cannot pull a row out of another one.
     */
    public static function reorder(string $collection, string $lang, array $ids, ?array $actor): int
    {
        return Db::transaction(static function () use ($collection, $lang, $ids, $actor): int {
            $own = [];
            foreach (self::items($collection, $lang) as $r) $own[(int) $r['id']] = true;
            $n = 0;
            foreach (array_values($ids) as $i => $id) {
                $id = (int) $id;
                if (!isset($own[$id])) continue;
                Db::run('UPDATE content_items SET sort_order = ?, updated_at = ?, updated_by = ? WHERE id = ?',
                    [$i + 1, Db::now(), $actor === null ? null : (int) $actor['id'], $id]);
                $n++;
            }
            return $n;
        });
    }

    /* =================================================================== */
    /* the overview                                                        */
    /* =================================================================== */

    /**
     * What the content page lists. `records` is what exists, `publishable`
     * says whether the public page has anywhere to put it — the FAQ and the
     * testimonials have no section on the site, and the overview says so
     * rather than implying a publish that cannot happen.
     */
    public static function overview(string $lang): array
    {
        $out = [];
        foreach (Schema::CONTENT_AREAS as $key => $label) {
            $row = ['key' => $key, 'label' => $label, 'lang' => $lang];

            if ($key === 'services') {
                $row['records']  = (int) Db::value('SELECT COUNT(*) FROM services');
                $row['active']   = (int) Db::value('SELECT COUNT(*) FROM services WHERE is_published = 1');
                $row['updated']  = Db::value('SELECT MAX(updated_at) FROM services');
                $row['kind']     = 'list';
                $row['publishable'] = true;
            } elseif (in_array($key, ['features', 'faq', 'testimonials'], true)) {
                $row['records'] = (int) Db::value(
                    'SELECT COUNT(*) FROM content_items WHERE collection = ? AND lang = ?', [$key, $lang]);
                $row['active'] = (int) Db::value(
                    'SELECT COUNT(*) FROM content_items WHERE collection = ? AND lang = ? AND is_published = 1',
                    [$key, $lang]);
                $row['updated'] = Db::value(
                    'SELECT MAX(updated_at) FROM content_items WHERE collection = ? AND lang = ?', [$key, $lang]);
                $row['kind'] = 'list';
                /* Asked of the page, not asserted here. features has a region
                   today and faq/testimonials do not, but that is a fact about
                   index.html rather than about this code, and it is read from
                   index.html so it stays true without being maintained. */
                $row['publishable'] = Publisher::hasRegionFor($key) ?? ($key === 'features');
            } else {
                $row['records'] = (int) Db::value(
                    'SELECT COUNT(*) FROM content_blocks WHERE lang = ? AND block_key LIKE ?',
                    [$lang, $key . '.%']);
                $row['active']  = $row['records'];
                $row['updated'] = Db::value(
                    'SELECT MAX(updated_at) FROM content_blocks WHERE lang = ? AND block_key LIKE ?',
                    [$lang, $key . '.%']);
                $row['kind'] = 'fields';
                $row['publishable'] = true;
            }

            /* a text block also exists for the list areas (their headings) */
            if ($row['kind'] === 'list') {
                $row['fields'] = (int) Db::value(
                    'SELECT COUNT(*) FROM content_blocks WHERE lang = ? AND block_key LIKE ?',
                    [$lang, $key . '.%']);
            }
            $out[] = $row;
        }
        return $out;
    }

    /** Field labels, so the editor never shows a raw key to an administrator. */
    public const FIELD_LABELS = [
        'about.label'           => 'التسمية العلوية',
        'about.title'           => 'عنوان القسم',
        'about.lead'            => 'الفقرة الافتتاحية',
        'about.p1'              => 'الفقرة الأولى',
        'about.p2'              => 'الفقرة الثانية',
        'about.p3'              => 'الفقرة الثالثة',
        'features.label'        => 'التسمية العلوية',
        'features.title'        => 'عنوان القسم',
        'features.tagline'      => 'الشعار',
        'features.note'         => 'الفقرة التعريفية',
        'services.label'        => 'التسمية العلوية',
        'services.lead'         => 'الفقرة التعريفية',
        'contact.label'         => 'التسمية العلوية',
        'contact.tagline'       => 'الشعار',
        'contact.title'         => 'عنوان الدعوة',
        'contact.invite'        => 'نص الدعوة',
        'contact.lead'          => 'الفقرة التعريفية',
        'contact.phone_label'   => 'تسمية وسيلة التواصل',
        'contact.phone_display' => 'رقم الهاتف',
        'contact.website'       => 'الموقع الإلكتروني',
        'contact.address'       => 'العنوان',
        'contact.hours'         => 'ساعات خدمة العملاء',
        'contact.closing'       => 'الجملة الختامية',
    ];

    /**
     * Regions whose approved content is not plain text.
     *
     * Three of the twenty-three carry inline markup that is part of the
     * approved page: a non-breaking-space run in the phone number, a line
     * break in the address, and a styled span in the closing sentence.
     * Escaping them would rewrite approved content, which §33 forbids, so
     * they are written through a narrow allow-list instead of htmlspecialchars.
     * Everything else is plain text and is escaped.
     */
    public const FIELD_HTML = [
        /* contact.phone_display used to be here. It no longer is: the number
           is stored as a person writes it, and Publisher::renderBlock() adds
           the left-to-right mark and the non-breaking spaces the page needs. */
        'contact.closing' => true,
    ];

    /** Regions edited as multi-line text whose line breaks become <br>. */
    public const FIELD_MULTILINE = [
        'contact.address' => true,
        'about.lead' => true, 'about.p1' => true, 'about.p2' => true, 'about.p3' => true,
        'features.note' => true, 'services.lead' => true,
        'contact.invite' => true, 'contact.lead' => true,
    ];

    /** Fields with a stricter rule than "some text". */
    public const FIELD_MAX = [
        'about.label' => 60, 'about.title' => 80, 'about.lead' => 500,
        'about.p1' => 800, 'about.p2' => 800, 'about.p3' => 800,
        'features.label' => 60, 'features.title' => 80, 'features.tagline' => 60, 'features.note' => 400,
        'services.label' => 60, 'services.lead' => 500,
        'contact.label' => 60, 'contact.tagline' => 60, 'contact.title' => 120,
        'contact.invite' => 400, 'contact.lead' => 400, 'contact.phone_label' => 60,
        'contact.phone_display' => 40, 'contact.website' => 120, 'contact.address' => 200,
        'contact.hours' => 160, 'contact.closing' => 300,
    ];
}
