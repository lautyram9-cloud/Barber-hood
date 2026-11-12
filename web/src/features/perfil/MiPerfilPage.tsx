import { CheckCircle2, Fingerprint } from 'lucide-react';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import { rpc } from '@/lib/supabase';
import { useAccion } from '@/state/feedback';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui';
import { FichaBarbero } from '@/features/barberos/FichaBarbero';

/** Mi perfil del barbero (V.me): marcar asistencia + su ficha. */
export function MiPerfilPage({ d, me }: { d: AppData; me: string }) {
  const marcada = d.asistencia.some((x) => x.barberoId == me && x.fecha == L.today());
  const { run, ocupado } = useAccion();
  const marcar = () => run(async () => {
    const r = await rpc<string>('marcar_asistencia');
    return r == 'tarde' ? 'Asistencia marcada (llegada tarde)' : 'Asistencia marcada';
  }, ['asistencia']);

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Mi perfil" subtitle={L.nombreBarbero(d, me)} />
      <Button onClick={marcar} disabled={marcada || ocupado} className="h-14 w-full text-base sm:w-auto sm:px-8">
        {marcada ? <><CheckCircle2 size={18} /> Asistencia marcada hoy</> : <><Fingerprint size={18} /> Marcar mi asistencia</>}
      </Button>
      <PeriodBar />
      <FichaBarbero d={d} id={me} admin={false} />
    </div>
  );
}
