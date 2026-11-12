import { useState } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import type { AppData, Movimiento } from '@/domain/model';
import * as L from '@/domain/logic';
import * as M from '@/domain/movimientos';
import { sb } from '@/lib/supabase';
import { usePeriod } from '@/state/period';
import { useAccion, useFeedback } from '@/state/feedback';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, Kpi, Row, cx } from '@/components/ui';
import { Field, Input, Select, Sheet } from '@/components/ui/form';

const fmt = L.formatoPesos;

/** Movimientos del dueño (V.caja de la versión estable). */
export function MovimientosPage({ d }: { d: AppData }) {
  const { per, ref } = usePeriod();
  const [a, b] = L.rango(per, ref), r = M.resumenMovimientos(d, a, b);
  const com = M.comisionesPeriodo(d, a, b).filter((x) => x.comision > 0), pen = M.pendientesCobro(d), lista = M.movimientosPeriodo(d, a, b);
  const [cobrar, setCobrar] = useState<Movimiento | null>(null);

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Movimientos" subtitle="Ingresos y gastos del período" />
      <PeriodBar />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Ingresos" value={fmt(r.ingresos)} tone="ok" />
        <Kpi label="Gastos" value={fmt(r.gastos)} tone="ko" />
        <Kpi label="Neto" value={fmt(r.neto)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="space-y-4 lg:col-span-2 lg:space-y-6">
          <Card title="Movimientos del período">
            {lista.length ? lista.map((m) => <FilaMovimiento key={m.id} d={d} m={m} />) : <Empty>Sin movimientos.</Empty>}
          </Card>
        </div>
        <div className="space-y-4 lg:space-y-6">
          {pen.length > 0 && (
            <Card title={`Pendientes de cobro (${pen.length} · ${fmt(L.sumMonto(pen))})`}>
              {pen.map((m) => (
                <button key={m.id} className="block w-full text-left" onClick={() => setCobrar(m)}>
                  <Row left={<><Clock size={13} className="mr-1.5 inline text-warn" />{m.fecha.slice(5)} · {m.concepto}</>} sub={m.cliente || L.nombreBarbero(d, m.barberoId)} right={fmt(m.monto)} />
                </button>
              ))}
            </Card>
          )}
          {com.length > 0 && (
            <Card title="Comisiones de barberos (gasto variable)">
              {com.map((x) => <Row key={x.barbero.id} left={x.barbero.nombre} right={<span className="text-ko">-{fmt(x.comision)}</span>} />)}
            </Card>
          )}
          <Registrar d={d} />
        </div>
      </div>
      {cobrar && <CobrarPendiente m={cobrar} onClose={() => setCobrar(null)} />}
    </div>
  );
}

function FilaMovimiento({ d, m }: { d: AppData; m: Movimiento }) {
  const ed = M.editable(m, true);
  const { run, ocupado } = useAccion();
  const { confirmar, toast } = useFeedback();
  const tabla = M.tablaDe(m), tablas = ['ingresos', 'gastos', 'productos', 'mov_stock'] as const;
  const borrar = async () => {
    if (!(await confirmar({ titulo: m.tipo == 'ing' ? '¿Anular este ingreso?' : '¿Borrar este gasto?', texto: `${m.concepto} · ${fmt(m.monto)} · ${m.fecha}${m.tipo == 'ing' && m.productoId ? '. El stock vendido se devuelve.' : ''}`, accion: m.tipo == 'ing' ? 'Anular' : 'Borrar', peligro: true }))) return;
    run(async () => { await M.anular(sb, tabla, m.id); return m.tipo == 'ing' ? 'Ingreso anulado' : 'Gasto borrado'; }, [...tablas]);
  };
  const fecha = (f: string) => f && run(async () => { try { await M.cambiarFecha(sb, tabla, m.id, f); } catch { toast('No se pudo cambiar la fecha'); } }, [...tablas]);
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      {ed
        ? <input type="date" aria-label={`Fecha de ${m.concepto}`} defaultValue={m.fecha} disabled={ocupado} onChange={(e) => fecha(e.target.value)} className="num h-9 w-[8.5rem] shrink-0 rounded-lg border border-line bg-bg px-2 text-xs text-muted" />
        : <span className="num w-12 shrink-0 text-xs text-subtle">{m.fecha.slice(5)}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{m.concepto}</p>
        <p className="truncate text-xs text-muted">{M.detalleMovimiento(d, m)}</p>
      </div>
      <p className={cx('num shrink-0 text-sm font-medium', m.tipo == 'ing' ? 'text-ok' : 'text-ko')}>{m.tipo == 'gas' ? '-' : ''}{fmt(m.monto)}</p>
      {ed && <button onClick={borrar} disabled={ocupado} aria-label={`${m.tipo == 'ing' ? 'Anular' : 'Borrar'} ${m.concepto}`} className="rounded-lg p-2 text-subtle hover:bg-ko/10 hover:text-ko"><Trash2 size={16} /></button>}
    </div>
  );
}

