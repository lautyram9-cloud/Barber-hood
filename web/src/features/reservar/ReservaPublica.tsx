import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, CheckCircle2, Clock, Loader2, Scissors, Users } from 'lucide-react';
import type { PublicInfo } from '@/lib/database.types';
import * as L from '@/domain/logic';
import * as R from '@/domain/reserva';
import { rpc, sb } from '@/lib/supabase';
import { mensajeError } from '@/state/feedback';
import { Button, cx } from '@/components/ui';
import { Avatar } from '@/components/ui/Avatar';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Problem } from '@/features/StatusScreens';

/** Reserva pública para clientes (link #reservar). Sin login: solo public_info y reservar_publico. */
export function ReservaPublica() {
  const q = useQuery({ queryKey: ['public_info'], queryFn: () => rpc<PublicInfo>('public_info'), refetchInterval: 60_000 });
  if (q.error) return <Problem title="No se pudo cargar la reserva" actions={<Button onClick={() => q.refetch()}>Reintentar</Button>}>Revisá tu conexión e intentá de nuevo.</Problem>;
  if (!q.data) return <div className="flex min-h-dvh items-center justify-center text-sm text-muted"><Loader2 className="mr-2 animate-spin text-accent" size={18} /> Cargando…</div>;
  return <Formulario info={q.data} />;
}

