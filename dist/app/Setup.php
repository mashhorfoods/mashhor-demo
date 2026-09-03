<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * The installation steps, in one place.
 *
 * bin/migrate.php, bin/seed.php, bin/seed-content.php and install.php all call
 * these methods rather than each carrying its own copy of the work. That is the
 * point: a browser-run install and a terminal-run install must produce the same
 * database, and the only way to guarantee that is for them to run the same code
 * (§38 — reuse what exists, do not reimplement it).
 *
 * Every method is safe to run twice. Nothing here deletes, overwrites an
 * administrator's edit, or invents content: the services, the asset index and
 * the settings are transcriptions of what the public site already says.
 */
final class Setup
{
    /** The seven approved services, exactly as index.html states them. */
    public const SERVICES = [
        ['wheelchair-transport', 'النقل بواسطة الكرسي المتحرك',
         'خدمة نقل آمنة ومريحة لمستخدمي الكراسي المتحركة، مع تجهيز المركبة بما يسهّل عملية الصعود والنزول.'],
        ['power-wheelchair-transport', 'النقل بواسطة الكرسي الكهربائي',
         'مركبات مجهزة لاستيعاب الكراسي الكهربائية، مع مراعاة الأمان والثبات أثناء التنقل.'],
        ['medical-bed-transport', 'النقل بواسطة السرير الطبي',
         'خدمة مخصصة للحالات التي تتطلب بقاء المستفيد على السرير طوال الرحلة، باستخدام وسائل نقل مناسبة.'],
        ['driver-assistant-escort', 'خدمة مساعد السائق',
         'إمكانية توفير مساعد أو أكثر لمرافقة المستفيد ومساعدته أثناء النقل، وفقًا لحالته واحتياجاته الخاصة.'],
        ['daily-transport-elderly', 'النقل اليومي',
         'خدمات نقل يومية لكبار السن وذوي الاحتياجات الخاصة، بما يوفر لهم تنقلًا آمنًا ومريحًا.'],
        ['hospital-medical-centre', 'النقل إلى المستشفيات والمراكز الطبية',
         'التوصيل إلى المستشفيات والمراكز الطبية، مع تقديم المساعدة وفقًا لاحتياجات المستفيد.'],
        ['riyadh-social-mobility', 'التنقل للمناسبات الاجتماعية',
         'توفير وسائل نقل مناسبة ومريحة للتنقل إلى المناسبات والزيارات الاجتماعية.'],
    ];
    /** The assets index.html actually references. Nothing beyond them. */
    public const ASSETS = [
        'img/daily-transport-elderly.webp', 'img/driver-assistant-escort.webp',
        'img/equipped-vehicle-fleet.webp', 'img/hospital-medical-centre.webp',
        'img/medical-bed-transport.webp', 'img/power-wheelchair-transport.webp',
        'img/riyadh-social-mobility.webp', 'img/wheelchair-passenger-vehicle.webp',
        'img/wheelchair-ramp-boarding.webp', 'img/wheelchair-transport.webp',
        'brand/apple-touch-icon.png', 'brand/aun-aldrb-logo-white.png',
        'brand/aun-aldrb-logo-white.svg', 'brand/aun-aldrb-logo.png',
        'brand/aun-aldrb-logo.svg', 'brand/favicon-32.png',
        'brand/logo.png', 'brand/og-image.png',
    ];
    /**
     * The company details the settings module has always shown.
     *
     * Four fields that used to live here — the address, the tagline, the phone
     * number and the website — are not settings: they are the published page,
     * and they are stored once as content blocks. Repo_Content::SETTINGS_ALIAS
     * is what makes الإعدادات show and edit them.
     */
    public const SETTINGS = [
        'company' => [
            'cName' => 'شركة عون الدرب للنقل المتخصص',
            'cDesc' => 'نقل متخصص في الرياض لكبار السن وذوي الاحتياجات الخاصة والمرضى، بمركبات مجهزة وطاقم مدرب، في بيئة تحترم الإنسانية.',
        ],
        'contact' => [
            'cWa'    => '+966 53 554 4352',
            'cEmail' => '',
            'sTw'    => '',
            'sIg'    => '',
        ],
        'site' => [
            'siteLive' => true,
            'sUrl'     => 'https://aunaldrb.com/',
        ],
        'notif'  => ['nNew' => true, 'nStale' => true, 'nStatus' => false, 'nContent' => true],
        'system' => ['tz' => 0, 'sess' => '60', 'digits' => 0],
    ];
    /* ================================================================== */
    /*  state                                                             */
    /* ================================================================== */

