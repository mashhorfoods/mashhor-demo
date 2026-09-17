// BACKEND / LEGAL — serves the official Terms of Service and Privacy Policy from BACKEND_LEGAL_DIR when the business has supplied them:
//   <dir>/terms.ar.html, terms.en.html, privacy.ar.html, privacy.en.html and <dir>/meta.json
//   meta.json: { "terms": { "version": "…", "effectiveAt": "YYYY-MM-DD", "titleAr": "…", "titleEn": "…" }, "privacy": { … } }
// Missing files → 404 → the website shows its "not published" state. This module never contains legal wording.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.mjs';
export function legalDocument(kind, locale) {
  if (!['terms', 'privacy'].includes(kind)) return null;
  const loc = locale === 'en' ? 'en' : 'ar';
  const file = join(config.legalDir, `${kind}.${loc}.html`); const metaFile = join(config.legalDir, 'meta.json');
  if (!existsSync(file) || !existsSync(metaFile)) return null;
  let meta; try { meta = JSON.parse(readFileSync(metaFile, 'utf8'))[kind]; } catch { return null; }
  if (!meta?.version || !meta?.effectiveAt) return null;
  return { version: String(meta.version), effectiveAt: String(meta.effectiveAt), title: loc === 'ar' ? (meta.titleAr ?? null) : (meta.titleEn ?? null), html: readFileSync(file, 'utf8') };
}
