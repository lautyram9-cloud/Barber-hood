import type { AppData, Movimiento } from './model';
import { nombreBarbero, sumMonto, today } from './logic';
import type { Db } from './turnos';

// Botón + (A.fab / qsave / qsg) y sección Movimientos (V.caja / addmov / pcard / pcob / del).
// Portado 1:1. El registro de ingresos pasa SIEMPRE por la función de la base
// registrar_ingreso (atómica, con idempotencia por op_id contra el doble toque).

export const MEDIOS: [string, string][] = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta']];
export const GASTOS_RAPIDOS: Record<'fijo' | 'variable', string[]> = {
  fijo: ['Alquiler', 'Luz', 'Agua', 'Internet', 'Sueldos', 'Monotributo'],
  variable: ['Insumos', 'Limpieza', 'Publicidad', 'Reparaciones', 'Impuestos', 'Otros'],
};
/** Secciones donde aparece el botón + (igual que la versión estable). */
export const SECCIONES_CON_BOTON = ['ini', 'caja', 'tur', 'me', 'stk', 'cj'];

const enRango = (m: { fecha: string }, a: string, b: string) => (m.fecha || '') >= a && (m.fecha || '') <= b;

/** Comisiones del período por barbero activo (com()). */
export function comisionesPeriodo(d: AppData, a: string, b: string) {
  const M = d.movs.filter((x) => enRango(x, a, b) && x.tipo == 'ing');
  return d.barberos.map((barbero) => ({
    barbero,
    servicios: sumMonto(M.filter((x) => x.barberoId == barbero.id && x.categoria == 'servicio')),
    productos: sumMonto(M.filter((x) => x.barberoId == barbero.id && x.categoria == 'producto')),
    comision: M.filter((x) => x.barberoId == barbero.id).reduce((t, x) => t + (+(x.comisionMonto as number) || 0), 0),
  }));
}

/** Indicadores de Movimientos: gastos incluye comisiones y costo de productos vendidos. */
export function resumenMovimientos(d: AppData, a: string, b: string) {
  const M = d.movs.filter((m) => enRango(m, a, b)), I = M.filter((m) => m.tipo == 'ing');
  const comisiones = comisionesPeriodo(d, a, b).reduce((t, x) => t + (x.comision > 0 ? x.comision : 0), 0);
  const ingresos = sumMonto(I), gastos = sumMonto(M.filter((m) => m.tipo == 'gas')) + comisiones + I.reduce((t, m) => t + (m.costoUnit || 0) * (m.cantidad || 1), 0);
  return { ingresos, gastos, neto: ingresos - gastos };
}

/** Movimientos del período, del más nuevo al más viejo. */
export const movimientosPeriodo = (d: AppData, a: string, b: string) => d.movs.filter((m) => enRango(m, a, b)).sort((x, y) => y.fecha.localeCompare(x.fecha) || y.ts - x.ts);
/** Ingresos pendientes de cobro (todos), del más viejo al más nuevo. */
export const pendientesCobro = (d: AppData) => d.movs.filter((m) => m.tipo == 'ing' && !m.cobrado).sort((a, b) => a.fecha.localeCompare(b.fecha));
/** El dueño puede editar/anular un movimiento si no está liquidado (la base también lo impide). */
export const editable = (m: Movimiento, owner: boolean) => owner && !m.liquidacionId;
export const tablaDe = (m: Movimiento) => (m.tipo == 'ing' ? 'ingresos' : 'gastos');

export function detalleMovimiento(d: AppData, m: Movimiento) {
  const p = [m.categoria, nombreBarbero(d, m.barberoId)].filter(Boolean).join(' ');
  return [p, m.tipo == 'ing' && m.comisionMonto ? `com. $${Math.round(m.comisionMonto).toLocaleString('es-AR')}` : '', m.liquidacionId ? 'liquidado' : '',
    m.tipo == 'ing' && !m.cobrado ? 'sin cobrar' : '', m.medioPago && m.medioPago != 'efectivo' ? m.medioPago : ''].filter(Boolean).join(' · ');
}

// ---------- Registro ----------
interface Ingreso { op: string; tipo: string; concepto: string; precio: number; cantidad: number; servicioId: string; productoId: string; barbero: string; cliente: string; fecha: string; medio: string; clienteId?: string; cobrado: boolean }
/** Llamada a registrar_ingreso con los mismos parámetros que ingreso() de la versión estable. */
export function registrarIngreso(db: Db, o: Ingreso) {
  return db.rpc('registrar_ingreso', {
    p_op: o.op, p_tipo: o.tipo, p_concepto: o.concepto, p_servicio: o.servicioId || null, p_producto: o.productoId || null, p_cant: o.cantidad || 1,
    p_precio: o.precio, p_barbero: o.barbero || null, p_cliente: o.cliente || null, p_fecha: o.fecha || today(), p_medio: o.medio || 'efectivo',
    p_cliente_id: o.clienteId || null, p_cobrado: o.cobrado !== false,
  }).then((r: { error: unknown }) => { if (r.error) throw r.error; });
}

