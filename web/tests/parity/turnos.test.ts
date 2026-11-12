import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppData } from '@/domain/build';
import type { AppData, Turno } from '@/domain/model';
import * as L from '@/domain/logic';
import * as T from '@/domain/turnos';
import { fixtures, soloBarbero } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

// Turnos: vistas, permisos y TODO lo que se envía a la base debe ser idéntico a la versión estable.
const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X;
const MOMENTOS = ['2026-11-12T15:37:00-03:00', '2026-11-15T09:10:00-03:00'];
const SEMILLAS = [1, 3, 7, 42, 2026];

function expectIn(html: string, frag: string, que: string) {
  if (!html.includes(frag)) throw new Error(`No coincide "${que}". Se esperaba en el HTML de la versión estable:\n${frag}\n--- HTML ---\n${html.slice(0, 3000)}`);
}

for (const momento of MOMENTOS) for (const seed of SEMILLAS) {
  describe(`turnos · semilla ${seed} · ${momento}`, () => {
    const now = Date.parse(momento), all = fixtures(seed, momento), me = all.barberos![0].id;
    let owner: Legacy, barber: Legacy, d: AppData, db: AppData;
    beforeAll(async () => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
      owner = await loadLegacy(all, { now, owner: true });
      barber = await loadLegacy(soloBarbero(all), { now, owner: false, meBarberoId: me });
      d = buildAppData(all); db = buildAppData(soloBarbero(all));
    });
    afterAll(() => vi.useRealTimers());
    const trows = (lg: Legacy, ts: Turno[]) => lg.run<string>(`${js(ts.map((t) => t.id))}.map(id=>S.turnos.find(t=>t.id==id)||S.tcan.find(t=>t.id==id)).map(trow).join('')`);

    it('agenda, solicitudes, calendario y bajas iguales (dueño)', () => {
      for (const vista of ['dia', 'sem', 'mes'] as const) for (const ref of [L.today(), L.isoLocal(new Date(now + 3 * 864e5))]) for (const tb of ['', ...d.barberos.map((b) => b.id)]) {
        owner.run(`S.tv=${js(vista)};S.ref=${js(ref)};S.tb=${js(tb)}`);
        const html = owner.run<string>('V.tur()'), [a, b] = T.rangoAgenda(vista, ref), G = T.agenda(d, vista, ref, tb);
        const cuerpo = G.length ? G.map((g) => `<small>${g.titulo}</small>${trows(owner, g.turnos)}`).join('') : '<p class="mu">Sin turnos.</p>';
        expectIn(html, `<h3>Agenda ${vista == 'sem' ? a.slice(5) + ' → ' + b.slice(5) : ref.slice(5)}</h3>${cuerpo}</div>`, `agenda ${vista} ${ref} ${tb}`);
        const pen = T.solicitudesPendientes(d);
        if (pen.length) expectIn(html, `<h3>Solicitudes pendientes (${pen.length})</h3>${trows(owner, pen)}</div>`, 'pendientes');
        else expect(html).not.toContain('Solicitudes pendientes');
        expectIn(html, `<h3>Cancelados y ausentes</h3>${trows(owner, T.turnosDeBaja(d)) || '<p class="mu">Sin cancelaciones.</p>'}</div>`, 'bajas');
        if (vista == 'mes') {
          const leg = [...owner.run<string>('mgrid()').matchAll(/data-i="(\d{4}-\d\d-\d\d)"[^>]*>(\d+)(?:<em>(\d+)<\/em>)?/g)].map((m) => [m[1], +m[2], m[3] ? +m[3] : 0]);
          expect(T.conteoMes(d, ref, tb).dias.map((x) => [x.fecha, x.dia, x.turnos])).toEqual(leg);
          expect(owner.run<string>('mgrid()').split('<i></i>').length - 1).toBe(T.conteoMes(d, ref, tb).offset);
        }
      }
    });

    it('vista del barbero y permisos de gestión iguales', () => {
      const ids = [...barber.run<string>('turMe()').matchAll(/<div class="r" data-a="tdet" data-i="([^"]+)">/g)].map((m) => m[1]);
      expect(T.turnosDelBarbero(db, me).map((t) => t.id)).toEqual(ids);
      for (const [lg, data, owner_, yo] of [[owner, d, true, null], [barber, db, false, me]] as const) {
        for (const t of data.turnos.concat(data.turnosBaja)) {
          lg.run(`A.tdet({i:${js(t.id)}})`);
          const sh = lg.run<string>(`$('#sh').innerHTML`);
          expect(T.puedeGestionar(t, owner_, yo), `permiso turno ${t.id} (${t.estado})`).toBe(sh.includes('data-a="tcob"'));
          expect(sh.includes('data-e="confirmado"')).toBe(T.puedeGestionar(t, owner_, yo) && t.estado == 'pendiente');
        }
      }
    });

    it('crear turno envía exactamente lo mismo (o el mismo error)', async () => {
      const c = T.agendaCtx(d), f = L.proximoDiaAbierto(c), libres = L.horariosLibres(c, f, '');
      const casos: T.NuevoTurno[] = [
        { fecha: f, horaLista: libres[0] ?? '', horaManual: '', barbero: '', servicios: d.servicios.slice(0, 1), cliente: 'Juan Pérez', telefono: '387 154-123456', notas: '' },
        { fecha: f, horaLista: libres[1] ?? '', horaManual: '', barbero: d.barberos[0].id, servicios: d.servicios.slice(0, 2), cliente: 'Cliente 1 · 3871500000', telefono: '3871500000', notas: 'trae foto' },
        { fecha: f, horaLista: '', horaManual: '21:15', barbero: d.barberos[1].id, servicios: d.servicios.slice(1, 3), cliente: '  Ana  ', telefono: '', notas: '' },
        { fecha: f, horaLista: libres[2] ?? '', horaManual: '', barbero: '', servicios: [], cliente: 'Sin servicio', telefono: '', notas: '' },
        { fecha: f, horaLista: '', horaManual: '', barbero: '', servicios: d.servicios.slice(0, 1), cliente: '', telefono: '', notas: '' },
      ];
      for (const x of casos) {
        const viejo = grabador({ single: { id: 'turno-nuevo' }, rpc: { cliente_upsert: 'cli-nuevo' } });
        owner.set('__rec', viejo.db); owner.set('__lastToast', '');
        owner.set('__dom', { tf: x.fecha, th: x.horaLista, thm: x.horaManual, tb: x.barbero, tc: x.cliente, tp: x.telefono, tn: x.notas });
        owner.run(`sb=__rec;S.sel=${js(x.servicios.map((s) => s.id))}`);
        await owner.run('A.addtur()');
        const err = T.validarNuevoTurno(x);
        expect(err ?? '').toBe(err ? owner.run('__lastToast') : '');
        const nuevo = grabador({ single: { id: 'turno-nuevo' }, rpc: { cliente_upsert: 'cli-nuevo' } });
        if (!err) await T.crearTurno(nuevo.db, c, x);
        expect(J(nuevo.llamadas)).toEqual(J(viejo.llamadas));
        if (!err) expect(viejo.llamadas.length).toBe(3);
      }
    });

    it('confirmar, cancelar, ausente, nota, cobrar, reprogramar y asignarme envían lo mismo', async () => {
      const t = d.turnos[0] ?? d.turnosBaja[0], c = T.agendaCtx(d);
      const comparar = async (lg: Legacy, legacyCall: string, dom: Record<string, string>, nueva: (db: T.Db) => Promise<unknown>) => {
        const v = grabador(), n = grabador();
        lg.set('__rec', v.db); lg.set('__dom', dom); lg.run('sb=__rec');
        await lg.run(legacyCall); await nueva(n.db);
        expect(J(n.llamadas)).toEqual(J(v.llamadas));
        expect(v.llamadas.length).toBeGreaterThan(0);
      };
      for (const e of ['confirmado', 'cancelado', 'ausente'])
        for (const nota of ['', 'llega tarde'])
          await comparar(owner, `A.tact({i:${js(t.id)},e:${js(e)}})`, { tn: nota }, (x) => T.cambiarEstado(x, t.id, e, nota));
      await comparar(owner, `A.tnota({i:${js(t.id)}})`, { tn: 'nota nueva' }, (x) => T.guardarNota(x, t.id, 'nota nueva'));
      await comparar(owner, `A.tnota({i:${js(t.id)}})`, { tn: '' }, (x) => T.guardarNota(x, t.id, ''));
      for (const medio of ['', 'efectivo', 'transferencia'])
        await comparar(owner, `A.tcob({i:${js(t.id)}})`, { tmp: medio }, (x) => T.cobrarTurno(x, t.id, medio));
      await comparar(owner, `A.treprog({i:${js(t.id)}})`, { rd: '2026-12-01', rh2: '11:30', rb2: d.barberos[1].id }, (x) => T.reprogramar(x, t.id, '2026-12-01', '11:30', d.barberos[1].id));
      await comparar(owner, `A.treprog({i:${js(t.id)}})`, { rd: '2026-12-01', rh2: '11:30', rb2: '' }, (x) => T.reprogramar(x, t.id, '2026-12-01', '11:30', ''));
      await comparar(barber, `A.asig({i:${js(t.id)}})`, {}, (x) => T.asignarme(x, T.agendaCtx(db), t.id, me));
      void c;
    });
  });
}
