import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { AppData, Turno } from '@/domain/model';
import * as L from '@/domain/logic';
import * as T from '@/domain/turnos';
import { sb } from '@/lib/supabase';
import { usePeriod } from '@/state/period';
import { useAccion } from '@/state/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, cx } from '@/components/ui';
import { Select } from '@/components/ui/form';
import { TurnoRow } from './TurnoRow';
import { TurnoDetalle } from './TurnoDetalle';
import { NuevoTurno } from './NuevoTurno';

const VISTAS: [T.VistaTurnos, string][] = [['dia', 'Día'], ['sem', 'Semana'], ['mes', 'Mes']];
let vistaGuardada: T.VistaTurnos = 'dia'; // se conserva al cambiar de sección, como S.tv
let barberoGuardado = '';

export function TurnosPage({ d, owner, me }: { d: AppData; owner: boolean; me: string | null }) {
  const [abierto, setAbierto] = useState<Turno | null>(null);
  const actual = abierto && (d.turnos.find((t) => t.id == abierto.id) ?? d.turnosBaja.find((t) => t.id == abierto.id) ?? null);
  const detalle = actual && <TurnoDetalle key={actual.id} d={d} t={actual} owner={owner} me={me} onClose={() => setAbierto(null)} />;
  if (!owner && me) return <><TurnosBarbero d={d} me={me} onOpen={setAbierto} />{detalle}</>;
  return <><TurnosDueno d={d} onOpen={setAbierto} />{detalle}</>;
}

