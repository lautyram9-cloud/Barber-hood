-- =====================================================================
-- BARBER HOOD MANAGER · ETAPA 9 · Pruebas automáticas de la base de datos
-- NO deja nada guardado: crea datos de prueba y al terminar los deshace TODOS.
-- Al final vas a ver un mensaje ROJO que dice "RESULTADO DE LAS PRUEBAS": es normal,
-- es la forma de mostrarte el resumen y a la vez deshacer todo.
-- Ejecutar completo en el SQL Editor. Se puede repetir las veces que quieras.
-- =====================================================================
drop table if exists _t;
create temp table _t(n serial, ok boolean, nombre text, detalle text);
create or replace function pg_temp.ck(p_nombre text, p_ok boolean, p_det text default '') returns void language sql as $$
  insert into _t(ok,nombre,detalle) values(coalesce(p_ok,false),p_nombre,p_det) $$;

do $t$
declare
  u_o uuid:=gen_random_uuid(); u_1 uuid:=gen_random_uuid(); u_2 uuid:=gen_random_uuid();
  b1 uuid; b2 uuid; s1 uuid; s2 uuid; p1 uuid; cj uuid; i1 uuid; i2 uuid; i3 uuid; op uuid; v uuid; vb uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; lq uuid; c_a uuid; c_b uuid;
  n int; k int; a1 int; a2 int; a3 int; a4 int; a5 int; a6 int; a7 int;
  x numeric; y numeric; z numeric; cs numeric; m text; m2 text; m3 text; hz boolean;
  d date:=current_date+7; d2 date:=current_date+8;
  rr text; okn int; kon int;
