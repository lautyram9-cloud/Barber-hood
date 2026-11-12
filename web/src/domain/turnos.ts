import type { AppData, Servicio, Turno } from './model';
import { elegirBarbero, minutosBarbero, nombreBarbero, rango, today, type AgendaCtx } from './logic';

// Turnos: agenda, permisos y acciones. Portado 1:1 de la versión estable
// (V.tur, turMe, mgrid, agenda, tdet, ntur, addtur, tact, tcob, treprog, tnota, asig).
// Las acciones reciben el cliente de base de datos por parámetro: en producción es
// supabase; en las pruebas de paridad es un grabador que se compara con lo que
// envía la versión estable.

export type VistaTurnos = 'dia' | 'sem' | 'mes';
export const ESTADOS: Record<string, string> = { pendiente: 'Pendiente', confirmado: 'Confirmado', atendido: 'Atendido', cancelado: 'Cancelado', ausente: 'Ausente' };

export const agendaCtx = (d: AppData): AgendaCtx => ({ barberos: d.barberos, horario: d.horario, turnos: d.turnos });
const porFechaHora = (p: Turno, q: Turno) => (p.fecha + p.hora).localeCompare(q.fecha + q.hora);

/** Turnos activos, filtrados por barbero si se eligió uno (tfilt). */
export const turnosFiltrados = (d: AppData, barbero: string) => d.turnos.filter((t) => !barbero || t.barberoId == barbero);

/** Rango que muestra la agenda: semana completa en vista semanal; si no, el día elegido. */
export const rangoAgenda = (vista: VistaTurnos, ref: string): [string, string] => (vista == 'sem' ? rango('sem', ref) : [ref, ref]);

export interface GrupoAgenda { titulo: string; clave: string; turnos: Turno[] }
const DN = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** Agenda agrupada: por día en vista semanal, por barbero en las demás (agenda). */
export function agenda(d: AppData, vista: VistaTurnos, ref: string, barbero: string): GrupoAgenda[] {
  const [a, b] = rangoAgenda(vista, ref);
  const L = turnosFiltrados(d, barbero).filter((t) => t.fecha >= a && t.fecha <= b).sort(porFechaHora);
  const g: Record<string, Turno[]> = {};
  if (vista == 'sem') {
    L.forEach((t) => (g[t.fecha] ??= []).push(t));
    return Object.entries(g).map(([f, x]) => ({ clave: f, titulo: `${DN[new Date(f + 'T00:00:00').getDay()]} ${f.slice(5)}`, turnos: x }));
  }
  L.forEach((t) => (g[t.barberoId || ''] ??= []).push(t));
  return Object.entries(g).map(([id, x]) => ({ clave: id, titulo: id ? nombreBarbero(d, id) : 'Sin asignar', turnos: x }));
}

/** Solicitudes pendientes de hoy en adelante. */
export const solicitudesPendientes = (d: AppData) => d.turnos.filter((t) => t.estado == 'pendiente' && t.fecha >= today());
/** Cancelados y ausentes, los 15 más recientes. */
export const turnosDeBaja = (d: AppData) => d.turnosBaja.slice().sort((p, q) => porFechaHora(q, p)).slice(0, 15);

/** Cantidad de turnos por día del mes de ref (mgrid). */
export function conteoMes(d: AppData, ref: string, barbero: string) {
  const y = +ref.slice(0, 4), m = +ref.slice(5, 7), dias = new Date(y, m, 0).getDate(), offset = (new Date(y, m - 1, 1).getDay() + 6) % 7, cnt: Record<string, number> = {};
  turnosFiltrados(d, barbero).forEach((t) => { cnt[t.fecha] = (cnt[t.fecha] || 0) + 1; });
  return { offset, dias: Array.from({ length: dias }, (_, i) => { const f = ref.slice(0, 8) + String(i + 1).padStart(2, '0'); return { fecha: f, dia: i + 1, turnos: cnt[f] || 0 }; }) };
}

