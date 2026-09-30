/* /admin/ — progressive touches only; every control also works without it. */
(() => {
  document.documentElement.classList.replace('no-js', 'js');
  // Changing a status (or a filter) saves / applies straight away.
  document.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-autosubmit]');
    if (select && select.form) select.form.requestSubmit ? select.form.requestSubmit() : select.form.submit();
  });

  // Deleting asks first; for several at once the bulk form's confirmation is
  // set only after the same question (without JavaScript its box is ticked).
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.matches('[data-confirm]') && !window.confirm(form.dataset.confirm)) { event.preventDefault(); return; }
    if (form.id === 'bulk') {
      const picked = document.querySelectorAll('[data-pick]:checked').length;
      if (!picked) { event.preventDefault(); window.alert('حدّد طلبًا واحدًا على الأقل.'); return; }
      const doing = form.querySelector('[data-bulk-do]').value;
      const box = form.querySelector('input[name="confirm"]');
      if (doing === 'delete') {
        if (!window.confirm(`حذف ${picked} من الطلبات نهائيًا؟ لا يمكن التراجع.`)) { event.preventDefault(); return; }
        if (box) box.checked = true;
      } else if (box) box.checked = false;
    }
  });
  // Select all, and how many are picked.
  const all = document.querySelector('[data-check-all]');
  const count = () => {
    const n = document.querySelectorAll('[data-pick]:checked').length;
    const out = document.querySelector('[data-picked]');
    if (out) out.textContent = n ? `محدد: ${n}` : out.dataset.idle || out.textContent;
  };
  const idle = document.querySelector('[data-picked]');
  if (idle) idle.dataset.idle = idle.textContent;
  all?.addEventListener('change', () => { document.querySelectorAll('[data-pick]').forEach((b) => { b.checked = all.checked; }); count(); });
  document.addEventListener('change', (event) => { if (event.target.matches('[data-pick]')) count(); });
})();
