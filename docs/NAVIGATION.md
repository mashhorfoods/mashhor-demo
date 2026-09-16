# Global Header & Navigation — Stage 10.2
## نمبرون للسفر و السياحة · Number One Travel & Tourism

Inherits Stage 10.1 ([`FOUNDATION.md`](FOUNDATION.md)). Nothing here redefines a
token, a colour or a component from that layer.

## Where it lives

```
assets/js/data/navigation.js    the whole IA as data — nav, mega menus,
                                account menus, support channels, search scopes
assets/js/components/header.js  every component below
assets/css/12-header.css        the .c-gh layer
```

## Using it

```js
import { mountHeader } from './assets/js/foundation.js';

mountHeader({
  target: document.querySelector('.l-page'),
  current: 'home',              // marks the active primary item (§19)
  variant: 'default',           // or 'booking' (§32)
  onSearch: (q) => { … },
});
```

`globalHeader()` returns the element if you'd rather place it yourself;
`mountHeader()` also wires the scroll state.

## Components (§27)

| | |
| --- | --- |
| `globalHeader` | The assembly. Desktop bar, mobile bar, panels, drawer. |
| `logo` · `bookNowButton` · `languageButton` | Primitives reused by bar and drawer. |
| `menuPanel` | Renders any `MENUS` entry — mega or narrow. One implementation. |
| `accountPanel` | Guest and authenticated shapes; repaints on session change. |
| `searchPanel` | The focused search sheet. |
| `mobileDrawer` | Drawer, accordions, support channels. |
| `initHeaderScrollState` | Sentinel + IntersectionObserver. |
| `setSession` / `getSession` | The Stage 12 seam. |

## Decisions worth knowing

**Click, never hover (§22).** Menus open on click only. A cursor crossing the
bar cannot fire a panel. Escape closes and returns focus to the trigger;
ArrowDown opens and lands on the first item; tabbing out closes; opening one
menu closes any other.

**The mega panel is not inside its `<li>`.** It spans the container, so
`inset-inline: 0` inside the list item would resolve against the button's own
width and collapse the panel to a strip. Mega panels are siblings of the bar
inside `.c-gh__inner`; the narrow dropdowns stay anchored to their trigger.

**The scrim is layered below the bar.** It is a child of the header, so
`z-index: 1` covers the page while `.c-gh__inner` at `2` keeps the header
clickable. Appending a scrim after the bar without this makes the header
swallow its own clicks, including the one that would close the menu.

**Scroll state costs nothing (§26).** A 1px sentinel above the header, watched
by IntersectionObserver. No scroll handler runs on the main thread — this
component is on every page, so it must not be the thing that makes scrolling
janky. The bar goes 80px → 64px and the logo 56px → 44px; only padding and the
logo animate, so nothing jumps.

**Height is derived (§31).** `--header-shell` is logo + padding. Change the
logo size and the header follows.

**One red action (§11).** The bar holds exactly one `.c-btn--primary`. The
drawer's Book Now and the account panel's Sign in are inside closed overlays,
so they never compete. Verified by counting *visible* primary buttons.

**Language switch.** Tablet and up it sits in the bar; on a phone it moves into
the drawer, because §15 wants the phone header down to logo, search, account
and menu. Arabic and English are both first-class (§06 of 10.1), so it has to
be reachable from every page.

**No remote dependency (§33).** `navigation.js` is static and bundled. An API
outage cannot empty the navigation.

## Future stages (§28)

`setSession({ authenticated, name, role })` switches the account menu between
`ACCOUNT_GUEST` and `ACCOUNT_CUSTOMER`. Stage 12 calls it; the header does not
own a session.

Roles beyond `customer` deliberately add **nothing** here. Supervisor and admin
navigation are separate systems and must not be merged into this file. A
customer visiting a supervisor's public profile sees the Number One header
unchanged — the supervisor's identity belongs in the page content (§29).

`variant: 'booking'` drops the primary nav and the CTA and shows a secure-booking
note instead, while keeping logo, support and account. Verified: zero visible
nav links, zero visible CTAs, support and account still one click away (§32).

## Acceptance (§34)

Verified in-browser at 390 / 834 / 1440 in both directions:
**96/96** site checks · **42/42** responsive · **17/17** interaction.

| | |
| --- | --- |
| Logo used correctly, no redesign | ✅ the Stage 10.1 `.c-logo` component |
| Desktop / tablet / mobile headers | ✅ separate compositions, not a squeeze |
| Primary navigation, 5 items | ✅ services not exposed top-level (§04) |
| Services mega · Destinations · Offers · Support | ✅ one `menuPanel` renders all four |
| Global search trigger | ✅ focused sheet, autofocused, 5 scopes |
| Account entry, guest + authenticated | ✅ `setSession` switches it |
| Book Now CTA | ✅ exactly one visible red action |
| Sticky · scrolled · hover · active · focus | ✅ 80→64px, active carries weight + rule |
| Dropdown behaviour | ✅ click-open, Escape, outside click, one at a time |
| Mobile drawer + accordion | ✅ all collapsed on open (§17) |
| RTL / LTR | ✅ drawer mirrors edge; verified both |
| Keyboard · Escape · touch targets | ✅ every control ≥44px, every button labelled |
| No horizontal overflow | ✅ at all three widths, both directions |
| Stage 11/12 · supervisor · admin separation | ✅ see above |

### Open

- Support channel URLs are placeholders (`wa.me/`, `tel:+249…`) pending the real
  numbers.
- Destination and offer routes point at pages later stages build; until then
  they land on the 404, which is branded and offers a way back.
