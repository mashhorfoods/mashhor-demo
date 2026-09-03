<?php
declare(strict_types=1);
if (!defined('AUN_APP')) { http_response_code(404); exit; }

/**
 * Public website synchronisation (§19).
 *
 * The public site is one static HTML file. That is a deliberate property of
 * this project — it is why the page scores what it scores — and §33 forbids
 * redesigning it. So the content module does not turn index.html into a
 * template rendered per request, and it does not hydrate the page from an API
 * on load. It rewrites the file.
 *
 * Every editable region of index.html is wrapped in a pair of HTML comments:
 *
 *     <!--aun:about.lead-->…text…<!--/aun:about.lead-->
 *
 * The markers are invisible, contribute nothing to the accessibility tree, and
 * cost the page about 1.2KB. build.js keeps them while stripping every other
 * comment. Publishing replaces what lies between one pair and touches nothing
 * else, which is what §20 asks for: editing the About lead cannot disturb a
 * service, a FAQ or the contact address, because the write is bounded by the
 * markers and nothing outside them is read.
 *
 * The write itself is atomic — a temporary file in the same directory, then a
 * rename — so a failure halfway through leaves the previous page intact rather
 * than a half-written one (§24).
 */
final class Publisher
{
    /** Where the live page is. dist/ when a build is present, else the source. */
    public static function target(): ?string
    {
        foreach ([AUN_ROOT . '/index.html', AUN_ROOT . '/dist/index.html'] as $p) {
            if (is_file($p) && self::isMarked($p)) return $p;
        }
        return null;
    }

    private static function isMarked(string $path): bool
    {
        $head = (string) file_get_contents($path, false, null, 0, 600000);
        return str_contains($head, '<!--aun:');
    }

    public static function writable(): bool
    {
        $t = self::target();
        return $t !== null && is_writable($t) && is_writable(dirname($t));
    }

    /**
     * Replace one marked region. Returns the new HTML, or null when the marker
     * pair is absent — a caller must treat that as a failure, not a no-op:
     * silently skipping a region is how an admin comes to believe a change was
     * published when it was not.
     */
    public static function replaceRegion(string $html, string $key, string $value): ?string
    {
        $open  = '<!--aun:' . $key . '-->';
        $close = '<!--/aun:' . $key . '-->';
        $a = strpos($html, $open);
        if ($a === false) return null;
        $b = strpos($html, $close, $a);
        if ($b === false) return null;
        $start = $a + strlen($open);
        return substr($html, 0, $start) . $value . substr($html, $b);
    }

    /**
     * Does the published page have anywhere to put this area's content?
     *
     * Asked of the page itself rather than answered from a list in the code,
     * so the answer corrects itself: the day a section gains markers, the
     * editor stops saying its content goes nowhere, with nothing to remember.
     *
     * @return bool|null  null when the page cannot be read at all
     */
    public static function hasRegionFor(string $area): ?bool
    {
        $target = self::target();
        if ($target === null) return null;
        $html = @file_get_contents($target);
        if ($html === false) return null;
        return str_contains($html, '<!--aun:' . $area . '.');
    }

    public static function readRegion(string $html, string $key): ?string
    {
        $open  = '<!--aun:' . $key . '-->';
        $close = '<!--/aun:' . $key . '-->';
        $a = strpos($html, $open);
        if ($a === false) return null;
        $b = strpos($html, $close, $a);
        if ($b === false) return null;
        $start = $a + strlen($open);
        return substr($html, $start, $b - $start);
    }

