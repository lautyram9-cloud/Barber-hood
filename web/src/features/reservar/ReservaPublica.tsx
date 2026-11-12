import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { PublicInfo } from '@/lib/database.types';
import * as L from '@/domain/logic';
import * as R from '@/domain/reserva';
import { rpc, sb } from '@/lib/supabase';
import { mensajeError } from '@/state/feedback';
import { Button } from '@/components/ui';
import { Chip, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Problem } from '@/features/StatusScreens';

/** Reserva pública para clientes (link #reservar). Sin login: solo public_info y reservar_publico. */
export function ReservaPublica() {
  const q = useQuery({ queryKey: ['public_info'], queryFn: () => rpc<PublicInfo>('public_info'), refetchInterval: 60_000 });
  if (q.error) return <Problem title="No se pudo cargar la reserva" actions={<Button onClick={() => q.refetch()}>Reintentar</Button>}>Revisá tu conexión e intentá de nuevo.</Problem>;
  if (!q.data) return <div className="flex min-h-dvh items-center justify-center text-sm text-muted"><Loader2 className="mr-2 animate-spin text-accent" size={18} /> Cargando…</div>;
  return <Formulario info={q.data} />;
}

function Formulario({ info }: { info: PublicInfo }) {
  const { ctx, servicios, barberos } = useMemo(() => R.desdeInfoPublica(info), [info]);
  const [nombre, setNombre] = useState(''), [tel, setTel] = useState(''), [notas, setNotas] = useState('');
  const [sel, setSel] = useState<string[]>([]), [barbero, setBarbero] = useState(''), [fecha, setFecha] = useState(() => L.proximoDiaAbierto(ctx)), [horaSel, setHora] = useState('');
  const [error, setError] = useState(''), [enviando, setEnviando] = useState(false), [listo, setListo] = useState(false);
  const ds = sel.map((id) => servicios.find((s) => s.id == id)!).filter(Boolean);
  const libres = L.horariosLibres(ctx, fecha, barbero, ds), hora = libres.includes(horaSel) ? horaSel : libres[0] ?? '';
  const dur = ds.reduce((t, s) => t + (s.duracionMin || L.minutosBarbero(ctx, barbero)), 0);

  async function enviar() {
    const x: R.Reserva = { nombre, telefono: tel, fecha, hora, barbero, servicios: ds, notas }, p = R.prepararReserva(ctx, x);
    if ('error' in p) return setError(p.error);
    setEnviando(true); setError('');
    try { await R.enviarReserva(sb, x, p.barbero); setListo(true); } catch (e) { setError(mensajeError(e)); } finally { setEnviando(false); }
  }

  if (listo) return (
    <div className="pt-safe flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <CheckCircle2 className="mx-auto mb-4 text-ok" size={48} />
        <h1 className="text-xl font-semibold">¡Solicitud enviada!</h1>
        <p className="mt-2 text-sm text-muted">Tu turno quedó pendiente de confirmación. La barbería te va a confirmar.</p>
      </div>
    </div>
  );

  return (
    <div className="pt-safe pb-safe min-h-dvh px-4 py-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,140,255,0.14),transparent)]" />
      <div className="relative mx-auto max-w-lg">
        <img src="./logo.png" alt="Barber Hood" className="mx-auto mb-4 h-14 w-auto mix-blend-lighten" />
        <h1 className="text-center text-2xl font-semibold tracking-tight">Reservá tu turno</h1>
        <p className="mb-6 text-center text-sm text-muted">Elegí servicio, día y horario.</p>
        <div className="rounded-3xl border border-line bg-surface/80 p-5 backdrop-blur sm:p-6">
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Tu nombre">{(id) => <Input id={id} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Field>
            <Field label="Tu teléfono">{(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} />}</Field>
          </div>
          <p className="mb-2 text-xs font-medium text-muted">Servicios</p>
          <div className="mb-1 flex flex-wrap gap-2">
            {servicios.map((s) => <Chip key={s.id} on={sel.includes(s.id)} onClick={() => setSel((x) => (x.includes(s.id) ? x.filter((i) => i != s.id) : [...x, s.id]))}>{s.nombre} · {L.formatoPesos(s.precio)}</Chip>)}
          </div>
          <p className="mb-3.5 h-4 text-xs text-accent">{ds.length ? `Duración: ${dur} min` : ''}</p>
          <Field label="Barbero">{(id) => <Select id={id} value={barbero} onChange={(e) => setBarbero(e.target.value)}><option value="">Cualquier barbero</option>{barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</Select>}</Field>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Día">{(id) => <Input id={id} type="date" min={L.today()} value={fecha} onChange={(e) => setFecha(e.target.value)} />}</Field>
            <Field label="Horario">{(id) => <Select id={id} value={hora} onChange={(e) => setHora(e.target.value)}>{libres.length ? libres.map((h) => <option key={h}>{h}</option>) : <option value="">Sin horarios</option>}</Select>}</Field>
          </div>
          <Field label="Comentario (opcional)">{(id) => <Textarea id={id} value={notas} onChange={(e) => setNotas(e.target.value)} />}</Field>
          {error && <p role="alert" className="mb-3 rounded-xl bg-ko/10 px-3 py-2 text-sm text-ko">{error}</p>}
          <Button className="h-12 w-full" disabled={enviando} onClick={enviar}>{enviando && <Loader2 size={16} className="animate-spin" />} Solicitar turno</Button>
          <p className="mt-3 text-center text-xs text-subtle">Tu turno queda pendiente hasta que la barbería lo confirme.</p>
        </div>
      </div>
    </div>
  );
}
