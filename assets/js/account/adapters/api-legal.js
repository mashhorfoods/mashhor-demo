/* ACCOUNT / ADAPTERS / API LEGAL — Terms and Privacy from the backend (source 'api') or from static files the business supplies (source 'static'). Stage 12.1 */
import { registerLegalAdapter } from '../legal.js';
import { get } from '../../core/api.js';
import { ENV } from '../../data/env.js';
import { route } from '../../data/config.js';

const normalise = (d) => (d && (d.html || d.body) ? { supplied: true, version: d.version ?? null, effectiveAt: d.effectiveAt ?? null, title: d.title ?? null, html: d.html ?? d.body } : { supplied: false });

export const API_LEGAL = registerLegalAdapter({
  id: ENV.legal?.source === 'static' ? 'static-legal' : 'api-legal', dev: false, provider: ENV.legal?.source === 'static' ? 'static files supplied by the business' : 'customer backend API', configSource: 'LEGAL_DOCUMENT_CONFIG',
  async document(kind, locale) {
    if (ENV.legal?.source === 'api') {
      try { return normalise(await get(`/legal/${kind}?locale=${encodeURIComponent(locale)}`)); } catch (e) { if (e?.code === 'notFound') return { supplied: false }; throw e; }
    }
    if (ENV.legal?.source === 'static') {
      const path = (kind === 'terms' ? ENV.legal.termsPath : ENV.legal.privacyPath)?.replace('{locale}', locale);
      if (!path) return { supplied: false };
      const res = await fetch(route(path), { cache: 'no-store' });
      if (res.status === 404) return { supplied: false }; if (!res.ok) throw new Error('legal document unavailable');
      const html = await res.text();
      const version = html.match(/data-version="([^"]+)"/)?.[1] ?? null; const effectiveAt = html.match(/data-effective="([^"]+)"/)?.[1] ?? null; const title = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1] ?? null;
      return { supplied: true, version, effectiveAt, title, html };
    }
    return { supplied: false };
  },
});
