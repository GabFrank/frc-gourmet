import { defineConfig } from '@playwright/test';

/**
 * Playwright config para tests E2E sobre la app Electron de FRC Gourmet.
 *
 * Los tests viven en `e2e/`. Cada test lanza Electron con `_electron.launch`
 * apuntando al `main.js` compilado. Antes de correr ejecutar:
 *   npm run electron:serve-tsc        # compila main.ts, preload.ts, etc.
 *   npm run build:prod                # genera dist/frc-gourmet/
 *
 * El script `test:e2e` ya hace ambos pasos.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never' }]]
    : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
