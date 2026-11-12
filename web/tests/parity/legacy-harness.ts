import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import type { RawTables } from '@/domain/model';

// Ejecuta el JavaScript ORIGINAL de la versión estable (../index.html) dentro de un
// contexto aislado de Node, con un DOM mínimo simulado y un cliente Supabase falso
// que devuelve las filas de prueba. Nada sale a la red.

const LEGACY_HTML = fileURLToPath(new URL('../../../index.html', import.meta.url));

export function legacySource(): string {
  const html = readFileSync(LEGACY_HTML, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length !== 1) throw new Error('Se esperaba un único <script> inline en index.html');
  return scripts[0];
}

function el(): Record<string, unknown> {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', dataset: {}, checked: false,
    classList: { toggle() {}, contains: () => false, add() {}, remove() {} },
    closest: () => null, appendChild() {}, remove() {}, click() {}, blur() {}, focus() {},
  };
}

export interface Legacy {
  run<T = unknown>(code: string): T;
  /** Igual que run, pero normaliza a JSON (independiza de los objetos del otro contexto). */
  json<T = unknown>(code: string): T;
  /** Pone un valor del lado de Node accesible desde el código legacy (p. ej. __dom, __rec). */
  set(nombre: string, valor: unknown): void;
}

export async function loadLegacy(tables: RawTables, opts: { now: number; owner: boolean; meBarberoId?: string }): Promise<Legacy> {
  const els = new Map<string, Record<string, unknown>>();
  const byId = (id: string) => {
    if (!els.has(id)) els.set(id, el());
    const e = els.get(id)!, dom = (ctx.__dom ?? {}) as Record<string, unknown>;
    if (id in dom) { const v = dom[id] as unknown; if (typeof v === 'boolean') e.checked = v; else e.value = v; }
    return e;
  };
  const ctx: Record<string, unknown> = {
    console,
    document: {
      // Elementos persistentes por id; el valor de los campos sale de __dom (formularios simulados).
      querySelector: (q: string) => byId(q.replace(/^#/, '')), querySelectorAll: () => [], getElementById: (id: string) => byId(id), createElement: () => el(),
      addEventListener() {}, activeElement: null, body: el(),
    },
    navigator: { onLine: true },
    location: { hash: '', reload() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {}, scrollTo() {}, matchMedia: () => ({ matches: false }),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // Reloj fijo dentro del contexto legacy (el mismo que usan los tests del lado nuevo).
  vm.runInContext(`(()=>{const D=Date,N=${opts.now};globalThis.Date=class extends D{constructor(...a){a.length?super(...a):super(N)}static now(){return N}}})()`, ctx);
  vm.runInContext(legacySource(), ctx, { filename: 'index.html' });

  ctx.__rows = tables;
  vm.runInContext(`
    sb = {
      from(t){ const rows = (__rows[t] || []); const q = { select(){return q}, order(){return q},
        range(a,b){ return Promise.resolve({ data: rows.slice(a, b + 1), error: null }) } }; return q },
      rpc(){ return Promise.resolve({ data: null, error: null }) },
    };
    S.owner = ${opts.owner}; S.admin = ${opts.owner}; S.me = ${opts.meBarberoId ? JSON.stringify(opts.meBarberoId) : 'null'}; S.db = {};
  `, ctx);
  let toast = '';
  ctx.__toast = (m: string) => { toast = m; ctx.__lastToast = m; };
  vm.runInContext(`toast = (m) => __toast(m)`, ctx); // toast es function: se puede reasignar
  await vm.runInContext('load()', ctx);
  if (toast.startsWith('Error')) throw new Error('La versión estable falló al cargar los datos de prueba: ' + toast);

  const run = <T,>(code: string) => vm.runInContext(code, ctx) as T;
  return { run, json: <T,>(code: string) => JSON.parse(JSON.stringify(run(code)) ?? 'null') as T, set: (k, v) => { ctx[k] = v; } };
}