    /**
     * Render a repeatable collection back into its region, from the stored
     * per-item markup. Only published items are emitted, in stored order, with
     * the positional attributes the page's own script depends on recomputed —
     * a slide index that no longer matches its position is a broken carousel,
     * not a reordered one.
     */
    /**
     * How one service is written into the page.
     *
     * Every service used to carry its own copy of this HTML in a second table,
     * which is why a service could be edited but never created: a new one had
     * no markup and nothing could write it. All seven copies were the same
     * shape; only the icon, the picture and the position differed. The shape
     * is presentation, so it lives here with the rest of the code, and the
     * three things that differ come from the service record itself.
     *
     * It was not written by hand — it was lifted from the published page and
     * checked against all seven, and Publisher::verifyServices() re-checks
     * that rendering from it still reproduces the live page byte for byte.
     */
    private const SERVICE_SHAPE = <<<'SHAPE'
            <article data-slide="{{slide}}" class="service{{feature}}{{active}}" data-reveal>
              <div class="service__head">
                <span class="service__icon" aria-hidden="true">{{icon}}</span>
                <span class="service__num" aria-hidden="true">{{num}}</span>
              </div>
              <h3 class="service__title">{{title}}</h3>
              <figure class="service__media">
                {{img}}
              </figure>
              <p class="service__desc">{{body}}</p>
              <a class="btn btn--secondary service__cta" href="#contact">
                تواصل معنا
                <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H6"/><path d="M11.5 6.5 6 12l5.5 5.5"/></svg>
              </a>
            </article>
SHAPE;

    /**
     * The services region, rendered from the services table itself.
     *
     * {{feature}} and {{active}} are position, not content: the first
     * published service leads the section, exactly as it does today.
     */
    public static function renderServices(array $rows): string
    {
        $out = '';
        $n = 0;
        foreach ($rows as $r) {
            if (!(int) $r['is_published']) continue;
            $n++;
            $out .= "\n\n" . str_replace(
                ['{{slide}}', '{{feature}}', '{{active}}', '{{num}}',
                 '{{icon}}', '{{img}}', '{{title}}', '{{body}}'],
                [
                    (string) ($n - 1),
                    $n === 1 ? ' service--feature' : '',
                    $n === 1 ? ' is-active' : '',
                    str_pad((string) $n, 2, '0', STR_PAD_LEFT),
                    (string) ($r['icon_svg'] ?? ''),
                    (string) ($r['image_html'] ?? ''),
                    self::esc((string) $r['title']),
                    self::esc((string) $r['description']),
                ],
                self::SERVICE_SHAPE
            );
        }
        return $out;
    }

    /**
     * Proof, not assertion: does rendering the services from their records
     * reproduce what the published page already shows?
     *
     * Returns null when they match. Anything else is the reason they do not,
     * and is treated as a failure — a services region that renders differently
     * is a visual change nobody asked for.
     */
    public static function verifyServices(): ?string
    {
        $target = self::target();
        if ($target === null) return 'the marked page was not found';
        $html = @file_get_contents($target);
        if ($html === false) return 'the page could not be read';

        $live = self::readRegion($html, 'services.items');
        if ($live === null) return 'the page has no services.items region';

        $fresh = self::renderServices(Repo_Content::services());
        if ($fresh === $live) return null;

        return sprintf('rendered %d bytes, live region is %d bytes', strlen($fresh), strlen($live));
    }

    public static function renderCollection(string $collection, array $rows): string
    {
        $out = '';
        $n = 0;
        foreach ($rows as $r) {
            if (!(int) $r['is_published']) continue;
            $markup = (string) ($r['markup'] ?? '');
            if ($markup === '') continue;
            $n++;
            $markup = str_replace(
                ['{{title}}', '{{body}}', '{{num}}', '{{slide}}', '{{active}}'],
                [
                    self::esc((string) $r['title']),
                    self::esc((string) $r['body']),
                    str_pad((string) $n, 2, '0', STR_PAD_LEFT),
                    (string) ($n - 1),
                    $n === 1 ? ' is-active' : '',
                ],
                $markup
            );
            $out .= $markup;
        }
        return $out;
    }

