# عون الدرب — admin dashboard stages

The private management system for the website and the company's incoming requests.
Separate track from `ux/`, which covers the public site.

| Path | What it is |
| --- | --- |
| `stage-02-admin-ux.html` | **Stage 02 — UX architecture & user flows.** Ten behavioural patterns, eight module dossiers, the context contract, and six open decisions. |
| `stage-03-design-system.html` | **Stage 03 — design system & UI components.** Tokens, eighteen component families rendered live in Arabic RTL, a measured contrast ledger, and per-component responsive contracts. |
| `dashboard.html` | **Stages 04 + 05 — the admin shell and الرئيسية.** A working, self-contained page: sidebar, header, account area, notifications, mobile drawer, page-header pattern, and the dashboard built inside it. |
| `requests.html` | **Stage 06 — طلبات النقل.** The full request workflow: list with working search, filters and pagination, and a detail view with status changes, editing, notes and contact actions. |
| `customers.html` | **Stage 07 — العملاء.** Customer list and profile, with every customer figure derived from the request records rather than stored. |
| `services.html` | **Stage 08 — الخدمات.** The seven approved services with their real copy and photographs: edit, reorder, show/hide, and replace images. |
| `settings.html` | **Stage 09 — الإعدادات.** Six settings categories carrying the site's real company, contact and search-listing values. |
| `users.html` | **Stage 09 — المستخدمون والصلاحيات.** Administrators, the three approved roles, and a per-module view/edit permission matrix. |
| `media.html` | **Stage 12 — الوسائط والأصول.** The website's real image library, with usage tracking that protects published assets from deletion. |
| `intake.html` | **Stage 13 — تكامل نموذج الموقع.** The website-to-request pipeline: the form as it would appear, both validation layers, and the record it produces. |
| `QA-REPORT.md` · `stage-10-qa-report.html` | **Stage 10 — production readiness audit.** |

The built site (`../index.html`) is the source of truth for services, content areas,
contact details and terminology. Nothing in this track invents business features.

## Stage 02 — UX architecture and user flows

Read against the built site first. Four findings shaped everything after them:

- **F1 — there is no request form on the website.** The contact section carries zero
  inputs; the only affordances are `tel:+966535544352` and `wa.me/966535544352`.
  So `طلبات النقل` is not an inbox — requests arrive by phone and WhatsApp and someone
  types them in. Recording a request is therefore a *primary* action, and the record
  form is the screen used under the most pressure: on a phone, mid-call.
- **F2 — `الأسئلة الشائعة` and `آراء العملاء` have no section on the site.** Both ship
  manageable and both carry a standing "not visible on the site yet" status, so the
  client is never left believing they published something a visitor can see.
- **F3 — contact information had two candidate homes.** Resolved to one: it is company
  data, edited once in `الإعدادات`, shown read-only in `المحتوى`. No duplicated editors.
- **F4 — three published areas Stage 01 did not list** (`كيف نعمل`, `رؤيتنا ورسالتنا`,
  `القيم`) are real copy on the site and enter `المحتوى`. Nothing else was added.

Delivered: 10 operating rules, the context contract (what "return to where you were"
actually preserves), the global and per-module flows, the five-status lifecycle with its
allowed movements, one search-and-filter pattern, one form pattern, one destructive-action
pattern, the four states, three responsive tiers with a table-to-card priority rule,
accessibility behaviour, a P01–P10 pattern library with a module × pattern matrix, and
the eight module dossiers (entry, flow, primary, secondary, states, exit, access).

Terminology: `ذوي الاحتياجات الخاصة` only. Numerals follow the site — Western digits.
Arabic-first, RTL as the layout rather than a switch.

Six decisions are left open for the client (D1–D6), each with a working assumption so
Stage 03 is not blocked. No colour, type, spacing, component or implementation decision
is made here — those are Stage 03.

## Stage 03 — design system and UI components

Built on `brand/tokens.css` and `brand/system.css`, not beside them. The brand palette,
the IBM Plex Sans Arabic + Cairo pairing and the accessibility guardrails carry over
unchanged. Two things were narrowed for interface density and stated as derivations:
body type sits on the brand's 16px floor rather than the marketing 17px, and the radius
ramp steps down one notch (10/16/24 → 8/12/16) because a 16px radius on a 44px input
reads inflated.

Every contrast pairing was measured, and three findings changed the system:

