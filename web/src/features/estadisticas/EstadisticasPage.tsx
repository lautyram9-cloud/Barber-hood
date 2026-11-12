import { Download } from 'lucide-react';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import { guardarArchivo } from '@/lib/files';
import { usePeriod } from '@/state/period';
import { useFeedback } from '@/state/feedback';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Bars, Card, Empty, Kpi, Row, cx } from '@/components/ui';
import { LineChart, PairBars, kf } from '@/components/ui/charts';

const fmt = L.formatoPesos;
const CSVS: [L.CsvTipo, string][] = [['mov', 'Movimientos (ingresos y gastos)'], ['liq', 'Liquidaciones de comisiones'], ['tur', 'Turnos'], ['cli', 'Clientes'], ['stk', 'Stock actual']];

/** Estadísticas del dueño (V.est + est8 de la versión estable). */
export function EstadisticasPage({ d }: { d: AppData }) {
  const { per, ref } = usePeriod();
  const { toast } = useFeedback();
  const [a, b] = L.rango(per, ref), r = L.resultado(d, a, b), q0 = L.resultado(d, ...L.rangoAnterior(per, ref));
  const ing = (p: L.Periodo) => L.resultado(d, ...L.rango(p, ref)).ingresos;
  const ms = L.ultimosMeses(6, ref), R = ms.map((m) => L.resultado(d, m + '-01', m + '-31')), meses = ms.map(L.nombreMes);
  const sv = L.serviciosVendidos(d, a, b), top = L.serviciosMayorMargen(d, a, b), cli = L.clientesNuevosRecurrentes(d, a, b), horas = L.demandaPorHora(d, a, b);
  const BR = d.barberos.map((x) => L.statsBarbero(d, x.id, a, b)).sort((u, w) => w.facturacion - u.facturacion);
  const cantServ = sv.reduce((t, s) => t + s.cantidad, 0);

  const detalle: [string, number, string?][] = [
    ['Facturación', r.ingresos], ['Cobrado', r.cobrado, 'sub'], ['Pendiente de cobro', r.pendiente, 'sub'], ['Gastos fijos', r.gastosFijos], ['Gastos variables', r.gastosVariables],
    ['Costo de productos vendidos', r.costoProductos], ['Pérdidas de mercadería', r.perdidas], ['Comisiones generadas', r.comisiones],
    ['Comisiones pagadas', L.comisionesPagadas(d, a, b)], ['Comisiones pendientes (acumulado)', L.comisionPendiente(d)], ['Ticket promedio', r.operaciones ? r.ingresos / r.operaciones : 0],
  ];
  const comparar: [string, number, number][] = [['Facturación', r.ingresos, q0.ingresos], ['Gastos', r.gastosFijos + r.gastosVariables, q0.gastosFijos + q0.gastosVariables], ['Ganancia estimada', r.neto, q0.neto]];

  async function exportar(tipo: L.CsvTipo) {
    const x = L.csvExport(d, tipo, a, b);
    try { await guardarArchivo(x.nombre, 'text/csv', L.aCsv(x.filas), true); } catch { toast('No se pudo exportar'); }
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Estadísticas" subtitle="Resultado del negocio y evolución" />
      <PeriodBar />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Día" value={fmt(ing('dia'))} />
        <Kpi label="Semana" value={fmt(ing('sem'))} />
        <Kpi label="Mes" value={fmt(ing('mes'))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Período seleccionado">
          {detalle.map(([k, v, sub]) => <Row key={k} left={sub ? <span className="pl-4 text-muted">{k}</span> : k} right={fmt(v)} />)}
          <Row left={<b>Ganancia real estimada</b>} right={<b className={r.neto >= 0 ? 'text-ok' : 'text-ko'}>{fmt(r.neto)}</b>} />
        </Card>
        <div className="space-y-4 lg:space-y-6">
          <Card title="Comparación con el período anterior">
            {comparar.map(([k, x, y]) => (
              <Row key={k} left={k} sub={`antes ${fmt(y)}`} right={<span>{fmt(x)} <span className={cx('ml-1 text-xs', x >= y ? 'text-ok' : 'text-ko')}>{L.variacion(x, y)}</span></span>} />
            ))}
            <Row left="Rentabilidad" sub={`antes ${L.rentabilidad(q0)}%`} right={`${L.rentabilidad(r)}%`} />
            <Row left="Cantidad de servicios" right={cantServ} />
          </Card>
          <Card title="Clientes">
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Nuevos" value={cli.nuevos} />
              <Kpi label="Recurrentes" value={cli.recurrentes} tone="accent" />
            </div>
            <p className="mt-3 text-xs text-subtle">Se cuentan los ingresos con cliente cargado (turnos cobrados o campo Cliente del +).</p>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Servicios: más vendidos y margen">
          {sv.length ? sv.map((s) => <Row key={s.nombre} left={s.nombre} sub={`${s.cantidad} servicios · ${fmt(s.ingresos)} · margen ${fmt(s.margen)} (${s.margenPct}%)`} right={s.cantidad} />) : <Empty>Sin servicios.</Empty>}
        </Card>
        <Card title="Servicios con mayor margen">
          {top.length ? top.map((s) => <Row key={s.nombre} left={s.nombre} sub={`${s.margenPct}% de margen`} right={fmt(s.margen)} />) : <Empty>Sin servicios.</Empty>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Facturación por mes"><Bars labels={meses} values={R.map((x) => x.ingresos)} format={kf} /></Card>
        <Card title="Ganancia por mes"><Bars labels={meses} values={R.map((x) => Math.max(0, x.neto))} format={kf} /></Card>
        <Card title="Evolución de la rentabilidad (%)"><LineChart labels={meses} values={R.map((x) => (x.ingresos ? (x.neto / x.ingresos) * 100 : 0))} suffix="%" /></Card>
        <Card title="Ingresos vs gastos por mes">
          <PairBars labels={meses} a={R.map((x) => x.ingresos)} b={R.map(L.gastosTotales)} format={fmt} />
          <p className="mt-3 flex gap-4 text-xs text-muted"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-accent" />Ingresos</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ko/80" />Gastos totales (con comisiones y costo de productos)</span></p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Card title="Horarios de mayor demanda (turnos)">
          {horas.length ? <Bars labels={horas.map((h) => h[0] + 'h')} values={horas.map((h) => h[1])} format={String} /> : <Empty>Sin turnos en el período.</Empty>}
        </Card>
        <Card title="Rendimiento por barbero">
          {BR.length ? BR.map((x) => <Row key={x.id} left={x.nombre} sub={`${x.cortes} cortes · comisión ${fmt(x.comision)}`} right={fmt(x.facturacion)} />) : <Empty>Sin barberos.</Empty>}
        </Card>
      </div>

      <Card title="Exportar a CSV">
        <p className="mb-3 text-xs text-muted">Del período seleccionado. En el iPhone se abre el menú para guardar o compartir el archivo.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {CSVS.map(([k, l]) => (
            <button key={k} onClick={() => exportar(k)} className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 text-left text-sm hover:border-line-strong">
              <Download size={16} className="shrink-0 text-accent" /> {l}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
