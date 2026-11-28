import { describe, expect, it } from 'vitest';
import { buildAppData } from '@/domain/build';
import { porDemanda } from '@/domain/movimientos';
import { validarBarbero, validarServicio } from '@/domain/ajustes';
import { esDinero } from '@/components/ui';
import { fixtures } from '../fixtures';

const d = buildAppData(fixtures(42, '2026-11-12T15:37:00-03:00'));

describe('lo más pedido primero', () => {
  it('servicios ordenados por cantidad vendida en los últimos 90 días', () => {
    const o = porDemanda(d, d.servicios, 'servicio', 90, '2026-11-12');
    const cuenta = (n: string) => d.movs.filter((m) => m.tipo == 'ing' && m.categoria == 'servicio' && m.concepto == n && m.fecha >= '2026-08-14').reduce((t, m) => t + (m.cantidad || 1), 0);
    const c = o.map((s) => cuenta(s.nombre));
    expect(c).toEqual([...c].sort((a, b) => b - a));
    expect(o).toHaveLength(d.servicios.length);
  });
  it('productos por unidades; sin ventas, alfabético', () => {
    const vacio = { ...d, movs: [] };
    const o = porDemanda(vacio, d.productos, 'producto');
    expect(o.map((p) => p.nombre)).toEqual([...d.productos].map((p) => p.nombre).sort((a, b) => a.localeCompare(b)));
  });
});

describe('edición de barberos y servicios', () => {
  it.each([['', '30', 'Poné el nombre del barbero'], ['Lu', '3', 'Los minutos por turno van de 5 a 240'], ['Lucas', '30.5', 'Los minutos por turno van de 5 a 240'], ['Lucas', '45', null]])('barbero %s/%s', (n, m, e) => expect(validarBarbero(n, m)).toBe(e));
  it.each([['', '1', '', '', 'Poné el nombre del servicio'], ['Corte', '', '', '', 'Poné el precio'], ['Corte', '100', '120', '', 'La comisión va de 0 a 100%'], ['Corte', '100', '50', '3', 'La duración va de 5 a 480 minutos (o vacía)'], ['Corte', '100', '50', '', null], ['Corte', '0', '', '30', null]])('servicio %s', (n, p, c, du, e) => expect(validarServicio(n, p, c, du)).toBe(e));
});

describe('cuadros con dinero resaltados', () => {
  it('detecta montos', () => {
    expect(esDinero('$12.000')).toBe(true);
    expect(esDinero('$-500')).toBe(true);
    expect(esDinero(12)).toBe(false);
    expect(esDinero('Cerrada')).toBe(false);
  });
});
