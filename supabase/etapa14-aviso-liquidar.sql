-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 14 · Aviso semanal "¡Es momento de liquidar la semana!" — PROPUESTA, NO EJECUTADA
-- Aditivo y re-ejecutable. No modifica ni borra datos existentes.
--
-- Qué agrega:
--   1. La extensión pg_cron (viene con Supabase): tareas programadas dentro de la base.
--   2. push_recordatorios: registro de avisos programados ya enviados (uno por semana). Solo el servidor la usa.
--   3. Una tarea programada "bh-liquidar-semana" todos los SÁBADOS a las 22:00 hora de Argentina
--      (= domingo 01:00 UTC; Argentina no tiene horario de verano). Pide el aviso a la función notificar-turno,
--      que lo manda a los dispositivos de los DUEÑOS que activaron avisos.
--      La función solo lo acepta sábados 21:50–23:00 (AR) y una vez por semana.
--
-- REQUISITO: la función notificar-turno actualizada (acción "liquidar") ya desplegada.
-- VOLVER ATRÁS (deja de avisar; no toca nada más):
--   select cron.unschedule('bh-liquidar-semana');
-- =====================================================================
create extension if not exists pg_cron;

create table if not exists public.push_recordatorios (
  clave      text primary key,
  enviado_at timestamptz not null default now(),
  destinos   int
);
alter table public.push_recordatorios enable row level security;  -- sin políticas: solo el servidor
revoke all on public.push_recordatorios from anon, authenticated;

-- Re-ejecutable: si la tarea ya existe, se reemplaza.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'bh-liquidar-semana') then perform cron.unschedule('bh-liquidar-semana'); end if;
end $$;
select cron.schedule('bh-liquidar-semana', '0 1 * * 0', $cron$
  select net.http_post(
    url     := 'https://gbrutjlhdcnnlghoaxlu.supabase.co/functions/v1/notificar-turno',
    body    := '{"accion":"liquidar"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb);
$cron$);

-- Verificación (debe dar: tarea=1, horario='0 1 * * 0', tabla=1)
select (select count(*) from cron.job where jobname = 'bh-liquidar-semana') as tarea,
       (select schedule from cron.job where jobname = 'bh-liquidar-semana') as horario,
       (select count(*) from pg_tables where schemaname = 'public' and tablename = 'push_recordatorios') as tabla;
