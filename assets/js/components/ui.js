/* ============================================================================
   COMPONENTS / UI — behaviours.

   Every one of these is progressive enhancement: the markup is meaningful and
   operable before the script runs, and the script only adds behaviour. If the
   JS fails, an accordion is an open section and a modal is a linked page —
   nothing becomes unreachable. §23 / §30
   ========================================================================= */

import { qs, qsa, el, uid, trapFocus, lockScroll, unlockScroll } from '../core/dom.js';
import { t, onLocaleChange } from '../core/i18n.js';

/* ---------------------------------------------------------------------------
   ICON — §15

   The sprite is fetched ONCE and injected into the document, and every icon
   then references it as a same-document fragment (`#no-flight`).

   Why not reference the file directly (`sprite.svg#no-flight`)? Because
   Chromium and Safari do not resolve EXTERNAL references in <use>: the file
   downloads, the styles apply, and nothing paints. Only Firefox renders it.
   Injecting once costs the same single request and works in every browser.

   Same-document references resolve LIVE, so icons created before the sprite
   lands still paint the moment it arrives — no need to re-render anything.

   Without JavaScript there are no icons. That is acceptable in this system and
   only in this system, because §15 forbids an icon from being the sole carrier
   of meaning: every icon here either sits beside its own text or the control
   carries an aria-label. Losing them costs decoration, never comprehension.
   A build step that inlines the sprite into the HTML removes even that.
   ------------------------------------------------------------------------ */
let SPRITE = 'assets/icons/sprite.svg';
let spritePromise = null;

export const setSpritePath = (path) => { SPRITE = path; };

/** Fetch and inject the sprite. Safe to call repeatedly. */
export function ensureSprite(path = SPRITE) {
  if (spritePromise) return spritePromise;
  if (document.getElementById('no-sprite')) return Promise.resolve();

  spritePromise = fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error(`sprite ${response.status}`);
      return response.text();
    })
    .then((markup) => {
      if (document.getElementById('no-sprite')) return;
      const host = document.createElement('div');
      host.id = 'no-sprite';
      host.setAttribute('aria-hidden', 'true');
      // Not display:none — a hidden subtree still has to be laid out for the
      // symbols to be referenceable, so we take it out of flow instead.
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      host.innerHTML = markup;
      document.body.prepend(host);
    })
    .catch((error) => {
      // file:// has no fetch. Fall back to the external reference, which at
      // least renders in Firefox, rather than failing silently everywhere.
      console.warn('[no] Icon sprite could not be injected (%s). Falling back to external references.', error.message);
      document.documentElement.dataset.spriteFallback = 'true';
    });

  return spritePromise;
}

/**
 * @param {string} name   sprite symbol id, e.g. 'no-flight'
 * @param {object} opts   { size: 'xs'|'sm'|'lg'|'xl', flip: true, label: string }
 *   Pass `label` for an icon that carries meaning on its own; leave it off and
 *   the icon is hidden from assistive tech, which is right when adjacent text
 *   already says the same thing. §15 / §23
 */