function Paso({ n, titulo, extra, children }: { n: number; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`paso-${n}`} className="rounded-3xl border border-line bg-surface/80 p-5 backdrop-blur sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">{n}</span>
        <h2 id={`paso-${n}`} className="flex-1 text-base font-semibold">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Formulario({ info }: { info: PublicInfo }) {
  const { ctx, servicios, barberos } = useMemo(() => R.desdeInfoPublica(info), [info]);
  const [nombre, setNombre] = useState(''), [tel, setTel] = useState(''), [notas, setNotas] = useState('');
  const [sel, setSel] = useState<string[]>([]), [barbero, setBarbero] = useState(''), [fecha, setFecha] = useState(() => L.proximoDiaAbierto(ctx)), [horaSel, setHora] = useState('');
  const [error, setError] = useState(''), [enviando, setEnviando] = useState(false), [listo, setListo] = useState<null | { barbero: string; fecha: string; hora: string }>(null);
  const ds = sel.map((id) => servicios.find((s) => s.id == id)!).filter(Boolean);
  const libres = L.horariosLibres(ctx, fecha, barbero, ds), hora = libres.includes(horaSel) ? horaSel : '';
  const dur = ds.reduce((t, s) => t + (s.duracionMin || L.minutosBarbero(ctx, barbero)), 0);
  const total = ds.reduce((t, s) => t + s.precio, 0);
  const dias = useMemo(() => R.proximosDias(14), []);
  const fotoDe = (id: string) => info.barberos.find((b) => b.id == id)?.foto ?? null;
  const nombreDe = (id: string) => barberos.find((b) => b.id == id)?.nombre ?? '';

  async function enviar() {
    const x: R.Reserva = { nombre, telefono: tel, fecha, hora, barbero, servicios: ds, notas }, p = R.prepararReserva(ctx, x);
    if ('error' in p) return setError(p.error);
    setEnviando(true); setError('');
    try { await R.enviarReserva(sb, x, p.barbero); setListo({ barbero: p.barbero, fecha, hora }); } catch (e) { setError(mensajeError(e)); } finally { setEnviando(false); }
  }

  if (listo) return (
    <div className="pt-safe flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(52,211,153,0.12),transparent)]" />
      <div className="relative w-full max-w-sm rounded-3xl border border-line bg-surface/80 p-6 backdrop-blur">
        <CheckCircle2 className="mx-auto mb-4 text-ok" size={48} />
        <h1 className="text-xl font-semibold">¡Solicitud enviada!</h1>
        <p className="mt-2 text-sm text-muted">Tu turno quedó pendiente de confirmación. La barbería te va a confirmar.</p>
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-bg/60 p-3 text-left">
          <Avatar nombre={nombreDe(listo.barbero)} foto={fotoDe(listo.barbero)} size={48} />
          <div className="min-w-0 text-sm">
            <p className="font-medium">{ds.map((s) => s.nombre).join(' + ')}</p>
            <p className="text-muted">{R.diaLargo(listo.fecha)} · {listo.hora} · con {nombreDe(listo.barbero)}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="pt-safe min-h-dvh px-4 pb-[calc(120px+env(safe-area-inset-bottom))] pt-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,140,255,0.14),transparent)]" />
      <div className="relative mx-auto max-w-lg space-y-4">
        <header className="mb-2 text-center">
          <img src="./logo.png" alt="Barber Hood" className="mx-auto mb-4 h-16 w-auto mix-blend-lighten" />
          <h1 className="text-2xl font-semibold tracking-tight">Reservá tu turno</h1>
          <p className="mt-1 text-sm text-muted">Elegí servicio, barbero y horario. Te confirmamos a la brevedad.</p>
        </header>

        <Paso n={1} titulo="Servicios" extra={ds.length ? <span className="text-xs text-muted">{dur} min</span> : null}>
          <div className="grid gap-2">
            {servicios.map((s) => {
              const on = sel.includes(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={on} aria-label={`${s.nombre} · ${L.formatoPesos(s.precio)}`}
                  onClick={() => setSel((x) => (x.includes(s.id) ? x.filter((i) => i != s.id) : [...x, s.id]))}
                  className={cx('flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition', on ? 'border-accent bg-accent/10' : 'border-line bg-bg/40 hover:border-line-strong')}>
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', on ? 'border-accent bg-accent text-white' : 'border-line-strong')}>{on && <Check size={14} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.nombre}</span>
                    {s.duracionMin ? <span className="flex items-center gap-1 text-xs text-muted"><Clock size={11} /> {s.duracionMin} min</span> : null}
                  </span>
                  <span className="num shrink-0 text-sm font-semibold">{L.formatoPesos(s.precio)}</span>
                </button>
              );
            })}
          </div>
        </Paso>

        <Paso n={2} titulo="Barbero">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <TarjetaBarbero on={barbero == ''} onClick={() => setBarbero('')} nombre="Cualquiera" icono={<span className="flex h-16 w-16 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-muted"><Users size={26} /></span>} />
            {barberos.map((b) => (
              <TarjetaBarbero key={b.id} on={barbero == b.id} onClick={() => setBarbero(b.id)} nombre={b.nombre} icono={<Avatar nombre={b.nombre} foto={fotoDe(b.id)} size={64} />} />
            ))}
          </div>
        </Paso>

        <Paso n={3} titulo="Día y horario">
          <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6" role="group" aria-label="Días">
            {dias.map((f) => {
              const abierto = L.horariosLibres(ctx, f, barbero, ds).length > 0, on = f == fecha, d = R.partesDia(f);
              return (
                <button key={f} type="button" aria-pressed={on} disabled={!abierto} aria-label={R.diaLargo(f)} onClick={() => { setFecha(f); setHora(''); }}
                  className={cx('flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 transition', on ? 'border-accent bg-accent text-white' : abierto ? 'border-line bg-bg/40 hover:border-line-strong' : 'border-line/50 text-subtle opacity-40')}>
                  <span className="text-[11px] uppercase tracking-wide">{d.semana}</span>
                  <span className="num text-lg font-semibold leading-tight">{d.dia}</span>
                  <span className="text-[10px]">{d.mes}</span>
                </button>
              );
            })}
          </div>
          <label className="mb-4 flex items-center gap-2 text-xs text-muted">
            <CalendarDays size={14} /> Otra fecha:
            <input type="date" aria-label="Elegir otra fecha" min={L.today()} value={fecha} onChange={(e) => { if (e.target.value) { setFecha(e.target.value); setHora(''); } }}
              className="num h-9 rounded-lg border border-line bg-bg px-2 text-sm text-fg" />
          </label>
          {libres.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="group" aria-label="Horarios">
              {libres.map((h) => (
                <button key={h} type="button" aria-pressed={h == hora} onClick={() => setHora(h)}
                  className={cx('num min-h-11 rounded-xl border text-sm transition', h == hora ? 'border-accent bg-accent font-semibold text-white' : 'border-line bg-bg/40 hover:border-line-strong')}>{h}</button>
              ))}
            </div>
          ) : <p className="rounded-xl bg-bg/60 px-3 py-4 text-center text-sm text-muted">No hay horarios libres ese día. Probá con otro día{barbero ? ' u otro barbero' : ''}.</p>}
        </Paso>

        <Paso n={4} titulo="Tus datos">
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Tu nombre">{(id) => <Input id={id} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Field>
            <Field label="Tu teléfono">{(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="tel" placeholder="Ej. 387 4123456" value={tel} onChange={(e) => setTel(e.target.value)} />}</Field>
          </div>
          <Field label="Comentario (opcional)">{(id) => <Textarea id={id} value={notas} onChange={(e) => setNotas(e.target.value)} />}</Field>
        </Paso>
        <p className="text-center text-xs text-subtle">Tu turno queda pendiente hasta que la barbería lo confirme.</p>
      </div>

      {/* Resumen fijo abajo con el botón */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-3">
          {error && <p role="alert" className="mb-2 rounded-xl bg-ko/10 px-3 py-2 text-sm text-ko">{error}</p>}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-xs text-muted">
              {ds.length ? <p className="truncate text-sm font-medium text-fg"><Scissors size={13} className="mr-1 inline" />{ds.map((s) => s.nombre).join(' + ')}</p> : <p className="text-sm">Elegí un servicio</p>}
              <p className="num truncate">{hora ? `${R.diaCorto(fecha)} · ${hora}` : 'Sin horario'}{total ? ` · ${L.formatoPesos(total)}` : ''}</p>
            </div>
            <Button className="h-12 shrink-0 px-5" disabled={enviando} onClick={enviar}>{enviando && <Loader2 size={16} className="animate-spin" />} Solicitar turno</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TarjetaBarbero({ on, onClick, nombre, icono }: { on: boolean; onClick(): void; nombre: string; icono: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cx('flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition', on ? 'border-accent bg-accent/10' : 'border-line bg-bg/40 hover:border-line-strong')}>
      <span className={cx('rounded-full p-0.5', on ? 'ring-2 ring-accent' : '')}>{icono}</span>
      <span className="w-full truncate text-center text-sm font-medium">{nombre}</span>
    </button>
  );
}
