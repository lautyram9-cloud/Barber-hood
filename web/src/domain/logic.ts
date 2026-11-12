import type { AppData, Horario, Movimiento, Servicio, Turno } from './model';

// Reglas de negocio del frontend, portadas 1:1 desde la versión estable.
// Cada función indica su equivalente original. No "mejorar" sin actualizar
// tests/parity: el objetivo de esta etapa es comportamiento idéntico.

// ---------- Fechas (iso, today, rng, rgx) ----------
/** Fecha local YYYY-MM-DD (iso). */
export const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const today = () => isoLocal(new Date());

export type Periodo = 'dia' | 'sem' | 'mes' | 'ano';
/** Rango [desde, hasta] del período que contiene a ref (rgx / rng). */
export function rango(p: Periodo, ref: string): [string, string] {
  const d = new Date(ref + 'T00:00:00');
  if (p == 'dia') return [ref, ref];
  if (p == 'sem') {
    const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return [isoLocal(s), isoLocal(e)];
  }
  if (p == 'mes') return [ref.slice(0, 8) + '01', ref.slice(0, 8) + '31'];
  return [ref.slice(0, 4) + '-01-01', ref.slice(0, 4) + '-12-31'];
}

/** Últimos n meses terminando en el mes de ref, como YYYY-MM (med). */
export function ultimosMeses(n: number, ref: string): string[] {
  const o: string[] = [], d = new Date(ref.slice(0, 7) + '-01T00:00:00');
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); o.push(isoLocal(x).slice(0, 7)); }
  return o;
}

// ---------- Finanzas ----------
/** Suma de montos (sum). */
export const sumMonto = (a: { monto: number }[]) => a.reduce((t, x) => t + (+x.monto || 0), 0);

export function nombreBarbero(d: AppData, id: string | undefined) {
  return d.barberosTodos.find((b) => b.id === id)?.nombre || '';
}

export interface StatsBarbero {
  id: string; nombre: string; cortes: number; facturacion: number; servicios: number; productos: number; comision: number;
  unidadesProducto: number; promedioDiario: number; serviciosPorNombre: Record<string, number>; puntual: number; tarde: number; asistencias: number;
}

/** Estadísticas de un barbero en [a, b] (bst). */
export function statsBarbero(d: AppData, id: string, a: string, b: string): StatsBarbero {
  const M = d.movs.filter((m) => m.tipo == 'ing' && m.barberoId == id && m.fecha >= a && m.fecha <= b);
  const sv = M.filter((m) => m.categoria == 'servicio'), pr = M.filter((m) => m.categoria == 'producto');
  const fs = sumMonto(sv), fp = sumMonto(pr), dias = new Set(M.map((m) => m.fecha)).size, g: Record<string, number> = {};
  sv.forEach((m) => (g[m.concepto] = (g[m.concepto] || 0) + 1));
  const AS = d.asistencia.filter((x) => x.barberoId == id && x.fecha >= a && x.fecha <= b);
  return {
    id, nombre: nombreBarbero(d, id), cortes: sv.length, facturacion: fs + fp, servicios: fs, productos: fp,
    comision: M.reduce((t, m) => t + (+(m.comisionMonto as number) || 0), 0), unidadesProducto: pr.reduce((t, m) => t + (m.cantidad || 1), 0),
    promedioDiario: dias ? sv.length / dias : 0, serviciosPorNombre: g,
    puntual: AS.filter((x) => x.estado == 'ok').length, tarde: AS.filter((x) => x.estado == 'tarde').length, asistencias: AS.length,
  };
}

export interface Resultado {
  ingresos: number; operaciones: number; gastosFijos: number; gastosVariables: number; costoProductos: number;
  comisiones: number; perdidas: number; neto: number; cobrado: number; pendiente: number;
}

/** Resultado económico en [a, b] (res). Ganancia = facturación − fijos − variables − costo vendido − comisiones − pérdidas. */
export function resultado(d: AppData, a: string, b: string): Resultado {
  const perdidas = d.movStock.filter((x) => x.tipo == 'perdida' && x.fecha >= a && x.fecha <= b).reduce((t, x) => t + x.cantidad * x.costoUnit, 0);
  const M = d.movs.filter((x) => x.fecha >= a && x.fecha <= b), I = M.filter((m) => m.tipo == 'ing'), G = M.filter((m) => m.tipo == 'gas');
  const gastosFijos = sumMonto(G.filter((m) => m.categoria == 'fijo')), gastosVariables = sumMonto(G.filter((m) => m.categoria != 'fijo'));
  const costoProductos = I.reduce((t, m) => t + (m.costoUnit || 0) * (m.cantidad || 1), 0);
  // Igual que la versión estable: solo suma comisiones de barberos activos.
  const comisiones = d.barberos.reduce((t, x) => t + statsBarbero(d, x.id, a, b).comision, 0);
  const ingresos = sumMonto(I);
  return {
    ingresos, operaciones: I.length, gastosFijos, gastosVariables, costoProductos, comisiones, perdidas,
    neto: ingresos - gastosFijos - gastosVariables - costoProductos - comisiones - perdidas,
    cobrado: sumMonto(I.filter((m) => m.cobrado)), pendiente: sumMonto(I.filter((m) => !m.cobrado)),
  };
}

