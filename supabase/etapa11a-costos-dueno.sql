-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 11a · Costos solo para el dueño (PASO 1 de 2) — PROPUESTA, NO EJECUTADA
-- Aditivo y re-ejecutable: solo crea/reemplaza UNA función. No cambia tablas, permisos ni datos.
--
-- costos_dueno() devuelve los costos que hoy ve cualquier usuario con sesión:
--   * productos.costo        (costo de cada producto)
--   * ingresos.costo_unit    (costo de cada producto vendido; los servicios tienen 0 y no se listan)
-- Solo la puede usar el DUEÑO. Si la usa un barbero, falla con "Solo el dueño".
--
-- ORDEN: ejecutar ESTE archivo ANTES de fusionar/publicar la versión nueva de la app, y el
-- archivo etapa11b DESPUÉS de que la app nueva esté publicada.
-- =====================================================================
create or replace function public.costos_dueno() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not es_dueno() then raise exception 'Solo el dueño'; end if;
  return jsonb_build_object(
    'productos', coalesce((select jsonb_agg(jsonb_build_object('id',id,'costo',costo)) from public.productos),'[]'::jsonb),
    'ingresos',  coalesce((select jsonb_agg(jsonb_build_object('id',id,'costo_unit',costo_unit)) from public.ingresos where costo_unit<>0),'[]'::jsonb));
end $$;

revoke execute on function public.costos_dueno() from public, anon;
grant execute on function public.costos_dueno() to authenticated, service_role;
