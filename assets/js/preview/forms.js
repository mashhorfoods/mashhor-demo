/* ============================================================================
   PREVIEW / FORM EXTRAS

   The one-time-code field and the file drop zone: Stage 12 controls
   (sign-in, documents) previewed in the guide.
   Only the style guide imports this; no customer page loads it. Stage 10.12
   ========================================================================= */

import { qs, qsa, el } from '../core/dom.js';
import { icon } from '../components/ui.js';

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

