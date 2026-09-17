#!/usr/bin/env node
// Production smoke — safe checks against a DEPLOYED site and backend, from the
// outside, with no test controls: the backend answers, refuses foreign
// origins, allows the site origin with credentials, keeps /me behind a
// session, serves (or honestly lacks) the legal documents, and the site's
// public config points at that backend with the production adapters.
//
//   SITE_URL=https://www.example/ API_BASE_URL=https://api.example/v1 node tools/smoke.mjs

const site = (process.env.SITE_URL ?? '').replace(/\/+$/, ''); const api = (process.env.API_BASE_URL ?? '').replace(/\/+$/, '');
if (!site || !api) { console.error('SITE_URL and API_BASE_URL are required'); process.exit(2); }
let pass = 0, fail = 0; const ok = (n, c, note = '') => { if (c) pass++; else { fail++; console.log(`  ✗ ${n} ${note}`); } };
const get = (u, o = {}) => fetch(u, { redirect: 'manual', ...o }).catch(() => null);

const health = await get(`${api}/health`); const hj = health && (await health.json().catch(() => null));
ok('backend answers /health', health?.status === 200 && hj?.ok === true, String(health?.status));
ok('backend is not in test mode', hj?.testControls === false);
ok('backend runs as production', hj?.environment === 'production', hj?.environment);
const envText = await (await get(`${site}/assets/js/data/env.js`))?.text().catch(() => '') ?? '';
ok('site config points at this backend with the production adapters', envText.includes(`"apiBaseUrl": "${api}"`) && envText.includes('"authProvider": "session-api"') && envText.includes('"environment": "production"'));
ok('site config contains nothing secret-looking', !/secret|service[_-]?role|password|private|signing|database/i.test(envText));
const pre = await get(`${api}/me`, { method: 'OPTIONS', headers: { Origin: site, 'Access-Control-Request-Method': 'GET' } });
ok('CORS allows the site origin with credentials', pre?.headers.get('access-control-allow-origin') === site && pre?.headers.get('access-control-allow-credentials') === 'true');
const foreign = await get(`${api}/health`, { headers: { Origin: 'https://evil.example' } });
ok('CORS refuses a foreign origin', foreign?.status === 403 && !foreign?.headers.get('access-control-allow-origin'));
const me = await get(`${api}/me`); ok('/me without a session → 401', me?.status === 401);
const sess = await get(`${api}/auth/session`); ok('/auth/session without a cookie → 401', sess?.status === 401);
ok('HTTPS everywhere', /^https:/.test(site) && /^https:/.test(api));
ok('HSTS on the backend', /max-age/.test(health?.headers.get('strict-transport-security') ?? ''));
for (const kind of ['terms', 'privacy']) { const r = await get(`${api}/legal/${kind}?locale=ar`); const j = r?.status === 200 ? await r.json().catch(() => null) : null; ok(`legal/${kind}: published (200 with version) or honestly missing (404)`, r?.status === 404 || (r?.status === 200 && !!j?.version && !!j?.html), String(r?.status)); if (r?.status === 404) console.log(`  · legal/${kind}: NOT PUBLISHED — the site shows its "not published" state`); }
const files = await get(`${api}/files/anything?exp=1&sig=00`); ok('signed files refuse unsigned access', files?.status === 403);
console.log(`smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
