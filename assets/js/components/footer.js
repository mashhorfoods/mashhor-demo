/* ============================================================================
   COMPONENTS / GLOBAL FOOTER — Stage 10.3
   السفر والسياحة — Travel & Tourism

   Completes the global navigation started in 10.2. Everything comes from
   data/footer.js; this file knows no label, route, number or account.

   §27 is enforced structurally, not by discipline: a contact row renders only
   when its `value` is set, a social link only when its `url` is set, and a
   legal link only when `exists` is true. There is no code path that can put an
   invented phone number or an unverified account on the page.

   Accordions (§17): the SAME markup serves desktop and mobile. Below 48em the
   trigger is a real disclosure button; above it CSS turns it into an inert
   heading with its panel always open. One DOM, no duplicate component (§23).
   ========================================================================= */

import { el, qsa, uid } from '../core/dom.js';
import { getLocale, pick } from '../core/i18n.js';
import { route } from '../data/config.js';
import {
  FOOTER_BRAND, FOOTER_TRUST, FOOTER_COLUMNS, FOOTER_CONTACT,
  FOOTER_SOCIAL, FOOTER_LEGAL, FOOTER_CTA, LEGAL_NAME,
} from '../data/footer.js';
import { icon } from './ui.js';

/* ---------------------------------------------------------------------------
   FooterLink
   ------------------------------------------------------------------------ */
export function footerLink(link) {
  return el('a', {
    class: 'c-gf__link',
    href: link.external ? link.href : route(link.href),
    ...(link.external ? { target: '_blank', rel: 'noopener' } : {}),
  }, [
    link.icon ? icon(link.icon, { size: 'sm' }) : null,
    el('span', {}, pick(link, 'label')),
  ]);
}

/* ---------------------------------------------------------------------------
   FooterColumn / FooterAccordion — §17 §20

   Below 48em a column IS an accordion, so it renders a real disclosure button
   with a truthful aria-expanded. At and above 48em there is no accordion, so it
   renders a heading — not a button that CSS has switched off.

   Doing this with `pointer-events: none` instead left three buttons on every
   desktop page that a keyboard user could still focus and activate, toggling an
   aria-expanded that described nothing, over a panel CSS was forcing open.
   ------------------------------------------------------------------------ */
export const FOOTER_ACCORDION_QUERY = '(max-width: 47.999em)';

export function footerColumn(column, { collapsible = true } = {}) {
  const links = el('div', { class: 'c-gf__links' }, column.links.map(footerLink));

  if (!collapsible) {
    return el('div', { class: 'c-gf__group', dataset: { col: column.id } }, [
      el('p', { class: 'c-gf__col-title' }, pick(column, 'title')),
      links,
    ]);
  }

  const panelId = uid('gf-col');
  const trigger = el('button', {
    type: 'button',
    class: 'c-gf__acc-trigger',
    'aria-expanded': 'false',
    'aria-controls': panelId,
  }, [
    el('span', {}, pick(column, 'title')),
    icon('no-chevron-down', { size: 'sm' }),
  ]);

  const panel = el('div', {
    class: 'c-gf__acc-panel', id: panelId, dataset: { collapsed: 'true' },
  }, el('div', { class: 'c-gf__acc-inner' }, links));

  trigger.addEventListener('click', () => {
    const open = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!open));
    panel.dataset.collapsed = String(open);
  });

  return el('div', { class: 'c-gf__group', dataset: { col: column.id } }, [trigger, panel]);
}

/* ---------------------------------------------------------------------------
   FooterBrand
   ------------------------------------------------------------------------ */
export function footerBrand() {
  return el('div', { class: 'c-gf__brand' }, [
    el('p', { class: 'c-gf__statement' }, pick(FOOTER_BRAND, 'statement')),
    el('p', { class: 'c-gf__support-line' }, [
      icon('no-supervisor', { size: 'sm' }),
      el('span', {}, pick(FOOTER_BRAND, 'support')),
    ]),
  ]);
}

/* ---------------------------------------------------------------------------
   FooterContact — §08. Renders only rows that carry a value.
   ------------------------------------------------------------------------ */
export function footerContact() {
  const isAr = getLocale() === 'ar';
  const rows = FOOTER_CONTACT.filter((c) => Boolean(c.value));
  if (rows.length === 0) return null;

  return el('div', { class: 'c-gf__contact-block' }, [
    el('p', { class: 'c-gf__col-title' }, isAr ? 'تواصل معنا' : 'Contact us'),
    el('div', { class: 'c-gf__contact' }, rows.map((c) =>
      el('a', { class: 'c-gf__contact-row', href: c.value, target: '_blank', rel: 'noopener' }, [
        el('span', { class: 'c-gf__contact-icon' }, icon(c.icon, { size: 'sm' })),
        el('span', {}, [
          el('span', { class: 'c-gf__contact-label' }, pick(c, 'label')),
          el('span', { class: 'c-gf__contact-value' }, pick(c, 'display')),
        ]),
      ]))),
  ]);
}

/* ---------------------------------------------------------------------------
   FooterSocial — §09. Nothing renders until a verified account exists.
   ------------------------------------------------------------------------ */
