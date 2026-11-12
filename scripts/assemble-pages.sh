#!/usr/bin/env bash
# Arma la carpeta que se publica en GitHub Pages:
#   /            → versión estable (index.html vanilla y sus archivos), SIN CAMBIOS
#   /next/       → nueva versión (React) en vista previa
# La versión estable sigue siendo la que usa la barbería hasta que se apruebe el cambio.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"
LEGACY_FILES=(index.html manifest.json sw.js logo.png icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png)

test -f "$ROOT/web/dist/index.html" || { echo "Falta web/dist: corré el build primero"; exit 1; }
rm -rf "$OUT" && mkdir -p "$OUT/next"
for f in "${LEGACY_FILES[@]}"; do
  test -f "$ROOT/$f" || { echo "Falta archivo de la versión estable: $f"; exit 1; }
  cp "$ROOT/$f" "$OUT/$f"
done
cp -R "$ROOT/web/dist/." "$OUT/next/"

# Integridad: la versión estable publicada es byte a byte igual a la del repositorio.
for f in "${LEGACY_FILES[@]}"; do cmp -s "$ROOT/$f" "$OUT/$f" || { echo "La versión estable cambió al copiar: $f"; exit 1; }; done
# La nueva versión usa rutas relativas (funciona bajo /Barber-hood/next/).
grep -q 'src="./assets/' "$OUT/next/index.html" || { echo "Rutas de assets no relativas en next/index.html"; exit 1; }
if grep -qE '(src|href)="/' "$OUT/next/index.html"; then echo "Hay rutas absolutas en next/index.html (rompen en /Barber-hood/)"; exit 1; fi
node "$ROOT/scripts/check-secrets.mjs" "$OUT"
echo "Sitio armado en $OUT"; (cd "$OUT" && find . -maxdepth 2 -type f | sort | head -30)
