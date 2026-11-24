import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from './index';
import { Sheet } from './form';

// Piezas para que cada pantalla sea simple: lo importante grande, lo demás plegado.
// Nada se quita: lo plegado se abre en una ventana con la información completa.

type Tono = 'ok' | 'ko' | 'accent' | 'warn';
const colorTono = (t?: Tono) => cx(t === 'ok' && 'text-ok', t === 'ko' && 'text-ko', t === 'accent' && 'text-accent', t === 'warn' && 'text-warn');

/** El número principal de la pantalla, bien grande. */
export function Destacado({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tono }) {
  return (
    <div className="rounded-3xl border border-line bg-gradient-to-br from-accent/12 via-surface to-surface p-5 sm:p-6">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className={cx('num mt-1 text-4xl font-bold tracking-tight sm:text-5xl', colorTono(tone))}>{value}</p>
      {hint && <div className="mt-2 text-sm text-muted">{hint}</div>}
    </div>
  );
}

/**
 * Bloque plegado: se ve como una fila corta (título + resumen). Al tocarlo se abre una ventana
 * con todo el contenido. El nombre accesible del botón es el título (las pruebas lo buscan así).
 */
export function Plegable({ title, resumen, icono, tone, children, footer }: { title: string; resumen?: ReactNode; icono?: ReactNode; tone?: Tono; children: ReactNode; footer?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={title}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-line-strong active:scale-[0.99]">
        {icono && <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2', colorTono(tone) || 'text-muted')}>{icono}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{title}</span>
          {resumen != null && resumen !== '' && <span className={cx('block truncate text-[13px]', colorTono(tone) || 'text-muted')}>{resumen}</span>}
        </span>
        <ChevronRight size={18} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>
      {abierto && <Sheet title={title} onClose={() => setAbierto(false)} footer={footer}>{children}</Sheet>}
    </>
  );
}

/** Lista corta: muestra las primeras `max` filas y un botón "Ver todos" que abre la lista completa. */
export function ListaCorta<T>({ title, items, render, max = 4, vacio }: { title: string; items: T[]; render(x: T): ReactNode; max?: number; vacio?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {items.length > 0 && <span className="num rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{items.length}</span>}
      </header>
      {items.length ? items.slice(0, max).map(render) : vacio}
      {items.length > max && (
        <button type="button" onClick={() => setAbierto(true)} className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-surface-2 py-2.5 text-sm font-medium text-accent">
          Ver todos ({items.length}) <ChevronRight size={16} />
        </button>
      )}
      {abierto && <Sheet title={title} onClose={() => setAbierto(false)}>{items.map(render)}</Sheet>}
    </section>
  );
}
