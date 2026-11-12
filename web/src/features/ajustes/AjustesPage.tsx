import { useEffect, useState } from 'react';
import { Download, History, LogOut, Trash2 } from 'lucide-react';
import type { AppData, Barbero } from '@/domain/model';
import * as L from '@/domain/logic';
import * as A from '@/domain/ajustes';
import { fetchAll, sb } from '@/lib/supabase';
import { guardarArchivo } from '@/lib/files';
import { useAccion, useFeedback } from '@/state/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, Row } from '@/components/ui';
import { Field, Input, Select, Sheet } from '@/components/ui/form';
import type { TableName } from '@/lib/database.types';

const fmt = L.formatoPesos;
const instalada = () => (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia?.('(display-mode: standalone)').matches;

/** Ajustes (V.aj): cuenta, copias, disponibilidad, barberos/comisiones y servicios. */
export function AjustesPage({ d, email, owner, onSignOut }: { d: AppData; email: string; owner: boolean; onSignOut(): void }) {
  const [aud, setAud] = useState(false);
  const { toast } = useFeedback();
  const backup = async () => {
    try { const r = await A.generarRespaldo((t, o) => fetchAll(t as TableName, o)); await guardarArchivo(r.nombre, 'application/json', r.texto, false); toast('Copia lista'); }
    catch { toast('No se pudo generar la copia'); }
  };
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Ajustes" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Cuenta">
          <p className="text-sm">{email}</p><p className="mb-3 text-xs text-muted">{owner ? 'Dueño' : 'Barbero'}</p>
          {!instalada() && <p className="mb-3 text-xs text-subtle">Para instalarla: Compartir → Agregar a pantalla de inicio.</p>}
          <Button variant="outline" onClick={onSignOut}><LogOut size={16} /> Cerrar sesión</Button>
        </Card>
        {owner && (
          <Card title="Copias y control">
            <div className="grid gap-2">
              <Button variant="outline" onClick={backup}><Download size={16} /> Descargar copia de seguridad</Button>
              <Button variant="outline" onClick={() => setAud(true)}><History size={16} /> Historial de cambios</Button>
            </div>
            <p className="mt-3 text-xs text-subtle">La copia incluye todos los datos en un archivo. Guardala en un lugar seguro.</p>
          </Card>
        )}
      </div>
      <Disponibilidad d={d} />
      <Barberos d={d} />
      <Servicios d={d} />
      {aud && <Auditoria d={d} onClose={() => setAud(false)} />}
    </div>
  );
}

function Disponibilidad({ d }: { d: AppData }) {
  const [f, setF] = useState(() => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((x) => { const t = A.textoTramos(d.horario, x); return [x, { abierto: !!t, tramos: t }]; })) as Record<number, { abierto: boolean; tramos: string }>);
  const { run, ocupado } = useAccion(), { toast } = useFeedback();
  const guardar = () => { const r = A.filasHorario(f); if ('error' in r) return toast(r.error); run(async () => { await A.guardarHorarios(sb, r.filas); return 'Horarios guardados'; }, ['horarios']); };
  return (
    <Card title="Disponibilidad">
      <p className="mb-3 text-xs text-muted">Podés poner varios tramos por día separados por coma (ej. 10:00-13:00, 15:00-20:00). Los minutos de cada turno se definen por barbero, abajo.</p>
      {A.ORDEN_DIAS.map((x) => (
        <div key={x} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
          <label className="flex w-20 shrink-0 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={f[x].abierto} onChange={(e) => setF({ ...f, [x]: { ...f[x], abierto: e.target.checked } })} /> {A.DIAS[x]}</label>
          <Input aria-label={`Horario del ${A.DIAS[x]}`} placeholder="10:00-13:00, 15:00-20:00" className="h-10" value={f[x].tramos} onChange={(e) => setF({ ...f, [x]: { ...f[x], tramos: e.target.value } })} />
        </div>
      ))}
      <Button className="mt-3 w-full" disabled={ocupado} onClick={guardar}>Guardar horarios</Button>
    </Card>
  );
}

