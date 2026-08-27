/**
 * Unit: lógica pura del chrome de ventana (titlebar frameless + zoom).
 *
 * Cubre `electron/utils/window-chrome.utils.ts` sin levantar Electron:
 *  - pasos de zoom (incluye factores "intermedios" que vienen de Ctrl+rueda),
 *  - modo de botones de ventana por plataforma,
 *  - normalización de colores para `setTitleBarOverlay` (el renderer manda
 *    `rgb(...)` de getComputedStyle y Windows sólo acepta `#rrggbb`),
 *  - atajos de teclado que reemplazan al menú nativo ausente.
 *
 * Uso: npm run test:window-chrome
 */
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  nextZoom,
  normalizeOverlayColor,
  resolveControlsMode,
  resolveShortcut,
  soportaTitleBarOverlay,
  zoomPorcentaje,
} from '../electron/utils/window-chrome.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

function key(k: string, mods: Partial<{ control: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) {
  return { key: k, control: !!mods.control, meta: !!mods.meta, shift: !!mods.shift, alt: !!mods.alt };
}

function main() {
  console.log('\n── clampZoom ──\n');
  ok(clampZoom(1) === 1, 'deja pasar 1');
  ok(clampZoom(5) === ZOOM_MAX, 'clampea por arriba');
  ok(clampZoom(0.1) === ZOOM_MIN, 'clampea por abajo');
  ok(clampZoom(NaN) === 1, 'NaN cae al default');
  ok(clampZoom(Infinity) === 1, 'Infinity cae al default');

  console.log('\n── nextZoom ──\n');
  ok(nextZoom(1, 1) === 1.1, 'desde 100% acerca a 110%');
  ok(nextZoom(1, -1) === 0.9, 'desde 100% aleja a 90%');
  ok(nextZoom(ZOOM_MAX, 1) === ZOOM_MAX, 'no pasa del máximo');
  ok(nextZoom(ZOOM_MIN, -1) === ZOOM_MIN, 'no baja del mínimo');
  // Factor intermedio (ej. Ctrl+rueda dejó 1.15): tiene que saltar al paso
  // siguiente en esa dirección, no al más cercano.
  ok(nextZoom(1.15, 1) === 1.25, 'factor intermedio acerca al paso de arriba');
  ok(nextZoom(1.15, -1) === 1.1, 'factor intermedio aleja al paso de abajo');
  // Ida y vuelta: acercar y alejar vuelve al mismo lugar.
  ok(nextZoom(nextZoom(1, 1), -1) === 1, 'acercar + alejar vuelve a 100%');

  console.log('\n── zoomPorcentaje ──\n');
  ok(zoomPorcentaje(1) === 100, '1 → 100');
  ok(zoomPorcentaje(1.25) === 125, '1.25 → 125');
  ok(zoomPorcentaje(0.67) === 67, '0.67 → 67');

  console.log('\n── modo de controles por plataforma ──\n');
  ok(resolveControlsMode('darwin') === 'none', 'macOS: los dibuja el SO (semáforos)');
  ok(resolveControlsMode('win32') === 'native', 'Windows: overlay nativo');
  ok(resolveControlsMode('linux') === 'custom', 'Linux: los dibuja el header');
  ok(soportaTitleBarOverlay('win32') === true, 'overlay soportado en Windows');
  ok(soportaTitleBarOverlay('darwin') === false, 'overlay NO en macOS');
  ok(soportaTitleBarOverlay('linux') === false, 'overlay NO en Linux (Electron 24)');

  console.log('\n── normalizeOverlayColor ──\n');
  ok(normalizeOverlayColor('#db392e') === '#db392e', 'hex largo pasa igual');
  ok(normalizeOverlayColor('#DB392E') === '#db392e', 'hex en mayúsculas se normaliza');
  ok(normalizeOverlayColor('#abc') === '#aabbcc', 'hex corto se expande');
  ok(normalizeOverlayColor('rgb(219, 57, 46)') === '#db392e', 'rgb() → hex');
  ok(normalizeOverlayColor('rgba(219, 57, 46, 0.5)') === '#db392e', 'rgba() descarta alpha');
  ok(normalizeOverlayColor('rgb(255 255 255)') === '#ffffff', 'rgb() con espacios');
  ok(normalizeOverlayColor('#db392eff') === '#db392e', 'hex con alpha descarta alpha');
  ok(normalizeOverlayColor('transparent') === null, 'palabra clave no interpretable → null');
  ok(normalizeOverlayColor('') === null, 'vacío → null');
  ok(normalizeOverlayColor(null) === null, 'null → null');

  console.log('\n── atajos de teclado (Windows/Linux) ──\n');
  ok(resolveShortcut(key('=', { control: true }), 'win32') === 'zoom-in', 'Ctrl+= acerca');
  ok(resolveShortcut(key('+', { control: true, shift: true }), 'win32') === 'zoom-in', 'Ctrl+Shift++ acerca');
  ok(resolveShortcut(key('-', { control: true }), 'win32') === 'zoom-out', 'Ctrl+- aleja');
  ok(resolveShortcut(key('0', { control: true }), 'win32') === 'zoom-reset', 'Ctrl+0 restablece');
  ok(resolveShortcut(key('r', { control: true }), 'win32') === 'reload', 'Ctrl+R recarga');
  ok(resolveShortcut(key('F12'), 'win32') === 'toggle-devtools', 'F12 abre devtools');
  ok(resolveShortcut(key('i', { control: true, shift: true }), 'win32') === 'toggle-devtools', 'Ctrl+Shift+I abre devtools');

  console.log('\n── teclas de la operación diaria que NO se pueden robar ──\n');
  // `before-input-event` + preventDefault mata el keydown antes del DOM: si
  // interceptáramos estas, el PdV y el diálogo de cobro perderían sus atajos.
  ok(resolveShortcut(key('F5'), 'win32') === null, 'F5 queda para imprimir precuenta (PdV)');
  ok(resolveShortcut(key('F11'), 'win32') === null, 'F11 queda para finalizar con ticket (cobro)');
  ok(resolveShortcut(key('F1'), 'win32') === null, 'F1 queda para cobrar (PdV)');
  ok(resolveShortcut(key('F4'), 'win32') === null, 'F4 queda para cancelar venta (PdV)');
  ok(resolveShortcut(key('F10'), 'win32') === null, 'F10 queda para finalizar (cobro)');
  ok(resolveShortcut(key('Escape'), 'win32') === null, 'Escape queda libre');

  console.log('\n── atajos de teclado (macOS usa Cmd) ──\n');
  ok(resolveShortcut(key('=', { meta: true }), 'darwin') === 'zoom-in', 'Cmd+= acerca');
  ok(resolveShortcut(key('=', { control: true }), 'darwin') === null, 'Ctrl+= NO acerca en macOS');
  ok(resolveShortcut(key('0', { meta: true }), 'darwin') === 'zoom-reset', 'Cmd+0 restablece');

  console.log('\n── teclas que NO deben interceptarse ──\n');
  ok(resolveShortcut(key('a'), 'win32') === null, 'letra suelta');
  ok(resolveShortcut(key('0'), 'win32') === null, 'cero sin modificador (se escribe)');
  ok(resolveShortcut(key('-'), 'win32') === null, 'guión sin modificador (se escribe)');
  ok(resolveShortcut(key('r'), 'win32') === null, 'r sin modificador (se escribe)');
  ok(resolveShortcut(key('s', { control: true }), 'win32') === null, 'Ctrl+S queda libre');
  ok(resolveShortcut(key('=', { control: true, alt: true }), 'win32') === null, 'Ctrl+Alt+= no aplica');

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} ok, ${failed} fallidos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
