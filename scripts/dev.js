// Local dev server that behaves like Vercel: clean URLs (/grooming -> grooming.html),
// static files, and the /api/lead function. Run with: npm run dev
//
// Set FAKE_ZOHO=1 to log leads to the console instead of needing real Zoho tokens.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 4321;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.webmanifest': 'application/manifest+json'
};

// Load .env.local (gitignored) so the real Zoho tokens can be used locally with `npm run dev:real`.
try {
  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env.local, fine */ }

if (process.env.FAKE_ZOHO) {
  // Point the lead function at a local echo endpoint so the whole submit path can be exercised.
  process.env.LEAD_WEBHOOK_URL = `http://127.0.0.1:${PORT}/__fake-webhook`;
}
const lead = require(path.join(ROOT, 'api', 'lead.js'));

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let p = decodeURIComponent(url.pathname);

  if (p === '/__fake-webhook') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { console.log('[fake webhook] received lead:\n' + raw); send(res, 200, '{"ok":true}', 'application/json'); });
    return;
  }
  if (p === '/api/lead') {
    res.statusCode = 200;
    return lead(req, res);
  }

  if (p.endsWith('/') && p !== '/') { p = p.slice(0, -1); }
  let file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return send(res, 404, 'Not found: ' + p);
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Birdhouse dev server → http://localhost:${PORT}  (FAKE_ZOHO=${process.env.FAKE_ZOHO ? 'on' : 'off'})`);
});
