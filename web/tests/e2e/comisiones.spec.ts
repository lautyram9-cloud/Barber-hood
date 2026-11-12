import { expect, test } from '@playwright/test';
import { buildAppData } from '@/domain/build';
import * as C from '@/domain/comisiones';
import * as L from '@/domain/logic';
import { fixtures } from '../fixtures';
import { mockSupabase } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), DATA = fixtures(42, NOW_ISO), D = buildAppData(DATA);
const OWNER = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' as const };

test('liquidar con confirmación, adelanto y comprobante', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, DATA, OWNER, NOW, { 'rpc liquidar_comisiones': 'liq-nueva', 'POST adelantos': '' });
  await page.goto('');
  await page.getByLabel('Email').fill(OWNER.email); await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/com');
  await expect(page.getByRole('heading', { name: 'Comisiones', level: 1 })).toBeVisible();
  const b = D.barberos[0], p = C.previaLiquidacion(D, b.id, 'sem', '2026-11-12');
  await page.locator('main section', { hasText: 'Comisiones del período' }).getByRole('button', { name: 'Liquidar' }).first().click();
  const hoja = page.getByRole('dialog', { name: `Liquidar a ${b.nombre}` });
  await expect(hoja).toContainText(L.formatoPesos(p.aPagar));
  await hoja.getByLabel('Medio de pago').selectOption('transferencia');
  await hoja.getByRole('button', { name: 'Confirmar pago' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Liquidación registrada' })).toBeVisible();
  expect(log.bodies[0]).toEqual({ op: 'rpc liquidar_comisiones', body: { p_barbero: b.id, p_hasta: p.hasta, p_medio: 'transferencia' } });
  const ad = page.locator('main section', { hasText: 'Adelantos a barberos' });
  await ad.getByLabel('Barbero').selectOption(b.id);
  await ad.getByLabel('Monto').fill('5000');
  await ad.getByRole('button', { name: 'Registrar adelanto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Adelanto registrado' })).toBeVisible();
  expect(log.bodies[1]).toEqual({ op: 'POST adelantos', body: { barbero_id: b.id, monto: 5000, nota: null, medio_pago: 'efectivo' }, query: '' });
  if (D.liquidaciones.length) {
    await page.locator('main section', { hasText: 'Historial de liquidaciones' }).getByRole('button').first().click();
    await expect(page.getByRole('dialog', { name: 'Comprobante de liquidación' })).toContainText('Pagado');
  }
});
