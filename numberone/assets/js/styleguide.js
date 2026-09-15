/* ============================================================================
   STYLE GUIDE — the demo wiring for styleguide.html.

   This file is documentation infrastructure, not part of the product bundle.
   It renders the data-driven sections of the guide from the same modules a
   real page would use, so the guide cannot drift from the system: if a
   renderer breaks, the guide breaks.
   ========================================================================= */

import {
  boot, el, qs, qsa, render, icon, toast, setButtonState,
  t, getLocale, onLocaleChange, applyTranslations,
  SERVICES, NAV_PRIMARY, STATUSES,
  serviceGrid, flightCard, hotelCard, packageCard, supervisorCard, tripCard, statusBadge,
  searchWidget, stateRegion, stateBlock, skeletonList, skeletonFlight, loadingBlock,
} from './foundation.js';

import { FLIGHTS, HOTELS, PACKAGES, SUPERVISORS, TRIPS } from './data/samples.js';

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
      el('span', { class: 'sg-swatch__name' }, label),
      el('span', { class: 'sg-swatch__hex' }, value.toUpperCase()),
      ratio === null ? null : el('span', {
        class: 'sg-swatch__ratio',
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
function renderComponents() {
  render(qs('#sg-services'), serviceGrid(SERVICES));
  render(qs('#sg-flights'), FLIGHTS.map(flightCard));
  render(qs('#sg-mixed'), [
    hotelCard(HOTELS[0]),
    packageCard(PACKAGES[0]),
    supervisorCard(SUPERVISORS[0]),
    tripCard(TRIPS[0]),
  ]);
  render(qs('#sg-status'), Object.keys(STATUSES).map(statusBadge));

  render(qs('#sg-nav'), NAV_PRIMARY.map((item, i) => el('li', {}, [
    el('a', {
      class: 'c-nav__link', href: item.href,
      ...(i === 0 ? { 'aria-current': 'page' } : {}),
    }, t(item.label)),
  ])));

  render(qs('#sg-drawer-nav'), NAV_PRIMARY.map((item) => el('li', {}, [
    el('a', { class: 'c-nav__link', href: item.href, style: 'inline-size:100%' }, [
      icon(item.icon, { size: 'sm' }), el('span', {}, t(item.label)),
    ]),
  ])));

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
function wireStates() {
  const target = qs('#sg-state-region');
  const region = stateRegion(target, { minHeight: '18rem' });

  const show = (which) => {
    if (which === 'loading') region.loading();
    else if (which === 'skeleton') region.loading(() => skeletonList(2, skeletonFlight));
    else if (which === 'content') region.content(FLIGHTS.slice(0, 1).map(flightCard));
    else if (which === 'empty') region.empty();
    else if (which === 'error') region.error();
  };

  qsa('[data-state-demo]').forEach((button) => {
    button.addEventListener('click', () => show(button.dataset.stateDemo));
  });

  show('content');
  return show;
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
    renderComponents();
    wireStates()('content');
  },
});

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
onLocaleChange(() => applyTranslations());

(() => {
  const styles = getComputedStyle(document.documentElement);
  const missing = SWATCHES.map(([token]) => token).filter((token) => !styles.getPropertyValue(token).trim());
  if (missing.length) console.error('[no] Missing required colour tokens (§04):', missing);
})();