/** Comisión pendiente de liquidar menos adelantos sin descontar (pendF). Sin id: de todos. */
export function comisionPendiente(d: AppData, id?: string) {
  return (
    d.movs.filter((m) => m.tipo == 'ing' && !m.liquidacionId && (!id || m.barberoId == id)).reduce((t, m) => t + (+(m.comisionMonto as number) || 0), 0) -
    sumMonto(d.adelantos.filter((a) => !a.liquidacionId && (!id || a.barberoId == id)))
  );
}

/** Ingresos cobrados en la fecha f (por momento de cobro). */
export function cobradoEnFecha(d: AppData, f: string) {
  return sumMonto(d.movs.filter((m: Movimiento) => m.tipo == 'ing' && m.cobrado && isoLocal(new Date(m.cobradoAt as number)) == f));
}

export const stockBajo = (d: AppData) => d.productos.filter((p) => p.stock <= (+p.stockMin || 0));

// ---------- Agenda y horarios disponibles ----------
/** Horario semanal con los valores por defecto de la versión estable (H). */
export function horarioSemanal(h: Horario): Horario {
  const def: Horario = { 1: [['10:00', '20:00']], 2: [['10:00', '20:00']], 3: [['10:00', '20:00']], 4: [['10:00', '20:00']], 5: [['10:00', '20:00']], 6: [['10:00', '18:00']], 0: [] };
  for (const k in h) def[+k] = h[+k] || [];
  return def;
}
const hm = (x: string) => +x.slice(0, 2) * 60 + +x.slice(3);
const pad = (n: number) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

export interface AgendaCtx { barberos: { id: string; slotMin: number }[]; horario: Horario; turnos: Pick<Turno, 'fecha' | 'hora' | 'barberoId' | 'duracionMin'>[] }
type ServDur = Pick<Servicio, 'duracionMin'>;

/** Minutos por turno del barbero (bmin). */
export const minutosBarbero = (c: AgendaCtx, b: string) => +(c.barberos.find((y) => y.id == b)?.slotMin as number) || 30;

/** Horarios libres de un barbero (slotsB). */
export function horariosBarbero(c: AgendaCtx, f: string, b: string, ds?: ServDur[]): string[] {
  if (!f || f < today()) return [];
  const rs = horarioSemanal(c.horario)[new Date(f + 'T00:00:00').getDay()] || [], st = minutosBarbero(c, b);
  const dur = ds && ds.length ? ds.reduce((t, s) => t + (s.duracionMin || st), 0) : st, now = new Date().toTimeString().slice(0, 5);
  const ocupado = c.turnos.filter((t) => t.fecha == f && (t.barberoId || '') == b).map((t) => [hm(t.hora), hm(t.hora) + (+t.duracionMin || st)]);
  const o: string[] = [];
  rs.forEach((r) => {
    for (let x = hm(r[0]); x + dur <= hm(r[1]); x += st)
      if (!ocupado.some((z) => x < z[1] && x + dur > z[0]) && (f > today() || pad(x) > now)) o.push(pad(x));
  });
  return o;
}

/** Horarios libres: de un barbero, o la unión de todos si no se elige (slots). */
export function horariosLibres(c: AgendaCtx, f: string, b: string, ds?: ServDur[]): string[] {
  return b || !c.barberos.length ? horariosBarbero(c, f, b || '', ds) : [...new Set(c.barberos.flatMap((x) => horariosBarbero(c, f, x.id, ds)))].sort();
}

/** Barbero a asignar para un horario (pick). */
export const elegirBarbero = (c: AgendaCtx, f: string, h: string, b: string, ds?: ServDur[]) =>
  b || c.barberos.find((x) => horariosBarbero(c, f, x.id, ds).includes(h))?.id || '';

/** Próximo día con horarios libres dentro de 14 días (nextOpen). */
export function proximoDiaAbierto(c: AgendaCtx): string {
  for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); const f = isoLocal(d); if (horariosLibres(c, f, '').length) return f; }
  return today();
}

// ---------- Utilidades ----------
export const formatoPesos = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-AR');

