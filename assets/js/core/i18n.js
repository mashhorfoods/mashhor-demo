/* ============================================================================
   CORE / I18N + DIRECTION — §06

   Arabic is the default. Switching language switches direction, and because
   every stylesheet in this system uses logical properties, nothing else has
   to change: no mirrored stylesheet, no per-component RTL branch.

   Strings live here rather than in components so that a component is never
   the thing that has to be translated. §27
   ========================================================================= */

export const LOCALES = {
  ar: { code: 'ar', dir: 'rtl', name: 'العربية', htmlLang: 'ar', intl: 'ar-EG' },
  en: { code: 'en', dir: 'ltr', name: 'English', htmlLang: 'en', intl: 'en-GB' },
};

const STORAGE_KEY = 'no.locale';

import ar from './strings/ar.js';

/* Arabic ships with the page; English arrives the first time it is asked
   for (or before first paint when it is the saved choice), so the default
   language never pays for the other. */
const STRINGS = { ar, en: null };
const LOADERS = { en: () => import('./strings/en.js') };
async function ensureStrings(code) {
  if (!STRINGS[code] && LOADERS[code]) STRINGS[code] = (await LOADERS[code]()).default;
}

let current = 'ar';
const listeners = new Set();

/** Translate. Values may be functions for pluralisation/interpolation. */
export function t(key, ...args) {
  const table = STRINGS[current] ?? STRINGS.ar;
  const value = table[key] ?? STRINGS.ar[key] ?? key;
  return typeof value === 'function' ? value(...args) : value;
}

/**
 * Pick the right field for the current language out of a DATA record.
 *
 * `t()` is for interface strings the system owns; this is for content a
 * booking engine or an admin supplies, where the two languages sit on one
 * object. It accepts both shapes we use:
 *
 *   pick(hotel, 'name')   ->  hotel.nameAr   | hotel.nameEn
 *   pick(pkg.imageAlt)    ->  imageAlt.ar    | imageAlt.en
 *
 * It falls back rather than rendering `undefined`: a record that has only
 * been translated one way still shows something. §27
 */
export const pick = (obj, base) => {
  const isAr = current === 'ar';
  if (obj == null) return '';
  if (typeof obj === 'object' && !base) return obj[isAr ? 'ar' : 'en'] ?? obj.ar ?? '';
  return isAr
    ? (obj[`${base}Ar`] ?? obj[base] ?? '')
    : (obj[`${base}En`] ?? obj[base] ?? obj[`${base}Ar`] ?? '');
};

export const getLocale = () => current;

/** Set the language AND the direction of the document in one move. Resolves
    once the strings are loaded and every listener has re-rendered. */
export async function setLocale(code) {
  if (!LOCALES[code]) return;
  await ensureStrings(code);
  current = code;
  const locale = LOCALES[code];

  document.documentElement.lang = locale.htmlLang;
  document.documentElement.dir = locale.dir;

  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode */ }

  listeners.forEach((fn) => fn(code));
  document.dispatchEvent(new CustomEvent('no:localechange', { detail: { locale: code, dir: locale.dir } }));
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Restore the visitor's choice, else follow the document, else Arabic. */
export async function initLocale() {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  const fromDoc = document.documentElement.lang?.startsWith('en') ? 'en' : 'ar';
  await setLocale(saved && LOCALES[saved] ? saved : fromDoc);
}

/** Apply translations to any element carrying data-i18n. */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nLabel));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });
  // <meta name="description" data-i18n-content="…"> — the one head string a
  // language switch would otherwise leave behind.
  root.querySelectorAll('[data-i18n-content]').forEach((node) => {
    node.setAttribute('content', t(node.dataset.i18nContent));
  });
  for (const [attr, key] of [['title', 'i18nTitle'], ['alt', 'i18nAlt'], ['value', 'i18nValue']]) {
    root.querySelectorAll(`[data-${attr === 'title' ? 'i18n-title' : attr === 'alt' ? 'i18n-alt' : 'i18n-value'}]`)
      .forEach((node) => { node.setAttribute(attr, t(node.dataset[key])); if (attr === 'value') node.value = t(node.dataset[key]); });
  }
}
