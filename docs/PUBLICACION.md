# Publicación en GitHub Pages con GitHub Actions

Hoy GitHub Pages publica la rama `main` tal cual ("Deploy from a branch"). El workflow
`ci-pages.yml` está preparado para reemplazar eso **sin cortar el servicio**:

- En cada push a `redesign-premium` y en cada PR a `main`: corre todas las verificaciones (no publica).
- En `main`: además arma el sitio y **publica solo si** todo pasó **y** la variable `PAGES_DEPLOY` vale `true`.
- El sitio publicado tiene la versión estable en la raíz (byte a byte igual al repo) y la nueva en `/next/`.

## Pasos para activarlo (en este orden)

1. Revisar y aprobar el PR `redesign-premium` → `main` con el CI en verde, y fusionarlo.
   Pages sigue publicando desde la rama como hoy: la app estable no cambia.
2. GitHub → Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. GitHub → Settings → Secrets and variables → Actions → pestaña *Variables* → New variable:
   `PAGES_DEPLOY` = `true`.
4. Actions → "CI y publicación (GitHub Pages)" → Run workflow sobre `main`.
5. Verificar:
   - https://lautyram9-cloud.github.io/Barber-hood/ → app estable (igual que antes).
   - https://lautyram9-cloud.github.io/Barber-hood/#reservar → reserva pública.
   - https://lautyram9-cloud.github.io/Barber-hood/next/ → vista previa nueva (login con la misma cuenta).

**Volver atrás:** Settings → Pages → Source: *Deploy from a branch* (`main`, `/root`). El sitio vuelve a
publicarse como hoy. No hay que tocar código ni datos.

## Variables de entorno

No hacen falta secretos en Actions: la clave de Supabase del frontend es la *publishable* (pública por diseño)
y la seguridad está en RLS. Si alguna vez se cambia de proyecto, definir como *Variables* (no secretos):
`VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, y pasarlas al paso "Compilar".

## Corte final (la nueva pasa a la raíz)

El workflow arma el sitio en uno de dos diseños, según la variable del repositorio `CORTE_FINAL`:

| `CORTE_FINAL` | `/Barber-hood/` | Otra ruta |
|---|---|---|
| vacía / distinta de `true` | versión estable (como hoy) | nueva en `/next/` (vista previa, sin service worker) |
| `true` | **versión nueva (PWA)** | estable en `/legacy/`, byte a byte igual al repo |

### Para hacer el corte
1. Fusionar a `main` el PR con estos cambios (no cambia nada publicado mientras `CORTE_FINAL` no exista).
2. Settings → Secrets and variables → Actions → *Variables* → New: `CORTE_FINAL` = `true`.
3. Actions → "CI y publicación (GitHub Pages)" → Run workflow sobre `main`. El log dice `Modo de publicación: corte`.
4. Verificar:
   - `/Barber-hood/` → app nueva; `/Barber-hood/#reservar` → reserva pública.
   - `/Barber-hood/legacy/` → app estable (misma cuenta, misma sesión).
   - En el iPhone: abrir la URL, esperar unos segundos y reabrir la app instalada: toma la versión nueva sola
     (el service worker nuevo reemplaza al anterior, caché `bhm-v2`). Si queda la vieja, cerrarla del todo y reabrir.
   - Probar un ingreso de prueba y anularlo; probar sin conexión (debe mostrar el aviso rojo).

### Volver atrás (sin tocar código ni datos)
Borrar la variable `CORTE_FINAL` (o ponerla en `false`) y volver a correr el workflow: `/` vuelve a la estable.
Los dispositivos que ya hayan instalado el worker nuevo lo reemplazan por el de la estable al volver a abrir la app.

### Qué cambia en el corte
- Service worker nuevo (`web/public/sw.js`): red primero, nunca guarda datos de Supabase, no toca `/legacy/`.
  La estable conserva su worker y su caché `bh-v1` dentro de `/legacy/`.
- Manifiesto nuevo (`web/public/manifest.json`), mismos íconos y nombre, colores del tema oscuro.
- El enlace "Abrir versión estable" apunta a `./legacy/` (en la vista previa sigue apuntando a `../`).
- Las pruebas e2e corren sobre el diseño del corte (nueva en la raíz, estable en `/legacy/`); el CI además arma y
  verifica los dos diseños.
