import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as M from '@/domain/movimientos';
import { fixtures, soloBarbero } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X, fmt = L.formatoPesos;
const UUID = '00000000-0000-4000-8000-000000000000'; // el randomUUID simulado de la versión estable

function expectIn(html: string, frag: string, que: string) {
  if (!html.includes(frag)) throw new Error(`No coincide "${que}". Se esperaba:\n${frag}`);
}

for (const momento of ['2026-11-12T15:37:00-03:00', '2026-03-31T23:30:00-03:00']) for (const seed of [1, 3, 42, 2026]) {
  describe(`movimientos · semilla ${seed} · ${momento}`, () => {
    const now = Date.parse(momento), all = fixtures(seed, momento), me = all.barberos![0].id;
    let owner: Legacy, barber: Legacy, d: AppData, db: AppData;
    beforeAll(async () => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
      owner = await loadLegacy(all, { now, owner: true });
      barber = await loadLegacy(soloBarbero(all), { now, owner: false, meBarberoId: me });
      d = buildAppData(all); db = buildAppData(soloBarbero(all));
    });
    afterAll(() => vi.useRealTimers());

    it('pantalla Movimientos: indicadores, comisiones, pendientes y lista iguales', () => {
      for (const per of ['dia', 'sem', 'mes', 'ano'] as const) for (const ref of [L.today(), '2026-02-27']) {
        owner.run(`S.per=${js(per)};S.ref=${js(ref)}`);
        const html = owner.run<string>('V.caja()'), [a, b] = L.rango(per, ref), r = M.resumenMovimientos(d, a, b);
        expectIn(html, `<small>Ingresos</small><b class="pos">${fmt(r.ingresos)}</b></div><div><small>Gastos</small><b class="neg">${fmt(r.gastos)}</b></div><div><small>Neto</small><b>${fmt(r.neto)}</b>`, 'indicadores');
        const cm = M.comisionesPeriodo(d, a, b).filter((x) => x.comision > 0);
        if (cm.length) expectIn(html, `<h3>Comisiones de barberos (gasto variable)</h3>${cm.map((x) => `<div class="r"><span>${x.barbero.nombre}</span><b class="gas">-${fmt(x.comision)}</b></div>`).join('')}</div>`, 'comisiones');
        else expect(html).not.toContain('Comisiones de barberos');
        const P = M.pendientesCobro(d);
        if (P.length) expectIn(html, `<h3>⏳ Pendientes de cobro (${P.length} · ${fmt(L.sumMonto(P))})</h3>${P.map((m) => `<div class="r" data-a="pdet" data-i="${m.id}"><span>${m.fecha.slice(5)} · ${m.concepto}<br><small>${m.cliente || L.nombreBarbero(d, m.barberoId)}</small></span><b>${fmt(m.monto)}</b></div>`).join('')}</div>`, 'pendientes');
        const lista = M.movimientosPeriodo(d, a, b), filas = owner.run<string>(`${js(lista.map((m) => m.id))}.map(id=>S.movs.find(m=>m.id==id)).map(m=>row(m)).join('')`);
        expectIn(html, `<h3>Movimientos del período</h3>${filas || '<p class="mu">Sin movimientos.</p>'}</div>`, 'lista');
        // el ícono de editar/anular aparece justo donde la nueva lo permite
        for (const m of lista) expect(owner.run<string>(`row(S.movs.find(m=>m.id==${js(m.id)}))`).includes('data-a="del"'), m.id).toBe(M.editable(m, true));
      }
    });

    it('botón + (ingreso): envía lo mismo o el mismo error, dueño y barbero', async () => {
      const prod = d.productos.find((p) => p.stock > 0) ?? d.productos[0];
      const casos: M.IngresoRapido[] = [
        { tipo: 'servicio', concepto: d.servicios[0].nombre, monto: String(d.servicios[0].precio), cantidad: '1', productoId: '', cliente: ' Juan ', barbero: d.barberos[1].id, fecha: L.today(), medio: 'efectivo', cobrado: true },
        { tipo: 'servicio', concepto: 'Servicio raro', monto: '7500', cantidad: '3', productoId: '', cliente: '', barbero: '', fecha: '2026-11-01', medio: 'tarjeta', cobrado: false },
        { tipo: 'producto', concepto: prod.nombre, monto: String(prod.precio), cantidad: '2', productoId: prod.id, cliente: '', barbero: d.barberos[0].id, fecha: L.today(), medio: 'transferencia', cobrado: true },
        { tipo: 'producto', concepto: prod.nombre, monto: '100', cantidad: '', productoId: prod.id, cliente: '', barbero: '', fecha: L.today(), medio: 'efectivo', cobrado: true },
        { tipo: 'producto', concepto: 'Sin elegir', monto: '100', cantidad: '1', productoId: '', cliente: '', barbero: '', fecha: L.today(), medio: 'efectivo', cobrado: true },
        { tipo: 'servicio', concepto: '  ', monto: '100', cantidad: '1', productoId: '', cliente: '', barbero: '', fecha: L.today(), medio: 'efectivo', cobrado: true },
        { tipo: 'servicio', concepto: 'Monto vacío', monto: '', cantidad: '1', productoId: '', cliente: '', barbero: '', fecha: L.today(), medio: 'efectivo', cobrado: true },
        { tipo: 'servicio', concepto: 'Negativo', monto: '-5', cantidad: '1', productoId: '', cliente: '', barbero: '', fecha: L.today(), medio: 'efectivo', cobrado: true },
      ];
      for (const [lg, data, yo] of [[owner, d, null], [barber, db, me]] as const) for (const x of casos) {
        const v = grabador(), n = grabador();
        lg.set('__rec', v.db); lg.set('__lastToast', '');
        lg.set('__dom', { qt: x.tipo, qc: x.concepto, qm: x.monto, qq: x.cantidad, qp: x.productoId, qcl: x.cliente, qb: x.barbero, qd: x.fecha, qmp: x.medio, qcb: x.cobrado ? '1' : '0' });
        lg.run(`sb=__rec;S.op='op-prueba'`);
        await lg.run('A.qsave()');
        const err = M.validarIngresoRapido(x);
        const msg = err ?? (await M.guardarIngresoRapido(n.db, data, x, 'op-prueba', yo));
        expect(msg, `${x.concepto}`).toBe(lg.run('__lastToast'));
        expect(J(n.llamadas)).toEqual(J(v.llamadas));
      }
    });

    it('botón + (gasto) y formulario Registrar: envían lo mismo', async () => {
      for (const tipo of ['fijo', 'variable'] as const) for (const [c, m] of [['Luz', '15000'], ['', '100'], ['Agua', '0'], ['Internet', 'abc']]) {
        const v = grabador(), n = grabador(), x: M.GastoRapido = { tipo, concepto: c, monto: m, fecha: '2026-11-10', medio: 'transferencia' };
        owner.set('__rec', v.db); owner.set('__lastToast', ''); owner.set('__dom', { gc: c, gm: m, gd: x.fecha, gmp: x.medio }); owner.run('sb=__rec');
        await owner.run(`A.qsg({i:${js(tipo)}})`);
        const err = M.validarGasto(x);
        if (!err) await M.guardarGastoRapido(n.db, x);
        expect(err ?? 'Gasto registrado').toBe(owner.run('__lastToast'));
        expect(J(n.llamadas)).toEqual(J(v.llamadas));
      }
      const prod = d.productos[0];
      const regs: M.Movimiento_[] = [
        { clave: 'ing|servicio', concepto: d.servicios[1].nombre, monto: '9000', barbero: d.barberos[0].id, fecha: '2026-11-11' },
        { clave: 'ing|servicio', concepto: 'Otro', monto: '9000', barbero: '', fecha: '' },
        { clave: 'ing|producto', concepto: prod.nombre, monto: '5000', barbero: '', fecha: '2026-11-11' },
        { clave: 'ing|producto', concepto: 'No existe', monto: '5000', barbero: '', fecha: '2026-11-11' },
        { clave: 'gas|fijo', concepto: 'Alquiler', monto: '300000', barbero: '', fecha: '2026-11-01' },
        { clave: 'gas|variable', concepto: 'Insumos', monto: '0', barbero: '', fecha: '2026-11-01' },
      ];
      for (const [lg, ow] of [[owner, true], [barber, false]] as const) for (const x of regs) {
        const v = grabador(), n = grabador();
        lg.set('__rec', v.db); lg.set('__lastToast', ''); lg.set('__dom', { mk: x.clave, mc: x.concepto, mm: x.monto, mb: x.barbero, md: x.fecha }); lg.run('sb=__rec');
        await lg.run('A.addmov()');
        const err = M.validarMovimiento(ow ? d : db, x, ow);
        if (!err) await M.guardarMovimiento(n.db, ow ? d : db, x, UUID);
        expect(err ?? 'Guardado').toBe(lg.run('__lastToast'));
        expect(J(n.llamadas)).toEqual(J(v.llamadas));
      }
    });

    it('cobrar pendiente y anular/borrar envían lo mismo', async () => {
      const ing = d.movs.find((m) => m.tipo == 'ing')!, gas = d.movs.find((m) => m.tipo == 'gas')!, due = d.dueno[0];
      const comparar = async (call: string, dom: Record<string, string>, f: (x: typeof grabador extends () => infer G ? G extends { db: infer D } ? D : never : never) => Promise<unknown>) => {
        const v = grabador(), n = grabador();
        owner.set('__rec', v.db); owner.set('__dom', dom); owner.run('sb=__rec');
        await owner.run(call); await f(n.db as never);
        expect(J(n.llamadas)).toEqual(J(v.llamadas)); expect(v.llamadas.length).toBe(1);
      };
      for (const medio of ['', 'tarjeta']) await comparar(`A.pcob({i:${js(ing.id)}})`, { pmp: medio }, (x) => M.cobrarIngreso(x, ing.id, medio));
      await comparar(`A.del({c:'ingresos',i:${js(ing.id)}})`, {}, (x) => M.anular(x, 'ingresos', ing.id));
      await comparar(`A.del({c:'gastos',i:${js(gas.id)}})`, {}, (x) => M.anular(x, 'gastos', gas.id));
      if (due) await comparar(`A.del({c:'dueno_mov',i:${js(due.id)}})`, {}, (x) => M.anular(x, 'dueno_mov', due.id));
    });
  });
}
