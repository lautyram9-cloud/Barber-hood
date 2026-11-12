import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as C from '@/domain/comisiones';
import { comisionesPeriodo } from '@/domain/movimientos';
import { fixtures } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X, fmt = L.formatoPesos;

for (const momento of ['2026-11-12T15:37:00-03:00', '2026-03-31T23:30:00-03:00']) for (const seed of [1, 3, 42, 2026]) describe(`comisiones · semilla ${seed} · ${momento}`, () => {
  const now = Date.parse(momento), all = fixtures(seed, momento);
  let lg: Legacy, d: AppData;
  beforeAll(async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); lg = await loadLegacy(all, { now, owner: true }); d = buildAppData(all); });
  afterAll(() => vi.useRealTimers());

  it('pantalla: período, adelantos e historial iguales', () => {
    for (const per of ['dia', 'sem', 'mes', 'ano'] as const) for (const ref of [L.today(), '2026-02-27']) {
      lg.run(`S.per=${js(per)};S.ref=${js(ref)}`);
      const html = lg.run<string>('V.com()'), [a, b] = L.rango(per, ref), C1 = comisionesPeriodo(d, a, b);
      expect(html).toContain(`<h3>Comisiones del período</h3>${C1.map((x) => `<div class="r"><span>${x.barbero.nombre}<br><small>Serv. ${fmt(x.servicios)} · Prod. ${fmt(x.productos)} · pendiente total ${fmt(L.comisionPendiente(d, x.barbero.id))}</small></span><span><b>${fmt(x.comision)}</b> <button class="go" data-a="liq" data-i="${x.barbero.id}">Liquidar</button></span></div>`).join('')}<div class="r"><b>Total del período</b><b>${fmt(C1.reduce((t, x) => t + x.comision, 0))}</b></div></div>`);
      expect(html).toContain(`<h3>Adelantos a barberos</h3>${C.ultimosAdelantos(d).map((x) => `<div class="r"><span>${x.fecha.slice(5)} · ${L.nombreBarbero(d, x.barberoId)}<br><small>${x.liquidacionId ? 'descontado en liquidación' : 'pendiente de descontar'}</small></span><b>${fmt(x.monto)}</b></div>`).join('')}<select id="ab">`);
      expect(html).toContain(`<h3>Historial de liquidaciones</h3>${C.ultimasLiquidaciones(d).map((x) => `<div class="r" data-a="ldet" data-i="${x.id}"><span>${x.fecha.slice(5)} · ${L.nombreBarbero(d, x.barberoId)}<br><small>${x.desde || ''} → ${x.hasta || ''}</small></span><b>${fmt(x.monto)}</b></div>`).join('') || '<p class="mu">Sin liquidaciones.</p>'}</div>`);
      // Previa de liquidación de cada barbero
      for (const x of d.barberos) {
        lg.run(`A.liq({i:${js(x.id)}})`);
        const sh = lg.run<string>(`$('#sh').innerHTML`), p = C.previaLiquidacion(d, x.id, per, ref), hLegacy = sh.match(/data-h="([^"]+)"/)![1];
        expect(p.hasta, 'fecha hasta (corregida si el mes no tiene ese día)').toBe(hLegacy.slice(0, 8) + String(Math.min(+hLegacy.slice(8), new Date(+hLegacy.slice(0, 4), +hLegacy.slice(5, 7), 0).getDate())).padStart(2, '0'));
        expect(sh).toContain(`(${p.operaciones} operaciones)</p><div class="r"><span>Comisiones</span><b>${fmt(p.comisiones)}</b></div><div class="r"><span>Adelantos a descontar</span><b>-${fmt(p.adelantos)}</b></div><div class="r"><b>A pagar</b><b>${fmt(p.aPagar)}</b></div>`);
      }
    }
  });

  it('comprobante y texto para compartir idénticos', async () => {
    lg.run('navigator.clipboard={writeText:(t)=>{globalThis.__clip=t;return Promise.resolve()}}');
    for (const x of d.liquidaciones) {
      lg.run(`A.ldet({i:${js(x.id)}})`);
      const sh = lg.run<string>(`$('#sh').innerHTML`);
      expect(sh).toContain(C.detalleLiquidacion(d, x).map((m) => `<div class="r"><span>${m.fecha.slice(5)} · ${m.concepto}<br><small>${fmt(m.monto)} · ${C.pctComision(m.monto, m.comisionMonto as number)}%</small></span><b>${fmt(m.comisionMonto as number)}</b></div>`).join('') + `<div class="r"><span>Comisiones</span><b>${fmt(x.bruto)}</b></div><div class="r"><span>Adelantos descontados</span><b>-${fmt(x.bruto - x.monto)}</b></div><div class="r"><b>Pagado</b><b>${fmt(x.monto)}</b></div>`);
      await lg.run(`A.lshare({i:${js(x.id)}})`);
      expect(C.textoComprobante(d, x)).toBe(lg.run('__clip'));
    }
  });

  it('liquidar y adelanto envían lo mismo', async () => {
    const cmp = async (call: string, dom: Record<string, string>, nueva: ((db: never) => Promise<unknown>) | null, err: string | null, ok: string) => {
      const v = grabador(), n = grabador();
      lg.set('__rec', v.db); lg.set('__dom', dom); lg.set('__lastToast', ''); lg.run('sb=__rec');
      await lg.run(call); if (nueva) await nueva(n.db as never);
      expect(lg.run('__lastToast')).toBe(err ?? ok);
      expect(J(n.llamadas)).toEqual(J(v.llamadas));
    };
    const b = d.barberos[0].id;
    for (const medio of ['', 'transferencia']) await cmp(`A.liqok({i:${js(b)},h:'2026-11-12'})`, { lmp: medio }, (db) => C.liquidar(db, b, '2026-11-12', medio), null, 'Liquidación registrada');
    for (const [bb, m, n, md] of [[b, '5000', 'vale', 'efectivo'], [b, '3000', '', ''], ['', '5000', '', ''], [b, '0', '', '']])
      await cmp('A.adel()', { ab: bb, am: m, an: n, amp: md }, C.validarAdelanto(bb, m) ? null : (db) => C.registrarAdelanto(db, bb, m, n, md), C.validarAdelanto(bb, m), 'Adelanto registrado');
  });
});
