import { ArrowLeftRight, BarChart3, Clock, Download, Receipt, Scissors, TrendingUp, Users } from 'lucide-react';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import { guardarArchivo } from '@/lib/files';
import { usePeriod } from '@/state/period';
import { useFeedback } from '@/state/feedback';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Bars, Empty, Kpi, Row, cx } from '@/components/ui';
import { Destacado, Plegable } from '@/components/ui/simple';
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
      <Destacado label="Ganancia del período" value={fmt(r.neto)} tone={r.neto >= 0 ? 'ok' : 'ko'}
        hint={<>Facturación {fmt(r.ingresos)} · rentabilidad {L.rentabilidad(r)}% · <span className={r.ingresos >= q0.ingresos ? 'text-ok' : 'text-ko'}>{L.variacion(r.ingresos, q0.ingresos)} vs período anterior</span></>} />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Día" value={fmt(ing('dia'))} />
        <Kpi label="Semana" value={fmt(ing('sem'))} />
        <Kpi label="Mes" value={fmt(ing('mes'))} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Plegable title="Detalle del período" resumen="Ingresos, gastos y ganancia real" icono={<Receipt size={18} />}>
          {detalle.map(([k, v, sub]) => <Row key={k} left={sub ? <span className="pl-4 text-muted">{k}</span> : k} right={fmt(v)} />)}
          <Row left={<b>Ganancia real estimada</b>} right={<b className={r.neto >= 0 ? 'text-ok' : 'text-ko'}>{fmt(r.neto)}</b>} />
        </Plegable>
        <Plegable title="Comparación con el período anterior" resumen={`Facturación ${L.variacion(r.ingresos, q0.ingresos)} · ganancia ${L.variacion(r.neto, q0.neto)}`} icono={<ArrowLeftRight size={18} />}>
          {comparar.map(([k, x, y]) => (
            <Row key={k} left={k} sub={`antes ${fmt(y)}`} right={<span>{fmt(x)} <span className={cx('ml-1 text-xs', x >= y ? 'text-ok' : 'text-ko')}>{L.variacion(x, y)}</span></span>} />
          ))}
          <Row left="Rentabilidad" sub={`antes ${L.rentabilidad(q0)}%`} right={`${L.rentabilidad(r)}%`} />
          <Row left="Cantidad de servicios" right={cantServ} />
        </Plegable>
        <Plegable title="Clientes" resumen={`${cli.nuevos} nuevos · ${cli.recurrentes} recurrentes`} icono={<Users size={18} />}>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Nuevos" value={cli.nuevos} />
            <Kpi label="Recurrentes" value={cli.recurrentes} tone="accent" />
          </div>
          <p className="mt-3 text-xs text-subtle">Se cuentan los ingresos con cliente cargado (turnos cobrados o campo Cliente del +).</p>
        </Plegable>
        <Plegable title="Servicios" resumen={sv.length ? `Más vendido: ${sv[0].nombre}` : 'Sin servicios en el período'} icono={<Scissors size={18} />}>
          <p className="mb-1 text-sm font-semibold">Más vendidos y margen</p>
          {sv.length ? sv.map((s) => <Row key={s.nombre} left={s.nombre} sub={`${s.cantidad} servicios · ${fmt(s.ingresos)} · margen ${fmt(s.margen)} (${s.margenPct}%)`} right={s.cantidad} />) : <Empty>Sin servicios.</Empty>}
          <p className="mb-1 mt-5 text-sm font-semibold">Con mayor margen</p>
          {top.length ? top.map((s) => <Row key={s.nombre} left={s.nombre} sub={`${s.margenPct}% de margen`} right={fmt(s.margen)} />) : <Empty>Sin servicios.</Empty>}
        </Plegable>
        <Plegable title="Evolución por mes" resumen="Facturación, ganancia, rentabilidad e ingresos vs gastos" icono={<BarChart3 size={18} />}>
          <p className="mb-2 text-sm font-semibold">Facturación por mes</p>
          <Bars labels={meses} values={R.map((x) => x.ingresos)} format={kf} />
          <p className="mb-2 mt-6 text-sm font-semibold">Ganancia por mes</p>
          <Bars labels={meses} values={R.map((x) => Math.max(0, x.neto))} format={kf} />
          <p className="mb-2 mt-6 text-sm font-semibold">Evolución de la rentabilidad (%)</p>
          <LineChart labels={meses} values={R.map((x) => (x.ingresos ? (x.neto / x.ingresos) * 100 : 0))} suffix="%" />
          <p className="mb-2 mt-6 text-sm font-semibold">Ingresos vs gastos por mes</p>
          <PairBars labels={meses} a={R.map((x) => x.ingresos)} b={R.map(L.gastosTotales)} format={fmt} />
          <p className="mt-3 flex gap-4 text-xs text-muted"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-accent" />Ingresos</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ko/80" />Gastos totales (con comisiones y costo de productos)</span></p>
        </Plegable>
        <Plegable title="Horarios de mayor demanda" resumen={horas.length ? `Más pedido: ${[...horas].sort((x, y) => y[1] - x[1])[0][0]}h` : 'Sin turnos en el período'} icono={<Clock size={18} />}>
          {horas.length ? <Bars labels={horas.map((h) => h[0] + 'h')} values={horas.map((h) => h[1])} format={String} /> : <Empty>Sin turnos en el período.</Empty>}
        </Plegable>
        <Plegable title="Rendimiento por barbero" resumen={BR.length ? `${BR[0].nombre} va primero · ${fmt(BR[0].facturacion)}` : 'Sin barberos'} icono={<TrendingUp size={18} />}>
          {BR.length ? BR.map((x) => <Row key={x.id} left={x.nombre} sub={`${x.cortes} cortes · comisión ${fmt(x.comision)}`} right={fmt(x.facturacion)} />) : <Empty>Sin barberos.</Empty>}
        </Plegable>
        <Plegable title="Exportar a CSV" resumen="Descargar los datos del período" icono={<Download size={18} />}>
          <p className="mb-3 text-xs text-muted">Del período seleccionado. En el iPhone se abre el menú para guardar o compartir el archivo.</p>
          <div className="grid gap-2">
            {CSVS.map(([k, l]) => (
              <button key={k} onClick={() => exportar(k)} className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 text-left text-sm hover:border-line-strong">
                <Download size={16} className="shrink-0 text-accent" /> {l}
              </button>
            ))}
          </div>
        </Plegable>
      </div>
    </div>
  );
}
