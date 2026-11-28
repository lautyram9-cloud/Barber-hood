import { describe, expect, it } from 'vitest';
import { sectionsFor } from '@/app/nav';
import { legacySource } from '../parity/legacy-harness';

// La navegación nueva debe mostrar las mismas secciones, en el mismo orden, que la versión estable.
function legacyTabs(owner: boolean, me: boolean) {
  const m = legacySource().match(/T=(\[\['ini'.*?\]\])\.filter/);
  if (!m) throw new Error('No se encontró la lista de pestañas en index.html');
  const T = JSON.parse(m[1].replace(/'/g, '"').replace(/"Stock"\+\(low\?" ⚠️":""\)/, '"Stock"')) as string[][];
  return T.filter((t) => !t[3] || (t[3] == 'a' ? owner : t[3] == 'o' ? owner : t[3] == 'b' ? me : !me)).map((t) => [t[0], t[2]]);
}

describe('navegación por rol', () => {
  it('dueño: mismas secciones que la versión estable, con Barberos y Comisiones unidas en Sueldos (cambio intencional)', () => {
    const esperado = legacyTabs(true, false).flatMap(([id, l]) => (id == 'bar' ? [['sue', 'Sueldos']] : id == 'com' ? [] : [[id, l]]));
    expect(sectionsFor(true, false).map((s) => [s.id, s.label])).toEqual(esperado);
  });
  it('barbero: mismas secciones que la versión estable, más Ajustes (cambio intencional: cuenta y avisos)', () => {
    expect(sectionsFor(false, true).map((s) => [s.id, s.label])).toEqual([...legacyTabs(false, true), ['aj', 'Ajustes']]);
  });
});
