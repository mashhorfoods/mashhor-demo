/* /admin/ — progressive touches only; every control also works without it. */
(() => {
  document.documentElement.classList.replace('no-js', 'js');
  // Changing a status (or a filter) saves / applies straight away.
  document.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-autosubmit]');
    if (select && select.form) select.form.requestSubmit ? select.form.requestSubmit() : select.form.submit();
  });
})();