begin
  -- ===== preparación =====
  begin
    insert into auth.users(id,aud,role,email) values
      (u_o,'authenticated','authenticated','prueba-dueno@test.local'),
      (u_1,'authenticated','authenticated','prueba-b1@test.local'),
      (u_2,'authenticated','authenticated','prueba-b2@test.local');
    update public.perfiles set rol='owner' where id=u_o;
    insert into public.barberos(nombre,user_id,slot_min) values('TEST Ana',u_1,30) returning id into b1;
    insert into public.barberos(nombre,user_id,slot_min) values('TEST Beto',u_2,30) returning id into b2;
    insert into public.servicios(nombre,precio,comision_pct,duracion_min) values('TEST Corte',10000,60,30) returning id into s1;
    insert into public.servicios(nombre,precio,comision_pct,duracion_min) values('TEST Barba',5000,30,30) returning id into s2;
    insert into public.productos(nombre,costo,precio,comision_pct,stock,stock_min) values('TEST Cera',1000,3000,10,5,2) returning id into p1;
  exception when others then
    raise exception 'No se pudo preparar la prueba: %',sqlerrm;
  end;
  perform set_config('request.jwt.claim.sub',u_o::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u_o,'role','authenticated')::text,true);

  -- ===== CAJA =====
  begin
    if exists(select 1 from public.cajas where estado='abierta') then
      perform pg_temp.ck('Caja: prueba omitida porque hay una caja abierta real (cerrala y repetí)',true);
    else
      cj:=abrir_caja(1000);
      begin perform abrir_caja(500); perform pg_temp.ck('Caja: no permite abrir dos cajas',false,'permitió abrir otra');
      exception when others then perform pg_temp.ck('Caja: no permite abrir dos cajas',true); end;
      perform registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,10000,b1,null,d,'efectivo',null,true);
      perform registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,10000,b1,null,d,'transferencia',null,true);
      i2:=registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,10000,b1,null,d,'efectivo',null,false);
      insert into public.gastos(fecha,tipo,concepto,monto,medio_pago) values(d,'variable','TEST gasto',500,'efectivo');
      perform registrar_compra(p1,2,100,null,d,'efectivo');
      x:=(caja_resumen(cj)->>'esperado')::numeric;
      perform pg_temp.ck('Caja: efectivo esperado = inicial + cobros en efectivo − gastos − compras (sin transferencias ni pendientes)',x=10300,'esperado '||x||' (debía ser 10300)');
      perform cobrar_ingreso(i2,'efectivo');
      x:=(caja_resumen(cj)->>'esperado')::numeric;
      perform pg_temp.ck('Caja: al cobrar una venta pendiente en efectivo, suma a la caja',x=20300,'esperado '||x||' (debía ser 20300)');
      y:=cerrar_caja(cj,20000);
      perform pg_temp.ck('Caja: el arqueo calcula la diferencia (contado − esperado)',y=-300,'diferencia '||y||' (debía ser -300)');
      begin perform cerrar_caja(cj,1); perform pg_temp.ck('Caja: no permite cerrar dos veces',false,'permitió');
      exception when others then perform pg_temp.ck('Caja: no permite cerrar dos veces',true); end;
    end if;
  exception when others then perform pg_temp.ck('Caja: error inesperado',false,sqlerrm);
  end;

  -- ===== COMISIONES =====
  begin
    i1:=registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,null,b1,null,d,'efectivo',null,true);
    select comision_monto into x from public.ingresos where id=i1;
    perform pg_temp.ck('Comisión según el servicio (60% de 10.000)',x=6000,'fue '||x);
    update public.barberos set comision_pct=50 where id=b1;
    v:=registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,null,b1,null,d,'efectivo',null,true);
    select comision_monto into x from public.ingresos where id=v;
    perform pg_temp.ck('El % general del barbero tiene prioridad sobre el del servicio (50%)',x=5000,'fue '||x);
    insert into public.comisiones_barbero(barbero_id,servicio_id,pct) values(b1,s1,70);
    v:=registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,null,b1,null,d,'efectivo',null,true);
    select comision_monto into x from public.ingresos where id=v;
    perform pg_temp.ck('La excepción del barbero para ese servicio tiene prioridad sobre todo (70%)',x=7000,'fue '||x);
    delete from public.comisiones_barbero where barbero_id=b1;
    update public.barberos set comision_pct=null where id=b1;
    update public.servicios set comision_pct=10 where id=s1;
    select comision_monto into x from public.ingresos where id=i1;
    perform pg_temp.ck('Cambiar el % del servicio no modifica las ventas anteriores (valor histórico)',x=6000,'fue '||x);
    update public.servicios set comision_pct=60 where id=s1;
  exception when others then perform pg_temp.ck('Comisiones: error inesperado',false,sqlerrm);
  end;

  -- ===== VENTAS DE PRODUCTOS Y STOCK =====
  begin
    select stock,costo into k,y from public.productos where id=p1;
    op:=gen_random_uuid();
    i3:=registrar_ingreso(op,'producto','TEST Cera',null,p1,2,null,b2,null,d,'efectivo',null,true);
    select stock into n from public.productos where id=p1;
    perform pg_temp.ck('Vender un producto descuenta el stock',n=k-2,'stock '||n||' (debía ser '||(k-2)||')');
    select comision_monto,costo_unit into x,z from public.ingresos where id=i3;
    perform pg_temp.ck('Comisión por producto (10% de 6.000)',x=600,'fue '||x);
    perform pg_temp.ck('Se guarda el costo del producto al vender (costo de mercadería)',z=y,'guardó '||z||' y el costo era '||y);
    v:=registrar_ingreso(op,'producto','TEST Cera',null,p1,2,null,b2,null,d,'efectivo',null,true);
    select stock into n from public.productos where id=p1;
    perform pg_temp.ck('Repetir la misma operación (doble toque) no descuenta dos veces',v=i3 and n=k-2,'stock '||n);
    begin perform registrar_ingreso(gen_random_uuid(),'producto','TEST Cera',null,p1,999,null,b2,null,d,'efectivo',null,true);
      perform pg_temp.ck('No permite vender más que el stock',false,'permitió');
    exception when others then perform pg_temp.ck('No permite vender más que el stock',true); end;
    perform anular_ingreso(i3);
    select stock into n from public.productos where id=p1;
    perform pg_temp.ck('Anular una venta devuelve el stock',n=k,'stock '||n||' (debía ser '||k||')');
    perform registrar_compra(p1,3,500,null,d,'transferencia');
    select stock,costo into n,z from public.productos where id=p1;
    perform pg_temp.ck('Compra: suma stock y calcula el costo promedio',n=k+3 and z=round((k*y+3*500)/(k+3),2),'stock '||n||' costo '||z);
    perform registrar_perdida(p1,1,'TEST roto');
    perform ajustar_stock(p1,4,'TEST conteo');
    select stock into n from public.productos where id=p1;
    perform pg_temp.ck('Pérdida y ajuste por conteo dejan el stock correcto',n=4,'stock '||n);
  exception when others then perform pg_temp.ck('Stock: error inesperado',false,sqlerrm);
  end;

  -- ===== TURNOS =====
  begin
    insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,estado) values(d+time '10:00',30,b1,'TEST A',s1,'confirmado') returning id into t1;
    begin insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,estado) values(d+time '10:15',30,b1,'TEST B',s1,'confirmado');
      perform pg_temp.ck('Turnos: la base impide superponer horarios del mismo barbero',false,'permitió superponer');
    exception when exclusion_violation then perform pg_temp.ck('Turnos: la base impide superponer horarios del mismo barbero',true);
              when others then perform pg_temp.ck('Turnos: la base impide superponer horarios del mismo barbero',false,sqlerrm); end;
    begin insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,estado) values(d+time '10:30',30,b1,'TEST C',s1,'confirmado');
      insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,estado) values(d+time '10:00',30,b2,'TEST D',s1,'confirmado');
      perform pg_temp.ck('Turnos: permite uno contiguo y el mismo horario con otro barbero',true);
    exception when others then perform pg_temp.ck('Turnos: permite uno contiguo y el mismo horario con otro barbero',false,sqlerrm); end;
    insert into public.turno_items(turno_id,servicio_id) values(t1,s1),(t1,s2);
    n:=cobrar_turno(t1,'transferencia');
    select count(*),sum(comision_monto) into k,x from public.ingresos where turno_id=t1;
    perform pg_temp.ck('Cobrar un turno con 2 servicios genera 2 ingresos',n=2 and k=2,'generó '||k);
    perform pg_temp.ck('Comisiones de cada servicio del turno (6.000 + 1.500)',x=7500,'sumó '||x);
    begin perform cobrar_turno(t1); perform pg_temp.ck('No se puede cobrar un turno dos veces',false,'permitió');
    exception when others then perform pg_temp.ck('No se puede cobrar un turno dos veces',true); end;
    begin update public.turnos set estado='cancelado' where id=t1; perform pg_temp.ck('Un turno cobrado no se puede modificar',false,'permitió');
    exception when others then perform pg_temp.ck('Un turno cobrado no se puede modificar',true); end;
    insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,estado) values(d+time '11:00',30,b1,'TEST E',s1,'confirmado') returning id into t2;
    perform set_config('app.cobrando','',true); perform set_config('app.cobrando_ing','',true);  -- en la app real cada operación es su propia transacción
    begin update public.turnos set estado='atendido' where id=t2; perform pg_temp.ck('No se puede marcar "atendido" sin cobrar',false,'permitió');
    exception when others then perform pg_temp.ck('No se puede marcar "atendido" sin cobrar',true); end;
  exception when others then perform pg_temp.ck('Turnos: error inesperado',false,sqlerrm);
  end;

  -- ===== LIQUIDACIONES =====
  begin
    insert into public.adelantos(barbero_id,monto) values(b1,2000);
    select coalesce(sum(comision_monto),0) into y from public.ingresos where barbero_id=b1 and liquidacion_id is null and fecha<=d;
    lq:=liquidar_comisiones(b1,d,'efectivo');
    select bruto,adelantos,monto into x,z,cs from public.liquidaciones where id=lq;
    perform pg_temp.ck('Liquidación: incluye todas las comisiones pendientes',x=y,'incluyó '||x||' y había '||y);
    perform pg_temp.ck('Liquidación: descuenta el adelanto (no genera otra comisión)',z=2000 and cs=y-2000,'adelantos '||z||' · pagado '||cs);
    begin perform liquidar_comisiones(b1,d,'efectivo'); perform pg_temp.ck('No se pueden liquidar dos veces las mismas comisiones',false,'permitió');
    exception when others then perform pg_temp.ck('No se pueden liquidar dos veces las mismas comisiones',true); end;
    perform set_config('app.cobrando','',true); perform set_config('app.cobrando_ing','',true);  -- en la app real cada operación es su propia transacción
    begin update public.ingresos set concepto='X' where liquidacion_id=lq; perform pg_temp.ck('Un ingreso ya liquidado no se puede modificar',false,'permitió');
    exception when others then perform pg_temp.ck('Un ingreso ya liquidado no se puede modificar',true); end;
    begin perform anular_ingreso(i1); perform pg_temp.ck('Un ingreso ya liquidado no se puede anular',false,'permitió');
    exception when others then perform pg_temp.ck('Un ingreso ya liquidado no se puede anular',true); end;
  exception when others then perform pg_temp.ck('Liquidaciones: error inesperado',false,sqlerrm);
  end;

  -- ===== preparación de permisos =====
  begin
    perform set_config('request.jwt.claim.sub',u_o::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',u_o,'role','authenticated')::text,true);
    perform registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,null,b2,null,d,'efectivo',null,true);
    insert into public.dueno_mov(fecha,tipo,concepto,monto) values(d,'ing','TEST privado',1);
    insert into public.gastos(fecha,tipo,concepto,monto) values(d,'fijo','TEST alquiler',100);
    c_a:=cliente_upsert('TEST Cli A','3870000001'); c_b:=cliente_upsert('TEST Cli B','3870000002');
    insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,cliente_id,estado) values(d2+time '10:00',30,b1,'TEST Cli A',s1,c_a,'confirmado');
    insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,cliente_id,estado) values(d2+time '10:00',30,b2,'TEST Cli B',s1,c_b,'confirmado') returning id into t3;
    insert into public.turnos(inicio,duracion_min,barbero_id,cliente,servicio_id,estado) values(d2+time '12:00',30,null,'TEST libre',s1,'confirmado') returning id into t4;
  exception when others then raise exception 'No se pudo preparar las pruebas de permisos: %',sqlerrm;
  end;

  -- ===== PERMISOS: barbero 1 =====
  begin
    perform set_config('request.jwt.claim.sub',u_1::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',u_1,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select count(*) into a1 from public.ingresos where barbero_id=b2;
    select count(*) into a2 from public.ingresos where barbero_id=b1;
    select count(*) into a3 from public.gastos;
    select count(*) into a4 from public.dueno_mov;
    select count(*) into a5 from public.cajas;
    select count(*) into a6 from public.audit_logs;
    select count(*) into a7 from public.turnos where id=t3;
    execute 'reset role';
    perform pg_temp.ck('Permisos: el barbero NO ve los ingresos de otro barbero',a1=0,'vio '||a1);
    perform pg_temp.ck('Permisos: el barbero ve sus propios ingresos',a2>0,'vio '||a2);
    perform pg_temp.ck('Permisos: el barbero NO ve gastos',a3=0,'vio '||a3);
    perform pg_temp.ck('Permisos: el barbero NO ve el panel privado del dueño',a4=0,'vio '||a4);
    perform pg_temp.ck('Permisos: el barbero NO ve la caja ni la auditoría',a5=0 and a6=0,'cajas '||a5||' · auditoría '||a6);
    perform pg_temp.ck('Permisos: el barbero NO ve los turnos de otro barbero',a7=0,'vio '||a7);
  exception when others then execute 'reset role'; perform pg_temp.ck('Permisos (lectura): error inesperado',false,sqlerrm);
  end;

  begin
    perform set_config('request.jwt.claim.sub',u_1::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',u_1,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    begin insert into public.gastos(fecha,tipo,concepto,monto) values(d,'fijo','HACK',1); m:='permitió'; exception when others then m:='bloqueado'; end;
    begin update public.productos set stock=999 where id=p1; m2:='sin error'; exception when others then m2:='bloqueado'; end;
    begin perform liquidar_comisiones(b2,d,'efectivo'); m3:='permitió'; exception when others then m3:='bloqueado'; end;
    execute 'reset role';
    select stock into k from public.productos where id=p1;
    perform pg_temp.ck('Permisos: el barbero NO puede cargar gastos',m='bloqueado',m);
    perform pg_temp.ck('Permisos: el barbero NO puede cambiar el stock a mano',k<>999,'stock quedó en '||k);
    perform pg_temp.ck('Permisos: el barbero NO puede liquidar comisiones',m3='bloqueado',m3);
  exception when others then execute 'reset role'; perform pg_temp.ck('Permisos (escritura): error inesperado',false,sqlerrm);
  end;

  begin
    perform set_config('request.jwt.claim.sub',u_1::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',u_1,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    begin perform cobrar_turno(t3); m:='permitió'; exception when others then m:='bloqueado'; end;
    v:=registrar_ingreso(gen_random_uuid(),'servicio','TEST Corte',s1,null,1,null,b2,null,d,'efectivo',null,true);
    update public.turnos set barbero_id=b1 where id=t4; get diagnostics n=row_count;
    begin update public.turnos set barbero_id=b2 where id=t4; m2:='permitió'; exception when others then m2:='bloqueado'; end;
    select count(*) into a1 from public.clientes where id=c_b;
    select count(*) into a2 from public.clientes where id=c_a;
    begin update public.perfiles set rol='owner' where id=u_1; exception when others then null; end;
    execute 'reset role';
    select barbero_id into vb from public.ingresos where id=v;
    select rol into m3 from public.perfiles where id=u_1;
    perform pg_temp.ck('Permisos: el barbero NO puede cobrar el turno de otro',m='bloqueado',m);
    perform pg_temp.ck('Permisos: al cargar un ingreso se asigna SIEMPRE al barbero que inició sesión',vb=b1,'quedó a nombre de otro');
    perform pg_temp.ck('Permisos: el barbero puede asignarse un turno libre',n=1,'filas '||n);
    perform pg_temp.ck('Permisos: el barbero NO puede pasarle el turno a otro',m2='bloqueado',m2);
    perform pg_temp.ck('Permisos: el barbero ve solo sus clientes',a1=0 and a2=1,'cliente ajeno '||a1||' · propio '||a2);
    perform pg_temp.ck('Seguridad: un barbero NO puede hacerse dueño',m3='barber','rol quedó '||m3);
  exception when others then execute 'reset role'; perform pg_temp.ck('Permisos (acciones): error inesperado',false,sqlerrm);
  end;

  -- ===== PÚBLICO (sin iniciar sesión) =====
  begin
    select exists(select 1 from public.horarios where dia=extract(dow from d)::int and desde<=time '11:00' and hasta>=time '11:30') into hz;
    execute 'set local role anon';
    begin perform count(*) from public.ingresos; m:='permitió'; exception when others then m:='bloqueado'; end;
    begin perform cliente_upsert('X','1'); m2:='permitió'; exception when others then m2:='bloqueado'; end;
    select jsonb_array_length(public_info()->'barberos') into a1;
    begin perform reservar_publico('X','1',d+time '11:00',b2,array[s1]); m3:='permitió'; exception when others then m3:=sqlerrm; end;
    v:=null;
    if hz then
      v:=reservar_publico('TEST Cliente','3871111111',d+time '11:00',b2,array[s1]);
      begin perform reservar_publico('TEST Otro','3872222222',d+time '11:00',b2,array[s1]); z:=1; exception when others then z:=0; end;
    end if;
    execute 'reset role';
    perform pg_temp.ck('Público: sin iniciar sesión NO se pueden leer los ingresos',m='bloqueado',m);
    perform pg_temp.ck('Público: sin iniciar sesión NO se pueden usar las funciones internas',m2='bloqueado',m2);
    perform pg_temp.ck('Público: la info de reservas (barberos, servicios, horarios) está disponible',a1>=2,'barberos '||a1);
    perform pg_temp.ck('Público: la reserva rechaza datos inválidos',m3 like 'Complet%',m3);
    if hz then
      select estado into m from public.turnos where id=v;
      perform pg_temp.ck('Público: una reserva válida queda PENDIENTE',m='pendiente',coalesce(m,'no se creó'));
      perform pg_temp.ck('Público: no se puede reservar un horario ya ocupado',z=0,'permitió reservar dos veces');
    else
      perform pg_temp.ck('Público: reserva válida omitida (no hay horario de atención cargado para ese día)',true);
    end if;
  exception when others then execute 'reset role'; perform pg_temp.ck('Público: error inesperado',false,sqlerrm);
  end;

  -- ===== resumen (el error final deshace TODO lo de arriba) =====
  select string_agg((case when t.ok then '✔ ' else '✖ ' end)||t.nombre||(case when t.ok or t.detalle='' then '' else '  →  '||t.detalle end),E'\n' order by t.n),
         count(*) filter (where t.ok), count(*) filter (where not t.ok) into rr,okn,kon from pg_temp._t t;
  raise exception E'RESULTADO DE LAS PRUEBAS (todo se deshace al terminar: no queda nada guardado)\n\n%\n\nCorrectas: % · Con problemas: %',rr,okn,kon;
end $t$;
