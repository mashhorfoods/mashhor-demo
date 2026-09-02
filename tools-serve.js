#!/usr/bin/env node
/* STAGE M13 §44 — the production preview.
   -------------------------------------------------------------------------
   `dist/` is what gets uploaded, and opening it with file:// or with a bare
   static server is not the same thing as serving it: neither compresses, and
   neither sets a cache header. This serves dist/ the way DEPLOY.md asks the
   real host to serve it, so what is measured here is what visitors get:

     • gzip on html, css, js, svg, txt, xml       (DEPLOY.md §compression)
     • Cache-Control: no-cache on index.html      so updates appear
     • Cache-Control: immutable, 1 year on assets fonts, images, logos
     • /404.html for anything missing             (DEPLOY.md §404 handling)

   GZIP=0 turns compression off, which is what a host with no configuration at
   all does — useful for seeing exactly what that costs.

   Usage:  node tools-serve.js [dir] [port]      default dist/ on 8080
*/
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, 'dist'));
const PORT = +(process.argv[3] || process.env.PORT || 8080);
const GZIP = process.env.GZIP !== '0';

const TYPES = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.json':'application/json',
  '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp',
  '.jpg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2',
  '.txt':'text/plain; charset=utf-8', '.xml':'application/xml',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.svg', '.json', '.txt', '.xml']);

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.join(ROOT, url);

  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const nf = path.join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'not found');
  }

  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
  headers['Cache-Control'] = ext === '.html'
    ? 'no-cache'
    : 'public, max-age=31536000, immutable';

  let body = fs.readFileSync(file);
  if (GZIP && COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    body = zlib.gzipSync(body, { level: 9 });
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(PORT, () => {
  console.log('serving ' + path.relative(process.cwd(), ROOT) + '/ on http://127.0.0.1:' + PORT
    + '   gzip ' + (GZIP ? 'on' : 'OFF'));
});
