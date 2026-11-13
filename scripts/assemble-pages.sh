#!/usr/bin/env bash
# Arma la carpeta que se publica en GitHub Pages. Uso: assemble-pages.sh [carpeta] [vista|corte]
#   vista (por defecto) → /  versión estable SIN CAMBIOS   ·  /next/  nueva versión (vista previa)
#   corte               → /  nueva versión (PWA)           ·  /legacy/  versión estable SIN CAMBIOS
# La estable se copia siempre byte a byte desde la raíz del repositorio.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"
MODE="${2:-vista}"
LEGACY_FILES=(index.html manifest.json sw.js logo.png icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png)

case "$MODE" in vista|corte) ;; *) echo "Modo inválido: $MODE (vista|corte)"; exit 1;; esac
test -f "$ROOT/web/dist/index.html" || { echo "Falta web/dist: corré el build primero"; exit 1; }
for f in "${LEGACY_FILES[@]}"; do test -f "$ROOT/$f" || { echo "Falta archivo de la versión estable: $f"; exit 1; }; done

rm -rf "$OUT"
if [ "$MODE" = "vista" ]; then
  LEGACY_DIR="$OUT"; NEW_DIR="$OUT/next"
else
  LEGACY_DIR="$OUT/legacy"; NEW_DIR="$OUT"
fi
mkdir -p "$LEGACY_DIR" "$NEW_DIR"
cp -R "$ROOT/web/dist/." "$NEW_DIR/"
for f in "${LEGACY_FILES[@]}"; do cp "$ROOT/$f" "$LEGACY_DIR/$f"; done

# Integridad: la versión estable publicada es byte a byte igual a la del repositorio.
for f in "${LEGACY_FILES[@]}"; do cmp -s "$ROOT/$f" "$LEGACY_DIR/$f" || { echo "La versión estable cambió al copiar: $f"; exit 1; }; done
# La nueva versión usa rutas relativas (funciona bajo /Barber-hood/ y /Barber-hood/next/).
grep -q 'src="./assets/' "$NEW_DIR/index.html" || { echo "Rutas de assets no relativas en index.html nuevo"; exit 1; }
if grep -qE '(src|href)="/' "$NEW_DIR/index.html"; then echo "Hay rutas absolutas en el index.html nuevo (rompen en /Barber-hood/)"; exit 1; fi
if [ "$MODE" = "corte" ]; then
  # PWA nueva: service worker con caché nueva, manifiesto y la versión estable en /legacy/.
  grep -q "const V = 'bhm-v2'" "$NEW_DIR/sw.js" || { echo "sw.js nuevo inválido"; exit 1; }
  grep -q '"start_url":"./"' "$NEW_DIR/manifest.json" || { echo "manifest nuevo inválido"; exit 1; }
  for f in index.html sw.js manifest.json logo.png icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png; do test -f "$NEW_DIR/$f" || { echo "Falta en la nueva: $f"; exit 1; }; done
  cmp -s "$ROOT/index.html" "$NEW_DIR/index.html" && { echo "La raíz sigue siendo la estable"; exit 1; }
fi
node "$ROOT/scripts/check-secrets.mjs" "$OUT"
echo "Sitio ($MODE) armado en $OUT"; (cd "$OUT" && find . -maxdepth 2 -type f | sort | head -30)
