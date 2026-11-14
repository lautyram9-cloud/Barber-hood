import { createClient } from '@supabase/supabase-js';
import { SUPABASE } from '@/config';
import type { Rows, TableName } from './database.types';

// Mismas opciones por defecto que la versión estable: la sesión se guarda en
// localStorage con la misma clave, así que el login se comparte entre ambas versiones.
export const sb = createClient(SUPABASE.url, SUPABASE.key);

/** Lectura paginada de a 1000 filas: equivalente a fa() de la versión estable. */
/**
 * Columnas que se piden de las tablas con costos. Nunca '*': a los barberos la base no les muestra
 * productos.costo ni ingresos.costo_unit (etapa 11), y pedir '*' fallaría. El dueño los recibe aparte (costos_dueno).
 */
export const COLUMNAS: Partial<Record<TableName, string>> = {
  productos: 'id,activo,categoria,comision_pct,nombre,precio,proveedor_id,stock,stock_min',
  ingresos: 'id,barbero_id,cantidad,cliente,cliente_id,cobrado,cobrado_at,comision_monto,comision_pct,concepto,creado_por,created_at,fecha,liquidacion_id,medio_pago,op_id,precio_unit,producto_id,servicio_id,tipo,total,turno_id',
};

export async function fetchAll<T extends TableName>(table: T, orderBy: string[] = ['id']): Promise<Rows[T][]> {
  const out: Rows[T][] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(COLUMNAS[table] ?? '*');
    for (const c of orderBy) q = q.order(c);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw Object.assign(new Error(error.message), { tabla: table, code: error.code });
    out.push(...((data ?? []) as Rows[T][]));
    if (!data || data.length < 1000) return out;
  }
}

export async function rpc<R = unknown>(fn: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as R;
}
