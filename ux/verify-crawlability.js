/* STAGE M13 — crawlability, as a standing audit.
   The site has to be findable by two different kinds of reader, and they want
   different things. A search crawler wants one canonical URL, a sitemap, and
   structured data it can trust. An AI assistant wants the answer in the FIRST
   response, because most of them do not run JavaScript at all — and it wants
   to know what it must not infer, because the alternative is that it invents.

   This harness asks for both, over real HTTP, against what actually ships.
   It needs no browser: everything it checks is in the bytes the server sends,
   which is exactly the point — if a check here needed a browser to pass, the
   crawlers that do not have one would fail it.

   Run:  node tools-serve.js &
         SITE_URL="http://127.0.0.1:8080/" node ux/verify-crawlability.js
   SITE_URL must be http(s): robots.txt, sitemap.xml and llms.txt are server
   surfaces and do not exist over file://.
*/
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const BASE = (process.env.SITE_URL || 'http://127.0.0.1:8080/').replace(/\/$/, '');
if (!/^https?:/.test(BASE)) {
  console.error('  SITE_URL must be http(s) — robots.txt and sitemap.xml are server surfaces.');
  process.exit(1);
}
let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log('  FAIL  ' + m); } else console.log('  PASS  ' + m); };

const get = (path, ua) => new Promise((res, rej) => {
  const u = new URL(BASE + path);
  const lib = u.protocol === 'https:' ? https : http;
  lib.get({ hostname: u.hostname, port: u.port, path: u.pathname,
            headers: { 'User-Agent': ua, 'Accept-Encoding': 'gzip' } }, r => {
    const chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => {
      let buf = Buffer.concat(chunks);
      if (r.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
      res({ status: r.statusCode, headers: r.headers, body: buf.toString() });
    });
  }).on('error', rej);
});

/* A robots.txt evaluator, because reading the file is not the same as knowing
   what it permits: naming an agent gives it its OWN group, and it then stops
   reading the wildcard one. A file that looks generous can quietly starve a
   crawler that way. Longest-match wins, per the RFC. */
function allowed(robots, ua, path) {
  const lines = robots.split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  const groups = []; let cur = null;
  for (const l of lines) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
    } else if ((k === 'allow' || k === 'disallow') && cur) {
      cur.rules.push({ allow: k === 'allow', path: v });
    }
  }
  const lower = ua.toLowerCase();
  let g = groups.find(x => x.agents.some(a => a !== '*' && lower.includes(a)))
       || groups.find(x => x.agents.includes('*'));
  if (!g) return true;
  let best = null;
  for (const r of g.rules) {
    if (!r.path) continue;
    if (path.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
  }
  return best ? best.allow : true;
}

/* the agents that matter to this site: the search engines its customers use,
   and the assistants that now answer "من ينقل كبار السن في الرياض؟" */
const AGENTS = [
  'Googlebot', 'Googlebot-Image', 'Bingbot', 'Applebot', 'DuckDuckBot', 'YandexBot', 'Slurp',
  'Google-Extended', 'Applebot-Extended', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User',
  'meta-externalagent', 'Amazonbot', 'MistralAI-User', 'cohere-ai', 'CCBot',
];

(async () => {
  console.log('### robots.txt');
  const robots = (await get('/robots.txt', 'x')).body;
  ok(!/^\s*Disallow:\s*\/\s*$/m.test(robots), 'nothing is blanket-disallowed');
  /* the unknown agent is the important one: it proves the wildcard group still
     works after twenty-two named groups were added in front of it */
  const probes = AGENTS.concat(['SomeCrawlerNobodyHasHeardOf/2.0']);
  const blocked = probes.filter(a => !allowed(robots, a, '/'));
  ok(blocked.length === 0, 'all ' + probes.length + ' agents, including one nobody has named, may fetch /'
     + (blocked.length ? ' — blocked: ' + blocked.join(', ') : ''));
  const named = AGENTS.filter(a => new RegExp('^User-agent:\\s*' + a + '\\s*$', 'mi').test(robots));
  ok(named.length === AGENTS.length, named.length + ' of ' + AGENTS.length
     + ' agents are named explicitly rather than left to inherit the wildcard');
  ok(/^Sitemap:\s*https:\/\/aunaldrb\.com\/sitemap\.xml$/m.test(robots), 'sitemap is declared, absolute and https');

  console.log('\n### what each crawler actually receives');
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
                    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ClaudeBot/1.0; +claudebot@anthropic.com',
                    'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)']) {
    const r = await get('/', ua);
    const text = r.body.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    const name = /compatible; ([A-Za-z-]+)/.exec(ua) ? /compatible; ([A-Za-z-]+)/.exec(ua)[1] : 'Googlebot';
    ok(r.status === 200 && text.length > 4000,
       name.padEnd(15) + ' HTTP ' + r.status + ', ' + text.length + ' chars of text in the first response');
  }

  console.log('\n### machine-readable surfaces');
  const llms = await get('/llms.txt', 'GPTBot');
  ok(llms.status === 200 && /text\/plain/.test(llms.headers['content-type']), '/llms.txt  HTTP ' + llms.status + '  ' + llms.headers['content-type']);
  ok(/aunaldrb\.com/.test(llms.body) && /ذوي الاحتياجات الخاصة/.test(llms.body), '/llms.txt names the canonical URL and the required terminology');
  ok(/What this site does not state|لا يقدّمه/.test(llms.body), '/llms.txt states what must NOT be inferred');

  const sm = await get('/sitemap.xml', 'Googlebot');
  ok(sm.status === 200 && /<loc>https:\/\/aunaldrb\.com\/<\/loc>/.test(sm.body), 'sitemap serves and names the canonical URL');
  ok(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sm.body), 'sitemap carries a lastmod');

  console.log('\n### the page itself');
  const page = (await get('/', 'Googlebot')).body;
  ok(/<link rel="canonical" href="https:\/\/aunaldrb\.com\/">/.test(page), 'canonical is absolute and self-referencing');
  ok(/<meta name="robots" content="index, follow/.test(page), 'robots meta says index, follow');
  ok(/<html lang="ar" dir="rtl">/.test(page), 'lang and dir are declared');
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page);
  ok(!!ld, 'JSON-LD block present');
  if (ld) {
    const g = JSON.parse(ld[1])['@graph'];
    ok(Array.isArray(g) && g.length === 10, 'JSON-LD parses, ' + g.length + ' nodes');
    const types = g.map(x => x['@type']);
    ok(types.includes('LocalBusiness') && types.includes('WebSite') && types.includes('WebPage'),
       'graph carries LocalBusiness + WebSite + WebPage');
    ok(types.filter(t => t === 'Service').length === 7, 'all seven services are described');
    const biz = g.find(x => x['@type'] === 'LocalBusiness');
    ok(!!biz.address && !!biz.telephone && !!biz.openingHoursSpecification, 'business has address, telephone and hours');
    ok(!('aggregateRating' in biz) && !('review' in biz) && !('makesOffer' in biz),
       'no invented rating, review or offer');
  }
  const notFound = await get('/does-not-exist', 'Googlebot');
  ok(notFound.status === 404 && /noindex/.test(notFound.body), '404 answers 404 and is noindex');

  console.log('\n' + (n - f) + '/' + n + ' checks pass');
  process.exit(f ? 1 : 0);
})();
