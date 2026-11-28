import { expect, test, type Page } from '@playwright/test';
import { fixtures } from '../fixtures';
import { mockSupabase, type Permitidas } from './mock-supabase';
import { abrir, cerrar } from './ui';

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
  await abrir(page, 'Disponibilidad');
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
  await cerrar(page);
  await abrir(page, 'Barberos y comisión');
  await page.getByLabel('Nombre del barbero').fill('Tomi');
  await page.getByLabel('Minutos por turno', { exact: true }).fill('40');
  await page.getByLabel('Email de su usuario (opcional)').fill('tomi@prueba.test');
  await page.getByRole('button', { name: 'Agregar barbero' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Barbero agregado' })).toBeVisible();
  expect(log.bodies.slice(1, 3)).toEqual([
    { op: 'POST barberos', body: { nombre: 'Tomi', slot_min: 40 }, query: '?select=id' },
    { op: 'rpc vincular_barbero', body: { p_barbero: 'bar-nuevo', p_email: 'tomi@prueba.test' } },
  ]);
  await cerrar(page);
  await abrir(page, 'Servicios y comisión');
  await page.getByLabel('Servicio', { exact: true }).fill('Lavado');
  await page.getByLabel('Precio', { exact: true }).fill('3000');
  await page.getByRole('button', { name: 'Agregar servicio' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Servicio agregado' })).toBeVisible();
  expect(log.bodies[3]).toEqual({ op: 'POST servicios', body: { nombre: 'Lavado', precio: 3000, comision_pct: 0, duracion_min: null }, query: '' });
});

test('Ajustes: copia de seguridad con todas las tablas', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'descarga en escritorio');
  await entrar(page, 'aj', {});
  await abrir(page, 'Copias y control');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar copia de seguridad' }).click()]);
  expect(dl.suggestedFilename()).toBe('barberhood-copia-2026-11-12.json');
  const j = JSON.parse(await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8'));
  expect(j.version).toBe(1);
  expect(j.ingresos).toHaveLength(DATA.ingresos!.length);
  expect(j.turno_items).toHaveLength(DATA.turno_items!.length);
});

test('Dueño: movimiento privado', async ({ page }) => {
  const log = await entrar(page, 'due', { 'POST dueno_mov': '' });
  await abrir(page, 'Registrar');
  await page.getByLabel('Tipo').selectOption('gas');
  await page.getByLabel('Monto').fill('7000');
  await page.getByLabel('Concepto').fill('Nafta');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
  expect(log.bodies).toEqual([{ op: 'POST dueno_mov', body: { fecha: '2026-11-12', tipo: 'gas', concepto: 'Nafta', monto: 7000 }, query: '' }]);
});

test.describe('Ajustes: restaurar copia de seguridad (recupera lo que falta, nunca pisa)', () => {
  const copia = (o: object = { ingresos: [{ id: 'x1' }], turnos: [{ id: 't1' }] }) => ({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, fecha: '2026-11-01T00:00:00Z', ...o })) });
  const toastDe = (page: Page, t: string) => expect(page.getByRole('status').filter({ hasText: t })).toBeVisible();

  test('simula, muestra qué falta, pide confirmación y recién ahí aplica', async ({ page }) => {
    const log = await entrar(page, 'aj', { 'rpc restaurar_respaldo': { ingresos: 2, turnos: 1, clientes: 0 } });
    await abrir(page, 'Copias y control');
    await page.getByLabel('Archivo de copia de seguridad').setInputFiles(copia());
    const dlg = page.getByRole('alertdialog');
    await expect(dlg).toContainText('Se van a agregar: turnos: 1, ingresos: 2');
    await expect(dlg).toContainText('No se modifica ni se borra nada');
    expect(log.bodies.map((b) => [b.op, (b.body as { p_aplicar: boolean }).p_aplicar]), 'antes de confirmar solo simula').toEqual([['rpc restaurar_respaldo', false]]);
    await dlg.getByRole('button', { name: 'Recuperar' }).click();
    await toastDe(page, 'Copia restaurada: 3 registros recuperados');
    expect(log.bodies.map((b) => (b.body as { p_aplicar: boolean }).p_aplicar)).toEqual([false, true]);
    expect((log.bodies[1].body as { p: { version: number; ingresos: unknown[] } }).p).toMatchObject({ version: 1, ingresos: [{ id: 'x1' }] });
    expect(log.writes, 'solo la función; ninguna escritura directa a tablas').toEqual([]);
  });

  test('cancelar no escribe nada', async ({ page }) => {
    const log = await entrar(page, 'aj', { 'rpc restaurar_respaldo': { ingresos: 1 } });
    await abrir(page, 'Copias y control');
    await page.getByLabel('Archivo de copia de seguridad').setInputFiles(copia());
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    expect(log.bodies.map((b) => (b.body as { p_aplicar: boolean }).p_aplicar)).toEqual([false]);
  });

  test('si no falta nada, avisa y no pide confirmar', async ({ page }) => {
    const log = await entrar(page, 'aj', { 'rpc restaurar_respaldo': { ingresos: 0, turnos: 0 } });
    await abrir(page, 'Copias y control');
    await page.getByLabel('Archivo de copia de seguridad').setInputFiles(copia());
    await toastDe(page, 'No falta nada: todo lo de la copia ya está');
    await expect(page.getByRole('alertdialog')).toBeHidden();
    expect(log.bodies).toHaveLength(1);
  });

  test('archivos inválidos se rechazan sin llamar a la base', async ({ page }) => {
    const log = await entrar(page, 'aj', { 'rpc restaurar_respaldo': { ingresos: 1 } });
    await abrir(page, 'Copias y control');
    await page.getByLabel('Archivo de copia de seguridad').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('esto no es json') });
    await toastDe(page, 'El archivo no es una copia válida');
    await page.getByLabel('Archivo de copia de seguridad').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2,"ingresos":[]}') });
    await toastDe(page, 'El archivo no es una copia de Barber Hood');
    expect(log.bodies).toEqual([]);
  });
});

