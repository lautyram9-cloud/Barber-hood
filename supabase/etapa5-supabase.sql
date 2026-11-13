-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 5 · Comisión por barbero, clientes, turnos y reservas públicas
-- Solo AGREGA tablas, columnas y funciones. No borra datos.
-- Ejecutar DESPUÉS de etapa3-supabase.sql. Se puede volver a ejecutar sin problema.
-- =====================================================================

-- ---------- 1. Comisión por barbero (además de la del servicio/producto) ----------
alter table public.barberos add column if not exists comision_pct numeric(5,2) check (comision_pct between 0 and 100);
create table if not exists public.comisiones_barbero(
  id uuid primary key default gen_random_uuid(),
  barbero_id uuid not null references public.barberos(id) on delete cascade,
  servicio_id uuid references public.servicios(id) on delete cascade,
  producto_id uuid references public.productos(id) on delete cascade,
  pct numeric(5,2) not null check (pct between 0 and 100),
  check ((servicio_id is null) <> (producto_id is null)),
  unique (barbero_id,servicio_id),
  unique (barbero_id,producto_id));

-- prioridad: excepción del barbero para ese servicio/producto > % general del barbero > % del servicio/producto
create or replace function public.pct_comision(p_barbero uuid,p_servicio uuid,p_producto uuid)
returns numeric language plpgsql stable security definer set search_path=public as $$
declare v numeric;
begin
  if p_barbero is null then return 0; end if;
  select pct into v from comisiones_barbero where barbero_id=p_barbero and ((p_servicio is not null and servicio_id=p_servicio) or (p_producto is not null and producto_id=p_producto)) limit 1;
  if found then return v; end if;
  select comision_pct into v from barberos where id=p_barbero;
  if v is not null then return v; end if;
  if p_servicio is not null then select comision_pct into v from servicios where id=p_servicio;
  elsif p_producto is not null then select comision_pct into v from productos where id=p_producto; end if;
  return coalesce(v,0);
end $$;

-- ---------- 2. Servicios con duración, clientes y turnos con varios servicios ----------
alter table public.servicios add column if not exists duracion_min int check (duracion_min>0);

create table if not exists public.clientes(
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  preferencias text,
  observaciones text,
  created_at timestamptz not null default now());
create unique index if not exists u_cli_tel on public.clientes(telefono) where telefono is not null;

alter table public.turnos add column if not exists cliente_id uuid references public.clientes(id);
alter table public.ingresos add column if not exists cliente_id uuid references public.clientes(id);
create table if not exists public.turno_items(
  turno_id uuid not null references public.turnos(id) on delete cascade,
  servicio_id uuid not null references public.servicios(id),
  primary key (turno_id,servicio_id));

-- un turno puede cobrar varios servicios, pero cada servicio una sola vez
alter table public.ingresos drop constraint if exists ingresos_turno_id_key;
create unique index if not exists u_ing_turno_serv on public.ingresos(turno_id,servicio_id) where turno_id is not null;
create index if not exists i_tur_cli on public.turnos(cliente_id);
create index if not exists i_ing_cli on public.ingresos(cliente_id);

-- un turno solo pasa a "atendido" al cobrarlo, y uno cobrado no se puede modificar
create or replace function public.turno_estado() returns trigger language plpgsql as $$
begin
  if tg_op='UPDATE' then
    if new.estado='atendido' and old.estado<>'atendido' and coalesce(current_setting('app.cobrando',true),'')<>'1' then
      raise exception 'Un turno se marca como atendido al cobrarlo';
    end if;
    if old.estado='atendido' and new.estado<>'atendido' then
      raise exception 'Un turno cobrado no se puede modificar';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists t_turno_estado on public.turnos;
create trigger t_turno_estado before update on public.turnos for each row execute function public.turno_estado();

