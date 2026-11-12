// Graba las llamadas a la base (from/insert/update/eq/select/single/rpc) sin conectarse a nada.
// Sirve para comparar lo que envía la versión estable con lo que envía la nueva.
export interface Llamada { tabla?: string; ops?: unknown[][]; rpc?: string; args?: unknown }
export function grabador(resp: { rpc?: Record<string, unknown>; single?: unknown } = {}) {
  const llamadas: Llamada[] = [];
  const from = (tabla: string) => {
    const ops: unknown[][] = [];
    llamadas.push({ tabla, ops });
    const b: object = new Proxy({}, {
      get(_, k) {
        if (k === 'then') return (res: (x: unknown) => void) => res({ data: ops.some((o) => o[0] === 'single') ? resp.single : null, error: null });
        return (...args: unknown[]) => { ops.push([k, ...args]); return b; };
      },
    });
    return b;
  };
  const rpc = (fn: string, args?: unknown) => { llamadas.push({ rpc: fn, args }); return Promise.resolve({ data: resp.rpc?.[fn] ?? null, error: null }); };
  return { llamadas, db: { from, rpc } };
}
