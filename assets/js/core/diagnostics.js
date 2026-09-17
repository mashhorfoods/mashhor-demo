/* ============================================================================
   DIAGNOSTICS — safe technical events. Stage 12.1

   track('auth.failure', { code }) keeps a small in-memory ring (window.no.diagnostics),
   prints in development, and — when ENV.diagnostics.endpoint is set — sends a
   beacon to the backend. Values are scrubbed: nothing that looks like a
   credential, token, card number or free-text personal data gets through, and
   only short scalar fields are kept at all.
   ========================================================================= */

import { ENV, isProduction } from '../data/env.js';

const SENSITIVE = /pass|token|secret|authorization|cookie|card|cvv|pan\b|iban|passport|email|phone|name|address|dob|birth/i;
const ring = []; const MAX = 50;

function scrub(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE.test(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 80 && !/[A-Za-z0-9+/=_-]{32,}/.test(v)) out[k] = v;   // no long opaque strings
  }
  return out;
}

export function track(event, data = {}) {
  const entry = { event, at: new Date().toISOString(), env: ENV.environment, page: location.pathname, ...scrub(data) };
  ring.push(entry); if (ring.length > MAX) ring.shift();
  if (!isProduction()) console.info('[no:diag]', event, entry);
  const endpoint = ENV.diagnostics?.endpoint;
  if (endpoint && ENV.apiBaseUrl) {
    try { navigator.sendBeacon?.(`${ENV.apiBaseUrl}${endpoint}`, new Blob([JSON.stringify(entry)], { type: 'application/json' })); } catch { /* never throws into the page */ }
  }
  return entry;
}
export const diagnostics = () => [...ring];
if (typeof window !== 'undefined') { window.no = { ...(window.no ?? {}), diagnostics }; }
