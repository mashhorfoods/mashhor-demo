/* ============================================================================
   CORE / DOM — the small helpers every component uses.
   No framework. Nothing here knows about travel; it is all generic. §26
   ========================================================================= */

export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Create an element. Attributes starting with "on" are bound as listeners,
 * `class` accepts a string or an array, `dataset` takes an object, and
 * children may be nodes, strings, or nested arrays.
 *
 * There is deliberately no way to pass raw HTML. Children always become text
 * nodes (see `append`), so a passenger name, a hotel description or anything
 * else arriving from an API or typed by a customer cannot become markup. Do
 * not add an `html:` option — build nodes, or use a template element.
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      node.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  append(node, children);
  return node;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** Replace the contents of a node in one operation. */
export function render(target, children) {
  target.replaceChildren();
  append(target, children);
  return target;
}

export const uid = (() => {
  let n = 0;
  return (prefix = 'no') => `${prefix}-${(++n).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
})();

/** Run once the DOM is parsed, whether or not we are already past that point. */
export function ready(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
}

/** Focus management for overlays. Returns a restore() to put focus back. */
export function trapFocus(container) {
  const previous = document.activeElement;
  const SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  const focusables = () => qsa(SELECTOR, container).filter((n) => n.offsetParent !== null || n === document.activeElement);

  function onKeydown(event) {
    if (event.key !== 'Tab') return;
    const nodes = focusables();
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);
  focusables()[0]?.focus();

  return function restore() {
    container.removeEventListener('keydown', onKeydown);
    if (previous instanceof HTMLElement) previous.focus();
  };
}

/** Prevent the page behind an overlay from scrolling, without a layout jump. */
let scrollLocks = 0;
export function lockScroll() {
  if (scrollLocks++ > 0) return;
  const gap = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  if (gap > 0) document.body.style.paddingInlineEnd = `${gap}px`;
}
export function unlockScroll() {
  if (--scrollLocks > 0) return;
  scrollLocks = Math.max(0, scrollLocks);
  document.body.style.overflow = '';
  document.body.style.paddingInlineEnd = '';
}
