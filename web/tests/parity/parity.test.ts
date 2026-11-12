import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import { fixtures, soloBarbero } from '../fixtures';
import { loadLegacy, type Legacy } from './legacy-harness';

// PARIDAD: la versión nueva debe dar EXACTAMENTE lo mismo que la versión estable
// (index.html de la raíz) con los mismos datos. Se prueban varias semillas de datos
// y varios momentos del día/semana (antes de abrir, mediodía, noche, domingo).

const J = <T,>(x: T) => JSON.parse(JSON.stringify(x)) as T;
const MOMENTOS = ['2026-11-12T08:05:00-03:00', '2026-11-12T15:37:00-03:00', '2026-11-14T19:59:00-03:00', '2026-11-15T12:00:00-03:00', '2026-03-31T23:30:00-03:00'];
const SEMILLAS = [1, 2, 3, 7, 42, 2026];

// Pasa el modelo nuevo al formato de nombres cortos de la versión estable, para comparar.
const legacyMov = (m: AppData['movs'][number]) => m.tipo == 'ing'
  ? { id: m.id, t: 'ing', k: m.categoria, c: m.concepto, m: m.monto, q: m.cantidad, b: m.barberoId, cli: m.cliente, cid: m.clienteId, fecha: m.fecha, cu: m.costoUnit, cm: m.comisionMonto, liq: m.liquidacionId, pid: m.productoId, cob: m.cobrado, cobAt: m.cobradoAt, mp: m.medioPago, ts: m.ts }
  : { id: m.id, t: 'gas', k: m.categoria, c: m.concepto, m: m.monto, mp: m.medioPago, fecha: m.fecha, ts: m.ts };
const legacyTurno = (t: AppData['turnos'][number]) => ({ id: t.id, c: t.cliente, tel: t.telefono, f: t.fecha, h: t.hora, b: t.barberoId, s: t.servicios, sids: t.servicioIds, d: t.duracionMin, est: t.estado, done: t.atendido, n: t.notas, cid: t.clienteId });
const legacyRes = (r: L.Resultado) => ({ ing: r.ingresos, n: r.operaciones, fijo: r.gastosFijos, vari: r.gastosVariables, cogs: r.costoProductos, com: r.comisiones, net: r.neto, perd: r.perdidas, cob: r.cobrado, pen: r.pendiente });
const legacyBst = (s: L.StatsBarbero) => ({ id: s.id, n: s.nombre, cortes: s.cortes, fact: s.facturacion, fs: s.servicios, fp: s.productos, com: s.comision, pq: s.unidadesProducto, prom: s.promedioDiario, g: s.serviciosPorNombre, ok: s.puntual, ta: s.tarde, na: s.asistencias });

