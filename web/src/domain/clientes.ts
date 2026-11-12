import type { AppData, Cliente } from './model';
import { statsCliente, today } from './logic';
import type { Db } from './turnos';

// Clientes (CRM): búsqueda, filtros, ficha y edición. Portado 1:1 de V.cli / clist / cdet / csave.

export type FiltroClientes = '' | 'nuevo' | 'rec' | '30' | '45';
export const FILTROS: [FiltroClientes, string][] = [['', 'Todos'], ['nuevo', 'Nuevos'], ['rec', 'Recurrentes'], ['30', 'Sin volver 30+ días'], ['45', 'Sin volver 45+ días']];

/** Lista filtrada por texto (nombre o teléfono) y filtro, ordenada por total gastado (clist). */
export function listaClientes(d: AppData, busqueda: string, filtro: FiltroClientes) {
  const q = (busqueda || '').toLowerCase();
  return d.clientes.map((c) => statsCliente(d, c)).filter((s) =>
    (!q || (s.cliente.nombre + ' ' + s.cliente.telefono).toLowerCase().includes(q)) &&
    (filtro == '' || (filtro == 'nuevo' && s.visitas <= 1) || (filtro == 'rec' && s.visitas >= 2) ||
      (filtro == '30' && s.dias != null && s.dias >= 30) || (filtro == '45' && s.dias != null && s.dias >= 45)),
  ).sort((a, b) => b.total - a.total);
}

/** Próximos turnos del cliente (de hoy en adelante). */
export const proximosTurnos = (d: AppData, c: Cliente) => d.turnos.filter((t) => t.clienteId == c.id && t.fecha >= today());
/** Últimos 20 ingresos del cliente, del más nuevo al más viejo. */
export const historialCliente = (d: AppData, c: Cliente) => statsCliente(d, c).movs.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20);
/** Se ofrece reactivar por WhatsApp si tiene teléfono y hace 30+ días que no viene. */
export const ofrecerReactivar = (c: Cliente, dias: number | null) => !!c.telefono && dias != null && dias >= 30;
export const mensajeReactivar = (c: Cliente) => `Hola ${c.nombre}! Hace tiempo que no te vemos por Barber Hood. ¿Querés reservar un turno? Te esperamos.`;

export async function guardarCliente(db: Db, id: string, preferencias: string, observaciones: string) {
  const r = await db.from('clientes').update({ preferencias: preferencias || null, observaciones: observaciones || null }).eq('id', id);
  if (r.error) throw r.error;
}
