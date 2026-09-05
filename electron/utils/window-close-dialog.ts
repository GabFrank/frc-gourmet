/**
 * Diálogo de cierre de ventana (FASE 3).
 *
 * Muestra un diálogo nativo (dialog.showMessageBox) con 3 opciones:
 * - Minimizar a bandeja (default)
 * - Reiniciar
 * - Cerrar completamente
 *
 * Checkbox "No volver a preguntar" para persistir la preferencia.
 *
 * ENMIENDA 6: usa dialog.showMessageBox (nativo Electron), NO MatDialog.
 */
import { dialog, BrowserWindow } from 'electron';
import type { AppMode } from './app-settings.utils';

export type CloseAction = 'minimize' | 'restart' | 'close';

export interface CloseDialogResult {
  action: CloseAction;
  dontAskAgain: boolean;
}

/**
 * Muestra el diálogo de cierre con 3 opciones.
 *
 * UX: Botones ordenados de izquierda a derecha por peligrosidad:
 * - Cerrar completamente (peligroso, desconecta todo)
 * - Reiniciar (medio, reconecta rápido)
 * - Minimizar a bandeja (seguro, default/Escape)
 *
 * @param win - BrowserWindow para el diálogo modal
 * @param mode - Modo de operación (afecta el mensaje de advertencia)
 * @returns Promesa con la acción elegida y si marcó "no preguntar"
 */
export async function showCloseDialog(
  win: BrowserWindow | null,
  mode: AppMode,
): Promise<CloseDialogResult> {
  const isServer = mode === 'server';

  // Mensaje diferenciado por modo (ENMIENDA 4 - Opción A)
  const detail = isServer
    ? 'En modo servidor, minimizar mantiene el servidor activo para las cajas, PWA y dispositivos móviles conectados.\n\nCerrar completamente desconectará todas las terminales.'
    : 'Puedes minimizar la aplicación a la bandeja del sistema o cerrarla completamente.';

  const result = await dialog.showMessageBox(win || undefined!, {
    type: 'question',
    title: 'Cerrar FRC Gourmet',
    message: '¿Qué deseas hacer?',
    detail,
    // UX: orden de botones por peligrosidad (izq → der: peligroso → seguro)
    buttons: ['Cerrar completamente', 'Reiniciar', 'Minimizar a bandeja'],
    defaultId: 2, // Default = Minimizar (botón derecho, acción segura)
    cancelId: 2,  // Escape = Minimizar (acción segura)
    checkboxLabel: 'No volver a preguntar',
    checkboxChecked: false,
    noLink: true,
  });

  // Mapeo de índice de botón → acción
  const actions: CloseAction[] = ['close', 'restart', 'minimize'];
  const action = actions[result.response];

  return {
    action,
    dontAskAgain: result.checkboxChecked,
  };
}

/**
 * Confirmación extra antes de cerrar completamente en mode=server.
 *
 * Solo se muestra si el usuario eligió "Cerrar completamente" en el diálogo principal.
 *
 * @param win - BrowserWindow para el diálogo modal
 * @returns true si confirma el cierre, false si cancela
 */
export async function showFinalConfirmation(
  win: BrowserWindow | null,
): Promise<boolean> {
  const result = await dialog.showMessageBox(win || undefined!, {
    type: 'warning',
    title: 'Confirmar cierre del servidor',
    message: '¿Estás seguro de cerrar el servidor completamente?',
    detail:
      'Se desconectarán todas las cajas, dispositivos móviles, PWA y clientes remotos conectados.\n\n' +
      'El servidor dejará de estar disponible hasta que lo inicies de nuevo.',
    buttons: ['Cancelar', 'Cerrar servidor'],
    defaultId: 0, // Default = Cancelar (seguro)
    cancelId: 0,
    noLink: true,
  });

  return result.response === 1; // true si eligió "Cerrar servidor"
}

/**
 * Prompt de auto-start en el primer arranque (mode=server).
 *
 * Pregunta al usuario si quiere que FRC Gourmet arranque automáticamente
 * al iniciar el sistema operativo.
 *
 * @param win - BrowserWindow para el diálogo modal
 * @returns true si elige Sí (auto-start), false si elige No
 */
export async function showAutoStartPrompt(
  win: BrowserWindow | null,
): Promise<boolean> {
  const result = await dialog.showMessageBox(win || undefined!, {
    type: 'question',
    title: 'FRC Gourmet — Inicio Automático',
    message: '¿Abrir FRC Gourmet al iniciar la PC?',
    detail:
      'En modo servidor, esto mantiene el backend siempre disponible para las cajas, dispositivos móviles y PWA conectados.\n\n' +
      'Puedes cambiar esta configuración más adelante editando app-settings.json.',
    // UX: No a la izquierda (default seguro), Sí a la derecha (preferido para server)
    buttons: ['No', 'Sí, iniciar con el sistema'],
    defaultId: 1, // Default = Sí (server debería estar siempre arriba)
    cancelId: 0,  // Escape = No (no forzar auto-start)
    noLink: true,
  });

  return result.response === 1; // true si eligió "Sí"
}
