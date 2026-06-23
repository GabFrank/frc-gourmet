/**
 * Canal main → renderer para notificar eventos de impresión.
 *
 * Usado por los hooks auto-imprimir en `ventas.handler.ts` y por
 * `documentos-tickets.handler.ts` para que el frontend pueda mostrar un toast
 * cuando una impresora falla, sin necesidad de polling.
 *
 * **Por qué un canal aparte y no usar el `ImpresionResultado` de los handlers:**
 * los hooks corren con `setImmediate` (fire-and-forget) — el frontend nunca
 * recibe esa respuesta. Para errores generados en background, este canal
 * lleva el aviso al PdV en tiempo real.
 *
 * Convención del payload — alineada con `ImpresionResultado`:
 *
 *   {
 *     level: 'success' | 'warning' | 'error',
 *     handler: 'print-comanda' | 'print-venta-ticket' | ...,
 *     entityRef?: { tipo: 'COMANDA' | 'VENTA' | ...; id: number },
 *     printed?: number,
 *     errors?: { printerId?: number; sectorId?: number | null; message: string }[],
 *     message?: string,  // mensaje resumido user-facing
 *   }
 */

import { BrowserWindow } from 'electron';

export interface PrinterEventPayload {
  level: 'success' | 'warning' | 'error';
  handler: string;
  entityRef?: { tipo: string; id: number };
  printed?: number;
  errors?: { printerId?: number; sectorId?: number | null; message: string }[];
  message?: string;
}

/**
 * Envía el evento a TODOS los renderers abiertos. En modo standalone hay uno
 * solo (la ventana principal). En modo cliente HTTP NO se llama acá — el
 * cliente está en otra máquina, no recibe IPC.
 */
export function broadcastPrinterEvent(payload: PrinterEventPayload): void {
  try {
    const windows = BrowserWindow.getAllWindows();
    for (const w of windows) {
      if (!w.isDestroyed()) {
        w.webContents.send('printer-events', payload);
      }
    }
  } catch (e) {
    // Si algo falla aquí, no hacemos nada — el broadcast es mejor-esfuerzo.
    console.warn('[printer-events] broadcast falló:', e);
  }
}
