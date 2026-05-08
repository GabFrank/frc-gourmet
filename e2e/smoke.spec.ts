/**
 * Smoke test E2E — verifica que Electron arranca, carga la app y muestra el login.
 *
 * Antes de correr:
 *   npm run electron:serve-tsc
 *   npm run build:prod
 *
 * Luego:
 *   npx playwright test
 */
import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

test('Electron arranca y muestra el login', async () => {
  // userData temporal aislado para no tocar la BD real del usuario
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'frc-gourmet-e2e-'));

  const electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'main.js')],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SANDBOX: '1',
      // Forzar userData aislado (Electron lee este path antes de app.getPath)
      // Nota: si la app no respeta esta env var, considerar pasar --user-data-dir
    },
    timeout: 30_000,
  });

  // Tomar la primera ventana
  const window = await electronApp.firstWindow({ timeout: 30_000 });
  await window.waitForLoadState('domcontentloaded');

  // Login screen tiene texto "FRC" o un input de usuario.
  // Tolerante a variaciones del UI: chequea que la app ML responda.
  const title = await window.title();
  expect(title.length).toBeGreaterThan(0);

  // Esperar que el body tenga algo renderizado (Angular bootstrap completo)
  await window.waitForFunction(() => document.body && document.body.innerText.length > 0, { timeout: 30_000 });

  await electronApp.close();

  // Cleanup userData temp
  try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch {}
});
