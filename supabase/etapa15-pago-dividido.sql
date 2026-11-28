-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 15 · Pago dividido (una parte en efectivo y otra por transferencia/tarjeta)
-- PROPUESTA, NO EJECUTADA. Aditiva y re-ejecutable. No modifica ni borra datos existentes.
--
-- Cómo se guarda: el ingreso sigue siendo UNO solo (un corte = un servicio, una venta = una venta: no se
-- duplican estadísticas, comisiones ni stock). Se agregan dos columnas con la SEGUNDA parte del pago:
--   pago2_medio  ('transferencia' o 'tarjeta')  y  pago2_monto (cuánto se pagó así).
--   La primera parte es medio_pago (efectivo) por el resto: total − pago2_monto.
--   Los ingresos de siempre tienen ambas columnas vacías y se cuentan igual que hoy.
--
-- Qué agrega / cambia:
--   1. Las dos columnas en ingresos, y permiso para LEERLAS (desde la etapa 11b la lectura es por columna).
--   2. registrar_ingreso_dividido(...): registra el ingreso con la MISMA función de siempre
--      (registrar_ingreso: mismos controles de sesión, barbero, stock y doble toque) y le agrega la segunda
--      parte, TODO O NADA. Valida: medio distinto de efectivo, monto mayor a 0 y menor que el total.
--   3. caja_resumen: el efectivo esperado suma SOLO la parte en efectivo; la otra parte va a transferencias
--      o tarjetas. Es la misma función de hoy con ese único cambio en las tres sumas de ingresos.
--
-- ORDEN: 1) ejecutar este archivo; 2) recién después fusionar el PR de la app (la app nueva lee las
--        columnas nuevas y, sin este SQL, no cargaría).
-- VOLVER ATRÁS: no hace falta borrar nada; si se quiere, la app vieja sigue funcionando con las columnas.
-- =====================================================================

-- 1. Columnas de la segunda parte del pago
alter table public.ingresos add column if not exists pago2_medio text;
alter table public.ingresos add column if not exists pago2_monto numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ingresos_pago2_ok') then
    alter table public.ingresos add constraint ingresos_pago2_ok check (
      (pago2_medio is null and pago2_monto is null)
      or (pago2_medio in ('transferencia', 'tarjeta') and pago2_monto > 0));
  end if;
end $$;
grant select (pago2_medio, pago2_monto) on public.ingresos to authenticated;

-- 2. Registrar un ingreso con pago dividido (todo o nada)
create or replace function public.registrar_ingreso_dividido(
  p_op uuid, p_tipo text, p_concepto text, p_servicio uuid, p_producto uuid, p_cant integer, p_precio numeric,
  p_barbero uuid, p_cliente text, p_fecha date, p_medio text, p_cliente_id uuid, p_medio2 text, p_monto2 numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric;
begin
  if p_medio2 is null or p_medio2 not in ('transferencia', 'tarjeta') then raise exception 'Elegí transferencia o tarjeta para la segunda parte'; end if;
  if coalesce(p_medio, 'efectivo') = p_medio2 then raise exception 'Elegí dos medios de pago distintos'; end if;
  -- La misma función de siempre (controla sesión, barbero, stock e idempotencia por p_op). Un pago dividido está cobrado.
  v_id := public.registrar_ingreso(p_op, p_tipo, p_concepto, p_servicio, p_producto, p_cant, p_precio, p_barbero,
                                   p_cliente, p_fecha, coalesce(p_medio, 'efectivo'), p_cliente_id, true);
  select total into v_total from public.ingresos where id = v_id;
  if p_monto2 is null or p_monto2 <= 0 or p_monto2 >= v_total then
    raise exception 'La parte por % tiene que ser mayor a 0 y menor que el total', p_medio2;
  end if;
  update public.ingresos set pago2_medio = p_medio2, pago2_monto = p_monto2 where id = v_id and liquidacion_id is null;
  return v_id;
end $$;
revoke execute on function public.registrar_ingreso_dividido(uuid, text, text, uuid, uuid, integer, numeric, uuid, text, date, text, uuid, text, numeric) from public, anon;
grant execute on function public.registrar_ingreso_dividido(uuid, text, text, uuid, uuid, integer, numeric, uuid, text, date, text, uuid, text, numeric) to authenticated, service_role;

-- 3. Caja: cada medio suma solo su parte
create or replace function public.caja_resumen(p_caja uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.cajas%rowtype; v_fin timestamptz; r jsonb;
begin
  if not es_dueno() then raise exception 'Solo el dueño'; end if;
  select * into c from cajas where id = p_caja;
  if not found then raise exception 'Caja inexistente'; end if;
  v_fin := coalesce(c.cierre_at, now());
  select jsonb_build_object(
    'inicial', c.saldo_inicial,
    'ing_efectivo', coalesce((select sum(case when medio_pago = 'efectivo' then total - coalesce(pago2_monto, 0) else 0 end
                                        + case when pago2_medio = 'efectivo' then pago2_monto else 0 end)
                              from ingresos where cobrado and coalesce(cobrado_at, created_at) between c.apertura_at and v_fin), 0),
    'ing_transferencia', coalesce((select sum(case when medio_pago = 'transferencia' then total - coalesce(pago2_monto, 0) else 0 end
                                             + case when pago2_medio = 'transferencia' then pago2_monto else 0 end)
                                   from ingresos where cobrado and coalesce(cobrado_at, created_at) between c.apertura_at and v_fin), 0),
    'ing_tarjeta', coalesce((select sum(case when medio_pago = 'tarjeta' then total - coalesce(pago2_monto, 0) else 0 end
                                       + case when pago2_medio = 'tarjeta' then pago2_monto else 0 end)
                             from ingresos where cobrado and coalesce(cobrado_at, created_at) between c.apertura_at and v_fin), 0),
    'pendiente_cobro', coalesce((select sum(total) from ingresos where not cobrado), 0),
    'gastos_efectivo', coalesce((select sum(monto) from gastos where medio_pago = 'efectivo' and created_at between c.apertura_at and v_fin), 0),
    'liquidaciones', coalesce((select sum(monto) from liquidaciones where medio_pago = 'efectivo' and created_at between c.apertura_at and v_fin), 0),
    'adelantos', coalesce((select sum(monto) from adelantos where medio_pago = 'efectivo' and created_at between c.apertura_at and v_fin), 0),
    'compras_efectivo', coalesce((select sum(cantidad * costo_unit) from mov_stock where tipo = 'compra' and medio_pago = 'efectivo' and created_at between c.apertura_at and v_fin), 0),
    'mov_in', coalesce((select sum(monto) from caja_mov where caja_id = c.id and tipo = 'ingreso'), 0),
    'mov_out', coalesce((select sum(monto) from caja_mov where caja_id = c.id and tipo = 'egreso'), 0)) into r;
  return r || jsonb_build_object('esperado',
    (r->>'inicial')::numeric + (r->>'ing_efectivo')::numeric - (r->>'gastos_efectivo')::numeric - (r->>'liquidaciones')::numeric
    - (r->>'adelantos')::numeric - (r->>'compras_efectivo')::numeric + (r->>'mov_in')::numeric - (r->>'mov_out')::numeric);
end $$;

-- Verificación (debe dar: columnas=2, funcion=1, se_pueden_leer=true)
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ingresos' and column_name in ('pago2_medio', 'pago2_monto')) as columnas,
       (select count(*) from pg_proc where proname = 'registrar_ingreso_dividido') as funcion,
       has_column_privilege('authenticated', 'public.ingresos', 'pago2_monto', 'select') as se_pueden_leer;
