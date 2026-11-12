// Conexión a Supabase. Por defecto usa EXACTAMENTE los mismos valores públicos
// que la versión estable (index.html de la raíz); un test lo verifica.
// Se pueden sobreescribir con VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
// Solo se admite la clave publishable: nunca una secret ni service_role.
export const LEGACY_SUPABASE = {
  url: 'https://gbrutjlhdcnnlghoaxlu.supabase.co',
  key: 'sb_publishable_TT3gfpD1H2Fp8rUqHhPosw__ZmnZ0dK',
} as const;

export function resolveSupabaseConfig(env: Record<string, string | undefined>) {
  const url = (env.VITE_SUPABASE_URL || LEGACY_SUPABASE.url).trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || LEGACY_SUPABASE.key).trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error('VITE_SUPABASE_URL inválida');
  if (/^sb_secret_/i.test(key) || /service_role/i.test(key)) throw new Error('Nunca uses una clave secreta en el frontend');
  return { url, key };
}

export const SUPABASE = resolveSupabaseConfig(import.meta.env as Record<string, string | undefined>);

/** URL de la versión estable (vanilla). Desde /next/ es la carpeta superior. */
export const LEGACY_APP_URL = '../';
