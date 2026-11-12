import { expect, test } from '@playwright/test';
import { buildAppData } from '@/domain/build';
import * as S from '@/domain/stock';
import { fixtures } from '../fixtures';
import { mockSupabase } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), DATA = fixtures(42, NOW_ISO), D = buildAppData(DATA);
const OWNER = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' as const };

test('stock: nuevo producto con stock inicial, compra, ajuste y pérdida', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, DATA, OWNER, NOW, { 'POST productos': { id: 'prod-nuevo' }, 'rpc ajustar_stock': null, 'rpc registrar_compra': null, 'rpc registrar_perdida': null });
  await page.goto('');
  await page.getByLabel('Email').fill(OWNER.email); await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/stk');
  await expect(page.getByRole('heading', { name: 'Stock', level: 1 })).toBeVisible();
  await expect(page.locator('main')).toContainText(`Proveedores (${D.proveedores.length})`);
  await page.getByRole('button', { name: 'Producto', exact: true }).click();
  let h = page.getByRole('dialog', { name: 'Nuevo producto' });
  await h.getByLabel('Nombre').fill('Cera mate');
  await h.getByLabel('Precio de venta').fill('9000');
  await h.getByLabel('Stock inicial').fill('10');
  await h.getByRole('button', { name: 'Agregar producto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Producto agregado' })).toBeVisible();
  expect(log.bodies.slice(0, 2)).toEqual([
    { op: 'POST productos', body: { nombre: 'Cera mate', categoria: 'Ceras', proveedor_id: null, costo: 0, precio: 9000, comision_pct: 0, stock: 0, stock_min: 0 }, query: '?select=id' },
    { op: 'rpc ajustar_stock', body: { p_producto: 'prod-nuevo', p_nuevo: 10, p_nota: 'Stock inicial' } },
  ]);
  const p = S.productosOrdenados(D)[0];
  await page.getByRole('button', { name: 'Compra', exact: true }).first().click();
  h = page.getByRole('dialog', { name: 'Registrar compra' });
  await h.getByLabel('Cantidad').fill('6'); await h.getByLabel('Costo unitario').fill('2500');
  await h.getByRole('button', { name: 'Registrar compra' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Compra registrada' })).toBeVisible();
  expect(log.bodies[2]).toEqual({ op: 'rpc registrar_compra', body: { p_producto: p.id, p_cant: 6, p_costo: 2500, p_proveedor: null, p_fecha: '2026-11-12', p_medio: 'efectivo' } });
  await page.locator('main section button', { hasText: p.nombre }).first().click();
  h = page.getByRole('dialog', { name: p.nombre });
  await h.getByLabel('Stock real contado').fill('4');
  await h.getByRole('button', { name: 'Ajustar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Stock ajustado' })).toBeVisible();
  expect(log.bodies[3]).toEqual({ op: 'rpc ajustar_stock', body: { p_producto: p.id, p_nuevo: 4, p_nota: 'Conteo físico' } });
  await page.locator('main section button', { hasText: p.nombre }).first().click();
  h = page.getByRole('dialog', { name: p.nombre });
  await h.getByLabel('Cantidad perdida').fill('1'); await h.getByLabel('Motivo').fill('roto');
  await h.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Pérdida registrada' })).toBeVisible();
  expect(log.bodies[4]).toEqual({ op: 'rpc registrar_perdida', body: { p_producto: p.id, p_cant: 1, p_motivo: 'roto' } });
});
