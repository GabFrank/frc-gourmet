/**
 * Canal de eventos de Mesas y Comandas del PdV.
 *
 * Cuando una mesa o comanda cambia de estado (venta abierta/cerrada, ítems
 * agregados, cobros, etc.), se emite un evento que llega a las terminales PdV
 * sin polling. Dos transportes:
 *
 *  1. **IPC** (`mesa-updates`) → renderers Electron en la misma PC.
 *  2. **EventEmitter** in-process (`mesaEvents`) → lo consume el stream SSE
 *     de Fastify (terminales web / tablets en la red). El handler HTTP se
 *     suscribe con `mesaEvents.on('change', cb)` y reenvía por SSE.
 *
 * Mantener el payload chico: lleva qué cambió + seq, no la mesa/comanda entera.
 * El cliente decide si recargar según el id que muestra.
 */

import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

export type MesaEventTipo = 'MESA_CAMBIO' | 'COMANDA_CAMBIO';

export interface MesaEventPayload {
  tipo: MesaEventTipo;
  mesaId?: number;
  comandaId?: number;
  seq: number;
  updatedAt: string; // ISO timestamp
}

/**
 * Bus in-process. El stream SSE se suscribe acá. Sin límite práctico de
 * listeners (una terminal = un listener); subimos el máximo para no ver el
 * warning de Node con muchas terminales conectadas.
 */
export const mesaEvents = new EventEmitter();
mesaEvents.setMaxListeners(50);

/**
 * Emite el evento a: (a) el bus in-process (SSE), y (b) todos los renderers
 * Electron abiertos. Mejor-esfuerzo: si un transporte falla, no rompe el flujo.
 */
export function broadcastMesaEvent(payload: MesaEventPayload): void {
  try {
    mesaEvents.emit('change', payload);
  } catch (e) {
    console.warn('[mesa-events] emit interno falló:', e);
  }
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('mesa-updates', payload);
      }
    }
  } catch (e) {
    console.warn('[mesa-events] broadcast IPC falló:', e);
  }
}
