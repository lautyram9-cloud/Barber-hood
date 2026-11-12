import { useState } from 'react';
import { MessageCircle, Phone, Search } from 'lucide-react';
import type { AppData, Cliente } from '@/domain/model';
import * as L from '@/domain/logic';
import * as C from '@/domain/clientes';
import { sb } from '@/lib/supabase';
import { useAccion } from '@/state/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, Kpi, Row } from '@/components/ui';
import { Chip, Field, Sheet, Textarea } from '@/components/ui/form';
import { EstadoTurno } from '@/features/turnos/TurnoRow';

const fmt = L.formatoPesos;
let busquedaGuardada = '', filtroGuardado: C.FiltroClientes = ''; // se conservan al cambiar de sección (S.cq / S.cf)

export function ClientesPage({ d }: { d: AppData }) {
  const [q, setQ] = useState(busquedaGuardada);
  const [f, setF] = useState<C.FiltroClientes>(filtroGuardado);
  const [abierto, setAbierto] = useState<string | null>(null);
  const lista = C.listaClientes(d, q, f), cliente = abierto ? d.clientes.find((c) => c.id == abierto) : undefined;

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Clientes" subtitle={`${d.clientes.length} clientes`} />
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
        <label className="relative block">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input type="search" aria-label="Buscar por nombre o teléfono" placeholder="Buscar por nombre o teléfono" value={q}
            onChange={(e) => { busquedaGuardada = e.target.value; setQ(e.target.value); }}
            className="h-12 w-full rounded-xl border border-line bg-bg pl-11 pr-3.5 text-fg outline-none placeholder:text-subtle focus:border-accent focus:ring-4 focus:ring-accent/20" />
        </label>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtro">
          {C.FILTROS.map(([k, l]) => <Chip key={k || 'todos'} on={f == k} className="shrink-0" onClick={() => { filtroGuardado = k; setF(k); }}>{l}</Chip>)}
        </div>
      </div>
      <Card>
        {lista.length ? lista.map((s) => (
          <button key={s.cliente.id} onClick={() => setAbierto(s.cliente.id)} className="block w-full text-left">
            <Row left={s.cliente.nombre} sub={`${s.cliente.telefono || 'sin teléfono'} · ${s.visitas} visitas${s.dias != null ? ' · hace ' + s.dias + ' d' : ''}`} right={fmt(s.total)} />
          </button>
        )) : <Empty>Sin clientes.</Empty>}
      </Card>
      {cliente && <ClienteFicha key={cliente.id} d={d} c={cliente} onClose={() => setAbierto(null)} />}
    </div>
  );
}

function ClienteFicha({ d, c, onClose }: { d: AppData; c: Cliente; onClose(): void }) {
  const s = L.statsCliente(d, c), prox = C.proximosTurnos(d, c), hist = C.historialCliente(d, c);
  const [pref, setPref] = useState(c.preferencias), [obs, setObs] = useState(c.observaciones);
  const { run, ocupado } = useAccion();
  const guardar = async () => { if (await run(async () => { await C.guardarCliente(sb, c.id, pref, obs); return 'Cliente guardado'; }, ['clientes'])) onClose(); };

  return (
    <Sheet title={c.nombre} onClose={onClose} footer={<Button className="h-12 w-full" disabled={ocupado} onClick={guardar}>Guardar</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{c.telefono || 'sin teléfono'}</span>
        {c.telefono && <a href={`tel:${c.telefono}`} className="inline-flex items-center gap-1 text-accent"><Phone size={14} /> Llamar</a>}
        <span className="text-subtle">· Registrado {c.creado.slice(0, 10)}</span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <Kpi label="Total gastado" value={fmt(s.total)} />
        <Kpi label="Visitas" value={s.visitas} />
        <Kpi label="Última visita" value={s.ultima ? s.ultima.slice(5) : '—'} />
      </div>
      {s.frecuencia ? <p className="mb-2 text-xs text-muted">Viene cada {s.frecuencia} días en promedio</p> : null}
      {C.ofrecerReactivar(c, s.dias) && (
        <a href={L.linkWhatsApp(c.telefono, C.mensajeReactivar(c))} target="_blank" rel="noopener" className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-ok/10 px-4 text-sm font-medium text-ok"><MessageCircle size={16} /> Reactivar por WhatsApp</a>
      )}
      <div className="mt-3">
        <Field label="Preferencias">{(id) => <Textarea id={id} value={pref} placeholder="Ej. degradé 2, barba perfilada" onChange={(e) => setPref(e.target.value)} />}</Field>
        <Field label="Observaciones">{(id) => <Textarea id={id} value={obs} onChange={(e) => setObs(e.target.value)} />}</Field>
      </div>
      <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wider text-subtle">Próximos turnos</h3>
      {prox.length ? prox.map((t) => <Row key={t.id} left={`${t.fecha.slice(5)} ${t.hora} · ${t.servicios}`} right={<EstadoTurno e={t.estado} />} />) : <Empty>Ninguno.</Empty>}
      <h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wider text-subtle">Historial de servicios</h3>
      {hist.length ? hist.map((m) => <Row key={m.id} left={`${m.fecha.slice(5)} · ${m.concepto}`} sub={L.nombreBarbero(d, m.barberoId)} right={fmt(m.monto)} />) : <Empty>Sin servicios.</Empty>}
    </Sheet>
  );
}
