import type { PublicInfo } from '@/lib/database.types';
import type { Horario, Servicio } from './model';
import { elegirBarbero, isoLocal, type AgendaCtx } from './logic';
import type { Db } from './turnos';

// Reserva pública (link #reservar, sin login): bootPub, V.res y addres de la versión estable.
// Solo usa las dos funciones públicas de la base: public_info y reservar_publico.

export function desdeInfoPublica(info: PublicInfo): { ctx: AgendaCtx; servicios: Servicio[]; barberos: { id: string; nombre: string }[] } {
  const horario: Horario = {};
  info.horarios.forEach((r) => (horario[r.dia] ??= []).push([r.desde.slice(0, 5), r.hasta.slice(0, 5)]));
  return {
    ctx: {
      barberos: info.barberos.map((b) => ({ id: b.id, slotMin: b.slot_min })), horario,
      turnos: info.ocupados.map((o) => ({ fecha: o.i.slice(0, 10), hora: o.i.slice(11, 16), barberoId: o.b || '', duracionMin: Math.round((Date.parse(o.f) - Date.parse(o.i)) / 6e4) })),
    },
    servicios: info.servicios.map((s) => ({ id: s.id, nombre: s.nombre, precio: +s.precio, comisionPct: 0, duracionMin: s.dur })),
    barberos: info.barberos.map((b) => ({ id: b.id, nombre: b.nombre })),
  };
}

export interface Reserva { nombre: string; telefono: string; fecha: string; hora: string; barbero: string; servicios: Servicio[]; notas: string }
/** Valida y elige barbero. Devuelve el error a mostrar o el barbero asignado. */
export function prepararReserva(c: AgendaCtx, x: Reserva): { error: string } | { barbero: string } {
  if (!x.nombre.trim() || !x.telefono.trim() || !x.hora) return { error: 'Completá nombre, teléfono y horario' };
  if (!x.servicios.length) return { error: 'Elegí al menos un servicio' };
  const b = elegirBarbero(c, x.fecha, x.hora, x.barbero, x.servicios);
  return b ? { barbero: b } : { error: 'Ese horario ya no está disponible' };
}
export async function enviarReserva(db: Db, x: Reserva, barbero: string) {
  const r = await db.rpc('reservar_publico', { p_nombre: x.nombre.trim(), p_tel: x.telefono.trim(), p_inicio: x.fecha + 'T' + x.hora + ':00', p_barbero: barbero, p_servicios: x.servicios.map((s) => s.id), p_notas: x.notas || null });
  if (r.error) throw r.error;
}

// ---------- Fechas para la página de reservas ----------
const SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const SEMANA_LARGA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const aFecha = (f: string) => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); };

/** Los próximos n días (desde hoy), como 'AAAA-MM-DD' en hora local. */
export function proximosDias(n: number, desde = new Date()) {
  return Array.from({ length: n }, (_, i) => { const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i); return isoLocal(d); });
}
/** '2026-11-20' → { semana: 'vie', dia: 20, mes: 'nov' } */
export function partesDia(f: string) { const d = aFecha(f); return { semana: SEMANA[d.getDay()], dia: d.getDate(), mes: MESES[d.getMonth()] }; }
/** '2026-11-20' → 'viernes 20 de noviembre' */
export function diaLargo(f: string) { const d = aFecha(f); return `${SEMANA_LARGA[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`; }
/** '2026-11-20' → 'vie 20/11' */
export function diaCorto(f: string) { const d = aFecha(f); return `${SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }
