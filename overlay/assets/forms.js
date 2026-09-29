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
