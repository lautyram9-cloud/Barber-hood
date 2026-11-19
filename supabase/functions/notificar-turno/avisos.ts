// Partes puras de la función "notificar-turno" (sin dependencias): texto del aviso y re-validación del turno.
// Las usa index.ts y se prueban en web/tests/unit/notificar-turno.test.ts.

export const URL_APP = 'https://lautyram9-cloud.github.io/Barber-hood/#/tur';
const VENTANA_MS = 10 * 60 * 1000;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** "2026-11-20T16:00:00" (hora local de la barbería, sin zona) → "vie 20/11 16:00". */
export function cuandoTurno(inicio: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(inicio);
  if (!m) return inicio;
  const dia = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${DIAS[dia]} ${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}

/** Contenido del aviso de una reserva nueva. Sin teléfono. */
export function avisoReserva(t: { cliente: string; inicio: string }, servicios: string[], barbero: string | null) {
  const partes = [t.cliente.trim().slice(0, 60), cuandoTurno(t.inicio)];
  if (servicios.length) partes.push(servicios.join(' + ').slice(0, 80));
  return { title: 'Nueva solicitud de turno', body: partes.join(' · ') + (barbero ? ` (con ${barbero})` : ''), url: URL_APP, tag: 'reserva' };
}

/** ¿Hay que avisar de este turno? (re-validación con lo que dice la base, no con lo que llegó). */
export function debeAvisar(t: { estado: string; created_at: string } | null, ahora: number) {
  if (!t || t.estado !== 'pendiente') return false;
  const creado = Date.parse(t.created_at);
  return Number.isFinite(creado) && ahora - creado >= -60_000 && ahora - creado <= VENTANA_MS;
}
