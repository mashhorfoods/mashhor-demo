# Global Footer — Stage 10.3
## نمبرون للسفر و السياحة · Number One Travel & Tourism

Completes the global navigation begun in [`NAVIGATION.md`](NAVIGATION.md) and
inherits [`FOUNDATION.md`](FOUNDATION.md).

```
assets/js/data/footer.js        brand copy, columns, contact, social, legal, CTA
assets/js/components/footer.js  every component in §23
assets/css/13-footer.css        the .c-gf layer
```

```js
import { mountFooter } from './assets/js/foundation.js';
mountFooter({ target: document.querySelector('.l-page'), variant: 'marketing' });
```

## §27 is enforced by the code, not by discipline

Nothing invented reaches the page, because there is no code path that could put
it there:

| | Renders only when |
| --- | --- |
| A contact row | its `value` is set |
| A social link | its `url` is set |
| A legal link | its `exists` is `true` |

Today that means the footer ships with **two contact rows** (WhatsApp and Call,
carrying the same placeholders Stage 10.2 flagged), **no social links** and **no
legal links**. That is the honest state of the business information we have, and
it is visible in the build rather than papered over with plausible-looking
fakes.

**To turn each on:** set the value in `data/footer.js`. Phone and WhatsApp live
in `data/navigation.js` (`SUPPORT_CHANNELS`) so the header and footer can never
drift apart — change them once.

No newsletter (§12): not added until the business asks, and it would need
consent handling when it is.

## Decisions worth knowing

**Accordions are semantics, not CSS.** Below 48em a column renders a real
`<button>` with a truthful `aria-expanded`. At and above it renders a **heading**
— not a button switched off with `pointer-events: none`. The first attempt did
exactly that and left three focusable buttons on every desktop page that a
keyboard user could reach and activate, toggling an `aria-expanded` that
described nothing over a panel CSS was forcing open. `mountFooter` re-renders
when the page crosses the breakpoint.

**Variants are built, not hidden.** `marketing`, `booking` and `app` differ in
what the component constructs. A hidden link wall still ships in the DOM and
still costs the accessibility tree (§25). The booking footer keeps the live
support channels, because §07 wants support visible and a customer mid-booking
should not have to leave the flow to find it.

**Services runs two abreast on desktop.** §05 lists eleven services and §15 asks
not to build a wall of links, so that column spans two tracks.

**The services list is derived from the header's own mega menu.** One source, so
the two navigation surfaces cannot disagree about what we sell.

**The year is read at render time** (§14), never written into markup.

**§19 route graphic** is a single 2px gradient rule at the top edge that fades in
from the start of the line. It carries no content and never sits under text.

## Acceptance (§28)

Verified in-browser at 390 / 834 / 1440 in both directions —
**62/62** footer checks, alongside 96/96 site, 42/42 header-responsive and
17/17 header-interaction.

| | |
| --- | --- |
| Logo · brand statement | ✅ reversed lockup on the dark surface |
| Services · Explore · Support columns | ✅ data-driven, services derived from the header |
| Contact · Social · Legal structure | ✅ implemented; renders only verified values |
| Primary CTA | ✅ exactly one, verified by counting visible primary buttons |
| Dynamic copyright year | ✅ |
| Desktop · tablet · mobile | ✅ 6-track grid → 2 columns → single column |
| Mobile accordions, collapsed by default | ✅ §17; panel clipped to 0 height |
| Mobile order | ✅ logo → statement → CTA → contact → accordions → legal (§16) |
| RTL / LTR | ✅ both verified, hover nudge mirrors |
| Accessibility · keyboard · focus | ✅ semantic `<footer>`, labelled `<nav>` landmarks, white focus ring on dark, every control ≥44px |
| No horizontal overflow | ✅ all widths, both directions |
| Component architecture · data-driven | ✅ §23 components, links configurable |
| No invented business information | ✅ structurally impossible |
| Booking · account · supervisor compatibility | ✅ three variants |

### What the business still needs to supply

Phone number · WhatsApp number · email · office address · verified social
accounts · the five policy pages in §13. Each is one value away from appearing.
