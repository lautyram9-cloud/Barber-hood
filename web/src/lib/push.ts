import { sb } from './supabase';

// Avisos push de reservas nuevas (etapa 12). La parte de servidor es la función de Supabase "notificar-turno".

/** Clave pública VAPID (base64url) → bytes, como pide pushManager.subscribe. */
export function claveABytes(b64url: string) {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** iPhone/iPad: los avisos solo funcionan con la app instalada en la pantalla de inicio. */
export function esIOS(ua = navigator.userAgent, maxTouch = navigator.maxTouchPoints) {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouch > 1);
}
const instalada = () => (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia?.('(display-mode: standalone)').matches;

export type EstadoAvisos =
  | { tipo: 'no-disponible'; motivo: string }
  | { tipo: 'bloqueado' }
  | { tipo: 'apagado' }
  | { tipo: 'activo' };

async function registro() {
  return navigator.serviceWorker?.getRegistration ? await navigator.serviceWorker.getRegistration() : undefined;
}

/** Permiso de avisos. Se prefiere la API de permisos (más fiel); si no está, Notification.permission. */
async function permiso(): Promise<'granted' | 'denied' | 'default'> {
  try {
    const st = (await navigator.permissions?.query({ name: 'notifications' as PermissionName }))?.state;
    if (st) return st == 'prompt' ? 'default' : st;
  } catch { /* Safari viejo: sin consulta de permisos */ }
  return Notification.permission;
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (location.pathname.includes('/next/')) return { tipo: 'no-disponible', motivo: 'No disponible en la vista previa.' };
  if (esIOS() && !instalada()) return { tipo: 'no-disponible', motivo: 'En iPhone/iPad primero instalá la app: Compartir → Agregar a pantalla de inicio, y abrila desde el ícono.' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { tipo: 'no-disponible', motivo: 'Este navegador no admite avisos.' };
  const reg = await registro();
  if (!reg) return { tipo: 'no-disponible', motivo: 'La app se está terminando de instalar: cerrala y abrila de nuevo.' };
  if ((await permiso()) === 'denied') return { tipo: 'bloqueado' };
  return (await reg.pushManager.getSubscription()) ? { tipo: 'activo' } : { tipo: 'apagado' };
}

export async function activarAvisos() {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para mostrar avisos.');
  const reg = await registro();
  if (!reg) throw new Error('La app se está terminando de instalar: cerrala y abrila de nuevo.');
  const { data, error } = await sb.functions.invoke<{ publica: string }>('notificar-turno', { body: { accion: 'clave' } });
  if (error || !data?.publica) throw new Error('No se pudo contactar al servidor de avisos.');
  let sub: PushSubscription;
  try { sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(data.publica) }); }
  catch { throw new Error('Este dispositivo no pudo registrarse para recibir avisos.'); }
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error: e2 } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, agente: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
  if (e2) { await sub.unsubscribe().catch(() => {}); throw new Error('No se pudo guardar este dispositivo.'); }
}

export async function desactivarAvisos() {
  const sub = await (await registro())?.pushManager.getSubscription();
  if (!sub) return;
  await sb.from('push_subs').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Manda un aviso de prueba a los dispositivos del usuario. Devuelve cuántos lo recibieron. */
export async function probarAvisos() {
  const { data, error } = await sb.functions.invoke<{ enviadas: number }>('notificar-turno', { body: { accion: 'prueba' } });
  if (error) throw new Error('No se pudo enviar la prueba.');
  return data?.enviadas ?? 0;
}
