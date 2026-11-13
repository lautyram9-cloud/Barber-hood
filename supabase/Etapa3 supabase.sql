-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 3 · Esquema relacional + seguridad (RLS)
-- NO borra ni modifica la tabla "datos" (queda como respaldo).
-- ANTES de ejecutar: hacé el respaldo (te lo pasé en el chat).
-- Se puede ejecutar completo, y se puede volver a ejecutar sin problema.
-- =====================================================================
create extension if not exists btree_gist;

-- ---------- 1. ROLES: solo "owner" (dueño) y "barber" (barbero) ----------
update public.perfiles set rol='barber' where rol<>'owner';
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('owner','barber'));
create or replace function public.nuevo_perfil() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.perfiles(id,rol) values(new.id,'barber') on conflict do nothing; return new; end $$;
create or replace function public.es_dueno() returns boolean language sql stable security definer set search_path=public as $$
select coalesce((select rol='owner' from public.perfiles where id=auth.uid()),false) $$;

-- ---------- 2. TABLAS ----------
create table if not exists public.barberos(
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  user_id uuid unique references auth.users(id) on delete set null,
  slot_min int not null default 30 check (slot_min>0),
  activo boolean not null default true,
  created_at timestamptz not null default now());

create or replace function public.mi_barbero() returns uuid language sql stable security definer set search_path=public as $$
select id from public.barberos where user_id=auth.uid() and activo limit 1 $$;

create table if not exists public.servicios(
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  precio numeric(12,2) not null check (precio>=0),
  comision_pct numeric(5,2) not null default 0 check (comision_pct between 0 and 100),
  activo boolean not null default true);

create table if not exists public.productos(
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  categoria text,
  costo numeric(12,2) not null default 0 check (costo>=0),
  precio numeric(12,2) not null default 0 check (precio>=0),
  comision_pct numeric(5,2) not null default 0 check (comision_pct between 0 and 100),
  stock int not null default 0 check (stock>=0),
  stock_min int not null default 0,
  activo boolean not null default true);

create table if not exists public.horarios(
  id uuid primary key default gen_random_uuid(),
  dia smallint not null check (dia between 0 and 6),
  desde time not null,
  hasta time not null check (hasta>desde));

create table if not exists public.turnos(
  id uuid primary key default gen_random_uuid(),
  inicio timestamp not null,
  duracion_min int not null default 30 check (duracion_min>0),
  fin timestamp generated always as (inicio + make_interval(mins => duracion_min)) stored,
  barbero_id uuid references public.barberos(id),
  cliente text not null,
  telefono text,
  servicio_id uuid references public.servicios(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmado','atendido','cancelado','ausente')),
  notas text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint turnos_sin_superposicion exclude using gist (barbero_id with =, tsrange(inicio,fin) with &&)
    where (estado in ('pendiente','confirmado','atendido')));

create table if not exists public.liquidaciones(
  id uuid primary key default gen_random_uuid(),
  barbero_id uuid not null references public.barberos(id),
  desde date, hasta date not null,
  bruto numeric(12,2) not null,
  adelantos numeric(12,2) not null default 0,
  monto numeric(12,2) not null,
  fecha date not null default current_date,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now());

create table if not exists public.adelantos(
  id uuid primary key default gen_random_uuid(),
  barbero_id uuid not null references public.barberos(id),
  monto numeric(12,2) not null check (monto>0),
  fecha date not null default current_date,
  nota text,
  liquidacion_id uuid references public.liquidaciones(id));

create table if not exists public.ingresos(
  id uuid primary key default gen_random_uuid(),
  op_id uuid not null unique,
  fecha date not null,
  tipo text not null check (tipo in ('servicio','producto')),
  concepto text not null,
  servicio_id uuid references public.servicios(id),
  producto_id uuid references public.productos(id),
  cantidad int not null default 1 check (cantidad>0),
  precio_unit numeric(12,2) not null check (precio_unit>=0),
  total numeric(12,2) generated always as (cantidad*precio_unit) stored,
  barbero_id uuid references public.barberos(id),
  comision_pct numeric(5,2) not null default 0,
  comision_monto numeric(12,2) generated always as (round(cantidad*precio_unit*comision_pct/100,2)) stored,
  costo_unit numeric(12,2) not null default 0,
  cliente text,
  turno_id uuid unique references public.turnos(id),
  medio_pago text not null default 'efectivo' check (medio_pago in ('efectivo','transferencia','tarjeta')),
  cobrado boolean not null default true,
  liquidacion_id uuid references public.liquidaciones(id),
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now());

create table if not exists public.gastos(
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null check (tipo in ('fijo','variable')),
  concepto text not null,
  monto numeric(12,2) not null check (monto>0),
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now());

create table if not exists public.dueno_mov(
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  tipo text not null check (tipo in ('ing','gas')),
  concepto text not null,
  monto numeric(12,2) not null check (monto>0),
  created_at timestamptz not null default now());

create table if not exists public.asistencia(
  id uuid primary key default gen_random_uuid(),
  barbero_id uuid not null references public.barberos(id),
  fecha date not null,
  estado text not null check (estado in ('ok','tarde','falta')),
  hora time,
  unique (barbero_id,fecha));

create table if not exists public.mov_stock(
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id),
  tipo text not null check (tipo in ('compra','venta','perdida','ajuste')),
  cantidad int not null,
  costo_unit numeric(12,2),
  proveedor text, nota text,
  fecha date not null default current_date,
  ingreso_id uuid references public.ingresos(id) on delete set null,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now());