- **Warning text failed on its own tint** — `#B0791C` on `#FBF3E4` is 3.40:1. Badge and
  alert text now uses `#8F6014` (4.94:1); the original hue stays as the marker colour.
  Success and error were also just short of AA and got the same treatment.
- **The brand focus ring is invisible on the navy sidebar** (1.84:1). Dark surfaces use a
  light ring, `rgba(217,228,243,.55)` → 6.63:1. It is the system's only inverse token.
- **Four of the five status hues collapse in greyscale** (luminance 101–126), so colour
  cannot carry status. Every badge pairs its word with a distinct icon silhouette, and
  the greyscale proof row in §13 is the test.

Two status decisions worth flagging: `مؤكد` takes the deep navy so the three positive
states stay distinguishable, and `ملغي` is **neutral, not red** — a cancelled trip is a
valid outcome, not a fault. Red is reserved for errors and destructive confirmation.

Delivered: colour, type, spacing, radius, depth and motion tokens; a hand-drawn 33-icon
outline set (24px canvas, 1.75px stroke) with the RTL mirroring rule; buttons, form
controls, cards, tables with pagination and both empty states, status badges, three
navigation forms, header, modal, drawer, alerts, toasts, loaders, skeletons and empty
states — all rendered live in Arabic RTL; plus per-component responsive contracts and
the accessibility rules each must keep.

Light theme only, deliberately: the brand has no approved dark palette and deriving one
would be a second identity. No page layouts are designed — every specimen is a component
in isolation. Composition is Stage 04.

## Stages 04 + 05 — the shell, and الرئيسية

`dashboard.html` is a real working page, not a specification: open it in a browser and the
sidebar collapses, the drawer traps focus, the notification panel marks items read, and the
four data blocks cycle through their states. It has no dependencies — one file, one font
request, an inline icon sprite and about 120 lines of vanilla JavaScript. No libraries, no
polling, no background effects.

**Stage 04 — the shell.** Collapsible navy sidebar (remembered per browser), sticky header
with global search, notifications and account menu, the page-header pattern, and the content
container capped at 1440px (1560px above 1600px wide). Sidebar → 72px rail at 1023px →
hidden behind a drawer at 767px. Shell-level states: a top load bar, an offline banner driven
by the browser's own online/offline events, and a session-expiry dialog that promises the
user their place back.

**Mobile navigation is a drawer, not a bottom bar** — a reversal of the Stage 03 sketch, made
for the reason Stage 04 §12 raises: eight modules do not fit a bottom bar, and splitting them
four-plus-"more" breaks the guarantee that the current location is always obvious, because
anything behind "more" shows no active state.

**Stage 05 — الرئيسية.** Page header → five metrics → status distribution → recent requests →
recent activity → quick actions. The distribution is a plain stacked bar plus a legend whose
every row is a link into the filtered list — no chart library. Recent requests are a table on
desktop and record cards below 767px. Every data block owns its own state, so one failed
fetch shows one error card while the rest of the page keeps working; the state preview button
demonstrates exactly that.

Demo data is labelled as demo data on the page itself, per Stage 05 §15 — nothing here should
be mistaken for a real business figure.

Two defects worth recording, both found by measuring rather than by eye: inline `display`
styles on the state blocks silently beat the state-switching CSS, so the KPI states could
never have toggled; and the flex text spans had the default `min-width:auto`, which on a
390px viewport is the classic cause of a page wider than its own viewport. The mobile
layout that looked broken in the first captures was a screenshot artifact of RTL scroll
origin — `scrollWidth` measured exactly 390 with zero overflowing elements.

## Stage 06 — طلبات النقل

`requests.html` is a working module, not a mockup. The search box, the three filters, the
pagination and every status change operate on a real in-page dataset of twelve demo
records, so the whole loop — **Find → Review → Understand → Act → Update → Confirm** — can
actually be walked.

**List.** Seven columns: request number (with its creation date beneath), customer (name and
phone), service, route, trip date and time, status, and a row action. Search matches request
number, customer name, or phone digits, debounced to one pass rather than one per keystroke.
Filters cover status, trip period and service; each applied filter appears as a removable chip
with one reset for all of them. Pagination is five per page, and moving between pages never
disturbs the search or filters.

**Detail.** Grouped as customer → transportation → notes, with request metadata and the full
status history alongside. Contact actions are `tel:` and `wa.me` links plus copy-to-clipboard —
the dashboard never becomes a messaging client. Editing covers only what the workflow permits
(service, date, time, pickup, destination); the customer's identity belongs to their own record
and the request number and creation date are never editable. Validation is inline, and nothing
typed is lost on a failed save.

