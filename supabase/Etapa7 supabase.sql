-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 7 · Proveedores e inventario
-- Solo AGREGA tablas, columnas y funciones. No borra datos.
-- Ejecutar DESPUÉS de etapa6-supabase.sql. Se puede volver a ejecutar sin problema.
-- =====================================================================

-- ---------- 1. Proveedores ----------
create table if not exists public.proveedores(
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  telefono text,
  notas text,
  activo boolean not null default true);
alter table public.productos add column if not exists proveedor_id uuid references public.proveedores(id);
alter table public.mov_stock add column if not exists proveedor_id uuid references public.proveedores(id);
alter table public.mov_stock add column if not exists medio_pago text not null default 'efectivo' check (medio_pago in ('efectivo','transferencia','tarjeta'));

alter table public.proveedores enable row level security;
drop policy if exists solo_dueno on public.proveedores;
create policy solo_dueno on public.proveedores for all to authenticated using (public.es_dueno()) with check (public.es_dueno());

-- ---------- 2. El stock solo se modifica con compras, ventas, pérdidas o ajustes ----------
-- (las funciones del sistema siguen pudiendo hacerlo; desde la app ya no se puede editar el stock "a mano")
revoke update on public.productos from authenticated;
grant update (nombre,categoria,costo,precio,comision_pct,stock_min,activo,proveedor_id) on public.productos to authenticated;

-- ---------- 3. Funciones de inventario ----------
-- compra a proveedor (ahora con proveedor y medio de pago; el efectivo descuenta de la caja)
drop function if exists public.registrar_compra(uuid,int,numeric,text,date);
create or replace function public.registrar_compra(p_producto uuid,p_cant int,p_costo numeric,p_proveedor uuid,p_fecha date,p_medio text default 'efectivo')
returns void language plpgsql security definer set search_path=public as $$
begin
  if not es_dueno() then raise exception 'Solo el dueño registra compras'; end if;
  if p_cant<1 or p_costo<0 then raise exception 'Cantidad o costo inválido'; end if;
  update productos set costo=round((stock*costo+p_cant*p_costo)/(stock+p_cant),2), stock=stock+p_cant, proveedor_id=coalesce(p_proveedor,proveedor_id) where id=p_producto;
  if not found then raise exception 'Producto inexistente'; end if;
  insert into mov_stock(producto_id,tipo,cantidad,costo_unit,proveedor,proveedor_id,medio_pago,fecha)
  values(p_producto,'compra',p_cant,p_costo,(select nombre from proveedores where id=p_proveedor),p_proveedor,coalesce(p_medio,'efectivo'),coalesce(p_fecha,current_date));
end $$;

-- pérdida o producto dañado: baja el stock y se registra al costo del producto
create or replace function public.registrar_perdida(p_producto uuid,p_cant int,p_motivo text)
returns void language plpgsql security definer set search_path=public as $$
declare pr public.productos%rowtype;
begin
  if not es_dueno() then raise exception 'Solo el dueño registra pérdidas'; end if;
  if p_cant is null or p_cant<1 then raise exception 'Cantidad inválida'; end if;
  select * into pr from productos where id=p_producto for update;
  if not found then raise exception 'Producto inexistente'; end if;
  if pr.stock<p_cant then raise exception 'Stock insuficiente: quedan %',pr.stock; end if;
  update productos set stock=stock-p_cant where id=pr.id;
  insert into mov_stock(producto_id,tipo,cantidad,costo_unit,nota) values(pr.id,'perdida',-p_cant,pr.costo,nullif(p_motivo,''));
end $$;

-- ajuste por conteo físico (o stock inicial)
create or replace function public.ajustar_stock(p_producto uuid,p_nuevo int,p_nota text default null)
returns void language plpgsql security definer set search_path=public as $$
declare pr public.productos%rowtype; d int;
begin
  if not es_dueno() then raise exception 'Solo el dueño ajusta el stock'; end if;
  if p_nuevo is null or p_nuevo<0 then raise exception 'Stock inválido'; end if;
  select * into pr from productos where id=p_producto for update;
  if not found then raise exception 'Producto inexistente'; end if;
  d:=p_nuevo-pr.stock;
  if d=0 then return; end if;
  update productos set stock=p_nuevo where id=pr.id;
  insert into mov_stock(producto_id,tipo,cantidad,costo_unit,nota) values(pr.id,'ajuste',d,pr.costo,coalesce(nullif(p_nota,''),'Conteo físico'));
end $$;

-- ---------- 4. La caja descuenta las compras pagadas en efectivo ----------
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
    'compras_efectivo',coalesce((select sum(cantidad*costo_unit) from mov_stock where tipo='compra' and medio_pago='efectivo' and created_at between c.apertura_at and v_fin),0),
    'mov_in',coalesce((select sum(monto) from caja_mov where caja_id=c.id and tipo='ingreso'),0),
    'mov_out',coalesce((select sum(monto) from caja_mov where caja_id=c.id and tipo='egreso'),0)) into r;
  return r || jsonb_build_object('esperado',
    (r->>'inicial')::numeric+(r->>'ing_efectivo')::numeric-(r->>'gastos_efectivo')::numeric-(r->>'liquidaciones')::numeric-(r->>'adelantos')::numeric-(r->>'compras_efectivo')::numeric+(r->>'mov_in')::numeric-(r->>'mov_out')::numeric);
end $$;

-- ---------- 5. Permisos ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.public_info() to anon;
grant execute on function public.reservar_publico(text,text,timestamp,uuid,uuid[],text) to anon;
revoke all on all tables in schema public from anon;

do $$ begin
  begin alter publication supabase_realtime add table public.proveedores; exception when others then null; end;
end $$;
