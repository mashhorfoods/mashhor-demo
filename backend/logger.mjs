// BACKEND / LOGGER — structured lines to stdout with sensitive keys removed. Never logs passwords, tokens, cookies, card data, document contents or free-text personal fields.
const SENSITIVE = /pass|token|secret|authorization|cookie|card|cvv|iban|passport|email|phone|name|address|dob|birth|body|html/i;
export function scrub(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE.test(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
    else if (typeof v === 'string') out[k] = v.length > 120 ? `${v.slice(0, 117)}…` : v;
  }
  return out;
}
export const log = (level, event, data = {}) => { process.stdout.write(JSON.stringify({ at: new Date().toISOString(), level, event, ...scrub(data) }) + '\n'); };
export const info = (event, data) => log('info', event, data);
export const warn = (event, data) => log('warn', event, data);
export const error = (event, data) => log('error', event, data);
