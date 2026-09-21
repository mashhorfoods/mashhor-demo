/* ============================================================================
   COMPONENTS / NEWSLETTER — reusable subscription card. Redesign §4.

   No subscription backend exists (assets/js/data/footer.js documents that
   choice deliberately). This renders, validates and confirms entirely on
   the client — the same "no invented provider integration" boundary the
   booking review step keeps for its terms checkbox.
   ========================================================================= */

import { el, qs } from '../core/dom.js';
import { t, pick } from '../core/i18n.js';
import { icon } from './ui.js';
import { stateBlock } from './states.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {object} [options]
 * @param {{src:string, altAr?:string, altEn?:string}} [options.image]
 */
export function newsletterCard({ image = null } = {}) {
  const emailId = 'newsletter-email';
  const consentId = 'newsletter-consent';

  const emailInput = el('input', {
    class: 'c-field__control', id: emailId, name: 'email', type: 'email',
    required: true, autocomplete: 'email', placeholder: t('home.newsletter.email.placeholder'),
    'aria-describedby': `${emailId}-err`,
  });
  const emailError = el('p', { class: 'c-field__error', id: `${emailId}-err`, role: 'alert', hidden: true });
  const emailField = el('div', { class: 'c-field', dataset: { field: 'email' } }, [
    el('label', { class: 'c-field__label', for: emailId }, [
      t('home.newsletter.email.label'),
      el('span', { class: 'c-field__required', 'aria-hidden': 'true' }, '*'),
    ]),
    emailInput,
    emailError,
  ]);

  const consentInput = el('input', { class: 'c-choice__input', type: 'checkbox', id: consentId, required: true });
  const consentError = el('p', { class: 'c-field__error', role: 'alert', hidden: true });
  const consentField = el('div', { class: 'l-stack l-stack--8', dataset: { field: 'consent' } }, [
    el('label', { class: 'c-choice', for: consentId }, [consentInput, el('span', { class: 'c-choice__text' }, t('home.newsletter.consent.text'))]),
    consentError,
  ]);

  const setFieldError = (input, errorNode, message) => {
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      errorNode.hidden = false;
      errorNode.replaceChildren(icon('no-alert', { size: 'sm' }), el('span', {}, message));
    } else {
      input.removeAttribute('aria-invalid');
      errorNode.hidden = true;
      errorNode.replaceChildren();
    }
  };

  // Not c-btn--primary: tests/home.mjs caps visible primaries at 4 (header,
  // hero, search, final CTA). c-btn--secondary-brand is the same "confident
  // CTA on a dark surface" pairing the hero photo already uses.
  const cta = el('button', { type: 'submit', class: 'c-btn c-btn--secondary-brand c-btn--block' }, t('home.newsletter.cta'));
  const form = el('form', { class: 'c-newsletter__form l-stack l-stack--16', novalidate: true }, [
    emailField, consentField, cta,
  ]);

  const panel = el('div', { class: 'c-newsletter__panel' }, [
    el('p', { class: 't-overline' }, t('home.newsletter.overline')),
    el('h2', { class: 'c-newsletter__title', id: 'newsletter-title' }, t('home.newsletter.title')),
    el('p', { class: 'c-newsletter__text' }, t('home.newsletter.text')),
    form,
  ]);

  const root = el('div', { class: 'c-newsletter' }, [
    image ? el('div', { class: 'c-newsletter__media' }, [
      el('img', { src: image.src, alt: pick(image, 'alt') ?? '', class: 'u-img-cover', loading: 'lazy', decoding: 'async' }),
    ]) : null,
    panel,
  ]);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const emailOk = EMAIL_RE.test(emailInput.value.trim());
    const consentOk = consentInput.checked;
    setFieldError(emailInput, emailError, emailOk ? null : t('home.newsletter.email.error'));
    setFieldError(consentInput, consentError, consentOk ? null : t('home.newsletter.consent.error'));
    if (!emailOk) { emailInput.focus(); return; }
    if (!consentOk) { consentInput.focus(); return; }
    panel.replaceChildren(stateBlock({
      variant: 'success',
      title: t('home.newsletter.success'),
      headingLevel: 2,
    }));
  });

  return root;
}
