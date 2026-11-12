// Falla si en la carpeta publicada aparece una clave secreta real de Supabase.
// Busca claves sb_secret_ con formato real y tokens JWT con rol service_role.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('uso: node scripts/check-secrets.mjs <carpeta>'); process.exit(2); }
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dir);

const problems = [];
for (const f of files.filter((f) => /\.(html|js|css|json|txt|map)$/.test(f))) {
  const s = readFileSync(f, 'utf8');
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(s)) problems.push(`${f}: clave sb_secret_`);
  for (const jwt of s.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    try { if (JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role === 'service_role') problems.push(`${f}: JWT service_role`); } catch {}
  }
}
if (problems.length) { console.error('CLAVES SECRETAS DETECTADAS:\n' + problems.join('\n')); process.exit(1); }
console.log(`OK: sin claves secretas (${files.length} archivos revisados)`);
