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

describe('aviso semanal de liquidación', () => {
  it('solo los sábados entre 21:50 y 23:00 hora de Argentina, con una clave por semana', async () => {
    const { ventanaLiquidar, AVISO_LIQUIDAR } = await import('../../../supabase/functions/notificar-turno/avisos');
    const ar = (iso: string) => Date.parse(iso + '-03:00');
    expect(ventanaLiquidar(ar('2026-11-28T22:00:00'))).toBe('liquidar-2026-11-28'); // sábado 22:00
    expect(ventanaLiquidar(Date.parse('2026-11-29T01:00:00Z'))).toBe('liquidar-2026-11-28'); // lo que dispara pg_cron (domingo 01:00 UTC)
    expect(ventanaLiquidar(ar('2026-11-28T21:50:00'))).toBe('liquidar-2026-11-28');
    expect(ventanaLiquidar(ar('2026-11-28T22:59:00'))).toBe('liquidar-2026-11-28');
    expect(ventanaLiquidar(ar('2026-11-28T21:49:00'))).toBeNull();
    expect(ventanaLiquidar(ar('2026-11-28T23:00:00'))).toBeNull();
    expect(ventanaLiquidar(ar('2026-11-27T22:00:00'))).toBeNull(); // viernes
    expect(ventanaLiquidar(ar('2026-11-29T22:00:00'))).toBeNull(); // domingo
    expect(ventanaLiquidar(ar('2026-12-05T22:10:00'))).toBe('liquidar-2026-12-05'); // otra semana, otra clave
    expect(AVISO_LIQUIDAR.body).toBe('¡Es momento de liquidar la semana!');
    expect(AVISO_LIQUIDAR.url).toMatch(/#\/sue$/);
  });
});