**Status.** The approved five, with the moves the lifecycle allows: forward along
جديد → قيد المراجعة → مؤكد → مكتمل, cancel from any non-final state, and an audited backward
correction. Final states cannot be left. Consequential moves confirm first, naming the record
and the consequence; the change then updates in place, records who and when, and leaves the
administrator exactly where they were.

**Cancellation is not deletion, and no delete control exists.** Stage 06 §11 allows deletion
"if technically required" — it is not. Stage 02 ruled it out because erasing a request silently
rewrites the customer's history and the report counts, and §20 forbids changing that decision.

**Permissions** are demonstrated rather than described: the view-only switch strips every
modification control — the record button, status change, edit, and the note composer — leaving
the record fully readable.

Two defects fixed here, the second of which also applied to `dashboard.html` and was corrected
in both so the pages stay identical: single values were breaking mid-token in table cells, and
Arabic author names were rendering glyph-by-glyph because the metadata lines used the mono
face, which carries no Arabic.

## Stage 07 — العملاء

`customers.html` holds the module's one real architectural decision: **customers are derived
from requests, keyed by phone number.** Nothing about a customer is stored twice — the request
count, first and last activity, and the completed/cancelled mix are all computed from the
request records. That is what enforces one customer to one record however many times they
call, and it means no figure on the screen was invented. The twelve customers on the page are
what sixteen demo requests actually produce, with three of them repeat callers.

**List.** Name, phone, request count, last request with its service and status, and a row
action. Search matches name or phone digits. One filter — whether the customer has an active
request — because that is the operational question ("who am I still working for?"); §4 warns
against inventing filters, so there are no others. Sorting offers most recent activity, most
requests, or name. "Most recent activity" means the latest request *created*, not the furthest
future trip date; a booking for next month is not recent activity.

**Profile.** Derived stat strip, request history, customer information and contact actions.
Each history row hands off to `requests.html#REQ-…` — the requests module opens that record
directly, so the two are genuinely linked rather than one reimplementing the other. Editing
covers name, phone and an administrative note only; the panel states that counts and activity
dates come from the request records and are never edited by hand. Changing the phone number
is treated as changing the customer's identity: it moves the whole history with it and is
refused outright if another customer already holds that number.

**Not built here:** no customer status field, because the data model has none, and §13 forbids
inventing one. Empty states cover no customers, no search results, a customer with no history,
and missing optional fields — an absent note reads as "لا توجد ملاحظات على هذا العميل" rather
than as a blank.

## Stage 08 — الخدمات

`services.html` manages the seven approved services. **Every title, description and photograph
was lifted from the built site**, not written for the dashboard: the copy is byte-for-byte what
`index.html` publishes, and the seven service photographs are embedded as data URIs from
`dist/img/*-360.webp`, so the module shows real content rather than placeholders. There is no
way to add an eighth service — the approved set is the source of truth.

**List.** Order number with up/down controls, photograph, name, description, visibility badge,
last update, and edit/hide actions. Reordering uses explicit buttons plus the order number
rather than drag-and-drop: §7 allows either, and buttons are the option that works on touch,
with a keyboard, and with a screen reader. Search by name and one visibility filter, per §10.

**Editor.** Basic information, service image, and publishing, each in its own card. Character
counts on both text fields, a sticky save bar stating that changes publish on save, and a
visibility toggle whose helper text explains that a hidden service keeps its content and can be
brought back.

**The terminology rule is enforced, not documented.** The editor refuses to save any title or
description containing `الإعاقة`, `ذوي الإعاقة`, `معاق`, `معاقين` or related forms, and names the
offending word in the error alongside the approved `ذوي الاحتياجات الخاصة`. A future
administrator cannot put prohibited wording onto the website through this form.

**Image replacement** validates type (WebP/JPG/PNG) and size (2 MB), shows real read progress,
previews the result, and marks it as pending until save — an uploaded image never looks
published before it is.

**Unsaved work** is tracked: an indicator appears in the header, the save button stays disabled
until something actually changes, leaving the editor asks first and names what would be lost,
and the browser's own unload prompt is armed as a backstop. A save is refused outright while
the browser reports no connection, because §8 forbids reporting a save that did not happen.

