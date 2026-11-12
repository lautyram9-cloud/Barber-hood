import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { AppData, Movimiento } from '@/domain/model';
import * as L from '@/domain/logic';
import * as A from '@/domain/ajustes';
import { anular, cambiarFecha } from '@/domain/movimientos';
import { sb } from '@/lib/supabase';
import { usePeriod } from '@/state/period';
import { useAccion, useFeedback } from '@/state/feedback';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, Kpi, cx } from '@/components/ui';
import { Field, Input, Select } from '@/components/ui/form';

const fmt = L.formatoPesos;

/** Panel privado del dueño (V.due). */
export function DuenoPage({ d }: { d: AppData }) {
  const { per, ref } = usePeriod();
  const [a, b] = L.rango(per, ref), r = L.resultado(d, a, b), M = A.movimientosDueno(d, a, b), t = A.totalesDueno(M);
  const [x, setX] = useState({ tipo: 'ing', concepto: '', monto: '', fecha: L.today() });
  const { run, ocupado } = useAccion(), { toast } = useFeedback();
  const guardar = () => { const e = A.validarDueno(x.concepto, x.monto); if (e) return toast(e); run(async () => { await A.guardarDueno(sb, x.tipo, x.concepto, x.monto, x.fecha); setX((v) => ({ ...v, concepto: '', monto: '' })); return 'Guardado'; }, ['dueno_mov']); };
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Dueño" subtitle="Resultado de la barbería y movimientos privados" />
      <PeriodBar />
      <Card title="Resultado de la barbería">
        <p className="text-xs text-subtle">Ingresos − gastos − comisiones − costo de productos vendidos − pérdidas</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-muted">Ingresos {fmt(r.ingresos)} · Gastos {fmt(r.gastosFijos + r.gastosVariables)} · Comisiones {fmt(r.comisiones)} · Costo prod. {fmt(r.costoProductos)} · Pérdidas {fmt(r.perdidas)}</p>
          <p className={cx('num text-2xl font-semibold', r.neto >= 0 ? 'text-ok' : 'text-ko')}>{fmt(r.neto)}</p>
        </div>
      </Card>
      <h2 className="text-sm font-medium uppercase tracking-wider text-muted">Mis ingresos y gastos (privado)</h2>
      <div className="grid grid-cols-3 gap-3"><Kpi label="Ingresos" value={fmt(t.ingresos)} tone="ok" /><Kpi label="Gastos" value={fmt(t.gastos)} tone="ko" /><Kpi label="Neto" value={fmt(t.neto)} /></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <Card className="lg:col-span-2">{M.length ? M.map((m) => <Fila key={m.id} m={m} />) : <Empty>Sin movimientos.</Empty>}</Card>
        <Card title="Registrar">
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Tipo">{(id) => <Select id={id} value={x.tipo} onChange={(e) => setX({ ...x, tipo: e.target.value })}><option value="ing">Ingreso</option><option value="gas">Gasto</option></Select>}</Field>
            <Field label="Monto">{(id) => <Input id={id} type="number" inputMode="decimal" value={x.monto} onChange={(e) => setX({ ...x, monto: e.target.value })} />}</Field>
          </div>
          <Field label="Concepto">{(id) => <Input id={id} value={x.concepto} onChange={(e) => setX({ ...x, concepto: e.target.value })} />}</Field>
          <Field label="Fecha">{(id) => <Input id={id} type="date" value={x.fecha} onChange={(e) => setX({ ...x, fecha: e.target.value })} />}</Field>
          <Button className="w-full" disabled={ocupado} onClick={guardar}>Guardar</Button>
        </Card>
      </div>
    </div>
  );
}

function Fila({ m }: { m: Movimiento }) {
  const { run, ocupado } = useAccion(), { confirmar, toast } = useFeedback();
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
      <input type="date" aria-label={`Fecha de ${m.concepto}`} defaultValue={m.fecha} disabled={ocupado} className="num h-9 w-[8.5rem] shrink-0 rounded-lg border border-line bg-bg px-2 text-xs text-muted"
        onChange={(e) => e.target.value && run(async () => { try { await cambiarFecha(sb, 'dueno_mov', m.id, e.target.value); } catch { toast('No se pudo cambiar la fecha'); } }, ['dueno_mov'])} />
      <p className="min-w-0 flex-1 truncate text-sm">{m.concepto}</p>
      <p className={cx('num shrink-0 text-sm font-medium', m.tipo == 'ing' ? 'text-ok' : 'text-ko')}>{m.tipo == 'gas' ? '-' : ''}{fmt(m.monto)}</p>
      <button aria-label={`Borrar ${m.concepto}`} disabled={ocupado} className="rounded-lg p-2 text-subtle hover:bg-ko/10 hover:text-ko" onClick={async () => {
        if (await confirmar({ titulo: '¿Borrar este movimiento?', texto: `${m.concepto} · ${fmt(m.monto)}`, accion: 'Borrar', peligro: true })) run(async () => { await anular(sb, 'dueno_mov', m.id); return 'Movimiento borrado'; }, ['dueno_mov']);
      }}><Trash2 size={16} /></button>
    </div>
  );
}
