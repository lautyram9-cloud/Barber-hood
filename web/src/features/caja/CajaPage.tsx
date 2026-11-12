import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as K from '@/domain/caja';
import { sb } from '@/lib/supabase';
import { useCajaResumen } from '@/state/data';
import { useAccion, useFeedback } from '@/state/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, Kpi, Row, cx } from '@/components/ui';
import { Field, Input, Select } from '@/components/ui/form';

const fmt = L.formatoPesos;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const TABLAS = ['cajas', 'caja_mov'] as const;

/** Caja del dueño (V.cj): apertura, efectivo esperado, movimientos manuales y arqueo. */
export function CajaPage({ d }: { d: AppData }) {
  const c = d.cajaAbierta, { data: r } = useCajaResumen(c?.id, true), hist = K.historialCajas(d);
  const { run, ocupado } = useAccion();
  const { toast, confirmar } = useFeedback();
  const [saldo, setSaldo] = useState(''), [mt, setMt] = useState('ingreso'), [mc, setMc] = useState(''), [mm, setMm] = useState(''), [contado, setContado] = useState(''), [notas, setNotas] = useState('');
  const dif = r && contado !== '' ? (+contado || 0) - r.esperado : null;

  const abrir = () => run(async () => { await K.abrirCaja(sb, saldo); setSaldo(''); return 'Caja abierta'; }, [...TABLAS]);
  const mov = () => { const e = K.validarMovCaja(mc, mm, c?.id); if (e) return toast(e); run(async () => { await K.movimientoCaja(sb, c!.id, mt, mc, mm); setMc(''); setMm(''); return 'Registrado'; }, [...TABLAS]); };
  const cerrar = async () => {
    if (contado === '') return toast('Ingresá el efectivo contado');
    if (!(await confirmar({ titulo: '¿Cerrar la caja?', texto: `Contado ${fmt(+contado)}${dif != null ? ` · diferencia ${dif > 0 ? '+' : ''}${fmt(dif)}` : ''}. Una caja cerrada no se puede volver a cerrar.`, accion: 'Cerrar caja' }))) return;
    run(async () => { const x = await K.cerrarCaja(sb, c!.id, contado, notas); setContado(''); setNotas(''); return 'Caja cerrada. Diferencia: ' + (x > 0 ? '+' : '') + fmt(x); }, [...TABLAS]);
  };

  const historial = (
    <Card title="Historial de cierres">
      {hist.length ? hist.map((x) => (
        <Row key={x.id} left={dia(x.apertura_at)} sub={`Esperado ${fmt(+x.esperado!)} · contado ${fmt(+x.contado!)}`}
          right={<span className={cx(+x.diferencia! > 0 && 'text-ok', +x.diferencia! < 0 && 'text-ko')}>{+x.diferencia! > 0 ? '+' : ''}{fmt(+x.diferencia!)}</span>} />
      )) : <Empty>Sin cierres.</Empty>}
    </Card>
  );

  if (!c) return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Caja" subtitle="Control del efectivo del día" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Caja cerrada">
          <p className="mb-4 text-sm text-muted">Abrí la caja con el efectivo inicial para empezar a controlar el movimiento del día.</p>
          <Field label="Efectivo inicial en caja">{(id) => <Input id={id} type="number" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} />}</Field>
          <Button className="h-12 w-full" disabled={ocupado} onClick={abrir}><Unlock size={16} /> Abrir caja</Button>
        </Card>
        {historial}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Caja" subtitle={`Abierta desde las ${hora(c.apertura_at)}`} />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Esperado en caja" value={r ? fmt(r.esperado) : '—'} tone="accent" />
        <Kpi label="Pend. de cobro" value={r ? fmt(r.pendiente_cobro) : '—'} />
        <Kpi label="Abierta" value={hora(c.apertura_at)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Detalle del efectivo">
          {r ? <>
            {K.detalleEfectivo(r).map(([k, v, s]) => <Row key={k} left={k} right={<span className={s > 0 ? 'text-ok' : 'text-ko'}>{s > 0 ? '+' : '-'}{fmt(v)}</span>} />)}
            <p className="mt-3 text-xs text-subtle">Transferencias {fmt(r.ing_transferencia)} · Tarjetas {fmt(r.ing_tarjeta)} (no entran al efectivo)</p>
          </> : <Empty>Calculando…</Empty>}
        </Card>
        <div className="space-y-4 lg:space-y-6">
          <Card title="Cerrar caja (arqueo)">
            <Field label="Efectivo contado" hint={dif != null ? <span className={cx('font-medium', dif > 0 && 'text-ok', dif < 0 && 'text-ko')}>Diferencia: {dif > 0 ? '+' : ''}{fmt(dif)}</span> : undefined}>
              {(id) => <Input id={id} type="number" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} />}
            </Field>
            <Field label="Notas (opcional)">{(id) => <Input id={id} value={notas} onChange={(e) => setNotas(e.target.value)} />}</Field>
            <Button className="h-12 w-full" disabled={ocupado} onClick={cerrar}><Lock size={16} /> Cerrar caja</Button>
          </Card>
          <Card title="Movimiento manual">
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="Tipo">{(id) => <Select id={id} value={mt} onChange={(e) => setMt(e.target.value)}><option value="ingreso">Ingreso a caja</option><option value="egreso">Egreso de caja</option></Select>}</Field>
              <Field label="Monto">{(id) => <Input id={id} type="number" inputMode="decimal" value={mm} onChange={(e) => setMm(e.target.value)} />}</Field>
            </div>
            <Field label="Concepto">{(id) => <Input id={id} placeholder="Ej. cambio, retiro" value={mc} onChange={(e) => setMc(e.target.value)} />}</Field>
            <Button variant="outline" className="w-full" disabled={ocupado} onClick={mov}>Registrar</Button>
          </Card>
        </div>
      </div>
      {historial}
    </div>
  );
}