**One implementation caveat for the build.** The save bar says changes publish immediately.
That is true of a database-backed site; this site is a **static build** (`build.js` → `dist/`),
so an immediate-publishing model requires saving to trigger a rebuild and deploy. If the
deployment cannot do that, the wording must change to describe the real model rather than the
intended one.

## Stage 09 — الإعدادات and المستخدمون والصلاحيات

Two modules, one shell. The shell behaviour (sidebar, popovers, drawer, offline, toast,
confirmation) is now a single shared `window.AunShell` block rather than being copied into each
page again — the earlier module pages each carried their own copy, and a third and fourth
would have made drift inevitable.

### الإعدادات

Six categories, each saved on its own — no page-wide save button that commits five unrelated
things. Every value shown is what the site carries today: the company name, tagline, the
`og:description`, the Riyadh address, `+966 53 554 4352`, `https://aunaldrb.com/`, and the real
search title and meta description from `index.html`. The logo panel shows the actual
`brand/aun-aldrb-logo.svg`.

Three places where the honest answer was "nothing":

- **No email address exists** on the site, so the field ships empty with a note explaining it
  only appears to visitors once filled — rather than inventing an address.
- **No social accounts are linked.** Both fields read `غير مرتبط`.
- **English is not published.** §5 asks for a bilingual structure; the site is Arabic-only, so
  the language panel shows Arabic as published and English as not, and states that a language
  cannot be enabled before its content exists — the guard that stops an empty page going live
  or Arabic being overwritten by mistake.

Contact settings carry a standing warning that these values are what customers dial. Search
title and description have character counts against the lengths that actually get truncated.
A save is refused while the browser reports no connection, and each category tracks its own
unsaved state — the category list shows a dot, and switching away asks first.

### المستخدمون والصلاحيات

The three approved roles, and a permission matrix with one row per **real dashboard module** —
no permission exists without a module behind it. View and edit are separate, and edit implies
view, enforced in the interaction rather than left to the administrator.

**Super Admin and Content Manager have fixed permission shapes; only مدير is adjustable.** A
role that can be edited into anything is not a role. Changing a user's role resets the matrix to
that role's shape rather than leaving a stale mixture behind.

Two guards are stated in the interface **before** they are needed, not as a failure afterwards:
you cannot change your own role or disable your own account, and the last active Super Admin
cannot be disabled, demoted or removed. Both disable the controls and explain why.

Adding a user runs معلومات → الدور/الصلاحيات → مراجعة → حفظ as one screen with three sections and
a live review panel, per Stage 02's rule against unnecessary multi-step forms. Duplicate email
addresses are refused and name the existing account.

Passwords are never shown or stored readably. Reset marks the account so the user must set a new
password at next sign-in and ends their current sessions. Deactivation is offered as the
reversible action; removal is the destructive one, confirmed, and it says outright that
deactivation is the reversible alternative.

**These are frontend controls only.** Every rule above — role, permission, guard — must be
enforced again server-side, per §12 and §19. The interface hiding a control is a convenience,
never the security boundary.

## Stage 12 — الوسائط والأصول

`media.html` is built on the site's **actual asset inventory**, not a sample: eighteen real
files read straight from `img/`, `dist/img/` and `brand/`, each with its true filename,
byte size and dimensions parsed from the file headers. Usage is **computed from `index.html`** —
which section references which image — so the library knows that `wheelchair-ramp-boarding.webp`
is the hero and `hospital-medical-centre.webp` is a service photograph.

Two assets are genuinely unused: `aun-aldrb-logo-white.png` and `aun-aldrb-logo-white.svg` are
referenced nowhere in the site. That gave a real "unused" state without inventing one, and it is
the only pair the module will let you delete.

**Safety is the point of the module.** A used asset cannot be deleted: the button is disabled,
and the sheet says which sections depend on it and what to do instead. Replacement keeps the
path and filename, so every reference in the site keeps resolving — the operation swaps the
file's contents, never its identity.

**Validation** runs before anything enters the library: MIME type against the four supported
formats, a 3 MB ceiling, a zero-byte check, and — the one that catches a mislabelled or
corrupted file — the browser must actually decode it as an image before the confirm button
enables. Filenames are sanitised (path segments stripped, unsafe characters removed) and a
collision with an existing name is refused with the name spelled out, rather than silently
overwriting.

