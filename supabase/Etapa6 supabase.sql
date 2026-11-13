-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 6 · Caja, medios de pago, cobros pendientes y liquidaciones
-- Solo AGREGA columnas, tablas y funciones. No borra datos.
-- Ejecutar DESPUÉS de etapa5-supabase.sql. Se puede volver a ejecutar sin problema.
-- =====================================================================

-- ---------- 1. Medios de pago y cobros ----------
alter table public.ingresos add column if not exists cobrado_at timestamptz;
alter table public.ingresos alter column cobrado_at set default now();   -- los registros viejos (vacío) se toman como cobrados al crearse
alter table public.gastos add column if not exists medio_pago text not null default 'efectivo' check (medio_pago in ('efectivo','transferencia','tarjeta'));
alter table public.liquidaciones add column if not exists medio_pago text not null default 'efectivo' check (medio_pago in ('efectivo','transferencia','tarjeta'));
alter table public.adelantos add column if not exists medio_pago text not null default 'efectivo' check (medio_pago in ('efectivo','transferencia','tarjeta'));
alter table public.adelantos add column if not exists created_at timestamptz not null default now();

-- permite registrar el cobro de una venta pendiente aunque ya esté liquidada la comisión
create or replace function public.bloquear_liquidados() returns trigger language plpgsql as $$
begin
  if old.liquidacion_id is not null and (tg_op='DELETE' or new.liquidacion_id is not distinct from old.liquidacion_id)
     and coalesce(current_setting('app.cobrando_ing',true),'')<>'1' then
    raise exception 'Ingreso ya liquidado: no se puede modificar';
  end if;
  return coalesce(new,old);
end $$;

-- ---------- 2. Cajas ----------
create table if not exists public.cajas(
  id uuid primary key default gen_random_uuid(),
  apertura_at timestamptz not null default now(),
  saldo_inicial numeric(12,2) not null check (saldo_inicial>=0),
  abierta_por uuid default auth.uid(),
  cierre_at timestamptz,
  cerrada_por uuid,
  esperado numeric(12,2),
  contado numeric(12,2),
  diferencia numeric(12,2),
  notas text,
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')));
create unique index if not exists u_caja_abierta on public.cajas((estado)) where estado='abierta';   -- una sola caja abierta a la vez

create table if not exists public.caja_mov(
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id),
  tipo text not null check (tipo in ('ingreso','egreso')),
  concepto text not null,
  monto numeric(12,2) not null check (monto>0),
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now());

