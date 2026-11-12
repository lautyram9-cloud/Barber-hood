import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as C from '@/domain/clientes';
import { fixtures, soloBarbero } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X, fmt = L.formatoPesos;
const MOMENTOS = ['2026-11-12T15:37:00-03:00', '2027-02-20T10:00:00-03:00'];

for (const momento of MOMENTOS) for (const seed of [1, 3, 42, 2026]) for (const rol of ['owner', 'barber'] as const) {
  describe(`clientes · semilla ${seed} · ${momento} · ${rol}`, () => {
    const now = Date.parse(momento), all = fixtures(seed, momento.replace(/^2027-02-20/, '2026-11-12'));
    const tables = rol == 'owner' ? all : soloBarbero(all);
    let lg: Legacy, d: AppData;
    beforeAll(async () => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
      lg = await loadLegacy(tables, { now, owner: rol == 'owner', meBarberoId: rol == 'barber' ? all.barberos![0].id : undefined });
      d = buildAppData(tables);
    });
    afterAll(() => vi.useRealTimers());

    it('lista, búsqueda y filtros idénticos (HTML completo)', () => {
      for (const q of ['', 'cliente 1', 'CLIENTE', '0387', '15', 'xyz']) for (const [f] of C.FILTROS) {
        lg.run(`S.cq=${js(q)};S.cf=${js(f)}`);
        const L2 = C.listaClientes(d, q, f);
        const esperado = L2.map((s) => `<div class="r" data-a="cdet" data-i="${s.cliente.id}"><span>${s.cliente.nombre}<br><small>${s.cliente.telefono || 'sin teléfono'} · ${s.visitas} visitas${s.dias != null ? ' · hace ' + s.dias + ' d' : ''}</small></span><b>${fmt(s.total)}</b></div>`).join('') || '<p class="mu">Sin clientes.</p>';
        expect(esperado, `búsqueda "${q}" filtro "${f}"`).toBe(lg.run('clist()'));
      }
    });

    it('ficha del cliente idéntica', () => {
      for (const c of d.clientes) {
        lg.run(`A.cdet({i:${js(c.id)}})`);
        const h = lg.run<string>(`$('#sh').innerHTML`), s = L.statsCliente(d, c);
        expect(h).toContain(`<small>Total gastado</small><b>${fmt(s.total)}</b></div><div><small>Visitas</small><b>${s.visitas}</b></div><div><small>Última visita</small><b>${s.ultima ? s.ultima.slice(5) : '—'}</b>`);
        expect(h.includes('Viene cada')).toBe(!!s.frecuencia);
        if (s.frecuencia) expect(h).toContain(`Viene cada ${s.frecuencia} días en promedio`);
        expect(h.includes('Reactivar por WhatsApp')).toBe(C.ofrecerReactivar(c, s.dias));
        if (C.ofrecerReactivar(c, s.dias)) expect(h).toContain(L.linkWhatsApp(c.telefono, C.mensajeReactivar(c)).replace(/&/g, '&amp;'));
        const EST: Record<string, string> = { pendiente: '⏳', confirmado: '✔️', atendido: '💈', cancelado: '✕', ausente: '⚠️' };
        const prox = C.proximosTurnos(d, c).map((t) => `<div class="r"><span>${t.fecha.slice(5)} ${t.hora} · ${t.servicios}</span><b>${EST[t.estado] ?? ''}</b></div>`).join('');
        expect(h).toContain(`<h3 style="margin-top:14px">Próximos turnos</h3>${prox || '<p class="mu">Ninguno.</p>'}<h3`);
        const hist = C.historialCliente(d, c);
        expect(h).toContain('<h3 style="margin-top:14px">Historial de servicios</h3>' + (hist.map((m) => `<div class="r"><span>${m.fecha.slice(5)} · ${m.concepto}<br><small>${L.nombreBarbero(d, m.barberoId)}</small></span><b>${fmt(m.monto)}</b></div>`).join('') || '<p class="mu">Sin servicios.</p>') + '<button class="mi" data-a="close"');
      }
    });

    it('guardar preferencias y observaciones envía lo mismo', async () => {
      const c = d.clientes[0];
      for (const [p, o] of [['degradé 2', 'alérgico'], ['', ''], ['solo pref', '']]) {
        const v = grabador(), n = grabador();
        lg.set('__rec', v.db); lg.set('__dom', { cpf: p, cob: o }); lg.run('sb=__rec');
        await lg.run(`A.csave({i:${js(c.id)}})`);
        await C.guardarCliente(n.db, c.id, p, o);
        expect(J(n.llamadas)).toEqual(J(v.llamadas));
      }
    });
  });
}
