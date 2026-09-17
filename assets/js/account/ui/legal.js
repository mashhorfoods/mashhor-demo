/* ACCOUNT / UI / LEGAL — the Terms of Service and Privacy Policy pages. Public; the text is the business's, fetched through the legal adapter, never written here. Stage 12.1 */
import { el, render, setPageHead } from '../../core/dom.js';
import { t, getLocale } from '../../core/i18n.js';
import { dateShort } from '../../core/format.js';
import { route } from '../../data/config.js';
import { stateBlock, loadingBlock } from '../../components/states.js';
import { legalDocument, sanitizeHtml } from '../legal.js';
import { errorText } from './shell.js';

export async function mountLegal({ root = document, kind }) {
  setPageHead({ title: t(`page.legal.${kind}`), description: t('page.legal.description') });
  const host = root.querySelector('[data-legal="main"]');
  const head = el('div', { class: 'l-stack l-stack--8' }, [el('h1', { class: 't-h1', id: 'legal-title' }, t(`legal.${kind}.title`))]);
  render(host, [head, loadingBlock(t('acct.state.loading'))]);
  const paint = async () => {
    try {
      const doc = await legalDocument(kind, getLocale());
      if (!doc.supplied) { render(host, [head, stateBlock({ variant: 'info', iconName: 'no-documents', headingLevel: 2, title: t('legal.notSupplied.title'), text: t('legal.notSupplied.text'), actions: [{ label: t('legal.back'), href: route(''), variant: 'c-btn--primary' }] })]); document.documentElement.dataset.legal = 'not-supplied'; return { supplied: false }; }
      const meta = el('p', { class: 'c-legal__meta' }, [doc.version ? el('span', { dataset: { version: doc.version } }, `${t('legal.version')} ${doc.version}`) : null, doc.effectiveAt ? el('span', {}, `${t('legal.effective')} ${dateShort(doc.effectiveAt)}`) : null]);
      const body = el('div', { class: 'c-legal__body', dataset: { legal: 'body' } }); body.innerHTML = sanitizeHtml(doc.html);
      if (doc.title) head.querySelector('h1').textContent = doc.title;
      render(host, [head, meta, body]); document.documentElement.dataset.legal = 'supplied';
      return { supplied: true, version: doc.version };
    } catch (error) {
      render(host, [head, stateBlock({ variant: 'error', headingLevel: 2, title: t('legal.error.title'), text: errorText(error?.code), actions: [{ id: 'retry', label: t('acct.retry'), variant: 'c-btn--primary', onClick: paint }] })]);
      return { supplied: false, error: error?.code ?? 'failed' };
    }
  };
  return paint();
}
