import { describe, expect, it } from 'vitest';
import { buildAppData } from '@/domain/build';
import { detalleCompleto, detalleFila, etiquetaMedio, quienCargo } from '@/domain/movimientos';
import { fixtures } from '../fixtures';

const d = buildAppData(fixtures(7, '2026-11-12T15:37:00-03:00'));
const ing = d.movs.find((m) => m.tipo == 'ing')!, gas = d.movs.find((m) => m.tipo == 'gas')!;

describe('detalle de un movimiento', () => {
  it('etiquetas del medio de pago', () => {
    expect(etiquetaMedio('efectivo')).toBe('Efectivo');
    expect(etiquetaMedio('transferencia')).toBe('Transferencia');
    expect(etiquetaMedio('mercadopago')).toBe('Mercadopago');
    expect(etiquetaMedio('')).toBe('Efectivo');
  });
  it('quién lo cargó: Vos / barbero vinculado / Dueño / Sistema', () => {
    const b = d.barberosTodos.find((x) => x.user_id)!;
    expect(quienCargo(d, { ...ing, creadoPor: 'u-yo' }, 'u-yo')).toBe('Vos');
    expect(quienCargo(d, { ...ing, creadoPor: b.user_id }, 'u-yo')).toBe(b.nombre);
    expect(quienCargo(d, { ...ing, creadoPor: 'otro' }, 'u-yo')).toBe('Dueño');
    expect(quienCargo(d, { ...ing, creadoPor: null }, 'u-yo')).toBe('Sistema');
  });
  it('la fila no repite el medio de pago ni "sin cobrar" (van en el distintivo)', () => {
    const t = detalleFila(d, { ...ing, medioPago: 'transferencia', cobrado: false });
    expect(t).not.toMatch(/transferencia|sin cobrar/);
  });
  it('arma las filas del detalle y omite las que no tienen dato', () => {
    const m = { ...ing, medioPago: 'transferencia', cobrado: true, cantidad: 2, monto: 20000, ts: Date.parse('2026-11-12T14:05:00-03:00'), cobradoAt: Date.parse('2026-11-12T14:05:00-03:00'), creadoPor: 'u-yo', turnoId: null, liquidacionId: null, cliente: '' };
    const f = Object.fromEntries(detalleCompleto(d, m, 'u-yo'));
    expect(f['Medio de pago']).toBe('Transferencia');
    expect(f['Cargado por']).toBe('Vos');
    expect(f['Cantidad']).toContain('2 ×');
    expect('Cliente' in f).toBe(false);
    expect('Origen' in f).toBe(false);
    expect('Liquidación' in f).toBe(false);
    expect('Cobrado' in f, 'cobrado en el mismo momento: no se repite').toBe(false);
  });
  it('un ingreso sin cobrar lo aclara y un gasto no muestra barbero', () => {
    expect(Object.fromEntries(detalleCompleto(d, { ...ing, cobrado: false, medioPago: 'efectivo' }, null))['Medio de pago']).toBe('Efectivo (sin cobrar)');
    expect(detalleCompleto(d, gas, null).some(([k]) => k == 'Barbero')).toBe(false);
  });
});