function Barberos({ d }: { d: AppData }) {
  const [n, setN] = useState(''), [m, setM] = useState(''), [e, setE] = useState('');
  const { run, ocupado } = useAccion();
  const agregar = () => { if (!n.trim()) return; run(async () => { await A.agregarBarbero(sb, n, m, e); setN(''); setM(''); setE(''); return 'Barbero agregado'; }, ['barberos']); };
  return (
    <Card title="Barberos y comisión">
      <p className="mb-3 text-xs text-muted">Prioridad: excepción del barbero &gt; % general del barbero &gt; % del servicio o producto.</p>
      {d.barberos.map((b) => <FichaBarbero key={b.id} d={d} b={b} />)}
      <div className="mt-4 grid gap-x-3 sm:grid-cols-3">
        <Field label="Nombre del barbero">{(id) => <Input id={id} value={n} onChange={(x) => setN(x.target.value)} />}</Field>
        <Field label="Minutos por turno">{(id) => <Input id={id} type="number" placeholder="30" value={m} onChange={(x) => setM(x.target.value)} />}</Field>
        <Field label="Email de su usuario (opcional)">{(id) => <Input id={id} type="email" value={e} onChange={(x) => setE(x.target.value)} />}</Field>
      </div>
      <Button className="w-full" disabled={ocupado} onClick={agregar}>Agregar barbero</Button>
    </Card>
  );
}

function FichaBarbero({ d, b }: { d: AppData; b: Barbero }) {
  const [pct, setPct] = useState(b.comisionPct == null ? '' : String(b.comisionPct));
  const [item, setItem] = useState(d.servicios[0] ? 's:' + d.servicios[0].id : d.productos[0] ? 'p:' + d.productos[0].id : ''), [xp, setXp] = useState('');
  const { run, ocupado } = useAccion(), { toast, confirmar } = useFeedback();
  return (
    <div className="border-t border-line py-4 first:border-t-0">
      <div className="mb-3 flex items-center justify-between">
        <div><p className="text-sm font-medium">{b.nombre}</p><p className="text-xs text-muted">{b.slotMin || 30} min · {b.userId ? 'usuario vinculado' : 'sin usuario'}</p></div>
        <button aria-label={`Quitar a ${b.nombre}`} className="rounded-lg p-2 text-subtle hover:text-ko" onClick={async () => {
          if (await confirmar({ titulo: `¿Quitar a ${b.nombre}?`, texto: 'Deja de aparecer en turnos y ranking. Su historial se conserva.', accion: 'Quitar', peligro: true })) run(async () => { await A.quitarBarbero(sb, b.id); }, ['barberos']);
        }}><Trash2 size={16} /></button>
      </div>
      <div className="flex gap-2">
        <Input aria-label={`% general de ${b.nombre}`} type="number" placeholder="% general (vacío = el del servicio)" className="h-10" value={pct} onChange={(e) => setPct(e.target.value)} />
        <Button variant="outline" className="min-h-10 shrink-0" disabled={ocupado} onClick={() => run(async () => { await A.guardarPctGeneral(sb, b.id, pct); return 'Comisión general guardada'; }, ['barberos'])}>Guardar %</Button>
      </div>
      {d.comisionesBarbero.filter((x) => x.barberoId == b.id).map((x) => (
        <Row key={x.id} left={<span className="text-xs">{A.nombreItem(d, x)}: {x.pct}%</span>} right={<button aria-label="Quitar excepción" className="p-1 text-subtle hover:text-ko" onClick={() => run(async () => { await A.quitarExcepcion(sb, x.id); }, ['comisiones_barbero'])}><Trash2 size={14} /></button>} />
      ))}
      <div className="mt-2 grid grid-cols-[1fr_5rem_auto] gap-2">
        <Select aria-label={`Excepción de ${b.nombre}`} className="h-10" value={item} onChange={(e) => setItem(e.target.value)}>
          <optgroup label="Servicios">{d.servicios.map((s) => <option key={s.id} value={'s:' + s.id}>{s.nombre}</option>)}</optgroup>
          <optgroup label="Productos">{d.productos.map((p) => <option key={p.id} value={'p:' + p.id}>{p.nombre}</option>)}</optgroup>
        </Select>
        <Input aria-label="% de la excepción" type="number" placeholder="%" className="h-10" value={xp} onChange={(e) => setXp(e.target.value)} />
        <Button variant="outline" className="min-h-10" disabled={ocupado} onClick={() => { const er = A.validarExcepcion(xp); if (er) return toast(er); run(async () => { await A.agregarExcepcion(sb, b.id, item, xp); setXp(''); return 'Excepción agregada'; }, ['comisiones_barbero']); }}>+ Excepción</Button>
      </div>
    </div>
  );
}

