import type { Rows } from '@/lib/database.types';

// Modelo de dominio. Es la traducción 1:1 de lo que arma load() en la versión
// estable (index.html), con nombres legibles. Las reglas de conversión (Number(),
// valores por defecto, filtros de activos) se mantienen idénticas a propósito:
// tests/parity compara este resultado contra el código original.

export type Rol = 'owner' | 'barber';

export interface Barbero { id: string; nombre: string; slotMin: number; userId: string | null; comisionPct: number | null }
export interface Servicio { id: string; nombre: string; precio: number; comisionPct: number; duracionMin: number | null }
export interface Producto { id: string; nombre: string; categoria: string | null; costo: number; precio: number; stock: number; stockMin: number; comisionPct: number; proveedorId: string }
export type Tramo = [desde: string, hasta: string];
/** Clave: día de la semana (0 = domingo). */
export type Horario = Record<number, Tramo[]>;

export interface Movimiento {
  id: string;
  tipo: 'ing' | 'gas';
  /** servicio | producto (ingresos) o fijo | variable (gastos). */
  categoria: string;
  concepto: string;
  monto: number;
  cantidad?: number;
  barberoId?: string;
  cliente?: string;
  clienteId?: string;
  fecha: string;
  costoUnit?: number;
  comisionMonto?: number;
  liquidacionId?: string | null;
  productoId?: string | null;
  cobrado?: boolean;
  /** ms desde epoch. */
  cobradoAt?: number;
  medioPago: string;
  ts: number;
  /** Usuario (auth) que lo cargó, si la base lo registró. */
  creadoPor?: string | null;
  /** Turno del que viene el cobro, si lo hay. */
  turnoId?: string | null;
}

export type EstadoTurno = 'pendiente' | 'confirmado' | 'atendido' | 'cancelado' | 'ausente' | string;
export interface Turno {
  id: string; cliente: string; telefono: string; fecha: string; hora: string; barberoId: string;
  servicios: string; servicioIds: string[]; duracionMin: number; estado: EstadoTurno; atendido: boolean; notas: string; clienteId: string;
}

export interface Cliente { id: string; nombre: string; telefono: string; preferencias: string; observaciones: string; creado: string }
export interface ComisionBarbero { id: string; barberoId: string; servicioId: string | null; productoId: string | null; pct: number }
export interface MovStock { id: string; productoId: string; nombre: string; tipo: string; cantidad: number; signo: number; costoUnit: number; proveedor: string; medioPago: string; nota: string; fecha: string; barberoId: string; ts: number }
export interface Liquidacion { id: string; barberoId: string; monto: number; bruto: number; medioPago: string; fecha: string; desde: string | null; hasta: string | null; ts: number }
export interface Adelanto { id: string; barberoId: string; monto: number; fecha: string; liquidacionId: string | null }
export interface Asistencia { id: string; barberoId: string; fecha: string; estado: string }
export interface DuenoMov { id: string; tipo: string; concepto: string; monto: number; fecha: string; ts: number }
export interface Proveedor { id: string; nombre: string; telefono: string; notas: string }

export interface AppData {
  barberos: Barbero[];
  /** Todos los barberos, incluso inactivos (para mostrar nombres históricos). */
  barberosTodos: Rows['barberos'][];
  servicios: Servicio[];
  horario: Horario;
  productos: Producto[];
  movs: Movimiento[];
  /** Turnos activos (sin cancelados ni ausentes). */
  turnos: Turno[];
  /** Cancelados y ausentes. */
  turnosBaja: Turno[];
  dueno: DuenoMov[];
  liquidaciones: Liquidacion[];
  adelantos: Adelanto[];
  asistencia: Asistencia[];
  movStock: MovStock[];
  clientes: Cliente[];
  comisionesBarbero: ComisionBarbero[];
  proveedores: Proveedor[];
  cajasCerradas: Rows['cajas'][];
  cajaMov: Rows['caja_mov'][];
  cajaAbierta: Rows['cajas'] | null;
}

export type RawTables = { [K in keyof Rows]?: Rows[K][] };
