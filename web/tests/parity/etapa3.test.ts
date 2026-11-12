import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import { fixtures, soloBarbero } from '../fixtures';
import { loadLegacy, type Legacy } from './legacy-harness';

// Etapa 3: Estadísticas, Barberos y Mi perfil.
// Se le pide a la versión ESTABLE que genere su HTML y se verifica que cada valor que
// calcula la versión nueva aparezca exactamente igual. El CSV se compara byte a byte.

const fmt = L.formatoPesos, js = JSON.stringify;
const MOMENTOS = ['2026-11-12T15:37:00-03:00', '2026-03-31T23:30:00-03:00'];
const SEMILLAS = [1, 3, 42, 2026];
const PERIODOS = ['dia', 'sem', 'mes', 'ano'] as const;

function expectIn(html: string, frag: string, que: string) {
  if (!html.includes(frag)) throw new Error(`No coincide "${que}". Se esperaba en el HTML de la versión estable:\n${frag}`);
}

for (const momento of MOMENTOS) for (const seed of SEMILLAS) {
  describe(`etapa 3 · semilla ${seed} · ${momento}`, () => {
    const now = Date.parse(momento), all = fixtures(seed, momento);
    let owner: Legacy, barber: Legacy, d: AppData, db: AppData;
    beforeAll(async () => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
      owner = await loadLegacy(all, { now, owner: true });
      barber = await loadLegacy(soloBarbero(all), { now, owner: false, meBarberoId: all.barberos![0].id });
      d = buildAppData(all); db = buildAppData(soloBarbero(all));
    });
    afterAll(() => vi.useRealTimers());

    it('Estadísticas: mismos valores que la versión estable', () => {
      for (const per of PERIODOS) for (const ref of [L.today(), '2026-02-27']) {
        owner.run(`S.per=${js(per)};S.ref=${js(ref)}`);
        const html = owner.run<string>('V.est()'), [a, b] = L.rango(per, ref), r = L.resultado(d, a, b);
        const q = (p: L.Periodo) => L.resultado(d, ...L.rango(p, ref)).ingresos;
        expectIn(html, `<small>Hoy</small><b>${fmt(q('dia'))}</b>`, 'Hoy');
        expectIn(html, `<small>Semana</small><b>${fmt(q('sem'))}</b>`, 'Semana');
        expectIn(html, `<small>Mes</small><b>${fmt(q('mes'))}</b>`, 'Mes');
        const filas: [string, number][] = [['Facturación', r.ingresos], ['   · Cobrado', r.cobrado], ['   · Pendiente de cobro', r.pendiente], ['Gastos fijos', r.gastosFijos],
          ['Gastos variables', r.gastosVariables], ['Costo de productos vendidos', r.costoProductos], ['Pérdidas de mercadería', r.perdidas], ['Comisiones generadas', r.comisiones],
          ['Comisiones pagadas', L.comisionesPagadas(d, a, b)], ['Comisiones pendientes (acumulado)', L.comisionPendiente(d)], ['Ticket promedio', r.operaciones ? r.ingresos / r.operaciones : 0]];
        for (const [k, v] of filas) expectIn(html, `<span>${k}</span><b>${fmt(v)}</b>`, k);
        expectIn(html, `<b>Ganancia real estimada</b><b class="${r.neto >= 0 ? 'pos' : 'neg'}">${fmt(r.neto)}</b>`, 'Ganancia');
        const sv = L.serviciosVendidos(d, a, b);
        expectIn(html, `<h3>Servicios: más vendidos y margen</h3>${sv.map((s) => `<div class="r"><span>${s.nombre}<br><small>${s.cantidad} servicios · ${fmt(s.ingresos)} · margen ${fmt(s.margen)} (${s.margenPct}%)</small></span><b>${s.cantidad}</b></div>`).join('') || '<p class="mu">Sin servicios.</p>'}</div>`, 'servicios vendidos');
        const c = L.clientesNuevosRecurrentes(d, a, b);
        expectIn(html, `<span>Nuevos</span><b>${c.nuevos}</b>`, 'clientes nuevos');
        expectIn(html, `<span>Recurrentes</span><b>${c.recurrentes}</b>`, 'clientes recurrentes');
        const h = L.demandaPorHora(d, a, b);
        if (h.length) expectIn(html, owner.run(`bars(${js(h.map((x) => x[0] + 'h'))},${js(h.map((x) => x[1]))})`), 'demanda por hora');
        const ms = L.ultimosMeses(6, ref), R = ms.map((m) => L.resultado(d, m + '-01', m + '-31')), lab = js(ms.map(L.nombreMes));
        expectIn(html, owner.run(`bars(${lab},${js(R.map((x) => x.ingresos))})`), 'facturación por mes');
        expectIn(html, owner.run(`bars(${lab},${js(R.map((x) => Math.max(0, x.neto)))})`), 'ganancia por mes');
        expectIn(html, owner.run(`line(${lab},${js(R.map((x) => (x.ingresos ? (x.neto / x.ingresos) * 100 : 0)))})`), 'rentabilidad');
        expectIn(html, owner.run(`bars2(${lab},${js(R.map((x) => x.ingresos))},${js(R.map(L.gastosTotales))})`), 'ingresos vs gastos');
        // Comparación con el período anterior
        const q0 = L.resultado(d, ...L.rangoAnterior(per, ref));
        for (const [k, x, y] of [['Facturación', r.ingresos, q0.ingresos], ['Gastos', r.gastosFijos + r.gastosVariables, q0.gastosFijos + q0.gastosVariables], ['Ganancia estimada', r.neto, q0.neto]] as const)
          expectIn(html, `<span>${k}<br><small>antes ${fmt(y)}</small></span><b>${fmt(x)} <small class="${x >= y ? 'ing' : 'gas'}">${L.variacion(x, y)}</small></b>`, 'comparación ' + k);
        expectIn(html, `<span>Rentabilidad<br><small>antes ${L.rentabilidad(q0)}%</small></span><b>${L.rentabilidad(r)}%</b>`, 'rentabilidad vs anterior');
        expectIn(html, `<span>Cantidad de servicios</span><b>${L.serviciosVendidos(d, a, b).reduce((t, s) => t + s.cantidad, 0)}</b>`, 'cantidad de servicios');
        const top = L.serviciosMayorMargen(d, a, b);
        expectIn(html, '<h3>Servicios con mayor margen</h3>' + (top.map((x) => `<div class="r"><span>${x.nombre}<br><small>${x.margenPct}% de margen</small></span><b>${fmt(x.margen)}</b></div>`).join('') || '<p class="mu">Sin servicios.</p>') + '</div>', 'mayor margen');
        const BR = d.barberos.map((x) => L.statsBarbero(d, x.id, a, b)).sort((u, w) => w.facturacion - u.facturacion);
        expectIn(html, '<h3>Rendimiento por barbero</h3>' + BR.map((x) => `<div class="r"><span>${x.nombre}<br><small>${x.cortes} cortes · comisión ${fmt(x.comision)}</small></span><b>${fmt(x.facturacion)}</b></div>`).join('') + '</div>', 'rendimiento por barbero');
      }
    });

    it('Barberos y Mi perfil: mismas fichas y ranking', () => {
      const ficha = (lg: Legacy, data: AppData, id: string, a: string, b: string, ref: string) => {
        const html = lg.run<string>(`bcard(${js(id)})`), s = L.statsBarbero(data, id, a, b), p = L.asistenciaPct(s);
        expectIn(html, `<small>Cortes</small><b>${s.cortes}</b></div><div><small>Facturación</small><b>${fmt(s.facturacion)}</b></div><div><small>Comisión</small><b>${fmt(s.comision)}</b>`, 'KPIs ficha');
        expectIn(html, `Servicios ${fmt(s.servicios)} · Productos ${fmt(s.productos)} (${s.unidadesProducto} u.)`, 'servicios/productos');
        expectIn(html, `<span>Promedio de clientes por día</span><b>${s.promedioDiario.toFixed(1)}</b>`, 'promedio');
        expectIn(html, `<span>Comisión pendiente de liquidar (acumulada)</span><b>${fmt(L.comisionPendiente(data, id))}</b>`, 'pendiente');
        expectIn(html, `<span>Puntualidad / asistencia</span><b>${p.puntualidad == null ? '—' : p.puntualidad + '% / ' + p.asistencia + '%'}</b>`, 'asistencia');
        const g = Object.entries(s.serviciosPorNombre).sort((x, y) => y[1] - x[1]);
        expectIn(html, '<small>Servicios realizados</small>' + (g.map((x) => `<div class="r"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('') || '<p class="mu">Sin servicios.</p>') + '\n<small>Rendimiento mensual</small>', 'servicios realizados');
        const ms = L.ultimosMeses(6, ref);
        expectIn(html, lg.run(`bars(${js(ms.map(L.nombreMes))},${js(ms.map((m) => L.statsBarbero(data, id, m + '-01', m + '-31').facturacion))})`), 'rendimiento mensual');
        const liq = data.liquidaciones.filter((x) => x.barberoId == id).sort((x, y) => y.ts - x.ts).slice(0, 8);
        expectIn(html, '<small>Historial de liquidaciones</small>' + (liq.map((x) => `<div class="r"><span>${x.fecha} <small>${x.desde || ''} → ${x.hasta || ''}</small></span><b>${fmt(x.monto)}</b></div>`).join('') || '<p class="mu">Sin liquidaciones.</p>') + '\n', 'liquidaciones');
      };
      for (const per of PERIODOS) for (const ref of [L.today(), '2026-02-27']) {
        const [a, b] = L.rango(per, ref);
        owner.run(`S.per=${js(per)};S.ref=${js(ref)}`); barber.run(`S.per=${js(per)};S.ref=${js(ref)}`);
        const html = owner.run<string>('V.bar()');
        const R = d.barberos.map((x) => L.statsBarbero(d, x.id, a, b)).sort((x, y) => y.facturacion - x.facturacion);
        expectIn(html, '<h3>Ranking de barberos</h3>' + R.map((s, i) => `<div class="r"><span>${['🥇', '🥈', '🥉'][i] || i + 1 + '.'} ${s.nombre}<br><small>${s.cortes} cortes · prom. ${s.promedioDiario.toFixed(1)}/día</small></span><b>${fmt(s.facturacion)}</b></div>`).join(''), 'ranking');
        expectIn(html, owner.run(`bars(${js(R.map((s) => s.nombre.slice(0, 8)))},${js(R.map((s) => s.facturacion))})`), 'barras ranking');
        for (const x of d.barberos) ficha(owner, d, x.id, a, b, ref);
        ficha(barber, db, all.barberos![0].id, a, b, ref); // Mi perfil (datos que ve el barbero)
      }
      const me = all.barberos![0].id, marcada = db.asistencia.some((x) => x.barberoId == me && x.fecha == L.today());
      expect(barber.run<string>('V.me()')).toContain(marcada ? 'Asistencia marcada hoy' : 'Marcar mi asistencia');
    });

    it('Exportación CSV idéntica byte a byte', async () => {
      owner.run('fileOut=(n,m,t,bom)=>{globalThis.__f={n,m,t,bom}}');
      for (const per of PERIODOS) {
        owner.run(`S.per=${js(per)};S.ref=${js(L.today())}`);
        const [a, b] = L.rango(per, L.today());
        for (const tipo of ['mov', 'liq', 'tur', 'cli', 'stk'] as const) {
          await owner.run(`A.csv({i:${js(tipo)}})`);
          const f = owner.json<{ n: string; m: string; t: string; bom: boolean }>('__f'), x = L.csvExport(d, tipo, a, b);
          expect(x.nombre).toBe(f.n);
          expect(L.aCsv(x.filas)).toBe(f.t);
          expect(f.bom).toBe(true);
        }
      }
    });
  });
}
