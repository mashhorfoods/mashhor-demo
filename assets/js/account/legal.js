/* ============================================================================
   ACCOUNT / LEGAL — the Terms of Service and Privacy Policy seam. Stage 12.1

   The documents are business content the site never writes: an adapter
   fetches them (from the backend, or from static files the business
   supplies) and the pages render them. When nothing is configured the
   adapter answers { supplied: false } and the pages say so — no placeholder
   text is ever shown as if it were the policy.

   Adapter contract:  document(kind, locale) → { supplied, version, effectiveAt, title, html }
   Rendering: the HTML is sanitised (no scripts, frames, handlers or URLs
   with a script scheme) before it enters the page.
   ========================================================================= */

let adapter = null;
export function registerLegalAdapter(a) { adapter = a; return a; }
export const legalAdapter = () => adapter;

export const KINDS = ['terms', 'privacy'];
const cache = new Map();

export async function legalDocument(kind, locale) {
  if (!KINDS.includes(kind)) throw new Error(`unknown legal document ${kind}`);
  const key = `${kind}:${locale}`;
  if (cache.has(key)) return cache.get(key);
  const doc = adapter ? await adapter.document(kind, locale) : { supplied: false };
  if (doc?.supplied) cache.set(key, doc);
  return doc ?? { supplied: false };
}

/** Both documents' versions, for the acceptance record. Null versions mean "not supplied". */
export async function legalVersions(locale) {
  const [terms, privacy] = await Promise.all(KINDS.map((k) => legalDocument(k, locale).catch(() => ({ supplied: false }))));
  return { terms: terms.supplied ? { version: terms.version ?? null, effectiveAt: terms.effectiveAt ?? null } : null, privacy: privacy.supplied ? { version: privacy.version ?? null, effectiveAt: privacy.effectiveAt ?? null } : null };
}

/** Strip anything executable from supplied HTML; keep the document's structure. */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form, input, button, link, meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || a.name === 'srcdoc') n.removeAttribute(a.name);
      else if ((a.name === 'href' || a.name === 'src') && /^\s*(javascript|data|vbscript):/i.test(a.value)) n.removeAttribute(a.name);
    }
    if (n.tagName === 'A') n.setAttribute('rel', 'noopener');
  });
  return doc.body.innerHTML;
}
