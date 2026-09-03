# Final QA Gate — run against the built system

Every figure below came from a run performed during this stage, against the
application as it now stands. Nothing here is asserted from a brief.

Two gates, both repeatable:

| | what it drives | run with |
| --- | --- | --- |
| `bin/verify.php` | the API and the database, over real HTTP with real sessions | `php bin/verify.php [baseUrl]` |
| `bin/qa-browser.js` | every page in a real Chromium, signed in, at four widths | `node bin/qa-browser.js [baseUrl]` |

## Result

| | SQLite | MySQL 10.11 |
| --- | --- | --- |
| `bin/verify.php` | **712 / 712** | **712 / 712** |
| `bin/qa-browser.js` | **354 / 354** | **354 / 354** |

MySQL matters here for a specific reason: Hostinger runs MySQL and every
previous verification in this project ran on SQLite. The migrations, the seed,
the whole suite and the whole browser walk were run again from an empty MySQL
database — which is also the first time the MySQL branch of
`Retention::deleteInBatches()` ever executed.

Not run: **the live host**. This environment's network policy refuses
`aunaldrb.com`, so nothing below was measured against production. Run both
commands against the live URL after deploying, plus `php bin/preflight.php`,
which is read-only and safe there.

---

## The six blockers from Stage 16

| # | Blocker | Now | Evidence |
| --- | --- | --- | --- |
| 1 | No authentication | **Closed** | Argon2id, DB-row sessions, revocable logout, lockout. Unauthenticated GET of six admin endpoints returns 401 and leaks no rows. |
| 2 | No server-side authorization | **Closed** | Enforced in the dispatcher. A Content Manager gets 403 on requests and users; the write it attempted changed nothing. |
| 3 | No persistence | **Closed** | §32 re-reads every record through a fresh connection after a restart. |
| 4 | Public form has no endpoint | **Closed** | `POST /api/requests` accepts a real submission; the row lands with `source=website` and the approved status. |
| 5 | Four modules absent | **Closed** | المحتوى، التقارير، الإشعارات، سجل النشاط all exist and are exercised by the suite. |
| 6 | Hostinger deployment unverified | **Partly** | The system is installed and running on Hostinger; the checks above ran on MySQL rather than on that host, because this environment cannot reach it. |

## The four non-critical issues from Stage 16

1. **Data-URI thumbnails** — **still true, and unchanged.** `media.html` is
   517 KB (301 KB gzipped) and `services.html` 291 KB (165 KB), with 14 and 7
   base64 images embedded respectively. Stage 16 measured 517 KB and 283 KB, so
   nothing has improved here. Both pages are behind a login and are not on the
   visitor path, which is why this has stayed acceptable — but it is a real
   cost on a phone connection and it has not been paid down.
2. **Admin loads Google Fonts** — **still true, 12/12 pages.** Reported as an
   advisory rather than fixed: removing it means shipping Cairo 600, IBM Plex
   Sans Arabic 400 and IBM Plex Mono locally, which this project does not have.
   The cost is real — every sign-in is visible to Google, and the dashboard
   loses its typefaces whenever Google is unreachable.
3. **No admin build step** — unchanged, and deliberate.
4. **Chromium only** — unchanged. Firefox and Safari are not available here.

---

## What this gate found that four previous audits did not

Every one of these was invisible to source review and to screenshots. They
appear only when a browser is asked to lay the page out and the result is
measured.

### 1 · The admin pages had no document preamble — all twelve

No `<!DOCTYPE html>`, no `<html lang="ar" dir="rtl">`, no `<meta charset>`,
no `<meta name="viewport">`. Measured, before and after:

| | before | after |
| --- | --- | --- |
| rendering mode | `BackCompat` — **quirks mode** | `CSS1Compat` |
| `lang` | *empty* — **WCAG 3.1.1 (A) failure** | `ar` |
| root direction | `ltr` (RTL came only from a CSS rule) | `rtl` |
| layout viewport at 390 px | **980 px** | 390 px |