/** Número para wa.me con prefijo argentino (waNum). */
export function numeroWhatsApp(t: string | null | undefined) {
  const d = String(t || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  if (d.startsWith('54')) return d;
  return (d.length == 10 ? '549' : '54') + d;
}
export const linkWhatsApp = (tel: string, msg: string) => 'https://wa.me/' + numeroWhatsApp(tel) + '?text=' + encodeURIComponent(msg);

/** CSV con separador ; y coma decimal, como la versión estable (csv). */
export function aCsv(rows: unknown[][]) {
  return rows
    .map((r) => r.map((c) => {
      const s = c == null ? '' : typeof c == 'number' ? String(c).replace('.', ',') : String(c);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';'))
    .join('\n');
}

// ---------- Estadísticas (V.est / est8 / bcard) ----------
/** Rango del período anterior al que contiene ref (prevR). */
export function rangoAnterior(p: Periodo, ref: string): [string, string] {
  const x = new Date(ref + 'T00:00:00');
  if (p == 'dia') x.setDate(x.getDate() - 1);
  else if (p == 'sem') x.setDate(x.getDate() - 7);
  else if (p == 'mes') x.setMonth(x.getMonth() - 1);
  else x.setFullYear(x.getFullYear() - 1);
  return rango(p, isoLocal(x));
}

const ingresosEn = (d: AppData, a: string, b: string) => d.movs.filter((m) => m.tipo == 'ing' && m.fecha >= a && m.fecha <= b);

export interface ServicioStats { nombre: string; cantidad: number; ingresos: number; comisiones: number; margen: number; margenPct: number }
/** Servicios vendidos en [a, b] agrupados por concepto, ordenados por cantidad. */
function serviciosAgrupados(d: AppData, a: string, b: string): ServicioStats[] {
  const g: Record<string, { n: number; i: number; c: number }> = {};
  ingresosEn(d, a, b).filter((m) => m.categoria == 'servicio').forEach((m) => {
    const x = (g[m.concepto] ??= { n: 0, i: 0, c: 0 }); x.n++; x.i += +m.monto || 0; x.c += +(m.comisionMonto as number) || 0;
  });
  return Object.entries(g).map(([nombre, x]) => ({ nombre, cantidad: x.n, ingresos: x.i, comisiones: x.c, margen: x.i - x.c, margenPct: x.i ? Math.round(((x.i - x.c) / x.i) * 100) : 0 }));
}
/** Servicios vendidos en [a, b] agrupados por concepto, del más vendido al menos vendido. */
export const serviciosVendidos = (d: AppData, a: string, b: string) => serviciosAgrupados(d, a, b).sort((x, y) => y.cantidad - x.cantidad);
/** Los 5 servicios con mayor margen (ingresos − comisiones) en [a, b]. */
export const serviciosMayorMargen = (d: AppData, a: string, b: string) => serviciosAgrupados(d, a, b).sort((x, y) => y.margen - x.margen).slice(0, 5);

/** Clientes (por nombre cargado en el ingreso) nuevos y recurrentes en [a, b]. */
export function clientesNuevosRecurrentes(d: AppData, a: string, b: string) {
  const cl = ingresosEn(d, a, b).filter((m) => m.categoria == 'servicio' && m.cliente);
  const seen = new Set(d.movs.filter((m) => m.tipo == 'ing' && m.cliente && m.fecha < a).map((m) => (m.cliente as string).toLowerCase()));
  const pc = [...new Set(cl.map((m) => (m.cliente as string).toLowerCase()))];
  const rec = pc.filter((c) => seen.has(c) || cl.filter((m) => (m.cliente as string).toLowerCase() == c).length > 1).length;
  return { nuevos: pc.length - rec, recurrentes: rec };
}

/** Cantidad de turnos por hora de inicio en [a, b], horas ordenadas. */
export function demandaPorHora(d: AppData, a: string, b: string): [hora: string, turnos: number][] {
  const hh: Record<string, number> = {};
  d.turnos.filter((t) => t.fecha >= a && t.fecha <= b).forEach((t) => { const k = t.hora.slice(0, 2); hh[k] = (hh[k] || 0) + 1; });
  return Object.keys(hh).sort().map((k) => [k, hh[k]]);
}

export const comisionesPagadas = (d: AppData, a: string, b: string) => sumMonto(d.liquidaciones.filter((x) => x.fecha >= a && x.fecha <= b));
export const gastosTotales = (r: Resultado) => r.gastosFijos + r.gastosVariables + r.comisiones + r.costoProductos + r.perdidas;
export const rentabilidad = (r: Resultado) => (r.ingresos ? Math.round((r.neto / r.ingresos) * 100) : 0);
/** Variación porcentual como la muestra la versión estable (▲/▼ n% o —). */
export const variacion = (x: number, y: number) => (y ? `${x >= y ? '▲' : '▼'} ${Math.abs(Math.round(((x - y) / y) * 100))}%` : '—');
/** Puntualidad y asistencia en % (null si no hay registros). */
export const asistenciaPct = (s: StatsBarbero) => ({
  puntualidad: s.asistencias ? Math.round((s.puntual / s.asistencias) * 100) : null,
  asistencia: s.asistencias ? Math.round(((s.puntual + s.tarde) / s.asistencias) * 100) : null,
});
export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const nombreMes = (ym: string) => MESES[+ym.slice(5) - 1];

// ---------- Clientes (cst) ----------
export function statsCliente(d: AppData, c: AppData['clientes'][number]) {
  const M = d.movs.filter((m) => m.tipo == 'ing' && m.clienteId == c.id), sv = M.filter((m) => m.categoria == 'servicio');
  const vis = [...new Set(sv.map((m) => m.fecha))].sort(), last = vis[vis.length - 1] || '';
  return {
    cliente: c, movs: M, total: sumMonto(M), visitas: vis.length, ultima: last,
    dias: last ? Math.floor((Date.now() - Date.parse(last + 'T00:00:00')) / 864e5) : null,
    frecuencia: vis.length > 1 ? Math.round((Date.parse(last) - Date.parse(vis[0])) / 864e5 / (vis.length - 1)) : null,
  };
}

// ---------- Exportación CSV (A.csv) ----------
const tabla = (h: string[], filas: unknown[][]): unknown[][] => [h, ...filas];
export type CsvTipo = 'mov' | 'liq' | 'tur' | 'cli' | 'stk';
export function csvExport(d: AppData, tipo: CsvTipo, a: string, b: string): { nombre: string; filas: unknown[][] } {
  const bn = (id?: string) => nombreBarbero(d, id);
  let R: unknown[][];
  if (tipo == 'mov')
    R = tabla(['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Barbero', 'Cliente', 'Cantidad', 'Monto', 'Comisión', 'Costo unitario', 'Medio de pago', 'Cobrado', 'Liquidado'], 
      d.movs.filter((x) => (x.fecha || '') >= a && (x.fecha || '') <= b).sort((x, y) => x.fecha.localeCompare(y.fecha)).map((m) => [
        m.fecha, m.tipo == 'ing' ? 'Ingreso' : 'Gasto', m.categoria, m.concepto, bn(m.barberoId), m.cliente || '', m.cantidad || '', m.monto, m.comisionMonto || 0,
        m.costoUnit || 0, m.medioPago || '', m.tipo == 'ing' ? (m.cobrado ? 'Sí' : 'No') : '', m.liquidacionId ? 'Sí' : 'No']));
  else if (tipo == 'liq')
    R = tabla(['Fecha', 'Barbero', 'Desde', 'Hasta', 'Comisiones', 'Adelantos', 'Pagado', 'Medio'], 
      d.liquidaciones.filter((x) => x.fecha >= a && x.fecha <= b).map((x) => [x.fecha, bn(x.barberoId), x.desde || '', x.hasta || '', x.bruto, x.bruto - x.monto, x.monto, x.medioPago || '']));
  else if (tipo == 'tur')
    R = tabla(['Fecha', 'Hora', 'Cliente', 'Teléfono', 'Barbero', 'Servicios', 'Duración (min)', 'Estado', 'Notas'], 
      d.turnos.concat(d.turnosBaja).filter((t) => t.fecha >= a && t.fecha <= b).sort((x, y) => (x.fecha + x.hora).localeCompare(y.fecha + y.hora))
        .map((t) => [t.fecha, t.hora, t.cliente, t.telefono, bn(t.barberoId), t.servicios, t.duracionMin, t.estado, t.notas]));
  else if (tipo == 'cli')
    R = tabla(['Nombre', 'Teléfono', 'Visitas', 'Total gastado', 'Última visita', 'Días sin venir', 'Preferencias', 'Observaciones'], 
      d.clientes.map((c) => statsCliente(d, c)).map((s) => [s.cliente.nombre, s.cliente.telefono, s.visitas, s.total, s.ultima, s.dias == null ? '' : s.dias, s.cliente.preferencias, s.cliente.observaciones]));
  else
    R = tabla(['Producto', 'Categoría', 'Proveedor', 'Costo', 'Precio', 'Margen %', 'Stock', 'Mínimo', 'Valor a costo'], 
      d.productos.map((p) => [p.nombre, p.categoria || '', d.proveedores.find((x) => x.id == p.proveedorId)?.nombre || '', p.costo, p.precio,
        p.precio ? Math.round(((p.precio - p.costo) / p.precio) * 100) : 0, p.stock, p.stockMin || 0, p.stock * p.costo]));
  return { nombre: 'barberhood-' + tipo + '-' + a + '_' + b + '.csv', filas: R };
}
