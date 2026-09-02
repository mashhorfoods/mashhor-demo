<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Schema and migrations (§05).
 *
 * Migrations are numbered, recorded in `migrations`, and applied in order.
 * Running them twice is a no-op; running them against a populated database
 * adds only what is missing. Nothing here drops or rewrites a table that holds
 * data — §05 forbids destructive change without necessity, and there has been
 * none.
 *
 * The data model follows the modules the earlier stages built, not a new one:
 * the five approved statuses, the three approved roles, request ids shaped
 * REQ-YYYY-NNNN, customers keyed by phone. That is why there is no `status`
 * lookup table and no role table — those sets are fixed by the approved
 * design, and a table would invite adding a sixth status (§35 forbids it).
 */
final class Schema
{
    public const STATUSES = ['new', 'review', 'confirmed', 'done', 'cancel'];
    public const ROLES    = ['super', 'admin', 'content'];
    public const SOURCES  = ['website', 'whatsapp', 'phone'];

    /** Arabic labels, so one place owns the mapping the whole system shows. */
    public const STATUS_LABEL = [
        'new'       => 'جديد',
        'review'    => 'قيد المراجعة',
        'confirmed' => 'مؤكد',
        'done'      => 'مكتمل',
        'cancel'    => 'ملغي',
    ];
    public const SOURCE_LABEL = [
        'website'  => 'الموقع',
        'whatsapp' => 'واتساب',
        'phone'    => 'هاتف',
    ];
    public const ROLE_LABEL = [
        'super'   => 'مدير النظام',
        'admin'   => 'مدير',
        'content' => 'مدير المحتوى',
    ];

    public static function migrations(): array
    {
        return [
            '0001_core'    => [self::class, 'm0001'],
            '0002_content' => [self::class, 'm0002'],
        ];
    }

    public static function migrate(bool $verbose = false): array
    {
        $applied = [];
        self::ensureMigrationsTable();
        $done = [];
        foreach (Db::all('SELECT name FROM migrations') as $r) $done[$r['name']] = true;

        foreach (self::migrations() as $name => $fn) {
            if (isset($done[$name])) continue;
            /* DDL is not transactional on MySQL, so each migration is written
               to be safe to re-run: every statement is CREATE ... IF NOT EXISTS */
            $fn();
            Db::run('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [$name, Db::now()]);
            $applied[] = $name;
            /* STDOUT exists only under the CLI SAPI; install.php runs the
               same migration from a web request (§—). */
            if ($verbose && defined('STDOUT')) fwrite(STDOUT, "  applied {$name}\n");
        }
        return $applied;
    }

    private static function ensureMigrationsTable(): void
    {
        $sql = Db::isMysql()
            ? "CREATE TABLE IF NOT EXISTS migrations (
                 name VARCHAR(120) NOT NULL PRIMARY KEY,
                 applied_at DATETIME NOT NULL
               ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            : "CREATE TABLE IF NOT EXISTS migrations (
                 name TEXT NOT NULL PRIMARY KEY,
                 applied_at TEXT NOT NULL
               )";
        Db::pdo()->exec($sql);
    }

    /** MySQL and SQLite differ in three ways only; this hides all of them. */
    private static function t(string $mysql, string $sqlite): string
    {
        return Db::isMysql() ? $mysql : $sqlite;
    }
    private static function suffix(): string
    {
        return Db::isMysql() ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    }
    private static function pk(): string
    {
        return self::t('BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT');
    }
    private static function fk(): string
    {
        return self::t('BIGINT UNSIGNED', 'INTEGER');
    }
    private static function dt(): string   { return self::t('DATETIME', 'TEXT'); }
    private static function str(int $n): string { return self::t("VARCHAR({$n})", 'TEXT'); }
    private static function txt(): string  { return self::t('TEXT', 'TEXT'); }
    private static function bool_(): string{ return self::t('TINYINT(1)', 'INTEGER'); }
    private static function enum(array $vals): string
    {
        if (Db::isMysql()) {
            return "ENUM('" . implode("','", $vals) . "')";
        }
        /* SQLite has no ENUM; the CHECK constraint is added inline by callers */
        return 'TEXT';
    }
    private static function check(string $col, array $vals): string
    {
        $list = "'" . implode("','", $vals) . "'";
        return Db::isMysql() ? '' : ", CHECK ({$col} IN ({$list}))";
    }