The last line is the one that matters most: without a viewport meta a phone
renders a 980 px desktop layout and scales it down. Every previous audit's
"verified at 390 px" measured a desktop layout, and **no mobile media query in
the admin had ever run.**

### 2 · The sign-in button was 20 px tall

`.btn` on `login.html` sets `min-height: var(--control-md)` — and
`--control-md` is defined nowhere. An undefined custom property is not an
error: the declaration is dropped and the element falls back. The most
important control in the dashboard had collapsed to its line-height.

Two more on the same page (`--ground`, `--s7` — the spacing scale has no
`--s7`), and two separators in `settings.html` that named `--line` where the
design system's hairline token is `--divider`, so both drew nothing. The suite
now fails on any `var()` naming a token nothing defines.

### 3 · The requests page was blank on a phone

Once the viewport meta made the mobile layout apply for the first time, the
page measured 914 px wide inside a 390 px viewport — and would not scroll to
the rest. A screenshot at 390 px was **an empty grey rectangle**.

The cause: the pager renders one button per page with no limit. 522 requests
at 20 per page is 27 buttons in one non-wrapping row, 876 px wide. It grows
without bound with the data, so it was never going to show up on a small
dataset. Four pages had it — requests, customers, media, activity — and all
four now window the buttons (first, last, the current page's neighbours, `…`),
which is bounded at seven entries however large the table gets.

### 4 · The page scrolled sideways next to a table that was scrolling correctly

`customers.html` at 1024 px and 768 px: `.tbl-wrap` scrolled its table
properly *and* the whole page scrolled too. In RTL a scroll container without
a containing block of its own still contributes its content to the document's
scrollable width. `position: relative` on `.tbl-wrap` — one property, no
visual change — fixes it. Applied to all eleven pages that have the class.

---

## What the gate measures, and against which standard

- **Target size** — WCAG 2.2 AA (SC 2.5.8) is **24 px**, and that is the line
  the gate fails on. The project's own `--tap` is 44 px and is applied to the
  navigation and menus; ordinary buttons are 40 px and small ones 32 px, which
  is a deliberate desktop density. Anything under 44 px at a phone width is
  listed as an advisory, because guidance reported as failure is how a gate
  stops being read.
- **Dead links** — a link a person can follow that goes nowhere. The
  navigation entry for the current page (`href="#"` with `aria-current="page"`)
  is "you are here", not a destination, and is counted separately. So are
  anchors used as in-page controls.
- **Terminology** — ذوي الاحتياجات الخاصة and nothing else, in rendered text
  and in shipped source. The two files that carry the list of *rejected* words
  are the rule being enforced — `services.html` refuses them as an editor
  types, `Routes.php` refuses them on a direct API call — and their
  declarations are excluded from the scan rather than counted as violations.
- **Statuses and roles** — five and three, read from `Schema` rather than from
  the markup, and cross-checked against what the pages actually render.

## Accepted, with reasons

| Item | Why it is accepted |
| --- | --- |
| Admin typefaces from `fonts.googleapis.com` (12 pages) | Removing it needs three font families this project does not ship. Named, not hidden. |
| Anchors used as in-page controls (15 across 4 pages) | `href="#"` plus a handler that preventDefaults. Works for every user; `<button>` is the correct element and is a follow-up, not a defect. |
| 40 px and 32 px controls at phone widths | Clears WCAG 2.2 AA (24 px) comfortably. 44 px is guidance, and the design system applies it where it decided to. |
| Firefox and Safari untested | Neither is available in this environment. |

## Verdict

**Ready to deploy**, with one condition and one caveat.

The condition: run both gates and `bin/preflight.php` against the live host
after deploying. Nothing here was measured there, and this gate exists
precisely because "it looks right" is not a measurement.

The caveat: the mobile layout of the admin has now been laid out at true phone
widths for the first time in this project's history. Two defects came out of
that immediately and are fixed. A third pass on a real phone is worth the hour.
