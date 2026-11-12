import type { AppData, Horario, RawTables, Turno } from './model';

const tm = (x: string | null | undefined) => Date.parse(x ?? '') || 0;
const h5 = (t: string | null | undefined) => (t || '').slice(0, 5);

/** Traduce las filas crudas de Supabase al modelo de la app (equivale a load() de la versión estable). */
export function buildAppData(r: RawTables): AppData {
  const ba = r.barberos ?? [], sv = r.servicios ?? [], pr = r.productos ?? [], ing = r.ingresos ?? [];
  const horario: Horario = {};
  for (const h of r.horarios ?? []) (horario[h.dia] ??= []).push([h5(h.desde), h5(h.hasta)]);

  const nombreServicio = (id: string) => sv.find((x) => x.id == id)?.nombre || '';
  const nombreProducto = (id: string) => pr.find((x) => x.id == id)?.nombre || '';
  const ingPorId = new Map(ing.map((i) => [i.id, i]));
  const itemsPorTurno: Record<string, string[]> = {};
  for (const x of r.turno_items ?? []) (itemsPorTurno[x.turno_id] ??= []).push(x.servicio_id);

  const turnos: Turno[] = (r.turnos ?? []).map((x) => {
    const ids = itemsPorTurno[x.id] || (x.servicio_id ? [x.servicio_id] : []);
    return {
      id: x.id, cliente: x.cliente, telefono: x.telefono || '', fecha: x.inicio.slice(0, 10), hora: x.inicio.slice(11, 16),
      barberoId: x.barbero_id || '', servicios: ids.map(nombreServicio).filter(Boolean).join(' + '), servicioIds: ids,
      duracionMin: x.duracion_min, estado: x.estado, atendido: x.estado == 'atendido', notas: x.notas || '', clienteId: x.cliente_id || '',
    };
  });
  const baja = (t: Turno) => t.estado == 'cancelado' || t.estado == 'ausente';
  const cajas = r.cajas ?? [];

  return {
    barberosTodos: ba,
    barberos: ba.filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre, slotMin: x.slot_min, userId: x.user_id, comisionPct: x.comision_pct == null ? null : +x.comision_pct })),
    servicios: sv.filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre, precio: +x.precio, comisionPct: +x.comision_pct, duracionMin: x.duracion_min })),
    horario,
    comisionesBarbero: (r.comisiones_barbero ?? []).map((x) => ({ id: x.id, barberoId: x.barbero_id, servicioId: x.servicio_id, productoId: x.producto_id, pct: +x.pct })),
    clientes: (r.clientes ?? []).map((x) => ({ id: x.id, nombre: x.nombre, telefono: x.telefono || '', preferencias: x.preferencias || '', observaciones: x.observaciones || '', creado: x.created_at || '' })),
    productos: pr.filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre, categoria: x.categoria, costo: +x.costo, precio: +x.precio, stock: x.stock, stockMin: x.stock_min, comisionPct: +x.comision_pct, proveedorId: x.proveedor_id || '' })),
    movs: [
      ...ing.map((x) => ({
        id: x.id, tipo: 'ing' as const, categoria: x.tipo, concepto: x.concepto, monto: +(x.total as number), cantidad: x.cantidad, barberoId: x.barbero_id || '',
        cliente: x.cliente || '', clienteId: x.cliente_id || '', fecha: x.fecha, costoUnit: +x.costo_unit, comisionMonto: +(x.comision_monto as number),
        liquidacionId: x.liquidacion_id, productoId: x.producto_id, cobrado: x.cobrado !== false, cobradoAt: tm(x.cobrado_at || x.created_at), medioPago: x.medio_pago, ts: tm(x.created_at),
      })),
      ...(r.gastos ?? []).map((x) => ({ id: x.id, tipo: 'gas' as const, categoria: x.tipo, concepto: x.concepto, monto: +x.monto, medioPago: x.medio_pago, fecha: x.fecha, ts: tm(x.created_at) })),
    ],
    turnos: turnos.filter((t) => !baja(t)),
    turnosBaja: turnos.filter(baja),
    dueno: (r.dueno_mov ?? []).map((x) => ({ id: x.id, tipo: x.tipo, concepto: x.concepto, monto: +x.monto, fecha: x.fecha, ts: tm(x.created_at) })),
    liquidaciones: (r.liquidaciones ?? []).map((x) => ({ id: x.id, barberoId: x.barbero_id, monto: +x.monto, bruto: +x.bruto, medioPago: x.medio_pago, fecha: x.fecha, desde: x.desde, hasta: x.hasta, ts: tm(x.created_at) })),
    adelantos: (r.adelantos ?? []).map((x) => ({ id: x.id, barberoId: x.barbero_id, monto: +x.monto, fecha: x.fecha, liquidacionId: x.liquidacion_id })),
    asistencia: (r.asistencia ?? []).map((x) => ({ id: x.id, barberoId: x.barbero_id, fecha: x.fecha, estado: x.estado })),
    movStock: (r.mov_stock ?? []).map((x) => ({
      id: x.id, productoId: x.producto_id, nombre: nombreProducto(x.producto_id), tipo: x.tipo, cantidad: Math.abs(x.cantidad), signo: x.cantidad,
      costoUnit: +(x.costo_unit as number) || 0, proveedor: x.proveedor || '', medioPago: x.medio_pago, nota: x.nota || '', fecha: x.fecha,
      barberoId: (x.ingreso_id && ingPorId.get(x.ingreso_id)?.barbero_id) || '', ts: tm(x.created_at),
    })),
    proveedores: (r.proveedores ?? []).filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre, telefono: x.telefono || '', notas: x.notas || '' })),
    cajasCerradas: cajas.filter((x) => x.estado == 'cerrada').sort((a, b) => (b.apertura_at || '').localeCompare(a.apertura_at || '')),
    cajaMov: r.caja_mov ?? [],
    cajaAbierta: cajas.find((x) => x.estado == 'abierta') ?? null,
  };
}