/** Lo que ve el barbero: sus turnos y los libres, no atendidos, de hoy en adelante (turMe). */
export const turnosDelBarbero = (d: AppData, me: string) =>
  d.turnos.filter((t) => t.estado != 'atendido' && t.fecha >= today() && (!t.barberoId || t.barberoId == me)).sort(porFechaHora);

/** Si se puede confirmar, cobrar, cancelar o reprogramar (ab en tdet). La base valida igual. */
export const puedeGestionar = (t: Turno, owner: boolean, me: string | null) =>
  ['pendiente', 'confirmado'].includes(t.estado) && (owner || t.barberoId == me || !t.barberoId);

/** Duración total de los servicios elegidos con el barbero (durOf). */
export const duracionServicios = (c: AgendaCtx, ds: Pick<Servicio, 'duracionMin'>[], b: string) => ds.reduce((t, s) => t + (s.duracionMin || minutosBarbero(c, b)), 0);

export const mensajeRecordatorio = (t: Turno) => `Hola ${t.cliente}! Te recordamos tu turno en Barber Hood el ${t.fecha.slice(5)} a las ${t.hora}. ¡Te esperamos!`;

// ---------- Acciones ----------
// Cliente mínimo: compatible con supabase-js y con el grabador de las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Db { from(t: string): any; rpc(fn: string, args?: Record<string, unknown>): any }
const ok = async (q: PromiseLike<{ error: unknown; data?: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data; };

export interface NuevoTurno { fecha: string; horaLista: string; horaManual: string; barbero: string; servicios: Servicio[]; cliente: string; telefono: string; notas: string }

/** Valida como la versión estable. Devuelve el mensaje de error o null. */
export function validarNuevoTurno(x: NuevoTurno) {
  const c = x.cliente.split(' · ')[0].trim(), h = x.horaManual || x.horaLista;
  if (!c || !x.fecha || !h) return 'Completá fecha, hora y cliente';
  if (!x.servicios.length) return 'Elegí al menos un servicio';
  return null;
}

/** Crea el turno: cliente_upsert → turnos → turno_items (addtur). */
export async function crearTurno(db: Db, c: AgendaCtx, x: NuevoTurno) {
  const cliente = x.cliente.split(' · ')[0].trim(), hora = x.horaManual || x.horaLista;
  const b = elegirBarbero(c, x.fecha, hora, x.barbero, x.servicios);
  const cid = await ok(db.rpc('cliente_upsert', { p_nombre: cliente, p_tel: x.telefono }));
  const data = (await ok(db.from('turnos').insert({
    inicio: x.fecha + 'T' + hora + ':00', duracion_min: duracionServicios(c, x.servicios, b), barbero_id: b || null, cliente,
    telefono: x.telefono.replace(/\D/g, '') || null, servicio_id: x.servicios[0].id, cliente_id: cid, estado: 'confirmado', notas: x.notas || null,
  }).select('id').single())) as { id: string };
  await ok(db.from('turno_items').insert(x.servicios.map((s) => ({ turno_id: data.id, servicio_id: s.id }))));
}

export const cambiarEstado = (db: Db, id: string, estado: string, notas: string) => ok(db.from('turnos').update({ estado, notas: notas || null }).eq('id', id));
export const guardarNota = (db: Db, id: string, notas: string) => ok(db.from('turnos').update({ notas: notas || null }).eq('id', id));
export const cobrarTurno = (db: Db, id: string, medio: string) => ok(db.rpc('cobrar_turno', { p_turno: id, p_medio: medio || 'efectivo' }));
export const reprogramar = (db: Db, id: string, fecha: string, hora: string, barbero: string) =>
  ok(db.from('turnos').update({ inicio: fecha + 'T' + hora + ':00', barbero_id: barbero || null }).eq('id', id));
export const asignarme = (db: Db, c: AgendaCtx, id: string, me: string) => ok(db.from('turnos').update({ barbero_id: me, duracion_min: minutosBarbero(c, me) }).eq('id', id));

export const textoEstado = (e: string) => ({ confirmado: 'Turno confirmado', ausente: 'Marcado como ausente' } as Record<string, string>)[e] ?? 'Turno cancelado';
