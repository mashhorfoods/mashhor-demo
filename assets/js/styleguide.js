/* ============================================================================
   STYLE GUIDE — the demo wiring for styleguide.html.

   This file is documentation infrastructure, not part of the product bundle.
   It renders the data-driven sections of the guide from the same modules a
   real page would use, so the guide cannot drift from the system: if a
   renderer breaks, the guide breaks.
   ========================================================================= */

import {
  boot, el, qs, qsa, render, icon, toast, setButtonState,
  t, getLocale, applyTranslations,
  STATUSES, featuredServices,
  mountHeader, setSession, getSession, globalFooter,
  searchWidget, stateRegion, skeletonCard,
  serviceCard, destinationCard, offerCard, supervisorCard,
  HOME_DESTINATIONS, HOME_OFFERS, SUPERVISOR_REGISTRY, } from './foundation.js';

// The cards below are the live components, fed from the live registries (and the
// development flight supplier), so the guide shows exactly what the site renders. Phase 6
import { flightResultCard } from './booking/ui/result-card.js';
import { labelOffers, sortOffers } from './booking/rank.js';
import { toSearchRequest } from './booking/search.js';
import { devOffers } from './booking/adapters/dev-flights.js';
import { tripCard, statusBadge } from './account/ui/shell.js';
import { initOtp, initUploads } from './preview/forms.js';
import { TRIPS } from './preview/samples.js';
import { registerStrings } from './core/i18n.js';

// The guide's own copy (sg.*) is a slice of its own, so no product page downloads it. Phase 5
await registerStrings('styleguide', {
  ar: () => import('./core/strings/ar-styleguide.js'),
  en: () => import('./core/strings/en-styleguide.js'),
});

/* ---------------------------------------------------------------------------
   COLOUR — read the real computed token values, and compute the real contrast
   ratio against white. A swatch that lies is worse than no swatch.
   ------------------------------------------------------------------------ */
