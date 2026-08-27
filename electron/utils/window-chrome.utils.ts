/**
 * Lógica pura del "chrome" de la ventana (titlebar custom + zoom).
 *
 * Vive separada de `main.ts` para poder testearla sin levantar Electron
 * (`npm run test:window-chrome`). Acá NO se importa `electron`.
 *
 * Contexto: la app corre frameless en Windows/Linux (ver `createWindow` en
 * `main.ts`). Eso deja al usuario sin el menú nativo de Electron — que es el
 * que trae Zoom +/-, Recargar y DevTools — y sin botones de ventana. La
 * solución es:
 *  - Windows: `titleBarStyle:'hidden'` + `titleBarOverlay` → Windows dibuja
 *    SUS botones nativos (minimizar/maximizar/cerrar) sobre nuestra toolbar.
 *  - macOS: `titleBarStyle:'hiddenInset'` → semáforos nativos.
 *  - Linux: frameless puro; ahí sí hacen falta botones custom en el header.
 * y exponer zoom/recargar/devtools por IPC + atajos de teclado.
 */

/** Pasos de zoom disponibles (factor de `webContents.setZoomFactor`). */
export const ZOOM_STEPS: readonly number[] = [
  0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2,
];

export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
export const ZOOM_DEFAULT = 1;

/** Tolerancia para comparar factores de zoom (floats). */
const EPS = 1e-4;

/**
 * Modo de los botones de ventana:
 *  - `native`: los dibuja el SO sobre nuestra toolbar (Windows, overlay).
 *  - `none`:   los dibuja el SO en su lugar habitual (macOS, semáforos).
 *  - `custom`: no hay nativos; el header debe renderizar los suyos (Linux).
 */
export type WindowControlsMode = 'native' | 'none' | 'custom';

/** Devuelve un factor de zoom válido (clampeado al rango soportado). */
export function clampZoom(factor: number): number {
  if (!Number.isFinite(factor)) return ZOOM_DEFAULT;
  if (factor < ZOOM_MIN) return ZOOM_MIN;
  if (factor > ZOOM_MAX) return ZOOM_MAX;
  return factor;
}

/**
 * Siguiente paso de zoom en la dirección pedida. Si el factor actual está
 * entre dos pasos (ej. venía de un Ctrl+rueda), salta al paso que corresponda
 * en esa dirección, no al "más cercano".
 */
export function nextZoom(current: number, direction: 1 | -1): number {
  const from = clampZoom(current);
  if (direction === 1) {
    const up = ZOOM_STEPS.find((s) => s > from + EPS);
    return up !== undefined ? up : ZOOM_MAX;
  }
  const down = [...ZOOM_STEPS].reverse().find((s) => s < from - EPS);
  return down !== undefined ? down : ZOOM_MIN;
}

/** Porcentaje entero para mostrar en la UI (1.25 → 125). */
export function zoomPorcentaje(factor: number): number {
  return Math.round(clampZoom(factor) * 100);
}

/** Qué botones de ventana corresponden según la plataforma. */
export function resolveControlsMode(platform: string): WindowControlsMode {
  if (platform === 'darwin') return 'none';
  if (platform === 'win32') return 'native';
  return 'custom';
}

/** true si la plataforma soporta el Window Controls Overlay que usamos. */
export function soportaTitleBarOverlay(platform: string): boolean {
  return platform === 'win32';
}

function hex2(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, '0');
}

/**
 * Normaliza un color CSS a `#rrggbb`, que es lo único que acepta
 * `setTitleBarOverlay`. El renderer manda lo que le devuelve
 * `getComputedStyle` (`rgb(...)` / `rgba(...)`), así que hay que convertir.
 * Devuelve null si no se puede interpretar (el llamador ignora el cambio).
 */
export function normalizeOverlayColor(input?: string | null): string | null {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(raw);
  if (hex) {
    const d = hex[1];
    if (d.length === 3 || d.length === 4) {
      return `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`;
    }
    if (d.length === 6 || d.length === 8) return `#${d.slice(0, 6)}`;
    return null;
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*[\d.%]+\s*)?\)$/.exec(raw);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  }

  return null;
}

/** Acción de ventana derivada de una combinación de teclas. */
export type WindowShortcutAction =
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'reload'
  | 'toggle-devtools'
  | 'toggle-fullscreen';

export interface ShortcutInput {
  /** Valor de `input.key` de Electron (`before-input-event`). */
  key: string;
  control: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * Traduce una tecla a la acción de ventana correspondiente, o null si la
 * combinación no nos interesa. Reemplaza a los accelerators del menú nativo
 * (que en una ventana frameless no existe).
 *
 * En macOS el modificador es Cmd; en Windows/Linux, Ctrl.
 */
export function resolveShortcut(input: ShortcutInput, platform: string): WindowShortcutAction | null {
  const mod = platform === 'darwin' ? input.meta : input.control;
  const key = (input.key || '').toLowerCase();

  // Teclas de función: sin modificadores.
  if (!input.control && !input.meta && !input.alt) {
    if (key === 'f5' && !input.shift) return 'reload';
    if (key === 'f12' && !input.shift) return 'toggle-devtools';
    if (key === 'f11' && !input.shift) return 'toggle-fullscreen';
  }

  if (!mod) return null;

  if (input.shift) {
    // Ctrl/Cmd+Shift+I → DevTools. Ctrl/Cmd+Shift++ es zoom-in en teclados
    // donde el '+' exige Shift.
    if (key === 'i') return 'toggle-devtools';
    if (key === '+' || key === '=') return 'zoom-in';
    return null;
  }

  if (input.alt) return null;

  if (key === '+' || key === '=') return 'zoom-in';
  if (key === '-' || key === '_') return 'zoom-out';
  if (key === '0') return 'zoom-reset';
  if (key === 'r') return 'reload';
  return null;
}
