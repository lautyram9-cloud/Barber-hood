import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as A from '@/domain/ajustes';
import { fixtures } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X, fmt = L.formatoPesos;

for (const seed of [1, 2, 3, 7, 42, 2026]) describe(`dueño y ajustes · semilla ${seed}`, () => {
  const now = Date.parse('2026-11-12T15:37:00-03:00'), all = fixtures(seed, '2026-11-12T15:37:00-03:00');
  let lg: Legacy, d: AppData;
  beforeAll(async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); lg = await loadLegacy(all, { now, owner: true }); d = buildAppData(all); });
  afterAll(() => vi.useRealTimers());
  const cmp = async (call: string, dom: Record<string, unknown>, err: string | null, nueva: ((db: never) => Promise<unknown>) | null, ok?: string) => {
    const v = grabador({ single: { id: 'nuevo-id' } }), n = grabador({ single: { id: 'nuevo-id' } });
    lg.set('__rec', v.db); lg.set('__dom', dom); lg.set('__lastToast', ''); lg.run('sb=__rec');
    await lg.run(call); if (nueva) await nueva(n.db as never);
    if (ok !== undefined || err) expect(lg.run('__lastToast')).toBe(err ?? ok);
    expect(J(n.llamadas)).toEqual(J(v.llamadas));
  };

  it('Dueño: resultado, totales privados y lista iguales', () => {
    for (const per of ['dia', 'sem', 'mes', 'ano'] as const) for (const ref of [L.today(), '2026-10-05']) {
      lg.run(`S.per=${js(per)};S.ref=${js(ref)}`);
      const html = lg.run<string>('V.due()'), [a, b] = L.rango(per, ref), r = L.resultado(d, a, b), M = A.movimientosDueno(d, a, b), t = A.totalesDueno(M);
      expect(html).toContain(`<span>Ingresos ${fmt(r.ingresos)} · Gastos ${fmt(r.gastosFijos + r.gastosVariables)} · Comisiones ${fmt(r.comisiones)} · Costo prod. ${fmt(r.costoProductos)} · Pérdidas ${fmt(r.perdidas)}</span><b>${fmt(r.neto)}</b>`);
      expect(html).toContain(`<small>Ingresos</small><b class="pos">${fmt(t.ingresos)}</b></div><div><small>Gastos</small><b class="neg">${fmt(t.gastos)}</b></div><div><small>Neto</small><b>${fmt(t.neto)}</b>`);
      const filas = lg.run<string>(`${js(M.map((m) => m.id))}.map(id=>S.dueno.find(m=>m.id==id)).map(m=>row(m,'dueno_mov')).join('')`);
      expect(html).toContain(`<div class="c">${filas || '<p class="mu">Sin movimientos.</p>'}</div>`);
    }
  });

  it('Dueño: guardar movimiento envía lo mismo', async () => {
    for (const [t, c, m, f] of [['ing', 'Retiro', '20000', '2026-11-10'], ['gas', 'Nafta', '5000', ''], ['ing', '', '100', ''], ['gas', 'X', '0', '']])
      await cmp('A.adddue()', { dt: t, dc: c, dm: m, dd: f }, A.validarDueno(c, m), A.validarDueno(c, m) ? null : (db) => A.guardarDueno(db, t, c, m, f));
  });

  it('Ajustes: disponibilidad, barberos, excepciones y servicios iguales', () => {
    const html = lg.run<string>('V.aj()');
    for (const dia of A.ORDEN_DIAS) {
      const tx = A.textoTramos(d.horario, dia);
      expect(html).toContain(`<input type="checkbox" id="hd${dia}" style="width:auto;margin:0" ${tx ? 'checked' : ''}> ${A.DIAS[dia]}</label><input id="ha${dia}" value="${tx}"`);
    }
    for (const b of d.barberos) {
      expect(html).toContain(`<span>${b.nombre} <small>${b.slotMin || 30} min · ${b.userId ? 'usuario vinculado' : 'sin usuario'}</small></span>`);
      expect(html).toContain(`value="${b.comisionPct == null ? '' : b.comisionPct}"`);
      for (const x of d.comisionesBarbero.filter((y) => y.barberoId == b.id)) expect(html).toContain(`<small>${A.nombreItem(d, x)}: ${x.pct}%</small>`);
    }
    expect(html).toContain(`<h3>Servicios y comisión</h3>${d.servicios.map((s) => `<div class="r"><span>${s.nombre} <small>${fmt(s.precio)} · comisión ${s.comisionPct}% · ${s.duracionMin ? s.duracionMin + ' min' : 'duración según barbero'}</small></span><button data-a="delsrv" data-i="${s.id}">×</button></div>`).join('')}`);
  });

  it('Ajustes: guardar horarios envía lo mismo (o el mismo error)', async () => {
    const casos: Record<number, { abierto: boolean; tramos: string }>[] = [
      Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((x) => [x, { abierto: x > 0, tramos: x == 6 ? '9:00-13:00' : '10:00-13:00, 15:30 - 20:00' }])),
      Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((x) => [x, { abierto: x == 2, tramos: x == 2 ? 'cualquier cosa' : '' }])),
      Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((x) => [x, { abierto: false, tramos: '10:00-20:00' }])),
    ];
    for (const f of casos) {
      const dom: Record<string, unknown> = {}; for (let x = 0; x < 7; x++) { dom['hd' + x] = f[x].abierto; dom['ha' + x] = f[x].tramos; }
      const r = A.filasHorario(f);
      await cmp('A.savehor()', dom, 'error' in r ? r.error : null, 'error' in r ? null : (db) => A.guardarHorarios(db, r.filas), 'Horarios guardados');
    }
  });

  it('Ajustes: barberos, comisiones y servicios envían lo mismo', async () => {
    const b = d.barberos[0], s = d.servicios[0], p = d.productos[0];
    for (const pct of ['45', '', '0']) await cmp(`A.setbp({i:${js(b.id)}})`, { ['bp_' + b.id]: pct }, null, (db) => A.guardarPctGeneral(db, b.id, pct), 'Comisión general guardada');
    for (const [item, pct] of [['s:' + s.id, '60'], ['p:' + p.id, '12'], ['s:' + s.id, '']])
      await cmp(`A.addexc({i:${js(b.id)}})`, { ['xi_' + b.id]: item, ['xp_' + b.id]: pct }, A.validarExcepcion(pct), A.validarExcepcion(pct) ? null : (db) => A.agregarExcepcion(db, b.id, item, pct), 'Excepción agregada');
    await cmp(`A.delexc({i:'cb-1'})`, {}, null, (db) => A.quitarExcepcion(db, 'cb-1'));
    for (const [n, m, e] of [['Tomi', '40', 'tomi@prueba.test'], ['Fran', '', ''], ['', '30', 'x@y.z']])
      await cmp('A.addbar()', { bn: n, bm: m, be: e }, null, n.trim() ? (db) => A.agregarBarbero(db, n, m, e) : null, n.trim() ? 'Barbero agregado' : '');
    await cmp(`A.delbar({i:${js(b.id)}})`, {}, null, (db) => A.quitarBarbero(db, b.id));
    for (const [n, pr, c, du] of [['Lavado', '3000', '30', '15'], ['Diseño', '', '', ''], ['', '1', '1', '1']])
      await cmp('A.addsrv()', { sn: n, sp: pr, sc: c, sd: du }, null, n.trim() ? (db) => A.agregarServicio(db, n, pr, c, du) : null, n.trim() ? 'Servicio agregado' : '');
    await cmp(`A.delsrv({i:${js(s.id)}})`, {}, null, (db) => A.quitarServicio(db, s.id));
  });

  it('respaldo JSON e historial de cambios idénticos', async () => {
    lg.set('__rows', all);
    lg.run(`sb={from(t){const rows=(__rows[t]||[]);const q={select(){return q},order(){return q},range(a,b){return Promise.resolve({data:rows.slice(a,b+1),error:null})}};return q}};fileOut=(n,m,t)=>{globalThis.__f={n,t}}`);
    await lg.run('A.backup()');
    const mio = await A.generarRespaldo(async (t) => (all as Record<string, unknown[]>)[t] ?? []);
    const f = lg.json<{ n: string; t: string }>('__f');
    expect(mio.nombre).toBe(f.n); expect(mio.texto).toBe(f.t);
    const aud: A.FilaAuditoria[] = [
      { usuario: null, op: 'INSERT', tabla: 'ingresos', fecha: '2026-11-12T10:15:00Z', fila: { concepto: 'Corte', total: 10000 }, antes: null },
      { usuario: d.barberosTodos.find((x) => x.user_id)?.user_id ?? 'u-x', op: 'UPDATE', tabla: 'productos', fecha: '2026-11-11T09:00:00Z', fila: { nombre: 'Cera' }, antes: null },
      { usuario: 'usr-desconocido', op: 'DELETE', tabla: 'gastos', fecha: '2026-11-10T08:00:00Z', fila: null, antes: { concepto: 'Luz', monto: 5000 } },
      { usuario: null, op: 'TRUNCATE', tabla: 'otra_tabla', fecha: '', fila: null, antes: null },
    ];
    lg.set('__aud', aud);
    lg.run(`sb={from(){const q={select(){return q},order(){return q},limit(){return Promise.resolve({data:__aud,error:null})}};return q}}`);
    await lg.run('A.aud()');
    const sh = lg.run<string>(`$('#sh').innerHTML`);
    for (const x of aud) { const c = A.describirCambio(d, x); expect(sh).toContain(`<span>${c.titulo}<br><small>${c.detalle}</small></span>`); }
  });
});
