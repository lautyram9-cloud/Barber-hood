import type { AppData, Horario, Movimiento, RawTables } from './model';
import { mezclarCostos } from './build';
import { formatoPesos as fmt, horarioSemanal, sumMonto, today } from './logic';
import type { Db } from './turnos';

// Dueño (V.due, adddue) y Ajustes (V.aj: disponibilidad, barberos, comisiones, servicios,
// respaldo e historial de cambios). Portado 1:1 de la versión estable.

const ok = async (q: PromiseLike<{ error: unknown; data?: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data; };
export const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

// ---------- Dueño ----------
/** Movimientos privados del dueño en [a, b], como movimientos de la lista (más nuevos primero). */
export function movimientosDueno(d: AppData, a: string, b: string): Movimiento[] {
  return d.dueno.filter((x) => (x.fecha || '') >= a && (x.fecha || '') <= b).sort((x, y) => y.fecha.localeCompare(x.fecha))
    .map((x) => ({ id: x.id, tipo: x.tipo == 'ing' ? 'ing' : 'gas', categoria: '', concepto: x.concepto, monto: x.monto, fecha: x.fecha, medioPago: '', ts: x.ts } as Movimiento));
}
export const totalesDueno = (M: Movimiento[]) => { const i = sumMonto(M.filter((m) => m.tipo == 'ing')), g = sumMonto(M.filter((m) => m.tipo == 'gas')); return { ingresos: i, gastos: g, neto: i - g }; };
export const validarDueno = (concepto: string, monto: string) => (!(+monto > 0) || !concepto.trim() ? 'Completá concepto y monto' : null);
export const guardarDueno = (db: Db, tipo: string, concepto: string, monto: string, fecha: string) =>
  ok(db.from('dueno_mov').insert({ fecha: fecha || today(), tipo, concepto: concepto.trim(), monto: +monto }));

// ---------- Disponibilidad ----------
export const textoTramos = (h: Horario, d: number) => (horarioSemanal(h)[d] || []).map((r) => r.join('-')).join(', ');
/** "10:00-13:00, 15:00-20:00" → tramos válidos (pr). */
export const parsearTramos = (s: string) => s.split(',').map((x) => x.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/)).filter(Boolean)
  .map((m) => [m![1].padStart(2, '0') + ':' + m![2], m![3].padStart(2, '0') + ':' + m![4]] as [string, string]);
/** Arma las filas para guardar_horarios, o el error si un día marcado no tiene tramos válidos. */
export function filasHorario(form: Record<number, { abierto: boolean; tramos: string }>): { error: string } | { filas: { dia: number; desde: string; hasta: string }[] } {
  const filas: { dia: number; desde: string; hasta: string }[] = [];
  for (let d = 0; d < 7; d++) {
    const k = form[d]?.abierto, r = k ? parsearTramos(form[d].tramos) : [];
    if (k && !r.length) return { error: 'Revisá el horario de ' + DIAS[d] };
    r.forEach((x) => filas.push({ dia: d, desde: x[0], hasta: x[1] }));
  }
  return { filas };
}
export const guardarHorarios = (db: Db, filas: { dia: number; desde: string; hasta: string }[]) => ok(db.rpc('guardar_horarios', { p: filas }));

// ---------- Barberos y comisiones ----------
export const nombreItem = (d: AppData, x: { servicioId: string | null; productoId: string | null }) =>
  x.servicioId ? d.servicios.find((s) => s.id == x.servicioId)?.nombre || 'servicio' : d.productos.find((p) => p.id == x.productoId)?.nombre || 'producto';
export const guardarPctGeneral = (db: Db, id: string, pct: string) => ok(db.from('barberos').update({ comision_pct: pct === '' ? null : +pct }).eq('id', id));
export const validarExcepcion = (pct: string) => (pct === '' ? 'Poné el porcentaje' : null);
export function agregarExcepcion(db: Db, barbero: string, item: string, pct: string) {
  const [k, id] = item.split(':');
  return ok(db.from('comisiones_barbero').insert({ barbero_id: barbero, [k == 's' ? 'servicio_id' : 'producto_id']: id, pct: +pct }));
}
export const quitarExcepcion = (db: Db, id: string) => ok(db.from('comisiones_barbero').delete().eq('id', id));
export async function agregarBarbero(db: Db, nombre: string, minutos: string, email: string) {
  const data = (await ok(db.from('barberos').insert({ nombre: nombre.trim(), slot_min: +minutos || 30 }).select('id').single())) as { id: string };
  if (email.trim()) await ok(db.rpc('vincular_barbero', { p_barbero: data.id, p_email: email.trim() }));
}
export const quitarBarbero = (db: Db, id: string) => ok(db.from('barberos').update({ activo: false }).eq('id', id));
export const agregarServicio = (db: Db, n: string, precio: string, pct: string, dur: string) =>
  ok(db.from('servicios').insert({ nombre: n.trim(), precio: +precio || 0, comision_pct: +pct || 0, duracion_min: +dur || null }));
