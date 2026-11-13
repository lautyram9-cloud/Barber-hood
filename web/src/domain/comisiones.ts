import type { AppData, Liquidacion } from './model';
import { formatoPesos as fmt, nombreBarbero, rango, sumMonto, today, type Periodo } from './logic';
import type { Db } from './turnos';

// Comisiones: liquidaciones, adelantos y comprobante (V.com, liq, liqok, adel, ldet, lshare).

/** Días reales del mes: evita mandar a la base fechas inexistentes como 2026-09-31. */
function fechaValida(f: string) {
  const [y, m, d] = f.split('-').map(Number), ult = new Date(y, m, 0).getDate();
  return d > ult ? `${f.slice(0, 8)}${String(ult).padStart(2, '0')}` : f;
}

/** Resumen previo a liquidar: comisiones no liquidadas hasta el fin del período (o hoy) menos adelantos pendientes. */
// `hoy` se puede fijar (pruebas); por defecto es la fecha local actual.
export function previaLiquidacion(d: AppData, barberoId: string, per: Periodo, ref: string, hoy = today()) {
  const fin = rango(per, ref)[1], h = fechaValida(fin < hoy ? fin : hoy);
  const M = d.movs.filter((m) => m.tipo == 'ing' && m.barberoId == barberoId && !m.liquidacionId && m.fecha <= h);
  const comisiones = M.reduce((t, m) => t + (+(m.comisionMonto as number) || 0), 0), adelantos = sumMonto(d.adelantos.filter((a) => a.barberoId == barberoId && !a.liquidacionId));
  return { hasta: h, operaciones: M.length, comisiones, adelantos, aPagar: comisiones - adelantos };
}

export const ultimosAdelantos = (d: AppData) => d.adelantos.slice().reverse().slice(0, 8);
export const ultimasLiquidaciones = (d: AppData) => d.liquidaciones.slice().sort((a, b) => b.ts - a.ts).slice(0, 15);
export const detalleLiquidacion = (d: AppData, x: Liquidacion) => d.movs.filter((m) => m.liquidacionId == x.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
export const pctComision = (monto: number, comision: number) => (monto ? Math.round((comision / monto) * 100) : 0);

/** Texto del comprobante para compartir (idéntico a la versión estable). */
export function textoComprobante(d: AppData, x: Liquidacion) {
  return 'BARBER HOOD · Comprobante de liquidación\nBarbero: ' + nombreBarbero(d, x.barberoId) + '\nPeríodo: ' + (x.desde || '') + ' al ' + (x.hasta || '') + '\nPagado el ' + x.fecha + ' (' + (x.medioPago || 'efectivo') + ')\n\n' +
    detalleLiquidacion(d, x).map((m) => m.fecha + ' ' + m.concepto + ' ' + fmt(m.monto) + ' → ' + fmt(m.comisionMonto as number)).join('\n') +
    '\n\nComisiones: ' + fmt(x.bruto) + '\nAdelantos: -' + fmt(x.bruto - x.monto) + '\nTOTAL PAGADO: ' + fmt(x.monto);
}

export async function liquidar(db: Db, barberoId: string, hasta: string, medio: string) {
  const r = await db.rpc('liquidar_comisiones', { p_barbero: barberoId, p_hasta: hasta, p_medio: medio || 'efectivo' }); if (r.error) throw r.error;
}
export const validarAdelanto = (barbero: string, monto: string) => (!barbero || !(+monto > 0) ? 'Elegí barbero y monto' : null);
export async function registrarAdelanto(db: Db, barbero: string, monto: string, nota: string, medio: string) {
  const r = await db.from('adelantos').insert({ barbero_id: barbero, monto: +monto, nota: nota || null, medio_pago: medio || 'efectivo' }); if (r.error) throw r.error;
}
