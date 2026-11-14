import { describe, expect, it } from 'vitest';
import { buildAppData, mezclarCostos } from '@/domain/build';
import { COLUMNAS } from '@/lib/supabase';
import { fixtures } from '../fixtures';

const raw = fixtures(42, '2026-11-12T15:37:00-03:00');

describe('costos solo para el dueño', () => {
  it('las columnas pedidas son TODAS las de la tabla menos el costo (si no, se perdería algún dato)', () => {
    expect(COLUMNAS.productos!.split(',').sort()).toEqual(Object.keys(raw.productos![0]).filter((k) => k != 'costo').sort());
    expect(COLUMNAS.ingresos!.split(',').sort()).toEqual(Object.keys(raw.ingresos![0]).filter((k) => k != 'costo_unit').sort());
  });
  it('sin costos la app no se rompe: valen 0 (así ve el barbero)', () => {
    const sin = { ...raw, productos: raw.productos!.map(({ costo: _c, ...r }) => r), ingresos: raw.ingresos!.map(({ costo_unit: _u, ...r }) => r) };
    const d = buildAppData(sin);
    expect(d.productos.every((p) => p.costo === 0)).toBe(true);
    expect(d.movs.filter((m) => m.tipo == 'ing').every((m) => m.costoUnit === 0)).toBe(true);
  });
  it('mezclarCostos devuelve exactamente el modelo original', () => {
    const sin = { ...raw, productos: raw.productos!.map(({ costo: _c, ...r }) => r), ingresos: raw.ingresos!.map(({ costo_unit: _u, ...r }) => r) };
    const c = {
      productos: raw.productos!.map((p) => ({ id: p.id, costo: p.costo as number })),
      ingresos: raw.ingresos!.filter((i) => +(i.costo_unit as number) !== 0).map((i) => ({ id: i.id, costo_unit: i.costo_unit as number })), // como costos_dueno: solo los distintos de 0
    };
    expect(buildAppData(mezclarCostos(sin, c))).toEqual(buildAppData(raw));
  });
});
