import { useState } from 'react';
import { AlertTriangle, BarChart3, Bell, MessageCircle, Users } from 'lucide-react';
import type { AppData, Turno } from '@/domain/model';
import * as L from '@/domain/logic';
import { useCajaResumen } from '@/state/data';
import { Badge, Bars, Empty, Kpi, Row } from '@/components/ui';
import { Destacado, ListaCorta, Plegable } from '@/components/ui/simple';
import { TurnoRow } from '@/features/turnos/TurnoRow';
import { TurnoDetalle } from '@/features/turnos/TurnoDetalle';

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

  const [abierto, setAbierto] = useState<string | null>(null);
  const turno = abierto ? d.turnos.find((x) => x.id == abierto) ?? d.turnosBaja.find((x) => x.id == abierto) : undefined;
  const fila = (x: Turno, conFecha = false) => <TurnoRow key={x.id} d={d} t={x} conFecha={conFecha} onOpen={(t) => setAbierto(t.id)} />;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Inicio</h1>
        <p className="text-sm text-muted first-letter:uppercase">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* Lo importante, grande: cuánto se facturó hoy, la ganancia y la caja. */}
      <Destacado label="Facturación hoy" value={fmt(h.ingresos)} hint={pc == null ? undefined : <span className={pc >= 0 ? 'text-ok' : 'text-ko'}>{pc >= 0 ? '▲' : '▼'} {Math.abs(pc)}% vs ayer</span>} />
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Ganancia estimada" value={fmt(h.neto)} tone={h.neto >= 0 ? 'ok' : 'ko'} />
        <Kpi label="En caja" value={d.cajaAbierta ? (caja.data ? fmt(caja.data.esperado) : '…') : 'Cerrada'} tone="accent" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
        <div className="space-y-4 lg:col-span-3 lg:space-y-6">
          <ListaCorta title="Turnos de hoy" items={hoy} render={(x) => fila(x)} vacio={<Empty>No hay turnos hoy.</Empty>} />
        </div>
        <div className="space-y-3 lg:col-span-2">
          {pend.length > 0 && (
            <Plegable title="Solicitudes pendientes" resumen={`${pend.length} para confirmar`} tone="warn" icono={<Bell size={18} />}>
              {pend.map((x) => fila(x, true))}
            </Plegable>
          )}
          {manana.length > 0 && (
            <Plegable title="Recordatorios de mañana" resumen={`${manana.length} ${manana.length == 1 ? 'turno' : 'turnos'} para avisar por WhatsApp`} icono={<MessageCircle size={18} />}>
              <p className="mb-2 text-sm text-muted">Se abre WhatsApp con el mensaje listo; solo tocás enviar.</p>
              {manana.map((x) => (
                <Row key={x.id} left={<><span className="num text-muted">{x.hora}</span> · {x.cliente}</>} sub={turnoSub(x)}
                  right={L.numeroWhatsApp(x.telefono) ? (
                    <a className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ok/10 px-3 text-xs font-medium text-ok" target="_blank" rel="noopener"
                      href={L.linkWhatsApp(x.telefono, `Hola ${x.cliente}! Te recordamos tu turno en Barber Hood mañana a las ${x.hora}. Si no podés venir, avisanos. ¡Te esperamos!`)}>
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  ) : <span className="text-xs text-subtle">sin teléfono</span>} />
              ))}
            </Plegable>
          )}
          <Plegable title="Más números de hoy" resumen="Cobrado, gastos, comisiones y últimos 7 días" icono={<BarChart3 size={18} />}>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <Kpi label="Facturación hoy" value={fmt(h.ingresos)} />
              <Kpi label="Cobrado hoy" value={fmt(L.cobradoEnFecha(d, t))} tone="ok" />
              <Kpi label="Gastos hoy" value={fmt(h.gastosFijos + h.gastosVariables)} tone="ko" />
              <Kpi label="Ganancia estimada" value={fmt(h.neto)} tone={h.neto >= 0 ? 'ok' : 'ko'} />
              <Kpi label="Comisiones pendientes" value={fmt(L.comisionPendiente(d))} />
              <Kpi label="En caja" value={d.cajaAbierta ? (caja.data ? fmt(caja.data.esperado) : '…') : 'Cerrada'} tone="accent" />
            </div>
            <p className="mb-2 text-sm font-semibold">Últimos 7 días · facturación</p>
            <Bars labels={dias.map((x) => x[0])} values={dias.map((x) => x[1])} format={(n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)))} />
          </Plegable>
          <Plegable title="Barberos hoy" resumen={ranking.length ? `${ranking[0].nombre} va primero · ${fmt(ranking[0].facturacion)}` : 'Sin barberos cargados'} icono={<Users size={18} />}>
            {ranking.length ? ranking.map((s) => (
              <Row key={s.id} left={s.nombre} sub={`${s.cortes} cortes · comisión ${fmt(s.comision)}`} right={fmt(s.facturacion)} />
            )) : <Empty>Cargá barberos en Ajustes.</Empty>}
          </Plegable>
          {bajo.length > 0 && (
            <Plegable title="Poco stock" resumen={`${bajo.length} ${bajo.length == 1 ? 'producto' : 'productos'} por reponer`} tone="ko" icono={<AlertTriangle size={18} />}>
              {bajo.map((p) => <Row key={p.id} left={p.nombre} right={<span className="text-ko">{p.stock} u.</span>} />)}
            </Plegable>
          )}
        </div>
      </div>
      {turno && <TurnoDetalle key={turno.id} d={d} t={turno} owner me={null} onClose={() => setAbierto(null)} />}
    </div>
  );
}
