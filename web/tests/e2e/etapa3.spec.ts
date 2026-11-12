import { expect, test, type Page } from '@playwright/test';
import { buildAppData } from '@/domain/build';
import * as L from '@/domain/logic';
import { fixtures, soloBarbero } from '../fixtures';
import { mockSupabase, type MockUser, type Permitidas } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), HOY = '2026-11-12';
const DATA = fixtures(42, NOW_ISO), D = buildAppData(DATA), fmt = L.formatoPesos;
const OWNER: MockUser = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' };
const ME = DATA.barberos![0].id;
const BARBER: MockUser = { id: 'usr-barber', email: 'barbero@prueba.test', rol: 'barber', barberoId: ME };

async function entrar(page: Page, user: MockUser, ruta: string, tables = DATA, permitidas: Permitidas = {}) {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, tables, user, NOW, permitidas);
  await page.goto('');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/' + ruta);
  return log;
}
const fila = (page: Page, label: string) => page.locator('main div.flex.items-center.justify-between', { has: page.getByText(label, { exact: true }) }).first();

test('Estadísticas: resultado del período y cambio de período', async ({ page }) => {
  const log = await entrar(page, OWNER, 'est');
  await expect(page.getByRole('heading', { name: 'Estadísticas', level: 1 })).toBeVisible();
  const rs = L.resultado(D, ...L.rango('sem', HOY));
  await expect(fila(page, 'Ganancia real estimada')).toContainText(fmt(rs.neto));
  await expect(fila(page, 'Facturación').first()).toContainText(fmt(rs.ingresos));
  await page.getByRole('tab', { name: 'Mes' }).click();
  const rm = L.resultado(D, ...L.rango('mes', HOY));
  await expect(fila(page, 'Ganancia real estimada')).toContainText(fmt(rm.neto));
  await page.getByRole('button', { name: 'Período anterior' }).click(); // octubre
  const ro = L.resultado(D, ...L.rango('mes', '2026-10-12'));
  await expect(fila(page, 'Ganancia real estimada')).toContainText(fmt(ro.neto));
  expect(log.writes).toEqual([]);
});

test('Estadísticas: exporta CSV idéntico al de la versión estable', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'la descarga se prueba en escritorio (en iPhone se usa el menú Compartir)');
  await entrar(page, OWNER, 'est');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Movimientos (ingresos y gastos)' }).click()]);
  const x = L.csvExport(D, 'mov', ...L.rango('sem', HOY));
  expect(dl.suggestedFilename()).toBe(x.nombre);
  const txt = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8');
  expect(txt).toBe('﻿' + L.aCsv(x.filas));
});

test('Barberos: ranking y registrar falta con confirmación', async ({ page }) => {
  const log = await entrar(page, OWNER, 'bar', DATA, { 'POST asistencia': '' });
  const R = D.barberos.map((x) => L.statsBarbero(D, x.id, ...L.rango('sem', HOY))).sort((x, y) => y.facturacion - x.facturacion);
  const ranking = page.locator('section', { has: page.getByRole('heading', { name: 'Ranking de barberos' }) });
  for (const s of R) await expect(ranking).toContainText(s.nombre);
  const primera = page.locator('section', { has: page.getByRole('heading', { name: D.barberos[0].nombre, exact: true }) });
  // Cancelar no escribe nada
  await primera.getByRole('button', { name: 'Registrar falta hoy' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(log.writes).toEqual([]);
  // Confirmar envía exactamente lo mismo que la versión estable
  await primera.getByRole('button', { name: 'Registrar falta hoy' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Registrar falta' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Falta registrada' })).toBeVisible();
  expect(log.bodies).toEqual([{ op: 'POST asistencia', body: { barbero_id: D.barberos[0].id, fecha: HOY, estado: 'falta' }, query: '' }]);
});

test('Mi perfil (barbero): marca asistencia con la misma función de la base', async ({ page }) => {
  const tablas = soloBarbero({ ...DATA, asistencia: DATA.asistencia!.filter((x) => !(x.barbero_id == ME && x.fecha == HOY)) });
  const log = await entrar(page, BARBER, 'me', tablas, { 'rpc marcar_asistencia': 'tarde' });
  await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: D.barberos[0].nombre })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar falta hoy' })).toHaveCount(0); // solo el dueño
  await page.getByRole('button', { name: 'Marcar mi asistencia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Asistencia marcada (llegada tarde)' })).toBeVisible();
  expect(log.bodies.map((b) => b.op)).toEqual(['rpc marcar_asistencia']);
  for (const t of ['gastos', 'mov_stock', 'dueno_mov', 'cajas', 'caja_mov', 'proveedores']) expect(log.tables).not.toContain(t);
});