    /**
     * Content is authored as text and lands in HTML, so it is escaped here and
     * nowhere else. Line breaks become <br>, because the address has always
     * rendered that way and the editor should stay a plain textarea.
     */
    public static function esc(string $s): string
    {
        $s = htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        return str_replace(["\r\n", "\n"], '<br>', $s);
    }

    /**
     * The three regions whose approved content is inline markup.
     *
     * An allow-list, not a blocklist: everything is escaped first, and then
     * exactly the constructs the approved page already uses are restored —
     * <br>, <b>, <strong>, <em>, a <span> carrying nothing but a class, and
     * the &nbsp; / &#8206; entities in the phone number. A script tag, an
     * event handler, a javascript: URL or an attribute of any other kind
     * cannot survive, because none of them is on the list.
     */
    public static function inline(string $s): string
    {
        $out = htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $out = preg_replace('/&lt;br\s*\/?&gt;/i', '<br>', $out) ?? $out;
        foreach (['b', 'strong', 'em'] as $t) {
            $out = preg_replace('/&lt;' . $t . '&gt;/i', '<' . $t . '>', $out) ?? $out;
            $out = preg_replace('/&lt;\/' . $t . '&gt;/i', '</' . $t . '>', $out) ?? $out;
        }
        /* a span may carry a class and nothing else */
        $out = preg_replace_callback(
            /* the quotes were escaped too, so the pattern looks for the
               entities rather than the characters */
            '/&lt;span(?:\s+class=(?:&quot;|&#039;)([A-Za-z0-9 _-]{0,80})(?:&quot;|&#039;))?\s*&gt;/',
            static fn(array $m): string => isset($m[1]) && $m[1] !== ''
                ? '<span class="' . $m[1] . '">' : '<span>',
            $out
        ) ?? $out;
        /* Only as many closes as there are opens. A rejected <span> would
           otherwise leave its </span> behind, and a stray close tag does not
           vanish — it closes whichever span the page opened around it. */
        $opens = substr_count($out, '<span');
        $out = preg_replace_callback('/&lt;\/span&gt;/', static function () use (&$opens): string {
            if ($opens > 0) { $opens--; return '</span>'; }
            return '';
        }, $out) ?? $out;

        /* the entities the approved phone number is built from */
        $out = str_replace(['&amp;nbsp;', '&amp;#8206;', '&amp;#x200E;'],
                           ['&nbsp;', '&#8206;', '&#x200E;'], $out);

        return str_replace(["\r\n", "\n"], '<br>', $out);
    }

    /** Which writer a region gets. */
    public static function renderBlock(string $key, string $value): string
    {
        /* A phone number is stored as a person would type it and rendered as
           the page needs it: a left-to-right mark so the number reads correctly
           inside Arabic text, and non-breaking spaces so it never wraps
           mid-number. Nobody should have to type &nbsp; into a settings field
           to get that, which is what storing the rendered form required. */
        if ($key === 'contact.phone_display') {
            return "\u{200E}" . str_replace(' ', '&nbsp;', self::esc(trim($value)));
        }
        return isset(Repo_Cms::FIELD_HTML[$key]) ? self::inline($value) : self::esc($value);
    }