export function icon(name, { size, flip = false, label = null, className = '' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', ['c-icon', size ? `c-icon--${size}` : '', className].filter(Boolean).join(' '));
  if (flip) svg.dataset.flip = 'true';

  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}

/* ---------------------------------------------------------------------------
   BUTTON state helper — §11. Drives the loading / success / error states
   without any caller touching classes.
   ------------------------------------------------------------------------ */
export function setButtonState(button, state, { announce = true } = {}) {
  const valid = ['idle', 'loading', 'success', 'error'];
  if (!valid.includes(state)) return;

  if (state === 'idle') {
    delete button.dataset.state;
    button.removeAttribute('aria-busy');
  } else {
    button.dataset.state = state;
    // aria-busy is a true/false token; a bare attribute (toggleAttribute) is
    // an empty string, which assistive technology does not read as busy.
    if (state === 'loading') button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  }

  if (announce && state === 'loading') {
    // A disabled button loses its accessible name announcement, so we keep it
    // enabled and mark it busy instead; pointer-events are off via CSS.
    button.setAttribute('aria-live', 'polite');
  }
}

/* ---------------------------------------------------------------------------
   ACCORDION — button[aria-expanded] + a grid-rows transition.
   ------------------------------------------------------------------------ */
export function initAccordions(root = document) {
  qsa('[data-accordion]', root).forEach((accordion) => {
    const single = accordion.dataset.accordion === 'single';

    qsa('.c-accordion__trigger', accordion).forEach((trigger) => {
      const panel = trigger.nextElementSibling;
      if (!panel) return;

      if (!panel.id) panel.id = uid('panel');
      trigger.setAttribute('aria-controls', panel.id);

      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(expanded));
      panel.dataset.collapsed = String(!expanded);

      trigger.addEventListener('click', () => {
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';

        if (single && !isOpen) {
          qsa('.c-accordion__trigger[aria-expanded="true"]', accordion).forEach((other) => {
            other.setAttribute('aria-expanded', 'false');
            other.nextElementSibling.dataset.collapsed = 'true';
          });
        }

        trigger.setAttribute('aria-expanded', String(!isOpen));
        panel.dataset.collapsed = String(isOpen);
      });
    });
  });
}

/* ---------------------------------------------------------------------------
   TABS — full keyboard support, and arrow keys that follow the reading
   direction rather than the physical key. §06 / §23
   ------------------------------------------------------------------------ */
export function initTabs(root = document) {
  // The root may itself be the tab group (a component initialising what it
  // just built), so it is included alongside any descendants.
  const groups = root instanceof Element && root.matches('[data-tabs]') ? [root, ...qsa('[data-tabs]', root)] : qsa('[data-tabs]', root);
  groups.forEach((group) => {
    // Idempotent: a component that builds its own tab group (the search
    // widget) initialises it on creation, and boot() sweeps the document
    // once — neither may bind a second set of listeners.
    if (group.dataset.tabsInit) return;
    group.dataset.tabsInit = 'true';
    const tabs = qsa('[role="tab"]', group);
    if (tabs.length === 0) return;

    const select = (tab) => {
      tabs.forEach((other) => {
        const isTarget = other === tab;
        other.setAttribute('aria-selected', String(isTarget));
        other.tabIndex = isTarget ? 0 : -1;
        const panel = document.getElementById(other.getAttribute('aria-controls'));
        if (panel) panel.hidden = !isTarget;
      });
      group.dispatchEvent(new CustomEvent('no:tabchange', { detail: { id: tab.dataset.tabId ?? tab.id } }));
    };

    tabs.forEach((tab, index) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;

      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (event) => {
        const isRtl = getComputedStyle(group).direction === 'rtl';
        const forward = isRtl ? 'ArrowLeft' : 'ArrowRight';
        const back    = isRtl ? 'ArrowRight' : 'ArrowLeft';

        let next = null;
        if (event.key === forward) next = tabs[(index + 1) % tabs.length];
        else if (event.key === back) next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === 'Home') next = tabs[0];
        else if (event.key === 'End') next = tabs[tabs.length - 1];

        if (next) {
          event.preventDefault();
          select(next);
          next.focus();
        }
      });
    });
  });
}

/* ---------------------------------------------------------------------------
   MODAL — native <dialog>. The platform gives us focus trapping, Esc, and
   inertness for free, which is more reliable than anything we would write.
   ------------------------------------------------------------------------ */
export function initModals(root = document) {
  qsa('dialog.c-modal', root).forEach((dialog) => {
    qsa(`[data-modal-open="${dialog.id}"]`).forEach((trigger) => {
      trigger.addEventListener('click', () => {
        dialog.showModal();
        lockScroll();
      });
    });

    qsa('[data-modal-close]', dialog).forEach((btn) => {
      btn.addEventListener('click', () => dialog.close('dismiss'));
    });

    // Clicking the backdrop closes — but only the backdrop, not the panel.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('dismiss');
    });

    dialog.addEventListener('close', () => unlockScroll());
  });
}

