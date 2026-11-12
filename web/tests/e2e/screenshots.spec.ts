import { test } from '@playwright/test';
import { fixtures } from '../fixtures';
import { mockSupabase } from './mock-supabase';

// Capturas para revisión visual. Solo corre con SHOTS=<carpeta>.
const OUT = process.env.SHOTS;
test.skip(!OUT, 'solo con SHOTS');
const NOW_ISO = '2026-11-12T15:37:00-03:00', NOW = Date.parse(NOW_ISO);

test('capturas', async ({ page }, info) => {
  await page.clock.setFixedTime(NOW);
  await mockSupabase(page, fixtures(42, NOW_ISO), { id: 'u', email: 'duenio@prueba.test', rol: 'owner' }, NOW);
  await page.goto('');
  await page.screenshot({ path: `${OUT}/${info.project.name}-1-login.png` });
  await page.getByLabel('Email').fill('duenio@prueba.test');
  await page.getByLabel('Clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('heading', { name: 'Inicio', level: 1 }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${info.project.name}-2-inicio.png`, fullPage: true });
  for (const r of ['est', 'bar', 'tur']) {
    await page.goto('#/' + r);
    await page.locator('main h1').first().waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${info.project.name}-4-${r}.png`, fullPage: true });
  }
  await page.locator('main').getByRole('button').filter({ hasText: /\d\d:\d\d/ }).first().click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: `${OUT}/${info.project.name}-5-turno.png` });
  await page.keyboard.press('Escape');
  await page.goto('#/due');
  await page.getByRole('heading', { name: 'Dueño' }).waitFor();
  await page.screenshot({ path: `${OUT}/${info.project.name}-3-pendiente.png` });
});