export interface IngresoRapido { tipo: string; concepto: string; monto: string; cantidad: string; productoId: string; cliente: string; barbero: string; fecha: string; medio: string; cobrado: boolean }
/** Validación del botón + (qsave). Ojo: igual que la versión estable, monto vacío cuenta como $0. */
export function validarIngresoRapido(x: IngresoRapido) {
  const c = x.concepto.trim(), u = +x.monto;
  if (!c || !(u >= 0)) return 'Completá concepto y monto';
  if (x.tipo == 'producto' && !x.productoId) return 'Elegí un producto del stock';
  return null;
}
/** Registra el ingreso del botón +. Devuelve el mensaje a mostrar. El barbero siempre se asigna a sí mismo. */
export async function guardarIngresoRapido(db: Db, d: AppData, x: IngresoRapido, op: string, me: string | null) {
  const c = x.concepto.trim(), u = +x.monto, k = x.tipo, q = k == 'producto' ? +x.cantidad || 1 : 1, sv = d.servicios.find((s) => s.nombre == c);
  await registrarIngreso(db, {
    op, tipo: k, concepto: c, precio: u, cantidad: q, productoId: k == 'producto' ? x.productoId : '', servicioId: k == 'servicio' && sv ? sv.id : '',
    barbero: me || x.barbero, cliente: x.cliente.trim(), fecha: x.fecha, medio: x.medio, cobrado: x.cobrado,
  });
  return k == 'servicio' && !sv ? 'Registrado (servicio fuera de la lista: usa la comisión del barbero, si tiene)' : 'Ingreso registrado';
}

export interface GastoRapido { tipo: 'fijo' | 'variable'; concepto: string; monto: string; fecha: string; medio: string }
export const validarGasto = (x: { concepto: string; monto: string }) => (!x.concepto.trim() || !(+x.monto > 0) ? 'Completá concepto y monto' : null);
export async function guardarGastoRapido(db: Db, x: GastoRapido) {
  const r = await db.from('gastos').insert({ fecha: x.fecha || today(), tipo: x.tipo, concepto: x.concepto.trim(), monto: +x.monto, medio_pago: x.medio || 'efectivo' });
  if (r.error) throw r.error;
}

export interface Movimiento_ { clave: string; concepto: string; monto: string; barbero: string; fecha: string }
/** Validación del formulario "Registrar" de Movimientos (addmov). */
export function validarMovimiento(d: AppData, x: Movimiento_, owner: boolean) {
  const [t, k] = x.clave.split('|'), m = +x.monto, c = x.concepto.trim();
  if (!(m > 0) || !c) return 'Completá concepto y monto';
  if (t == 'gas' && !owner) return 'Solo el dueño registra gastos';
  if (t == 'ing' && k == 'producto' && !d.productos.find((p) => p.nombre == c)) return 'Elegí un producto cargado en Stock';
  return null;
}
export async function guardarMovimiento(db: Db, d: AppData, x: Movimiento_, op: string) {
  const [t, k] = x.clave.split('|'), m = +x.monto, c = x.concepto.trim(), fecha = x.fecha || today();
  if (t == 'gas') { const r = await db.from('gastos').insert({ fecha, tipo: k, concepto: c, monto: m }); if (r.error) throw r.error; return; }
  const sv = d.servicios.find((s) => s.nombre == c), pp = d.productos.find((p) => p.nombre == c);
  await registrarIngreso(db, { op, tipo: k, concepto: c, precio: m, cantidad: 1, productoId: k == 'producto' && pp ? pp.id : '', servicioId: k == 'servicio' && sv ? sv.id : '', barbero: x.barbero, cliente: '', fecha, medio: '', cobrado: true });
}

export async function cobrarIngreso(db: Db, id: string, medio: string) {
  const r = await db.rpc('cobrar_ingreso', { p_id: id, p_medio: medio || 'efectivo' }); if (r.error) throw r.error;
}
/** Anular/borrar (del): los ingresos se anulan con la función de la base (devuelve stock); gastos y movimientos del dueño se borran. */
export async function anular(db: Db, tabla: 'ingresos' | 'gastos' | 'dueno_mov', id: string) {
  const r = tabla == 'ingresos' ? await db.rpc('anular_ingreso', { p_id: id }) : await db.from(tabla).delete().eq('id', id);
  if (r.error) throw r.error;
}
export async function cambiarFecha(db: Db, tabla: string, id: string, fecha: string) {
  const r = await db.from(tabla).update({ fecha }).eq('id', id); if (r.error) throw r.error;
}
