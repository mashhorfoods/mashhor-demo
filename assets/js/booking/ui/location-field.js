/* ============================================================================
   BOOKING / UI / LOCATION FIELD — the airport & city combobox. Stage 11

   One text input the customer can type in freely, a listbox of suggestions
   from booking/locations.js (async: loading, empty and error states), full
   keyboard support (Down/Up, Enter, Escape, Tab), a highlighted match and a
   clear button. The visible input keeps the field's `name`, so FormData and
   the booking context still read what the customer typed; a hidden
   `<name>Code` input carries the chosen airport code, cleared as soon as
   the text is edited again. The data source is replaceable without touching
   this file.
   ========================================================================= */

import { el, uid } from '../../core/dom.js';
import { t, getLocale } from '../../core/i18n.js';
import { icon } from '../../components/ui.js';
import { searchLocations, locationLabel } from '../locations.js';

export function locationField({ id = uid('loc'), name, iconName = 'no-location', required = false, placeholder = null, provider = searchLocations } = {}) {
  const listId = `${id}-list`;
  const input = el('input', {
    class: 'c-field__control', id, name, type: 'text', autocomplete: 'off', spellcheck: 'false', required,
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-haspopup': 'listbox',
    placeholder: placeholder ?? t('bk.loc.placeholder'),
  });
  const code = el('input', { type: 'hidden', name: `${name}Code`, value: '' });
  const list = el('ul', { class: 'c-loc__list', id: listId, role: 'listbox', hidden: true, 'aria-label': t('bk.loc.label') });
  const clear = el('button', { type: 'button', class: 'c-btn c-btn--utility c-btn--sm c-loc__clear', 'aria-label': t('bk.loc.clear'), hidden: true, tabIndex: -1,
    onclick: () => { input.value = ''; code.value = ''; sync(); close(); input.focus(); input.dispatchEvent(new Event('input', { bubbles: true })); } }, icon('no-close', { size: 'sm' }));
  const wrap = el('div', { class: 'c-field__wrap c-loc' }, [
    iconName ? el('span', { class: 'c-field__addon c-field__addon--start' }, icon(iconName, { size: 'sm' })) : null,
    input, code, clear, list,
  ]);

  let items = []; let active = -1; let controller = null; let timer = null;
  const sync = () => { clear.hidden = !input.value; };
  const open = () => { list.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  // Closing also cancels a pending search, so the list cannot pop open after the customer left the field.
  const close = () => { clearTimeout(timer); controller?.abort(); list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const status = (key) => { list.replaceChildren(el('li', { class: 'c-loc__status', role: 'option', 'aria-disabled': 'true' }, t(key))); open(); };
  const highlight = (text, q) => {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 || !q ? [text] : [text.slice(0, i), el('mark', {}, text.slice(i, i + q.length)), text.slice(i + q.length)];
  };
  const choose = (loc) => {
    input.value = locationLabel(loc, getLocale()); code.value = loc.code; sync(); close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const paint = (q) => {
    if (!items.length) { status('bk.loc.empty'); return; }
    const ar = getLocale() === 'ar';
    list.replaceChildren(...items.map((loc, i) => el('li', {
      class: 'c-loc__option', role: 'option', id: `${listId}-${i}`, 'aria-selected': String(i === active),
      onmousedown: (e) => { e.preventDefault(); choose(loc); },
    }, [
      el('span', { class: 'c-loc__code' }, highlight(loc.code, q)),
      el('span', {}, [
        el('span', { class: 'c-loc__city' }, highlight(ar ? loc.cityAr : loc.cityEn, q)),
        // Airport · country, plus the other language's city name when that is what matched.
        el('span', { class: 'c-loc__airport' }, [
          ...highlight(ar ? loc.airportAr : loc.airportEn, q), ` · ${ar ? loc.countryAr : loc.countryEn}`,
          ...(q && (ar ? loc.cityEn : loc.cityAr).toLowerCase().includes(q.toLowerCase()) ? [' · ', el('bdi', {}, highlight(ar ? loc.cityEn : loc.cityAr, q))] : []),
        ]),
      ]),
    ])));
    open();
  };
  const setActive = (i) => {
    active = items.length ? (i + items.length) % items.length : -1;
    list.querySelectorAll('.c-loc__option').forEach((o, k) => o.setAttribute('aria-selected', String(k === active)));
    if (active >= 0) { input.setAttribute('aria-activedescendant', `${listId}-${active}`); list.children[active]?.scrollIntoView?.({ block: 'nearest' }); }
  };
  const search = async (q) => {
    controller?.abort(); controller = new AbortController();
    if (q.trim().length < 2) { items = []; if (q.trim()) status('bk.loc.hint'); else close(); return; }
    status('bk.loc.loading');
    try {
      const { items: found } = await provider(q, { signal: controller.signal });
      items = found; paint(q.trim());
    } catch (error) {
      if (error?.name === 'AbortError') return;
      items = [];
      list.replaceChildren(el('li', { class: 'c-loc__status', role: 'option', 'aria-disabled': 'true' }, [
        el('span', {}, t('bk.loc.error')), ' ',
        el('button', { type: 'button', class: 'c-btn c-btn--tertiary c-btn--sm', onmousedown: (e) => { e.preventDefault(); search(input.value); } }, t('action.retry')),
      ]));
      open();
    }
  };

  input.addEventListener('input', () => { code.value = ''; sync(); clearTimeout(timer); timer = setTimeout(() => search(input.value), 150); });
  input.addEventListener('focus', () => { if (input.value && !code.value) search(input.value); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && input.value) { e.preventDefault(); search(input.value); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { if (active >= 0 && items[active]) { e.preventDefault(); choose(items[active]); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close();
  });
  sync();
  wrap.no = { input, code, choose, set(loc) { choose(loc); } };
  return wrap;
}
