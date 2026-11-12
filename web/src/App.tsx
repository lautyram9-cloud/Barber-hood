import { useEffect } from 'react';
import { sectionsFor } from '@/app/nav';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui';
import { LEGACY_APP_URL } from '@/config';
import { LoginPage } from '@/features/auth/LoginPage';
import { InicioPage } from '@/features/inicio/InicioPage';
import { EstadisticasPage } from '@/features/estadisticas/EstadisticasPage';
import { BarberosPage } from '@/features/barberos/BarberosPage';
import { MiPerfilPage } from '@/features/perfil/MiPerfilPage';
import { TurnosPage } from '@/features/turnos/TurnosPage';
import { ClientesPage } from '@/features/clientes/ClientesPage';
import { MovimientosPage } from '@/features/movimientos/MovimientosPage';
import { BotonMas } from '@/features/movimientos/BotonMas';
import { SECCIONES_CON_BOTON } from '@/domain/movimientos';
import { ModuloPendiente } from '@/features/pendiente/ModuloPendiente';
import { Loading, Problem, Retry } from '@/features/StatusScreens';
import { useHashRoute } from '@/lib/router';
import { useAppData } from '@/state/data';
import { useSession } from '@/state/session';

export function App() {
  const [route] = useHashRoute();
  const { session, signOut } = useSession();

  // Reserva pública: sigue funcionando en la versión estable hasta migrarla.
  if (route === 'reservar') {
    return (
      <Problem title="Reservá tu turno" actions={<a href={LEGACY_APP_URL + '#reservar'} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-white">Ir a reservar</a>}>
        La reserva online está en el sistema actual de Barber Hood.
      </Problem>
    );
  }
  if (session.status === 'loading') return <Loading label="Conectando…" />;
  if (session.status === 'signedOut') return <LoginPage />;
  if (session.status === 'error') return <Problem title="No se pudo conectar" actions={<Retry onClick={() => location.reload()} />}>{session.message}</Problem>;
  if (session.status === 'noBarbero')
    return <Problem title="Usuario sin barbero" actions={<Button variant="outline" onClick={signOut}>Cerrar sesión</Button>}>Pedile al dueño que vincule tu email ({session.email}) a tu perfil de barbero en Ajustes.</Problem>;
  return <Authed owner={session.owner} me={session.meBarberoId} email={session.email} onSignOut={signOut} />;
}

function Authed({ owner, me, email, onSignOut }: { owner: boolean; me: string | null; email: string; onSignOut(): void }) {
  const [route, navigate] = useHashRoute();
  const sections = sectionsFor(owner, !!me);
  const current = sections.find((s) => s.id === route) ?? sections[0];
  const { data, error, loading, refetch } = useAppData(owner);

  useEffect(() => { if (route !== current.id) navigate(current.id); }, [route, current.id, navigate]);

  let body;
  if (error && !data) body = <Problem title="No se pudieron cargar los datos" actions={<Retry onClick={refetch} />}>{error.tabla ? `Error en la tabla "${error.tabla}": ` : ''}{String(error.message).slice(0, 120)}</Problem>;
  else if (loading || !data) body = <Loading label="Cargando datos…" />;
  else if (current.id === 'ini') body = <InicioPage d={data} />;
  else if (current.id === 'tur') body = <TurnosPage d={data} owner={owner} me={me} />;
  else if (current.id === 'cli') body = <ClientesPage d={data} />;
  else if (current.id === 'caja') body = <MovimientosPage d={data} />;
  else if (current.id === 'est') body = <EstadisticasPage d={data} />;
  else if (current.id === 'bar') body = <BarberosPage d={data} />;
  else if (current.id === 'me' && me) body = <MiPerfilPage d={data} me={me} />;
  else body = <ModuloPendiente nombre={current.label} />;

  return (
    <AppShell sections={sections} current={current.id} onNavigate={navigate} email={email} rolLabel={owner ? 'Dueño' : 'Barbero'} onSignOut={onSignOut}>
      {body}
      {data && SECCIONES_CON_BOTON.includes(current.id) && <BotonMas d={data} owner={owner} me={me} />}
    </AppShell>
  );
}
