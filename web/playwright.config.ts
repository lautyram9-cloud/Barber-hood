import { defineConfig, devices } from '@playwright/test';

process.env.TZ = 'America/Argentina/Salta';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/Barber-hood/next/',
    timezoneId: 'America/Argentina/Salta',
    locale: 'es-AR',
    trace: 'off',
  },
  // Sirve el build igual que GitHub Pages: legacy en /Barber-hood/ y la nueva en /Barber-hood/next/.
  webServer: {
    command: 'node tests/e2e/serve-pages.mjs',
    url: 'http://localhost:4173/Barber-hood/next/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // Emulación de iPhone/iPad con Chromium: NO reemplaza probar en Safari real.
    { name: 'iphone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'ipad', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
