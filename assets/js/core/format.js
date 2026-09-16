/* ============================================================================
   CORE / FORMAT — locale-aware money, dates, times and durations.

   Presentation only: a component never formats a price itself, so the day the
   booking engine returns a different currency or a different calendar, one
   file changes. §27 / §28
   ========================================================================= */

import { getLocale, LOCALES, t } from './i18n.js';

const intlLocale = () => LOCALES[getLocale()].intl;

/**
 * Booking data carries the ISO currency code; only the presentation layer
 * decides how to WRITE it. Without this, an Arabic page renders "SDG 385,000"
 * — Latin script, and bidi-reordered so the code jumps in front of the number.
 * Add a row here when a new market is switched on; never write a symbol into
 * the data. §27
 */
const CURRENCY_LABELS = {
  SDG: { ar: 'ج.س', en: 'SDG' },
  USD: { ar: 'دولار', en: 'USD' },
  EUR: { ar: 'يورو', en: 'EUR' },
  SAR: { ar: 'ر.س', en: 'SAR' },
  AED: { ar: 'د.إ', en: 'AED' },
  EGP: { ar: 'ج.م', en: 'EGP' },
  TRY: { ar: 'ل.ت', en: 'TRY' },
};

const currencyLabel = (code) => {
  if (!code) return t('currency');
  return CURRENCY_LABELS[code]?.[getLocale()] ?? code;
};

/**
 * Money. Arabic reads better with Western digits for prices in this market,
 * so we force `latn` numerals and keep the currency word from the string
 * table rather than the currency symbol, which is inconsistent for SDG.
 */
export function money(amount, currency) {
  const value = new Intl.NumberFormat(`${intlLocale()}-u-nu-latn`, {
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
  return `${value} ${currencyLabel(currency)}`;
}

export function number(value) {
  return new Intl.NumberFormat(`${intlLocale()}-u-nu-latn`).format(Number(value) || 0);
}

/** "12 Mar" / "١٢ مارس" — short, for cards. */
export function dateShort(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  return new Intl.DateTimeFormat(`${intlLocale()}-u-nu-latn`, { day: 'numeric', month: 'short' }).format(d);
}

/** 24-hour clock, always Western digits: a departure time must never be
    ambiguous, and it is the one number a traveller cannot get wrong. */
export function time(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/** Minutes → "2 س 45 د" / "2h 45m". */
export function duration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const isAr = getLocale() === 'ar';
  const hLabel = isAr ? 'س' : 'h';
  const mLabel = isAr ? 'د' : 'm';
  if (h === 0) return `${m}${mLabel}`;
  if (m === 0) return `${h}${hLabel}`;
  return `${h}${hLabel} ${m}${mLabel}`;
}

/** Whole days between two ISO dates — how many nights a package runs. */
export function nights(fromIso, toIso) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Did the arrival land on a later calendar day than the departure? */
export function dayOffset(departIso, arriveIso) {
  const a = new Date(departIso);
  const b = new Date(arriveIso);
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(b) - day(a)) / 86400000);
}
