/* ============================================================================
   CORE / LEADS — Phase 6. Where a lead comes from on the public site: the
   contact form (help/contact/) and a request-mode booking (a service with no
   live supplier).

   With a backend (ENV.apiBaseUrl) the contact form posts to POST /contact
   and the backend decides who the lead goes to; a request booking becomes a
   lead when it is claimed (POST /me/bookings/claim, status 'received').

   Without one, outside production, the same actions are mirrored into a
   development store in this browser (localStorage 'no.dev.leads'), which the
   dev supervisor and ops adapters read, so the demo shows a lead arriving.
   Each record carries dev: true. In production with no backend there is
   nowhere to send a message, so the contact form is not offered at all.
   ========================================================================= */
import { ENV, isProduction } from '../data/env.js';
import { post } from './api.js';

const KEY = 'no.dev.leads';
const useApi = () => !!ENV.apiBaseUrl;
const useDev = () => !useApi() && !isProduction();

/** Whether the contact form has anywhere to send a message. */
export const contactAvailable = () => useApi() || useDev();

export function devLeads() {
  try { const all = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(all) ? all : []; } catch { return []; }
}
const saveDevLeads = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ } };

/** Development only: add a lead to this browser's store. `supervisor` is the attributed supervisor's slug, or null. */
export function recordDevLead({ supervisor = null, name = '', contact = '', source, serviceInterest = null, bookingId = null, message = null }) {
  if (!useDev()) return null;
  const at = new Date().toISOString();
  const lead = { id: `dev-lead-${Math.random().toString(36).slice(2, 10)}`, supervisorId: supervisor || null, customerId: null, name, contact, source, serviceInterest, status: 'new', convertedBookingId: null, bookingId, message, createdAt: at, updatedAt: at, dev: true };
  saveDevLeads([lead, ...devLeads()]);
  return lead;
}
/** Development only: change a stored lead (a supervisor setting its status). Null when the id is not in the store. */
export function updateDevLead(id, patch) {
  const all = devLeads(); const l = all.find((x) => x.id === id); if (!l) return null;
  Object.assign(l, patch, { updatedAt: new Date().toISOString() }); saveDevLeads(all); return { ...l };
}

/** Send the contact form: { name, email, phone, message, service, supervisor }. Throws an ApiError-like { code } on failure. */
export async function sendContact({ name, email = '', phone = '', message, service = null, supervisor = null }) {
  if (useApi()) return post('/contact', { name, email, phone, message, service, attribution: supervisor ? { supervisor } : null });
  if (useDev()) { await new Promise((r) => setTimeout(r, 300)); recordDevLead({ supervisor, name, contact: [email, phone].filter(Boolean).join(' · '), source: 'contact', serviceInterest: service, message }); return { received: true, dev: true }; }
  const e = new Error('notConfigured'); e.code = 'notConfigured'; throw e;
}
