-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 13 · Fotos de perfil de los barberos — PROPUESTA, NO EJECUTADA
-- Aditivo y re-ejecutable. No modifica ni borra datos existentes.
--
-- Qué agrega:
--   1. barberos.foto: ruta de la foto dentro del espacio de archivos (vacía = sin foto, se muestran iniciales).
--   2. Un espacio de archivos PÚBLICO "barberos" (Supabase Storage): solo imágenes JPG/PNG/WEBP de hasta 1 MB.
--      Cualquiera puede VER las fotos (las muestra la página de reservas); solo el DUEÑO puede subir,
--      cambiar o borrar.
--   3. public_info() devuelve también la foto de cada barbero. Es la MISMA función de hoy con un dato más
--      ('foto'); no expone nada nuevo (ni teléfonos, ni usuarios).
--
-- VOLVER ATRÁS (las fotos dejan de verse; no toca turnos ni barberos):
--   ejecutar de nuevo la definición anterior de public_info (supabase/etapa5-supabase.sql, sección 4).
-- =====================================================================

-- 1. Columna con la ruta de la foto
alter table public.barberos add column if not exists foto text;

-- 2. Espacio de archivos público para las fotos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('barberos', 'barberos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists barberos_fotos_ver on storage.objects;
drop policy if exists barberos_fotos_subir on storage.objects;
drop policy if exists barberos_fotos_cambiar on storage.objects;
drop policy if exists barberos_fotos_borrar on storage.objects;
create policy barberos_fotos_ver    on storage.objects for select to authenticated using (bucket_id = 'barberos');
create policy barberos_fotos_subir  on storage.objects for insert to authenticated with check (bucket_id = 'barberos' and public.es_dueno());
create policy barberos_fotos_cambiar on storage.objects for update to authenticated using (bucket_id = 'barberos' and public.es_dueno()) with check (bucket_id = 'barberos' and public.es_dueno());
create policy barberos_fotos_borrar on storage.objects for delete to authenticated using (bucket_id = 'barberos' and public.es_dueno());

-- 3. public_info con la foto (idéntica a la actual + 'foto')
create or replace function public.public_info() returns jsonb language sql stable security definer set search_path = public as $$
select jsonb_build_object(
  'barberos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'slot_min',slot_min,'foto',foto)),'[]'::jsonb) from barberos where activo),
  'servicios',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'precio',precio,'dur',duracion_min)),'[]'::jsonb) from servicios where activo),
  'horarios',(select coalesce(jsonb_agg(jsonb_build_object('dia',dia,'desde',desde,'hasta',hasta)),'[]'::jsonb) from horarios),
  'ocupados',(select coalesce(jsonb_agg(jsonb_build_object('b',barbero_id,'i',inicio,'f',fin)),'[]'::jsonb) from turnos
              where estado in ('pendiente','confirmado','atendido')
                and inicio>=((now() at time zone 'America/Argentina/Salta')-interval '1 day')
                and inicio<((now() at time zone 'America/Argentina/Salta')+interval '61 days')))
$$;
grant execute on function public.public_info() to anon;

-- Verificación (debe dar: columna=1, bucket=true, politicas=4)
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'barberos' and column_name = 'foto') as columna,
       (select public from storage.buckets where id = 'barberos') as bucket,
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'barberos_fotos_%') as politicas;
