/**
 * Gestión del Tray Icon (bandeja del sistema).
 *
 * El tray permite que la app permanezca en segundo plano cuando se cierra la ventana
 * en mode=server, manteniendo el servidor Fastify activo para las cajas/PWA/clientes.
 *
 * Opción A: tray SOLO en mode=server. Client/standalone mantienen comportamiento legacy.
 */
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { AppMode } from './app-settings.utils';

let trayInstance: Tray | null = null;

/**
 * Resuelve el path del ícono para el tray según la plataforma.
 *
 * Orden de búsqueda:
 * 1. Iconos optimizados en build/tray/ (FASE 6)
 * 2. Icono de ventana en build/ (fallback actual)
 * 3. Logo de assets (último fallback)
 *
 * Requisitos por plataforma:
 * - Windows: .ico multi-size (16x16, 32x32 mínimo)
 * - macOS: PNG monocromático "iconTemplate.png" (sistema lo tiñe automáticamente)
 * - Linux: PNG 22x22 o 24x24
 */
function resolveTrayIconPath(): string | undefined {
  const platform = process.platform;

  // FASE 6: iconos optimizados en build/tray/
  const trayDir = path.join(__dirname, '..', '..', 'build', 'tray');
  if (fs.existsSync(trayDir)) {
    const trayIcon =
      platform === 'darwin'
        ? path.join(trayDir, 'iconTemplate.png')
        : platform === 'win32'
          ? path.join(trayDir, 'icon.ico')
          : path.join(trayDir, 'icon.png');
    if (fs.existsSync(trayIcon)) return trayIcon;
  }

  // Fallback: ícono de ventana en build/
  const buildDir = path.join(__dirname, '..', '..', 'build');
  const windowIconCandidates =
    platform === 'darwin'
      ? [path.join(buildDir, 'icon.icns'), path.join(buildDir, 'icons', '512x512.png')]
      : [path.join(buildDir, 'icons', '512x512.png'), path.join(buildDir, 'icon.png')];

  for (const candidate of windowIconCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Último fallback: logo de assets (solo en dev, no en build empaquetado)
  const assetsLogo = path.join(__dirname, '..', '..', 'src', 'assets', 'images', 'logo', 'logo-light-sm.png');
  if (fs.existsSync(assetsLogo)) return assetsLogo;

  console.warn('[tray] No se encontró ningún ícono para el tray');
  return undefined;
}

/**
 * Crea el tray icon con menú básico.
 *
 * Menú inicial (FASE 1):
 * - Mostrar: restaura la ventana oculta
 * - Salir: termina la app (sin confirmación aún — FASE 3 agregará confirmación)
 *
 * @param mode - Modo de operación (solo se llama si mode === 'server')
 * @param win - BrowserWindow para restaurar al hacer "Mostrar"
 * @param onQuitRequested - Callback para solicitar cierre completo (FASE 3)
 */
export function createTray(
  mode: AppMode,
  win: BrowserWindow | null,
  onQuitRequested: () => void,
): Tray | null {
  if (trayInstance) {
    console.warn('[tray] Ya existe una instancia del tray');
    return trayInstance;
  }

  const iconPath = resolveTrayIconPath();
  if (!iconPath) {
    console.error('[tray] No se pudo crear el tray: no hay ícono disponible');
    return null;
  }

  try {
    // En macOS, nativeImage.createFromPath maneja automáticamente @2x (retina)
    const icon = nativeImage.createFromPath(iconPath);

    // En macOS, resize del ícono para que quepa en la barra (22x22)
    if (process.platform === 'darwin') {
      icon.resize({ width: 22, height: 22 });
    }

    trayInstance = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mostrar',
        click: () => {
          if (win && !win.isDestroyed()) {
            win.show();
            win.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          // FASE 3 agregará confirmación antes de quit
          onQuitRequested();
        },
      },
    ]);

    trayInstance.setToolTip('FRC Gourmet (Servidor activo)');
    trayInstance.setContextMenu(contextMenu);

    // Doble-click en Windows: mostrar ventana
    if (process.platform === 'win32') {
      trayInstance.on('double-click', () => {
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
        }
      });
    }

    console.log(`[tray] Tray icon creado (mode=${mode}, platform=${process.platform})`);
    return trayInstance;
  } catch (e) {
    console.error('[tray] Error al crear tray icon:', e);
    return null;
  }
}

/**
 * Actualiza el menú del tray (usado en fases posteriores para agregar "Reiniciar", etc.)
 */
export function updateTrayMenu(
  win: BrowserWindow | null,
  onRestartRequested: () => void,
  onQuitRequested: () => void,
): void {
  if (!trayInstance) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar',
      click: () => {
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Reiniciar',
      click: () => {
        onRestartRequested();
      },
    },
    {
      label: 'Salir',
      click: () => {
        onQuitRequested();
      },
    },
  ]);

  trayInstance.setContextMenu(contextMenu);
}

/**
 * Destruye el tray icon (llamado al terminar la app).
 */
export function destroyTray(): void {
  if (trayInstance && !trayInstance.isDestroyed()) {
    trayInstance.destroy();
    console.log('[tray] Tray icon destruido');
  }
  trayInstance = null;
}

/**
 * Devuelve true si el tray está activo.
 */
export function isTrayActive(): boolean {
  return trayInstance !== null && !trayInstance.isDestroyed();
}
