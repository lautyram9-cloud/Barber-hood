import { describe, expect, it } from 'vitest';
import { iniciales, recorteCuadrado, urlFoto } from '@/lib/fotos';
import { diaCorto, diaLargo, partesDia, proximosDias } from '@/domain/reserva';
import { buildAppData } from '@/domain/build';
import { fixtures } from '../fixtures';

describe('fotos de barberos', () => {
  it('URL pública solo para rutas válidas', () => {
    expect(urlFoto('abc-1/123.jpg')).toMatch(/\/storage\/v1\/object\/public\/barberos\/abc-1\/123\.jpg$/);
    expect(urlFoto(null)).toBeNull();
    expect(urlFoto('')).toBeNull();
    expect(urlFoto('../../otra/cosa.jpg')).toBeNull();
    expect(urlFoto('x/<script>.jpg')).toBeNull();
  });
  it('iniciales', () => {
    expect(iniciales('Lucas Pérez')).toBe('LP');
    expect(iniciales('  ana  ')).toBe('A');
    expect(iniciales('Juan Carlos Gómez')).toBe('JG');
    expect(iniciales('')).toBe('?');
  });
  it('recorte cuadrado centrado', () => {
    expect(recorteCuadrado(600, 400)).toEqual({ sx: 100, sy: 0, lado: 400 });
    expect(recorteCuadrado(300, 500)).toEqual({ sx: 0, sy: 100, lado: 300 });
  });
  it('el modelo lleva la foto (o null si la base todavía no tiene la columna)', () => {
    const raw = fixtures(3, '2026-11-12T15:37:00-03:00');
    expect(buildAppData(raw).barberos.every((b) => b.foto === null)).toBe(true);
    const con = { ...raw, barberos: raw.barberos!.map((b, i) => ({ ...b, foto: i == 0 ? `${b.id}/1.jpg` : null })) };
    expect(buildAppData(con).barberos.find((b) => b.id == raw.barberos![0].id)?.foto ?? null).toBe(raw.barberos![0].activo ? `${raw.barberos![0].id}/1.jpg` : null);
  });
});

describe('fechas de la página de reservas', () => {
  it('próximos días en hora local, sin saltos', () => {
    const d = proximosDias(3, new Date(2026, 10, 29, 23, 30));
    expect(d).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
  });
  it('textos', () => {
    expect(partesDia('2026-11-20')).toEqual({ semana: 'vie', dia: 20, mes: 'nov' });
    expect(diaLargo('2026-11-20')).toBe('viernes 20 de noviembre');
    expect(diaCorto('2026-11-02')).toBe('lun 02/11');
  });
});
