# عون الدرب — admin dashboard stages

The private management system for the website and the company's incoming requests.
Separate track from `ux/`, which covers the public site.

| Path | What it is |
| --- | --- |
| `stage-02-admin-ux.html` | **Stage 02 — UX architecture & user flows.** Ten behavioural patterns, eight module dossiers, the context contract, and six open decisions. |

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
