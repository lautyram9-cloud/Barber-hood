import { describe, expect, it } from 'vitest';
import { buildAppData } from '@/domain/build';
import { balanceStock } from '@/domain/stock';
import type { AppData, Movimiento } from '@/domain/model';
import { fixtures } from '../fixtures';

const base = buildAppData(fixtures(42, '2026-11-12T15:37:00-03:00'));
const venta = (p: Partial<Movimiento>): Movimiento => ({ id: Math.random().toString(), tipo: 'ing', categoria: 'producto', concepto: 'Cera', monto: 0, fecha: '2026-11-10', medioPago: 'efectivo', ts: 0, ...p });

describe('balance de ventas de productos', () => {
  it('ganancia = vendido − costo de compra de cada unidad; comisiones aparte', () => {
    const d: AppData = { ...base, movs: [
      venta({ productoId: 'p1', concepto: 'Cera', cantidad: 2, monto: 24000, costoUnit: 4000, comisionMonto: 2400 }),
      venta({ productoId: 'p1', concepto: 'Cera', cantidad: 1, monto: 12000, costoUnit: 5000, comisionMonto: 1200 }),
      venta({ productoId: 'p2', concepto: 'Polvo', cantidad: 1, monto: 9000, costoUnit: 3000 }),
      venta({ productoId: 'p2', concepto: 'Polvo', cantidad: 5, monto: 45000, costoUnit: 3000, fecha: '2026-10-01' }), // fuera del período
      venta({ categoria: 'servicio', concepto: 'Corte', monto: 10000 }), // no es producto
    ], movStock: [] };
    const b = balanceStock(d, '2026-11-09', '2026-11-15');
    expect(b.unidades).toBe(4);
    expect(b.vendido).toBe(45000);
    expect(b.costo).toBe(2 * 4000 + 5000 + 3000);
    expect(b.ganancia).toBe(45000 - 16000);
    expect(b.comision).toBe(3600);
    expect(b.gananciaNeta).toBe(29000 - 3600);
    expect(b.margenPct).toBe(Math.round((29000 / 45000) * 100));
    expect(b.filas.map((x) => [x.unidades, x.ganancia])).toEqual([[3, 36000 - 13000], [1, 6000]]);
  });
  it('compras del período (informativo) y sin ventas', () => {
    const d: AppData = { ...base, movs: [], movStock: [
      { id: 'c1', productoId: 'p1', nombre: 'Cera', tipo: 'compra', cantidad: 10, signo: 10, costoUnit: 3500, proveedor: '', medioPago: 'efectivo', nota: '', fecha: '2026-11-11', barberoId: '', ts: 0 },
      { id: 'c2', productoId: 'p1', nombre: 'Cera', tipo: 'venta', cantidad: 1, signo: -1, costoUnit: 3500, proveedor: '', medioPago: 'efectivo', nota: '', fecha: '2026-11-11', barberoId: '', ts: 0 },
    ] };
    const b = balanceStock(d, '2026-11-09', '2026-11-15');
    expect(b.compras).toBe(35000);
    expect(b.vendido).toBe(0);
    expect(b.margenPct).toBe(0);
    expect(b.filas).toEqual([]);
  });
  it('con los datos de prueba coincide con la suma por venta', () => {
    const b = balanceStock(base, '2025-01-01', '2026-12-31');
    const V = base.movs.filter((m) => m.tipo == 'ing' && m.categoria == 'producto');
    expect(b.vendido).toBe(V.reduce((t, m) => t + (+m.monto || 0), 0));
    expect(b.costo).toBe(V.reduce((t, m) => t + (m.costoUnit || 0) * (m.cantidad || 1), 0));
  });
});
