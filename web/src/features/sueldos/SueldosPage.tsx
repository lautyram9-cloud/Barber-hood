import { useState } from 'react';
import type { AppData } from '@/domain/model';
import { PageHeader } from '@/components/PageHeader';
import { PeriodBar } from '@/components/PeriodBar';
import { cx } from '@/components/ui';
import { ComisionesPage } from '@/features/comisiones/ComisionesPage';
import { BarberosPage } from '@/features/barberos/BarberosPage';

type Vista = 'com' | 'bar';
let vistaGuardada: Vista = 'com'; // se conserva al cambiar de sección

/** Sueldos: lo que antes eran las pestañas Comisiones y Barberos, juntas. */
export function SueldosPage({ d }: { d: AppData }) {
  const [v, setV] = useState<Vista>(vistaGuardada);
  const elegir = (x: Vista) => { vistaGuardada = x; setV(x); };
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Sueldos" subtitle="Comisiones, liquidaciones, adelantos y rendimiento de cada barbero" />
      <div role="tablist" aria-label="Sueldos" className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1">
        {([['com', 'Comisiones y pagos'], ['bar', 'Rendimiento']] as [Vista, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={v == k} onClick={() => elegir(k)}
            className={cx('min-h-11 rounded-xl text-sm font-semibold transition', v == k ? 'bg-accent text-white' : 'text-muted hover:text-fg')}>{l}</button>
        ))}
      </div>
      <PeriodBar />
      {v == 'com' ? <ComisionesPage d={d} embebido /> : <BarberosPage d={d} embebido />}
    </div>
  );
}