create table if not exists public.audit_logs(
  id bigint generated always as identity primary key,
  tabla text, op text, fila jsonb, antes jsonb,
  usuario uuid default auth.uid(),
  fecha timestamptz not null default now());

create index if not exists i_ing_fecha on public.ingresos(fecha);
create index if not exists i_ing_barb on public.ingresos(barbero_id,fecha);
create index if not exists i_ing_pend on public.ingresos(barbero_id) where liquidacion_id is null;
create index if not exists i_gas_fecha on public.gastos(fecha);
create index if not exists i_tur_ini on public.turnos(inicio);
create index if not exists i_mov_prod on public.mov_stock(producto_id);

-- horario inicial (solo si está vacío): lun-vie 10 a 20, sáb 10 a 18. Se edita desde la app.
insert into public.horarios(dia,desde,hasta)
select d,'10:00'::time,(case when d=6 then '18:00' else '20:00' end)::time from generate_series(1,6) d
where not exists (select 1 from public.horarios);

-- ---------- 3. PROTECCIONES ----------
create or replace function public.bloquear_liquidados() returns trigger language plpgsql as $$
begin
  if old.liquidacion_id is not null and (tg_op='DELETE' or new.liquidacion_id is not distinct from old.liquidacion_id) then
    raise exception 'Ingreso ya liquidado: no se puede modificar';
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists t_bloq on public.ingresos;
create trigger t_bloq before update or delete on public.ingresos for each row execute function public.bloquear_liquidados();

create or replace function public.auditar() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into audit_logs(tabla,op,fila,antes)
  values(tg_table_name,tg_op,case when tg_op<>'DELETE' then to_jsonb(new) end,case when tg_op<>'INSERT' then to_jsonb(old) end);
  return coalesce(new,old);
end $$;
do $$ declare t text; begin
  foreach t in array array['ingresos','gastos','liquidaciones','adelantos','productos','servicios','barberos'] loop
    execute format('drop trigger if exists aud on public.%I',t);
    execute format('create trigger aud after insert or update or delete on public.%I for each row execute function public.auditar()',t);
  end loop;
end $$;