    /** Every table present AND at least one Super Admin — the install is done. */
    public static function isInstalled(): bool
    {
        try {
            if (!Db::ping()) return false;
            if (Schema::missingTables() !== []) return false;
            return (int) Db::value("SELECT COUNT(*) FROM users WHERE role = 'super'") > 0;
        } catch (Throwable $e) {
            return false;
        }
    }

    /* ================================================================== */
    /*  steps — each returns human-readable report lines                  */
    /* ================================================================== */

    /** @return string[] */
    public static function migrate(): array
    {
        $applied = Schema::migrate(PHP_SAPI === 'cli');
        $missing = Schema::missingTables();
        $lines = [
            'driver: ' . Db::driver(),
            $applied === []
                ? 'schema already current — nothing to apply'
                : 'applied ' . count($applied) . ' migration(s)',
            $missing === []
                ? 'schema complete: ' . count(Schema::tables()) . ' tables'
                : 'STILL MISSING: ' . implode(', ', $missing),
        ];
        return $lines;
    }

    /**
     * The icon and the picture a service is drawn with.
     *
     * Both are produced by the build's image pipeline rather than typed by
     * anyone, and both live in app/storage/cms-seed.json, which is already a
     * transcription of the published page. Reading them from there means a
     * fresh install and a migrated one end in the same place, and neither has
     * a second copy of this markup to keep in step.
     *
     * @return array{0: ?string, 1: ?string}  [icon svg, img tag]
     */
    public static function serviceArt(string $slug): array
    {
        static $cache = null;
        if ($cache === null) {
            $cache = [];
            $file = AUN_ROOT . '/app/storage/cms-seed.json';
            $seed = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
            foreach (($seed['items']['services'] ?? []) as $svc) {
                $markup = (string) ($svc['markup'] ?? '');
                $icon = preg_match('~<svg class="ico"[^>]*>.*?</svg>~s', $markup, $m) ? $m[0] : null;
                $img  = preg_match('~<img\b[^>]*>~s', $markup, $m) ? $m[0] : null;
                /* the seed keys services by title; the slug is what we hold */
                $cache[(string) ($svc['title'] ?? '')] = [$icon, $img];
            }
        }
        foreach (self::SERVICES as [$s, $title, $_d]) {
            if ($s === $slug) return $cache[$title] ?? [null, null];
        }
        return [null, null];
    }

