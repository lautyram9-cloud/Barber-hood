import { SUPABASE } from '@/config';
import { sb } from './supabase';

// Fotos de perfil de los barberos (etapa 13): espacio de archivos público "barberos" de Supabase.
// La ruta se guarda en barberos.foto; cada foto nueva tiene un nombre nuevo, así nunca se ve una vieja en caché.

export const BUCKET = 'barberos';
export const LADO = 480; // px: suficiente para verse nítida en pantallas de alta densidad

/** URL pública de una foto (o null si no tiene). */
export function urlFoto(ruta: string | null | undefined) {
  if (!ruta || !/^[\w-]+\/[\w.-]+$/.test(ruta)) return null;
  return `${SUPABASE.url}/storage/v1/object/public/${BUCKET}/${ruta}`;
}

/** Iniciales para cuando no hay foto: "Lucas Pérez" → "LP". */
export function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter((x) => /\p{L}/u.test(x));
  return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/** Recorte cuadrado centrado (como una foto de perfil): devuelve el área de origen a dibujar. */
export function recorteCuadrado(w: number, h: number) {
  const lado = Math.min(w, h);
  return { sx: Math.round((w - lado) / 2), sy: Math.round((h - lado) / 2), lado };
}

/** Achica y recorta la imagen elegida a un JPG cuadrado liviano (así no se sube una foto de 5 MB). */
async function prepararImagen(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Elegí una imagen (JPG, PNG o similar).');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('No se pudo leer la imagen. Probá con otra.'); });
  const { sx, sy, lado } = recorteCuadrado(bmp.width, bmp.height);
  const salida = Math.min(LADO, lado);
  const c = document.createElement('canvas');
  c.width = c.height = salida;
  c.getContext('2d')!.drawImage(bmp, sx, sy, lado, lado, 0, 0, salida, salida);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  if (!blob) throw new Error('No se pudo preparar la imagen.');
  return blob;
}

/** Sube la foto del barbero y la deja como su foto de perfil (borra la anterior). */
export async function subirFoto(barberoId: string, file: File, anterior?: string | null) {
  const blob = await prepararImagen(file);
  const ruta = `${barberoId}/${Date.now()}.jpg`;
  const up = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (up.error) throw new Error('No se pudo subir la foto. ¿Ya se ejecutó supabase/etapa13-fotos-barberos.sql?');
  const r = await sb.from('barberos').update({ foto: ruta }).eq('id', barberoId);
  if (r.error) { await sb.storage.from(BUCKET).remove([ruta]); throw new Error('No se pudo guardar la foto.'); }
  if (anterior) await sb.storage.from(BUCKET).remove([anterior]).catch(() => {});
}

/** Quita la foto (vuelve a las iniciales). */
export async function quitarFoto(barberoId: string, anterior: string) {
  const r = await sb.from('barberos').update({ foto: null }).eq('id', barberoId);
  if (r.error) throw new Error('No se pudo quitar la foto.');
  await sb.storage.from(BUCKET).remove([anterior]).catch(() => {});
}
