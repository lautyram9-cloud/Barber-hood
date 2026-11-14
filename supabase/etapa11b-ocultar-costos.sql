-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 11b · Ocultar costos a los barberos (PASO 2 de 2) — PROPUESTA, NO EJECUTADA
-- Re-ejecutable. Ejecutar SOLO después de: (1) etapa11a ejecutada y (2) la app nueva publicada
-- (la app vieja pide todas las columnas y dejaría de cargar al cambiar estos permisos).
--
-- Qué hace: les quita a los usuarios con sesión (dueño y barberos) el permiso de LEER las columnas
--   productos.costo  e  ingresos.costo_unit.
-- El dueño sigue viéndolas por costos_dueno() (etapa 11a). Las funciones internas (registrar_ingreso,
-- registrar_compra, ajustar_stock, anular_ingreso, caja_resumen…) NO se afectan: corren con permisos
-- de la base ("security definer"), igual que hoy. Las filas y el resto de las columnas no cambian.
-- Si se agrega una columna nueva a productos o ingresos, volver a ejecutar este archivo para habilitarla.
--
-- LÍMITE CONOCIDO: el canal de "datos en vivo" (Realtime) de Supabase no respeta permisos por columna;
-- un usuario técnico podría ver el costo en los avisos de cambio de esas dos tablas. Cerrarlo del todo
-- exige mover los costos a una tabla aparte (cambio mayor, se puede hacer después).
--
-- VOLVER ATRÁS (sin perder nada):
--   grant select on public.productos, public.ingresos to authenticated;
-- =====================================================================
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema='public' and table_name='productos' and column_name<>'costo';
  execute 'revoke select on public.productos from authenticated';
  execute format('grant select (%s) on public.productos to authenticated', cols);

  select string_agg(quote_ident(column_name), ',' order by ordinal_position) into cols
    from information_schema.columns where table_schema='public' and table_name='ingresos' and column_name<>'costo_unit';
  execute 'revoke select on public.ingresos from authenticated';
  execute format('grant select (%s) on public.ingresos to authenticated', cols);
end $$;

-- Verificación (debe dar: costo=false, precio=true, costo_unit=false, total=true):
select has_column_privilege('authenticated','public.productos','costo','select')      as productos_costo,
       has_column_privilege('authenticated','public.productos','precio','select')     as productos_precio,
       has_column_privilege('authenticated','public.ingresos','costo_unit','select')  as ingresos_costo_unit,
       has_column_privilege('authenticated','public.ingresos','total','select')       as ingresos_total;
