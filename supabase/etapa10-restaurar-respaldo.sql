-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 10 · Restaurar respaldos (PROPUESTA, NO EJECUTADA TODAVÍA)
-- Aditivo y re-ejecutable: solo crea/reemplaza UNA función. No toca tablas, datos ni políticas.
--
-- Qué hace la función restaurar_respaldo(p, p_aplicar):
--   * Solo la puede usar el DUEÑO.
--   * Recibe el contenido del archivo de copia de seguridad (el mismo JSON que genera Ajustes → Respaldo).
--   * RECUPERA LO QUE FALTA: inserta solo las filas cuyo id no existe hoy. NUNCA modifica ni borra
--     filas existentes (las que ya están quedan como están).
--   * p_aplicar = false (por defecto): SIMULA. Devuelve cuántas filas faltan por tabla, sin escribir nada.
--   * p_aplicar = true: inserta lo que falta, todo o nada (si algo falla se deshace todo).
--   * Respeta las columnas calculadas (ingresos.total / comision_monto, turnos.fin): no las inserta.
--   * No cambia el stock actual de productos que ya existen (stock = el que tiene hoy la base).
--   * Las filas que choquen con una regla de unicidad (mismo nombre de producto con otro id, otra caja
--     abierta, mismo teléfono de cliente…) se saltean; si otra fila depende de ellas, falla todo y no
--     queda nada a medias.
-- =====================================================================
create or replace function public.restaurar_respaldo(p jsonb, p_aplicar boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  -- Orden pensado para las claves foráneas (primero lo que otros referencian).
  orden text[] := array['barberos','servicios','proveedores','productos','horarios','clientes','comisiones_barbero',
    'turnos','turno_items','cajas','caja_mov','liquidaciones','ingresos','adelantos','asistencia','mov_stock','gastos','dueno_mov'];
  t text; datos jsonb; cols text; n int; res jsonb := '{}'::jsonb;
begin
  if not public.es_dueno() then raise exception 'Solo el dueño puede restaurar una copia de seguridad'; end if;
  if p is null or jsonb_typeof(p) <> 'object' or coalesce(p->>'version','') <> '1' then
    raise exception 'El archivo no es una copia de seguridad válida de Barber Hood';
  end if;
  foreach t in array orden loop
    datos := coalesce(p->t, '[]'::jsonb);
    if jsonb_typeof(datos) <> 'array' then raise exception 'Copia inválida: "%" no es una lista', t; end if;
    if t = 'turno_items' then
      execute format('select count(*) from jsonb_populate_recordset(null::public.%I,$1) r where not exists (select 1 from public.%I x where x.turno_id=r.turno_id and x.servicio_id=r.servicio_id)', t, t) into n using datos;
    else
      execute format('select count(*) from jsonb_populate_recordset(null::public.%I,$1) r where not exists (select 1 from public.%I x where x.id=r.id)', t, t) into n using datos;
    end if;
    if p_aplicar and n > 0 then
      select string_agg(quote_ident(column_name), ',' order by ordinal_position) into cols
        from information_schema.columns where table_schema='public' and table_name=t and is_generated='NEVER';
      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) on conflict do nothing', t, cols, cols, t) using datos;
    end if;
    res := res || jsonb_build_object(t, n);
  end loop;
  return res;
end $$;

revoke execute on function public.restaurar_respaldo(jsonb, boolean) from public, anon;
grant execute on function public.restaurar_respaldo(jsonb, boolean) to authenticated, service_role;
