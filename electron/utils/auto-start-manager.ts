/**
 * Gestión de auto-start al login del sistema operativo (FASE 4).
 *
 * Usa app.setLoginItemSettings() de Electron para configurar el arranque automático.
 *
 * ENMIENDA 8: setLoginItemSettings + persistir en app-settings.
 *
 * Limitaciones por plataforma:
 * - Windows: funciona sin restricciones
 * - macOS: requiere firma y notarización para funcionar correctamente en producción
 * - Linux: crea archivo .desktop en ~/.config/autostart/ (depende del DE)
 */
import { app } from 'electron';

/**
 * Configura el auto-start al login del sistema operativo.
 *
 * @param enabled - Si el auto-start debe estar habilitado
 * @param startMinimized - Si la app debe iniciar minimizada (solo tray visible)
 */
export function setAutoStart(enabled: boolean, startMinimized: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: startMinimized, // macOS/Windows: arranca sin mostrar ventana
      // path: app.getPath('exe') — se omite, usa el ejecutable actual por defecto
      // args: [] — sin argumentos adicionales
    });

    console.log(`[auto-start] configurado: enabled=${enabled}, startMinimized=${startMinimized}`);
  } catch (e) {
    console.error('[auto-start] error al configurar:', e);
  }
}

/**
 * Lee el estado actual del auto-start desde el sistema operativo.
 *
 * @returns Estado actual de auto-start
 */
export function getAutoStartStatus(): { enabled: boolean; startMinimized: boolean } {
  try {
    const settings = app.getLoginItemSettings();
    return {
      enabled: settings.openAtLogin,
      startMinimized: settings.openAsHidden ?? false,
    };
  } catch (e) {
    console.error('[auto-start] error al leer estado:', e);
    return { enabled: false, startMinimized: false };
  }
}