-- ---------- 4. FUNCIONES (operaciones atómicas) ----------
create or replace function public.registrar_ingreso(p_op uuid,p_tipo text,p_concepto text,p_servicio uuid,p_producto uuid,p_cant int,p_precio numeric,p_barbero uuid,p_cliente text,p_fecha date,p_turno uuid default null,p_medio text default 'efectivo')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_b uuid:=p_barbero; v_pct numeric:=0; v_costo numeric:=0; v_precio numeric:=p_precio; pr public.productos%rowtype;
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
    v_pct:=pr.comision_pct; v_costo:=pr.costo; v_precio:=coalesce(v_precio,pr.precio);
    update productos set stock=stock-p_cant where id=pr.id;
  elsif p_servicio is not null then
    select comision_pct,coalesce(v_precio,precio) into v_pct,v_precio from servicios where id=p_servicio;
  end if;
  if v_precio is null then raise exception 'Falta el precio'; end if;
  if v_b is null then v_pct:=0; end if;
  insert into ingresos(op_id,fecha,tipo,concepto,servicio_id,producto_id,cantidad,precio_unit,barbero_id,comision_pct,costo_unit,cliente,turno_id,medio_pago)
  values(p_op,coalesce(p_fecha,current_date),p_tipo,p_concepto,p_servicio,case when p_tipo='producto' then p_producto end,p_cant,v_precio,v_b,v_pct,v_costo,p_cliente,p_turno,p_medio)
  returning id into v_id;
  if p_tipo='producto' then
    insert into mov_stock(producto_id,tipo,cantidad,costo_unit,fecha,ingreso_id) values(pr.id,'venta',-p_cant,v_costo,coalesce(p_fecha,current_date),v_id);
  end if;
  if p_turno is not null then
    update turnos set estado='atendido' where id=p_turno and (es_dueno() or barbero_id=v_b);
  end if;
  return v_id;
end $$;

create or replace function public.liquidar_comisiones(p_barbero uuid,p_hasta date)
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
  insert into liquidaciones(barbero_id,desde,hasta,bruto,adelantos,monto) values(p_barbero,v_desde,p_hasta,v_bruto,v_adel,v_bruto-v_adel) returning id into v_id;
  update ingresos set liquidacion_id=v_id where barbero_id=p_barbero and liquidacion_id is null and fecha<=p_hasta;
  update adelantos set liquidacion_id=v_id where barbero_id=p_barbero and liquidacion_id is null;
  return v_id;
end $$;

create or replace function public.registrar_compra(p_producto uuid,p_cant int,p_costo numeric,p_proveedor text,p_fecha date)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not es_dueno() then raise exception 'Solo el dueño registra compras'; end if;
  if p_cant<1 or p_costo<0 then raise exception 'Cantidad o costo inválido'; end if;
  update productos set costo=round((stock*costo+p_cant*p_costo)/(stock+p_cant),2), stock=stock+p_cant where id=p_producto;
  if not found then raise exception 'Producto inexistente'; end if;
  insert into mov_stock(producto_id,tipo,cantidad,costo_unit,proveedor,fecha) values(p_producto,'compra',p_cant,p_costo,nullif(p_proveedor,''),coalesce(p_fecha,current_date));
end $$;

