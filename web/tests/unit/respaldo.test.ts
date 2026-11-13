import { describe, expect, it } from 'vitest';
import { faltantes, leerRespaldo, restaurarRespaldo, TABLAS_RESPALDO } from '@/domain/ajustes';

describe('restaurar copia de seguridad', () => {
  it('acepta el formato que genera la propia app', () => {
    const r = leerRespaldo(JSON.stringify({ fecha: 'x', version: 1, ingresos: [{ id: 'a' }] }));
    expect('respaldo' in r).toBe(true);
  });
  it.each([
    ['no es JSON', 'hola', 'El archivo no es una copia válida'],
    ['no es objeto', '[1,2]', 'El archivo no es una copia de Barber Hood'],
    ['otra versión', '{"version":2,"ingresos":[]}', 'El archivo no es una copia de Barber Hood'],
    ['sin tablas', '{"version":1}', 'La copia no tiene datos'],
    ['tabla que no es lista', '{"version":1,"ingresos":[],"turnos":5}', 'La copia está dañada'],
  ])('rechaza: %s', (_n, txt, msg) => expect(leerRespaldo(txt)).toEqual({ error: msg }));

  it('resume solo lo que falta y respeta el orden de las tablas', () => {
    const f = faltantes({ turnos: 1, ingresos: 3, clientes: 0, desconocida: 9 });
    expect(f.total).toBe(4);
    expect(f.filas.map((x) => x.tabla)).toEqual(['turnos', 'ingresos']);
    expect(f.texto).toBe('turnos: 1, ingresos: 3');
    expect(faltantes({}).total).toBe(0);
  });

  it('las tablas del SQL (etapa 10) son exactamente las de la copia', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync(new URL('../../../supabase/etapa10-restaurar-respaldo.sql', import.meta.url), 'utf8');
    const orden = sql.match(/orden text\[\] := array\[([^\]]+)\]/s)![1].match(/'(\w+)'/g)!.map((x) => x.replace(/'/g, ''));
    expect([...orden].sort()).toEqual([...TABLAS_RESPALDO].sort());
  });

  it('llama a la función con la copia y el modo', async () => {
    const llamadas: unknown[] = [];
    const db = { rpc: async (fn: string, args: unknown) => { llamadas.push([fn, args]); return { error: null, data: { ingresos: 1 } }; } };
    const res = await restaurarRespaldo(db as never, { version: 1 }, true);
    expect(res).toEqual({ ingresos: 1 });
    expect(llamadas).toEqual([['restaurar_respaldo', { p: { version: 1 }, p_aplicar: true }]]);
  });
});