export function footerSocial() {
  const live = FOOTER_SOCIAL.filter((s) => Boolean(s.url));
  if (live.length === 0) return null;

  const isAr = getLocale() === 'ar';
  return el('nav', { class: 'c-gf__social', 'aria-label': isAr ? 'حسابات التواصل' : 'Social channels' },
    live.map((s) => el('a', {
      class: 'c-gf__social-link', href: s.url, target: '_blank', rel: 'noopener',
      'aria-label': s.label,
    }, icon(s.icon))));
}

/* ---------------------------------------------------------------------------
   FooterCTA — §10
   ------------------------------------------------------------------------ */
export function footerCta() {
  return el('div', { class: 'c-gf__cta' }, [
    el('div', {}, [
      el('p', { class: 'c-gf__cta-title' }, pick(FOOTER_CTA, 'title')),
      el('p', { class: 'c-gf__cta-text' }, pick(FOOTER_CTA, 'text')),
    ]),
    el('a', { class: 'c-btn c-btn--primary c-btn--lg', href: route(FOOTER_CTA.href) },
      pick(FOOTER_CTA, 'label')),
  ]);
}

/* ---------------------------------------------------------------------------
   FooterLegal + FooterCopyright — §13 §14
   ------------------------------------------------------------------------ */
export function footerLegal() {
  const isAr = getLocale() === 'ar';
  const live = FOOTER_LEGAL.filter((l) => l.exists);
  if (live.length === 0) return null;
  return el('nav', { class: 'c-gf__legal', 'aria-label': isAr ? 'روابط قانونية' : 'Legal' },
    live.map((l) => el('a', { href: route(l.href) }, pick(l, 'label'))));
}

export function footerCopyright() {
  const isAr = getLocale() === 'ar';
  // §14 — the year is read at render time, never written into the markup.
  return el('p', { class: 'c-gf__copy' }, [
    `© ${new Date().getFullYear()} `,
    el('bdi', {}, isAr ? LEGAL_NAME.ar : LEGAL_NAME.en),
  ]);
}

/* ---------------------------------------------------------------------------
   GlobalFooter — §23 §24
   @param {'marketing'|'booking'|'app'} variant
   ------------------------------------------------------------------------ */
/** `cta: false` drops the footer's own call to action — for a page that
    carries its own final CTA directly above the footer (the homepage), two
    red actions in a row would break the one-primary-action rule. §11 */
export function globalFooter({ variant = 'marketing', collapsible = null, cta = true } = {}) {
  const isAr = getLocale() === 'ar';
  const full = variant === 'marketing';
  // Decided once per render; mountFooter re-renders when the breakpoint moves.
  const acc = collapsible ?? window.matchMedia(FOOTER_ACCORDION_QUERY).matches;

  const contact = footerContact();
  const social = footerSocial();
  const legal = footerLegal();

  /* The variants differ in WHAT IS BUILT, not in what CSS hides. A hidden link
     wall still ships in the DOM and still costs the accessibility tree (§25).

       marketing  everything
       booking    the live support channels, legal, copyright. The page is
                  the task; support stays one click away rather than being
                  something the customer must leave the flow to find (§07).
       app        legal and copyright on a light surface. Nothing else. */
  const compact = variant !== 'marketing';

  return el('footer', { class: 'c-gf', 'data-variant': variant }, [
    variant === 'app' ? null : el('span', { class: 'c-gf__route', 'aria-hidden': 'true' }),

    el('div', { class: 'l-container' }, [
      full && cta ? footerCta() : null,

      el('div', { class: 'c-gf__main' }, [
        full
          ? el('div', { class: 'c-gf__grid' }, [
              footerBrand(),
              contact,
              ...FOOTER_COLUMNS.map((c) => footerColumn(c, { collapsible: acc })),
            ])
          : null,

        variant === 'booking' && contact
          ? el('div', { class: 'c-gf__compact' }, [contact])
          : null,

        full && social
          ? el('div', { style: 'margin-block-start:var(--space-32)' }, [
              el('p', { class: 'c-gf__col-title' }, isAr ? 'تابعنا' : 'Follow us'),
              social,
            ])
          : null,
      ]),

      full
        ? el('div', { class: 'c-gf__trust' }, FOOTER_TRUST.map((tr) =>
            el('p', { class: 'c-gf__trust-item' }, [
              icon(tr.icon, { size: 'sm' }),
              el('span', {}, pick(tr, 'label')),
            ])))
        : null,

      el('div', { class: 'c-gf__bottom' }, [
        legal ?? el('span', {}),
        footerCopyright(),
      ]),
    ]),
  ]);
}

/** Replace any existing footer on the page with a freshly rendered one.

    Also re-renders when the page crosses the accordion breakpoint, so the
    columns always carry the semantics that match what the user can actually
    do — buttons on a phone, headings on a desktop. */
export function mountFooter({ target = document.querySelector('.l-page') ?? document.body, ...options } = {}) {
  const render = () => {
    qsa('.c-gf', target).forEach((n) => n.remove());
    const footer = globalFooter(options);
    target.append(footer);
    return footer;
  };

  let footer = render();
  const mq = window.matchMedia(FOOTER_ACCORDION_QUERY);
  const onChange = () => { footer = render(); };
  mq.addEventListener?.('change', onChange);
  footer.no = { destroy: () => mq.removeEventListener?.('change', onChange) };
  return footer;
}
