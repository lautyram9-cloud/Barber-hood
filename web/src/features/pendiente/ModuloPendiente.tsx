import { ExternalLink, Hammer } from 'lucide-react';
import { LEGACY_APP_URL } from '@/config';

/** Módulo todavía no migrado: se sigue usando en la versión estable (nada se pierde). */
export function ModuloPendiente({ nombre }: { nombre: string }) {
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface text-accent"><Hammer size={24} strokeWidth={1.75} /></div>
      <h1 className="text-xl font-semibold tracking-tight">{nombre}</h1>
      <p className="mt-2 text-sm text-muted">Este módulo todavía se está migrando al nuevo diseño. Mientras tanto seguí usándolo en la versión estable: tiene todos tus datos y funciona igual que siempre.</p>
      <a href={LEGACY_APP_URL} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-white hover:bg-accent-strong">
        <ExternalLink size={16} /> Abrir versión estable
      </a>
    </div>
  );
}