**Performance (§20).** The grid never loads a master image. Thumbnails come from the smallest
built rendition (360w), every grid image carries `loading="lazy"`, and the two 5041×3577 logo
masters — which have no small rendition — show a placeholder reading *بلا مصغّرة* instead of
pulling 217 KB into a tile. Twelve per page.

**Content integration (§13)** is wired end to end: the services editor's image panel now offers
*اختيار من المكتبة*, which hands off to `media.html?pick=…&return=…`. The library switches to
picker mode, the chosen path returns through `sessionStorage`, and the editor restores
everything the administrator had already typed — not just the image. The editor never carries a
second copy of the library.

**Navigation** gained one flat item, الوسائط والأصول, under the الموقع الإلكتروني group beside
المحتوى — no nested navigation, consistent with Stage 04. All seven pages carry it.

Audited to the Stage 10 bar: no overflow at any of the fourteen required widths, no missing alt
text, labels or accessible names, no duplicate ids, no undersized targets, `dir=rtl`, and no
runtime errors. One bidi defect was found and fixed in review: dimensions and file sizes are
Latin runs inside RTL cards and were reordering — `1448×1086` reading back as `1086×1448` —
so each value now sits in its own LTR isolate.

**Known cost:** `media.html` is 512 KB because sixteen thumbnails are embedded as data URIs to
keep it a single self-contained file. In production the thumbnails should be served as files —
the same finding Stage 10 recorded for `services.html`.

**Still open:** §13's full workflow assumes the المحتوى module, which does not exist. The
integration is demonstrated against the services editor instead. The Stage 10 verdict is
unchanged: **NOT READY FOR DEPLOYMENT** until المحتوى and التقارير exist and a backend provides
authentication, persistence and server-side authorization — including for media operations,
which §22 rightly treats as high-privilege.

## Stage 13 — website request intake

**The premise had to be checked first, and it does not hold.** The published site carries
**zero** forms, inputs, textareas, selects, submit buttons and endpoints — re-verified against
`index.html` at this stage, not assumed from Stage 02. The only contact affordances are
`tel:+966535544352` and `wa.me/966535544352`. There is no existing form to connect.

Stage 02 recorded this as open decision **D1** ("is a request form being added to the website,
or do requests stay phone and WhatsApp only?"). It is still open, and Stage 13's own rules
forbid resolving it unilaterally: §22 and §28 say do not redesign the public website or
introduce unapproved public content. **So `index.html` was not touched.**

Everything that does not depend on that decision was built:

**Admin-side integration (§06, §10, §11, §12).** `requests.html` gains the مصدر filter Stage 02
specified — الموقع / واتساب / هاتف — plus two genuinely website-sourced records, so a website
request is visible and filterable in the existing module. No second dashboard, no second detail
view, no second status system: website requests are ordinary requests with a different source.

**`intake.html` — the pipeline, working.** The form exactly as it would appear on the site,
wired through the complete flow: client validation → submit → server validation → duplicate
check → request creation with an ID from the shared counter → customer association by phone →
storage → the resulting admin record. Submit it and every step reports what it did.

- **§19 is real, not described:** the service list is filtered by the Services module's
  visibility, so the one hidden service does not appear in the public form.
- **§07 reuses Stage 07's rule:** phone is the customer identity. A known number attaches to the
  existing customer; an unknown one creates a record. No duplicate customers.
- **§08 duplicates** are flagged, never merged: the original is preserved and the new record
  carries a تكرار محتمل badge.
- **§09 and §21:** the response simulator exercises network and server failure. Neither reports
  success, neither creates a partial record, and both keep every value the visitor typed.
- **§03:** the same rules run in the browser and again on the server. The page states plainly
  that the browser layer is convenience and the server layer is the one that counts.
- **§17:** the submit button locks and shows a spinner for the duration — one request per submit.

**The integration contract** is on the page as a table: every field, its server rule, what the
system sets rather than the sender (ID, status `جديد`, source `الموقع`), the customer-matching
rule, the duplicate window, and the required protections — rate limit, honeypot, CSRF, and
rejecting any field outside the contract. A backend developer can implement against it directly.

**One defect fixed across all eight pages.** A component class setting `display` outranks the
UA rule for `[hidden]`, so an error panel rendered alongside the success panel. A single
`[hidden]{display:none!important}` guard now removes that whole bug class everywhere.

**The decision still needed:** whether the request form goes onto the public site. Until it
does, this stage delivers the intake path complete and ready to wire, and website-sourced
requests remain something the admin can represent but the visitor cannot yet create.
