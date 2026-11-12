import type { Page, Request } from '@playwright/test';
import type { RawTables } from '@/domain/model';

// Supabase simulado dentro del navegador: TODA petición a supabase.co se responde acá.
// Nada sale a internet y no se toca ningún dato real. Las escrituras quedan bloqueadas (y registradas).

export const SB = 'https://gbrutjlhdcnnlghoaxlu.supabase.co';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

export interface MockUser { id: string; email: string; rol: 'owner' | 'barber' | null; barberoId?: string | null }
export interface MockLog { tables: string[]; rpcs: string[]; writes: string[]; external: string[]; bodies: { op: string; body: unknown }[] }
/** Escrituras permitidas en una prueba, p. ej. 'POST asistencia' o 'rpc marcar_asistencia' (con su respuesta). */
export type Permitidas = Record<string, unknown>;

export async function mockSupabase(page: Page, tables: RawTables, user: MockUser, now: number, permitidas: Permitidas = {}): Promise<MockLog> {
  const log: MockLog = { tables: [], rpcs: [], writes: [], external: [], bodies: [] };
  const exp = Math.floor(now / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.firma-de-prueba`;
  const authUser = { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

  await page.routeWebSocket(/supabase\.co/, () => { /* realtime: se acepta y se ignora */ });
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'localhost') return route.continue();
    if (!u.hostname.endsWith('supabase.co')) { log.external.push(u.href); return route.abort(); }
    return handle(route.request()).then((r) => route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.body) }));
  });

  async function handle(req: Request): Promise<{ status: number; body: unknown }> {
    const u = new URL(req.url()), m = req.method();
    if (m === 'OPTIONS') return { status: 200, body: {} };
    if (u.pathname === '/auth/v1/token') {
      const b = req.postDataJSON() as { email: string; password: string };
      if (b.email !== user.email || b.password !== 'clave-de-prueba') return { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' } };
      return { status: 200, body: { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresh-prueba', user: authUser } };
    }
    if (u.pathname === '/auth/v1/user') return { status: 200, body: authUser };
    if (u.pathname === '/auth/v1/logout') return { status: 204, body: {} };
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = u.pathname.slice(13); log.rpcs.push(fn);
      if (`rpc ${fn}` in permitidas) { log.bodies.push({ op: `rpc ${fn}`, body: req.postDataJSON() }); return { status: 200, body: permitidas[`rpc ${fn}`] }; }
      if (fn === 'caja_resumen') return { status: 200, body: { inicial: 10000, esperado: 34567, pendiente_cobro: 0, ing_efectivo: 0, mov_in: 0, gastos_efectivo: 0, liquidaciones: 0, adelantos: 0, mov_out: 0, ing_transferencia: 0, ing_tarjeta: 0 } };
      return { status: 403, body: { message: 'RPC no permitida en pruebas: ' + fn } };
    }
    if (u.pathname.startsWith('/rest/v1/')) {
      const t = u.pathname.slice(9);
      if (m !== 'GET' && m !== 'HEAD') {
        log.writes.push(`${m} ${t}`);
        if (`${m} ${t}` in permitidas) { log.bodies.push({ op: `${m} ${t}`, body: req.postDataJSON() }); return { status: 201, body: permitidas[`${m} ${t}`] }; }
        return { status: 403, body: { message: 'Escrituras bloqueadas en pruebas' } };
      }
      log.tables.push(t);
      if (t === 'perfiles') return { status: 200, body: user.rol ? [{ rol: user.rol }] : [] };
      if (t === 'barberos' && u.searchParams.get('user_id')) return { status: 200, body: user.barberoId ? [{ id: user.barberoId }] : [] };
      const rows = (tables as Record<string, unknown[]>)[t] ?? [];
      const off = +(u.searchParams.get('offset') ?? 0), lim = +(u.searchParams.get('limit') ?? 1000);
      return { status: 200, body: rows.slice(off, off + lim) };
    }
    return { status: 404, body: {} };
  }
  return log;
}
