import type { AppData, Producto } from './model';
import { nombreBarbero, today } from './logic';
import type { Db } from './turnos';

// Stock: inventario, compras, pérdidas, ajustes, proveedores y pedido sugerido (V.stk, pnew/addp,
// pcomp/addc, pst/psave/pajus/pperd/delp, pvs/addpv/delpv, pedido). Los movimientos que tocan
// el stock pasan por funciones de la base (registrar_compra, ajustar_stock, registrar_perdida).

export const CATEGORIAS = ['Ceras', 'Polvos texturizantes', 'Shampoos', 'Alisantes', 'Decolorantes', 'Tintes', 'Guantes y descartables', 'Limpieza', 'Otros'];
const ok = async (q: PromiseLike<{ error: unknown; data?: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data; };

export const productosOrdenados = (d: AppData) => d.productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
export const esBajo = (p: Producto) => p.stock <= (+p.stockMin || 0);
export const margenPct = (p: Producto) => (p.precio ? Math.round(((p.precio - p.costo) / p.precio) * 100) : 0);
export const nombreProveedor = (d: AppData, id: string) => d.proveedores.find((x) => x.id == id)?.nombre || '';

export function resumenStock(d: AppData, a: string, b: string) {
  const P = productosOrdenados(d), movs = d.movStock.filter((x) => x.fecha >= a && x.fecha <= b).sort((x, y) => y.ts - x.ts), top: Record<string, number> = {};
  movs.filter((x) => x.tipo == 'venta').forEach((x) => (top[x.nombre] = (top[x.nombre] || 0) + x.cantidad));
  return {
    productos: P, bajos: P.filter(esBajo), categorias: [...new Set(P.map((p) => p.categoria || 'Otros'))],
    valorCosto: P.reduce((t, p) => t + p.stock * p.costo, 0), valorVenta: P.reduce((t, p) => t + p.stock * p.precio, 0),
    masVendidos: Object.entries(top).sort((x, y) => y[1] - x[1]).slice(0, 8), movimientos: movs.slice(0, 40),
  };
}
export const detalleMovStock = (d: AppData, x: AppData['movStock'][number]) => [x.tipo, x.proveedor, x.nota, x.barberoId && nombreBarbero(d, x.barberoId)].filter(Boolean).join(' · ');
export const historialProducto = (d: AppData, p: Producto) => d.movStock.filter((x) => x.productoId == p.id).sort((x, y) => y.ts - x.ts).slice(0, 12);
export const ventasProducto = (d: AppData, p: Producto) => d.movs.filter((m) => m.tipo == 'ing' && m.productoId == p.id).length;

/** Pedido sugerido: productos con poco stock agrupados por proveedor, hasta el doble del mínimo. */
export function pedidoSugerido(d: AppData) {
  const g: Record<string, { nombre: string; cantidad: number }[]> = {};
  d.productos.filter(esBajo).forEach((p) => { const k = nombreProveedor(d, p.proveedorId) || 'Sin proveedor'; (g[k] ??= []).push({ nombre: p.nombre, cantidad: Math.max((+p.stockMin || 0) * 2 - p.stock, 1) }); });
  const grupos = Object.entries(g);
  return { grupos, texto: grupos.map(([k, x]) => k + ':\n' + x.map((y) => '- ' + y.nombre + ' x' + y.cantidad).join('\n')).join('\n\n') };
}

export interface FormProducto { nombre: string; categoria: string; proveedor: string; costo: string; precio: string; comision: string; stockInicial?: string; minimo: string }
const filaProducto = (x: FormProducto) => ({ nombre: x.nombre.trim(), categoria: x.categoria, proveedor_id: x.proveedor || null, costo: +x.costo || 0, precio: +x.precio || 0, comision_pct: +x.comision || 0 });
export const validarProducto = (x: FormProducto) => (!x.nombre.trim() ? 'Poné el nombre' : null);
export async function crearProducto(db: Db, x: FormProducto) {
  const data = (await ok(db.from('productos').insert({ ...filaProducto(x), stock: 0, stock_min: +x.minimo || 0 }).select('id').single())) as { id: string };
  const q = +(x.stockInicial ?? '') || 0;
  if (q > 0) await ok(db.rpc('ajustar_stock', { p_producto: data.id, p_nuevo: q, p_nota: 'Stock inicial' }));
}
export const actualizarProducto = (db: Db, id: string, x: FormProducto) => ok(db.from('productos').update({ ...filaProducto(x), stock_min: +x.minimo || 0 }).eq('id', id));
export const quitarProducto = (db: Db, id: string) => ok(db.from('productos').update({ activo: false }).eq('id', id));

export interface FormCompra { producto: string; proveedor: string; cantidad: string; costo: string; fecha: string; medio: string }
export const validarCompra = (x: FormCompra) => (!x.producto || !(+x.cantidad > 0) || !(+x.costo >= 0) || x.costo === '' ? 'Completá producto, cantidad y costo' : null);
export const registrarCompra = (db: Db, x: FormCompra) =>
  ok(db.rpc('registrar_compra', { p_producto: x.producto, p_cant: +x.cantidad, p_costo: +x.costo, p_proveedor: x.proveedor || null, p_fecha: x.fecha || today(), p_medio: x.medio || 'efectivo' }));
export const ajustarStock = (db: Db, id: string, real: string) => ok(db.rpc('ajustar_stock', { p_producto: id, p_nuevo: +real, p_nota: 'Conteo físico' }));
export const registrarPerdida = (db: Db, id: string, cant: string, motivo: string) => ok(db.rpc('registrar_perdida', { p_producto: id, p_cant: +cant, p_motivo: motivo || null }));

export const validarProveedor = (n: string) => (!n.trim() ? 'Poné el nombre' : null);
export const crearProveedor = (db: Db, n: string, tel: string, notas: string) => ok(db.from('proveedores').insert({ nombre: n.trim(), telefono: tel.trim() || null, notas: notas.trim() || null }));
export const quitarProveedor = (db: Db, id: string) => ok(db.from('proveedores').update({ activo: false }).eq('id', id));
