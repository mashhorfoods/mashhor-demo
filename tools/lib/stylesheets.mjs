// The stylesheets a page links, in cascade order — the one list every page's
// <head> is written from (tools/css-links.mjs for the hand-written pages,
// tools/build-routes.mjs for the generated shells). Phase 5
//
// Each file wraps its rules in one of the layers below, so the <style> that
// declares the layer order comes first and the file order can never change
// which rule wins. Separate <link>s replace the old foundation.css @import
// chain: the browser finds every file in the HTML and fetches them all at
// once, and a page links only what it uses — the two staff-portal sheets are
// linked by the portal pages alone.

export const LAYERS = 'reset, tokens, base, layout, primitives, components, motion, utilities';

export const CORE = [
  '00-fonts', '01-tokens', '02-reset', '03-base', '04-layout', '05-primitives', '06-forms',
  '07-components', '08-product', '09-states', '10-motion', '11-utilities', '12-header', '13-footer',
  '14-home', '15-services', '16-service-detail', '17-destinations', '18-offers', '19-booking',
  '20-supervisor', '21-journey', '22-account',
];
export const PORTAL = ['23-supervisor-portal', '24-ops-portal'];
export const LAST = ['25-help'];

const START = '<!-- stylesheets: written by tools/css-links.mjs from tools/lib/stylesheets.mjs; edit the list there, not here -->';
const END = '<!-- /stylesheets -->';

/** The <head> block for one page; `portal` adds the staff-portal sheets. */
export function stylesheetBlock({ portal = false } = {}) {
  const files = [...CORE, ...(portal ? PORTAL : []), ...LAST];
  return [START, `<style>@layer ${LAYERS};</style>`, ...files.map((f) => `<link rel="stylesheet" href="assets/css/${f}.css">`), END].join('\n');
}

/** A page is a portal page when its entry script loads the operations or supervisor portal UI. */
export const isPortalPage = (html) => /assets\/js\/(ops|supervisor)\/ui\//.test(html);

const BLOCK = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}|<!-- stylesheets -->`);

/** `html` with its stylesheet block (or a bare `<!-- stylesheets -->` placeholder) written; null if it has neither. */
export function withStylesheets(html) {
  if (!BLOCK.test(html)) return null;
  return html.replace(BLOCK, stylesheetBlock({ portal: isPortalPage(html) }));
}
