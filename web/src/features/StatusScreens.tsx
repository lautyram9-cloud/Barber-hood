import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { LEGACY_APP_URL } from '@/config';

export function Centered({ children }: { children: ReactNode }) {
  return <div className="pt-safe flex min-h-dvh items-center justify-center px-6 text-center">{children}</div>;
}

export const Loading = ({ label = 'Cargando…' }: { label?: string }) => (
  <Centered><div className="flex items-center gap-3 text-sm text-muted"><Loader2 className="animate-spin text-accent" size={18} /> {label}</div></Centered>
);

export function Problem({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Centered>
      <div className="max-w-sm">
        <img src="./logo.png" alt="" className="mix-blend-lighten mx-auto mb-5 h-10 w-auto opacity-80" />
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="mt-2 text-sm text-muted">{children}</div>
        <div className="mt-6 flex flex-col gap-2">{actions}<a href={LEGACY_APP_URL} className="text-xs text-subtle underline-offset-4 hover:underline">Abrir versión estable</a></div>
      </div>
    </Centered>
  );
}

export const Retry = ({ onClick }: { onClick(): void }) => <Button onClick={onClick}>Reintentar</Button>;