const SWATCHES = [
  ['--color-primary', 'Primary'], ['--color-primary-dark', 'Primary dark'], ['--color-primary-light', 'Primary light'],
  ['--color-black', 'Black'], ['--color-charcoal', 'Charcoal'], ['--color-white', 'White'],
  ['--color-gray-50', 'Gray 50'], ['--color-gray-100', 'Gray 100'], ['--color-gray-200', 'Gray 200'],
  ['--color-gray-300', 'Gray 300'], ['--color-gray-400', 'Gray 400'], ['--color-gray-500', 'Gray 500'],
  ['--color-gray-600', 'Gray 600'], ['--color-gray-700', 'Gray 700'], ['--color-gray-800', 'Gray 800'],
  ['--color-gray-900', 'Gray 900'],
  ['--color-success', 'Success'], ['--color-warning', 'Warning'], ['--color-error', 'Error'], ['--color-info', 'Info'],
];

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgb(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastOnWhite(hex) {
  const l = luminance(hex);
  if (l === null) return null;
  return (1.05) / (l + 0.05);
}

function renderSwatches() {
  const styles = getComputedStyle(document.documentElement);
  render(qs('#sg-swatches'), SWATCHES.map(([token, label]) => {
    const value = styles.getPropertyValue(token).trim();
    const ratio = contrastOnWhite(value);
    const passes = ratio !== null && ratio >= 4.5;

    return el('div', { class: 'sg-swatch' }, [
      el('div', { class: 'sg-swatch__chip', style: `background:${value}` }),
      el('span', { class: 'sg-swatch__name', lang: 'en' }, label),
      el('span', { class: 'sg-swatch__hex' }, value.toUpperCase()),
      ratio === null ? null : el('span', {
        class: 'sg-swatch__ratio', lang: 'en',
        style: `color:var(${passes ? '--color-success-fg' : '--color-text-secondary'})`,
        title: 'Contrast against white',
      }, `${ratio.toFixed(2)}:1 ${passes ? 'AA' : '·'}`),
    ]);
  }));
}

/* ---------------------------------------------------------------------------
   SPACING
   ------------------------------------------------------------------------ */
function renderSpacing() {
  const steps = [4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96];
  render(qs('#sg-space'), steps.map((step) => el('div', { class: 'sg-space-row' }, [
    el('code', { style: 'inline-size:7rem;font-size:var(--text-overline)' }, `--space-${step}`),
    el('span', { class: 'sg-space-bar', style: `inline-size:${step}px` }),
    el('span', { class: 't-caption' }, `${step}px`),
  ])));
}

/* ---------------------------------------------------------------------------
   GRID — show the live column count so the breakpoints are verifiable.
   ------------------------------------------------------------------------ */
function renderGrid() {
  const grid = qs('#sg-grid');
  const output = qs('#sg-cols');

  const draw = () => {
    const cols = Number(getComputedStyle(document.documentElement).getPropertyValue('--grid-columns').trim()) || 4;
    output.textContent = String(cols);
    render(grid, Array.from({ length: cols }, (_, i) => el('div', {}, String(i + 1))));
  };

  draw();
  window.addEventListener('resize', draw, { passive: true });
}

/* ---------------------------------------------------------------------------
   ICONS — enumerate the sprite itself rather than a hand-kept list, so the
   guide can never fall out of sync with the file.
   ------------------------------------------------------------------------ */
async function renderIcons() {
  const target = qs('#sg-icons');
  try {
    const markup = await (await fetch('assets/icons/sprite.svg')).text();
    const ids = Array.from(markup.matchAll(/<symbol id="([^"]+)"/g)).map((m) => m[1]);
    render(target, ids.map((id) => el('div', { class: 'sg-icon-cell' }, [
      icon(id, { size: 'lg' }),
      el('code', {}, id.replace(/^no-/, '')),
    ])));
  } catch {
    render(target, el('p', { class: 't-caption' },
      'Icon list needs the page served over http:// — open it with a local server.'));
  }
}

/* ---------------------------------------------------------------------------
   COMPONENT DEMOS
   ------------------------------------------------------------------------ */
/* Flight results come from the development supplier, the same one the search
   page uses without a live supplier (its offers, without the simulated delay). */
const pad = (n) => String(n).padStart(2, '0');
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
let flightOffers = null;
const sampleFlights = () => (flightOffers ??= devOffers(toSearchRequest({
  service: 'flights', tripType: 'oneway', origin: 'KRT', destination: 'JED',
  dates: { depart: inDays(30) }, travellers: { adults: 2, children: 1, infants: 0 }, cabin: 'economy',
}).request));
const flightCards = (offers, count) => {
  const labels = labelOffers(offers);
  return sortOffers(offers, 'recommended').slice(0, count).map((o) => flightResultCard(o, { labels: labels.get(o.id) ?? [], party: 3 }));
};
const skeletons = (count) => el('div', { class: 'l-stack l-stack--16' }, Array.from({ length: count }, skeletonCard));

function renderComponents() {
  render(qs('#sg-services'), el('div', { class: 'l-auto-grid', style: '--min-col:18rem' }, featuredServices().map((s) => serviceCard(s))));
  render(qs('#sg-flights'), flightCards(sampleFlights(), 3));
  render(qs('#sg-mixed'), [
    destinationCard(HOME_DESTINATIONS[0]),
    offerCard(HOME_OFFERS[0]),
    supervisorCard(SUPERVISOR_REGISTRY.find((s) => s.status === 'active') ?? SUPERVISOR_REGISTRY[0]),
    tripCard(TRIPS[0]),
  ]);
  render(qs('#sg-status'), Object.keys(STATUSES).map(statusBadge));

  render(qs('#sg-search'), searchWidget({
    onSubmit: (vertical) => toast({
      variant: 'info',
      title: getLocale() === 'ar' ? 'تم إرسال البحث' : 'Search submitted',
      text: `vertical: ${vertical}`,
    }),
  }));
}

/* ---------------------------------------------------------------------------
   STATE MACHINE DEMO
   ------------------------------------------------------------------------ */
let showState = null;

/** Binds the demo buttons exactly once. Safe to call again — it will not
    stack a second set of listeners on a language change. */
/* The header is the live component, not a mock of it: the style guide gets the
   same one every page gets, so it cannot drift. §33 of Stage 10.1 */
function mountHeaders() {
  // mountHeader destroys the previous instance (listeners included) before
  // rendering the new one; replaceChildren() alone would leak them.
  mountHeader({ target: qs('#sg-header'), current: 'home' });

  // A second instance in the booking variant, shown inline rather than stuck.
  const b = mountHeader({ target: qs('#sg-booking-header'), variant: 'booking' });
  b.style.position = 'static';
}

function mountFooters() {
  for (const [sel, variant] of [['#sg-footer', 'marketing'],
                                ['#sg-footer-booking', 'booking'],
                                ['#sg-footer-app', 'app']]) {
    const host = qs(sel);
    if (!host) continue;
    host.replaceChildren(globalFooter({ variant }));
  }
}

function wireAuthToggle() {
  qs('#sg-auth')?.addEventListener('click', () => {
    const on = getSession().authenticated;
    setSession(on
      ? { authenticated: false, name: '', role: 'guest' }
      : { authenticated: true, name: 'أحمد عبد الرحمن', role: 'customer' });
  });
}

function wireStates() {
  if (showState) return showState;

  const region = stateRegion(qs('#sg-state-region'), { minHeight: '18rem' });

  showState = (which) => {
    if (which === 'loading') region.loading();
    else if (which === 'skeleton') region.loading(() => skeletons(2));
    else if (which === 'content') region.content(flightCards(sampleFlights(), 1));
    else if (which === 'empty') region.empty();
    else if (which === 'error') region.error();
  };

  qsa('[data-state-demo]').forEach((button) => {
    button.addEventListener('click', () => showState(button.dataset.stateDemo));
  });

  showState('content');
  return showState;
}

/* ---------------------------------------------------------------------------
   BUTTON LIFECYCLE DEMO — idle → loading → success → idle
   ------------------------------------------------------------------------ */
function wireButtonDemo() {
  const button = qs('#sg-btn-demo');
  button?.addEventListener('click', () => {
    setButtonState(button, 'loading');
    setTimeout(() => {
      setButtonState(button, 'success');
      setTimeout(() => setButtonState(button, 'idle'), 1600);
    }, 1400);
  });

  qsa('[data-toast]').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const variant = trigger.dataset.toast;
      toast(variant === 'success'
        ? { variant: 'success', title: getLocale() === 'ar' ? 'تم تأكيد الحجز' : 'Booking confirmed',
            text: getLocale() === 'ar' ? 'أرسلنا التذكرة إلى بريدك.' : 'We have sent the ticket to your email.' }
        : { variant: 'error', title: getLocale() === 'ar' ? 'تعذّر إتمام الدفع' : 'Payment did not go through',
            text: getLocale() === 'ar' ? 'لم يُخصم أي مبلغ. جرّب بطاقة أخرى.' : 'Nothing was charged. Try another card.' });
    });
  });
}

/* ---------------------------------------------------------------------------
   BOOT
   Everything data-driven re-renders on a language change, which is the real
   test of §06: the same code produces both directions.
   ------------------------------------------------------------------------ */
boot({
  sprite: 'assets/icons/sprite.svg',
  onLocale: () => {
    mountHeaders();
    mountFooters();
    renderComponents();
    wireStates()('content');
  },
}).then(() => { initOtp(); initUploads(); });

mountHeaders();
mountFooters();
wireAuthToggle();
renderSwatches();
renderSpacing();
renderGrid();
renderIcons();
renderComponents();
wireStates();
wireButtonDemo();
applyTranslations();

/* The style guide is also the place where a regression in the token contract
   should be loud, so check that every required §04 token actually resolves. */
(() => {
  const styles = getComputedStyle(document.documentElement);
  const missing = SWATCHES.map(([token]) => token).filter((token) => !styles.getPropertyValue(token).trim());
  if (missing.length) console.error('[no] Missing required colour tokens (§04):', missing);
})();
