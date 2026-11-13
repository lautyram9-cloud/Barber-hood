import { useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cx } from './index';

const base = 'w-full rounded-xl border border-line bg-bg px-3.5 text-fg outline-none transition placeholder:text-subtle focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:opacity-50';

/** Campo con etiqueta visible (la versión estable usaba solo placeholders). */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx('mb-3.5', className)}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(base, 'h-12', className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(base, 'h-12 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a94a6' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(base, 'min-h-20 py-3', className)} />;

export function Chip({ on, children, ...p }: { on?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-pressed={on} {...p}
      className={cx('min-h-10 rounded-full border px-3.5 text-sm transition', on ? 'border-accent bg-accent text-white' : 'border-line-strong text-fg hover:border-accent/60', p.className)}>
      {children}
    </button>
  );
}

/** Panel: hoja desde abajo en el celular, ventana centrada en pantallas grandes. Escape cierra. */
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    ref.current?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <button className="backdrop-enter absolute inset-0 bg-black/70 backdrop-blur-[2px]" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="sheet-enter relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface outline-none sm:max-w-lg sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 text-base font-semibold">{title}</div>
          <button onClick={onClose} className="-mr-2 -mt-1 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="pb-safe border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
