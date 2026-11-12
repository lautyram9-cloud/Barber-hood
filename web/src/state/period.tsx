import { createContext, useContext, useState, type ReactNode } from 'react';
import { today, type Periodo } from '@/domain/logic';

// Período compartido entre secciones (como S.per / S.ref en la versión estable). Por defecto: semana actual.
interface Ctx { per: Periodo; ref: string; setPer(p: Periodo): void; setRef(r: string): void }
const PeriodCtx = createContext<Ctx | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [per, setPer] = useState<Periodo>('sem');
  const [ref, setRef] = useState(today);
  return <PeriodCtx.Provider value={{ per, ref, setPer, setRef }}>{children}</PeriodCtx.Provider>;
}
export function usePeriod() {
  const c = useContext(PeriodCtx);
  if (!c) throw new Error('usePeriod fuera de PeriodProvider');
  return c;
}
