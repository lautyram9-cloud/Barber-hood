import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-surface p-4 sm:p-5', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ok' | 'ko' | 'accent' }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={cx('num mt-1 truncate text-[17px] font-semibold tracking-tight sm:text-2xl', tone === 'ok' && 'text-ok', tone === 'ko' && 'text-ko', tone === 'accent' && 'text-accent')}>{value}</p>
      {hint && <div className="mt-1 text-xs">{hint}</div>}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' };
export function Button({ variant = 'primary', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white shadow-[0_8px_24px_-12px_var(--color-accent)] hover:bg-accent-strong',
        variant === 'outline' && 'border border-line-strong text-fg hover:bg-surface-2',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    />
  );
}

export function Row({ left, sub, right, className }: { left: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0', className)}>
      <div className="min-w-0">
        <div className="truncate text-sm">{left}</div>
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      {right !== undefined && <div className="num shrink-0 text-sm font-medium">{right}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-subtle">{children}</p>;
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'ko' | 'warn' | 'accent' }) {
  const t = { muted: 'bg-surface-2 text-muted', ok: 'bg-ok/10 text-ok', ko: 'bg-ko/10 text-ko', warn: 'bg-warn/10 text-warn', accent: 'bg-accent/10 text-accent' }[tone];
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', t)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-2xl bg-surface-2', className)} />;
}

/** Barras simples en SVG (sin librerías). Escala a todo el ancho. */
export function Bars({ labels, values, format }: { labels: string[]; values: number[]; format: (n: number) => string }) {
  const max = Math.max(1, ...values), w = 100 / Math.max(1, labels.length);
  return (
    <div className="flex h-44 items-end gap-2" role="img" aria-label={labels.map((l, i) => `${l}: ${format(values[i])}`).join(', ')}>
      {values.map((v, i) => (
        <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" style={{ maxWidth: `${w}%` }}>
          <span className="num truncate text-[10px] text-muted">{v ? format(v) : ''}</span>
          <div className="flex w-full flex-1 items-end">
            <div className="w-full rounded-md bg-gradient-to-t from-accent-strong to-accent" style={{ height: `${Math.max(v ? 3 : 0, (v / max) * 100)}%`, opacity: i === values.length - 1 ? 1 : 0.55 }} />
          </div>
          <span className="text-[11px] text-subtle">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
