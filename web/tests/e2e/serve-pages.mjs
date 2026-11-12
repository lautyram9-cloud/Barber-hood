// Servidor estático mínimo que imita GitHub Pages bajo /Barber-hood/.
// Sirve la carpeta armada por scripts/assemble-pages.sh (o la arma en memoria: legacy + web/dist).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const PREFIX = '/Barber-hood/';

createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!p.startsWith(PREFIX)) { res.writeHead(404).end(); return; }
  p = p.slice(PREFIX.length);
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const file = normalize(p.startsWith('next/') ? join(ROOT, 'web/dist', p.slice(5)) : join(ROOT, p));
  if (!file.startsWith(ROOT) || file.includes('node_modules')) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw 0;
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch { res.writeHead(404).end('404'); }
}).listen(4173, () => console.log('Pages simulado en http://localhost:4173/Barber-hood/'));