    /** Indexes are created separately so both drivers accept the same call. */
    private static function index(string $table, string $name, string $cols, bool $unique = false): void
    {
        $u = $unique ? 'UNIQUE ' : '';
        if (Db::isMysql()) {
            /* MySQL before 8.0.29 has no CREATE INDEX IF NOT EXISTS; ask the
               catalogue instead of relying on the error */
            $exists = Db::value(
                'SELECT COUNT(*) FROM information_schema.statistics
                  WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
                [$table, $name]
            );
            if ((int) $exists > 0) return;
            Db::pdo()->exec("CREATE {$u}INDEX {$name} ON {$table} ({$cols})");
        } else {
            Db::pdo()->exec("CREATE {$u}INDEX IF NOT EXISTS {$name} ON {$table} ({$cols})");
        }
    }

    public static function m0001(): void
    {
        $pdo = Db::pdo();
        $S   = self::suffix();

        /* ---- administrators -------------------------------------------- */
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id " . self::pk() . ",
            name " . self::str(120) . " NOT NULL,
            email " . self::str(190) . " NOT NULL,
            password_hash " . self::str(255) . " NOT NULL,
            role " . self::enum(self::ROLES) . " NOT NULL,
            is_active " . self::bool_() . " NOT NULL DEFAULT 1,
            permissions " . self::txt() . " NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until " . self::dt() . " NULL,
            last_login_at " . self::dt() . " NULL,
            created_at " . self::dt() . " NOT NULL,
            updated_at " . self::dt() . " NOT NULL
            " . self::check('role', self::ROLES) . "
        ){$S}");
        self::index('users', 'ux_users_email', 'email', true);

        /* ---- sessions ---------------------------------------------------
           The token is stored hashed. A stolen database dump therefore cannot
           be replayed as a live session, and logout can invalidate server-side
           because the row is the session — not a signed cookie the server has
           no way to revoke (§07, §09). */
        $pdo->exec("CREATE TABLE IF NOT EXISTS sessions (
            id " . self::str(64) . " NOT NULL PRIMARY KEY,
            user_id " . self::fk() . " NOT NULL,
            csrf_hash " . self::str(64) . " NOT NULL,
            ip " . self::str(45) . " NULL,
            user_agent " . self::str(255) . " NULL,
            created_at " . self::dt() . " NOT NULL,
            last_seen_at " . self::dt() . " NOT NULL,
            expires_at " . self::dt() . " NOT NULL,
            revoked_at " . self::dt() . " NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ){$S}");
        self::index('sessions', 'ix_sessions_user', 'user_id');
        self::index('sessions', 'ix_sessions_expires', 'expires_at');

        /* ---- guest sessions ---------------------------------------------
           The public form needs a CSRF token but has no account. A guest
           session carries the token and nothing else — no identity, no
           privileges, and it can never be promoted by anything but login. */
        $pdo->exec("CREATE TABLE IF NOT EXISTS guest_sessions (
            id " . self::str(64) . " NOT NULL PRIMARY KEY,
            csrf_hash " . self::str(64) . " NOT NULL,
            ip " . self::str(45) . " NULL,
            created_at " . self::dt() . " NOT NULL,
            expires_at " . self::dt() . " NOT NULL
        ){$S}");
        self::index('guest_sessions', 'ix_guest_expires', 'expires_at');

        /* ---- customers ---------------------------------------------------
           Phone is the identity, exactly as the العملاء module already treats
           it: it derives a customer per distinct phone number. Storing it
           normalised is what makes that derivation a lookup instead of a
           guess (§17). */
        $pdo->exec("CREATE TABLE IF NOT EXISTS customers (
            id " . self::pk() . ",
            phone " . self::str(20) . " NOT NULL,
            name " . self::str(120) . " NOT NULL,
            notes " . self::txt() . " NULL,
            created_at " . self::dt() . " NOT NULL,
            updated_at " . self::dt() . " NOT NULL
        ){$S}");
        self::index('customers', 'ux_customers_phone', 'phone', true);

