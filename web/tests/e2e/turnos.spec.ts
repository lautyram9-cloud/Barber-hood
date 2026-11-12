import { expect, test, type Page } from '@playwright/test';
import { buildAppData } from '@/domain/build';
import type { RawTables } from '@/domain/model';
import { fixtures, soloBarbero } from '../fixtures';
import { mockSupabase, type MockUser, type Permitidas } from './mock-supabase';

const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO), HOY = '2026-11-12', MANANA = '2026-11-13';
const BASE = fixtures(42, NOW_ISO);
const ME = BASE.barberos![0].id;
// Turnos de prueba agregados: uno libre (sin barbero) y uno pendiente de un barbero.
const DATA: RawTables = {
  ...BASE,
  turnos: [...BASE.turnos!,
    { id: 'tur-libre', barbero_id: null, cliente: 'Libre Test', cliente_id: null, creado_por: null, created_at: '2026-11-01T10:00:00Z', duracion_min: 30, estado: 'pendiente', fin: null, inicio: `${MANANA}T11:00:00`, notas: null, servicio_id: BASE.servicios![0].id, telefono: '3874123456' },
    { id: 'tur-pend', barbero_id: ME, cliente: 'Pendiente Test', cliente_id: null, creado_por: null, created_at: '2026-11-01T10:00:00Z', duracion_min: 30, estado: 'pendiente', fin: null, inicio: `${HOY}T18:00:00`, notas: 'nota previa', servicio_id: BASE.servicios![0].id, telefono: null },
  ],
};
const D = buildAppData(DATA);
const OWNER: MockUser = { id: 'usr-owner', email: 'duenio@prueba.test', rol: 'owner' };
const BARBER: MockUser = { id: 'usr-barber', email: 'barbero@prueba.test', rol: 'barber', barberoId: ME };

async function entrar(page: Page, user: MockUser, tables: RawTables, permitidas: Permitidas = {}) {
  await page.clock.setFixedTime(NOW);
  const log = await mockSupabase(page, tables, user, NOW, permitidas);
  await page.goto('');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.locator('main h1').first().waitFor();
  await page.goto('#/tur');
  await expect(page.getByRole('heading', { name: 'Turnos', level: 1 })).toBeVisible();
  return log;
}

test('agenda: día, semana y calendario del mes', async ({ page }) => {
  const log = await entrar(page, OWNER, DATA);
  const deHoy = D.turnos.filter((t) => t.fecha == HOY);
  for (const t of deHoy) await expect(page.locator('main')).toContainText(t.cliente);
  await page.getByRole('tab', { name: 'Mes' }).click();
  const n = D.turnos.filter((t) => t.fecha == MANANA).length;
  await page.getByRole('button', { name: `13: ${n} turnos` }).click();
  await expect(page.getByRole('tab', { name: 'Día' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('main')).toContainText('Libre Test');
  expect(log.writes).toEqual([]);
});

test('nuevo turno: envía cliente, turno e ítems como la versión estable', async ({ page }) => {
  const log = await entrar(page, OWNER, DATA, { 'rpc cliente_upsert': 'cli-nuevo', 'POST turnos': { id: 'turno-nuevo' }, 'POST turno_items': '' });
  await page.getByRole('button', { name: 'Nuevo turno' }).click();
  const hoja = page.getByRole('dialog', { name: 'Nuevo turno' });
  await hoja.getByRole('button', { name: 'Reservar turno' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Completá fecha, hora y cliente' })).toBeVisible();
  await hoja.getByRole('button', { name: D.servicios[0].nombre, exact: true }).click();
  await hoja.getByRole('button', { name: D.servicios[1].nombre, exact: true }).click();
  await hoja.getByLabel('Barbero').selectOption(D.barberos[1].id);
  await hoja.getByLabel('Cliente').fill('Juan Prueba');
  await hoja.getByLabel('Teléfono').fill('387 15-412 3456');
  await hoja.getByLabel('Notas internas (opcional)').fill('primera vez');
  const fecha = await hoja.getByLabel('Fecha').inputValue(), hora = await hoja.getByLabel('Horario libre').inputValue();
  expect(hora).toMatch(/^\d\d:\d\d$/);
  await hoja.getByRole('button', { name: 'Reservar turno' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Turno reservado' })).toBeVisible();
  await expect(hoja).toHaveCount(0);
  const [cli, tur, items] = log.bodies;
  expect(cli).toMatchObject({ op: 'rpc cliente_upsert', body: { p_nombre: 'Juan Prueba', p_tel: '387 15-412 3456' } });
  expect(tur.op).toBe('POST turnos');
  expect(tur.body).toEqual({
    inicio: `${fecha}T${hora}:00`, duracion_min: expect.any(Number), barbero_id: D.barberos[1].id, cliente: 'Juan Prueba', telefono: '387154123456',
    servicio_id: D.servicios[0].id, cliente_id: 'cli-nuevo', estado: 'confirmado', notas: 'primera vez',
  });
  expect(items).toMatchObject({ op: 'POST turno_items', body: [{ turno_id: 'turno-nuevo', servicio_id: D.servicios[0].id }, { turno_id: 'turno-nuevo', servicio_id: D.servicios[1].id }] });
});

test('detalle: confirmar, cancelar con confirmación y cobrar', async ({ page }) => {
  const log = await entrar(page, OWNER, DATA, { 'PATCH turnos': '', 'rpc cobrar_turno': 1 });
  const abrir = async () => { await page.locator('main').getByRole('button', { name: /Pendiente Test/ }).first().click(); return page.getByRole('dialog', { name: 'Pendiente Test' }); };
  let hoja = await abrir();
  await hoja.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Turno confirmado' })).toBeVisible();
  expect(log.bodies.at(-1)).toEqual({ op: 'PATCH turnos', body: { estado: 'confirmado', notas: 'nota previa' }, query: '?id=eq.tur-pend' });

  hoja = await abrir();
  await hoja.getByRole('button', { name: 'Rechazar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar', exact: true }).click(); // se arrepiente
  expect(log.bodies.length).toBe(1);
  await hoja.getByRole('button', { name: 'Rechazar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Rechazar' }).click();
  expect(log.bodies.at(-1)).toEqual({ op: 'PATCH turnos', body: { estado: 'cancelado', notas: 'nota previa' }, query: '?id=eq.tur-pend' });

  hoja = await abrir();
  await hoja.getByLabel('Medio de pago').selectOption('transferencia');
  await hoja.getByRole('button', { name: 'Cobrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cobrado' })).toBeVisible();
  expect(log.bodies.at(-1)).toMatchObject({ op: 'rpc cobrar_turno', body: { p_turno: 'tur-pend', p_medio: 'transferencia' } });
});

test('barbero: ve sus turnos y los libres, y se asigna uno', async ({ page }) => {
  const log = await entrar(page, BARBER, soloBarbero(DATA), { 'PATCH turnos': '' });
  await expect(page.locator('main')).toContainText('Libre Test');
  await expect(page.getByRole('button', { name: 'Nuevo turno' })).toHaveCount(0); // solo el dueño crea turnos
  await page.locator('main div.flex.items-center.gap-3', { hasText: 'Libre Test' }).getByRole('button', { name: 'Asignarme' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Turno asignado' })).toBeVisible();
  expect(log.bodies).toEqual([{ op: 'PATCH turnos', body: { barbero_id: ME, duracion_min: D.barberos[0].slotMin }, query: '?id=eq.tur-libre' }]);
  for (const t of ['gastos', 'cajas', 'dueno_mov']) expect(log.tables).not.toContain(t);
});
