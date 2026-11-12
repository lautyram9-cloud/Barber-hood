import type { CajaResumen } from '@/lib/database.types';
import type { AppData } from './model';
import type { Db } from './turnos';

// Caja: apertura, efectivo esperado, movimientos manuales, arqueo y cierre (V.cj, abrir, cmov, cerrar).
// El cálculo del efectivo esperado lo hace la base (caja_resumen); acá solo se muestra.

export const historialCajas = (d: AppData) => d.cajasCerradas.slice(0, 10);

/** Detalle del efectivo: [etiqueta, monto, signo]. */
export const detalleEfectivo = (r: CajaResumen): [string, number, 1 | -1][] => [
  ['Saldo inicial', r.inicial, 1], ['Cobros en efectivo', r.ing_efectivo, 1], ['Ingresos manuales', r.mov_in, 1], ['Gastos en efectivo', r.gastos_efectivo, -1],
  ['Liquidaciones pagadas', r.liquidaciones, -1], ['Adelantos', r.adelantos, -1], ['Compras a proveedores (efectivo)', r.compras_efectivo || 0, -1], ['Egresos manuales', r.mov_out, -1],
];

export async function abrirCaja(db: Db, saldo: string) {
  const r = await db.rpc('abrir_caja', { p_saldo: +saldo || 0 }); if (r.error) throw r.error;
}
export const validarMovCaja = (concepto: string, monto: string, cajaId?: string | null) => (!(+monto > 0) || !concepto.trim() || !cajaId ? 'Completá concepto y monto' : null);
export async function movimientoCaja(db: Db, cajaId: string, tipo: string, concepto: string, monto: string) {
  const r = await db.from('caja_mov').insert({ caja_id: cajaId, tipo, concepto: concepto.trim(), monto: +monto }); if (r.error) throw r.error;
}
/** Cierra la caja. Devuelve la diferencia (contado − esperado) que calcula la base. */
export async function cerrarCaja(db: Db, cajaId: string, contado: string, notas: string): Promise<number> {
  const r = await db.rpc('cerrar_caja', { p_caja: cajaId, p_contado: +contado, p_notas: notas || null }); if (r.error) throw r.error;
  return r.data as number;
}
