import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TableName } from '@/lib/database.types';
import { tableKey } from './data';
import { Button } from '@/components/ui';

// Avisos breves (toast), confirmaciones y ejecución de acciones con el mismo manejo
// de errores que la versión estable (errm). Tras guardar, recarga solo las tablas afectadas.

export function mensajeError(x: unknown) {
  const e = x as { code?: string; message?: string };
  return e?.code == '23P01' ? 'Ese horario ya está ocupado' : e?.code == '23505' ? 'Ese registro ya existe' : e?.code == 'P0001' ? String(e.message) : 'No se pudo guardar';
}

interface Confirm { titulo: string; texto?: string; accion: string; peligro?: boolean; resolve(ok: boolean): void }
interface Ctx { toast(m: string): void; confirmar(c: Omit<Confirm, 'resolve'>): Promise<boolean> }
const FeedbackCtx = createContext<Ctx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [conf, setConf] = useState<Confirm | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 2600); }, []);
  const confirmar = useCallback((c: Omit<Confirm, 'resolve'>) => new Promise<boolean>((resolve) => setConf({ ...c, resolve })), []);
  const cerrar = (ok: boolean) => { conf?.resolve(ok); setConf(null); };

  return (
    <FeedbackCtx.Provider value={{ toast, confirmar }}>
      {children}
      {msg && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-8">
          <p className="rounded-full border border-line-strong bg-surface-2/95 px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur">{msg}</p>
        </div>
      )}
      {conf && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="alertdialog" aria-modal="true" aria-label={conf.titulo} onKeyDown={(e) => e.key == 'Escape' && cerrar(false)}>
          <button className="absolute inset-0 bg-black/70" aria-hidden="true" tabIndex={-1} onClick={() => cerrar(false)} />
          <div className="pb-safe relative w-full max-w-sm rounded-t-3xl border border-line bg-surface p-5 sm:rounded-3xl">
            <h2 className="text-base font-semibold">{conf.titulo}</h2>
            {conf.texto && <p className="mt-1.5 text-sm text-muted">{conf.texto}</p>}
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => cerrar(false)}>Cancelar</Button>
              <Button autoFocus className={conf.peligro ? 'flex-1 bg-ko hover:bg-ko/90' : 'flex-1'} onClick={() => cerrar(true)}>{conf.accion}</Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackCtx.Provider>
  );
}

export function useFeedback() {
  const c = useContext(FeedbackCtx);
  if (!c) throw new Error('useFeedback fuera de FeedbackProvider');
  return c;
}

/** Ejecuta una acción de escritura evitando doble toque; muestra el error y recarga las tablas indicadas. */
export function useAccion() {
  const { toast } = useFeedback();
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  /** Devuelve true si salió bien. */
  const run = useCallback(async (fn: () => Promise<string | void>, tablas: TableName[]): Promise<boolean> => {
    if (ocupado) return false;
    setOcupado(true);
    try {
      const ok = await fn();
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast(mensajeError(e));
      return false;
    } finally {
      setOcupado(false);
      tablas.forEach((t) => qc.invalidateQueries({ queryKey: tableKey(t) }));
      qc.invalidateQueries({ queryKey: ['caja_resumen'] });
    }
  }, [ocupado, qc, toast]);
  return { run, ocupado };
}
