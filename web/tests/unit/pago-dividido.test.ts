import { describe, expect, it } from 'vitest';
import { buildAppData } from '@/domain/build';
import { detalleCompleto, partesPago, textoMedio, totalIngresoRapido, validarIngresoRapido, type IngresoRapido } from '@/domain/movimientos';
import type { Movimiento } from '@/domain/model';
import { fixtures } from '../fixtures';

const base: IngresoRapido = { tipo: 'servicio', concepto: 'Corte', monto: '20000', cantidad: '1', productoId: '', cliente: '', barbero: '', fecha: '2026-11-28', medio: 'dividido', cobrado: true, efectivo: '12000', medio2: 'transferencia' };

describe('pago dividido', () => {
  it('total: precio × cantidad solo en productos', () => {
    expect(totalIngresoRapido(base)).toBe(20000);
    expect(totalIngresoRapido({ ...base, tipo: 'producto', productoId: 'p', monto: '3000', cantidad: '3' })).toBe(9000);
  });
  it.each([
    ['válido', {}, null],
    ['efectivo = total', { efectivo: '20000' }, 'La parte en efectivo tiene que ser mayor a 0 y menor que el total'],
    ['efectivo 0', { efectivo: '0' }, 'La parte en efectivo tiene que ser mayor a 0 y menor que el total'],
    ['sin efectivo', { efectivo: '' }, 'La parte en efectivo tiene que ser mayor a 0 y menor que el total'],
    ['medio raro', { medio2: 'efectivo' }, 'Elegí por dónde se pagó el resto'],
    ['sin total', { monto: '0' }, 'Poné el monto total'],
  ])('%s', (_n, cambio, error) => expect(validarIngresoRapido({ ...base, ...cambio })).toBe(error));
  it('los pagos de siempre no cambian', () => expect(validarIngresoRapido({ ...base, medio: 'efectivo', efectivo: undefined, medio2: undefined })).toBeNull());

  it('texto y partes del pago', () => {
    const m = { tipo: 'ing', categoria: 'servicio', concepto: 'Corte', monto: 20000, fecha: '2026-11-28', medioPago: 'efectivo', ts: 0, pago2Medio: 'tarjeta', pago2Monto: 5000 } as Movimiento;
    expect(textoMedio(m)).toBe('Efectivo + Tarjeta');
    expect(partesPago(m)).toEqual([['efectivo', 15000], ['tarjeta', 5000]]);
    expect(textoMedio({ ...m, pago2Medio: null, pago2Monto: null })).toBe('Efectivo');
    expect(partesPago({ ...m, pago2Medio: null, pago2Monto: null })).toEqual([['efectivo', 20000]]);
    const d = buildAppData(fixtures(1, '2026-11-12T15:37:00-03:00'));
    expect(Object.fromEntries(detalleCompleto(d, { ...m, cobrado: true }, null))['Medio de pago']).toBe('Efectivo $15.000 + Tarjeta $5.000');
  });
  it('el modelo lee las columnas nuevas (y las viejas filas quedan sin dividir)', () => {
    const raw = fixtures(42, '2026-11-12T15:37:00-03:00'), i0 = raw.ingresos![0];
    const d = buildAppData({ ...raw, ingresos: raw.ingresos!.map((i) => (i.id == i0.id ? { ...i, pago2_medio: 'transferencia', pago2_monto: '1500' } : i)) });
    const m = d.movs.find((x) => x.id == i0.id)!;
    expect([m.pago2Medio, m.pago2Monto]).toEqual(['transferencia', 1500]);
    expect(d.movs.filter((x) => x.tipo == 'ing' && x.id != i0.id).every((x) => x.pago2Medio == null)).toBe(true);
  });
});
