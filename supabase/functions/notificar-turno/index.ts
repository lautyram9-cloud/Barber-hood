// Función de Supabase (Edge Function) "notificar-turno" — avisos push de reservas nuevas.
//
// La llama la base (trigger de la etapa 12) cada vez que entra un turno PENDIENTE desde el link de reserva.
// También la usa la app para: obtener la clave pública de avisos ("clave") y mandar un aviso de prueba ("prueba").
//
// Seguridad (se despliega con "Verify JWT" desactivado, porque la base la llama sin sesión):
//  - Nunca confía en lo que recibe: con el id del turno vuelve a leerlo de la base y solo avisa si es un turno
//    pendiente creado hace menos de 10 minutos, una sola vez por turno (tabla push_enviados).
//  - Tope anti-spam: como máximo TOPE_POR_HORA avisos de reservas por hora.
//  - El aviso de prueba solo va a los dispositivos del usuario que lo pide (se verifica su sesión).
//  - Las claves de avisos (VAPID) se generan solas la primera vez y se guardan en push_config, tabla que
//    solo puede leer el servidor. Nadie tiene que copiar ni pegar claves secretas.
//  - El texto del aviso no incluye el teléfono del cliente.

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import webpush from 'npm:web-push@3.6.7';
import { avisoReserva, debeAvisar, URL_APP } from './avisos.ts';

const VAPID_SUBJECT = 'https://lautyram9-cloud.github.io/Barber-hood/';
const TOPE_POR_HORA = 20;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------- Servidor ----------

type Sb = any; // cliente de supabase-js con la clave de servicio
interface Sub { endpoint: string; p256dh: string; auth: string }

async function claves(sb: Sb): Promise<{ publica: string; privada: string }> {
  const leer = async () => (await sb.from('push_config').select('publica, privada').eq('id', 1).maybeSingle()).data;
  let k = await leer();
  if (!k) {
    const n = webpush.generateVAPIDKeys();
    await sb.from('push_config').upsert({ id: 1, publica: n.publicKey, privada: n.privateKey }, { onConflict: 'id', ignoreDuplicates: true });
    k = await leer();
  }
  if (!k) throw new Error('No se pudieron preparar las claves de avisos');
  return k;
}

async function enviar(sb: Sb, subs: Sub[], aviso: object) {
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(aviso), { TTL: 3600, urgency: 'high' });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_subs').delete().eq('endpoint', s.endpoint); // el dispositivo se dio de baja
      else console.error('push falló', code, (e as Error).message);
    }
  }
  return ok;
}

async function avisarReserva(sb: Sb, turnoId: string) {
  const { data: t } = await sb.from('turnos').select('id, cliente, inicio, estado, barbero_id, created_at').eq('id', turnoId).maybeSingle();
  if (!debeAvisar(t, Date.now())) return { avisado: false, motivo: 'no corresponde' };

  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from('push_enviados').select('turno_id', { count: 'exact', head: true }).gte('enviado_at', haceUnaHora);
  if ((count ?? 0) >= TOPE_POR_HORA) return { avisado: false, motivo: 'tope por hora' };

  // Una sola vez por turno: si ya existe la fila, otro llamado ya avisó.
  const { error: dup } = await sb.from('push_enviados').insert({ turno_id: t.id });
  if (dup) return { avisado: false, motivo: 'ya avisado' };

  const [{ data: duenos }, { data: barbero }, { data: items }] = await Promise.all([
    sb.from('perfiles').select('id').eq('rol', 'owner'),
    t.barbero_id ? sb.from('barberos').select('nombre, user_id').eq('id', t.barbero_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('turno_items').select('servicios(nombre)').eq('turno_id', t.id),
  ]);
  const usuarios = [...new Set([...(duenos ?? []).map((d: { id: string }) => d.id), barbero?.user_id].filter(Boolean))];
  if (!usuarios.length) return { avisado: false, motivo: 'sin destinatarios' };
  const { data: subs } = await sb.from('push_subs').select('endpoint, p256dh, auth').in('user_id', usuarios);
  const servicios = (items ?? []).map((i: { servicios: { nombre: string } | null }) => i.servicios?.nombre).filter(Boolean);
  const n = await enviar(sb, subs ?? [], avisoReserva(t, servicios, barbero?.nombre ?? null));
  await sb.from('push_enviados').update({ destinos: n }).eq('turno_id', t.id);
  return { avisado: n > 0, destinos: n };
}

async function manejar(req: Request, env: (k: string) => string | undefined): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const body = (await req.json().catch(() => ({}))) as { accion?: string; turno_id?: string };

  const sb = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const k = await claves(sb);
  webpush.setVapidDetails(VAPID_SUBJECT, k.publica, k.privada);

  if (body.accion === 'clave') return json({ publica: k.publica });

  if (body.accion === 'prueba') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data } = await sb.auth.getUser(token);
    if (!data?.user) return json({ error: 'Necesitás iniciar sesión' }, 401);
    const { data: subs } = await sb.from('push_subs').select('endpoint, p256dh, auth').eq('user_id', data.user.id);
    const n = await enviar(sb, subs ?? [], { title: 'Barber Hood', body: 'Prueba: los avisos de reservas funcionan en este dispositivo', url: URL_APP, tag: 'prueba' });
    return json({ enviadas: n });
  }

  if (typeof body.turno_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.turno_id)) return json(await avisarReserva(sb, body.turno_id));
  return json({ error: 'Pedido inválido' }, 400);
}

Deno.serve((req) => manejar(req, (k) => Deno.env.get(k)).catch((e) => { console.error(e); return json({ error: 'Error interno' }, 500); }));
