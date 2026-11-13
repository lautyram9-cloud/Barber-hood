import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, LogOut, Menu, WifiOff, X } from 'lucide-react';
import type { Section } from '@/app/nav';
import { LEGACY_APP_URL } from '@/config';
import { cx } from '@/components/ui';

const NAVMAX = 5; // igual que la versión estable: 5 botones, el resto en "Más"

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(navigator.onLine);
    addEventListener('online', u); addEventListener('offline', u);
    return () => { removeEventListener('online', u); removeEventListener('offline', u); };
  }, []);
  return on;
}

interface Props { sections: Section[]; current: string; onNavigate(id: string): void; email: string; rolLabel: string; onSignOut(): void; children: ReactNode }

export function AppShell({ sections, current, onNavigate, email, rolLabel, onSignOut, children }: Props) {
  const online = useOnline();
  const [more, setMore] = useState(false);
  const big = sections.length > NAVMAX;
  const main = big ? sections.slice(0, NAVMAX - 1) : sections, rest = big ? sections.slice(NAVMAX - 1) : [];
  const cur = sections.find((s) => s.id === current);

  useEffect(() => {
    if (!more) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setMore(false);
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [more]);

  const go = (id: string) => { setMore(false); onNavigate(id); scrollTo(0, 0); };

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Menú lateral (iPad horizontal y computadora) */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
        <div className="mb-6 flex items-center gap-3 px-3">
          <img src="./logo.png" alt="" className="mix-blend-lighten h-8 w-auto" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-wide">Barber Hood</p>
            <p className="text-[11px] text-muted">Manager</p>
          </div>
        </div>
        <nav aria-label="Secciones" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {sections.map((s) => (
            <button key={s.id} onClick={() => go(s.id)} aria-current={s.id === current ? 'page' : undefined}
              className={cx('flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition',
                s.id === current ? 'bg-accent/10 text-fg shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              <s.icon size={18} strokeWidth={1.75} className={s.id === current ? 'text-accent' : ''} />
              <span className="flex-1 text-left">{s.label}</span>
              {!s.migrated && <span className="text-[10px] text-subtle">estable</span>}
            </button>
          ))}
        </nav>
        <div className="mt-4 border-t border-line px-3 pt-4">
          <p className="truncate text-xs text-fg">{email}</p>
          <p className="text-[11px] text-muted">{rolLabel}</p>
          <div className="mt-3 flex flex-col gap-1">
            <a href={LEGACY_APP_URL} className="flex items-center gap-2 rounded-lg py-1.5 text-xs text-muted hover:text-fg"><ExternalLink size={14} /> Abrir versión estable</a>
            <button onClick={onSignOut} className="flex items-center gap-2 rounded-lg py-1.5 text-xs text-muted hover:text-fg"><LogOut size={14} /> Cerrar sesión</button>
          </div>
        </div>
      </aside>

      {/* Barra superior (celular / iPad vertical) */}
      <header className="pt-safe sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <img src="./logo.png" alt="Barber Hood" className="mix-blend-lighten h-7 w-auto" />
          <p className="flex-1 truncate text-sm font-semibold">{cur?.label}</p>
        </div>
      </header>

      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 bg-ko/15 px-4 py-2 text-xs font-medium text-ko">
          <WifiOff size={14} /> Sin conexión: los cambios no se guardarán
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>

      {/* Barra inferior (celular / iPad vertical) */}
      <nav aria-label="Secciones" className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl gap-1 px-2 pt-1.5">
          {main.map((s) => (
            <TabButton key={s.id} active={s.id === current} label={s.label} onClick={() => go(s.id)}><s.icon size={22} strokeWidth={1.75} /></TabButton>
          ))}
          {big && (
            <TabButton active={rest.some((s) => s.id === current)} label="Más" onClick={() => setMore(true)}><Menu size={22} strokeWidth={1.75} /></TabButton>
          )}
        </div>
      </nav>

      {more && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button className="backdrop-enter absolute inset-0 bg-black/70" aria-hidden="true" tabIndex={-1} onClick={() => setMore(false)} />
          <div className="sheet-enter pb-safe absolute inset-x-0 bottom-0 mx-auto max-w-xl rounded-t-3xl border-t border-line bg-surface px-4 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Más secciones</p>
              <button onClick={() => setMore(false)} className="rounded-full p-2 text-muted" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 pb-3">
              {rest.map((s) => (
                <button key={s.id} onClick={() => go(s.id)} className={cx('flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-sm', s.id === current ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface-2')}>
                  <s.icon size={20} strokeWidth={1.75} className="text-accent" /> {s.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line py-3 text-xs text-muted">
              <span className="truncate">{email} · {rolLabel}</span>
              <button onClick={onSignOut} className="flex items-center gap-1.5 py-2 hover:text-fg"><LogOut size={14} /> Salir</button>
            </div>
            <a href={LEGACY_APP_URL} className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-line py-3 text-xs text-muted"><ExternalLink size={14} /> Abrir versión estable</a>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, label, onClick, children }: { active: boolean; label: string; onClick(): void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined}
      className={cx('flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition active:scale-95', active ? 'text-accent' : 'text-subtle')}>
      {children}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
