import { describe, expect, it } from 'vitest';
import { LEGACY_SUPABASE, resolveSupabaseConfig } from '@/config';
import { legacySource } from '../parity/legacy-harness';

describe('conexión a Supabase', () => {
  it('usa exactamente la misma URL y clave publishable que la versión estable', () => {
    const m = legacySource().match(/const CFG=\{url:'([^']+)',key:'([^']+)'\}/);
    expect(m, 'no se encontró CFG en index.html').toBeTruthy();
    expect(LEGACY_SUPABASE.url).toBe(m![1]);
    expect(LEGACY_SUPABASE.key).toBe(m![2]);
    expect(resolveSupabaseConfig({})).toEqual({ url: m![1], key: m![2] });
  });
  it('la clave por defecto es publishable', () => {
    expect(LEGACY_SUPABASE.key.startsWith('sb_publishable_')).toBe(true);
  });
  it('rechaza claves secretas y URLs inválidas', () => {
    expect(() => resolveSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow();
    expect(() => resolveSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJ...service_role...' })).toThrow();
    expect(() => resolveSupabaseConfig({ VITE_SUPABASE_URL: 'http://evil.example.com' })).toThrow();
  });
  it('permite sobreescribir con variables de entorno', () => {
    expect(resolveSupabaseConfig({ VITE_SUPABASE_URL: 'https://otro.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' })).toEqual({ url: 'https://otro.supabase.co', key: 'sb_publishable_x' });
  });
});