        /* ---- services ----------------------------------------------------
           The seven approved services. `slug` matches the image filenames the
           media library already uses, so the two modules join without a
           mapping table. */
        $pdo->exec("CREATE TABLE IF NOT EXISTS services (
            id " . self::pk() . ",
            slug " . self::str(80) . " NOT NULL,
            title " . self::str(160) . " NOT NULL,
            description " . self::txt() . " NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_published " . self::bool_() . " NOT NULL DEFAULT 1,
            image_path " . self::str(190) . " NULL,
            created_at " . self::dt() . " NOT NULL,
            updated_at " . self::dt() . " NOT NULL
        ){$S}");
        self::index('services', 'ux_services_slug', 'slug', true);

        /* ---- transportation requests ------------------------------------ */
        $pdo->exec("CREATE TABLE IF NOT EXISTS requests (
            id " . self::pk() . ",
            ref " . self::str(20) . " NOT NULL,
            customer_id " . self::fk() . " NOT NULL,
            service_id " . self::fk() . " NULL,
            service_title " . self::str(160) . " NOT NULL,
            origin " . self::str(200) . " NOT NULL,
            destination " . self::str(200) . " NOT NULL,
            trip_date " . self::str(10) . " NOT NULL,
            trip_time " . self::str(5) . " NULL,
            notes " . self::txt() . " NULL,
            status " . self::enum(self::STATUSES) . " NOT NULL DEFAULT 'new',
            source " . self::enum(self::SOURCES) . " NOT NULL DEFAULT 'website',
            created_at " . self::dt() . " NOT NULL,
            updated_at " . self::dt() . " NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
            FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
            " . self::check('status', self::STATUSES) . "
            " . self::check('source', self::SOURCES) . "
        ){$S}");
        self::index('requests', 'ux_requests_ref', 'ref', true);
        self::index('requests', 'ix_requests_status', 'status');
        self::index('requests', 'ix_requests_customer', 'customer_id');
        self::index('requests', 'ix_requests_created', 'created_at');
        self::index('requests', 'ix_requests_trip_date', 'trip_date');