test('Ajustes: tarjeta de avisos de reservas explica qué falta en cada dispositivo', async ({ page }, info) => {
  await entrar(page, 'aj', {});
  const card = page.locator('main section', { hasText: 'Avisos de reservas' });
  await expect(card).toBeVisible();
  // En iPhone/iPad emulado la app no está "instalada": pide agregarla a la pantalla de inicio.
  // En escritorio las pruebas bloquean el service worker: pide reabrir la app.
  if (info.project.name == 'escritorio') await expect(card).toContainText('cerrala y abrila de nuevo');
  else await expect(card).toContainText('Agregar a pantalla de inicio');
  await expect(card.getByRole('button', { name: /Activar avisos/ })).toHaveCount(0);
});

test('Ajustes: el dueño sube la foto de un barbero (se achica a JPG y queda guardada)', async ({ page }) => {
  const b = DATA.barberos!.filter((x) => x.activo)[0];
  const log = await entrar(page, 'aj', { 'POST storage': null, 'PATCH barberos': '' });
  // imagen de prueba de 600x400: la app la recorta a un cuadrado de hasta 480 px
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400;
    const g = c.getContext('2d')!; g.fillStyle = '#2f8cff'; g.fillRect(0, 0, 600, 400);
    const blob = await new Promise<Blob>((ok) => c.toBlob((x) => ok(x!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await abrir(page, 'Barberos y comisión');
  await page.getByLabel(`Archivo de foto de ${b.nombre}`).setInputFiles({ name: 'cara.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.getByRole('status').filter({ hasText: 'Foto actualizada' })).toBeVisible();
  const sub = log.bodies.find((x) => x.op == 'POST storage')!;
  expect(sub.body).toMatch(new RegExp(`^barberos/${b.id}/\\d+\\.jpg$`));
  const patch = log.bodies.find((x) => x.op == 'PATCH barberos')!;
  expect(patch).toMatchObject({ query: `?id=eq.${b.id}` });
  expect((patch.body as { foto: string }).foto).toBe((sub.body as string).replace(/^barberos\//, ''));
});

test('Ajustes: si la base no tiene el espacio de fotos, avisa y no cambia nada', async ({ page }) => {
  const b = DATA.barberos!.filter((x) => x.activo)[0];
  const log = await entrar(page, 'aj', {});
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 50; c.height = 50;
    const blob = await new Promise<Blob>((ok) => c.toBlob((x) => ok(x!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await abrir(page, 'Barberos y comisión');
  await page.getByLabel(`Archivo de foto de ${b.nombre}`).setInputFiles({ name: 'cara.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.getByRole('status').filter({ hasText: 'No se pudo subir la foto' })).toBeVisible();
  expect(log.bodies).toEqual([]);
});

test('Ajustes: editar minutos por turno y nombre de un barbero, y editar un servicio', async ({ page }) => {
  const b = DATA.barberos!.filter((x) => x.activo)[0], s = DATA.servicios!.filter((x) => x.activo)[0];
  const log = await entrar(page, 'aj', { 'PATCH barberos': '', 'PATCH servicios': '' });
  const hb = await abrir(page, 'Barberos y comisión');
  await hb.getByLabel(`Minutos por turno de ${b.nombre}`).fill('3');
  await hb.getByRole('button', { name: 'Guardar datos' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Los minutos por turno van de 5 a 240' })).toBeVisible();
  expect(log.bodies).toEqual([]);
  await hb.getByLabel(`Minutos por turno de ${b.nombre}`).fill('40');
  await hb.getByLabel(`Nombre de ${b.nombre}`).fill('Lucas Pro');
  await hb.getByRole('button', { name: 'Guardar datos' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: 'Datos guardados' })).toBeVisible();
  expect(log.bodies[0]).toEqual({ op: 'PATCH barberos', body: { nombre: 'Lucas Pro', slot_min: 40 }, query: `?id=eq.${b.id}` });
  await cerrar(page);
  const hs = await abrir(page, 'Servicios y comisión');
  await hs.getByRole('button', { name: `Editar ${s.nombre}`, exact: true }).click();
  await hs.getByLabel('Precio del servicio').fill('15000');
  await hs.getByLabel('Duración del servicio').fill('45');
  await hs.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Servicio guardado' })).toBeVisible();
  expect(log.bodies[1]).toMatchObject({ op: 'PATCH servicios', body: { nombre: s.nombre, precio: 15000, duracion_min: 45 }, query: `?id=eq.${s.id}` });
});

test('Sueldos: une Comisiones y Rendimiento en una pestaña, y los montos se ven resaltados', async ({ page }) => {
  await entrar(page, 'sue', {});
  await expect(page.getByRole('heading', { name: 'Sueldos', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Por barbero' })).toBeVisible();
  await page.getByRole('tab', { name: 'Rendimiento' }).click();
  await expect(page.getByRole('heading', { name: 'Ranking de barberos' })).toBeVisible();
  const plata = page.locator('main [data-dinero]');
  await expect(plata.first(), 'cuadros con dinero resaltados').toBeVisible();
  await expect(plata.first()).toContainText('$');
  await expect(page.locator('main div:not([data-dinero])', { has: page.getByText('Cortes', { exact: true }) }).last(), 'los que no son dinero quedan normales').toBeVisible();
});

test.describe('Dueño: tus cortes se suman solos', () => {
  test('con tu usuario vinculado a un barbero, sus servicios del período se suman a tus ingresos', async ({ page }) => {
    const b0 = DATA.barberos![0];
    const datos = { ...DATA, barberos: DATA.barberos!.map((b) => (b.id == b0.id ? { ...b, user_id: OWNER.id } : b)) };
    await page.clock.setFixedTime(NOW);
    const log = await mockSupabase(page, datos, OWNER, NOW, {});
    await page.goto('');
    await page.getByLabel('Email').fill(OWNER.email); await page.getByLabel('Clave').fill('clave-de-prueba');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.locator('main h1').first().waitFor();
    await page.goto('#/due');
    await expect(page.getByRole('heading', { name: 'Dueño', level: 1 })).toBeVisible();
    const { buildAppData } = await import('@/domain/build');
    const A = await import('@/domain/ajustes'), L = await import('@/domain/logic');
    const D2 = buildAppData(datos), [a, b] = L.rango('sem', '2026-11-12');
    const c = A.cortesDelDueno(D2, OWNER.id, a, b)!, t = A.totalesDueno(A.movimientosDueno(D2, a, b));
    const kpi = page.locator('main div', { has: page.getByText('Ingresos', { exact: true }) }).last();
    await expect(kpi).toContainText(L.formatoPesos(t.ingresos + c.total));
    const dlg = await abrir(page, 'Mis cortes');
    for (const m of c.movs) await expect(dlg).toContainText(m.concepto);
    expect(log.writes, 'se calcula: no se guarda nada').toEqual([]);
  });

  test('sin tu usuario vinculado, explica cómo vincularlo', async ({ page }) => {
    await entrar(page, 'due', {});
    await expect(page.locator('main')).toContainText('Vinculá tu usuario a tu perfil de barbero');
    await expect(page.getByRole('button', { name: 'Mis cortes', exact: true })).toHaveCount(0);
  });
});
