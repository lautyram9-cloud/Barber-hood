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
