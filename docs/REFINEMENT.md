# Responsive & Accessibility Refinement — Stage 10.11
## نمبرون للسفر و السياحة · Number One Travel & Tourism

A QA pass over everything built in 10.1–10.10. Nothing was redesigned; the
audit found a short list of real defects and each was fixed at its source
(a token, a rule, a component), never with a one-off.

```
tools/a11y-audit.mjs   the cross-site audit this stage introduced (run it after any change)
```

## What the audit covers

Every key page at 390 / 600 / 834 / 1024 / 1200 / 1440 in both languages,
every generated route at 390 and 1440: horizontal overflow (naming the
element), clipped text, touch targets under 40px, text under 12px, images
without alt, decorative SVGs exposed to assistive tech, controls without a
name, inputs without a label, heading order and landmarks, duplicate ids,
dangling `aria-*` references, colour contrast (WCAG AA against the
composited background), focus rings on the first 30 tab stops, every header
control (opens, Escape closes, focus returns) and transition durations under
`prefers-reduced-motion`. It exits non-zero on any finding; the site is at
zero.

Beside it, the per-stage browser suites and the language audit ran again,
and a motion/keyboard pass exercised every overlay (mobile drawer, header
search, mega menu, footer accordion, offers phone sheet, travellers
popover) with and without reduced motion: focus lands inside, Tab cycles
without a trap, Escape closes, focus returns to the trigger.

## What was found and fixed

| Finding | Fix (where) |
| --- | --- |
| Small buttons, tertiary links and the trip-type segments were 36px tall — under a comfortable target | `--control-height-sm` is now 40px; the segmented option reads the same token (`01-tokens`, `06-forms`) |
| At the desktop line in English (1024–1060px) the header bar squeezed the logo image to ~38px | the brand column is `max-content` and, between 64em and 80em (where the action labels are still hidden), the primary links close ranks (`12-header`) |
| Opening a header menu with Enter, then Tab, skipped the open panel and left it open | Tab from an open trigger enters its panel; leaving the trigger elsewhere closes it (`header.js`) |
| Every in-page move used `scrollIntoView({ behavior: 'smooth' })`, which ignores `prefers-reduced-motion` (CSS `scroll-behavior` does not govern it) | one `scrollTo()` helper in `core/dom.js` picks the behaviour and focuses without a second scroll; all six call sites use it |
| The homepage "go to booking" focused the form on a 350ms timer, which under reduced motion left nothing focused | the helper focuses immediately with `preventScroll` |
| The style guide's section links were 37px tall | `min-block-size: var(--control-height-sm)` on the guide's own nav |

Reviewed and left as they are: the neutral text tokens (5.66:1 on white),
placeholder text (same token), the success/warning/error foregrounds; every
form control has a persistent label, required fields carry `required` and
a visible mark, invalid fields carry `aria-invalid` and `aria-describedby`
to a `role="alert"` message, and every region announces loading through
`aria-busy`. Chromium moves focus into a date input's shadow picker button,
which paints its own ring; the audit knows to ignore that one case.

## Acceptance

390 / 834 / 1440 plus 600 / 1024 / 1200, Arabic and English: no overflow,
no clipped content, no console errors; keyboard, focus, Escape and focus
return on every overlay; touch targets, headings, landmarks, names, labels,
contrast and reduced motion at zero findings; every earlier suite green and
the language audit at 0 untranslated across all 28 pages.
