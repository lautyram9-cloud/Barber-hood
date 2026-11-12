import { expect, test, type Page } from '@playwright/test';
import { buildAppData } from '@/domain/build';
import * as C from '@/domain/clientes';
import * as L from '@/domain/logic';
import { fixtures, soloBarbero } from '../fixtures';
import { mockSupabase, type MockUser, type Permitidas } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO);
const DATA = fixtures(42, NOW_ISO), D = buildAppData(DATA);
const OWNER: MockUser = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' };
const BARBER: MockUser = { id: 'usr-barber', email: 'barbero@prueba.test', rol: 'barber', barberoId: DATA.barberos![0].id };

async function entrar(page: Page, user: MockUser, tables = DATA, permitidas: Permitidas = {}) {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, tables, user, NOW, permitidas);
  await page.goto('');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/cli');
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible();
  return log;
}
const nombres = (page: Page) => page.locator('main section button div.truncate.text-sm').allInnerTexts();

test('lista ordenada, búsqueda y filtros', async ({ page }) => {
  const log = await entrar(page, OWNER);
  expect(await nombres(page)).toEqual(C.listaClientes(D, '', '').map((s) => s.cliente.nombre));
  await page.getByLabel('Buscar por nombre o teléfono').fill('cliente 1');
  await expect.poll(() => nombres(page)).toEqual(C.listaClientes(D, 'cliente 1', '').map((s) => s.cliente.nombre));
  await page.getByLabel('Buscar por nombre o teléfono').fill('');
  await page.getByRole('button', { name: 'Nuevos', exact: true }).click();
  await expect.poll(() => nombres(page)).toEqual(C.listaClientes(D, '', 'nuevo').map((s) => s.cliente.nombre));
  expect(log.writes).toEqual([]);
});

test('ficha: datos y guardar preferencias', async ({ page }) => {
  const log = await entrar(page, OWNER, DATA, { 'PATCH clientes': '' });
  const s = C.listaClientes(D, '', '')[0], c = s.cliente;
  await page.locator('main section button', { hasText: c.nombre }).first().click();
  const hoja = page.getByRole('dialog', { name: c.nombre });
  await expect(hoja).toContainText(L.formatoPesos(s.total));
  await expect(hoja).toContainText(`${s.visitas}`);
  await hoja.getByLabel('Preferencias').fill('degradé 2');
  await hoja.getByLabel('Observaciones').fill('');
  await hoja.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cliente guardado' })).toBeVisible();
  expect(log.bodies).toEqual([{ op: 'PATCH clientes', body: { preferencias: 'degradé 2', observaciones: null }, query: `?id=eq.${c.id}` }]);
});

test('barbero también ve Clientes (filtrado por la base)', async ({ page }) => {
  const log = await entrar(page, BARBER, soloBarbero(DATA));
  await expect(page.locator('main section')).toBeVisible();
  for (const t of ['gastos', 'cajas', 'dueno_mov', 'proveedores']) expect(log.tables).not.toContain(t);
});
