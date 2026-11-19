import { describe, expect, it } from 'vitest';
import { avisoReserva, cuandoTurno, debeAvisar } from '../../../supabase/functions/notificar-turno/avisos';
import { claveABytes, esIOS } from '@/lib/push';

describe('función notificar-turno (partes puras)', () => {
  it('fecha y hora del turno en hora local, sin corrimientos de zona', () => {
    expect(cuandoTurno('2026-11-20T16:00:00')).toBe('vie 20/11 16:00');
    expect(cuandoTurno('2026-11-22 09:30:00')).toBe('dom 22/11 09:30');
    expect(cuandoTurno('basura')).toBe('basura');
  });
  it('el aviso dice quién, cuándo, qué y con quién; nunca el teléfono', () => {
    const a = avisoReserva({ cliente: '  Ana  ', inicio: '2026-11-20T16:00:00' }, ['Corte', 'Barba'], 'Lucas');
    expect(a.title).toBe('Nueva solicitud de turno');
    expect(a.body).toBe('Ana · vie 20/11 16:00 · Corte + Barba (con Lucas)');
    expect(a.url).toMatch(/#\/tur$/);
    expect(avisoReserva({ cliente: 'Ana', inicio: '2026-11-20T16:00:00' }, [], null).body).toBe('Ana · vie 20/11 16:00');
    expect(avisoReserva({ cliente: 'x'.repeat(200), inicio: '2026-11-20T16:00:00' }, [], null).body.length).toBeLessThan(90);
  });
  it('solo avisa de turnos pendientes recién creados (re-valida contra la base)', () => {
    const ahora = Date.parse('2026-11-18T12:00:00Z');
    expect(debeAvisar({ estado: 'pendiente', created_at: '2026-11-18T11:58:00Z' }, ahora)).toBe(true);
    expect(debeAvisar({ estado: 'pendiente', created_at: '2026-11-18T11:40:00Z' }, ahora)).toBe(false);
    expect(debeAvisar({ estado: 'confirmado', created_at: '2026-11-18T11:59:00Z' }, ahora)).toBe(false);
    expect(debeAvisar({ estado: 'pendiente', created_at: 'x' }, ahora)).toBe(false);
    expect(debeAvisar(null, ahora)).toBe(false);
  });
});

describe('avisos en la app', () => {
  it('convierte la clave pública base64url a bytes', () => {
    expect([...claveABytes('AQIDBA')]).toEqual([1, 2, 3, 4]);
    expect(claveABytes('BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM').length).toBe(65);
  });
  it('detecta iPhone y iPad (incluido el iPad que se presenta como Mac)', () => {
    expect(esIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(esIOS('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false);
  });
});
