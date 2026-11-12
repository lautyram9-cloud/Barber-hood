import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as K from '@/domain/caja';
import type { CajaResumen } from '@/lib/database.types';
import { fixtures } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X, fmt = L.formatoPesos;
const R: CajaResumen = { inicial: 10000, ing_efectivo: 52000, mov_in: 2000, gastos_efectivo: 8000, liquidaciones: 15000, adelantos: 3000, compras_efectivo: 4000, mov_out: 1000, ing_transferencia: 30000, ing_tarjeta: 12000, esperado: 33000, pendiente_cobro: 9000 };

for (const seed of [1, 2, 3, 7, 42, 2026]) describe(`caja · semilla ${seed}`, () => {
  const now = Date.parse('2026-11-12T15:37:00-03:00'), all = fixtures(seed, '2026-11-12T15:37:00-03:00');
  let lg: Legacy, d: AppData;
  beforeAll(async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); lg = await loadLegacy(all, { now, owner: true }); d = buildAppData(all); });
  afterAll(() => vi.useRealTimers());

  it('pantalla igual (abierta o cerrada) e historial', () => {
    lg.run(`S.cr=${js(R)}`);
    const html = lg.run<string>('V.cj()');
    const hist = K.historialCajas(d).map((x) => `<div class="r"><span>${(x.apertura_at || '').slice(0, 10)}<br><small>Esperado ${fmt(+x.esperado!)} · contado ${fmt(+x.contado!)}</small></span><b class="${+x.diferencia! == 0 ? '' : +x.diferencia! > 0 ? 'pos' : 'neg'}">${+x.diferencia! > 0 ? '+' : ''}${fmt(+x.diferencia!)}</b></div>`).join('');
    expect(html).toContain(`<h3>Historial de cierres</h3>${hist || '<p class="mu">Sin cierres.</p>'}</div>`);
    expect(html.includes('Caja cerrada')).toBe(!d.cajaAbierta);
    if (d.cajaAbierta) {
      expect(html).toContain(K.detalleEfectivo(R).map(([k, v, s]) => `<div class="r"><span>${k}</span><b class="${s > 0 ? 'pos' : 'neg'}">${s > 0 ? '+' : '-'}${fmt(v)}</b></div>`).join(''));
      expect(html).toContain(`<small>Esperado en caja</small><b>${fmt(R.esperado)}</b></div><div><small>Pend. de cobro</small><b>${fmt(R.pendiente_cobro)}</b>`);
    }
  });

  it('abrir, movimiento manual y cerrar envían lo mismo', async () => {
    const id = d.cajaAbierta?.id ?? 'caja-x';
    lg.run(`S.caja=S.caja||{id:${js(id)}};S.cr=${js(R)}`);
    const cmp = async (call: string, dom: Record<string, string>, nueva: (db: never) => Promise<unknown> | null, err: string | null, ok: string, ret?: unknown) => {
      const v = grabador({ rpc: { cerrar_caja: ret } }), n = grabador({ rpc: { cerrar_caja: ret } });
      lg.set('__rec', v.db); lg.set('__dom', dom); lg.set('__lastToast', ''); lg.run('sb=__rec');
      await lg.run(call); if (!err) await nueva(n.db as never);
      expect(lg.run('__lastToast')).toBe(err ?? ok);
      expect(J(n.llamadas)).toEqual(J(v.llamadas));
    };
    for (const s of ['15000', '', 'abc']) await cmp('A.abrir()', { csi: s }, (db) => K.abrirCaja(db, s), null, 'Caja abierta');
    for (const [t, c, m] of [['ingreso', 'Cambio', '2000'], ['egreso', 'Retiro', '500'], ['egreso', '', '500'], ['ingreso', 'X', '0']])
      await cmp('A.cmov()', { cmt: t, cmc: c, cmm: m }, (db) => K.movimientoCaja(db, id, t, c, m), K.validarMovCaja(c, m, id), 'Registrado');
    for (const [c, nota, dif] of [['33000', '', 0], ['32500', 'faltan 500', -500], ['34000', '', 1000]] as const)
      await cmp('A.cerrar()', { ccon: c, cno: nota }, async (db) => K.cerrarCaja(db, id, c, nota), null, 'Caja cerrada. Diferencia: ' + (dif > 0 ? '+' : '') + fmt(dif), dif);
    await cmp('A.cerrar()', { ccon: '', cno: '' }, () => null, 'Ingresá el efectivo contado', '');
  });
});
