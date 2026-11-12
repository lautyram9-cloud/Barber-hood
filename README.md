# Barber Hood Manager

App privada de gestión de la barbería Barber Hood (Orán, Salta). Supabase (Auth + Postgres con RLS) y GitHub Pages.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `sw.js`, `manifest.json`, íconos | **Versión estable** (JavaScript sin framework). Es la que usa la barbería hoy. No se modifica durante el rediseño. |
| `web/` | **Versión nueva** (Vite + React + TypeScript + Tailwind). En vista previa en `/next/`. |
| `scripts/assemble-pages.sh` | Arma el sitio: estable en la raíz + nueva en `/next/`, y verifica integridad y claves. |
| `.github/workflows/ci-pages.yml` | CI/CD: verifica todo y publica en Pages solo desde `main` y solo si todo pasa. |
| `docs/` | Auditoría, plan por etapas y guía de publicación. |
| `supabase/` | Lugar para versionar los scripts SQL (ver `supabase/README.md`). |

## Desarrollo de la versión nueva

```bash
cd web
npm ci
npm run dev        # servidor local
npm run check      # tipos + pruebas (unitarias y de paridad) + build
npm run e2e        # pruebas en navegador con Supabase simulado (no toca datos reales)
```

La versión nueva usa **la misma conexión** que la estable (misma URL y clave *publishable*; un test lo verifica).
Opcionalmente se puede sobreescribir con `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (ver `web/.env.example`). Nunca va una clave secreta en el frontend: el build falla si aparece una.

## Respaldo

Tag `backup/legacy-2026-11-12` = versión estable exacta antes del rediseño.
