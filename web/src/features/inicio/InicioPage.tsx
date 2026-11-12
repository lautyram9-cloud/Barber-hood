import { MessageCircle } from 'lucide-react';
import type { AppData, Turno } from '@/domain/model';
import * as L from '@/domain/logic';
import { useCajaResumen } from '@/state/data';
import { Badge, Bars, Card, Empty, Kpi, Row } from '@/components/ui';

// Inicio del dueño. Mismos indicadores y mismas fórmulas que V.ini de la versión estable.
const DN = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fmt = L.formatoPesos;
const EST: Record<string, { label: string; tone: 'muted' | 'ok' | 'ko' | 'warn' | 'accent' }> = {
  pendiente: { label: 'Pendiente', tone: 'warn' }, confirmado: { label: 'Confirmado', tone: 'accent' }, atendido: { label: 'Atendido', tone: 'ok' },
  cancelado: { label: 'Cancelado', tone: 'ko' }, ausente: { label: 'Ausente', tone: 'ko' },
};
export const EstadoBadge = ({ e }: { e: string }) => <Badge tone={EST[e]?.tone}>{EST[e]?.label ?? e}</Badge>;

export function InicioPage({ d }: { d: AppData }) {
  const t = L.today(), y = L.isoLocal(new Date(Date.now() - 864e5)), m = L.isoLocal(new Date(Date.now() + 864e5));
  const h = L.resultado(d, t, t), a = L.resultado(d, y, y);
  const pc = a.ingresos ? Math.round(((h.ingresos - a.ingresos) / a.ingresos) * 100) : null;
  const caja = useCajaResumen(d.cajaAbierta?.id, true);
  const hoy = d.turnos.filter((x) => x.fecha == t).sort((p, q) => p.hora.localeCompare(q.hora));
  const pend = d.turnos.filter((x) => x.estado == 'pendiente' && x.fecha >= t);
  const manana = d.turnos.filter((x) => x.fecha == m && ['pendiente', 'confirmado'].includes(x.estado)).sort((p, q) => p.hora.localeCompare(q.hora));
  const ranking = d.barberos.map((b) => L.statsBarbero(d, b.id, t, t)).sort((p, q) => q.facturacion - p.facturacion);
  const dias = [...Array(7)].map((_, i) => { const f = L.isoLocal(new Date(Date.now() - (6 - i) * 864e5)); return [DN[new Date(f + 'T00:00:00').getDay()], L.resultado(d, f, f).ingresos] as const; });
  const bajo = L.stockBajo(d);
  const bn = (id: string) => L.nombreBarbero(d, id);
  const turnoSub = (x: Turno) => [x.servicios, bn(x.barberoId)].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Inicio</h1>
        <p className="text-sm text-muted first-letter:uppercase">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Facturación hoy" value={fmt(h.ingresos)} hint={pc == null ? undefined : <span className={pc >= 0 ? 'text-ok' : 'text-ko'}>{pc >= 0 ? '▲' : '▼'} {Math.abs(pc)}% vs ayer</span>} />
        <Kpi label="Cobrado hoy" value={fmt(L.cobradoEnFecha(d, t))} tone="ok" />
        <Kpi label="Gastos hoy" value={fmt(h.gastosFijos + h.gastosVariables)} tone="ko" />
        <Kpi label="Ganancia estimada" value={fmt(h.neto)} tone={h.neto >= 0 ? 'ok' : 'ko'} />
        <Kpi label="Comisiones pendientes" value={fmt(L.comisionPendiente(d))} />
        <Kpi label="En caja" value={d.cajaAbierta ? (caja.data ? fmt(caja.data.esperado) : '…') : 'Cerrada'} tone="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <div className="space-y-4 lg:col-span-3 lg:space-y-6">
          <Card title={`Turnos de hoy (${hoy.length})`}>
            {hoy.length ? hoy.map((x) => (
              <Row key={x.id} left={<><span className="num text-muted">{x.hora}</span> · {x.cliente}</>} sub={turnoSub(x)} right={<EstadoBadge e={x.estado} />} />
            )) : <Empty>No hay turnos hoy.</Empty>}
          </Card>
          {pend.length > 0 && (
            <Card title={`Solicitudes pendientes (${pend.length})`}>
              {pend.slice(0, 5).map((x) => (
                <Row key={x.id} left={<><span className="num text-muted">{x.fecha.slice(5)} {x.hora}</span> · {x.cliente}</>} sub={`${turnoSub(x)} · ${x.duracionMin} min`} right={<EstadoBadge e={x.estado} />} />
              ))}
            </Card>
          )}
          {manana.length > 0 && (
            <Card title={`Recordatorios de mañana (${manana.length})`}>
              <p className="mb-2 text-xs text-muted">Se abre WhatsApp con el mensaje listo; solo tocás enviar.</p>
              {manana.map((x) => (
                <Row key={x.id} left={<><span className="num text-muted">{x.hora}</span> · {x.cliente}</>} sub={turnoSub(x)}
                  right={L.numeroWhatsApp(x.telefono) ? (
                    <a className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ok/10 px-3 text-xs font-medium text-ok" target="_blank" rel="noopener"
                      href={L.linkWhatsApp(x.telefono, `Hola ${x.cliente}! Te recordamos tu turno en Barber Hood mañana a las ${x.hora}. Si no podés venir, avisanos. ¡Te esperamos!`)}>
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  ) : <span className="text-xs text-subtle">sin teléfono</span>} />
              ))}
            </Card>
          )}
        </div>
        <div className="space-y-4 lg:col-span-2 lg:space-y-6">
          <Card title="Últimos 7 días · facturación">
            <Bars labels={dias.map((x) => x[0])} values={dias.map((x) => x[1])} format={(n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)))} />
          </Card>
          <Card title="Barberos hoy">
            {ranking.length ? ranking.map((s) => (
              <Row key={s.id} left={s.nombre} sub={`${s.cortes} cortes · comisión ${fmt(s.comision)}`} right={fmt(s.facturacion)} />
            )) : <Empty>Cargá barberos en Ajustes.</Empty>}
          </Card>
          {bajo.length > 0 && (
            <Card title="Poco stock">
              {bajo.slice(0, 4).map((p) => <Row key={p.id} left={p.nombre} right={<span className="text-ko">{p.stock} u.</span>} />)}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
