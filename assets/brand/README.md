# Brand assets

This demo ships with no logo or wordmark: header, footer, drawer and the
supervisor profile carry no brand mark at all, by design, so a buyer's own
logo never has to be removed first. The site's name (`brand.name` in
`assets/js/core/strings/{ar,en}.js`) is still used as plain text in page
`<title>`s and a few statements, but nothing renders it as a mark.

| File | Use |
| --- | --- |
| `icon-32.png` | Browser tab: a red tile with the plane glyph. |
| `icon-180.png` | 180x180 home-screen (apple-touch) icon, same design. |
| `share-card.jpg` | 1200x630 link-preview card (`og:image`): the home hero photo with the site name as plain text. |

All three are rendered by `node tools/build-brand-images.mjs` (edit the text
or colour there and re-run). None of them is a logo. The old logo artwork and
the images derived from it (`og-image.png`, `favicon-32.png`,
`apple-touch-icon.png`, `logo-*`) have been deleted; the new files use new names
so that messaging apps and social networks fetch them fresh instead of serving
a cached copy of the old logo card.

## Colour

Sampled from the original master and live in `assets/css/01-tokens.css`:

| | Sampled | Token |
| --- | --- | --- |
| Brand red | `#FE0002` | `--_red-600` → `--color-primary` |

**The one thing to know about the red.** `#FE0002` measures 4.03:1 against
white. Contrast is symmetric, so that is the figure both for red text on white
and for a white label on a red fill — both fail WCAG AA for normal text. The
interface therefore uses `#E00000` (`--_red-700`, 5.04:1) for fills and for red
text, and `#FE0002` (`--color-brand-red`) stays on elements that carry no text.
The two read as the same red side by side.

## Customising for a real client

Add a logo component if the buyer wants one (there is currently no `.c-logo`
class or `logo()` builder anywhere in the codebase to build on), and/or swap
the icon / share-card files above and the `brand.name`
string.
