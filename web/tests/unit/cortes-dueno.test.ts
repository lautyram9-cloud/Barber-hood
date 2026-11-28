import { describe, expect, it } from 'vitest';
import { buildAppData } from '@/domain/build';
import { cortesDelDueno, miBarbero } from '@/domain/ajustes';
import { fixtures } from '../fixtures';

const raw = fixtures(42, '2026-11-12T15:37:00-03:00');
const b0 = raw.barberos![0];
const d = buildAppData({ ...raw, barberos: raw.barberos!.map((b) => (b.id == b0.id ? { ...b, user_id: 'usr-owner' } : b)) });

describe('los cortes del dueño se suman a su parte', () => {
  it('encuentra su perfil de barbero por su usuario', () => {
    expect(miBarbero(d, 'usr-owner')?.id).toBe(b0.id);
    expect(miBarbero(d, 'otro')).toBeNull();
    expect(miBarbero(d, null)).toBeNull();
  });
  it('suma solo sus servicios del período (no productos, no otros barberos)', () => {
    const c = cortesDelDueno(d, 'usr-owner', '2025-01-01', '2026-12-31')!;
    const esp = d.movs.filter((m) => m.tipo == 'ing' && m.categoria == 'servicio' && m.barberoId == b0.id);
    expect(c.movs.map((m) => m.id).sort()).toEqual(esp.map((m) => m.id).sort());
    expect(c.total).toBe(esp.reduce((t, m) => t + m.monto, 0));
    expect(c.movs.every((m) => m.categoria == 'servicio' && m.barberoId == b0.id)).toBe(true);
  });
  it('fuera del período no cuenta; sin perfil vinculado devuelve null', () => {
    expect(cortesDelDueno(d, 'usr-owner', '2000-01-01', '2000-01-31')!.total).toBe(0);
    expect(cortesDelDueno(d, 'nadie', '2025-01-01', '2026-12-31')).toBeNull();
  });
});
