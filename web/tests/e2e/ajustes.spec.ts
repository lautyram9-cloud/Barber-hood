import { expect, test, type Page } from '@playwright/test';
import { fixtures } from '../fixtures';
import { mockSupabase, type Permitidas } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), DATA = fixtures(42, NOW_ISO);
const OWNER = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' as const };

async function entrar(page: Page, ruta: string, permitidas: Permitidas) {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, DATA, OWNER, NOW, permitidas);
  await page.goto('');
  await page.getByLabel('Email').fill(OWNER.email); await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/' + ruta);
  await page.locator('main h1').first().waitFor();
  return log;
}

test('Ajustes: horarios (con validación), barbero con usuario y servicio', async ({ page }) => {
  const log = await entrar(page, 'aj', { 'rpc guardar_horarios': null, 'POST barberos': { id: 'bar-nuevo' }, 'rpc vincular_barbero': null, 'POST servicios': '' });
  await page.getByLabel('Horario del Mar').fill('cualquier cosa');
  await page.locator('label', { hasText: 'Mar' }).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Guardar horarios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Revisá el horario de Mar' })).toBeVisible();
  expect(log.bodies).toEqual([]);
  await page.getByLabel('Horario del Mar').fill('9:00-13:00, 16:00-21:00');
  await page.getByRole('button', { name: 'Guardar horarios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Horarios guardados' })).toBeVisible();
  const p = (log.bodies[0].body as { p: { dia: number; desde: string; hasta: string }[] }).p;
  expect(p.filter((x) => x.dia == 2)).toEqual([{ dia: 2, desde: '09:00', hasta: '13:00' }, { dia: 2, desde: '16:00', hasta: '21:00' }]);
  await page.getByLabel('Nombre del barbero').fill('Tomi');
  await page.getByLabel('Minutos por turno').fill('40');
  await page.getByLabel('Email de su usuario (opcional)').fill('tomi@prueba.test');
  await page.getByRole('button', { name: 'Agregar barbero' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Barbero agregado' })).toBeVisible();
  expect(log.bodies.slice(1, 3)).toEqual([
    { op: 'POST barberos', body: { nombre: 'Tomi', slot_min: 40 }, query: '?select=id' },
    { op: 'rpc vincular_barbero', body: { p_barbero: 'bar-nuevo', p_email: 'tomi@prueba.test' } },
  ]);
  await page.getByLabel('Servicio', { exact: true }).fill('Lavado');
  await page.getByLabel('Precio', { exact: true }).fill('3000');
  await page.getByRole('button', { name: 'Agregar servicio' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Servicio agregado' })).toBeVisible();
  expect(log.bodies[3]).toEqual({ op: 'POST servicios', body: { nombre: 'Lavado', precio: 3000, comision_pct: 0, duracion_min: null }, query: '' });
});

test('Ajustes: copia de seguridad con todas las tablas', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'descarga en escritorio');
  await entrar(page, 'aj', {});
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar copia de seguridad' }).click()]);
  expect(dl.suggestedFilename()).toBe('barberhood-copia-2026-11-12.json');
  const j = JSON.parse(await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8'));
  expect(j.version).toBe(1);
  expect(j.ingresos).toHaveLength(DATA.ingresos!.length);
  expect(j.turno_items).toHaveLength(DATA.turno_items!.length);
});

test('Dueño: movimiento privado', async ({ page }) => {
  const log = await entrar(page, 'due', { 'POST dueno_mov': '' });
  await page.getByLabel('Tipo').selectOption('gas');
  await page.getByLabel('Monto').fill('7000');
  await page.getByLabel('Concepto').fill('Nafta');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  expect(log.bodies).toEqual([{ op: 'POST dueno_mov', body: { fecha: '2026-11-12', tipo: 'gas', concepto: 'Nafta', monto: 7000 }, query: '' }]);
});
