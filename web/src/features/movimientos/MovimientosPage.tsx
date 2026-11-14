import { useState } from 'react';
import { Banknote, ChevronRight, Clock, CreditCard, Landmark, Trash2 } from 'lucide-react';
import type { AppData, Movimiento } from '@/domain/model';
import * as L from '@/domain/logic';
import * as M from '@/domain/movimientos';
import { sb } from '@/lib/supabase';
import { usePeriod } from '@/state/period';
import { useSession } from '@/state/session';
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
  const [verId, setVerId] = useState<string | null>(null);
  const ver = verId ? d.movs.find((x) => x.id == verId) : undefined;

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
            {lista.length ? lista.map((m) => <FilaMovimiento key={m.id} d={d} m={m} onAbrir={() => setVerId(m.id)} />) : <Empty>Sin movimientos.</Empty>}
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
      {ver && <DetalleMovimiento d={d} m={ver} onClose={() => setVerId(null)} />}
      {cobrar && <CobrarPendiente m={cobrar} onClose={() => setCobrar(null)} />}
    </div>
  );
}

const ICONO_MEDIO: Record<string, typeof Banknote> = { efectivo: Banknote, transferencia: Landmark, tarjeta: CreditCard };

/** Distintivo del medio de pago (o "Sin cobrar" si el ingreso todavía no se cobró). */
function Medio({ m }: { m: Movimiento }) {
  const pendiente = m.tipo == 'ing' && !m.cobrado;
  const Icono = pendiente ? Clock : ICONO_MEDIO[m.medioPago] ?? Banknote;
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
      pendiente ? 'bg-warn/15 text-warn' : m.medioPago == 'transferencia' ? 'bg-accent/15 text-accent' : m.medioPago == 'tarjeta' ? 'bg-fg/10 text-fg' : 'bg-ok/10 text-ok')}>
      <Icono size={12} />{pendiente ? 'Sin cobrar' : M.etiquetaMedio(m.medioPago)}
    </span>
  );
}

function FilaMovimiento({ d, m, onAbrir }: { d: AppData; m: Movimiento; onAbrir(): void }) {
  const ed = M.editable(m, true);
  const { run, ocupado } = useAccion();
  const { confirmar } = useFeedback();
  const borrar = () => anularMovimiento(m, confirmar, run);
  return (
    <div className="flex items-center gap-2 border-t border-line first:border-t-0">
      <button onClick={onAbrir} aria-label={`Ver detalle de ${m.concepto}`} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
        <span className="num w-11 shrink-0 text-xs text-subtle">{m.fecha.slice(8)}/{m.fecha.slice(5, 7)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{m.concepto}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted"><Medio m={m} /><span>{M.detalleFila(d, m)}</span></span>
        </span>
        <span className={cx('num shrink-0 text-sm font-medium', m.tipo == 'ing' ? 'text-ok' : 'text-ko')}>{m.tipo == 'gas' ? '-' : ''}{fmt(m.monto)}</span>
        <ChevronRight size={16} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>
      {ed && <button onClick={borrar} disabled={ocupado} aria-label={`${m.tipo == 'ing' ? 'Anular' : 'Borrar'} ${m.concepto}`} className="rounded-lg p-2 text-subtle hover:bg-ko/10 hover:text-ko"><Trash2 size={16} /></button>}
    </div>
  );
}

type Confirmar = ReturnType<typeof useFeedback>['confirmar'];
type Run = ReturnType<typeof useAccion>['run'];
const TABLAS_MOV = ['ingresos', 'gastos', 'productos', 'mov_stock'] as const;
/** Pide confirmación y anula el ingreso / borra el gasto. Devuelve true si se hizo. */
async function anularMovimiento(m: Movimiento, confirmar: Confirmar, run: Run) {
  if (!(await confirmar({ titulo: m.tipo == 'ing' ? '¿Anular este ingreso?' : '¿Borrar este gasto?', texto: `${m.concepto} · ${fmt(m.monto)} · ${m.fecha}${m.tipo == 'ing' && m.productoId ? '. El stock vendido se devuelve.' : ''}`, accion: m.tipo == 'ing' ? 'Anular' : 'Borrar', peligro: true }))) return false;
  return run(async () => { await M.anular(sb, M.tablaDe(m), m.id); return m.tipo == 'ing' ? 'Ingreso anulado' : 'Gasto borrado'; }, [...TABLAS_MOV]);
}

/** Ventana con todo el detalle de un movimiento: quién lo cargó, cuándo, medio de pago, etc. */
function DetalleMovimiento({ d, m, onClose }: { d: AppData; m: Movimiento; onClose(): void }) {
  const { session } = useSession();
  const miUser = session.status == 'ready' ? session.userId : null;
  const ed = M.editable(m, true);
  const { run, ocupado } = useAccion();
  const { confirmar, toast } = useFeedback();
  const fecha = (f: string) => f && run(async () => { try { await M.cambiarFecha(sb, M.tablaDe(m), m.id, f); } catch { toast('No se pudo cambiar la fecha'); } }, [...TABLAS_MOV]);
  return (
    <Sheet title={m.concepto} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className={cx('num text-2xl font-semibold', m.tipo == 'ing' ? 'text-ok' : 'text-ko')}>{m.tipo == 'gas' ? '-' : ''}{fmt(m.monto)}</p>
        <Medio m={m} />
      </div>
      <dl className="divide-y divide-line rounded-xl border border-line px-3">
        {M.detalleCompleto(d, m, miUser).map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2.5 text-sm"><dt className="shrink-0 text-muted">{k}</dt><dd className="text-right">{v}</dd></div>
        ))}
      </dl>
      {ed && (
        <div className="mt-5 space-y-3">
          <Field label="Cambiar la fecha del movimiento">{(id) => <Input id={id} type="date" defaultValue={m.fecha} disabled={ocupado} onChange={(e) => fecha(e.target.value)} />}</Field>
          <Button variant="outline" className="w-full text-ko" disabled={ocupado} onClick={async () => { if (await anularMovimiento(m, confirmar, run)) onClose(); }}>
            <Trash2 size={16} /> {m.tipo == 'ing' ? 'Anular ingreso' : 'Borrar gasto'}
          </Button>
        </div>
      )}
    </Sheet>
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
