# Auditoría técnica y plan del rediseño premium

Fecha: 2026-11-12 · Rama: `redesign-premium` · Respaldo: tag `backup/legacy-2026-11-12`

## 1. Estado actual (versión estable)

- Un solo `index.html` (86 KB): CSS propio + JavaScript sin framework. Sin build, sin tipos, sin tests en el repo.
- Única dependencia: `@supabase/supabase-js@2.45.4` por CDN (jsDelivr).
- PWA: `manifest.json` + `sw.js` (nunca cachea `supabase.co`).
- Publicación: GitHub Pages desde la rama `main` (archivos subidos a mano).
- Supabase: 23 tablas, todas con RLS. 17 RPC para operaciones atómicas. Auth email/clave.

## 2. Auditoría de compatibilidad para la migración

| Tema | Hallazgo | Decisión |
|---|---|---|
| Node | 22 LTS disponible | Node 22 en local y CI |
| React | 19.3 estable | React 19.3.1 |
| TypeScript | 7.0 es la reescritura nativa (muy nueva); 5.9 es la línea madura | **5.9.3** por estabilidad |
| Build | Vite 8.3 (compatible con Vitest 5 y plugin React 6) | Vite 8.3.8 |
| Estilos | Tailwind 4.3 con plugin oficial de Vite | Tailwind 4.3.5 |
| Supabase | supabase-js 2.119 es compatible con el formato de clave `sb_publishable_` y con las mismas RPC | 2.119.0 |
| Sesión | supabase-js guarda la sesión en `localStorage` con clave derivada de la URL del proyecto | Mismo origen (`github.io`) y misma URL ⇒ **la sesión se comparte** entre versión estable y nueva |
| Rutas | Pages sirve bajo `/Barber-hood/`; no hay reescrituras de servidor | `base: './'` + enrutado por hash (`#/inicio`); `#reservar` se mantiene |
| Service worker | El SW estable tiene alcance `/Barber-hood/` (incluye `/next/`) | La nueva **no registra SW** durante la vista previa para no competir; la PWA nueva llega en el corte final |
| Base de datos | Tipos generados del esquema real (solo lectura) | **Sin cambios en la base** |

Todas las versiones quedan fijadas exactas en `web/package-lock.json`.

## 3. Cómo se garantiza que no se pierde nada

1. **Paridad automática**: `web/tests/parity` ejecuta el JavaScript ORIGINAL de `index.html` en Node con datos de
   prueba y exige resultados idénticos a la versión nueva: modelo de datos (18 tablas), resultado económico,
   comisiones, estadísticas por barbero, períodos, horarios libres para turnos, WhatsApp, CSV y formato de pesos.
   6 semillas de datos × 5 momentos (antes de abrir, tarde, noche, domingo, fin de mes) × 2 roles.
   Se verificó con errores introducidos a propósito que el test los detecta.
2. **Navegación por rol** idéntica (test que lee la lista de pestañas de `index.html`).
3. **Conexión**: test que exige la misma URL y clave que `index.html`; el build falla si aparece una clave secreta.
4. **E2E** en iPhone, iPad y escritorio (Chromium emulado) con Supabase simulado: login, Inicio con los mismos
   números, barbero sin acceso a tablas del dueño, usuario sin barbero, `#reservar`, y versión estable intacta.
5. **Convivencia**: la versión estable se publica byte a byte igual en la raíz; la nueva vive en `/next/`.
   Los módulos no migrados abren la versión estable.

Corrección respecto del primer diagnóstico: "Movimientos" lo ve solo el dueño (en la versión estable la pestaña
se oculta a los barberos). El barbero ve: Turnos, Clientes y Mi perfil, y registra ingresos con el botón +.

## 4. Plan por etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 0 | Respaldo (tag + zip), README, carpeta `supabase/` | Hecho (falta subir los SQL) |
| 1 | Base técnica: proyecto, conexión, sesión y roles, datos en vivo por tabla, lógica portada con paridad, CI/CD | Hecho |
| 2 | Sistema de diseño oscuro: tokens, componentes, menú lateral / barra inferior, Inicio | Hecho (base) |
| 3a | Estadísticas (incl. exportación CSV), Barberos y Mi perfil (incl. marcar asistencia y registrar falta) | Hecho |
| 3b | Turnos (agenda día/semana/mes, solicitudes, nuevo turno, confirmar/cobrar/ausente/cancelar, reprogramar, notas, WhatsApp, vista del barbero y "Asignarme") | Hecho |
| 3c | Clientes (búsqueda, filtros, ficha con historial y próximos turnos, reactivar por WhatsApp, preferencias/observaciones) | Hecho |
| 3d | Botón + (ingresos y gastos rápidos) y Movimientos (indicadores, pendientes de cobro, registrar, cambiar fecha, anular) | Hecho |
| 3e | Caja (abrir, esperado, movimientos manuales, arqueo y cierre con confirmación, historial; horas en hora local) | Hecho |
| 3f | Comisiones (por período, liquidar con confirmación, adelantos, historial, comprobante para compartir) | Hecho |
| 3g | Stock → Dueño y Ajustes → `#reservar` | Pendiente |
| 4 | Paridad completa por rol + pruebas manuales en iPhone/iPad reales con usuario de prueba | Pendiente |
| 5 | Corte: la nueva pasa a la raíz, la estable a `/legacy/`, PWA nueva con versión de caché nueva | Pendiente (requiere aprobación) |
| 6 | Mejoras: lectura por rango de fechas, restaurar respaldos, ocultar costos al barbero (SQL aditivo, se muestra antes) | Pendiente |

## 5. Problemas detectados en la versión estable (para no repetirlos)

- Mensaje "Iniciá sesión en Claude para usar la app" si falla la carga (texto heredado).
- Borrados/anulaciones sin confirmación.
- Recarga completa de todas las tablas ante cada cambio (en la nueva: solo la tabla afectada).
- Realtime no escuchaba clientes, turno_items, cajas, caja_mov, comisiones_barbero ni proveedores (en la nueva: sí).
- Accesibilidad mínima (sin etiquetas en formularios, sin Escape en paneles).
- Pendientes de seguridad (Supabase): activar protección de contraseñas filtradas.
