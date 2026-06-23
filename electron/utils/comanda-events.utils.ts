/**
 * Canal de eventos del KDS (Kitchen Display System).
 *
 * Cuando un `ComandaItem` se crea o cambia de estado, se emite un evento que
 * llega a las pantallas KDS sin polling. Dos transportes:
 *
 *  1. **IPC** (`comanda-item-updates`) → renderers Electron en la misma PC
 *     (KDS como ventana/ruta local). Mismo patrón que `printer-events`.
 *  2. **EventEmitter** in-process (`comandaEvents`) → lo consume el stream SSE
 *     de Fastify (KDS Fase 3, pantallas web en la red / Google TV). El handler
 *     HTTP se suscribe con `comandaEvents.on('change', cb)` y reenvía por SSE.
 *
 * Mantener el payload chico: lleva qué cambió + el sector, no la comanda entera.
 * La pantalla decide si recargar según el/los sector(es) que muestra.
 */

import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

export type ComandaEventTipo = 'CREADO' | 'ESTADO' | 'CANCELADO';

export interface ComandaEventPayload {
  tipo: ComandaEventTipo;
  comandaItemId: number;
  ventaId: number;
  sectorId: number | null;
  estado: string;
}

/**
 * Bus in-process. El stream SSE (Fase 3) se suscribe acá. Sin límite práctico
 * de listeners (una pantalla = un listener); subimos el máximo para no ver el
 * warning de Node con varias pantallas conectadas.
 */
export const comandaEvents = new EventEmitter();
comandaEvents.setMaxListeners(50);

/**
 * Emite el evento a: (a) el bus in-process (SSE), y (b) todos los renderers
 * Electron abiertos. Mejor-esfuerzo: si un transporte falla, no rompe el flujo.
 */
export function broadcastComandaEvent(payload: ComandaEventPayload): void {
  try {
    comandaEvents.emit('change', payload);
  } catch (e) {
    console.warn('[comanda-events] emit interno falló:', e);
  }
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('comanda-item-updates', payload);
      }
    }
  } catch (e) {
    console.warn('[comanda-events] broadcast IPC falló:', e);
  }
}
