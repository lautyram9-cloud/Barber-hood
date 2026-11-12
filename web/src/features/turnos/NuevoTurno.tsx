import { useMemo, useState } from 'react';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as T from '@/domain/turnos';
import { sb } from '@/lib/supabase';
import { useAccion, useFeedback } from '@/state/feedback';
import { Button } from '@/components/ui';
import { Chip, Field, Input, Select, Sheet, Textarea } from '@/components/ui/form';

/** Nuevo turno (ntur + addtur): varios servicios, horario libre o manual, cliente con autocompletado. */
export function NuevoTurno({ d, onClose }: { d: AppData; onClose(): void }) {
  const c = useMemo(() => T.agendaCtx(d), [d]);
  const { run, ocupado } = useAccion();
  const { toast } = useFeedback();
  const [fecha, setFecha] = useState(() => L.proximoDiaAbierto(c));
  const [barbero, setBarbero] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [horaLista, setHoraLista] = useState('');
  const [horaManual, setHoraManual] = useState('');
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const servicios = sel.map((id) => d.servicios.find((s) => s.id == id)!).filter(Boolean);
  const libres = L.horariosLibres(c, fecha, barbero, servicios);
  const hora = libres.includes(horaLista) ? horaLista : libres[0] ?? '';

  const elegirCliente = (v: string) => {
    const m = d.clientes.find((x) => x.nombre + ' · ' + x.telefono == v);
    if (m) { setCliente(m.nombre); setTelefono(m.telefono); } else setCliente(v);
  };
  async function guardar() {
    const x: T.NuevoTurno = { fecha, horaLista: hora, horaManual, barbero, servicios, cliente, telefono, notas };
    const err = T.validarNuevoTurno(x);
    if (err) return toast(err);
    if (await run(async () => { await T.crearTurno(sb, c, x); return 'Turno reservado'; }, ['turnos', 'turno_items', 'clientes'])) onClose();
  }

  return (
    <Sheet title="Nuevo turno" onClose={onClose} footer={<Button className="h-12 w-full" disabled={ocupado} onClick={guardar}>Reservar turno</Button>}>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Fecha">{(id) => <Input id={id} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}</Field>
        <Field label="Barbero">{(id) => (
          <Select id={id} value={barbero} onChange={(e) => setBarbero(e.target.value)}>
            <option value="">Sin barbero (el primero libre)</option>
            {d.barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </Select>
        )}</Field>
      </div>
      <p className="mb-2 text-xs font-medium text-muted">Servicios (podés elegir varios)</p>
      <div className="mb-1 flex flex-wrap gap-2">
        {d.servicios.map((s) => <Chip key={s.id} on={sel.includes(s.id)} onClick={() => setSel((x) => (x.includes(s.id) ? x.filter((i) => i != s.id) : [...x, s.id]))}>{s.nombre}</Chip>)}
      </div>
      <p className="mb-3.5 h-4 text-xs text-accent">{servicios.length ? `Duración: ${T.duracionServicios(c, servicios, barbero)} min` : ''}</p>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Horario libre">{(id) => <Select id={id} value={hora} onChange={(e) => setHoraLista(e.target.value)} disabled={!!horaManual}>{libres.length ? libres.map((h) => <option key={h}>{h}</option>) : <option value="">Sin horarios</option>}</Select>}</Field>
        <Field label="¿Otra hora? Elegila a mano">{(id) => <Input id={id} type="time" value={horaManual} onChange={(e) => setHoraManual(e.target.value)} />}</Field>
      </div>
      <Field label="Cliente">{(id) => (
        <>
          <Input id={id} list="bh-clientes" autoComplete="off" value={cliente} onChange={(e) => elegirCliente(e.target.value)} placeholder="Nombre" />
          <datalist id="bh-clientes">{d.clientes.map((x) => <option key={x.id} value={x.nombre + ' · ' + x.telefono} />)}</datalist>
        </>
      )}</Field>
      <Field label="Teléfono">{(id) => <Input id={id} type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />}</Field>
      <Field label="Notas internas (opcional)">{(id) => <Textarea id={id} value={notas} onChange={(e) => setNotas(e.target.value)} />}</Field>
    </Sheet>
  );
}
