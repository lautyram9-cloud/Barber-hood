import { BarChart3, Boxes, CalendarDays, Crown, HandCoins, Home, Settings, TrendingUp, UserRound, Users, Wallet, ArrowLeftRight, type LucideIcon } from 'lucide-react';

// Mismas secciones, mismo orden y misma visibilidad por rol que la versión estable:
//  a = solo dueño · o = solo dueño · b = solo barbero · s = todos menos barbero
export type Vis = 'all' | 'owner' | 'barber' | 'notBarber';
export interface Section { id: string; label: string; icon: LucideIcon; vis: Vis; migrated: boolean }

export const SECTIONS: Section[] = [
  { id: 'ini', label: 'Inicio', icon: Home, vis: 'owner', migrated: true },
  { id: 'tur', label: 'Turnos', icon: CalendarDays, vis: 'all', migrated: true },
  { id: 'cli', label: 'Clientes', icon: Users, vis: 'all', migrated: true },
  { id: 'cj', label: 'Caja', icon: Wallet, vis: 'owner', migrated: false },
  { id: 'caja', label: 'Movimientos', icon: ArrowLeftRight, vis: 'notBarber', migrated: false },
  { id: 'stk', label: 'Stock', icon: Boxes, vis: 'owner', migrated: false },
  { id: 'est', label: 'Estadísticas', icon: BarChart3, vis: 'owner', migrated: true },
  { id: 'bar', label: 'Barberos', icon: TrendingUp, vis: 'owner', migrated: true },
  { id: 'me', label: 'Mi perfil', icon: UserRound, vis: 'barber', migrated: true },
  { id: 'com', label: 'Comisiones', icon: HandCoins, vis: 'owner', migrated: false },
  { id: 'due', label: 'Dueño', icon: Crown, vis: 'owner', migrated: false },
  { id: 'aj', label: 'Ajustes', icon: Settings, vis: 'owner', migrated: false },
];

export function sectionsFor(owner: boolean, isBarber: boolean) {
  return SECTIONS.filter((s) =>
    s.vis === 'all' ? true : s.vis === 'owner' ? owner : s.vis === 'barber' ? isBarber : !isBarber);
}
