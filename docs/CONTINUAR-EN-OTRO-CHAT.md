# Rediseño premium de Barber Hood — estado para continuar en otro chat

Actualizado: 2026-11-13. Rama principal: `main` (PR #1 y PR #5 fusionados). CI en verde. **Corte final hecho**: la nueva está en la raíz del sitio y la estable en `/legacy/`.

## Mensaje para pegar al empezar el chat nuevo

> Seguimos con el rediseño de Barber Hood (repo lautyram9-cloud/Barber-hood). Leé primero
> `docs/CONTINUAR-EN-OTRO-CHAT.md`, `docs/AUDITORIA-Y-PLAN.md` y `docs/PUBLICACION.md`.
> La migración a React + TypeScript + Tailwind está completa en `web/` y probada con paridad.
> Siguiente paso: [escribir acá lo que quieras hacer].

## Qué hay hoy

| Ruta | Qué es | Estado |
|---|---|---|
| `index.html`, `sw.js`, `manifest.json`, íconos (raíz) | Versión **estable** (JS sin framework), la que usa la barbería | Sin cambios en el repo; publicada en `/legacy/` desde el corte (copia byte a byte) |
| `web/` | Versión **nueva** (Vite 8, React 19, TypeScript 5.9, Tailwind 4, supabase-js 2.119, TanStack Query) | **Todas las secciones migradas** |
| `.github/workflows/ci-pages.yml` | CI/CD: tipos, pruebas, build, e2e, armado del sitio, publicación | Funcionando |
| `scripts/assemble-pages.sh` | Arma el sitio: modo `corte` (nueva en `/`, estable en `/legacy/`, el activo) o `vista` (estable en `/`, nueva en `/next/`) | Funcionando |
| Tag/rama `backup/legacy-2026-11-12` | Respaldo de la versión estable antes del rediseño | En GitHub (como rama) |

Secciones migradas (mismo orden y visibilidad por rol que la estable): Inicio, Turnos, Clientes, Caja,
Movimientos, Stock, Estadísticas, Barberos, Mi perfil (barbero), Comisiones, Dueño, Ajustes, botón +,
y reserva pública `#reservar`.

## Cómo está garantizado que no se perdió nada

- **Paridad automática** (`web/tests/parity/`): se ejecuta el JavaScript ORIGINAL de `index.html` en Node con
  datos de prueba y se exige el mismo resultado que la versión nueva: modelo de datos, finanzas, comisiones,
  horarios libres, HTML de cada pantalla, CSV y respaldo byte a byte, y **todo lo que se envía a la base**
  (cada botón original se ejecuta con un "grabador" y se compara con la acción nueva). 439 pruebas.
  Se verificó en cada módulo con errores introducidos a propósito.
- **E2E** (`web/tests/e2e/`): 89 pruebas en iPhone, iPad y escritorio (Chromium emulado) con Supabase simulado
  dentro del navegador; nada sale a internet. Incluye prueba de que ninguna sección se desborda en el celular.
- **Conexión**: misma URL y clave *publishable* que la estable (test lo verifica); el build falla si aparece una
  clave secreta. La sesión se comparte entre ambas versiones (mismo origen).
- **Base de datos**: sin ningún cambio. Toda la seguridad sigue en RLS y funciones.

## Cambios de comportamiento intencionales (mejoras, todas avisadas)

- Confirmación antes de acciones que no se deshacen: cancelar/rechazar/ausente un turno, anular ingreso, borrar
  gasto o movimiento, liquidar, cerrar caja, quitar producto/proveedor/barbero/servicio, registrar falta.
- Caja: horas y fechas en hora local (la estable mostraba UTC).
- Comisiones: al liquidar con período "Mes" de un mes de 30 días o febrero, la estable mandaba una fecha
  inexistente (ej. 2026-09-31); ahora se envía el último día real del mes.
- Accesibilidad: etiquetas visibles en formularios, Escape cierra paneles.
- **Diseño más simple**: fuente Plus Jakarta Sans; en cada pantalla el número clave va grande (`Destacado`) y lo
  secundario va plegado (`Plegable`: fila con resumen que abre una ventana con todo). Componentes en
  `web/src/components/ui/simple.tsx`. No se quitó ninguna función; las pruebas abren los bloques con `tests/e2e/ui.ts`.
- Barberos: también tienen **Ajustes** (su cuenta, cerrar sesión y activar avisos de sus reservas) y un saludo
  "¡Bienvenido, (nombre)!" con su foto al entrar a Turnos. La prueba de navegación lo refleja como cambio intencional.
- Datos en vivo: se recarga solo la tabla que cambió y se escuchan todas las tablas (la estable no escuchaba 6).

## Hecho recientemente

- Publicación por Actions activada (`PAGES_DEPLOY=true`) y vista previa `/next/` probada por el dueño.
- Transición de desenfoque al cambiar de sección (respeta "reducir movimiento").
- **Corte final**: variable `CORTE_FINAL=true`; PWA nueva (service worker `bhm-v2`) en la raíz, estable en `/legacy/`.
  Probado por el dueño. **Volver atrás**: borrar la variable `CORTE_FINAL` y correr el workflow (ver `docs/PUBLICACION.md`).
- SQL de etapas 3–9 subidos a `supabase/`.
- `pruebas-supabase.sql`: **50/50** con la caja cerrada y con los permisos de la etapa 11 ya aplicados.
- Restaurar copia de seguridad (Ajustes): recupera lo que falta, nunca pisa ni borra (`etapa10-restaurar-respaldo.sql`, ejecutado).
- Movimientos: medio de pago en cada fila y ventana de detalle (quién lo cargó, día y hora, medio, etc.).
- Desenfoque al cambiar de sección y al desplegar el botón + y el menú Más.
- **Costos ocultos al barbero** (etapa 11, ejecutada y publicada): `etapa11a-costos-dueno.sql` + `etapa11b-ocultar-costos.sql`.
  El dueño recibe los costos por `costos_dueno()`. Volver atrás: `grant select on public.productos, public.ingresos to authenticated;`.
  Límite conocido: Realtime no respeta permisos por columna (cerrarlo exige mover los costos a una tabla aparte).
  Si se agrega una columna a `productos` o `ingresos`, volver a ejecutar `etapa11b` para habilitarla.

## Lo que falta (en este orden)

**Pedido del dueño en 5 partes (en curso):**
1. HECHO (PR parte 1): pestaña **Sueldos** (= Comisiones + Barberos; `#/bar` y `#/com` redirigen), editar nombre/minutos/usuario
   del barbero y editar servicios, cuadros con dinero resaltados (`Kpi` con `data-dinero`), + ordenado por demanda (90 días).
2. HECHO (PR parte 2): balance en Stock (`balanceStock`): vendido, costo de lo vendido, ganancia, comisiones, ganancia neta y compras del período.
3. HECHO (PR parte 3): los cortes del dueño (barbero vinculado a su usuario) se suman solos a sus ingresos privados en Dueño (`cortesDelDueno`, calculado, no se guarda nada).
4. PREPARADO (PR parte 4): aviso push sábados 22:00 AR "¡Es momento de liquidar la semana!". Desplegar la función notificar-turno actualizada (acción "liquidar") y ejecutar `supabase/etapa14-aviso-liquidar.sql` (pg_cron, `push_recordatorios`, tarea `bh-liquidar-semana` a las 01:00 UTC del domingo). Volver atrás: `select cron.unschedule('bh-liquidar-semana');`.
5. Pago dividido en el + (efectivo + transferencia/tarjeta). SQL a mostrar (la caja suma efectivo por medio_pago).

- **Fotos de barberos y reserva rediseñada** (etapa 13, sin ejecutar): ejecutar `supabase/etapa13-fotos-barberos.sql`
  (columna `barberos.foto`, espacio de archivos público "barberos" donde solo el dueño sube, y `public_info` con la foto).
  Las fotos se cargan en Ajustes → Barberos (tocar el círculo). Sin foto se ven las iniciales.
0. **Avisos push de reservas** (etapa 12, preparada, sin activar). Orden:
   (1) desplegar la función `supabase/functions/notificar-turno` (`index.ts` + `avisos.ts`) con "Verify JWT"
   DESACTIVADO; (2) ejecutar `supabase/etapa12-avisos-push.sql`; (3) publicar la app; (4) en cada dispositivo:
   Ajustes → Avisos de reservas → Activar (en iPhone, con la app instalada en la pantalla de inicio).
   Avisa al dueño y al barbero asignado; no incluye el teléfono; máx. 20 avisos por hora; un aviso por turno.
   Las claves VAPID se generan solas y viven en `push_config` (solo el servidor la lee).
   Volver atrás: `drop trigger if exists t_avisar_turno on public.turnos;`.
1. **Protección de contraseñas filtradas** (Supabase Auth): no disponible en el plan actual (requiere Pro).
   Mitigación: largo mínimo de contraseña de 10+, exigir tipos de caracteres, claves únicas, desactivar el
   registro público si no se usa (verificar que no rompa `#reservar`).
2. Dueño que también es barbero: hoy un usuario dueño se trata siempre como dueño aunque esté vinculado a un
   barbero (sin "Mi perfil" ni "Asignarme"). Se puede agregar si se quiere.
3. Lectura por rango de fechas (hoy se lee todo el historial y se enlentece con el tiempo; umbral sugerido:
   ~5.000 ingresos).

## Reglas de trabajo del dueño (respetar siempre)

- No eliminar funcionalidades sin justificar. No tocar datos reales. Supabase solo en modo lectura salvo
  autorización; cualquier cambio de base = script SQL aditivo y re-ejecutable, mostrado antes.
- Solo clave *publishable* en el frontend. Nada de integraciones pagas sin consultar.
- No afirmar que algo funciona si no se probó; decir qué no se verificó.
- Trabajar por etapas, con mensajes cortos y sin pasos innecesarios.

## Comandos

```bash
cd web
npm ci
npm run dev          # desarrollo local
npm run check        # tipos + pruebas unitarias/paridad + build
npm run e2e          # pruebas en navegador (Supabase simulado)
bash ../scripts/assemble-pages.sh   # arma el sitio como se publica
```

Estructura de `web/src`: `domain/` (lógica pura portada 1:1, un archivo por módulo), `features/` (pantallas),
`components/` (sistema de diseño: `ui/`, `layout/AppShell`, `PeriodBar`), `state/` (sesión, datos en vivo,
período, avisos y confirmaciones), `lib/` (cliente Supabase, tipos, archivos).
