/**
 * E2E — chrome de la ventana frameless: botones, zoom, pantalla completa.
 *
 * Levanta Electron de verdad y ejerce los handlers `window:*` desde el
 * renderer. Cubre lo que el unit test (`npm run test:window-chrome`) no puede:
 * que el zoom se aplique realmente al renderer, que se persista en
 * `app-settings.json` y que el modo de controles que reporta `window:chrome`
 * sea coherente con la plataforma donde corre.
 *
 * Antes de correr:
 *   npm run electron:serve-tsc
 *   npm run build:prod
 *
 * Luego: npx playwright test
 */
import { test, expect, _electron as electron } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/** Modo de botones esperado según la plataforma (espejo de resolveControlsMode). */
function modoEsperado(): 'native' | 'none' | 'custom' {
  if (process.platform === 'darwin') return 'none';
  if (process.platform === 'win32') return 'native';
  return 'custom';
}

test('chrome de ventana: modo de controles, zoom persistido y pantalla completa', async () => {
  // userData aislado: el zoom se persiste en app-settings.json y no queremos
  // tocar el del usuario.
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'frc-gourmet-e2e-win-'));

  const electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'main.js'), `--user-data-dir=${tmpUserData}`],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' },
    timeout: 60_000,
  });

  // La PRIMERA ventana es el splash (frameless, sin preload) y se cierra sola
  // al `did-finish-load` de la principal: hay que buscar la que tiene
  // `window.api`, sino el test compite con el cierre del splash.
  let win: Page | null = null;
  const limite = Date.now() + 60_000;
  while (!win && Date.now() < limite) {
    for (const w of electronApp.windows()) {
      try {
        if (await w.evaluate(() => !!(window as any).api?.windowGetChrome)) { win = w; break; }
      } catch { /* ventana cerrándose */ }
    }
    if (!win) await new Promise((r) => setTimeout(r, 500));
  }
  if (!win) throw new Error('no apareció la ventana principal con window.api');
  const page = win;

  // ── Modo de controles ──
  const chrome = await page.evaluate(() => (window as any).api.windowGetChrome());
  expect(chrome.platform).toBe(process.platform);
  expect(chrome.controlsMode).toBe(modoEsperado());
  expect(chrome.overlay).toBe(process.platform === 'win32');
  expect(chrome.toolbarHeight).toBeGreaterThan(0);

  // ── Zoom por pasos ──
  expect(await page.evaluate(() => (window as any).api.windowZoomGet())).toBe(1);
  expect(await page.evaluate(() => (window as any).api.windowZoomStep(1))).toBeCloseTo(1.1, 5);
  expect(await page.evaluate(() => (window as any).api.windowZoomStep(1))).toBeCloseTo(1.25, 5);
  expect(await page.evaluate(() => (window as any).api.windowZoomStep(-1))).toBeCloseTo(1.1, 5);
  expect(await page.evaluate(() => (window as any).api.windowZoomReset())).toBe(1);

  // El zoom se aplica de verdad al renderer, no sólo al número que devuelve.
  await page.evaluate(() => (window as any).api.windowZoomSet(1.5));
  expect(await page.evaluate(() => window.devicePixelRatio)).toBeCloseTo(1.5, 2);

  // ── Persistencia ──
  await page.evaluate(() => (window as any).api.windowZoomSet(1.25));
  const settings = JSON.parse(fs.readFileSync(path.join(tmpUserData, 'app-settings.json'), 'utf-8'));
  expect(settings.ui.zoomFactor).toBeCloseTo(1.25, 5);
  await page.evaluate(() => (window as any).api.windowZoomReset());

  // ── Pantalla completa ──
  expect(await page.evaluate(() => (window as any).api.windowToggleFullscreen())).toBe(true);
  expect(await page.evaluate(() => (window as any).api.windowIsFullscreen())).toBe(true);
  await page.evaluate(() => (window as any).api.windowToggleFullscreen());

  // ── Overlay: sólo Windows lo acepta; en el resto devuelve false sin romper ──
  const overlayOk = await page.evaluate(() =>
    (window as any).api.windowSetTitleBarOverlay({ color: 'rgb(219, 57, 46)', symbolColor: '#ffffff' }),
  );
  expect(overlayOk).toBe(process.platform === 'win32');

  await electronApp.close();
  try { fs.rmSync(tmpUserData, { recursive: true, force: true }); } catch {}
});
