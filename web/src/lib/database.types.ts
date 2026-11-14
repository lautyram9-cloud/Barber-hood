// Filas de las tablas de Supabase (proyecto gbrutjlhdcnnlghoaxlu).
// Generado a partir del esquema real (lectura) el 2026-11-12. Si el esquema cambia,
// regenerar con el generador de tipos de Supabase y actualizar este archivo.
// Ojo: Postgres `numeric` puede llegar como número o como string: por eso el código
// siempre convierte con Number(...) igual que la versión estable.

type Num = number | string;

export interface Rows {
  adelantos: { id: string; barbero_id: string; created_at: string; fecha: string; liquidacion_id: string | null; medio_pago: string; monto: Num; nota: string | null };
  asistencia: { id: string; barbero_id: string; estado: string; fecha: string; hora: string | null };
  audit_logs: { id: number; antes: unknown; fecha: string; fila: unknown; op: string | null; tabla: string | null; usuario: string | null };
  barberos: { id: string; activo: boolean; comision_pct: Num | null; created_at: string; nombre: string; slot_min: number; user_id: string | null };
  caja_mov: { id: string; caja_id: string; concepto: string; creado_por: string | null; created_at: string; monto: Num; tipo: string };
  cajas: { id: string; abierta_por: string | null; apertura_at: string; cerrada_por: string | null; cierre_at: string | null; contado: Num | null; diferencia: Num | null; esperado: Num | null; estado: string; notas: string | null; saldo_inicial: Num };
  clientes: { id: string; created_at: string; nombre: string; observaciones: string | null; preferencias: string | null; telefono: string | null };
  comisiones_barbero: { id: string; barbero_id: string; pct: Num; producto_id: string | null; servicio_id: string | null };
  dueno_mov: { id: string; concepto: string; created_at: string; fecha: string; monto: Num; tipo: string };
  gastos: { id: string; concepto: string; creado_por: string | null; created_at: string; fecha: string; medio_pago: string; monto: Num; tipo: string };
  horarios: { id: string; desde: string; dia: number; hasta: string };
  ingresos: {
    id: string; barbero_id: string | null; cantidad: number; cliente: string | null; cliente_id: string | null; cobrado: boolean;
    cobrado_at: string | null; comision_monto: Num | null; comision_pct: Num; concepto: string; costo_unit?: Num; creado_por: string | null;
    created_at: string; fecha: string; liquidacion_id: string | null; medio_pago: string; op_id: string; precio_unit: Num;
    producto_id: string | null; servicio_id: string | null; tipo: string; total: Num | null; turno_id: string | null;
  };
  liquidaciones: { id: string; adelantos: Num; barbero_id: string; bruto: Num; creado_por: string | null; created_at: string; desde: string | null; fecha: string; hasta: string; medio_pago: string; monto: Num };
  mov_stock: { id: string; cantidad: number; costo_unit: Num | null; creado_por: string | null; created_at: string; fecha: string; ingreso_id: string | null; medio_pago: string; nota: string | null; producto_id: string; proveedor: string | null; proveedor_id: string | null; tipo: string };
  perfiles: { id: string; rol: string };
  productos: { id: string; activo: boolean; categoria: string | null; comision_pct: Num; costo?: Num; nombre: string; precio: Num; proveedor_id: string | null; stock: number; stock_min: number };
  proveedores: { id: string; activo: boolean; nombre: string; notas: string | null; telefono: string | null };
  servicios: { id: string; activo: boolean; comision_pct: Num; duracion_min: number | null; nombre: string; precio: Num };
  turno_items: { servicio_id: string; turno_id: string };
  turnos: {
    id: string; barbero_id: string | null; cliente: string; cliente_id: string | null; creado_por: string | null; created_at: string;
    duracion_min: number; estado: string; fin: string | null; inicio: string; notas: string | null; servicio_id: string | null; telefono: string | null;
  };
}

export type TableName = keyof Rows;

/** Respuesta de la RPC costos_dueno (solo dueño): los costos, que a los barberos la base no les muestra. */
export interface CostosDueno { productos: { id: string; costo: Num }[]; ingresos: { id: string; costo_unit: Num }[] }

/** Respuesta de la RPC caja_resumen (mismas claves que usa la versión estable). */
export interface CajaResumen {
  inicial: number; ing_efectivo: number; mov_in: number; gastos_efectivo: number; liquidaciones: number;
  adelantos: number; compras_efectivo?: number; mov_out: number; ing_transferencia: number; ing_tarjeta: number;
  esperado: number; pendiente_cobro: number;
}

/** Respuesta de la RPC public_info (link #reservar). */
export interface PublicInfo {
  barberos: { id: string; nombre: string; slot_min: number }[];
  servicios: { id: string; nombre: string; precio: Num; dur: number | null }[];
  horarios: { dia: number; desde: string; hasta: string }[];
  ocupados: { i: string; f: string; b: string | null }[];
}
