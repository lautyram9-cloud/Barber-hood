import { CalendarX } from 'lucide-react';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import { sb } from '@/lib/supabase';
import { usePeriod } from '@/state/period';
import { useAccion, useFeedback } from '@/state/feedback';
import { Bars, Button, Card, Empty, Kpi, Row } from '@/components/ui';
import { kf } from '@/components/ui/charts';

const fmt = L.formatoPesos;

/** Ficha de rendimiento de un barbero (bcard de la versión estable). */
export function FichaBarbero({ d, id, admin }: { d: AppData; id: string; admin: boolean }) {
  const { per, ref } = usePeriod();
  const [a, b] = L.rango(per, ref), s = L.statsBarbero(d, id, a, b), p = L.asistenciaPct(s), ms = L.ultimosMeses(6, ref);
  const liq = d.liquidaciones.filter((x) => x.barberoId == id).sort((x, y) => y.ts - x.ts).slice(0, 8);
  const servicios = Object.entries(s.serviciosPorNombre).sort((x, y) => y[1] - x[1]);
  const { run, ocupado } = useAccion();
  const { confirmar } = useFeedback();

  async function falta() {
    if (!(await confirmar({ titulo: `¿Registrar falta de ${s.nombre} hoy?`, texto: 'Queda en el registro de asistencia del día.', accion: 'Registrar falta', peligro: true }))) return;
    run(async () => {
      const { error } = await sb.from('asistencia').insert({ barbero_id: id, fecha: L.today(), estado: 'falta' });
      if (error) throw error;
      return 'Falta registrada';
    }, ['asistencia']);
  }

  return (
    <Card title={s.nombre} action={admin && <Button variant="ghost" className="min-h-9 text-xs" onClick={falta} disabled={ocupado}><CalendarX size={15} /> Registrar falta hoy</Button>}>
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Cortes" value={s.cortes} />
        <Kpi label="Facturación" value={fmt(s.facturacion)} />
        <Kpi label="Comisión" value={fmt(s.comision)} tone="accent" />
      </div>
      <div className="mt-4 grid gap-x-8 lg:grid-cols-2">
        <div>
          <Row left="Servicios / productos" right={<span>{fmt(s.servicios)} · {fmt(s.productos)} <span className="text-muted">({s.unidadesProducto} u.)</span></span>} className="first:border-t" />
          <Row left="Promedio de clientes por día" right={s.promedioDiario.toFixed(1)} />
          <Row left="Comisión pendiente de liquidar" sub="Acumulada, descontando adelantos" right={fmt(L.comisionPendiente(d, id))} />
          <Row left="Puntualidad / asistencia" right={p.puntualidad == null ? '—' : `${p.puntualidad}% / ${p.asistencia}%`} />
          <p className="mb-1 mt-5 text-xs font-medium uppercase tracking-wider text-subtle">Servicios realizados</p>
          {servicios.length ? servicios.map(([n, c]) => <Row key={n} left={n} right={c} />) : <Empty>Sin servicios.</Empty>}
        </div>
        <div>
          <p className="mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-subtle lg:mt-3">Rendimiento mensual</p>
          <Bars labels={ms.map(L.nombreMes)} values={ms.map((m) => L.statsBarbero(d, id, m + '-01', m + '-31').facturacion)} format={kf} />
          <p className="mb-1 mt-5 text-xs font-medium uppercase tracking-wider text-subtle">Historial de liquidaciones</p>
          {liq.length ? liq.map((x) => <Row key={x.id} left={x.fecha} sub={`${x.desde || ''} → ${x.hasta || ''}`} right={fmt(x.monto)} />) : <Empty>Sin liquidaciones.</Empty>}
        </div>
      </div>
    </Card>
  );
}