function CobrarPendiente({ m, onClose }: { m: Movimiento; onClose(): void }) {
  const [medio, setMedio] = useState('efectivo');
  const { run, ocupado } = useAccion();
  const cobrar = async () => { if (await run(async () => { await M.cobrarIngreso(sb, m.id, medio); return 'Cobrado'; }, ['ingresos'])) onClose(); };
  return (
    <Sheet title={`Cobrar ${m.concepto}`} onClose={onClose} footer={<Button className="h-12 w-full" disabled={ocupado} onClick={cobrar}>Marcar como cobrado</Button>}>
      <p className="mb-4 text-sm text-muted">{fmt(m.monto)} · {m.fecha}</p>
      <Field label="Medio de pago">{(id) => <Select id={id} value={medio} onChange={(e) => setMedio(e.target.value)}>{M.MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
    </Sheet>
  );
}

function Registrar({ d }: { d: AppData }) {
  const vacio: M.Movimiento_ = { clave: 'ing|servicio', concepto: '', monto: '', barbero: '', fecha: L.today() };
  const [x, setX] = useState(vacio);
  const set = (p: Partial<M.Movimiento_>) => setX((v) => ({ ...v, ...p }));
  const { run, ocupado } = useAccion();
  const { toast } = useFeedback();
  const concepto = (c: string) => { const s = d.servicios.find((y) => y.nombre == c); set({ concepto: c, ...(s && !x.monto ? { monto: String(s.precio) } : {}) }); };
  const guardar = async () => {
    const err = M.validarMovimiento(d, x, true);
    if (err) return toast(err);
    if (await run(async () => { await M.guardarMovimiento(sb, d, x, crypto.randomUUID()); return 'Guardado'; }, ['ingresos', 'gastos', 'productos', 'mov_stock'])) set({ concepto: '', monto: '' });
  };
  return (
    <Card title="Registrar">
      <Field label="Tipo">{(id) => (
        <Select id={id} value={x.clave} onChange={(e) => set({ clave: e.target.value })}>
          <option value="ing|servicio">Ingreso · servicio</option><option value="ing|producto">Ingreso · producto</option><option value="gas|fijo">Gasto fijo</option><option value="gas|variable">Gasto variable</option>
        </Select>
      )}</Field>
      <Field label="Concepto">{(id) => <><Input id={id} list="bh-servicios" value={x.concepto} onChange={(e) => concepto(e.target.value)} /><datalist id="bh-servicios">{d.servicios.map((s) => <option key={s.id} value={s.nombre} />)}</datalist></>}</Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Monto">{(id) => <Input id={id} type="number" inputMode="decimal" value={x.monto} onChange={(e) => set({ monto: e.target.value })} />}</Field>
        <Field label="Fecha">{(id) => <Input id={id} type="date" value={x.fecha} onChange={(e) => set({ fecha: e.target.value })} />}</Field>
      </div>
      {x.clave.startsWith('ing') && (
        <Field label="Barbero">{(id) => <Select id={id} value={x.barbero} onChange={(e) => set({ barbero: e.target.value })}><option value="">Sin barbero</option>{d.barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</Select>}</Field>
      )}
      <Button className="w-full" disabled={ocupado} onClick={guardar}>Guardar</Button>
    </Card>
  );
}