export const quitarServicio = (db: Db, id: string) => ok(db.from('servicios').update({ activo: false }).eq('id', id));

// ---------- Respaldo e historial ----------
export const TABLAS_RESPALDO = ['barberos', 'servicios', 'productos', 'proveedores', 'horarios', 'clientes', 'turnos', 'turno_items', 'ingresos', 'gastos', 'liquidaciones', 'adelantos', 'asistencia', 'mov_stock', 'cajas', 'caja_mov', 'comisiones_barbero', 'dueno_mov'] as const;
/** Copia de seguridad completa (mismo formato JSON que la versión estable). */
export async function generarRespaldo(leer: (tabla: string, orden?: string[]) => Promise<unknown[]>, costos?: Parameters<typeof mezclarCostos>[1]) {
  const o: Record<string, unknown> = { fecha: new Date().toISOString(), version: 1 };
  for (const t of TABLAS_RESPALDO) o[t] = await leer(t, t == 'turno_items' ? ['turno_id', 'servicio_id'] : undefined);
  // La base no entrega los costos con las tablas: la copia del dueño los incluye para poder restaurarlos.
  if (costos) Object.assign(o, mezclarCostos(o as RawTables, costos));
  return { nombre: 'barberhood-copia-' + today() + '.json', texto: JSON.stringify(o) };
}

/** Nombres legibles de cada tabla para el resumen de la restauración. */
export const NOMBRE_TABLA: Record<string, string> = {
  barberos: 'barberos', servicios: 'servicios', proveedores: 'proveedores', productos: 'productos', horarios: 'horarios', clientes: 'clientes',
  comisiones_barbero: 'comisiones por barbero', turnos: 'turnos', turno_items: 'servicios de turnos', cajas: 'cajas', caja_mov: 'movimientos de caja',
  liquidaciones: 'liquidaciones', ingresos: 'ingresos', adelantos: 'adelantos', asistencia: 'asistencias', mov_stock: 'movimientos de stock',
  gastos: 'gastos', dueno_mov: 'movimientos del dueño',
};
/** Lee y valida el archivo de copia (mismo formato que generarRespaldo). */
export function leerRespaldo(texto: string): { respaldo: Record<string, unknown> } | { error: string } {
  let o: unknown;
  try { o = JSON.parse(texto); } catch { return { error: 'El archivo no es una copia válida' }; }
  if (!o || typeof o !== 'object' || Array.isArray(o) || (o as { version?: unknown }).version !== 1) return { error: 'El archivo no es una copia de Barber Hood' };
  const r = o as Record<string, unknown>;
  if (!TABLAS_RESPALDO.some((t) => Array.isArray(r[t]))) return { error: 'La copia no tiene datos' };
  if (TABLAS_RESPALDO.some((t) => r[t] !== undefined && !Array.isArray(r[t]))) return { error: 'La copia está dañada' };
  return { respaldo: r };
}
/** Filas que faltan por tabla (solo las que tienen algo), como "3 ingresos, 1 turno". */
export function faltantes(res: Record<string, number>) {
  const filas = TABLAS_RESPALDO.filter((t) => (res[t] ?? 0) > 0).map((t) => ({ tabla: t, nombre: NOMBRE_TABLA[t] ?? t, n: res[t] }));
  return { filas, total: filas.reduce((a, f) => a + f.n, 0), texto: filas.map((f) => `${f.nombre}: ${f.n}`).join(", ") };
}
/** Restaurar = RECUPERAR LO QUE FALTA (nunca pisa ni borra). aplicar=false solo simula. Función SQL restaurar_respaldo (etapa 10). */
export const restaurarRespaldo = async (db: Db, respaldo: Record<string, unknown>, aplicar: boolean) =>
  (await ok(db.rpc('restaurar_respaldo', { p: respaldo, p_aplicar: aplicar }))) as Record<string, number>;

export interface FilaAuditoria { usuario: string | null; op: string | null; tabla: string | null; fecha: string; fila: unknown; antes: unknown }
const TN: Record<string, string> = { ingresos: 'un ingreso', gastos: 'un gasto', liquidaciones: 'una liquidación', adelantos: 'un adelanto', productos: 'un producto', servicios: 'un servicio', barberos: 'un barbero' };
const OP: Record<string, string> = { INSERT: 'creó', UPDATE: 'modificó', DELETE: 'eliminó' };
/** Texto de cada cambio del historial (aud). */
export function describirCambio(d: AppData, x: FilaAuditoria) {
  const quien = !x.usuario ? 'Sistema' : d.barberosTodos.find((b) => b.user_id == x.usuario)?.nombre || 'Dueño';
  const f = (x.fila || x.antes || {}) as Record<string, unknown>, m = f.monto || f.total;
  return {
    titulo: `${quien} ${OP[x.op ?? ''] || x.op} ${TN[x.tabla ?? ''] || x.tabla}`,
    detalle: `${(f.concepto || f.nombre || '') as string}${m ? ' · ' + fmt(+(m as number)) : ''} · ${(x.fecha || '').slice(0, 16).replace('T', ' ')}`,
  };
}
