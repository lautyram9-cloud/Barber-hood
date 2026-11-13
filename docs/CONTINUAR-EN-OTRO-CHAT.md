# Rediseño premium de Barber Hood — estado para continuar en otro chat

Actualizado: 2026-11-13. Rama principal: `main` (PR #1 de `redesign-premium` fusionado). CI en verde.

## Mensaje para pegar al empezar el chat nuevo

> Seguimos con el rediseño de Barber Hood (repo lautyram9-cloud/Barber-hood). Leé primero
> `docs/CONTINUAR-EN-OTRO-CHAT.md`, `docs/AUDITORIA-Y-PLAN.md` y `docs/PUBLICACION.md`.
> La migración a React + TypeScript + Tailwind está completa en `web/` y probada con paridad.
> Siguiente paso: [escribir acá lo que quieras hacer].

## Qué hay hoy

| Ruta | Qué es | Estado |
|---|---|---|
| `index.html`, `sw.js`, `manifest.json`, íconos (raíz) | Versión **estable** (JS sin framework), la que usa la barbería | Intacta, sin cambios |
| `web/` | Versión **nueva** (Vite 8, React 19, TypeScript 5.9, Tailwind 4, supabase-js 2.119, TanStack Query) | **Todas las secciones migradas** |
| `.github/workflows/ci-pages.yml` | CI/CD: tipos, pruebas, build, e2e, armado del sitio, publicación | Funcionando |
| `scripts/assemble-pages.sh` | Sitio publicado: estable en `/`, nueva en `/next/` | Funcionando |
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
- Datos en vivo: se recarga solo la tabla que cambió y se escuchan todas las tablas (la estable no escuchaba 6).

## Lo que falta (en este orden)

1. **Activar la publicación por Actions** (pasos en `docs/PUBLICACION.md`): Settings → Pages → Source: GitHub
   Actions; variable `PAGES_DEPLOY=true`; correr el workflow en `main`. Resultado: estable en
   `https://lautyram9-cloud.github.io/Barber-hood/` (igual que hoy) y nueva en `…/Barber-hood/next/`.
2. **Probar `/next/` con usuarios reales** en iPhone y computadora (dueño y al menos un barbero), con datos de
   prueba que después se anulen. NO se pudo probar desde el entorno de desarrollo: Supabase real, Safari real,
   instalación como app (PWA) y modo sin conexión.
3. **Corte final** (solo con aprobación): la nueva pasa a la raíz, la estable a `/legacy/`, PWA nueva con
   service worker y versión de caché nueva. Hasta entonces la nueva NO registra service worker.
4. Pendientes previos del proyecto: subir los SQL de etapas 3–9 a `supabase/`; confirmar 50/50 en
   `pruebas-supabase.sql`; activar protección de contraseñas filtradas en Supabase Auth.
5. Mejoras posibles después del corte: lectura por rango de fechas (hoy se lee todo el historial), restaurar
   respaldos, ocultar costos de productos al barbero (requiere SQL aditivo, mostrarlo antes de ejecutar).

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
