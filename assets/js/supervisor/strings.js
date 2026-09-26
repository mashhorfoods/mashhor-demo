/* SUPERVISOR / STRINGS — registers this portal's string slice (core/strings/{ar,en}-supervisor.js).
   Imported by the portal's UI entry modules, so public pages never load it. Phase 5 */
import { registerStrings } from '../core/i18n.js';

await registerStrings('supervisor', {
  ar: () => import('../core/strings/ar-supervisor.js'),
  en: () => import('../core/strings/en-supervisor.js'),
});
