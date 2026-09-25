/* ============================================================================
   COMPONENTS / SESSION — §10 / §28. The header reads a session; it does
   not own one. Stage 12 calls setSession() and the account UI re-renders.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   SESSION — §10 / §28.
   The header reads a session; it does not own one. Stage 12 calls setSession()
   and the account menu re-renders. Roles beyond `customer` do NOT add entries
   here: supervisor and admin navigation are separate systems (§28), and a
   supervisor profile page still shows the Travel & Tourism header (§29).
   ------------------------------------------------------------------------ */
export let session = { authenticated: false, name: '', role: 'guest' };
export const sessionListeners = new Set();

export function setSession(next = {}) {
  session = { ...session, ...next };
  sessionListeners.forEach((fn) => fn(session));
}
export const getSession = () => ({ ...session });

export const initials = (name) => (name || '')
  .trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('') || '؟';

