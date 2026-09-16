// Stage 10.9 booking entry verification — selector, forms per service, trip
// types + legs, travellers, validation, loading/success/error/empty states,
// help-me-choose, deep links, context persistence, a11y, three widths, both
// directions. Exits 1 on any ✗.
import { shot } from './env.mjs';
import { chromium } from 'playwright';
const ORIGIN = process.env.TEST_ORIGIN + '';
const PAGE = '/mashhor-demo/book/';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let pass = 0, fail = 0;
const ok = (name, cond, note = '') => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name} ${note}`); } };
const errs = [];

async function open(url = PAGE, width = 1440, height = 1000, locale = 'ar') {
  const p = await b.newPage({ viewport: { width, height } });
  p.on('pageerror', e => errs.push(`${url}@${width}/${locale} pageerror: ${e.message}`));
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('boom')) errs.push(`${url}@${width} console: ${m.text()}`); });
  p.on('requestfailed', r => errs.push(`${url}@${width} reqfail: ${r.url()}`));
  p.on('response', r => { if (r.status() >= 400) errs.push(`${url}@${width} HTTP ${r.status()} ${r.url()}`); });
  await p.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  if (locale !== 'ar') { await p.evaluate(async (l) => { const m = await import('./assets/js/foundation.js'); await m.setLocale(l); }, locale); }
  await p.waitForTimeout(600);
  return p;
}
const F = '.c-search__form:not([hidden])';
const fill = (p, name, value) => p.evaluate(([n, v]) => { const c = document.querySelector(`.c-search__form:not([hidden]) [name="${n}"]:not([type=hidden])`); c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); /* a typed place opens the combobox list; a user leaves it */ if (c.getAttribute('role') === 'combobox') c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }, [name, value]);
const submit = async (p) => { await p.click(`${F} button[type=submit]`); await p.waitForTimeout(300); };
const errors = (p) => p.evaluate(() => Array.from(document.querySelectorAll('.c-search__form:not([hidden]) .c-field__error')).map((e) => e.textContent.trim()));

// ---------------------------------------------------------------- structure × widths × locales
for (const [w, h, tag] of [[390, 844, 'mobile'], [834, 1100, 'tablet'], [1440, 1000, 'desktop']]) {
  for (const loc of ['ar', 'en']) {
    const p = await open(PAGE, w, h, loc);
    const r = await p.evaluate(() => {
      const vis = (sel) => Array.from(document.querySelectorAll(sel)).filter((n) => n.checkVisibility());
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter((x) => x.checkVisibility() || x.classList.contains('u-visually-hidden')).map((x) => Number(x.tagName[1]));
      let jumps = 0; for (let i = 1; i < headings.length; i++) if (headings[i] - headings[i - 1] > 1) jumps++;
      const small = Array.from(document.querySelectorAll('main p, main a, main button, main span, main li, main label')).filter((n) => n.checkVisibility() && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 12).length;
      const targets = vis('main a[href], main button').filter((n) => n.getBoundingClientRect().height < 40 && !n.classList.contains('c-btn--tertiary')).map((n) => n.className.split(' ')[0] + ':' + Math.round(n.getBoundingClientRect().height));
      const form = document.querySelector('.c-search__form:not([hidden])');
      const controls = Array.from(form.querySelectorAll('input:not([type=hidden]):not([type=radio]), select, textarea, .c-pax__trigger')).filter((c) => c.checkVisibility());
      const unlabelled = controls.filter((c) => !(c.id && document.querySelector(`label[for="${c.id}"]`)) && !c.getAttribute('aria-label')).map((c) => c.name || c.className);
      const picks = Array.from(document.querySelectorAll('.c-pick'));
      const pickRects = picks.map((c) => c.getBoundingClientRect());
      const cols = new Set(pickRects.map((r) => Math.round(r.left))).size;
      return {
        dir: document.documentElement.dir, lang: document.documentElement.lang, hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        h1: document.querySelectorAll('h1').length, h1Text: document.querySelector('h1').textContent.trim(), jumps, small, targets, title: document.title,
        primaries: vis('.c-btn--primary').map((n) => n.textContent.trim()),
        picks: picks.length, checked: document.querySelector('.c-pick[aria-checked=true]')?.dataset.vertical, cols,
        pickTabbable: picks.filter((c) => c.tabIndex === 0).length, radiogroup: document.querySelector('.c-pick-grid').getAttribute('role'), groupLabel: document.querySelector('.c-pick-grid').getAttribute('aria-label'),
        descsVisible: picks.filter((c) => c.querySelector('.c-pick__desc').checkVisibility()).length,
        tablistHidden: document.querySelector('.c-search__tabs').hidden && !document.querySelector('.c-search__tabs').checkVisibility(),
        form: form.dataset.vertical, unlabelled,
        visibleFields: Array.from(form.querySelectorAll('.c-search__panel > .c-search__fields > .c-field')).filter((f) => f.checkVisibility()).map((f) => f.dataset.field ?? 'tripType'),
        legsHidden: !form.querySelector('.c-legs').checkVisibility(), legInputsDisabled: Array.from(form.querySelectorAll('[name=legFrom]')).every((i) => i.disabled),
        tripDefault: form.querySelector('[name=tripType]:checked')?.value, cabinOptions: Array.from(form.querySelectorAll('[name=cabin] option')).map((o) => o.value),
        pax: form.querySelector('.c-pax__trigger').textContent.trim(),
        caption: document.querySelector('[data-booking=caption]').textContent.trim(),
        status: document.querySelectorAll('.c-book__status').length,
        help: document.querySelector('[aria-controls=book-help]')?.textContent.trim(), helpHidden: document.querySelector('#book-help').hidden,
        trust: Array.from(document.querySelectorAll('.c-book__aside .c-trust-item')).map((n) => n.textContent.trim()),
        asideLabel: document.querySelector('.c-book__aside').getAttribute('aria-label'),
        placeholders: document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"], a[href^="mailto:"]').length + (/\+249|wa\.me|XXXX/.test(document.body.innerText) ? 1 : 0),
        numbers: /\d{3,}\s?(ج\.س|SDG|USD|\$)|خصم|%/.test(document.querySelector('main').innerText),
        headerVariant: document.querySelector('header')?.dataset.variant, headerPrimary: Array.from(document.querySelectorAll('header .c-btn--primary')).filter((n) => n.checkVisibility()).length,
        footerVariant: document.querySelector('footer')?.dataset.variant, footerPrimary: document.querySelectorAll('footer .c-btn--primary').length,
        bottomCurrent: document.querySelector('.c-bottom-nav [aria-current=page]')?.textContent.trim(), bottomVisible: document.querySelector('.c-bottom-nav').checkVisibility(),
        skip: !!document.querySelector('[data-skip]'), canonical: document.querySelector('link[rel=canonical]').href,
        logical: !Array.from(document.styleSheets).some((s) => { try { return Array.from(s.cssRules).some((r) => /margin-left|margin-right|padding-left|padding-right|\bleft:|\bright:/.test(r.cssText) && r.cssText.includes('c-book')); } catch { return false; } }),
      };
    });
    const T = `${tag}/${loc}`;
    ok(`${T} direction/lang`, r.dir === (loc === 'ar' ? 'rtl' : 'ltr') && r.lang === loc);
    ok(`${T} no horizontal scroll`, !r.hScroll);
    ok(`${T} one h1, no heading jumps`, r.h1 === 1 && r.jumps === 0, `${r.h1}/${r.jumps}`);
    ok(`${T} h1 text`, r.h1Text === (loc === 'ar' ? 'أريد أن أحجز… ماذا؟' : 'What would you like to book?'), r.h1Text);
    ok(`${T} title`, r.title === (loc === 'ar' ? 'ابدأ الحجز — نمبرون للسفر و السياحة' : 'Start booking — Number One Travel & Tourism'), r.title);
    ok(`${T} nothing under 12px`, r.small === 0, `${r.small}`);
    ok(`${T} touch targets ≥ 40px`, r.targets.length === 0, r.targets.join(','));
    ok(`${T} exactly one primary CTA = search flights`, r.primaries.length === 1 && r.primaries[0] === (loc === 'ar' ? 'ابحث عن الرحلات' : 'Search Flights'), r.primaries.join('|'));
    ok(`${T} header booking variant, no red header action`, r.headerVariant === 'booking' && r.headerPrimary === 0, `${r.headerVariant}/${r.headerPrimary}`);
    ok(`${T} footer booking variant, no red footer action`, r.footerVariant === 'booking' && r.footerPrimary === 0, `${r.footerVariant}/${r.footerPrimary}`);
    ok(`${T} 8 service cards, flights selected, radiogroup`, r.picks === 8 && r.checked === 'flights' && r.radiogroup === 'radiogroup' && r.pickTabbable === 1 && r.groupLabel, `${r.picks}/${r.checked}/${r.radiogroup}/${r.pickTabbable}`);
    ok(`${T} card columns`, r.cols === (w < 768 ? 2 : 4), `${r.cols}`);
    ok(`${T} card descriptions ${w < 768 ? 'hidden' : 'shown'}`, r.descsVisible === (w < 768 ? 0 : 8), `${r.descsVisible}`);
    ok(`${T} tab strip hidden (selector drives the form)`, r.tablistHidden);
    ok(`${T} flights form: round trip default, legs hidden+disabled, first cabin`, r.form === 'flights' && r.tripDefault === 'return' && r.legsHidden && r.legInputsDisabled && r.cabinOptions.includes('first'), JSON.stringify([r.form, r.tripDefault, r.legsHidden, r.legInputsDisabled, r.cabinOptions]));
    ok(`${T} visible fields = tripType from to depart return pax cabin`, r.visibleFields.join(',') === 'tripType,from,to,depart,return,pax,cabin', r.visibleFields.join(','));
    ok(`${T} every visible control labelled`, r.unlabelled.length === 0, r.unlabelled.join(','));
    ok(`${T} travellers summary defaults to one adult`, r.pax === (loc === 'ar' ? 'بالغ واحد' : '1 adult'), r.pax);
    ok(`${T} caption for flights`, r.caption.length > 10 && (loc === 'ar' ? /من وإلى أين/.test(r.caption) : /Where from/.test(r.caption)), r.caption);
    ok(`${T} one status line`, r.status === 1, `${r.status}`);
    ok(`${T} help-me-choose secondary, collapsed`, r.help === (loc === 'ar' ? 'ساعدني في اختيار الرحلة' : 'Help Me Choose') && r.helpHidden, `${r.help}/${r.helpHidden}`);
    ok(`${T} trust: 4 verified items`, r.trust.length === 4 && (loc === 'ar' ? r.trust.join('|') === 'أسعار واضحة|حجز موثوق|دعم بشري|إدارة رحلتك بسهولة' : r.trust.join('|') === 'Clear prices|Reliable booking|Human support|Manage your trip with ease') && r.asideLabel, r.trust.join('|'));
    ok(`${T} no placeholder contacts, no invented numbers`, r.placeholders === 0 && !r.numbers);
    ok(`${T} bottom nav marks book current`, r.bottomVisible ? r.bottomCurrent === (loc === 'ar' ? 'احجز' : 'Book') : true, `${r.bottomCurrent}`);
    ok(`${T} skip link + canonical`, r.skip && r.canonical.endsWith('/mashhor-demo/book/'));
    ok(`${T} no physical CSS in booking rules`, r.logical);
    await p.screenshot({ path: shot(`book-${tag}-${loc}.png`), fullPage: true });
    await p.close();
  }
}

// ---------------------------------------------------------------- selector + per-service forms (ar)
{
  const p = await open();
  const expect = {
    hotels: ['destination', 'checkin', 'checkout', 'guests', 'rooms'], packages: ['destination', 'depart', 'pax'],
    visa: ['nationality', 'country', 'depart'], umrah: ['depart', 'nights', 'pax'], medical: ['country', 'depart', 'pax'],
    transport: ['from', 'to', 'depart', 'pax'], other: ['service', 'depart', 'notes'],
  };
  for (const [id, fields] of Object.entries(expect)) {
    await p.click(`.c-pick[data-vertical="${id}"]`);
    const r = await p.evaluate(() => {
      const form = document.querySelector('.c-search__form:not([hidden])');
      return { form: form.dataset.vertical, checked: document.querySelector('.c-pick[aria-checked=true]').dataset.vertical,
        fields: Array.from(form.querySelectorAll('.c-search__fields > .c-field')).filter((f) => f.checkVisibility()).map((f) => f.dataset.field),
        primary: Array.from(document.querySelectorAll('.c-btn--primary')).filter((n) => n.checkVisibility()).map((n) => n.textContent.trim()),
        caption: document.querySelector('[data-booking=caption]').textContent.trim() };
    });
    ok(`select ${id}: form + card + fields`, r.form === id && r.checked === id && r.fields.join(',') === fields.join(','), `${r.form}/${r.checked}/${r.fields}`);
    ok(`select ${id}: one primary CTA, caption set`, r.primary.length === 1 && r.caption.length > 5, `${r.primary}/${r.caption}`);
  }
  // hotels: rooms options 1..4, pax label "guests"
  await p.click('.c-pick[data-vertical="hotels"]');
  let r = await p.evaluate(() => ({ rooms: Array.from(document.querySelectorAll(`${'.c-search__form:not([hidden])'} [name=rooms] option`)).map((o) => o.value).join(','), roomsDefault: document.querySelector('.c-search__form:not([hidden]) [name=rooms]').value, cta: document.querySelector('.c-search__form:not([hidden]) button[type=submit]').textContent.trim() }));
  ok('hotels: rooms 1–4 default 1', r.rooms === '1,2,3,4' && r.roomsDefault === '1', `${r.rooms}/${r.roomsDefault}`);
  // request-type verticals use the request CTA
  await p.click('.c-pick[data-vertical="visa"]');
  r = await p.evaluate(() => document.querySelector('.c-search__form:not([hidden]) button[type=submit]').textContent.trim());
  ok('visa: request CTA', r === 'اطلب عرضاً', r);

  // keyboard: arrows move the selection (RTL: ArrowLeft = next)
  await p.focus('.c-pick[aria-checked=true]');
  await p.keyboard.press('ArrowLeft');
  r = await p.evaluate(() => ({ checked: document.querySelector('.c-pick[aria-checked=true]').dataset.vertical, focused: document.activeElement.dataset.vertical, form: document.querySelector('.c-search__form:not([hidden])').dataset.vertical }));
  ok('ArrowLeft (RTL) selects the next service and moves focus', r.checked === 'umrah' && r.focused === 'umrah' && r.form === 'umrah', JSON.stringify(r));
  await p.keyboard.press('ArrowRight');
  r = await p.evaluate(() => document.querySelector('.c-pick[aria-checked=true]').dataset.vertical);
  ok('ArrowRight (RTL) goes back', r === 'visa', r);
  await p.keyboard.press('ArrowUp');
  r = await p.evaluate(() => document.querySelector('.c-pick[aria-checked=true]').dataset.vertical);
  ok('ArrowUp wraps within the group', r === 'packages', r);
  await p.keyboard.press('Home');
  ok('Home key ignored (no crash), selection kept', (await p.evaluate(() => document.querySelector('.c-pick[aria-checked=true]').dataset.vertical)) === 'packages');
  // focus ring on the card
  r = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0; });
  ok('focused service card shows a focus ring', r);
  await p.close();
}

// ---------------------------------------------------------------- trip types + legs + travellers (ar)
{
  const p = await open();
  await p.click(`${F} .c-segmented__option:has([value=oneway])`);
  let r = await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); return { ret: f.querySelector('[data-field=return]').checkVisibility(), retDisabled: f.querySelector('[name=return]').disabled, from: f.querySelector('[data-field=from]').checkVisibility(), legs: f.querySelector('.c-legs').checkVisibility() }; });
  ok('one way hides + disables the return date, keeps from/to', !r.ret && r.retDisabled && r.from && !r.legs, JSON.stringify(r));
  await p.click(`${F} .c-segmented__option:has([value=multi])`);
  r = await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); return { from: f.querySelector('[data-field=from]').checkVisibility(), fromDisabled: f.querySelector('[name=from]').disabled, legs: f.querySelector('.c-legs').checkVisibility(), rows: f.querySelectorAll('.c-legs__row').length, nums: Array.from(f.querySelectorAll('.c-legs__num')).map((n) => n.textContent), removes: f.querySelectorAll('.c-legs__remove').length, addDisabled: f.querySelector('.c-legs__add').disabled, legEnabled: !f.querySelector('[name=legFrom]').disabled }; });
  ok('multi-city shows 2 legs, hides from/to/dates', !r.from && r.fromDisabled && r.legs && r.rows === 2 && r.removes === 0 && !r.addDisabled && r.legEnabled, JSON.stringify(r));
  ok('legs are numbered', r.nums.join('|') === 'الرحلة 1|الرحلة 2', r.nums.join('|'));
  await p.click(`${F} .c-legs__add`); await p.click(`${F} .c-legs__add`);
  r = await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); return { rows: f.querySelectorAll('.c-legs__row').length, removes: f.querySelectorAll('.c-legs__remove').length, addDisabled: f.querySelector('.c-legs__add').disabled, nums: Array.from(f.querySelectorAll('.c-legs__num')).map((n) => n.textContent).join('|') }; });
  ok('add leg up to 4, then add disabled; extra legs removable', r.rows === 4 && r.removes === 2 && r.addDisabled && r.nums === 'الرحلة 1|الرحلة 2|الرحلة 3|الرحلة 4', JSON.stringify(r));
  await p.click(`${F} .c-legs__row[data-leg="3"] .c-legs__remove`);
  r = await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); return { rows: f.querySelectorAll('.c-legs__row').length, nums: Array.from(f.querySelectorAll('.c-legs__num')).map((n) => n.textContent).join('|'), addDisabled: f.querySelector('.c-legs__add').disabled }; });
  ok('remove leg renumbers and re-enables add', r.rows === 3 && r.nums === 'الرحلة 1|الرحلة 2|الرحلة 3' && !r.addDisabled, JSON.stringify(r));
  await p.click(`${F} .c-segmented__option:has([value=return])`);
  r = await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); return { ret: f.querySelector('[data-field=return]').checkVisibility(), legs: f.querySelector('.c-legs').checkVisibility(), legDisabled: f.querySelector('[name=legFrom]').disabled }; });
  ok('back to round trip restores return, hides legs', r.ret && !r.legs && r.legDisabled, JSON.stringify(r));

  // travellers popover
  await p.click(`${F} .c-pax__trigger`); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ open: !document.querySelector('.c-search__form:not([hidden]) .c-popover').hidden, expanded: document.querySelector('.c-search__form:not([hidden]) .c-pax__trigger').getAttribute('aria-expanded'), steppers: document.querySelectorAll('.c-search__form:not([hidden]) .c-stepper-row').length, decDisabled: document.querySelector('.c-search__form:not([hidden]) .c-stepper-row .c-stepper button').disabled }));
  ok('travellers opens a popover with 3 steppers; adults cannot go below 1', r.open && r.expanded === 'true' && r.steppers === 3 && r.decDisabled, JSON.stringify(r));
  const step = async (row, dir, n = 1) => { for (let i = 0; i < n; i++) await p.click(`${F} .c-stepper-row:nth-of-type(${row}) .c-stepper button:${dir === '+' ? 'last-child' : 'first-child'}`); };
  await step(1, '+'); await step(2, '+'); await step(3, '+');
  r = await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); return { summary: f.querySelector('.c-pax__trigger').textContent.trim(), hidden: ['adults', 'children', 'infants'].map((k) => f.querySelector(`[name=${k}]`).value).join(','), note: f.querySelector('.c-pax__note').textContent }; });
  ok('family summary 2 adults · 1 child · 1 infant, hidden inputs carry counts', r.summary === 'بالغان · طفل واحد · رضيع واحد' && r.hidden === '2,1,1' && r.note === '', JSON.stringify(r));
  await step(3, '+', 2);
  r = await p.evaluate(() => document.querySelector('.c-search__form:not([hidden]) .c-pax__note').textContent);
  ok('infants > adults shows the companion note', r === 'كل رضيع يحتاج إلى بالغ يرافقه.', r);
  await step(3, '-', 3); await step(1, '+', 5); await step(2, '+', 2);
  r = await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); return { note: f.querySelector('.c-pax__note').textContent, summary: f.querySelector('.c-pax__trigger').textContent.trim() }; });
  ok('9 travellers shows the maximum note', /9/.test(r.note) && r.summary === '7 بالغين · 3 أطفال', JSON.stringify(r));
  await p.click(`${F} [data-popover-close]`); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ open: !document.querySelector('.c-search__form:not([hidden]) .c-popover').hidden, focused: document.activeElement.classList.contains('c-pax__trigger') }));
  ok('done closes the popover and returns focus', !r.open && r.focused, JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- validation (ar)
{
  const p = await open();
  await submit(p);
  let r = await p.evaluate(() => ({ errors: Array.from(document.querySelectorAll('.c-search__form:not([hidden]) .c-field__error')).map((e) => e.textContent.trim()), invalid: document.querySelectorAll('.c-search__form:not([hidden]) [aria-invalid=true]').length, focused: document.activeElement.name, status: document.querySelector('.c-book__status').textContent, tone: document.querySelector('.c-book__status').dataset.tone, alerts: document.querySelectorAll('.c-search__form:not([hidden]) [role=alert]').length, described: Array.from(document.querySelectorAll('.c-search__form:not([hidden]) [aria-invalid=true]')).every((c) => document.getElementById(c.getAttribute('aria-describedby'))), url: location.pathname, summary: !!document.querySelector('.c-summary') }));
  ok('empty flights submit: 4 messages (origin, destination, departure, return)', r.errors.join('|') === 'أدخل مدينة المغادرة.|أدخل الوجهة.|اختر تاريخ المغادرة.|اختر تاريخ العودة، أو اختر «ذهاب فقط».' && r.invalid === 4 && r.alerts === 4 && r.described, JSON.stringify(r.errors));
  ok('focus goes to the first invalid field; status explains; no navigation, no summary', r.focused === 'from' && /4/.test(r.status) && r.tone === 'error' && r.url.endsWith('/book/') && !r.summary, JSON.stringify([r.focused, r.status, r.tone]));
  await fill(p, 'from', 'الخرطوم'); await fill(p, 'to', 'الخرطوم'); await fill(p, 'depart', '2026-12-10'); await fill(p, 'return', '2026-12-01');
  await submit(p);
  r = await errors(p);
  ok('same city + return before departure', r.join('|') === 'الوجهة يجب أن تختلف عن مدينة المغادرة.|تاريخ العودة يجب أن يكون بعد تاريخ المغادرة.', r.join('|'));
  ok('previous errors cleared on resubmit', r.length === 2 && (await p.evaluate(() => document.querySelectorAll('.c-search__form:not([hidden]) [aria-invalid=true]').length)) === 2);
  // one way: return not required
  await p.click(`${F} .c-segmented__option:has([value=oneway])`);
  await fill(p, 'to', 'دبي');
  await submit(p);
  r = await errors(p);
  ok('one way with valid fields: no errors', r.length === 0, r.join('|'));
  await p.waitForTimeout(400);
  // multi-city
  await p.evaluate(() => window.no.booking.region.content(window.no.booking.widget));
  await p.click(`${F} .c-segmented__option:has([value=multi])`);
  await submit(p);
  r = await p.evaluate(() => Array.from(document.querySelectorAll('.c-search__form:not([hidden]) .c-field__error')).map((e) => e.closest('.c-legs__row')?.dataset.leg + ':' + e.textContent.trim()));
  ok('multi-city empty: each leg reports origin, destination, date', r.join('|') === '1:أدخل مدينة المغادرة.|1:أدخل الوجهة.|1:اختر تاريخ المغادرة.|2:أدخل مدينة المغادرة.|2:أدخل الوجهة.|2:اختر تاريخ المغادرة.', r.join('|'));
  ok('focus on first leg origin', (await p.evaluate(() => document.activeElement.name + ':' + document.activeElement.closest('.c-legs__row')?.dataset.leg)) === 'legFrom:1');
  await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); const set = (sel, v) => f.querySelectorAll(sel).forEach((c, i) => { c.value = Array.isArray(v) ? v[i] : v; }); set('[name=legFrom]', ['الخرطوم', 'دبي']); set('[name=legTo]', ['دبي', 'إسطنبول']); set('[name=legDate]', ['2026-12-10', '2026-12-05']); });
  await submit(p);
  r = await p.evaluate(() => Array.from(document.querySelectorAll('.c-search__form:not([hidden]) .c-field__error')).map((e) => e.closest('.c-legs__row')?.dataset.leg + ':' + e.textContent.trim()));
  ok('multi-city leg dates must ascend', r.join('|') === '2:تاريخ هذه الرحلة يجب أن يكون بعد الرحلة السابقة.', r.join('|'));
  // hotels
  await p.click('.c-pick[data-vertical="hotels"]');
  await submit(p);
  r = await errors(p);
  ok('hotels empty: destination, check-in, check-out', r.join('|') === 'أدخل الوجهة.|اختر تاريخ الوصول.|اختر تاريخ المغادرة.', r.join('|'));
  await fill(p, 'destination', 'دبي'); await fill(p, 'checkin', '2026-12-10'); await fill(p, 'checkout', '2026-12-10');
  await submit(p);
  r = await errors(p);
  ok('hotels: check-out must be after check-in', r.join('|') === 'تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول.', r.join('|'));
  // travellers combination via the QA seam
  await p.click('.c-pick[data-vertical="transport"]');
  await fill(p, 'from', 'الخرطوم'); await fill(p, 'to', 'المطار'); await fill(p, 'depart', '2026-12-10');
  await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); f.querySelector('[name=adults]').value = '1'; f.querySelector('[name=infants]').value = '2'; });
  await submit(p);
  r = await p.evaluate(() => ({ errors: Array.from(document.querySelectorAll('.c-search__form:not([hidden]) .c-field__error')).map((e) => e.textContent.trim()), trigger: document.querySelector('.c-search__form:not([hidden]) .c-pax__trigger').getAttribute('aria-invalid'), focused: document.activeElement.classList.contains('c-pax__trigger') }));
  ok('invalid traveller combination marks the travellers control', r.errors.join('|') === 'كل رضيع يحتاج إلى بالغ يرافقه.' && r.trigger === 'true' && r.focused, JSON.stringify(r));
  await p.evaluate(() => { const f = document.querySelector('.c-search__form:not([hidden])'); f.querySelector('[name=adults]').value = '0'; f.querySelector('[name=infants]').value = '0'; f.querySelector('[name=children]').value = '10'; });
  await submit(p);
  r = await errors(p);
  ok('no adult + over the maximum read as one line on the travellers control', r.join('|') === 'يلزم بالغ واحد على الأقل. الحد الأقصى 9 مسافرين في حجز واحد.', r.join('|'));
  await p.close();
}

// ---------------------------------------------------------------- success → context → continue; loading; edit; error; empty (ar, then en)
for (const loc of ['ar', 'en']) {
  const p = await open(PAGE, 1440, 1000, loc);
  // slow prepare so the loading state is observable
  await p.evaluate(async () => {
    const m = await import('./assets/js/foundation.js');
    window.no.booking = m.mountBooking({ prepare: async (ctx) => { await new Promise((r) => setTimeout(r, 500)); m.saveContext(ctx); return ctx; } });
    sessionStorage.clear();
  });
  await p.waitForTimeout(300);
  // help me choose: open, pick priority, go → panel closes, focus lands in the form
  await p.click('[aria-controls=book-help]');
  let r = await p.evaluate(() => ({ hidden: document.querySelector('#book-help').hidden, expanded: document.querySelector('[aria-controls=book-help]').getAttribute('aria-expanded'), options: document.querySelectorAll('#book-help .c-choose__option').length, focusInside: document.querySelector('#book-help').contains(document.activeElement) }));
  ok(`${loc} help-me-choose opens with priority options, focus inside`, !r.hidden && r.expanded === 'true' && r.options >= 3 && r.focusInside, JSON.stringify(r));
  await p.click('#book-help .c-choose__option[data-sort="stops"]');
  await p.click('#book-help .c-choose .c-btn--secondary-brand');
  await p.waitForTimeout(500);
  r = await p.evaluate(() => ({ hidden: document.querySelector('#book-help').hidden, expanded: document.querySelector('[aria-controls=book-help]').getAttribute('aria-expanded'), focused: document.activeElement.name }));
  ok(`${loc} go closes the panel and focuses the form`, r.hidden && r.expanded === 'false' && r.focused === 'from', JSON.stringify(r));

  await fill(p, 'from', loc === 'ar' ? 'الخرطوم' : 'Khartoum'); await fill(p, 'to', loc === 'ar' ? 'دبي' : 'Dubai'); await fill(p, 'depart', '2026-12-10'); await fill(p, 'return', '2026-12-20');
  await p.evaluate(() => { document.querySelector('.c-search__form:not([hidden]) [name=cabin]').value = 'business'; });
  await p.click(`${F} button[type=submit]`);
  await p.waitForTimeout(120);
  r = await p.evaluate(() => ({ busy: document.querySelector('.c-search__form:not([hidden]) button[type=submit]')?.getAttribute('aria-busy'), status: document.querySelector('.c-book__status').textContent, live: document.querySelector('.c-book__status').getAttribute('aria-live') }));
  ok(`${loc} loading: button busy, status "${loc === 'ar' ? 'جاري تجهيز البحث...' : 'Preparing your search...'}"`, r.busy === 'true' && r.status === (loc === 'ar' ? 'جاري تجهيز البحث...' : 'Preparing your search...') && r.live === 'polite', JSON.stringify(r));
  await p.waitForTimeout(800);
  r = await p.evaluate(() => {
    const s = document.querySelector('.c-summary');
    const rows = Object.fromEntries(Array.from(s.querySelectorAll('.c-summary__row')).map((row) => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
    const ctx = JSON.parse(sessionStorage.getItem('no.booking.context'));
    return { role: s.getAttribute('role'), title: s.querySelector('.c-summary__title').textContent, rows, href: s.querySelector('a.c-btn--primary').getAttribute('href'),
      primaries: Array.from(document.querySelectorAll('.c-btn--primary')).filter((n) => n.checkVisibility()).length, formVisible: !!document.querySelector('.c-search')?.isConnected,
      status: document.querySelector('.c-book__status').textContent, ctx, same: window.no.booking.context?.createdAt === ctx.createdAt };
  });
  ok(`${loc} success: summary status card with title`, r.role === 'status' && r.title === (loc === 'ar' ? 'طلبك جاهز' : 'Your request is ready'), r.title);
  const L = loc === 'ar' ? { service: 'الخدمة', trip: 'نوع الرحلة', route: 'المسار', dates: 'التواريخ', trav: 'المسافرون', cabin: 'درجة السفر', prio: 'الأولوية' } : { service: 'Service', trip: 'Trip type', route: 'Route', dates: 'Dates', trav: 'Travellers', cabin: 'Cabin', prio: 'Priority' };
  ok(`${loc} summary rows: service, trip type, route, dates, travellers, cabin, priority`, r.rows[L.service] === (loc === 'ar' ? 'طيران' : 'Flights') && r.rows[L.trip] === (loc === 'ar' ? 'ذهاب وعودة' : 'Round trip') && /الخرطوم|Khartoum/.test(r.rows[L.route]) && /دبي|Dubai/.test(r.rows[L.route]) && r.rows[L.dates].includes('–') && r.rows[L.trav] === (loc === 'ar' ? 'بالغ واحد' : '1 adult') && /رجال الأعمال|Business/.test(r.rows[L.cabin]) && r.rows[L.prio], JSON.stringify(r.rows));
  ok(`${loc} form replaced by summary; still one primary CTA (continue)`, !r.formVisible && r.primaries === 1 && r.status === '', `${r.formVisible}/${r.primaries}/${r.status}`);
  ok(`${loc} continue → search/ with the context as query`, /\/mashhor-demo\/search\/\?vertical=flights&tripType=return&from=.+&to=.+&depart=2026-12-10&return=2026-12-20&adults=1&cabin=business&sort=stops&locale=/.test(r.href), r.href);
  ok(`${loc} context persisted in sessionStorage and exposed`, r.ctx && r.ctx.version === 1 && r.ctx.service === 'flights' && r.ctx.tripType === 'return' && r.ctx.dates.return === '2026-12-20' && r.ctx.travellers.adults === 1 && r.ctx.cabin === 'business' && r.ctx.options.sort === 'stops' && r.ctx.locale === loc && r.same, JSON.stringify(r.ctx));
  // edit → form back with values
  await p.click('.c-summary .c-btn--tertiary'); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ form: !!document.querySelector('.c-search__form:not([hidden])'), from: document.querySelector('.c-search__form:not([hidden]) [name=from]').value, focused: document.activeElement.name, summary: !!document.querySelector('.c-summary') }));
  ok(`${loc} edit restores the form with values, focus in it`, r.form && r.from.length > 2 && r.focused === 'from' && !r.summary, JSON.stringify(r));

  // error state: prepare throws
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); window.no.booking = m.mountBooking({ prepare: async () => { throw new Error('boom'); } }); });
  await p.waitForTimeout(200);
  await fill(p, 'from', 'A'); await fill(p, 'to', 'B'); await fill(p, 'depart', '2026-12-10'); await fill(p, 'return', '2026-12-20');
  await submit(p); await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ state: document.querySelector('[data-booking=form] .c-state')?.dataset.variant ?? document.querySelector('[data-booking=form] .c-state')?.className, text: document.querySelector('[data-booking=form]').innerText, status: document.querySelector('.c-book__status').textContent, tone: document.querySelector('.c-book__status').dataset.tone, retry: !!document.querySelector('[data-booking=form] .c-btn--primary'), primaries: Array.from(document.querySelectorAll('.c-btn--primary')).filter((n) => n.checkVisibility()).length, busy: document.querySelectorAll('[aria-busy=true] button, button[aria-busy=true]').length }));
  const errText = loc === 'ar' ? 'تعذر تجهيز البحث. يرجى مراجعة البيانات والمحاولة مرة أخرى.' : 'We could not prepare the search. Please check the details and try again.';
  ok(`${loc} error state: message, retry, one primary, nothing busy`, r.text.includes(errText) && r.status === errText && r.tone === 'error' && r.retry && r.primaries === 1 && r.busy === 0, JSON.stringify([r.status, r.retry, r.primaries, r.busy]));
  await p.click('[data-booking=form] .c-btn--primary'); await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ form: !!document.querySelector('.c-search__form:not([hidden])'), from: document.querySelector('.c-search__form:not([hidden]) [name=from]')?.value }));
  ok(`${loc} retry brings the form back with the values`, r.form && r.from === 'A', JSON.stringify(r));
  // empty + loading states via the QA handle
  await p.evaluate(() => window.no.booking.region.empty());
  r = await p.evaluate(() => document.querySelector('[data-booking=form]').innerText);
  ok(`${loc} empty state`, r.includes(loc === 'ar' ? 'لا توجد خدمة محددة' : 'No service selected'), r.slice(0, 60));
  await p.evaluate(() => window.no.booking.region.loading());
  r = await p.evaluate(() => ({ sk: document.querySelectorAll('[data-booking=form] .c-skeleton').length, busy: document.querySelector('[data-booking=form]').getAttribute('aria-busy') }));
  ok(`${loc} loading skeleton`, r.sk >= 4 && r.busy === 'true', JSON.stringify(r));
  await p.close();
}

// ---------------------------------------------------------------- deep links
{
  let p = await open(PAGE + '?vertical=hotels&to=dubai');
  let r = await p.evaluate(() => ({ checked: document.querySelector('.c-pick[aria-checked=true]').dataset.vertical, form: document.querySelector('.c-search__form:not([hidden])').dataset.vertical, dest: document.querySelector('.c-search__form:not([hidden]) [name=destination]').value, focused: document.activeElement.tagName, primaries: Array.from(document.querySelectorAll('.c-btn--primary')).filter((n) => n.checkVisibility()).length }));
  ok('?vertical=hotels&to=dubai selects hotels, prefills the destination, focuses the form', r.checked === 'hotels' && r.form === 'hotels' && r.dest === 'دبي' && r.focused === 'INPUT' && r.primaries === 1, JSON.stringify(r));
  // locale change keeps the service, drops the prefill
  await p.evaluate(async () => { const m = await import('./assets/js/foundation.js'); await m.setLocale('en'); }); await p.waitForTimeout(600);
  r = await p.evaluate(() => ({ checked: document.querySelector('.c-pick[aria-checked=true]').dataset.vertical, statuses: document.querySelectorAll('.c-book__status').length, selectors: document.querySelectorAll('.c-pick-grid').length, forms: document.querySelectorAll('.c-search').length, dir: document.documentElement.dir }));
  ok('language switch keeps hotels selected; no duplicated regions', r.checked === 'hotels' && r.statuses === 1 && r.selectors === 1 && r.forms === 1 && r.dir === 'ltr', JSON.stringify(r));
  await p.close();

  p = await open(PAGE + '?vertical=other&service=study');
  r = await p.evaluate(() => ({ checked: document.querySelector('.c-pick[aria-checked=true]').dataset.vertical, option: document.querySelector('.c-search__form:not([hidden]) [name=service]').value }));
  ok('?vertical=other&service=study preselects the option', r.checked === 'other' && r.option === 'study', JSON.stringify(r));
  await p.close();

  p = await open(PAGE + '?vertical=packages&offer=istanbul-family&to=istanbul');
  await fill(p, 'destination', 'إسطنبول');
  await submit(p); await p.waitForTimeout(300);
  r = await p.evaluate(() => { const ctx = JSON.parse(sessionStorage.getItem('no.booking.context')); return { offer: ctx.options.offer, service: ctx.service, dest: ctx.destination, row: Array.from(document.querySelectorAll('.c-summary__row dd')).map((d) => d.textContent), href: document.querySelector('.c-summary a.c-btn--primary').getAttribute('href') }; });
  ok('offer deep link carries the offer into the context, summary and continue URL', r.offer === 'istanbul-family' && r.service === 'packages' && r.dest === 'إسطنبول' && r.row.includes('istanbul-family') && /offer=istanbul-family/.test(r.href), JSON.stringify(r));
  await p.close();

  p = await open(PAGE + '?vertical=nonsense');
  r = await p.evaluate(() => document.querySelector('.c-pick[aria-checked=true]').dataset.vertical);
  ok('unknown vertical falls back to flights', r === 'flights', r);
  await p.close();
}

// ---------------------------------------------------------------- header search + keyboard + mobile
{
  const p = await open(PAGE, 1440, 1000, 'ar');
  // keyboard: Tab order starts at the skip link; rings everywhere
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press('Tab');
  ok('first Tab is the skip link', await p.evaluate(() => document.activeElement.hasAttribute('data-skip')));
  const seen = [];
  for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); const opt = a.closest('.c-segmented__option'); const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (opt && getComputedStyle(opt).boxShadow !== 'none') || !a.matches(':focus-visible'); return { name: a.className.split(' ')[0] || a.tagName, ring }; })); }
  ok('every focused control shows a focus ring', seen.every((s) => s.ring), seen.filter((s) => !s.ring).map((s) => s.name).join(','));
  ok('service cards are one Tab stop (roving tabindex)', seen.filter((s) => s.name === 'c-card').length === 1, seen.map((s) => s.name).join(','));
  // header search → the page's own form
  await p.click('header .c-gh__action[aria-label="بحث"]'); await p.waitForTimeout(300);
  const hs = await p.evaluate(() => ({ focused: document.activeElement.name, inForm: !!document.activeElement.closest('.c-search__form') }));
  ok('header search hands over to the booking form', hs.inForm && hs.focused === 'from', JSON.stringify(hs));
  await p.close();

  const m = await open(PAGE, 390, 844, 'ar');
  const r = await m.evaluate(() => {
    const submit = document.querySelector('.c-search__form:not([hidden]) button[type=submit]').getBoundingClientRect();
    const aside = document.querySelector('.c-book__aside').getBoundingClientRect();
    const form = document.querySelector('[data-booking=form]').getBoundingClientRect();
    return { submitFull: submit.width > 300, asideBelowForm: aside.top > form.bottom, cardH: Math.round(document.querySelector('.c-pick').getBoundingClientRect().height), pickTop: document.querySelector('.c-pick-grid').getBoundingClientRect().top, sticky: getComputedStyle(document.querySelector('.c-book__aside')).position };
  });
  ok('mobile: full-width submit, trust below the form, cards within first screen', r.submitFull && r.asideBelowForm && r.cardH >= 48 && r.pickTop < 700 && r.sticky !== 'sticky', JSON.stringify(r));
  await m.close();
}

await b.close();
console.log(`\n${pass}/${pass + fail} booking checks passed`);
console.log('errors:', errs.length ? errs : 'none');
process.exit(fail || errs.length ? 1 : 0);
