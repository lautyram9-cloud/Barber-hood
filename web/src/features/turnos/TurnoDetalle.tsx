import { useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { AppData, Turno } from '@/domain/model';
import * as L from '@/domain/logic';
import * as T from '@/domain/turnos';
import { sb } from '@/lib/supabase';
import { useAccion, useFeedback } from '@/state/feedback';
import { Button } from '@/components/ui';
import { Field, Input, Select, Sheet, Textarea } from '@/components/ui/form';
import { EstadoTurno } from './TurnoRow';

const MEDIOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta']];
const TABLAS = ['turnos', 'turno_items', 'ingresos', 'clientes'] as const;

/** Detalle del turno (tdet): notas, recordatorio, confirmar/cobrar/ausente/cancelar y reprogramar. */
export function TurnoDetalle({ d, t, owner, me, onClose }: { d: AppData; t: Turno; owner: boolean; me: string | null; onClose(): void }) {
  const { run, ocupado } = useAccion();
  const { confirmar, toast } = useFeedback();
  const [notas, setNotas] = useState(t.notas);
  const [medio, setMedio] = useState('efectivo');
  const [rd, setRd] = useState(t.fecha);
  const [rb, setRb] = useState(t.barberoId); // igual que la versión estable: arranca con el barbero actual
  const c = useMemo(() => T.agendaCtx(d), [d]);
  const libres = useMemo(() => L.horariosLibres(c, rd, rb, [{ duracionMin: t.duracionMin }]), [c, rd, rb, t.duracionMin]);
  const [rh, setRh] = useState('');
  const hora = libres.includes(rh) ? rh : libres[0] ?? '';
  const ab = T.puedeGestionar(t, owner, me);
  const barberos = owner ? [['', 'Sin barbero'], ...d.barberos.map((b) => [b.id, b.nombre])] : [...(t.barberoId ? [] : [['', 'Sin asignar']]), ...d.barberos.filter((b) => b.id == me).map((b) => [b.id, b.nombre])];

  const hacer = async (fn: () => Promise<unknown>, msg: string, cerrar = true) => { if (await run(async () => { await fn(); return msg; }, [...TABLAS]) && cerrar) onClose(); };
  const estado = async (e: string) => {
    if (e != 'confirmado' && !(await confirmar({ titulo: e == 'ausente' ? '¿Marcar como ausente?' : t.estado == 'pendiente' ? '¿Rechazar la solicitud?' : '¿Cancelar el turno?', texto: `${t.cliente} · ${t.fecha.slice(5)} ${t.hora}`, accion: e == 'ausente' ? 'Marcar ausente' : t.estado == 'pendiente' ? 'Rechazar' : 'Cancelar turno', peligro: true }))) return;
    hacer(() => T.cambiarEstado(sb, t.id, e, notas), T.textoEstado(e));
  };
  const reprog = () => { if (!rd || !hora) return toast('Elegí fecha y horario'); hacer(() => T.reprogramar(sb, t.id, rd, hora, rb), 'Turno reprogramado'); };

  return (
    <Sheet title={t.cliente} onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <EstadoTurno e={t.estado} />
        <span className="num">{t.fecha} {t.hora}</span>· <span>{t.duracionMin} min</span>· <span>{L.nombreBarbero(d, t.barberoId) || 'Sin asignar'}</span>
      </div>
      <p className="mb-4 text-sm">{t.servicios || 'Sin servicio'}</p>

      <Field label="Notas internas">{(id) => <Textarea id={id} value={notas} onChange={(e) => setNotas(e.target.value)} />}</Field>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-10" disabled={ocupado} onClick={() => hacer(() => T.guardarNota(sb, t.id, notas), 'Nota guardada', false)}>Guardar nota</Button>
        {t.telefono && ab && (
          <a href={L.linkWhatsApp(t.telefono, T.mensajeRecordatorio(t))} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-ok/10 px-4 text-sm font-medium text-ok"><MessageCircle size={16} /> Recordar por WhatsApp</a>
        )}
      </div>

      {ab && (
        <>
          <div className="rounded-2xl border border-line bg-bg/60 p-4">
            <Field label="Medio de pago">{(id) => <Select id={id} value={medio} onChange={(e) => setMedio(e.target.value)}>{MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <div className="grid grid-cols-2 gap-2">
              <Button className="col-span-2 h-12" disabled={ocupado} onClick={() => hacer(() => T.cobrarTurno(sb, t.id, medio), 'Cobrado')}>Cobrar</Button>
              {t.estado == 'pendiente' && <Button variant="outline" className="col-span-2" disabled={ocupado} onClick={() => estado('confirmado')}>Confirmar</Button>}
              <Button variant="outline" disabled={ocupado} onClick={() => estado('ausente')}>Ausente</Button>
              <Button variant="outline" className="text-ko" disabled={ocupado} onClick={() => estado('cancelado')}>{t.estado == 'pendiente' ? 'Rechazar' : 'Cancelar'}</Button>
            </div>
          </div>
          <h3 className="mb-3 mt-6 text-xs font-medium uppercase tracking-wider text-subtle">Reprogramar</h3>
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Field label="Fecha">{(id) => <Input id={id} type="date" value={rd} onChange={(e) => setRd(e.target.value)} />}</Field>
            <Field label="Barbero">{(id) => <Select id={id} value={rb} onChange={(e) => setRb(e.target.value)}>{barberos.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          </div>
          <Field label="Horario">{(id) => <Select id={id} value={hora} onChange={(e) => setRh(e.target.value)}>{libres.length ? libres.map((h) => <option key={h}>{h}</option>) : <option value="">Sin horarios</option>}</Select>}</Field>
          <Button variant="outline" className="w-full" disabled={ocupado} onClick={reprog}>Reprogramar</Button>
        </>
      )}
    </Sheet>
  );
}