create or replace function public.anular_ingreso(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r public.ingresos%rowtype;
begin
  if not es_dueno() then raise exception 'Solo el dueño puede anular'; end if;
  select * into r from ingresos where id=p_id for update;
  if not found then raise exception 'Ingreso inexistente'; end if;
  if r.liquidacion_id is not null then raise exception 'Ingreso ya liquidado: no se puede anular'; end if;
  if r.producto_id is not null then
    update productos set stock=stock+r.cantidad where id=r.producto_id;
    insert into mov_stock(producto_id,tipo,cantidad,costo_unit,nota) values(r.producto_id,'ajuste',r.cantidad,r.costo_unit,'Anulación de venta');
  end if;
  delete from ingresos where id=p_id;
end $$;

create or replace function public.marcar_asistencia()
returns text language plpgsql security definer set search_path=public as $$
declare v_b uuid:=mi_barbero(); v_now timestamp:=now() at time zone 'America/Argentina/Salta'; v_ini time; v_e text;
begin
  if v_b is null then raise exception 'Tu usuario no está vinculado a un barbero'; end if;
  select min(desde) into v_ini from horarios where dia=extract(dow from v_now)::int;
  v_e:=case when v_ini is not null and v_now::time>v_ini+interval '10 minutes' then 'tarde' else 'ok' end;
  insert into asistencia(barbero_id,fecha,estado,hora) values(v_b,v_now::date,v_e,v_now::time) on conflict (barbero_id,fecha) do nothing;
  return v_e;
end $$;

create or replace function public.vincular_barbero(p_barbero uuid,p_email text)
returns void language plpgsql security definer set search_path=public as $$
declare v_u uuid;
begin
  if not es_dueno() then raise exception 'Solo el dueño'; end if;
  select id into v_u from auth.users where lower(email)=lower(trim(p_email));
  if v_u is null then raise exception 'No existe un usuario con ese email'; end if;
  update barberos set user_id=v_u where id=p_barbero;
end $$;

create or replace function public.guardar_horarios(p jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not es_dueno() then raise exception 'Solo el dueño'; end if;
  delete from horarios where true;
  insert into horarios(dia,desde,hasta) select (x->>'dia')::smallint,(x->>'desde')::time,(x->>'hasta')::time from jsonb_array_elements(p) x;
end $$;

-- ---------- 5. SEGURIDAD (RLS) ----------
alter table public.barberos enable row level security;
alter table public.servicios enable row level security;
alter table public.productos enable row level security;
alter table public.horarios enable row level security;
alter table public.turnos enable row level security;
alter table public.liquidaciones enable row level security;
alter table public.adelantos enable row level security;
alter table public.ingresos enable row level security;
alter table public.gastos enable row level security;
alter table public.dueno_mov enable row level security;
alter table public.asistencia enable row level security;
alter table public.mov_stock enable row level security;
alter table public.audit_logs enable row level security;

do $$ declare r record; begin
  for r in select policyname,tablename from pg_policies where schemaname='public'
    and tablename in ('barberos','servicios','productos','horarios','turnos','liquidaciones','adelantos','ingresos','gastos','dueno_mov','asistencia','mov_stock','audit_logs')
  loop execute format('drop policy %I on public.%I',r.policyname,r.tablename); end loop;
end $$;

-- catálogo: leen todos los usuarios con sesión; escribe solo el dueño
do $$ declare t text; begin
  foreach t in array array['barberos','servicios','productos','horarios'] loop
    execute format('create policy leer on public.%I for select to authenticated using (true)',t);
    execute format('create policy escribir on public.%I for all to authenticated using (public.es_dueno()) with check (public.es_dueno())',t);
  end loop;
  foreach t in array array['gastos','dueno_mov'] loop
    execute format('create policy solo_dueno on public.%I for all to authenticated using (public.es_dueno()) with check (public.es_dueno())',t);
  end loop;
end $$;

-- ingresos: el dueño ve todo; cada barbero ve solo los suyos. Se crean/anulan con funciones.
create policy ver on public.ingresos for select to authenticated using (public.es_dueno() or barbero_id=public.mi_barbero());
create policy editar on public.ingresos for update to authenticated using (public.es_dueno()) with check (public.es_dueno());

-- turnos
create policy ver on public.turnos for select to authenticated using (public.es_dueno() or barbero_id=public.mi_barbero() or barbero_id is null);
create policy crear on public.turnos for insert to authenticated with check (public.es_dueno() or barbero_id=public.mi_barbero());
create policy editar on public.turnos for update to authenticated using (public.es_dueno() or barbero_id=public.mi_barbero() or barbero_id is null) with check (public.es_dueno() or barbero_id=public.mi_barbero());
create policy borrar on public.turnos for delete to authenticated using (public.es_dueno());

-- liquidaciones, adelantos, asistencia
create policy ver on public.liquidaciones for select to authenticated using (public.es_dueno() or barbero_id=public.mi_barbero());
create policy ver on public.adelantos for select to authenticated using (public.es_dueno() or barbero_id=public.mi_barbero());
create policy crear on public.adelantos for insert to authenticated with check (public.es_dueno());
create policy ver on public.asistencia for select to authenticated using (public.es_dueno() or barbero_id=public.mi_barbero());
create policy crear on public.asistencia for insert to authenticated with check (public.es_dueno());

-- movimientos de stock y auditoría: solo el dueño
create policy ver on public.mov_stock for select to authenticated using (public.es_dueno());
create policy ver on public.audit_logs for select to authenticated using (public.es_dueno());

-- permisos de funciones: solo usuarios con sesión
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;

-- tiempo real
do $$ declare t text; begin
  foreach t in array array['barberos','servicios','productos','horarios','turnos','ingresos','gastos','dueno_mov','liquidaciones','adelantos','asistencia','mov_stock'] loop
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when others then null; end;
  end loop;
end $$;

-- =====================================================================
-- PASO FINAL (NO ejecutar todavía; solo cuando la app nueva ande bien):
-- bloquear escritura en la tabla vieja
-- revoke insert,update,delete on public.datos from authenticated;
-- =====================================================================
