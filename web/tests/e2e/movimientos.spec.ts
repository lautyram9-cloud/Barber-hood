import { expect, test, type Page } from '@playwright/test';
import { buildAppData } from '@/domain/build';
import * as L from '@/domain/logic';
import * as M from '@/domain/movimientos';
import { fixtures, soloBarbero } from '../fixtures';
import { mockSupabase, type MockUser, type Permitidas } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), HOY = '2026-11-12';
const DATA = fixtures(42, NOW_ISO), D = buildAppData(DATA), fmt = L.formatoPesos;
const ME = DATA.barberos![0].id;
const OWNER: MockUser = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' };
const BARBER: MockUser = { id: 'usr-barber', email: 'barbero@prueba.test', rol: 'barber', barberoId: ME };
const UUID = /^[0-9a-f-]{36}$/;

async function entrar(page: Page, user: MockUser, ruta: string, tables = DATA, permitidas: Permitidas = {}) {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, tables, user, NOW, permitidas);
  await page.goto('');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/' + ruta);
  await page.locator('main h1').first().waitFor();
  return log;
}

test('botón +: ingreso de servicio desde el atajo', async ({ page }) => {
  const log = await entrar(page, OWNER, 'ini', DATA, { 'rpc registrar_ingreso': 'ing-nuevo' });
  await page.getByRole('button', { name: 'Registrar ingreso o gasto' }).click();
  const hoja = page.getByRole('dialog', { name: 'Nuevo ingreso' });
  const s = D.servicios[0];
  await hoja.getByRole('button', { name: `${s.nombre} · ${fmt(s.precio)}` }).click();
  await hoja.getByLabel('Cliente (opcional)').fill('Juan');
  await hoja.getByLabel('Medio de pago').selectOption('transferencia');
  await hoja.getByRole('button', { name: 'Registrar ingreso' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ingreso registrado' })).toBeVisible();
  expect(log.bodies).toHaveLength(1);
  expect(log.bodies[0].body).toEqual({
    p_op: expect.stringMatching(UUID), p_tipo: 'servicio', p_concepto: s.nombre, p_servicio: s.id, p_producto: null, p_cant: 1, p_precio: s.precio,
    p_barbero: null, p_cliente: 'Juan', p_fecha: HOY, p_medio: 'transferencia', p_cliente_id: null, p_cobrado: true,
  });
});

test('botón +: producto sin elegir del stock no se registra', async ({ page }) => {
  const log = await entrar(page, OWNER, 'ini', DATA, { 'rpc registrar_ingreso': 'x' });
  await page.getByRole('button', { name: 'Registrar ingreso o gasto' }).click();
  const hoja = page.getByRole('dialog', { name: 'Nuevo ingreso' });
  await hoja.getByLabel('Tipo').selectOption('producto');
  await hoja.getByLabel('Servicio o producto').fill('Algo');
  await hoja.getByLabel('Precio unitario').fill('100');
  await hoja.getByRole('button', { name: 'Registrar ingreso' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Elegí un producto del stock' })).toBeVisible();
  expect(log.bodies).toEqual([]);
});

test('botón +: gasto fijo (solo dueño)', async ({ page }) => {
  const log = await entrar(page, OWNER, 'ini', DATA, { 'POST gastos': '' });
  await page.getByRole('button', { name: 'Registrar ingreso o gasto' }).click();
  await page.getByRole('tab', { name: 'Gasto fijo' }).click();
  const hoja = page.getByRole('dialog', { name: 'Nuevo gasto fijo' });
  await hoja.getByRole('button', { name: 'Luz', exact: true }).click();
  await hoja.getByLabel('Monto').fill('45000');
  await hoja.getByRole('button', { name: 'Registrar gasto' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gasto registrado' })).toBeVisible();
  expect(log.bodies).toEqual([{ op: 'POST gastos', body: { fecha: HOY, tipo: 'fijo', concepto: 'Luz', monto: 45000, medio_pago: 'efectivo' }, query: '' }]);
});

test('barbero: el + registra siempre a su nombre y no ofrece gastos', async ({ page }) => {
  const log = await entrar(page, BARBER, 'tur', soloBarbero(DATA), { 'rpc registrar_ingreso': 'x' });
  await page.getByRole('button', { name: 'Registrar ingreso', exact: true }).click();
  const hoja = page.getByRole('dialog', { name: 'Nuevo ingreso' });
  await expect(hoja.getByRole('tab')).toHaveCount(0);
  await expect(hoja.getByLabel('Barbero')).toBeDisabled();
  await hoja.getByLabel('Servicio o producto').fill('Corte especial');
  await hoja.getByLabel('Monto').fill('12000');
  await hoja.getByRole('button', { name: 'Registrar ingreso' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'servicio fuera de la lista' })).toBeVisible();
  expect(log.bodies[0].body).toMatchObject({ p_barbero: ME, p_concepto: 'Corte especial', p_precio: 12000, p_servicio: null });
});

test('Movimientos: indicadores, anular con confirmación, cobrar pendiente y registrar gasto', async ({ page }) => {
  const log = await entrar(page, OWNER, 'caja', DATA, { 'rpc anular_ingreso': null, 'rpc cobrar_ingreso': null, 'POST gastos': '' });
  const [a, b] = L.rango('sem', HOY), r = M.resumenMovimientos(D, a, b);
  await expect(page.locator('main')).toContainText(fmt(r.ingresos));
  await expect(page.locator('main')).toContainText(fmt(r.neto));
  // anular: primero cancelar, después confirmar
  const ing = M.movimientosPeriodo(D, a, b).find((m) => m.tipo == 'ing' && M.editable(m, true))!;
  await page.getByRole('button', { name: `Anular ${ing.concepto}` }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(log.bodies).toEqual([]);
  await page.getByRole('button', { name: `Anular ${ing.concepto}` }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Anular' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ingreso anulado' })).toBeVisible();
  expect(log.bodies[0]).toMatchObject({ op: 'rpc anular_ingreso', body: { p_id: expect.any(String) } });
  // cobrar un pendiente
  const pen = M.pendientesCobro(D)[0];
  await page.locator('main section', { hasText: 'Pendientes de cobro' }).getByRole('button').first().click();
  await page.getByRole('dialog').getByLabel('Medio de pago').selectOption('tarjeta');
  await page.getByRole('button', { name: 'Marcar como cobrado' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cobrado' })).toBeVisible();
  expect(log.bodies.at(-1)).toMatchObject({ op: 'rpc cobrar_ingreso', body: { p_id: pen.id, p_medio: 'tarjeta' } });
  // registrar gasto variable desde el formulario (sin medio de pago, como la versión estable)
  const form = page.locator('main section', { hasText: 'Registrar' }).last();
  await form.getByLabel('Tipo').selectOption('gas|variable');
  await form.getByLabel('Concepto').fill('Insumos');
  await form.getByLabel('Monto').fill('8000');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  expect(log.bodies.at(-1)).toEqual({ op: 'POST gastos', body: { fecha: HOY, tipo: 'variable', concepto: 'Insumos', monto: 8000 }, query: '' });
});

test.describe('Movimientos: detalle de cada movimiento', () => {
  const [a, b] = L.rango('sem', HOY);
  const objetivo = M.movimientosPeriodo(D, a, b).find((m) => m.tipo == 'ing' && M.editable(m, true))!;
  // Un ingreso conocido: transferencia, cargado por el dueño a las 14:05 (hora de Salta).
  const datos = { ...DATA, ingresos: DATA.ingresos!.map((i) => (i.id == objetivo.id
    ? { ...i, medio_pago: 'transferencia', cobrado: true, cobrado_at: null, creado_por: OWNER.id, created_at: '2026-11-12T14:05:00-03:00', turno_id: null, cantidad: 1 } : i)) };

  test('la fila muestra el medio de pago y al tocarla abre el detalle', async ({ page }) => {
    await entrar(page, OWNER, 'caja', datos);
    const fila = page.getByRole('button', { name: `Ver detalle de ${objetivo.concepto}` }).filter({ hasText: fmt(objetivo.monto) }).first();
    await expect(page.locator('main').getByText('Transferencia').first(), 'distintivo del medio en la lista').toBeVisible();
    await page.getByRole('button', { name: new RegExp(`Ver detalle de ${objetivo.concepto}`) }).first().waitFor();
    // abrimos justo el movimiento conocido (el único con transferencia cargada por 'usr-owner')
    const conocido = page.getByRole('button', { name: new RegExp(`Ver detalle de ${objetivo.concepto}`) }).filter({ hasText: 'Transferencia' }).first();
    await (await conocido.count() ? conocido : fila).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText(objetivo.concepto);
    await expect(dlg).toContainText(fmt(objetivo.monto));
    await expect(dlg).toContainText('Medio de pago');
    await expect(dlg).toContainText('Cargado por');
    await expect(dlg).toContainText('Fecha del movimiento');
  });

  test('muestra quién lo cargó, el día y la hora y el medio de pago exactos', async ({ page }) => {
    await entrar(page, OWNER, 'caja', datos);
    // el único movimiento cargado por 'usr-owner' es el conocido: "Vos"
    await page.getByRole('button', { name: /Ver detalle de/ }).filter({ hasText: 'Transferencia' }).first().click();
    const dlg = page.getByRole('dialog');
    const fila = (k: string) => dlg.locator('dt', { hasText: new RegExp(`^${k}$`) }).locator('xpath=following-sibling::dd');
    await expect(fila('Cargado por')).toHaveText('Vos');
    await expect(fila('Cargado')).toContainText('14:05');
    await expect(fila('Cargado')).toContainText('12');
    await expect(fila('Medio de pago')).toHaveText('Transferencia');
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
  });

  test('desde el detalle se cambia la fecha y se anula con confirmación', async ({ page }) => {
    const log = await entrar(page, OWNER, 'caja', datos, { 'PATCH ingresos': '', 'rpc anular_ingreso': null });
    await page.getByRole('button', { name: /Ver detalle de/ }).filter({ hasText: 'Transferencia' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Cambiar la fecha del movimiento').fill('2026-11-10');
    await expect.poll(() => log.bodies.map((x) => x.op)).toContain('PATCH ingresos');
    expect(log.bodies.find((x) => x.op == 'PATCH ingresos')).toMatchObject({ body: { fecha: '2026-11-10' }, query: `?id=eq.${objetivo.id}` });
    await dlg.getByRole('button', { name: 'Anular ingreso' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Anular' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Ingreso anulado' })).toBeVisible();
    expect(log.bodies.at(-1)).toMatchObject({ op: 'rpc anular_ingreso', body: { p_id: objetivo.id } });
  });
});
