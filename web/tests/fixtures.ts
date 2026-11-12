import type { RawTables } from '@/domain/model';

// Datos de PRUEBA generados con semilla (reproducibles). No representan operaciones reales.

function prng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const OWNER_ONLY: (keyof RawTables)[] = ['gastos', 'mov_stock', 'dueno_mov', 'cajas', 'caja_mov', 'proveedores'];

export function fixtures(seed: number, nowIso: string): RawTables {
  const r = prng(seed), pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)], int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const uid = (p: string, i: number) => `${p}-${seed}-${String(i).padStart(4, '0')}`;
  const base = new Date(nowIso);
  const day = (off: number) => { const d = new Date(base); d.setDate(d.getDate() + off); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const num = (n: number) => (r() < 0.5 ? n : String(n)); // numeric puede llegar como string

  const barberos = Array.from({ length: int(3, 4) }, (_, i) => ({
    id: uid('bar', i), nombre: pick(['Lucas', 'Mati', 'Nico', 'Fede', 'Joaco']) + ' ' + i, activo: i !== 2, slot_min: pick([20, 30, 30, 45]),
    user_id: r() < 0.6 ? uid('usr', i) : null, comision_pct: r() < 0.5 ? null : num(pick([40, 45, 50])), created_at: '2026-01-01T10:00:00Z',
  }));
  const servicios = ['Corte', 'Barba', 'Corte + barba', 'Color', 'Perfilado'].map((nombre, i) => ({
    id: uid('srv', i), nombre, activo: i < 4, precio: num(int(5, 20) * 1000), comision_pct: num(pick([30, 40, 50])), duracion_min: r() < 0.5 ? null : pick([15, 30, 45, 60]),
  }));
  const proveedores = Array.from({ length: 2 }, (_, i) => ({ id: uid('prv', i), nombre: 'Proveedor ' + i, activo: i == 0 || r() < 0.5, telefono: r() < 0.5 ? null : '3878123456', notas: null }));
  const productos = ['Cera', 'Polvo', 'Shampoo', 'Gel'].map((nombre, i) => ({
    id: uid('prd', i), nombre, activo: i < 3, categoria: r() < 0.3 ? null : pick(['Ceras', 'Shampoos', 'Otros']), costo: num(int(2, 8) * 1000), precio: num(int(9, 15) * 1000),
    comision_pct: num(pick([0, 10, 15])), proveedor_id: r() < 0.5 ? proveedores[0].id : null, stock: int(0, 12), stock_min: int(0, 4),
  }));
  // casos borde: stock igual al mínimo y stock/mínimo en cero
  productos.push(
    { id: uid('prd', 8), nombre: 'Peine', activo: true, categoria: 'Otros', costo: num(1000), precio: num(3000), comision_pct: num(0), proveedor_id: proveedores[0].id, stock: 3, stock_min: 3 },
    { id: uid('prd', 9), nombre: 'Navaja', activo: true, categoria: null, costo: num(500), precio: num(1500), comision_pct: num(0), proveedor_id: null, stock: 0, stock_min: 0 },
  );
  const horarios: RawTables['horarios'] = [];
  [1, 2, 3, 4, 5, 6].forEach((dia, i) => {
    if (r() < 0.15) return; // día sin cargar: la app usa el horario por defecto
    if (r() < 0.4) { horarios.push({ id: uid('hor', i * 2), dia, desde: '09:00:00', hasta: '13:00:00' }, { id: uid('hor', i * 2 + 1), dia, desde: '16:00:00', hasta: '21:00:00' }); }
    else horarios.push({ id: uid('hor', i * 2), dia, desde: '10:00:00', hasta: dia == 6 ? '18:00:00' : '20:00:00' });
  });
  if (r() < 0.3) horarios.push({ id: uid('hor', 99), dia: 0, desde: '10:00:00', hasta: '14:00:00' });
  const clientes = Array.from({ length: 10 }, (_, i) => ({ id: uid('cli', i), nombre: 'Cliente ' + i, telefono: r() < 0.2 ? null : '0387 15' + int(400000, 499999), preferencias: null, observaciones: r() < 0.3 ? 'obs' : null, created_at: '2026-03-' + String(i + 1).padStart(2, '0') + 'T12:00:00Z' }));
  const estados = ['pendiente', 'confirmado', 'atendido', 'cancelado', 'ausente'];
  const turnos = Array.from({ length: int(30, 55) }, (_, i) => {
    const h = int(9, 20), m = pick([0, 15, 30, 45]);
    return {
      id: uid('tur', i), barbero_id: r() < 0.2 ? null : pick(barberos).id, cliente: 'Cliente ' + int(0, 5), cliente_id: r() < 0.7 ? pick(clientes).id : null, creado_por: null,
      created_at: '2026-11-01T10:00:00Z', duracion_min: pick([20, 30, 45, 60]), estado: pick(estados), fin: null,
      inicio: `${day(int(-5, 9))}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, notas: r() < 0.3 ? 'nota' : null,
      servicio_id: r() < 0.8 ? pick(servicios).id : null, telefono: r() < 0.3 ? null : '387154' + int(10000, 99999),
    };
  });
  const turno_items = turnos.filter(() => r() < 0.6).flatMap((t) => servicios.slice(0, int(1, 2)).map((s) => ({ turno_id: t.id, servicio_id: s.id })));
  const liquidaciones = Array.from({ length: int(0, 3) }, (_, i) => ({
    id: uid('liq', i), barbero_id: pick(barberos).id, bruto: num(20000), monto: num(15000), adelantos: num(5000), medio_pago: 'efectivo', fecha: day(-int(5, 60)),
    desde: r() < 0.3 ? null : day(-90), hasta: day(-10), creado_por: null, created_at: `${day(-int(5, 60))}T12:00:00Z`,
  }));
  const ingresos = Array.from({ length: int(30, 90) }, (_, i) => {
    const prod = r() < 0.25, p = pick(productos), s = pick(servicios), cant = prod ? int(1, 3) : 1, precio = prod ? 12000 : 10000, f = i < 12 ? day(-(i % 7)) : day(-int(0, 420)); // siempre hay ventas en la última semana
    const created = `${f}T${String(int(10, 23)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00-03:00`;
    const cobrado = r() < 0.85;
    return {
      id: uid('ing', i), barbero_id: r() < 0.1 ? null : pick(barberos).id, cantidad: cant, cliente: r() < 0.5 ? 'Cliente ' + int(0, 5) : null, // clientes 6-8 sin visitas; el 9 con una sola visita
      cliente_id: i == 0 ? clientes[9].id : r() < 0.5 ? pick(clientes.slice(0, 6)).id : null,
      cobrado, cobrado_at: cobrado && r() < 0.7 ? `${day(-int(0, 3))}T1${int(0, 9)}:00:00-03:00` : null, comision_monto: r() < 0.1 ? null : num(int(1, 6) * 1000),
      comision_pct: num(40), concepto: prod ? p.nombre : s.nombre, costo_unit: num(prod ? 4000 : 0), creado_por: null, created_at: created, fecha: f,
      liquidacion_id: r() < 0.2 && liquidaciones.length ? pick(liquidaciones).id : null, medio_pago: pick(['efectivo', 'transferencia', 'tarjeta']), op_id: uid('op', i),
      precio_unit: num(precio), producto_id: prod ? p.id : null, servicio_id: prod ? null : s.id, tipo: prod ? 'producto' : 'servicio', total: r() < 0.03 ? null : num(precio * cant), turno_id: null,
    };
  });
  const gastos = Array.from({ length: int(5, 20) }, (_, i) => ({ id: uid('gas', i), concepto: pick(['Alquiler', 'Luz', 'Insumos']), creado_por: null, created_at: `${day(-i)}T10:00:00Z`, fecha: i < 2 ? day(0) : day(-int(0, 400)), medio_pago: 'efectivo', monto: num(int(1, 50) * 1000), tipo: i == 0 ? 'fijo' : pick(['fijo', 'variable']) }));
  const mov_stock = Array.from({ length: int(30, 60) }, (_, i) => ({
    id: uid('stk', i), cantidad: pick([-2, -1, 3, 5]), costo_unit: r() < 0.2 ? null : num(3000), creado_por: null, created_at: `${day(-i)}T11:00:00Z`, fecha: day(-int(0, 60)),
    ingreso_id: r() < 0.4 ? pick(ingresos).id : null, medio_pago: 'efectivo', nota: null, producto_id: pick(productos).id, proveedor: r() < 0.5 ? 'Prov' : null, proveedor_id: null, tipo: pick(['compra', 'venta', 'perdida', 'ajuste']),
  }));
  const adelantos = Array.from({ length: int(0, 4) }, (_, i) => ({ id: uid('ade', i), barbero_id: pick(barberos).id, created_at: '2026-11-01T10:00:00Z', fecha: day(-int(0, 30)), liquidacion_id: r() < 0.3 && liquidaciones.length ? pick(liquidaciones).id : null, medio_pago: 'efectivo', monto: num(int(1, 5) * 1000), nota: null }));
  const asistencia = Array.from({ length: int(3, 15) }, (_, i) => ({ id: uid('asi', i), barbero_id: pick(barberos).id, estado: pick(['ok', 'tarde', 'falta']), fecha: day(-int(0, 40)), hora: null }));
  const comisiones_barbero = [{ id: uid('cb', 0), barbero_id: barberos[0].id, pct: num(55), producto_id: null, servicio_id: servicios[0].id }];
  const dueno_mov = Array.from({ length: 3 }, (_, i) => ({ id: uid('due', i), concepto: 'Retiro', created_at: '2026-11-01T10:00:00Z', fecha: day(-i * 7), monto: num(10000), tipo: pick(['ing', 'gas']) }));
  const cajas = [
    { id: uid('caj', 0), abierta_por: null, apertura_at: '2026-11-10T09:00:00Z', cerrada_por: null, cierre_at: '2026-11-10T21:00:00Z', contado: num(50000), diferencia: num(-500), esperado: num(50500), estado: 'cerrada', notas: null, saldo_inicial: num(10000) },
    { id: uid('caj', 1), abierta_por: null, apertura_at: '2026-11-11T09:00:00Z', cerrada_por: null, cierre_at: '2026-11-11T21:00:00Z', contado: num(42000), diferencia: num(0), esperado: num(42000), estado: 'cerrada', notas: null, saldo_inicial: num(10000) },
    ...(r() < 0.5 ? [{ id: uid('caj', 2), abierta_por: null, apertura_at: '2026-11-12T09:00:00Z', cerrada_por: null, cierre_at: null, contado: null, diferencia: null, esperado: null, estado: 'abierta', notas: null, saldo_inicial: num(10000) }] : []),
  ];
  const caja_mov = [{ id: uid('cm', 0), caja_id: cajas[0].id, concepto: 'Cambio', creado_por: null, created_at: '2026-11-10T12:00:00Z', monto: num(2000), tipo: 'ingreso' }];
  const sortId = <T extends { id: string }>(a: T[]) => a.sort((x, y) => x.id.localeCompare(y.id));
  return {
    barberos: sortId(barberos), servicios: sortId(servicios), productos: sortId(productos), horarios: sortId(horarios), turnos: sortId(turnos),
    ingresos: sortId(ingresos), gastos: sortId(gastos), liquidaciones: sortId(liquidaciones), adelantos: sortId(adelantos), asistencia: sortId(asistencia),
    mov_stock: sortId(mov_stock), dueno_mov: sortId(dueno_mov), comisiones_barbero, clientes: sortId(clientes),
    turno_items: turno_items.sort((a, b) => (a.turno_id + a.servicio_id).localeCompare(b.turno_id + b.servicio_id)),
    cajas: sortId(cajas), caja_mov, proveedores: sortId(proveedores),
  };
}

/** Lo que puede leer un barbero: la versión estable no pide las tablas exclusivas del dueño. */
export function soloBarbero(t: RawTables): RawTables {
  const o: RawTables = { ...t };
  for (const k of OWNER_ONLY) delete o[k];
  return o;
}
