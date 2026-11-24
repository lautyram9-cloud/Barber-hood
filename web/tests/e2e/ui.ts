import type { Page } from '@playwright/test';

/** Toca un bloque plegado (por su título) y devuelve la ventana que se abre con el contenido completo. */
export async function abrir(page: Page, titulo: string) {
  await page.getByRole('button', { name: titulo, exact: true }).click();
  const d = page.getByRole('dialog', { name: titulo });
  await d.waitFor();
  return d;
}
/** Cierra la ventana abierta (Escape). */
export async function cerrar(page: Page) {
  await page.keyboard.press('Escape');
}
