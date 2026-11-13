-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 9 · Ajustes de seguridad y rendimiento
-- Basado en las alertas del asesor de Supabase. No borra datos ni cambia permisos de uso.
-- Se puede ejecutar completo y repetir sin problema.
-- =====================================================================

-- 1. Funciones de control con ruta de búsqueda fija (alerta "search_path mutable")
alter function public.bloquear_liquidados() set search_path = public;
alter function public.turno_estado() set search_path = public;

-- 2. Política de perfiles más eficiente (alerta "auth_rls_initplan")
drop policy if exists ver_perfil on public.perfiles;
create policy ver_perfil on public.perfiles for select to authenticated using (id = (select auth.uid()));

-- 3. Índices que faltan en relaciones (para que siga rápido cuando crezcan los datos)
create index if not exists i_adel_barb on public.adelantos(barbero_id);
create index if not exists i_adel_liq on public.adelantos(liquidacion_id);
create index if not exists i_cmov_caja on public.caja_mov(caja_id);
create index if not exists i_cbar_prod on public.comisiones_barbero(producto_id);
create index if not exists i_cbar_serv on public.comisiones_barbero(servicio_id);
create index if not exists i_ing_liq on public.ingresos(liquidacion_id);
create index if not exists i_ing_prod on public.ingresos(producto_id);
create index if not exists i_ing_serv on public.ingresos(servicio_id);
create index if not exists i_liq_barb on public.liquidaciones(barbero_id);
create index if not exists i_mov_ing on public.mov_stock(ingreso_id);
create index if not exists i_mov_prov on public.mov_stock(proveedor_id);
create index if not exists i_prod_prov on public.productos(proveedor_id);
create index if not exists i_titem_serv on public.turno_items(servicio_id);
create index if not exists i_tur_serv on public.turnos(servicio_id);
