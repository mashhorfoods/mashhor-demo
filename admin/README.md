# عون الدرب — admin dashboard stages

The private management system for the website and the company's incoming requests.
Separate track from `ux/`, which covers the public site.

| Path | What it is |
| --- | --- |
| `stage-02-admin-ux.html` | **Stage 02 — UX architecture & user flows.** Ten behavioural patterns, eight module dossiers, the context contract, and six open decisions. |
| `stage-03-design-system.html` | **Stage 03 — design system & UI components.** Tokens, eighteen component families rendered live in Arabic RTL, a measured contrast ledger, and per-component responsive contracts. |
| `dashboard.html` | **Stages 04 + 05 — the admin shell and الرئيسية.** A working, self-contained page: sidebar, header, account area, notifications, mobile drawer, page-header pattern, and the dashboard built inside it. |

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