/* ---------------------------------------------------------------------------
   TOAST — one live region for the whole page. §21
   ------------------------------------------------------------------------ */
let toastRegion = null;

function ensureToastRegion() {
  if (toastRegion?.isConnected) return toastRegion;
  toastRegion = qs('.c-toast-region') ?? el('div', {
    class: 'c-toast-region',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'false',
  });
  if (!toastRegion.isConnected) document.body.append(toastRegion);
  return toastRegion;
}

const TOAST_ICONS = { success: 'no-check-circle', warning: 'no-alert', error: 'no-error', info: 'no-info' };

export function toast({ title, text = '', variant = 'info', duration = 6000 }) {
  const region = ensureToastRegion();

  const node = el('div', { class: `c-toast c-toast--${variant}` }, [
    icon(TOAST_ICONS[variant] ?? TOAST_ICONS.info, { className: 'c-toast__icon' }),
    el('div', { class: 'c-toast__body' }, [
      el('p', { class: 'c-toast__title' }, title),
      text ? el('p', { class: 'c-toast__text' }, text) : null,
    ]),
    el('button', {
      class: 'c-btn c-btn--utility c-btn--sm',
      type: 'button',
      'aria-label': t('nav.close'),
      onclick: () => node.remove(),
    }, icon('no-close', { size: 'sm' })),
  ]);

  region.append(node);
  // An error stays until dismissed: it usually needs a decision. §21
  if (duration && variant !== 'error') setTimeout(() => node.remove(), duration);
  return node;
}

/* ---------------------------------------------------------------------------
   STEPPER — the +/- control behind passenger and room counts.
   ------------------------------------------------------------------------ */
export function stepper({ label, hint, value = 0, min = 0, max = 9, onChange }) {
  const outputId = uid('stepper');
  let count = value;

  const output = el('output', {
    class: 'c-stepper__value', id: outputId, 'aria-live': 'polite',
  }, String(count));

  const dec = el('button', {
    class: 'c-btn c-btn--utility c-btn--secondary c-btn--pill c-btn--sm',
    type: 'button', 'aria-label': `−1 ${label}`, 'aria-describedby': outputId,
  }, icon('no-minus', { size: 'sm' }));

  const inc = el('button', {
    class: 'c-btn c-btn--utility c-btn--secondary c-btn--pill c-btn--sm',
    type: 'button', 'aria-label': `+1 ${label}`, 'aria-describedby': outputId,
  }, icon('no-plus', { size: 'sm' }));

  const sync = () => {
    output.textContent = String(count);
    dec.disabled = count <= min;
    inc.disabled = count >= max;
    onChange?.(count);
  };

  dec.addEventListener('click', () => { if (count > min) { count -= 1; sync(); } });
  inc.addEventListener('click', () => { if (count < max) { count += 1; sync(); } });
  sync();

  return el('div', { class: 'c-stepper-row' }, [
    el('div', {}, [
      el('span', { class: 't-body-sm', style: 'font-weight:var(--weight-medium)' }, label),
      hint ? el('span', { class: 'c-field__help', style: 'display:block' }, hint) : null,
    ]),
    el('div', { class: 'c-stepper' }, [dec, output, inc]),
  ]);
}

/* ---------------------------------------------------------------------------
   OTP — six boxes that behave like one field: paste fills them all, backspace
   walks back, and the value is mirrored into a single hidden input so the
   form submits one clean value.
   ------------------------------------------------------------------------ */
export function initOtp(root = document) {
  qsa('[data-otp]', root).forEach((group) => {
    const inputs = qsa('.c-otp__input', group);
    const hidden = qs('input[type="hidden"]', group);

    const sync = () => {
      if (hidden) hidden.value = inputs.map((i) => i.value).join('');
      group.dispatchEvent(new CustomEvent('no:otp', { detail: { value: hidden?.value ?? '' } }));
    };

    inputs.forEach((input, index) => {
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('autocomplete', index === 0 ? 'one-time-code' : 'off');
      input.setAttribute('maxlength', '1');

      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 1);
        if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
        sync();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace' && !input.value && index > 0) inputs[index - 1].focus();
      });

      input.addEventListener('paste', (event) => {
        const digits = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
        if (!digits) return;
        event.preventDefault();
        inputs.forEach((box, i) => { box.value = digits[i] ?? ''; });
        inputs[Math.min(digits.length, inputs.length - 1)].focus();
        sync();
      });
    });
  });
}