function TurnosDueno({ d, onOpen }: { d: AppData; onOpen(t: Turno): void }) {
  const { ref, setRef } = usePeriod();
  const [vista, setVistaS] = useState(vistaGuardada);
  const [tb, setTbS] = useState(barberoGuardado);
  const [nuevo, setNuevo] = useState(false);
  const setVista = (v: T.VistaTurnos) => { vistaGuardada = v; setVistaS(v); };
  const setTb = (v: string) => { barberoGuardado = v; setTbS(v); };
  const [a, b] = T.rangoAgenda(vista, ref), grupos = T.agenda(d, vista, ref, tb), pen = T.solicitudesPendientes(d), bajas = T.turnosDeBaja(d);
  const mover = (n: number) => {
    const x = new Date(ref + 'T00:00:00');
    if (vista == 'sem') x.setDate(x.getDate() + 7 * n); else if (vista == 'mes') x.setMonth(x.getMonth() + n); else x.setDate(x.getDate() + n);
    setRef(L.isoLocal(x));
  };
  const titulo = vista == 'sem' ? `${a.slice(8)}/${a.slice(5, 7)} → ${b.slice(8)}/${b.slice(5, 7)}` : new Date(ref + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Turnos" subtitle="Agenda de la barbería" actions={<Button onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo turno</Button>} />
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 lg:flex-row lg:items-center">
        <div role="tablist" aria-label="Vista" className="grid grid-cols-3 gap-1 rounded-xl bg-bg p-1 lg:w-64">
          {VISTAS.map(([k, l]) => <button key={k} role="tab" aria-selected={vista == k} onClick={() => setVista(k)} className={cx('min-h-9 rounded-lg text-sm font-medium', vista == k ? 'bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-muted hover:text-fg')}>{l}</button>)}
        </div>
        <div className="flex flex-1 items-center gap-1">
          <button onClick={() => mover(-1)} aria-label="Anterior" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"><ChevronLeft size={18} /></button>
          <label className="relative flex-1 text-center text-sm first-letter:uppercase">{titulo}<input type="date" aria-label="Fecha" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" /></label>
          <button onClick={() => mover(1)} aria-label="Siguiente" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2"><ChevronRight size={18} /></button>
        </div>
        <Select aria-label="Filtrar por barbero" value={tb} onChange={(e) => setTb(e.target.value)} className="h-10 lg:w-56">
          <option value="">Todos los barberos</option>
          {d.barberos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="space-y-4 lg:col-span-2 lg:space-y-6">
          {vista == 'mes' && <Mes d={d} ref_={ref} tb={tb} onDia={(f) => { setRef(f); setVista('dia'); }} />}
          <Card title={`Agenda ${vista == 'sem' ? a.slice(5) + ' → ' + b.slice(5) : ref.slice(5)}`}>
            {grupos.length ? grupos.map((g) => (
              <div key={g.clave} className="mb-3 last:mb-0">
                <p className="mb-1 mt-2 text-xs font-medium uppercase tracking-wider text-accent first:mt-0">{g.titulo}</p>
                {g.turnos.map((t) => <TurnoRow key={t.id} d={d} t={t} onOpen={onOpen} conFecha={vista == 'sem'} />)}
              </div>
            )) : <Empty>Sin turnos.</Empty>}
          </Card>
        </div>
        <div className="space-y-4 lg:space-y-6">
          {pen.length > 0 && <Card title={`Solicitudes pendientes (${pen.length})`}>{pen.map((t) => <TurnoRow key={t.id} d={d} t={t} onOpen={onOpen} />)}</Card>}
          <Card title="Cancelados y ausentes">{bajas.length ? bajas.map((t) => <TurnoRow key={t.id} d={d} t={t} onOpen={onOpen} />) : <Empty>Sin cancelaciones.</Empty>}</Card>
        </div>
      </div>
      {nuevo && <NuevoTurno d={d} onClose={() => setNuevo(false)} />}
    </div>
  );
}

function Mes({ d, ref_, tb, onDia }: { d: AppData; ref_: string; tb: string; onDia(f: string): void }) {
  const m = T.conteoMes(d, ref_, tb), hoy = L.today();
  return (
    <Card>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x, i) => <span key={i} className="pb-1 text-xs text-subtle">{x}</span>)}
        {Array.from({ length: m.offset }, (_, i) => <span key={'o' + i} />)}
        {m.dias.map((x) => (
          <button key={x.fecha} onClick={() => onDia(x.fecha)} aria-label={`${x.dia}: ${x.turnos} turnos`}
            className={cx('relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl border text-sm transition sm:aspect-auto sm:h-16',
              x.fecha == ref_ ? 'border-accent bg-accent text-white' : x.fecha == hoy ? 'border-accent/60' : 'border-line bg-bg hover:border-line-strong')}>
            <span className="num">{x.dia}</span>
            {x.turnos > 0 && <span className={cx('num mt-0.5 rounded-full px-1.5 text-[10px] font-semibold', x.fecha == ref_ ? 'bg-white/20' : 'bg-accent/15 text-accent')}>{x.turnos}</span>}
          </button>
        ))}
      </div>
    </Card>
  );
}

/** Vista del barbero (turMe): sus turnos y los libres para asignarse. */
function TurnosBarbero({ d, me, onOpen }: { d: AppData; me: string; onOpen(t: Turno): void }) {
  const lista = T.turnosDelBarbero(d, me);
  const { run, ocupado } = useAccion();
  const asignar = (t: Turno) => run(async () => { await T.asignarme(sb, T.agendaCtx(d), t.id, me); return 'Turno asignado'; }, ['turnos']);
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Turnos" subtitle="Tus turnos y los disponibles para asignarte" />
      <Card title="Turnos disponibles y míos">
        {lista.length ? lista.map((t) => (
          <TurnoRow key={t.id} d={d} t={t} onOpen={onOpen} accion={
            t.barberoId
              ? <Button className="min-h-9 shrink-0 px-3 text-xs" onClick={() => onOpen(t)}>Cobrar</Button>
              : <Button variant="outline" className="min-h-9 shrink-0 px-3 text-xs" disabled={ocupado} onClick={() => asignar(t)}>Asignarme</Button>
          } />
        )) : <Empty>No hay turnos.</Empty>}
      </Card>
    </div>
  );
}