function Servicios({ d }: { d: AppData }) {
  const [x, setX] = useState({ n: '', p: '', c: '', du: '' });
  const { run, ocupado } = useAccion(), { confirmar } = useFeedback();
  const agregar = () => { if (!x.n.trim()) return; run(async () => { await A.agregarServicio(sb, x.n, x.p, x.c, x.du); setX({ n: '', p: '', c: '', du: '' }); return 'Servicio agregado'; }, ['servicios']); };
  return (
    <Card title="Servicios y comisión">
      {d.servicios.map((s) => (
        <Row key={s.id} left={s.nombre} sub={`${fmt(s.precio)} · comisión ${s.comisionPct}% · ${s.duracionMin ? s.duracionMin + ' min' : 'duración según barbero'}`} right={
          <button aria-label={`Quitar ${s.nombre}`} className="p-2 text-subtle hover:text-ko" onClick={async () => { if (await confirmar({ titulo: `¿Quitar el servicio ${s.nombre}?`, accion: 'Quitar', peligro: true })) run(async () => { await A.quitarServicio(sb, s.id); }, ['servicios']); }}><Trash2 size={16} /></button>
        } />
      ))}
      <div className="mt-4 grid grid-cols-2 gap-x-3 sm:grid-cols-4">
        <Field label="Servicio">{(id) => <Input id={id} placeholder="Ej. Corte" value={x.n} onChange={(e) => setX({ ...x, n: e.target.value })} />}</Field>
        <Field label="Precio">{(id) => <Input id={id} type="number" value={x.p} onChange={(e) => setX({ ...x, p: e.target.value })} />}</Field>
        <Field label="% comisión">{(id) => <Input id={id} type="number" value={x.c} onChange={(e) => setX({ ...x, c: e.target.value })} />}</Field>
        <Field label="Duración (min, opcional)">{(id) => <Input id={id} type="number" value={x.du} onChange={(e) => setX({ ...x, du: e.target.value })} />}</Field>
      </div>
      <Button className="w-full" disabled={ocupado} onClick={agregar}>Agregar servicio</Button>
    </Card>
  );
}

function Auditoria({ d, onClose }: { d: AppData; onClose(): void }) {
  const [filas, setFilas] = useState<A.FilaAuditoria[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { sb.from('audit_logs').select('*').order('fecha', { ascending: false }).limit(60).then(({ data, error: e }) => (e ? setError(true) : setFilas((data ?? []) as A.FilaAuditoria[]))); }, []);
  return (
    <Sheet title="Historial de cambios" onClose={onClose}>
      {error ? <Empty>No se pudo cargar el historial.</Empty> : !filas ? <Empty>Cargando…</Empty> : filas.length ? filas.map((x, i) => { const c = A.describirCambio(d, x); return <Row key={i} left={c.titulo} sub={c.detalle} />; }) : <Empty>Sin cambios registrados.</Empty>}
    </Sheet>
  );
}