-- efectivo esperado = saldo inicial + cobros en efectivo - gastos, liquidaciones y adelantos en efectivo +/- movimientos manuales
create or replace function public.caja_resumen(p_caja uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c public.cajas%rowtype; v_fin timestamptz; r jsonb;
begin
  if not es_dueno() then raise exception 'Solo el dueño'; end if;
  select * into c from cajas where id=p_caja;
  if not found then raise exception 'Caja inexistente'; end if;
  v_fin:=coalesce(c.cierre_at,now());
  select jsonb_build_object(
    'inicial',c.saldo_inicial,
    'ing_efectivo',coalesce((select sum(total) from ingresos where cobrado and medio_pago='efectivo' and coalesce(cobrado_at,created_at) between c.apertura_at and v_fin),0),
    'ing_transferencia',coalesce((select sum(total) from ingresos where cobrado and medio_pago='transferencia' and coalesce(cobrado_at,created_at) between c.apertura_at and v_fin),0),
    'ing_tarjeta',coalesce((select sum(total) from ingresos where cobrado and medio_pago='tarjeta' and coalesce(cobrado_at,created_at) between c.apertura_at and v_fin),0),
    'pendiente_cobro',coalesce((select sum(total) from ingresos where not cobrado),0),
    'gastos_efectivo',coalesce((select sum(monto) from gastos where medio_pago='efectivo' and created_at between c.apertura_at and v_fin),0),
    'liquidaciones',coalesce((select sum(monto) from liquidaciones where medio_pago='efectivo' and created_at between c.apertura_at and v_fin),0),
    'adelantos',coalesce((select sum(monto) from adelantos where medio_pago='efectivo' and created_at between c.apertura_at and v_fin),0),
    'mov_in',coalesce((select sum(monto) from caja_mov where caja_id=c.id and tipo='ingreso'),0),
    'mov_out',coalesce((select sum(monto) from caja_mov where caja_id=c.id and tipo='egreso'),0)) into r;
  return r || jsonb_build_object('esperado',
    (r->>'inicial')::numeric+(r->>'ing_efectivo')::numeric-(r->>'gastos_efectivo')::numeric-(r->>'liquidaciones')::numeric-(r->>'adelantos')::numeric+(r->>'mov_in')::numeric-(r->>'mov_out')::numeric);
end $$;

create or replace function public.abrir_caja(p_saldo numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not es_dueno() then raise exception 'Solo el dueño abre la caja'; end if;
  insert into cajas(saldo_inicial) values(coalesce(p_saldo,0)) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ya hay una caja abierta';
end $$;

create or replace function public.cerrar_caja(p_caja uuid,p_contado numeric,p_notas text default null) returns numeric language plpgsql security definer set search_path=public as $$
declare c public.cajas%rowtype; v_esp numeric;
begin
  if not es_dueno() then raise exception 'Solo el dueño cierra la caja'; end if;
  if p_contado is null or p_contado<0 then raise exception 'Efectivo contado inválido'; end if;
  select * into c from cajas where id=p_caja for update;
  if not found then raise exception 'Caja inexistente'; end if;
  if c.estado<>'abierta' then raise exception 'Esta caja ya está cerrada'; end if;
  v_esp:=(caja_resumen(p_caja)->>'esperado')::numeric;
  update cajas set cierre_at=now(),cerrada_por=auth.uid(),esperado=v_esp,contado=p_contado,diferencia=p_contado-v_esp,notas=p_notas,estado='cerrada' where id=p_caja;
  return p_contado-v_esp;
end $$;

-- ---------- 3. Cobro de ventas pendientes ----------
create or replace function public.cobrar_ingreso(p_id uuid,p_medio text default 'efectivo') returns void language plpgsql security definer set search_path=public as $$
begin
  if not es_dueno() then raise exception 'Solo el dueño registra cobros'; end if;
  perform set_config('app.cobrando_ing','1',true);
  update ingresos set cobrado=true,cobrado_at=now(),medio_pago=p_medio where id=p_id and not cobrado;
  if not found then raise exception 'El ingreso no existe o ya está cobrado'; end if;
end $$;

-- registrar_ingreso: ahora permite ventas pendientes de cobro (p_cobrado=false)
drop function if exists public.registrar_ingreso(uuid,text,text,uuid,uuid,int,numeric,uuid,text,date,text,uuid);
create or replace function public.registrar_ingreso(p_op uuid,p_tipo text,p_concepto text,p_servicio uuid,p_producto uuid,p_cant int,p_precio numeric,p_barbero uuid,p_cliente text,p_fecha date,p_medio text default 'efectivo',p_cliente_id uuid default null,p_cobrado boolean default true)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_b uuid:=p_barbero; v_costo numeric:=0; v_precio numeric:=p_precio; pr public.productos%rowtype; v_cob boolean:=coalesce(p_cobrado,true);
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión'; end if;
  if not es_dueno() then
    v_b:=mi_barbero();
    if v_b is null then raise exception 'Tu usuario no está vinculado a un barbero'; end if;
  end if;
  select id into v_id from ingresos where op_id=p_op;
  if found then return v_id; end if;
  if p_cant is null or p_cant<1 then raise exception 'Cantidad inválida'; end if;
  if p_tipo='producto' then
    select * into pr from productos where id=p_producto for update;
    if not found then raise exception 'Producto inexistente'; end if;
    if pr.stock<p_cant then raise exception 'Stock insuficiente: quedan %',pr.stock; end if;
    v_costo:=pr.costo; v_precio:=coalesce(v_precio,pr.precio);
    update productos set stock=stock-p_cant where id=pr.id;
  elsif p_servicio is not null then
    select coalesce(v_precio,precio) into v_precio from servicios where id=p_servicio;
  end if;
  if v_precio is null then raise exception 'Falta el precio'; end if;
  insert into ingresos(op_id,fecha,tipo,concepto,servicio_id,producto_id,cantidad,precio_unit,barbero_id,comision_pct,costo_unit,cliente,cliente_id,medio_pago,cobrado,cobrado_at)
  values(p_op,coalesce(p_fecha,current_date),p_tipo,p_concepto,p_servicio,case when p_tipo='producto' then p_producto end,p_cant,v_precio,v_b,
         pct_comision(v_b,case when p_tipo='servicio' then p_servicio end,case when p_tipo='producto' then p_producto end),v_costo,p_cliente,p_cliente_id,p_medio,v_cob,case when v_cob then now() end)
  returning id into v_id;
  if p_tipo='producto' then
    insert into mov_stock(producto_id,tipo,cantidad,costo_unit,fecha,ingreso_id) values(pr.id,'venta',-p_cant,v_costo,coalesce(p_fecha,current_date),v_id);
  end if;
  return v_id;
end $$;

-- liquidar_comisiones: ahora registra el medio de pago de la liquidación
drop function if exists public.liquidar_comisiones(uuid,date);
create or replace function public.liquidar_comisiones(p_barbero uuid,p_hasta date,p_medio text default 'efectivo')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_bruto numeric; v_adel numeric; v_desde date; v_id uuid;
begin
  if not es_dueno() then raise exception 'Solo el dueño puede liquidar'; end if;
  perform 1 from ingresos where barbero_id=p_barbero and liquidacion_id is null and fecha<=p_hasta for update;
  select coalesce(sum(comision_monto),0),min(fecha) into v_bruto,v_desde from ingresos
   where barbero_id=p_barbero and liquidacion_id is null and fecha<=p_hasta;
  if v_bruto<=0 then raise exception 'No hay comisiones pendientes para liquidar'; end if;
  select coalesce(sum(monto),0) into v_adel from adelantos where barbero_id=p_barbero and liquidacion_id is null;
  if v_adel>v_bruto then raise exception 'Los adelantos superan la comisión a liquidar'; end if;
  insert into liquidaciones(barbero_id,desde,hasta,bruto,adelantos,monto,medio_pago) values(p_barbero,v_desde,p_hasta,v_bruto,v_adel,v_bruto-v_adel,p_medio) returning id into v_id;
  update ingresos set liquidacion_id=v_id where barbero_id=p_barbero and liquidacion_id is null and fecha<=p_hasta;
  update adelantos set liquidacion_id=v_id where barbero_id=p_barbero and liquidacion_id is null;
  return v_id;
end $$;

-- ---------- 4. Seguridad ----------
alter table public.cajas enable row level security;
alter table public.caja_mov enable row level security;
drop policy if exists solo_dueno on public.cajas;
drop policy if exists solo_dueno on public.caja_mov;
create policy solo_dueno on public.cajas for all to authenticated using (public.es_dueno()) with check (public.es_dueno());
create policy solo_dueno on public.caja_mov for all to authenticated using (public.es_dueno()) with check (public.es_dueno());

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.public_info() to anon;
grant execute on function public.reservar_publico(text,text,timestamp,uuid,uuid[],text) to anon;
revoke all on all tables in schema public from anon;

do $$ declare t text; begin
  foreach t in array array['cajas','caja_mov'] loop
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when others then null; end;
  end loop;
end $$;
