import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import { usePeriod } from '@/state/period';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Bars, Card, Empty, Row } from '@/components/ui';
import { kf } from '@/components/ui/charts';
import { FichaBarbero } from './FichaBarbero';

export function BarberosPage({ d }: { d: AppData }) {
  const { per, ref } = usePeriod();
  const [a, b] = L.rango(per, ref);
  const R = d.barberos.map((x) => L.statsBarbero(d, x.id, a, b)).sort((x, y) => y.facturacion - x.facturacion);
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Barberos" subtitle="Ranking y rendimiento por barbero" />
      <PeriodBar />
      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <Card title="Ranking de barberos" className="lg:col-span-2">
          {R.length ? R.map((s, i) => (
            <Row key={s.id} left={<><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{i + 1}</span>{s.nombre}</>}
              sub={`${s.cortes} cortes · prom. ${s.promedioDiario.toFixed(1)}/día`} right={L.formatoPesos(s.facturacion)} />
          )) : <Empty>Cargá barberos en Ajustes.</Empty>}
        </Card>
        {R.length > 0 && <Card title="Facturación del período" className="lg:col-span-3"><Bars labels={R.map((s) => s.nombre.slice(0, 8))} values={R.map((s) => s.facturacion)} format={kf} /></Card>}
      </div>
      {d.barberos.map((x) => <FichaBarbero key={x.id} d={d} id={x.id} admin />)}
    </div>
  );
}
