// The site's page list — the one place the suites and the audits learn which
// pages exist (tests/run.mjs, tests/links.mjs, tools/i18n-audit.mjs,
// tools/a11y-audit.mjs). Paths are relative to the site root and name the
// file (`services/flights/index.html`), the form every consumer appends to
// its base URL. Directories are read from disk, so a new service, offer,
// destination, supervisor profile, booking step or account screen is audited
// the moment it exists. The redirect stubs for bare directories (supervisor/,
// legal/) and the admin/ operations portal (its own suite) are not listed.
import { readdirSync } from 'node:fs';
import { RESERVED_SUPERVISOR_SLUGS } from '../assets/js/data/supervisors.js';

const ROOT = new URL('../', import.meta.url).pathname;
const sub = (dir, keep = () => true) => readdirSync(ROOT + dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && keep(d.name)).map((d) => `${dir}/${d.name}/index.html`).sort();

/** Public, indexable pages (plus 404 and the styleguide): what a visitor or a crawler can reach. */
export const PUBLIC = [
  'index.html', '404.html', 'styleguide.html',
  'services/index.html', ...sub('services'),
  'destinations/index.html', ...sub('destinations'),
  'offers/index.html', ...sub('offers'),
  'book/index.html',
  'supervisors/index.html',
  // supervisor/<slug>/ is a public profile unless the slug is reserved for the supervisor portal (Stage 13)
  ...sub('supervisor', (n) => !RESERVED_SUPERVISOR_SLUGS.includes(n)),
  'help/index.html', 'help/contact/index.html',
  'legal/terms/index.html', 'legal/privacy/index.html',
];

/** The customer flow and account area: public URLs, but noindex and stateful. */
export const CUSTOMER = [
  'search/index.html', ...sub('booking'), 'trips/index.html',
  'account/index.html', ...sub('account'),
];

/** The supervisor portal (private, noindex): the reserved slugs that exist under supervisor/. */
export const SUPERVISOR_PORTAL = sub('supervisor', (n) => RESERVED_SUPERVISOR_SLUGS.includes(n));

/** Every page. */
export const ALL = [...PUBLIC, ...CUSTOMER, ...SUPERVISOR_PORTAL];