/* ---------------------------------------------------------------------------
   POPOVER — the passenger picker and any small anchored panel.
   ------------------------------------------------------------------------ */
export function initPopovers(root = document) {
  qsa('[data-popover-trigger]', root).forEach((trigger) => {
    // Idempotent: a widget wires its own popovers when it is built and boot()
    // sweeps the document once more; binding twice would toggle twice.
    if (trigger.dataset.popoverBound) return;
    // The trigger may still be detached (a widget built before it is
    // mounted), so look inside the root before asking the document.
    const id = trigger.getAttribute('aria-controls');
    const scope = root instanceof Element ? root : document;
    const panel = (id && (scope.querySelector(`#${CSS.escape(id)}`) ?? document.getElementById(id)))
      ?? trigger.closest('.c-popover-host')?.querySelector('.c-popover');
    if (!panel) return;
    trigger.dataset.popoverBound = 'true';

    const close = () => {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
    };

    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      (panel.hidden ? open : close)();
    });

    panel.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target.closest('[data-popover-close]')) { close(); trigger.focus(); }
    });

    document.addEventListener('click', () => { if (!panel.hidden) close(); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) { close(); trigger.focus(); }
    });
  });
}

/* ---------------------------------------------------------------------------
   FILE UPLOAD — drag, drop, and a list that says what was added.
   ------------------------------------------------------------------------ */
export function initUploads(root = document) {
  qsa('[data-upload]', root).forEach((zone) => {
    const input = qs('input[type="file"]', zone);
    const list = qs('.c-upload-list', zone.parentElement ?? zone);
    if (!input) return;

    const show = (files) => {
      if (!list) return;
      list.replaceChildren();
      Array.from(files).forEach((file) => {
        list.append(el('div', { class: 'c-upload-item' }, [
          icon('no-documents', { size: 'sm' }),
          el('span', { class: 'c-upload-item__name' }, file.name),
          el('span', { class: 'c-upload-item__size' }, `${Math.ceil(file.size / 1024)} KB`),
        ]));
      });
    };

    input.addEventListener('change', () => show(input.files));

    ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.dataset.dragover = 'true';
    }));
    ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.dataset.dragover = 'false';
    }));
    zone.addEventListener('drop', (event) => {
      if (event.dataTransfer?.files?.length) {
        input.files = event.dataTransfer.files;
        show(input.files);
      }
    });
  });
}

/* ---------------------------------------------------------------------------
   HERO ROUTE GRAPHIC — the dashed route with its two stops, drawn over a
   hero's media slot. Every hero draws the same graphic with its own curve.
   ------------------------------------------------------------------------ */
export function routeGraphic({ d = 'M 40 450 C 90 330, 200 330, 240 220 S 330 110, 356 60', start = [40, 450], end = [356, 60] } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const node = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = node('svg', { class: 'c-hero__route', viewBox: '0 0 400 500', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  const path = node('path', { d, 'vector-effect': 'non-scaling-stroke' });
  svg.append(path, node('circle', { cx: start[0], cy: start[1], r: 4 }), node('circle', { cx: end[0], cy: end[1], r: 5 }));
  return svg;
}

/* ---------------------------------------------------------------------------
   SECTION HEAD — overline · h2 (with the mark) · optional lead. One builder
   for every section on every page; pass translated strings.
   ------------------------------------------------------------------------ */
export function sectionHead({ id, overline = '', title, text = '', mark = true } = {}) {
  return el('div', { class: 'l-section-head' }, [
    overline ? el('p', { class: 't-overline' }, overline) : null,
    el('h2', { class: mark ? 't-h2 u-mark' : 't-h2', id }, title),
    text ? el('p', { class: 't-body t-muted' }, text) : null,
  ]);
}