-- ---------- 3. Funciones ----------
-- registrar_ingreso: ahora usa pct_comision y guarda el cliente (el cobro de turnos va por cobrar_turno)
drop function if exists public.registrar_ingreso(uuid,text,text,uuid,uuid,int,numeric,uuid,text,date,uuid,text);
create or replace function public.registrar_ingreso(p_op uuid,p_tipo text,p_concepto text,p_servicio uuid,p_producto uuid,p_cant int,p_precio numeric,p_barbero uuid,p_cliente text,p_fecha date,p_medio text default 'efectivo',p_cliente_id uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_b uuid:=p_barbero; v_costo numeric:=0; v_precio numeric:=p_precio; pr public.productos%rowtype;
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
  insert into ingresos(op_id,fecha,tipo,concepto,servicio_id,producto_id,cantidad,precio_unit,barbero_id,comision_pct,costo_unit,cliente,cliente_id,medio_pago)
  values(p_op,coalesce(p_fecha,current_date),p_tipo,p_concepto,p_servicio,case when p_tipo='producto' then p_producto end,p_cant,v_precio,v_b,
         pct_comision(v_b,case when p_tipo='servicio' then p_servicio end,case when p_tipo='producto' then p_producto end),v_costo,p_cliente,p_cliente_id,p_medio)
  returning id into v_id;
  if p_tipo='producto' then
    insert into mov_stock(producto_id,tipo,cantidad,costo_unit,fecha,ingreso_id) values(pr.id,'venta',-p_cant,v_costo,coalesce(p_fecha,current_date),v_id);
  end if;
  return v_id;
end $$;

-- cobrar_turno: cobra todos los servicios del turno en una sola operación (no se puede cobrar dos veces)
create or replace function public.cobrar_turno(p_turno uuid,p_medio text default 'efectivo')
returns int language plpgsql security definer set search_path=public as $$
declare t public.turnos%rowtype; r record; n int:=0;
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión'; end if;
  select * into t from turnos where id=p_turno for update;
  if not found then raise exception 'Turno inexistente'; end if;
  if not es_dueno() and t.barbero_id is distinct from mi_barbero() then raise exception 'Este turno no es tuyo'; end if;
  if t.estado='atendido' then raise exception 'Este turno ya fue cobrado'; end if;
  if t.estado in ('cancelado','ausente') then raise exception 'El turno está %',t.estado; end if;
  if t.barbero_id is null then raise exception 'Asigná un barbero al turno antes de cobrar'; end if;
  for r in select s.id,s.nombre,s.precio from servicios s
           where s.id in (select i.servicio_id from turno_items i where i.turno_id=t.id union select t.servicio_id where t.servicio_id is not null) loop
    insert into ingresos(op_id,fecha,tipo,concepto,servicio_id,cantidad,precio_unit,barbero_id,comision_pct,cliente,cliente_id,turno_id,medio_pago)
    values(gen_random_uuid(),t.inicio::date,'servicio',r.nombre,r.id,1,r.precio,t.barbero_id,pct_comision(t.barbero_id,r.id,null),t.cliente,t.cliente_id,t.id,p_medio);
    n:=n+1;
  end loop;
  if n=0 then raise exception 'El turno no tiene servicios cargados'; end if;
  perform set_config('app.cobrando','1',true);
  update turnos set estado='atendido' where id=t.id;
  return n;
end $$;

-- cliente_upsert: busca por teléfono (o por nombre si no hay teléfono) y si no existe lo crea
create or replace function public.cliente_upsert(p_nombre text,p_tel text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_t text:=nullif(regexp_replace(coalesce(p_tel,''),'\D','','g'),''); v_id uuid;
begin
  if auth.uid() is null then raise exception 'Necesitás iniciar sesión'; end if;
  if length(trim(coalesce(p_nombre,'')))<2 then raise exception 'Falta el nombre del cliente'; end if;
  if v_t is not null then
    select id into v_id from clientes where telefono=v_t; if found then return v_id; end if;
  else
    select id into v_id from clientes where lower(nombre)=lower(trim(p_nombre)) and telefono is null limit 1; if found then return v_id; end if;
  end if;
  insert into clientes(nombre,telefono) values(trim(p_nombre),v_t) returning id into v_id;
  return v_id;
end $$;

-- ---------- 4. Reservas públicas (sin iniciar sesión) ----------
-- Datos que ve el público: barberos, servicios, horarios y horarios ocupados (sin nombres de clientes)
create or replace function public.public_info() returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
  'barberos',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'slot_min',slot_min)),'[]'::jsonb) from barberos where activo),
  'servicios',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'precio',precio,'dur',duracion_min)),'[]'::jsonb) from servicios where activo),
  'horarios',(select coalesce(jsonb_agg(jsonb_build_object('dia',dia,'desde',desde,'hasta',hasta)),'[]'::jsonb) from horarios),
  'ocupados',(select coalesce(jsonb_agg(jsonb_build_object('b',barbero_id,'i',inicio,'f',fin)),'[]'::jsonb) from turnos
              where estado in ('pendiente','confirmado','atendido')
                and inicio>=((now() at time zone 'America/Argentina/Salta')-interval '1 day')
                and inicio<((now() at time zone 'America/Argentina/Salta')+interval '61 days')))
$$;

