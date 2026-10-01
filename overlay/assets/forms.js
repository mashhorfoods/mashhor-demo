/* =============================================================================
   Form messages in the page's language.

   The contact form checks itself with the browser's own validation, whose
   messages follow the device's language, not the page's: an Arabic page on
   an English phone said "Please fill out this field." These say it in the
   language the visitor chose, and clear the moment the field is fixed.
   Forms with their own messages (the campaign page) never reach here: they
   are novalidate, so the browser raises no "invalid" event for them.
   ============================================================================= */
(() => {
  'use strict';

  const TEXT = {
    en: {
      required: 'Please fill in this field.',
      choose: 'Please choose one.',
      email: 'Enter a valid email, like name@example.com.',
      other: 'Please check this field.',
    },
    ar: {
      required: 'هذا الحقل مطلوب.',
      choose: 'اختر واحدًا من فضلك.',
      email: 'اكتب بريدًا إلكترونيًا صحيحًا، مثل name@example.com',
      other: 'راجع هذا الحقل من فضلك.',
    },
  };
  const isField = (el) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

  document.addEventListener('invalid', (e) => {
    const field = e.target;
    if (!isField(field)) return;
    const t = TEXT[document.documentElement.lang?.startsWith('ar') ? 'ar' : 'en'];
    field.setCustomValidity('');
    const v = field.validity;
    let message = t.other;
    if (v.valueMissing) message = field.type === 'radio' || field.tagName === 'SELECT' ? t.choose : t.required;
    else if (v.typeMismatch && field.type === 'email') message = t.email;
    field.setCustomValidity(message);
  }, true);

  // A fixed field is valid again straight away (and a radio group as a whole).
  const clear = (e) => {
    const field = e.target;
    if (!isField(field)) return;
    if (field.type === 'radio' && field.form && field.name) {
      field.form.querySelectorAll(`input[type="radio"][name="${CSS.escape(field.name)}"]`).forEach((r) => r.setCustomValidity(''));
    } else {
      field.setCustomValidity('');
    }
  };
  document.addEventListener('input', clear, true);
  document.addEventListener('change', clear, true);
})();

/* =============================================================================
   The contact form sends to the team (lead.php), not to the visitor's mail app.

   The mail app route lost people: on a phone it opens an app many never use,
   nothing is kept, and "sent" was counted the moment it opened. Now the
   message goes to lead.php (form=site), which stores and emails it; the form
   says "received" only when the server says it is held. If it cannot be
   (no server, as on the GitHub Pages preview, or a failure), the old route
   takes over — the mail app with the message written, and WhatsApp beside it.
   Without JavaScript the form still opens the mail app (its action).
   This listens on the document in the capture phase, so it answers before
   the site script's mail-app handler on the form, which it replaces.
   ============================================================================= */
(() => {
  'use strict';

  const TEXT = {
    en: { sending: 'Sending…', sent: 'Received — thank you. We’ll get back to you as soon as possible, on WhatsApp if you left a number, otherwise by email.', failed: 'It could not be sent from here, so your email app has the message ready. WhatsApp works too:', general: 'General enquiry' },
    ar: { sending: 'جارٍ الإرسال…', sent: 'وصلتنا رسالتك، شكرًا لك. سنتواصل معك في أقرب فرصة ممكنة، على واتساب إن تركت رقمك، وإلا فبالبريد.', failed: 'تعذّر الإرسال من هنا، لذلك جهّزنا الرسالة في تطبيق البريد لديك. ويمكنك أيضًا عبر واتساب:', general: 'استفسار عام' },
  };
  const lang = () => (document.documentElement.lang?.startsWith('ar') ? 'ar' : 'en');
  const track = (event, props) => { try { window.plausible?.(event, { props }); } catch { /* analytics never blocks a message */ } };
  const device = () => (matchMedia('(max-width: 47.99em)').matches ? 'mobile' : matchMedia('(max-width: 63.99em)').matches ? 'tablet' : 'desktop');

  document.addEventListener('submit', async (event) => {
    const form = event.target instanceof HTMLFormElement && event.target.matches('[data-contact-form]') ? event.target : null;
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.getAttribute('aria-busy') === 'true') return;

    const t = TEXT[lang()];
    const status = form.querySelector('[data-contact-status]');
    const fallback = form.querySelector('[data-contact-fallback]');
    const button = form.querySelector('button[type="submit"], [type="submit"]');
    const about = form.querySelector('[data-contact-about]');
    const option = about?.selectedOptions?.[0];
    const aboutValue = about?.value || '';
    const aboutLabel = aboutValue && option ? option.textContent.trim() : '';

    const data = new FormData(form);
    data.set('form', 'site');
    data.set('about_label', aboutLabel);
    data.set('t_landing', location.pathname);
    data.set('t_device', device());
    data.set('t_path', 'site-form');

    form.setAttribute('aria-busy', 'true');
    if (button) button.disabled = true;
    if (fallback) fallback.hidden = true;
    if (status) status.textContent = t.sending;

    let ok = false;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch('/lead.php', { method: 'POST', body: data, headers: { Accept: 'application/json' }, signal: abort.signal });
      ok = response.ok && (await response.json().catch(() => ({}))).ok === true;
    } catch { ok = false; }
    clearTimeout(timer);
    form.removeAttribute('aria-busy');
    if (button) button.disabled = false;

    if (ok) {
      track('enquiry_sent', { about: aboutValue || 'general', channel: 'form' });
      form.reset();
      if (status) { status.textContent = t.sent; status.classList.add('is-sent'); status.focus?.(); }
      return;
    }
    // The old route: the mail app with the message written, and WhatsApp.
    track('enquiry_failed', { about: aboutValue || 'general', channel: 'form' });
    const name = String(data.get('name') || '').trim();
    const subject = `${aboutLabel || t.general} — ${name}`;
    const body = [aboutLabel, String(data.get('message') || '').trim(), '', `— ${name}`, String(data.get('email') || ''), String(data.get('whatsapp') || '')]
      .filter((line, i) => line !== '' || i === 2).join('\n');
    if (status) { status.textContent = t.failed; status.classList.remove('is-sent'); }
    if (fallback) fallback.hidden = false;
    window.location.href = `mailto:${form.dataset.contactForm}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, true);
})();

