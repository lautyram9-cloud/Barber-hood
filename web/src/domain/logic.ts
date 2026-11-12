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
