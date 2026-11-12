import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as S from '@/domain/stock';
import { fixtures } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X, fmt = L.formatoPesos;

for (const seed of [1, 2, 3, 7, 42, 2026]) describe(`stock · semilla ${seed}`, () => {
  const now = Date.parse('2026-11-12T15:37:00-03:00'), all = fixtures(seed, '2026-11-12T15:37:00-03:00');
  let lg: Legacy, d: AppData;
  beforeAll(async () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); lg = await loadLegacy(all, { now, owner: true }); d = buildAppData(all); });
  afterAll(() => vi.useRealTimers());

  it('pantalla de stock idéntica', () => {
    for (const per of ['dia', 'sem', 'mes', 'ano'] as const) {
      lg.run(`S.per=${js(per)};S.ref=${js(L.today())}`);
      const html = lg.run<string>('V.stk()'), [a, b] = L.rango(per, L.today()), r = S.resumenStock(d, a, b);
      expect(html).toContain(`<small>Valor inventario</small><b>${fmt(r.valorCosto)}</b></div><div><small>Valor de venta</small><b>${fmt(r.valorVenta)}</b></div><div><small>Poco stock</small><b class="${r.bajos.length ? 'neg' : ''}">${r.bajos.length}</b>`);
      expect(html).toContain(`Proveedores (${d.proveedores.length})`);
      if (r.bajos.length) expect(html).toContain(`<h3>⚠️ Poco stock</h3>${r.bajos.map((p) => `<div class="r" data-a="pst" data-i="${p.id}"><span>${p.nombre}</span><b class="neg">${p.stock} u. (mín. ${p.stockMin || 0})</b></div>`).join('')}</div>`);
      for (const c of r.categorias) expect(html).toContain(`<h3>${c}</h3>${r.productos.filter((p) => (p.categoria || 'Otros') == c).map((p) => `<div class="r" data-a="pst" data-i="${p.id}"><span>${p.nombre}<br><small>costo ${fmt(p.costo)} · venta ${fmt(p.precio)} · margen ${S.margenPct(p)}%${S.nombreProveedor(d, p.proveedorId) ? ' · ' + S.nombreProveedor(d, p.proveedorId) : ''}</small></span><b class="${S.esBajo(p) ? 'neg' : ''}">${p.stock}</b></div>`).join('')}</div>`);
      expect(html).toContain(`<h3>Más vendidos del período</h3>${r.masVendidos.map((x) => `<div class="r"><span>${x[0]}</span><b>${x[1]} u.</b></div>`).join('') || '<p class="mu">Sin ventas.</p>'}</div>`);
      expect(html).toContain(`<h3>Historial de movimientos</h3>${r.movimientos.map((x) => `<div class="r"><span>${x.fecha.slice(5)} · ${x.nombre}<br><small>${x.tipo}${x.proveedor ? ' · ' + x.proveedor : ''}${x.nota ? ' · ' + x.nota : ''}${x.barberoId ? ' · ' + L.nombreBarbero(d, x.barberoId) : ''}</small></span><b class="${x.signo > 0 ? 'ing' : 'gas'}">${x.signo > 0 ? '+' : '-'}${x.cantidad} u.</b></div>`).join('') || '<p class="mu">Sin movimientos.</p>'}</div>`);
    }
  });

  it('ficha de producto y pedido sugerido idénticos', () => {
    for (const p of d.productos) {
      lg.run(`A.pst({i:${js(p.id)}})`);
      const sh = lg.run<string>(`$('#sh').innerHTML`);
      expect(sh).toContain(`<p class="mu">Stock ${p.stock} · mínimo ${p.stockMin || 0} · ${S.ventasProducto(d, p)} ventas registradas</p>`);
      expect(sh).toContain(`<h3 style="margin-top:14px">Últimos movimientos</h3>${S.historialProducto(d, p).map((x) => `<div class="r"><span>${x.fecha.slice(5)} · ${x.tipo}<br><small>${x.proveedor || x.nota || ''}</small></span><b class="${x.signo > 0 ? 'ing' : 'gas'}">${x.signo > 0 ? '+' : '-'}${x.cantidad}</b></div>`).join('') || '<p class="mu">Sin movimientos.</p>'}`);
    }
    lg.run('A.pedido()');
    expect(S.pedidoSugerido(d).texto).toBe(lg.run('S.ped'));
  });

  it('todas las acciones envían lo mismo (o el mismo error)', async () => {
    const cmp = async (call: string, dom: Record<string, string>, err: string | null, nueva: (db: never) => Promise<unknown>, ok?: string) => {
      const v = grabador({ single: { id: 'prod-nuevo' } }), n = grabador({ single: { id: 'prod-nuevo' } });
      lg.set('__rec', v.db); lg.set('__dom', dom); lg.set('__lastToast', ''); lg.run('sb=__rec');
      await lg.run(call); if (!err) await nueva(n.db as never);
      if (ok !== undefined || err) expect(lg.run('__lastToast')).toBe(err ?? ok);
      expect(J(n.llamadas)).toEqual(J(v.llamadas));
    };
    const pv = d.proveedores[0]?.id ?? '', p = d.productos[0];
    for (const x of [
      { nombre: 'Cera mate', categoria: 'Ceras', proveedor: pv, costo: '3000', precio: '9000', comision: '10', stockInicial: '12', minimo: '3' },
      { nombre: 'Gel', categoria: 'Otros', proveedor: '', costo: '', precio: 'abc', comision: '', stockInicial: '', minimo: '' },
      { nombre: '  ', categoria: 'Otros', proveedor: '', costo: '1', precio: '1', comision: '1', stockInicial: '1', minimo: '1' },
    ] as S.FormProducto[]) {
      const dom = { pn: x.nombre, pc: x.categoria, ppv: x.proveedor, pco: x.costo, ppr: x.precio, pcm: x.comision, pst: x.stockInicial!, pmi: x.minimo };
      await cmp('A.addp()', dom, S.validarProducto(x), (db) => S.crearProducto(db, x), 'Producto agregado');
      const dom2 = { en: x.nombre, ec: x.categoria, epv: x.proveedor, eco: x.costo, epr: x.precio, ecm: x.comision, emi: x.minimo };
      await cmp(`A.psave({i:${js(p.id)}})`, dom2, S.validarProducto(x), (db) => S.actualizarProducto(db, p.id, x), 'Producto actualizado');
    }
    for (const x of [
      { producto: p.id, proveedor: pv, cantidad: '6', costo: '2500', fecha: '2026-11-10', medio: 'transferencia' },
      { producto: p.id, proveedor: '', cantidad: '1', costo: '0', fecha: '', medio: '' },
      { producto: p.id, proveedor: '', cantidad: '0', costo: '10', fecha: '', medio: '' },
      { producto: p.id, proveedor: '', cantidad: '2', costo: '', fecha: '', medio: '' },
      { producto: '', proveedor: '', cantidad: '2', costo: '5', fecha: '', medio: '' },
    ] as S.FormCompra[])
      await cmp('A.addc()', { cp: x.producto, cv: x.proveedor, cq: x.cantidad, cc: x.costo, cd: x.fecha, cmp2: x.medio }, S.validarCompra(x), (db) => S.registrarCompra(db, x), 'Compra registrada');
    await cmp(`A.pajus({i:${js(p.id)}})`, { aj_n: '7' }, null, (db) => S.ajustarStock(db, p.id, '7'), 'Stock ajustado');
    await cmp(`A.pajus({i:${js(p.id)}})`, { aj_n: '0' }, null, (db) => S.ajustarStock(db, p.id, '0'), 'Stock ajustado');
    await cmp(`A.pajus({i:${js(p.id)}})`, { aj_n: '' }, 'Ingresá el stock real', async () => null);
    await cmp(`A.pperd({i:${js(p.id)}})`, { pl_n: '2', pl_m: 'roto' }, null, (db) => S.registrarPerdida(db, p.id, '2', 'roto'), 'Pérdida registrada');
    await cmp(`A.pperd({i:${js(p.id)}})`, { pl_n: '1', pl_m: '' }, null, (db) => S.registrarPerdida(db, p.id, '1', ''), 'Pérdida registrada');
    await cmp(`A.pperd({i:${js(p.id)}})`, { pl_n: '0', pl_m: '' }, 'Poné la cantidad', async () => null);
    await cmp(`A.delp({i:${js(p.id)}})`, {}, null, (db) => S.quitarProducto(db, p.id));
    for (const [n, t, o] of [['Distribuidora Norte', ' 3874 ', ' lunes '], ['Sin datos', '', ''], [' ', '', '']])
      await cmp('A.addpv()', { vn: n, vt: t, vo: o }, S.validarProveedor(n), (db) => S.crearProveedor(db, n, t, o), 'Proveedor agregado');
    if (pv) await cmp(`A.delpv({i:${js(pv)}})`, {}, null, (db) => S.quitarProveedor(db, pv));
  });
});
