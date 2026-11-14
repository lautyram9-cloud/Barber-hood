import { useEffect, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAll, rpc, sb } from '@/lib/supabase';
import type { CajaResumen, CostosDueno, TableName } from '@/lib/database.types';
import { buildAppData, mezclarCostos } from '@/domain/build';
import type { AppData, RawTables } from '@/domain/model';

// Capa de datos. Lee las MISMAS tablas que la versión estable, con la misma paginación,
// pero cada tabla es una consulta independiente: un cambio en vivo recarga solo esa tabla
// (la versión estable recargaba todo). Además se recarga cada 60 s como respaldo.

interface Spec { table: TableName; owner?: true; order?: string[] }
export const TABLES: Spec[] = [
  { table: 'barberos' }, { table: 'servicios' }, { table: 'productos' }, { table: 'horarios' }, { table: 'turnos' },
  { table: 'ingresos' }, { table: 'gastos', owner: true }, { table: 'liquidaciones' }, { table: 'adelantos' }, { table: 'asistencia' },
  { table: 'mov_stock', owner: true }, { table: 'dueno_mov', owner: true }, { table: 'comisiones_barbero' }, { table: 'clientes' },
  { table: 'turno_items', order: ['turno_id', 'servicio_id'] }, // no tiene columna id
  { table: 'cajas', owner: true }, { table: 'caja_mov', owner: true }, { table: 'proveedores', owner: true },
];

const REFRESH_MS = 60_000;
export const tableKey = (t: TableName) => ['tabla', t] as const;

export function useAppData(owner: boolean) {
  const qc = useQueryClient();
  const specs = useMemo(() => TABLES.filter((s) => owner || !s.owner), [owner]);

  const results = useQueries({
    queries: specs.map((s) => ({
      queryKey: tableKey(s.table),
      queryFn: () => fetchAll(s.table, s.order),
      refetchInterval: REFRESH_MS,
      staleTime: 5_000,
    })),
  });

  // Costos de productos y de ventas: la base solo se los entrega al dueño (RPC costos_dueno, etapa 11).
  const costos = useQuery({
    queryKey: ['costos'],
    queryFn: () => rpc<CostosDueno>('costos_dueno'),
    enabled: owner,
    refetchInterval: REFRESH_MS,
    staleTime: 5_000,
  });

  // Datos en vivo: suscripción a todas las tablas que se leen (la versión estable no
  // escuchaba clientes, turno_items, cajas, caja_mov, comisiones_barbero ni proveedores).
  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let ch = sb.channel('bh-next');
    for (const s of specs) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: s.table }, () => {
        clearTimeout(timers.get(s.table));
        timers.set(s.table, setTimeout(() => {
          qc.invalidateQueries({ queryKey: tableKey(s.table) });
          if (s.table == 'productos' || s.table == 'ingresos' || s.table == 'mov_stock') qc.invalidateQueries({ queryKey: ['costos'] });
          qc.invalidateQueries({ queryKey: ['caja_resumen'] });
        }, 500));
      });
    }
    ch.subscribe();
    const online = () => qc.invalidateQueries({ queryKey: ['tabla'] });
    addEventListener('online', online);
    return () => { timers.forEach(clearTimeout); sb.removeChannel(ch); removeEventListener('online', online); };
  }, [qc, specs]);

  const errorCostos = costos.error ? Object.assign(new Error('No se pudieron leer los costos (¿falta ejecutar supabase/etapa11a-costos-dueno.sql?)'), { tabla: 'costos' }) : undefined;
  const error = (results.find((r) => r.error)?.error ?? errorCostos) as (Error & { tabla?: string }) | undefined;
  const ready = results.every((r) => r.data !== undefined) && (!owner || costos.data !== undefined);
  const stamp = results.map((r) => r.dataUpdatedAt).join(',') + '|' + costos.dataUpdatedAt;

  const data = useMemo<AppData | undefined>(() => {
    if (!ready) return undefined;
    const raw: Record<string, unknown> = {};
    specs.forEach((s, i) => (raw[s.table] = results[i].data));
    return buildAppData(owner && costos.data ? mezclarCostos(raw as RawTables, costos.data) : (raw as RawTables));
  }, [ready, stamp]);

  return { data, error, loading: !ready && !error, refetch: () => { qc.invalidateQueries({ queryKey: ['tabla'] }); qc.invalidateQueries({ queryKey: ['costos'] }); } };
}

/** Resumen de la caja abierta (RPC de solo lectura caja_resumen). Solo dueño. */
export function useCajaResumen(cajaId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['caja_resumen', cajaId],
    queryFn: () => rpc<CajaResumen>('caja_resumen', { p_caja: cajaId }),
    enabled: enabled && !!cajaId,
    refetchInterval: REFRESH_MS,
  });
}
