import { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { AppData, Liquidacion } from '@/domain/model';
import * as L from '@/domain/logic';
import * as C from '@/domain/comisiones';
import { comisionesPeriodo, MEDIOS } from '@/domain/movimientos';
import { sb } from '@/lib/supabase';
import { usePeriod } from '@/state/period';
import { useAccion, useFeedback } from '@/state/feedback';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, Row } from '@/components/ui';
import { Field, Input, Select, Sheet } from '@/components/ui/form';

const fmt = L.formatoPesos;
const TABLAS = ['liquidaciones', 'adelantos', 'ingresos'] as const;

/** Comisiones del dueño (V.com): por período, liquidar, adelantos e historial con comprobante. */
export function ComisionesPage({ d }: { d: AppData }) {
  const { per, ref } = usePeriod();
  const [a, b] = L.rango(per, ref), lista = comisionesPeriodo(d, a, b), total = lista.reduce((t, x) => t + x.comision, 0);
  const [liquidando, setLiquidando] = useState<string | null>(null), [viendo, setViendo] = useState<Liquidacion | null>(null);
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Comisiones" subtitle="Liquidaciones y adelantos" />
      <PeriodBar />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Comisiones del período">
          {lista.length ? lista.map((x) => (
            <Row key={x.barbero.id} left={x.barbero.nombre} sub={`Serv. ${fmt(x.servicios)} · Prod. ${fmt(x.productos)} · pendiente total ${fmt(L.comisionPendiente(d, x.barbero.id))}`}
              right={<span className="flex items-center gap-3">{fmt(x.comision)}<Button className="min-h-9 px-3 text-xs" onClick={() => setLiquidando(x.barbero.id)}>Liquidar</Button></span>} />
          )) : <Empty>Cargá barberos en Ajustes.</Empty>}
          <Row left={<b>Total del período</b>} right={<b>{fmt(total)}</b>} />
        </Card>
        <Adelantos d={d} />
      </div>
      <Card title="Historial de liquidaciones">
        {C.ultimasLiquidaciones(d).length ? C.ultimasLiquidaciones(d).map((x) => (
          <button key={x.id} className="block w-full text-left" onClick={() => setViendo(x)}>
            <Row left={`${x.fecha.slice(5)} · ${L.nombreBarbero(d, x.barberoId)}`} sub={`${x.desde || ''} → ${x.hasta || ''}`} right={fmt(x.monto)} />
          </button>
        )) : <Empty>Sin liquidaciones.</Empty>}
      </Card>
      {liquidando && <Liquidar d={d} id={liquidando} onClose={() => setLiquidando(null)} />}
      {viendo && <Comprobante d={d} x={viendo} onClose={() => setViendo(null)} />}
    </div>
  );
}

function Liquidar({ d, id, onClose }: { d: AppData; id: string; onClose(): void }) {
  const { per, ref } = usePeriod();
  const p = C.previaLiquidacion(d, id, per, ref), nombre = L.nombreBarbero(d, id);
  const [medio, setMedio] = useState('efectivo');
  const { run, ocupado } = useAccion();
  const { confirmar } = useFeedback();
  const ok = async () => {
    if (!(await confirmar({ titulo: `¿Pagar ${fmt(p.aPagar)} a ${nombre}?`, texto: 'Las comisiones liquidadas ya no se pueden modificar ni anular.', accion: 'Confirmar pago' }))) return;
    if (await run(async () => { await C.liquidar(sb, id, p.hasta, medio); return 'Liquidación registrada'; }, [...TABLAS])) onClose();
  };
  return (
    <Sheet title={`Liquidar a ${nombre}`} onClose={onClose} footer={<Button className="h-12 w-full" disabled={ocupado} onClick={ok}>Confirmar pago</Button>}>
      <p className="mb-3 text-sm text-muted">Comisiones hasta el {p.hasta} ({p.operaciones} operaciones)</p>
      <Row left="Comisiones" right={fmt(p.comisiones)} />
      <Row left="Adelantos a descontar" right={<span className="text-ko">-{fmt(p.adelantos)}</span>} />
      <Row left={<b>A pagar</b>} right={<b className="text-lg">{fmt(p.aPagar)}</b>} />
      <Field label="Medio de pago" className="mt-4">{(fid) => <Select id={fid} value={medio} onChange={(e) => setMedio(e.target.value)}>{MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
    </Sheet>
  );
}

function Comprobante({ d, x, onClose }: { d: AppData; x: Liquidacion; onClose(): void }) {
  const { toast } = useFeedback();
  const compartir = async () => {
    const t = C.textoComprobante(d, x);
    try { if (navigator.share) await navigator.share({ title: 'Liquidación Barber Hood', text: t }); else { await navigator.clipboard.writeText(t); toast('Comprobante copiado'); } } catch { /* cancelado */ }
  };
  return (
    <Sheet title="Comprobante de liquidación" onClose={onClose} footer={<Button className="h-12 w-full" onClick={compartir}><Share2 size={16} /> Compartir comprobante</Button>}>
      <p className="mb-3 text-sm text-muted">{L.nombreBarbero(d, x.barberoId)} · pagado el {x.fecha} ({x.medioPago || 'efectivo'})<br />Período {x.desde || ''} → {x.hasta || ''}</p>
      {C.detalleLiquidacion(d, x).map((m) => <Row key={m.id} left={`${m.fecha.slice(5)} · ${m.concepto}`} sub={`${fmt(m.monto)} · ${C.pctComision(m.monto, m.comisionMonto as number)}%`} right={fmt(m.comisionMonto as number)} />)}
      <Row left="Comisiones" right={fmt(x.bruto)} />
      <Row left="Adelantos descontados" right={`-${fmt(x.bruto - x.monto)}`} />
      <Row left={<b>Pagado</b>} right={<b>{fmt(x.monto)}</b>} />
    </Sheet>
  );
}

function Adelantos({ d }: { d: AppData }) {
  const [b, setB] = useState(''), [m, setM] = useState(''), [n, setN] = useState(''), [md, setMd] = useState('efectivo');
  const { run, ocupado } = useAccion();
  const { toast } = useFeedback();
  const guardar = () => { const e = C.validarAdelanto(b, m); if (e) return toast(e); run(async () => { await C.registrarAdelanto(sb, b, m, n, md); setM(''); setN(''); return 'Adelanto registrado'; }, [...TABLAS]); };
  return (
    <Card title="Adelantos a barberos">
      {C.ultimosAdelantos(d).map((x) => <Row key={x.id} left={`${x.fecha.slice(5)} · ${L.nombreBarbero(d, x.barberoId)}`} sub={x.liquidacionId ? 'descontado en liquidación' : 'pendiente de descontar'} right={fmt(x.monto)} />)}
      <div className="mt-4 grid grid-cols-2 gap-x-3">
        <Field label="Barbero">{(id) => <Select id={id} value={b} onChange={(e) => setB(e.target.value)}><option value="">Elegí</option>{d.barberos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select>}</Field>
        <Field label="Monto">{(id) => <Input id={id} type="number" inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} />}</Field>
        <Field label="Nota (opcional)">{(id) => <Input id={id} value={n} onChange={(e) => setN(e.target.value)} />}</Field>
        <Field label="Medio de pago">{(id) => <Select id={id} value={md} onChange={(e) => setMd(e.target.value)}>{MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      </div>
      <Button variant="outline" className="w-full" disabled={ocupado} onClick={guardar}>Registrar adelanto</Button>
    </Card>
  );
}
