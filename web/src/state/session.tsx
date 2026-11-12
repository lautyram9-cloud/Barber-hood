import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { sb } from '@/lib/supabase';
import type { Rol } from '@/domain/model';

// Misma lógica de acceso que boot() en la versión estable:
//  - sin sesión → login
//  - rol desde perfiles.rol (si no hay fila: 'barber')
//  - un barbero sin ficha vinculada en `barberos` no entra
// Los permisos REALES los aplica la base (RLS + funciones); esto solo decide qué mostrar.

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'noBarbero'; email: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; userId: string; email: string; rol: Rol; owner: boolean; meBarberoId: string | null };

interface Ctx {
  session: SessionState;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}
const SessionCtx = createContext<Ctx | null>(null);

async function resolve(): Promise<SessionState> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { status: 'signedOut' };
  const uid = session.user.id, email = session.user.email ?? '';
  const { data: p, error: pe } = await sb.from('perfiles').select('rol').eq('id', uid).maybeSingle();
  if (pe) throw pe;
  const rol: Rol = p?.rol === 'owner' ? 'owner' : 'barber';
  if (rol === 'owner') return { status: 'ready', userId: uid, email, rol, owner: true, meBarberoId: null };
  const { data: mb, error: be } = await sb.from('barberos').select('id').eq('user_id', uid).maybeSingle();
  if (be) throw be;
  if (!mb) return { status: 'noBarbero', email };
  return { status: 'ready', userId: uid, email, rol, owner: false, meBarberoId: mb.id };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const refresh = useCallback(() => {
    resolve().then(setSession, (e) => setSession({ status: 'error', message: e?.message || 'No se pudo conectar' }));
  }, []);

  useEffect(() => {
    refresh();
    const { data } = sb.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(refresh, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return /fetch|load failed|network/i.test(error.message) ? 'No se pudo conectar. Revisá tu conexión.' : 'Email o clave incorrectos';
    return null;
  }, []);
  const signOut = useCallback(async () => { await sb.auth.signOut(); }, []);

  return <SessionCtx.Provider value={{ session, signIn, signOut }}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession fuera de SessionProvider');
  return c;
}
