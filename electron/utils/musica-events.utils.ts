/**
 * Canal de eventos del módulo de Música — mismo patrón que `comanda-events`.
 *
 * Lo consumen dos transportes:
 *  1. **IPC** → la pestaña Música del desktop, en la misma PC.
 *  2. **EventEmitter in-process** → el stream SSE de Fastify, que alimenta el
 *     control en la PWA.
 *
 * El payload va chico a propósito: avisa QUÉ cambió, no el estado completo. El
 * cliente decide si recarga. Un stream que empuja objetos grandes cada vez que
 * avanza un tema es tráfico y batería tirados en un celular.
 */
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

export type MusicaEventTipo =
  /** Cambió el tema que suena. */
  | 'TRACK'
  /** Entró un bloque horario nuevo. */
  | 'BLOQUE'
  /** Cambió la variante de energía (suave/normal/movido). */
  | 'VARIANTE'
  /** Entró o salió del modo manual. */
  | 'MODO'
  /** Algo falla: device caído, sin plan, error de API. */
  | 'ALERTA';

export interface MusicaEventPayload {
  tipo: MusicaEventTipo;
  /** Texto corto para mostrar sin pedir nada más. */
  detalle?: string;
  bloqueId?: number | null;
  variante?: string;
}

export const musicaEvents = new EventEmitter();
// Varias pantallas (desktop + celulares) escuchan a la vez; el default de 10
// listeners dispara warnings falsos en un local con varios mozos mirando.
musicaEvents.setMaxListeners(50);

export function emitirEventoMusica(payload: MusicaEventPayload): void {
  try {
    musicaEvents.emit('change', payload);
  } catch {
    /* un listener roto no debe cortar el runtime */
  }
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('musica-events', payload);
    }
  } catch {
    /* ventana cerrándose */
  }
}
