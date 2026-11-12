import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildAppData } from '@/domain/build';
import * as L from '@/domain/logic';
import { fixtures, soloBarbero } from '../fixtures';
import { mockSupabase, type MockUser } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), HOY = '2026-11-12';
const DATA = fixtures(42, NOW_ISO);
const OWNER: MockUser = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' };
const BARBER: MockUser = { id: 'usr-barber', email: 'barbero@prueba.test', rol: 'barber', barberoId: DATA.barberos![0].id };
const OWNER_ONLY = ['gastos', 'mov_stock', 'dueno_mov', 'cajas', 'caja_mov', 'proveedores'];

async function login(page: Page, user: MockUser, tables = DATA) {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, tables, user, NOW);
  await page.goto('');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  return log;
}
const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test('login: rechaza credenciales incorrectas', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockSupabase(page, DATA, OWNER, NOW);
  await page.goto('');
  await expect(page.getByRole('heading', { name: 'Barber Hood Manager' })).toBeVisible();
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Clave').fill('incorrecta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email o clave incorrectos');
});

test('dueño: Inicio muestra los mismos números que calcula la lógica validada', async ({ page }) => {
  const log = await login(page, OWNER);
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  const d = buildAppData(DATA), r = L.resultado(d, HOY, HOY), fmt = L.formatoPesos;
  const kpi = (label: string) => page.locator('div', { has: page.getByText(label, { exact: true }) }).last();
  await expect(kpi('Facturación hoy')).toContainText(fmt(r.ingresos));
  await expect(kpi('Gastos hoy')).toContainText(fmt(r.gastosFijos + r.gastosVariables));
  await expect(kpi('Ganancia estimada')).toContainText(fmt(r.neto));
  await expect(kpi('Comisiones pendientes')).toContainText(fmt(L.comisionPendiente(d)));
  await expect(kpi('En caja')).toContainText(d.cajaAbierta ? '$34.567' : 'Cerrada');
  const hoy = d.turnos.filter((t) => t.fecha == HOY).length;
  await expect(page.getByText(`Turnos de hoy (${hoy})`)).toBeVisible();

  // Mismas secciones que la versión estable para el dueño (11).
  if (isDesktop(page)) {
    await expect(page.locator('aside nav button')).toHaveCount(11);
  } else {
    const bar = page.locator('nav[aria-label="Secciones"]').last();
    await expect(bar.getByRole('button')).toHaveCount(5); // 4 + "Más"
    await bar.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('dialog', { name: 'Más secciones' }).locator('.grid button')).toHaveCount(7);
    await page.keyboard.press('Escape');
  }
  // La sesión se conserva al recargar (misma clave de sesión que la versión estable).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();

  expect(log.tables).toEqual(expect.arrayContaining(OWNER_ONLY));
  expect(log.writes, 'la app no debe escribir nada al solo mirar').toEqual([]);
  expect(log.external, 'no debe haber pedidos a otros servidores').toEqual([]);
});

test('dueño: un módulo no migrado lleva a la versión estable', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('#/stk');
  await expect(page.getByRole('heading', { name: 'Stock' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir versión estable' }).first()).toHaveAttribute('href', '../');
});

test('barbero: ve solo sus secciones y NUNCA pide tablas del dueño', async ({ page }) => {
  const log = await login(page, BARBER, soloBarbero(DATA));
  await expect(page.getByRole('heading', { name: 'Turnos' })).toBeVisible(); // primera sección del barbero
  await expect(page).toHaveURL(/#\/tur$/);
  const labels = isDesktop(page)
    ? await page.locator('aside nav button').allInnerTexts()
    : await page.locator('nav[aria-label="Secciones"]').last().getByRole('button').allInnerTexts();
  expect(labels.map((l) => l.replace(/\s*estable$/, '').trim())).toEqual(['Turnos', 'Clientes', 'Mi perfil']);
  // Intentar entrar a una sección del dueño por URL no la muestra.
  await page.goto('#/due');
  await expect(page).toHaveURL(/#\/tur$/);
  await page.waitForTimeout(500);
  for (const t of OWNER_ONLY) expect(log.tables, `el barbero pidió ${t}`).not.toContain(t);
  expect(log.rpcs).not.toContain('caja_resumen');
  expect(log.writes).toEqual([]);
});

test('usuario sin barbero vinculado no entra', async ({ page }) => {
  await login(page, { id: 'usr-x', email: 'nuevo@prueba.test', rol: null, barberoId: null });
  await expect(page.getByRole('heading', { name: 'Usuario sin barbero' })).toBeVisible();
});

test('#reservar sigue llevando a la reserva pública de la versión estable', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await mockSupabase(page, DATA, OWNER, NOW);
  await page.goto('#reservar');
  await expect(page.getByRole('link', { name: 'Ir a reservar' })).toHaveAttribute('href', '../#reservar');
});

test('la versión estable sigue publicada intacta en la raíz', async ({ request }) => {
  const res = await request.get('../');
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(readFileSync(new URL('../../../index.html', import.meta.url), 'utf8'));
});
