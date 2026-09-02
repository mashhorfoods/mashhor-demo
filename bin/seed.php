<?php
/**
 * Seed the reference data the approved system already defines, and create the
 * first administrator.  Usage:
 *
 *   php bin/seed.php --admin-email=you@example.com --admin-name="اسمك" [--admin-password=…]
 *
 * The password is generated and printed once if you do not supply one. It is
 * printed to your terminal and nowhere else: not the log, not the database
 * (only its hash), not any response (§06).
 *
 * Services and media are lifted from the built site, never invented: the seven
 * approved services with their approved copy, and the assets index.html
 * actually references. §35 forbids anything beyond that.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

define('AUN_APP', true);
require_once dirname(__DIR__) . '/app/bootstrap.php';

function arg(string $name, ?string $default = null): ?string
{
    foreach ($GLOBALS['argv'] as $a) {
        if (str_starts_with($a, "--{$name}=")) return substr($a, strlen($name) + 3);
    }
    return $default;
}

$SERVICES = [
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

try {
    if (!Db::ping()) { fwrite(STDERR, "Cannot reach the database.\n"); exit(2); }
    Schema::migrate();

    /* --- services ---------------------------------------------------- */
    $added = 0;
    foreach ($SERVICES as $i => [$slug, $title, $desc]) {
        if (Repo_Content::findServiceBySlug($slug) !== null) continue;
        $now = Db::now();
        Db::run(
            'INSERT INTO services (slug, title, description, sort_order, is_published, image_path, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?)',
            [$slug, $title, $desc, $i + 1, 1, 'img/' . $slug . '.webp', $now, $now]
        );
        $added++;
    }
    fwrite(STDOUT, "services: {$added} added, " . count(Repo_Content::services()) . " total\n");

    /* --- media references -------------------------------------------- */
    $assets = [
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
    foreach ($assets as $p) {
        $abs = AUN_ROOT . '/' . $p;
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
    fwrite(STDOUT, "media: " . count(Repo_Content::media()) . " assets indexed\n");

    /* --- the first administrator -------------------------------------- */
    $email = arg('admin-email');
    if ($email === null) {
        fwrite(STDOUT, "no --admin-email given; skipping administrator creation\n");
        exit(0);
    }
    if (Repo_Users::findByEmail($email) !== null) {
        fwrite(STDOUT, "administrator {$email} already exists; leaving it alone\n");
        exit(0);
    }
    $name = arg('admin-name', 'مدير النظام');
    $pw   = arg('admin-password');
    $generated = false;
    if ($pw === null || strlen($pw) < 12) {
        $pw = rtrim(strtr(base64_encode(random_bytes(18)), '+/', 'Aa'), '=');
        $generated = true;
    }
    $id = Repo_Users::create((string) $name, $email, $pw, 'super', true, null);
    fwrite(STDOUT, "administrator created: {$email} (Super Admin, id {$id})\n");
    if ($generated) {
        fwrite(STDOUT, "\n  password: {$pw}\n\n"
            . "  Shown once. It is not written to the log or the database —\n"
            . "  only its hash is stored. Save it now, then change it.\n\n");
    }
} catch (DbUnavailable $e) {
    fwrite(STDERR, "Database unavailable.\n");
    exit(2);
}
