// Local server: serves public/ and the API with an in-memory store.
// Usage: ADMIN_PIN=1234 node scripts/dev-server.mjs [port]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { handle } from '../netlify/functions/lib/core.mjs';

const root = new URL('../public/', import.meta.url).pathname;
const mem = new Map();
const store = {
  getJSON: async (k) => (mem.has(k) ? structuredClone(mem.get(k)) : null),
  setJSON: async (k, v) => { mem.set(k, structuredClone(v)); },
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), store, { ADMIN_PIN: process.env.ADMIN_PIN || '1234' });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  let p = normalize(join(root, url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) p = join(p, 'index.html');
  try {
    const data = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.argv[2]) || 8888, () => console.log('http://localhost:' + (Number(process.argv[2]) || 8888)));
