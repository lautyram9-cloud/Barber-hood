import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PublicInfo } from '@/lib/database.types';
import * as L from '@/domain/logic';
import * as R from '@/domain/reserva';
import { fixtures } from '../fixtures';
import { grabador } from '../recorder';
import { loadLegacy, type Legacy } from './legacy-harness';

const js = JSON.stringify, J = <X,>(x: X) => JSON.parse(JSON.stringify(x)) as X;

for (const momento of ['2026-11-12T15:37:00-03:00', '2026-11-15T21:50:00-03:00']) for (const seed of [1, 3, 42, 2026]) describe(`reserva pública · semilla ${seed} · ${momento}`, () => {
  const now = Date.parse(momento), all = fixtures(seed, momento);
  const info: PublicInfo = {
    barberos: all.barberos!.filter((b) => b.activo).map((b) => ({ id: b.id, nombre: b.nombre, slot_min: b.slot_min })),
    servicios: all.servicios!.filter((s) => s.activo).map((s) => ({ id: s.id, nombre: s.nombre, precio: s.precio, dur: s.duracion_min })),
    horarios: all.horarios!.map((h) => ({ dia: h.dia, desde: h.desde, hasta: h.hasta })),
    ocupados: all.turnos!.filter((t) => !['cancelado', 'ausente'].includes(t.estado)).map((t) => ({ i: t.inicio, f: new Date(Date.parse(t.inicio) + t.duracion_min * 6e4).toISOString().slice(0, 19), b: t.barbero_id })),
  };
  let lg: Legacy;
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    lg = await loadLegacy({}, { now, owner: false });
    lg.set('__info', info);
    lg.run(`S.pub=true;S.turnos=[];sb={rpc:()=>Promise.resolve({data:__info,error:null})}`);
    await lg.run('bootPub()');
  });
  afterAll(() => vi.useRealTimers());

  it('mismos horarios libres y mismo barbero asignado', () => {
    const { ctx, servicios } = R.desdeInfoPublica(info);
    expect(J(ctx.turnos)).toEqual(lg.json('S.turnos.map(t=>({fecha:t.f,hora:t.h,barberoId:t.b,duracionMin:t.d}))'));
    expect(L.proximoDiaAbierto(ctx)).toBe(lg.run('nextOpen()'));
    for (let i = 0; i < 8; i++) {
      const f = L.isoLocal(new Date(now + i * 864e5));
      for (const b of ['', ...info.barberos.map((x) => x.id)]) for (const ds of [[], servicios.slice(0, 1), servicios.slice(0, 2)]) {
        const dsL = js(ds.map((s) => ({ dur: s.duracionMin })));
        expect(L.horariosLibres(ctx, f, b, ds)).toEqual(lg.json(`slots(${js(f)},${js(b)},${dsL})`));
        for (const h of L.horariosLibres(ctx, f, b, ds).slice(0, 2)) expect(L.elegirBarbero(ctx, f, h, b, ds)).toBe(lg.run(`pick(${js(f)},${js(h)},${js(b)},${dsL})`));
      }
    }
  });

  it('enviar reserva: mismo pedido o mismo error', async () => {
    const { ctx, servicios } = R.desdeInfoPublica(info), f = L.proximoDiaAbierto(ctx), h = L.horariosLibres(ctx, f, '', servicios.slice(0, 1))[0] ?? '';
    const casos: R.Reserva[] = [
      { nombre: 'Ana', telefono: '3874123456', fecha: f, hora: h, barbero: '', servicios: servicios.slice(0, 1), notas: 'primera vez' },
      { nombre: ' Leo ', telefono: ' 387 ', fecha: f, hora: h, barbero: info.barberos[0].id, servicios: servicios.slice(0, 2), notas: '' },
      { nombre: '', telefono: '1', fecha: f, hora: h, barbero: '', servicios: servicios.slice(0, 1), notas: '' },
      { nombre: 'Sin servicio', telefono: '1', fecha: f, hora: h, barbero: '', servicios: [], notas: '' },
      { nombre: 'Hora tomada', telefono: '1', fecha: f, hora: '03:00', barbero: '', servicios: servicios.slice(0, 1), notas: '' },
    ];
    for (const x of casos) {
      const v = grabador(), n = grabador();
      lg.set('__rec', v.db); lg.set('__lastToast', '');
      lg.set('__dom', { rn: x.nombre, rt: x.telefono, rf: x.fecha, rh: x.hora, rb: x.barbero, rnn: x.notas });
      lg.run(`sb=__rec;S.sel=${js(x.servicios.map((s) => s.id))}`);
      await lg.run('A.addres()');
      const p = R.prepararReserva(ctx, x);
      if ('barbero' in p) await R.enviarReserva(n.db as never, x, p.barbero);
      else expect(p.error).toBe(lg.run('__lastToast'));
      expect(J(n.llamadas)).toEqual(J(v.llamadas));
    }
  });
});
