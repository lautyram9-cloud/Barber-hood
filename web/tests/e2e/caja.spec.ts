import { expect, test, type Page } from '@playwright/test';
import type { RawTables } from '@/domain/model';
import { fixtures } from '../fixtures';
import { mockSupabase, type Permitidas } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), BASE = fixtures(42, NOW_ISO);
const cerradas = BASE.cajas!.filter((c) => c.estado == 'cerrada');
const ABIERTA = { ...cerradas[0], id: 'caja-abierta', estado: 'abierta', apertura_at: '2026-11-12T12:00:00Z', cierre_at: null, contado: null, diferencia: null, esperado: null };
const OWNER = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' as const };

async function entrar(page: Page, tables: RawTables, permitidas: Permitidas) {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, tables, OWNER, NOW, permitidas);
  await page.goto('');
  await page.getByLabel('Email').fill(OWNER.email); await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/cj');
  await expect(page.getByRole('heading', { name: 'Caja', level: 1 })).toBeVisible();
  return log;
}

test('caja cerrada: abrir con efectivo inicial', async ({ page }) => {
  const log = await entrar(page, { ...BASE, cajas: cerradas }, { 'rpc abrir_caja': 'caja-nueva' });
  await page.getByLabel('Efectivo inicial en caja').fill('15000');
  await page.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Caja abierta' })).toBeVisible();
  expect(log.bodies).toEqual([{ op: 'rpc abrir_caja', body: { p_saldo: 15000 } }]);
});

test('caja abierta: esperado, hora local, movimiento manual y cierre con confirmación', async ({ page }) => {
  const log = await entrar(page, { ...BASE, cajas: [...cerradas, ABIERTA] }, { 'POST caja_mov': '', 'rpc cerrar_caja': -567 });
  await expect(page.locator('main')).toContainText('$34.567'); // esperado que devuelve caja_resumen (simulado)
  await expect(page.locator('main')).toContainText('09:00'); // 12:00 UTC = 09:00 en Salta (la versión estable mostraba 12:00)
  const mov = page.locator('section', { hasText: 'Movimiento manual' });
  await mov.getByLabel('Tipo').selectOption('egreso');
  await mov.getByLabel('Monto').fill('2000');
  await mov.getByLabel('Concepto').fill('Retiro');
  await mov.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Registrado' })).toBeVisible();
  expect(log.bodies[0]).toMatchObject({ op: 'POST caja_mov', body: { caja_id: 'caja-abierta', tipo: 'egreso', concepto: 'Retiro', monto: 2000 } });
  await page.getByLabel('Efectivo contado').fill('34000');
  await expect(page.locator('main')).toContainText('Diferencia: $-567');
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(log.bodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar caja' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Caja cerrada. Diferencia: $-567' })).toBeVisible();
  expect(log.bodies[1]).toEqual({ op: 'rpc cerrar_caja', body: { p_caja: 'caja-abierta', p_contado: 34000, p_notas: null } });
});