create or replace function public.reservar_publico(p_nombre text,p_tel text,p_inicio timestamp,p_barbero uuid,p_servicios uuid[],p_notas text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_now timestamp:=now() at time zone 'America/Argentina/Salta'; v_dur int; v_slot int; v_cli uuid; v_id uuid;
        v_t text:=nullif(regexp_replace(coalesce(p_tel,''),'\D','','g'),''); v_fin timestamp;
begin
  if length(trim(coalesce(p_nombre,'')))<2 or length(p_nombre)>80 or v_t is null or length(v_t)<8 or length(v_t)>15 then
    raise exception 'Completá tu nombre y un teléfono válido'; end if;
  if p_servicios is null or cardinality(p_servicios)<1 or cardinality(p_servicios)>5 then raise exception 'Elegí al menos un servicio'; end if;
  select slot_min into v_slot from barberos where id=p_barbero and activo;
  if not found then raise exception 'Barbero inválido'; end if;
  select sum(coalesce(duracion_min,v_slot)) into v_dur from servicios where id=any(p_servicios) and activo;
  if v_dur is null or (select count(*) from servicios where id=any(p_servicios) and activo)<>cardinality(p_servicios) then raise exception 'Servicio inválido'; end if;
  if p_inicio<=v_now or p_inicio>v_now+interval '60 days' then raise exception 'La fecha elegida no está disponible'; end if;
  v_fin:=p_inicio+make_interval(mins=>v_dur);
  if not exists(select 1 from horarios where dia=extract(dow from p_inicio)::int and p_inicio::time>=desde and v_fin::time<=hasta and v_fin::date=p_inicio::date) then
    raise exception 'Ese horario está fuera del horario de atención'; end if;
  if (select count(*) from turnos t join clientes c on c.id=t.cliente_id where c.telefono=v_t and t.estado='pendiente' and t.inicio>=v_now)>=3 then
    raise exception 'Ya tenés turnos pendientes de confirmar'; end if;
  select id into v_cli from clientes where telefono=v_t;
  if not found then insert into clientes(nombre,telefono) values(trim(p_nombre),v_t) returning id into v_cli; end if;
  insert into turnos(inicio,duracion_min,barbero_id,cliente,telefono,servicio_id,cliente_id,estado,notas)
  values(p_inicio,v_dur,p_barbero,trim(p_nombre),v_t,p_servicios[1],v_cli,'pendiente',left(p_notas,300)) returning id into v_id;
  insert into turno_items(turno_id,servicio_id) select v_id,unnest(p_servicios) on conflict do nothing;
  return v_id;
exception when exclusion_violation then
  raise exception 'Ese horario ya fue reservado, elegí otro';
end $$;

-- ---------- 5. Seguridad (RLS) de las tablas nuevas ----------
alter table public.comisiones_barbero enable row level security;
alter table public.clientes enable row level security;
alter table public.turno_items enable row level security;

drop policy if exists leer on public.comisiones_barbero;
drop policy if exists escribir on public.comisiones_barbero;
create policy leer on public.comisiones_barbero for select to authenticated using (true);
create policy escribir on public.comisiones_barbero for all to authenticated using (public.es_dueno()) with check (public.es_dueno());

drop policy if exists ver on public.clientes;
drop policy if exists crear on public.clientes;
drop policy if exists editar on public.clientes;
create policy ver on public.clientes for select to authenticated using (
  public.es_dueno()
  or exists (select 1 from public.turnos t where t.cliente_id=clientes.id and t.barbero_id=public.mi_barbero())
  or exists (select 1 from public.ingresos i where i.cliente_id=clientes.id and i.barbero_id=public.mi_barbero()));
create policy crear on public.clientes for insert to authenticated with check (public.es_dueno());
create policy editar on public.clientes for update to authenticated using (
  public.es_dueno()
  or exists (select 1 from public.turnos t where t.cliente_id=clientes.id and t.barbero_id=public.mi_barbero())
  or exists (select 1 from public.ingresos i where i.cliente_id=clientes.id and i.barbero_id=public.mi_barbero()))
  with check (true);

drop policy if exists ver on public.turno_items;
drop policy if exists escribir on public.turno_items;
create policy ver on public.turno_items for select to authenticated using (exists (select 1 from public.turnos t where t.id=turno_items.turno_id));
create policy escribir on public.turno_items for all to authenticated using (public.es_dueno()) with check (public.es_dueno());

-- permisos: solo usuarios con sesión; el público solo puede usar las 2 funciones de reservas
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.public_info() to anon;
grant execute on function public.reservar_publico(text,text,timestamp,uuid,uuid[],text) to anon;
revoke all on all tables in schema public from anon;

-- tiempo real
do $$ declare t text; begin
  foreach t in array array['comisiones_barbero','clientes','turno_items'] loop
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when others then null; end;
  end loop;
end $$;
