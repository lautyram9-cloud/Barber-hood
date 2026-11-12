import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/state/session';
import { Button } from '@/components/ui';

export function LoginPage() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return setError('Completá email y clave');
    setBusy(true); setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="pt-safe flex min-h-dvh items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,140,255,0.16),transparent)]" />
      <form onSubmit={submit} className="relative w-full max-w-sm rounded-3xl border border-line bg-surface/80 p-6 shadow-2xl backdrop-blur sm:p-8" noValidate>
        <img src="./logo.png" alt="Barber Hood" className="mix-blend-lighten mx-auto mb-5 h-14 w-auto" />
        <h1 className="text-center text-xl font-semibold tracking-tight">Barber Hood Manager</h1>
        <p className="mb-6 text-center text-sm text-muted">Ingresá con tu cuenta</p>
        <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
          className="mb-4 h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-fg outline-none transition placeholder:text-subtle focus:border-accent focus:ring-4 focus:ring-accent/20" />
        <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="password">Clave</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="mb-5 h-12 w-full rounded-xl border border-line bg-bg px-3.5 text-fg outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20" />
        {error && <p role="alert" className="mb-4 rounded-xl bg-ko/10 px-3 py-2 text-sm text-ko">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full">{busy && <Loader2 size={16} className="animate-spin" />} Ingresar</Button>
      </form>
    </div>
  );
}