        /* ---- status history ---------------------------------------------
           The طلبات النقل module already shows a per-request history, and
           Stage 14 derives the activity log from it. It is a table, not a
           derived view, because the server writing it is the whole point. */
        $pdo->exec("CREATE TABLE IF NOT EXISTS request_status_history (
            id " . self::pk() . ",
            request_id " . self::fk() . " NOT NULL,
            from_status " . self::str(12) . " NULL,
            to_status " . self::str(12) . " NOT NULL,
            actor_user_id " . self::fk() . " NULL,
            actor_label " . self::str(120) . " NOT NULL,
            created_at " . self::dt() . " NOT NULL,
            FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");
        self::index('request_status_history', 'ix_hist_request', 'request_id');

        /* ---- request notes ---------------------------------------------- */
        $pdo->exec("CREATE TABLE IF NOT EXISTS request_notes (
            id " . self::pk() . ",
            request_id " . self::fk() . " NOT NULL,
            body " . self::txt() . " NOT NULL,
            author_user_id " . self::fk() . " NULL,
            author_label " . self::str(120) . " NOT NULL,
            created_at " . self::dt() . " NOT NULL,
            FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
            FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");
        self::index('request_notes', 'ix_notes_request', 'request_id');

        /* ---- reference-number sequence ----------------------------------
           REQ-YYYY-NNNN is allocated from here under a row lock inside the
           creating transaction, so two simultaneous submissions cannot take
           the same number (§16). */
        $pdo->exec("CREATE TABLE IF NOT EXISTS id_sequences (
            scope " . self::str(40) . " NOT NULL PRIMARY KEY,
            next_value INTEGER NOT NULL,
            updated_at " . self::dt() . " NOT NULL
        ){$S}");

        /* ---- submission fingerprints (§19) ------------------------------- */
        $pdo->exec("CREATE TABLE IF NOT EXISTS request_submissions (
            fingerprint " . self::str(64) . " NOT NULL PRIMARY KEY,
            request_id " . self::fk() . " NOT NULL,
            created_at " . self::dt() . " NOT NULL,
            FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
        ){$S}");
        self::index('request_submissions', 'ix_subs_created', 'created_at');

        /* ---- rate limiting (§24) ---------------------------------------- */
        $pdo->exec("CREATE TABLE IF NOT EXISTS rate_hits (
            id " . self::pk() . ",
            bucket " . self::str(120) . " NOT NULL,
            created_at " . self::dt() . " NOT NULL
        ){$S}");
        self::index('rate_hits', 'ix_rate_bucket', 'bucket, created_at');

        /* ---- media references -------------------------------------------- */
        $pdo->exec("CREATE TABLE IF NOT EXISTS media_assets (
            id " . self::pk() . ",
            path " . self::str(190) . " NOT NULL,
            filename " . self::str(160) . " NOT NULL,
            mime " . self::str(60) . " NULL,
            width INTEGER NULL,
            height INTEGER NULL,
            bytes INTEGER NULL,
            uploaded_at " . self::dt() . " NOT NULL,
            uploaded_by " . self::fk() . " NULL,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");
        self::index('media_assets', 'ux_media_path', 'path', true);

        /* ---- activity log (Stage 14, now server-written) ------------------
           This is what Stage 14's report said the backend had to provide: an
           events table written on every mutation, so the actor is recorded
           rather than reconstructed. */
        $pdo->exec("CREATE TABLE IF NOT EXISTS activity_log (
            id " . self::pk() . ",
            actor_user_id " . self::fk() . " NULL,
            actor_label " . self::str(120) . " NOT NULL,
            module " . self::str(24) . " NOT NULL,
            action " . self::str(24) . " NOT NULL,
            target_type " . self::str(24) . " NULL,
            target_id " . self::str(40) . " NULL,
            target_label " . self::str(200) . " NULL,
            summary " . self::str(255) . " NOT NULL,
            created_at " . self::dt() . " NOT NULL,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");
        self::index('activity_log', 'ix_activity_created', 'created_at');
        self::index('activity_log', 'ix_activity_module', 'module');
        self::index('activity_log', 'ix_activity_actor', 'actor_user_id');

        /* ---- notifications ------------------------------------------------
           Read state is per account here, which is what Stage 14 could not do
           with localStorage. */
        $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
            id " . self::pk() . ",
            kind " . self::str(24) . " NOT NULL,
            dedupe_key " . self::str(120) . " NOT NULL,
            title " . self::str(255) . " NOT NULL,
            meta " . self::str(255) . " NULL,
            request_id " . self::fk() . " NULL,
            created_at " . self::dt() . " NOT NULL,
            FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
        ){$S}");
        self::index('notifications', 'ux_notif_key', 'dedupe_key', true);
        self::index('notifications', 'ix_notif_created', 'created_at');

        $pdo->exec("CREATE TABLE IF NOT EXISTS notification_reads (
            notification_id " . self::fk() . " NOT NULL,
            user_id " . self::fk() . " NOT NULL,
            read_at " . self::dt() . " NOT NULL,
            PRIMARY KEY (notification_id, user_id),
            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ){$S}");

        /* ---- settings ----------------------------------------------------- */
        $pdo->exec("CREATE TABLE IF NOT EXISTS settings (
            category " . self::str(40) . " NOT NULL,
            name " . self::str(60) . " NOT NULL,
            value " . self::txt() . " NULL,
            updated_at " . self::dt() . " NOT NULL,
            updated_by " . self::fk() . " NULL,
            PRIMARY KEY (category, name),
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");
    }

    /**
     * RECOVERY 02 — المحتوى.
     *
     * Two tables, because the site's editable content has exactly two shapes.
     * A heading or a paragraph appears once and is addressed by key, so it is
     * a row in `content_blocks`. A feature, a service, a question or a
     * testimonial is one of many and needs an order and a published flag, so
     * it is a row in `content_items`.
     *
     * `lang` is on both. The site is Arabic-only today — there is no English
     * copy anywhere in index.html, and §05 forbids inventing any — so every
     * seeded row is `ar`. The column exists so that adding English later is a
     * new row rather than a migration, and so §11's rule (editing one language
     * must never touch the other) is enforced by the primary key rather than
     * by remembering.
     *
     * Services already live in `services` from RECOVERY 01 and are NOT
     * duplicated here: §38 says reuse what exists. `content_items` carries the
     * publishing template for each service, keyed by slug.
     */
    public static function m0002(): void
    {
        $pdo = Db::pdo();
        $S   = self::suffix();

        /* one row per addressable text region on the public page */
        $pdo->exec("CREATE TABLE IF NOT EXISTS content_blocks (
            block_key " . self::str(80) . " NOT NULL,
            lang " . self::str(5) . " NOT NULL DEFAULT 'ar',
            value " . self::txt() . " NOT NULL,
            updated_at " . self::dt() . " NOT NULL,
            updated_by " . self::fk() . " NULL,
            PRIMARY KEY (block_key, lang),
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");

        /* one row per repeatable record: features, faq, testimonials, and the
           publishing template for each service */
        $pdo->exec("CREATE TABLE IF NOT EXISTS content_items (
            id " . self::pk() . ",
            collection " . self::str(24) . " NOT NULL,
            item_key " . self::str(80) . " NULL,
            lang " . self::str(5) . " NOT NULL DEFAULT 'ar',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_published " . self::bool_() . " NOT NULL DEFAULT 1,
            title " . self::str(200) . " NULL,
            body " . self::txt() . " NULL,
            attribution " . self::str(120) . " NULL,
            image_path " . self::str(190) . " NULL,
            markup " . self::txt() . " NULL,
            created_at " . self::dt() . " NOT NULL,
            updated_at " . self::dt() . " NOT NULL,
            updated_by " . self::fk() . " NULL,
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");
        self::index('content_items', 'ix_ci_collection', 'collection, lang, sort_order');
        self::index('content_items', 'ux_ci_key', 'collection, lang, item_key', true);

        /* what the publisher wrote, and whether it stuck */
        $pdo->exec("CREATE TABLE IF NOT EXISTS content_publishes (
            id " . self::pk() . ",
            actor_user_id " . self::fk() . " NULL,
            actor_label " . self::str(120) . " NOT NULL,
            regions INTEGER NOT NULL DEFAULT 0,
            target " . self::str(190) . " NOT NULL,
            ok " . self::bool_() . " NOT NULL DEFAULT 0,
            note " . self::str(255) . " NULL,
            created_at " . self::dt() . " NOT NULL,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        ){$S}");
        self::index('content_publishes', 'ix_cp_created', 'created_at');
    }

    /** The six approved content areas — no seventh, per §02. */
    public const CONTENT_AREAS = [
        'about'        => 'من نحن',
        'features'     => 'ما يميزنا',
        'services'     => 'الخدمات',
        'faq'          => 'الأسئلة الشائعة',
        'testimonials' => 'آراء العملاء',
        'contact'      => 'معلومات التواصل',
    ];

    /** Languages the content layer accepts. Arabic is the only one with copy. */
    public const LANGS = ['ar', 'en'];

    /** Which tables the health endpoint expects to find. */
    public static function tables(): array
    {
        return [
            'migrations', 'users', 'sessions', 'guest_sessions', 'customers', 'services',
            'requests', 'request_status_history', 'request_notes', 'id_sequences',
            'request_submissions', 'rate_hits', 'media_assets', 'activity_log',
            'notifications', 'notification_reads', 'settings',
            'content_blocks', 'content_items', 'content_publishes',
        ];
    }

    public static function missingTables(): array
    {
        $missing = [];
        foreach (self::tables() as $t) {
            try {
                Db::value("SELECT 1 FROM {$t} LIMIT 1");
            } catch (Throwable $e) {
                $missing[] = $t;
            }
        }
        return $missing;
    }
}
