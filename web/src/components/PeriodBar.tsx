import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isoLocal, rango, type Periodo } from '@/domain/logic';
import { usePeriod } from '@/state/period';
import { cx } from '@/components/ui';

const OPS: [Periodo, string][] = [['dia', 'Día'], ['sem', 'Semana'], ['mes', 'Mes'], ['ano', 'Año']];
const fecha = (f: string) => new Date(f + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

// El rango de mes termina en "-31" a propósito (igual que la versión estable); para mostrar se usa el nombre del mes.
function etiqueta(per: Periodo, ref: string, a: string, b: string) {
  const d = new Date(ref + 'T00:00:00');
  if (per == 'mes') return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  if (per == 'ano') return String(d.getFullYear());
  return a == b ? fecha(a) : `${fecha(a)} – ${fecha(b)}`;
}

/** Selector de período (Día / Semana / Mes / Año + fecha de referencia), igual que la versión estable. */
export function PeriodBar() {
  const { per, ref, setPer, setRef } = usePeriod();
  const [a, b] = rango(per, ref);
  const mover = (n: number) => {
    const x = new Date(ref + 'T00:00:00');
    if (per == 'dia') x.setDate(x.getDate() + n); else if (per == 'sem') x.setDate(x.getDate() + 7 * n);
    else if (per == 'mes') x.setMonth(x.getMonth() + n); else x.setFullYear(x.getFullYear() + n);
    setRef(isoLocal(x));
  };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-2 sm:flex-row sm:items-center">
      <div role="tablist" aria-label="Período" className="grid grid-cols-4 gap-1 rounded-xl bg-bg p-1 sm:w-80">
        {OPS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={per == k} onClick={() => setPer(k)}
            className={cx('min-h-9 rounded-lg text-sm font-medium transition', per == k ? 'bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-muted hover:text-fg')}>{l}</button>
        ))}
      </div>
      <div className="flex flex-1 items-center gap-1">
        <button onClick={() => mover(-1)} aria-label="Período anterior" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><ChevronLeft size={18} /></button>
        <label className="relative flex-1 text-center">
          <span className="num text-sm first-letter:uppercase">{etiqueta(per, ref, a, b)}</span>
          <input type="date" aria-label="Fecha de referencia" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
        <button onClick={() => mover(1)} aria-label="Período siguiente" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
