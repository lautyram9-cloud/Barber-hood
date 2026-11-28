import { BarChart3, Boxes, CalendarDays, Crown, HandCoins, Home, Settings, UserRound, Users, Wallet, ArrowLeftRight, type LucideIcon } from 'lucide-react';

// Mismas secciones, mismo orden y misma visibilidad por rol que la versión estable:
//  a = solo dueño · o = solo dueño · b = solo barbero · s = todos menos barbero
export type Vis = 'all' | 'owner' | 'barber' | 'notBarber';
export interface Section { id: string; label: string; icon: LucideIcon; vis: Vis; migrated: boolean }

export const SECTIONS: Section[] = [
  { id: 'ini', label: 'Inicio', icon: Home, vis: 'owner', migrated: true },
  { id: 'tur', label: 'Turnos', icon: CalendarDays, vis: 'all', migrated: true },
  { id: 'cli', label: 'Clientes', icon: Users, vis: 'all', migrated: true },
  { id: 'cj', label: 'Caja', icon: Wallet, vis: 'owner', migrated: true },
  { id: 'caja', label: 'Movimientos', icon: ArrowLeftRight, vis: 'notBarber', migrated: true },
  { id: 'stk', label: 'Stock', icon: Boxes, vis: 'owner', migrated: true },
  { id: 'est', label: 'Estadísticas', icon: BarChart3, vis: 'owner', migrated: true },
  // Cambio intencional: Barberos + Comisiones se unieron en una sola pestaña, Sueldos.
  { id: 'sue', label: 'Sueldos', icon: HandCoins, vis: 'owner', migrated: true },
  { id: 'me', label: 'Mi perfil', icon: UserRound, vis: 'barber', migrated: true },
  { id: 'due', label: 'Dueño', icon: Crown, vis: 'owner', migrated: true },
  // Cambio intencional respecto de la estable: el barbero también tiene Ajustes (su cuenta y sus avisos).
  { id: 'aj', label: 'Ajustes', icon: Settings, vis: 'all', migrated: true },
];

export function sectionsFor(owner: boolean, isBarber: boolean) {
  return SECTIONS.filter((s) =>
    s.vis === 'all' ? true : s.vis === 'owner' ? owner : s.vis === 'barber' ? isBarber : !isBarber);
}