    /** @return string[] */
    public static function services(): array
    {
        $added = 0; $art = 0;
        foreach (self::SERVICES as $i => [$slug, $title, $desc]) {
            [$icon, $img] = self::serviceArt($slug);
            $existing = Repo_Content::findServiceBySlug($slug);
            if ($existing !== null) {
                /* an install that predates the icon and picture columns gets
                   them filled without touching anything an editor may have
                   changed since */
                if (($existing['icon_svg'] ?? null) === null && $icon !== null) {
                    Db::run('UPDATE services SET icon_svg = ?, image_html = ? WHERE id = ?',
                        [$icon, $img, (int) $existing['id']]);
                    $art++;
                }
                continue;
            }
            $now = Db::now();
            Db::run(
                'INSERT INTO services (slug, title, description, sort_order, is_published, image_path,
                                       icon_svg, image_html, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$slug, $title, $desc, $i + 1, 1, 'img/' . $slug . '.webp', $icon, $img, $now, $now]
            );
            $added++;
        }
        $out = ["services: {$added} added, " . count(Repo_Content::services()) . ' total'];
        if ($art) $out[] = "services: icon and picture filled in for {$art} existing record(s)";
        return $out;
    }

    /** @return string[] */
    public static function media(): array
    {
        foreach (self::ASSETS as $p) {
            $abs  = AUN_ROOT . '/' . $p;
            $size = is_file($abs) ? (int) filesize($abs) : null;
            $dim  = is_file($abs) && function_exists('getimagesize') ? @getimagesize($abs) : false;
            Repo_Content::upsertMedia([
                'path'     => $p,
                'filename' => basename($p),
                'mime'     => $dim ? ($dim['mime'] ?? null) : null,
                'width'    => $dim ? (int) $dim[0] : null,
                'height'   => $dim ? (int) $dim[1] : null,
                'bytes'    => $size,
            ]);
        }
        return ['media: ' . count(Repo_Content::media()) . ' assets indexed'];
    }

    /**
     * Text blocks, features and the per-service publishing templates, read from
     * app/storage/cms-seed.json — a transcription of index.html, not new copy.
     *
     * @return string[]
     */
    public static function content(bool $force = false): array
    {
        $file = AUN_ROOT . '/app/storage/cms-seed.json';
        if (!is_file($file)) return ['content: SKIPPED — app/storage/cms-seed.json not found'];
        $seed = json_decode((string) file_get_contents($file), true);
        if (!is_array($seed)) return ['content: SKIPPED — cms-seed.json is not valid JSON'];

        $lines = [];

        $added = 0; $kept = 0;
        foreach (($seed['blocks'] ?? []) as $key => $value) {
            $existing = Repo_Cms::block((string) $key, 'ar');
            if ($existing !== null && !$force) { $kept++; continue; }
            Repo_Cms::saveBlock((string) $key, 'ar', (string) $value, null);
            $added++;
        }
        $lines[] = "content blocks: {$added} written, {$kept} left as they were";

        $n = 0;
        foreach (($seed['items']['features'] ?? []) as $f) {
            $key = 'feature-' . $f['order'];
            $exists = Db::one('SELECT id FROM content_items WHERE collection = ? AND lang = ? AND item_key = ?',
                ['features', 'ar', $key]);
            if ($exists !== null && !$force) continue;
            if ($exists !== null) {
                Db::run('UPDATE content_items SET markup = ?, updated_at = ? WHERE id = ?',
                    [$f['markup'], Db::now(), $exists['id']]);
                continue;
            }
            Repo_Cms::createItem('features', 'ar', [
                'item_key' => $key, 'title' => $f['title'], 'body' => $f['body'],
                'markup' => $f['markup'], 'is_published' => 1,
            ], null);
            $n++;
        }
        $lines[] = "features: {$n} added, " . count(Repo_Cms::items('features', 'ar')) . ' total';

        /* The service records already exist; what is stored here is each one's
           publishing template, keyed by the slug both tables share. */
        $n = 0;
        foreach (($seed['items']['services'] ?? []) as $s) {
            $svc = Repo_Content::findServiceByTitle($s['title']);
            $key = $svc === null ? ('service-' . $s['order']) : (string) $svc['slug'];
            $exists = Db::one('SELECT id FROM content_items WHERE collection = ? AND lang = ? AND item_key = ?',
                ['services', 'ar', $key]);
            if ($exists !== null && !$force) continue;
            if ($exists !== null) {
                Db::run('UPDATE content_items SET markup = ?, updated_at = ? WHERE id = ?',
                    [$s['markup'], Db::now(), $exists['id']]);
                continue;
            }
            Repo_Cms::createItem('services', 'ar', [
                'item_key' => $key, 'title' => $s['title'], 'body' => $s['body'],
                'image_path' => $s['image'], 'markup' => $s['markup'],
                'is_published' => $svc === null ? 1 : (int) $svc['is_published'],
            ], null);
            $n++;
        }
        $lines[] = "services: {$n} publishing templates added, "
            . count(Repo_Cms::items('services', 'ar')) . ' total';

        /* the four lists stage 3 brought under management, each item with the
           illustration it is drawn with — transcribed from the page, like
           everything else here */
        foreach (($seed['shaped'] ?? []) as $collection => $rows) {
            $have = count(Repo_Cms::items((string) $collection, 'ar'));
            if ($have > 0 && !$force) { $lines[] = "{$collection}: {$have} already there"; continue; }
            $n = 0;
            foreach ($rows as $r) {
                $exists = Db::one(
                    'SELECT id FROM content_items WHERE collection = ? AND lang = ? AND item_key = ?',
                    [$collection, 'ar', (string) $r['key']]);
                if ($exists !== null) continue;
                $id = Repo_Cms::createItem((string) $collection, 'ar', [
                    'item_key'     => (string) $r['key'],
                    'title'        => (string) $r['title'],
                    'body'         => (string) $r['body'],
                    'is_published' => 1,
                ], null);
                if (($r['icon'] ?? null) !== null) {
                    Db::run('UPDATE content_items SET icon_svg = ? WHERE id = ?', [$r['icon'], (int) $id]);
                }
                $n++;
            }
            $lines[] = "{$collection}: {$n} added";
        }

        /* الأسئلة الشائعة and آراء العملاء stay empty on purpose: index.html has
           no such section, and inventing entries to fill an editor is forbidden. */
        $lines[] = 'faq: ' . count(Repo_Cms::items('faq', 'ar'))
            . ' (no FAQ section exists on the public site — nothing seeded)';
        $lines[] = 'testimonials: ' . count(Repo_Cms::items('testimonials', 'ar'))
            . ' (no testimonials section exists on the public site — nothing seeded)';

        return $lines;
    }

    /** @return string[] */
    public static function settings(bool $force = false): array
    {
        $wrote = 0; $left = 0;
        foreach (self::SETTINGS as $cat => $fields) {
            foreach ($fields as $name => $value) {
                $exists = Db::value('SELECT 1 FROM settings WHERE category = ? AND name = ?', [$cat, $name]);
                if ($exists && !$force) { $left++; continue; }
                $now = Db::now();
                if ($exists) {
                    Db::run('UPDATE settings SET value = ?, updated_at = ? WHERE category = ? AND name = ?',
                        [Repo_Content::encode($value), $now, $cat, $name]);
                } else {
                    Db::run('INSERT INTO settings (category, name, value, updated_at) VALUES (?,?,?,?)',
                        [$cat, $name, Repo_Content::encode($value), $now]);
                }
                $wrote++;
            }
        }
        return ["settings: {$wrote} written, {$left} left as they were"];
    }

    /**
     * Create the first Super Admin. Never creates a second one, and never
     * touches an account that already exists.
     *
     * @return array{lines: string[], password: ?string, created: bool}
     */
    public static function admin(string $email, string $name, ?string $password = null): array
    {
        if (Repo_Users::findByEmail($email) !== null) {
            return ['lines' => ["administrator {$email} already exists; leaving it alone"],
                    'password' => null, 'created' => false];
        }
        $generated = false;
        if ($password === null || strlen($password) < 12) {
            $password  = rtrim(strtr(base64_encode(random_bytes(18)), '+/', 'Aa'), '=');
            $generated = true;
        }
        $id = Repo_Users::create($name, $email, $password, 'super', true, null);
        return [
            'lines'    => ["administrator created: {$email} (Super Admin, id {$id})"],
            'password' => $generated ? $password : null,
            'created'  => true,
        ];
    }

    /** Where the publisher will write, and whether it can. @return string[] */
    public static function publishTarget(): array
    {
        $t = Publisher::target();
        return ['publish target: ' . ($t === null ? 'NOT FOUND' : $t)
            . ($t !== null && is_writable($t) ? ' (writable)' : ' (NOT writable)')];
    }
}
