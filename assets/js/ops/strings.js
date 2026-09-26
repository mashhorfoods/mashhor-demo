/* OPS / STRINGS — registers this portal's string slice (core/strings/{ar,en}-ops.js).
   Imported by the portal's UI entry modules, so public pages never load it. Phase 5 */
import { registerStrings } from '../core/i18n.js';

await registerStrings('ops', {
  ar: () => import('../core/strings/ar-ops.js'),
  en: () => import('../core/strings/en-ops.js'),
});
