// Descarga o comparte un archivo (equivale a fileOut de la versión estable):
// en iPhone abre el menú Compartir; si no se puede, lo descarga.
export async function guardarArchivo(nombre: string, mime: string, texto: string, bom: boolean) {
  const f = new File([(bom ? '﻿' : '') + texto], nombre, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: nombre }); return; } catch (e) { if ((e as Error)?.name == 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f); a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