for (const momento of MOMENTOS) {
  for (const seed of SEMILLAS) {
    for (const rol of ['owner', 'barber'] as const) {
      describe(`semilla ${seed} · ${momento} · ${rol}`, () => {
        const now = Date.parse(momento);
        const all = fixtures(seed, momento);
        const tables = rol == 'owner' ? all : soloBarbero(all);
        const me = rol == 'barber' ? all.barberos![0].id : undefined;
        let legacy: Legacy;
        let d: AppData;

        beforeAll(async () => {
          vi.useFakeTimers({ toFake: ['Date'] });
          vi.setSystemTime(now);
          legacy = await loadLegacy(tables, { now, owner: rol == 'owner', meBarberoId: me });
          d = buildAppData(tables);
        });
        afterAll(() => vi.useRealTimers());

        it('arma el mismo modelo de datos', () => {
          expect(J(d.barberos.map((x) => ({ id: x.id, n: x.nombre, min: x.slotMin, uid: x.userId, cp: x.comisionPct })))).toEqual(legacy.json('S.cfg.barberos'));
          expect(J(d.servicios.map((x) => ({ id: x.id, n: x.nombre, p: x.precio, cp: x.comisionPct, dur: x.duracionMin })))).toEqual(legacy.json('S.cfg.servicios'));
          expect(J(d.horario)).toEqual(legacy.json('S.cfg.horario'));
          expect(J(d.movs.map(legacyMov))).toEqual(legacy.json('S.movs'));
          expect(J(d.turnos.map(legacyTurno))).toEqual(legacy.json('S.turnos'));
          expect(J(d.turnosBaja.map(legacyTurno))).toEqual(legacy.json('S.tcan'));
          expect(J(d.productos.map((x) => ({ id: x.id, n: x.nombre, cat: x.categoria, costo: x.costo, precio: x.precio, stock: x.stock, min: x.stockMin, cp: x.comisionPct, prov: x.proveedorId })))).toEqual(legacy.json('S.productos'));
          expect(J(d.clientes.map((x) => ({ id: x.id, n: x.nombre, tel: x.telefono, pref: x.preferencias, obs: x.observaciones, creado: x.creado })))).toEqual(legacy.json('S.clientes'));
          expect(J(d.comisionesBarbero.map((x) => ({ id: x.id, b: x.barberoId, sid: x.servicioId, pid: x.productoId, pct: x.pct })))).toEqual(legacy.json('S.cbar'));
          expect(J(d.liquidaciones.map((x) => ({ id: x.id, b: x.barberoId, m: x.monto, bruto: x.bruto, mp: x.medioPago, fecha: x.fecha, desde: x.desde, hasta: x.hasta, ts: x.ts })))).toEqual(legacy.json('S.liq'));
          expect(J(d.adelantos.map((x) => ({ id: x.id, b: x.barberoId, m: x.monto, fecha: x.fecha, liq: x.liquidacionId })))).toEqual(legacy.json('S.adel'));
          expect(J(d.asistencia.map((x) => ({ id: x.id, b: x.barberoId, fecha: x.fecha, e: x.estado })))).toEqual(legacy.json('S.asist'));
          expect(J(d.movStock.map((x) => ({ id: x.id, pid: x.productoId, n: x.nombre, tipo: x.tipo, q: x.cantidad, sg: x.signo, cu: x.costoUnit, prov: x.proveedor, mp: x.medioPago, nota: x.nota, fecha: x.fecha, b: x.barberoId, ts: x.ts })))).toEqual(legacy.json('S.smov'));
          expect(J(d.dueno.map((x) => ({ id: x.id, t: x.tipo, c: x.concepto, m: x.monto, fecha: x.fecha, ts: x.ts })))).toEqual(legacy.json('S.dueno'));
          expect(J(d.proveedores.map((x) => ({ id: x.id, n: x.nombre, tel: x.telefono, notas: x.notas, act: true })))).toEqual(legacy.json('S.prov'));
          expect(J(d.cajasCerradas)).toEqual(legacy.json('S.cajas'));
          expect(J(d.cajaAbierta)).toEqual(legacy.json('S.caja'));
        });

        it('calcula igual períodos, resultados, comisiones y estadísticas', () => {
          const refs = [L.today(), '2026-02-27', '2026-12-31', '2025-11-30', '2026-01-01'];
          for (const per of ['dia', 'sem', 'mes', 'ano'] as const) {
            for (const ref of refs) {
              legacy.run(`S.per=${JSON.stringify(per)};S.ref=${JSON.stringify(ref)}`);
              const [a, b] = L.rango(per, ref);
              expect([a, b]).toEqual(legacy.json('rng()'));
              expect(legacyRes(L.resultado(d, a, b))).toEqual(legacy.json(`res(${JSON.stringify(a)},${JSON.stringify(b)})`));
              for (const x of all.barberos!) expect(J(legacyBst(L.statsBarbero(d, x.id, a, b)))).toEqual(legacy.json(`bst(${JSON.stringify(x.id)},${JSON.stringify(a)},${JSON.stringify(b)})`));
              expect(L.ultimosMeses(6, ref)).toEqual(legacy.json('med(6)'));
            }
          }
          expect(L.comisionPendiente(d)).toBeCloseTo(legacy.run<number>('pendF()'), 9);
          for (const x of all.barberos!) expect(L.comisionPendiente(d, x.id)).toBeCloseTo(legacy.run<number>(`pendF(${JSON.stringify(x.id)})`), 9);
          expect(L.stockBajo(d).map((p) => p.id)).toEqual(legacy.json('S.productos.filter(p=>p.stock<=(+p.min||0)).map(p=>p.id)'));
          const t = L.today();
          expect(L.cobradoEnFecha(d, t)).toBe(legacy.run(`sum(S.movs.filter(m=>m.t=='ing'&&m.cob&&iso(new Date(m.cobAt))==${JSON.stringify(t)}))`));
        });

        it('ofrece los mismos horarios libres', () => {
          const c: L.AgendaCtx = { barberos: d.barberos, horario: d.horario, turnos: d.turnos };
          const combos = [undefined, [], [d.servicios[0]], d.servicios.slice(0, 2)];
          for (let i = -1; i < 9; i++) {
            const f = L.isoLocal(new Date(now + i * 864e5));
            for (const b of ['', ...d.barberos.map((x) => x.id)]) {
              for (const ds of combos) {
                const dsL = JSON.stringify(ds?.map((s) => ({ dur: s.duracionMin })) ?? null);
                expect(L.horariosLibres(c, f, b, ds)).toEqual(legacy.json(`slots(${JSON.stringify(f)},${JSON.stringify(b)},${dsL}??undefined)`));
                if (b) expect(L.horariosBarbero(c, f, b, ds)).toEqual(legacy.json(`slotsB(${JSON.stringify(f)},${JSON.stringify(b)},${dsL}??undefined)`));
              }
              const libres = L.horariosLibres(c, f, b);
              for (const h of libres.slice(0, 3)) expect(L.elegirBarbero(c, f, h, b)).toBe(legacy.run(`pick(${JSON.stringify(f)},${JSON.stringify(h)},${JSON.stringify(b)})`));
            }
          }
          expect(L.proximoDiaAbierto(c)).toBe(legacy.run('nextOpen()'));
        });
      });
    }
  }
}

describe('utilidades idénticas', () => {
  let legacy: Legacy;
  beforeAll(async () => { legacy = await loadLegacy({}, { now: Date.now(), owner: true }); });
  it('números de WhatsApp', () => {
    for (const t of ['', null, '3878 123456', '0387-154123456', '+54 9 387 412-3456', '5493874123456', '15412345', '00543874123456', 'abc'])
      expect(L.numeroWhatsApp(t)).toBe(legacy.run(`waNum(${JSON.stringify(t)})`));
    expect(L.linkWhatsApp('3874123456', 'Hola ñandú & "amigos"')).toBe(legacy.run(`waLink('3874123456','Hola ñandú & "amigos"')`));
  });
  it('CSV', () => {
    const rows = [['Fecha', 'Monto', 'Nota'], ['2026-11-12', 1234.5, 'con ; punto y coma'], [null, 0, 'comillas "x"\nsalto'], [undefined, -3.25, '']];
    expect(L.aCsv(rows)).toBe(legacy.run(`csv(${JSON.stringify(rows)})`));
  });
  it('formato de pesos', () => {
    for (const n of [0, 1, 999.5, 1234567.89, -2500, NaN]) expect(L.formatoPesos(n)).toBe(legacy.run(`fmt(${n})`));
  });
});