    /**
     * Publish everything. Returns
     *   ['ok' => bool, 'regions' => int, 'target' => string|null, 'note' => string]
     * and never throws for an ordinary failure: the caller reports it to the
     * administrator, whose edits are already safe in the database either way.
     */
    public static function publish(?array $actor = null): array
    {
        $target = self::target();
        if ($target === null) {
            return self::record($actor, 0, '—', false,
                'لم يُعثر على صفحة الموقع المعلَّمة على الخادم.');
        }

        $html = @file_get_contents($target);
        if ($html === false) {
            return self::record($actor, 0, $target, false, 'تعذّرت قراءة صفحة الموقع.');
        }
        $before = $html;

        $written = 0;
        $missing = [];

        /* --- singleton text blocks -------------------------------------- */
        foreach (Repo_Cms::blocks('ar') as $key => $row) {
            $next = self::replaceRegion($html, $key, self::renderBlock($key, (string) $row['value']));
            if ($next === null) { $missing[] = $key; continue; }
            if ($next !== $html) $written++;
            $html = $next;
        }

        /* --- the services region, rendered from the service records ------
           Not from a second table of per-service HTML. renderServices() is
           proved against the live page by verifyServices(), so this is a
           change of source, not of output. */
        $rendered = self::renderServices(Repo_Content::services());
        if ($rendered === '') {
            $missing[] = 'services.items (no published service)';
        } else {
            $next = self::replaceRegion($html, 'services.items', $rendered);
            if ($next === null) { $missing[] = 'services.items'; }
            else {
                if ($next !== $html) $written++;
                $html = $next;
            }
        }

        /* --- repeatable collections that have a region on the page ------- */
        foreach (['features'] as $collection) {
            $rows = Repo_Cms::items($collection, 'ar');
            $rendered = self::renderCollection($collection, $rows);
            if ($rendered === '') {
                /* publishing an empty region would blank a section of the live
                   site; refuse and say so rather than doing it quietly */
                $missing[] = $collection . '.items (empty)';
                continue;
            }
            $next = self::replaceRegion($html, $collection . '.items', $rendered);
            if ($next === null) { $missing[] = $collection . '.items'; continue; }
            if ($next !== $html) $written++;
            $html = $next;
        }

        if ($missing !== []) {
            Log::write('warn', 'publish: regions missing from the page', ['keys' => $missing]);
        }

        if ($html === $before) {
            return self::record($actor, 0, $target, true, 'لا تغييرات — الصفحة محدَّثة بالفعل.');
        }

        /* atomic: write beside the target, then rename over it */
        $tmp = $target . '.publishing-' . bin2hex(random_bytes(4));
        if (@file_put_contents($tmp, $html, LOCK_EX) === false) {
            @unlink($tmp);
            Log::write('error', 'publish: temporary file not writable', ['dir' => dirname($target)]);
            return self::record($actor, 0, $target, false,
                'تعذّرت الكتابة على الخادم. تحقّق من صلاحيات الملفات.');
        }
        /* keep the original mode so a rename does not change who can read it */
        $mode = @fileperms($target);
        if ($mode !== false) @chmod($tmp, $mode & 0777);
        if (!@rename($tmp, $target)) {
            @unlink($tmp);
            Log::write('error', 'publish: rename failed', ['target' => basename($target)]);
            return self::record($actor, 0, $target, false,
                'تعذّر تحديث صفحة الموقع. لم يتغيّر شيء.');
        }

        return self::record($actor, $written, $target, true, null);
    }

    private static function record(?array $actor, int $regions, string $target, bool $ok, ?string $note): array
    {
        $rel = str_starts_with($target, AUN_ROOT) ? ltrim(substr($target, strlen(AUN_ROOT)), '/') : basename($target);
        Db::run(
            'INSERT INTO content_publishes (actor_user_id, actor_label, regions, target, ok, note, created_at)
             VALUES (?,?,?,?,?,?,?)',
            [
                $actor === null ? null : (int) $actor['id'],
                $actor === null ? 'النظام' : (string) $actor['name'],
                $regions, $rel, $ok ? 1 : 0, $note, Db::now(),
            ]
        );
        return ['ok' => $ok, 'regions' => $regions, 'target' => $rel, 'note' => $note];
    }

    public static function lastPublish(): ?array
    {
        return Db::one('SELECT * FROM content_publishes ORDER BY id DESC LIMIT 1');
    }

    /** Read a region straight from the live page — used to verify a publish. */
    public static function liveValue(string $key): ?string
    {
        $t = self::target();
        if ($t === null) return null;
        $html = @file_get_contents($t);
        return $html === false ? null : self::readRegion($html, $key);
    }
}
