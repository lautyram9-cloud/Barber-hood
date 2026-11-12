import type { AppData, Turno } from '@/domain/model';
import { nombreBarbero } from '@/domain/logic';
import { ESTADOS } from '@/domain/turnos';
import { Badge, cx } from '@/components/ui';

const TONO: Record<string, 'warn' | 'accent' | 'ok' | 'ko'> = { pendiente: 'warn', confirmado: 'accent', atendido: 'ok', cancelado: 'ko', ausente: 'ko' };
export const EstadoTurno = ({ e }: { e: string }) => <Badge tone={TONO[e]}>{ESTADOS[e] ?? e}</Badge>;

/** Fila de turno (trow): hora · cliente, servicios · barbero · duración, estado. */
export function TurnoRow({ d, t, onOpen, conFecha = true, accion }: { d: AppData; t: Turno; onOpen(t: Turno): void; conFecha?: boolean; accion?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-line first:border-t-0">
      <button onClick={() => onOpen(t)} className={cx('flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 text-left')}>
        <div className="num w-14 shrink-0 text-right">
          <p className="text-sm font-semibold">{t.hora}</p>
          {conFecha && <p className="text-[11px] text-subtle">{t.fecha.slice(8)}/{t.fecha.slice(5, 7)}</p>}
        </div>
        <div className="min-w-0 flex-1 border-l border-line pl-3">
          <p className="truncate text-sm">{t.cliente}</p>
          <p className="truncate text-xs text-muted">{[t.servicios, nombreBarbero(d, t.barberoId), `${t.duracionMin} min`].filter(Boolean).join(' · ')}</p>
        </div>
        {!accion && <EstadoTurno e={t.estado} />}
      </button>
      {accion}
    </div>
  );
}
