-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 12 · Avisos push de reservas nuevas — PROPUESTA, NO EJECUTADA
-- Aditivo y re-ejecutable. No modifica ni borra datos existentes ni cambia permisos de las tablas actuales.
--
-- Qué agrega:
--   1. La extensión pg_net (viene con Supabase): permite que la base llame a la función de avisos.
--   2. push_subs:     los dispositivos que aceptaron avisos (cada usuario ve y borra solo los suyos).
--   3. push_config:   las claves de avisos (VAPID). Las genera sola la función la primera vez.
--                     Nadie con sesión puede leerla: solo el servidor.
--   4. push_enviados: registro de qué turnos ya se avisaron (evita avisos repetidos y permite el tope anti-spam).
--   5. Un disparador en turnos: cuando entra un turno PENDIENTE (las reservas del link), pide el aviso.
--      Es asíncrono: si el aviso falla, la reserva se guarda igual.
--
-- ORDEN: 1) desplegar la función "notificar-turno" (supabase/functions/notificar-turno/index.ts) con
--        "Verify JWT" DESACTIVADO;  2) ejecutar este archivo;  3) publicar la app.
--
-- VOLVER ATRÁS (deja de avisar; no toca turnos):
--   drop trigger if exists t_avisar_turno on public.turnos;
-- =====================================================================
create extension if not exists pg_net;

-- 2. Dispositivos suscriptos
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  agente     text,
  creado_at  timestamptz not null default now()
);
create index if not exists i_push_subs_user on public.push_subs(user_id);
alter table public.push_subs enable row level security;
drop policy if exists ver_propias on public.push_subs;
drop policy if exists crear_propias on public.push_subs;
drop policy if exists editar_propias on public.push_subs;
drop policy if exists borrar_propias on public.push_subs;
create policy ver_propias    on public.push_subs for select to authenticated using (user_id = (select auth.uid()));
create policy crear_propias  on public.push_subs for insert to authenticated with check (user_id = (select auth.uid()));
create policy editar_propias on public.push_subs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy borrar_propias on public.push_subs for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subs from anon;
grant select, insert, update, delete on public.push_subs to authenticated;

-- 3. Claves de avisos (solo el servidor)
create table if not exists public.push_config (
  id        int primary key default 1 check (id = 1),
  publica   text not null,
  privada   text not null,
  creado_at timestamptz not null default now()
);
alter table public.push_config enable row level security;  -- sin políticas: nadie con sesión la lee
revoke all on public.push_config from anon, authenticated;

-- 4. Turnos ya avisados
create table if not exists public.push_enviados (
  turno_id   uuid primary key references public.turnos(id) on delete cascade,
  enviado_at timestamptz not null default now(),
  destinos   int
);
create index if not exists i_push_env_at on public.push_enviados(enviado_at);
alter table public.push_enviados enable row level security;  -- sin políticas: solo el servidor
revoke all on public.push_enviados from anon, authenticated;

-- 5. Disparador: reserva pendiente → pedir el aviso a la función
create or replace function public.avisar_turno_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'pendiente' then
    perform net.http_post(
      url     := 'https://gbrutjlhdcnnlghoaxlu.supabase.co/functions/v1/notificar-turno',
      body    := jsonb_build_object('turno_id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
exception when others then
  return new;  -- un aviso nunca impide guardar una reserva
end $$;
revoke execute on function public.avisar_turno_nuevo() from public, anon, authenticated;

drop trigger if exists t_avisar_turno on public.turnos;
create trigger t_avisar_turno after insert on public.turnos
  for each row execute function public.avisar_turno_nuevo();

-- Verificación (debe dar: extension=true, tablas=3, trigger=1)
select exists(select 1 from pg_extension where extname = 'pg_net') as extension,
       (select count(*) from pg_tables where schemaname = 'public' and tablename in ('push_subs','push_config','push_enviados')) as tablas,
       (select count(*) from pg_trigger where tgname = 't_avisar_turno') as trigger;
