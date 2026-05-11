import { ipcMain } from 'electron';

/**
 * Registry global de handlers IPC.
 *
 * F3 (modo servidor): cada `ipcMain.handle(channel, fn)` que la app
 * registra al boot también queda copiado en este Map. Cuando Fastify
 * monte el endpoint `POST /api/rpc`, va a buscar `handlerRegistry.get(method)`
 * y delegará al mismo handler. Así un servidor expone via HTTP los mismos
 * 700+ handlers que ya viven en IPC, sin reescribir ninguno.
 *
 * El monkey-patch a `ipcMain.handle` en `installHandlerRegistry()`
 * asegura que cualquier handler nuevo (presente o futuro) se registre
 * automáticamente, sin tener que tocar cada `*.handler.ts`.
 *
 * Idempotente: si se llama dos veces al installHandlerRegistry, solo
 * la primera tiene efecto.
 */
export const handlerRegistry: Map<string, (event: any, ...args: any[]) => any> = new Map();

let installed = false;

export function installHandlerRegistry(): void {
  if (installed) return;
  installed = true;

  const original = ipcMain.handle.bind(ipcMain);
  (ipcMain as any).handle = (
    channel: string,
    listener: (event: any, ...args: any[]) => any,
  ) => {
    handlerRegistry.set(channel, listener);
    return original(channel, listener);
  };

  // Tambien interceptar handleOnce por consistencia (raro pero existe)
  const originalOnce = (ipcMain as any).handleOnce
    ? (ipcMain as any).handleOnce.bind(ipcMain)
    : null;
  if (originalOnce) {
    (ipcMain as any).handleOnce = (
      channel: string,
      listener: (event: any, ...args: any[]) => any,
    ) => {
      handlerRegistry.set(channel, listener);
      return originalOnce(channel, listener);
    };
  }
}

/**
 * Contexto que el RPC HTTP de F3 propaga al handler subyacente. Hoy lleva
 * solo `deviceId` (F5 paso 3) y `userId`, pero queda como punto de extension
 * para campos del JWT que el handler pueda querer leer del request.
 */
export interface HandlerInvocationContext {
  userId?: number | null;
  deviceId?: number | null;
}

/**
 * Invoca un handler registrado vía su channel name. Pensado para que el
 * router HTTP de F3 (`POST /api/rpc`) lo use:
 *
 *   const fn = handlerRegistry.get(req.body.method);
 *   if (!fn) return reply.code(404).send({ error: 'unknown method' });
 *   const result = await fn(fakeEvent, ...req.body.params);
 *   reply.send({ result });
 *
 * Acepta context opcional con `userId` / `deviceId` que el RPC router
 * extrae del JWT y los handlers leen via `current-device.utils.resolveRequestDeviceId`.
 */
export async function invokeHandler(
  channel: string,
  ...args: any[]
): Promise<any> {
  return invokeHandlerWithContext(channel, undefined, ...args);
}

export async function invokeHandlerWithContext(
  channel: string,
  context: HandlerInvocationContext | undefined,
  ...args: any[]
): Promise<any> {
  const fn = handlerRegistry.get(channel);
  if (!fn) {
    throw new Error(`Handler '${channel}' no registrado en handlerRegistry`);
  }
  // El primer arg de ipcMain.handle listeners es el event. Cuando se invoca
  // desde HTTP, no hay event nativo. Pasamos un mock minimo + extras del
  // contexto del request HTTP.
  const fakeEvent: any = { sender: { id: -1 }, _http: true };
  if (context?.userId != null) fakeEvent._httpUserId = context.userId;
  if (context?.deviceId != null) fakeEvent._deviceId = context.deviceId;
  return fn(fakeEvent, ...args);
}

/** Numero de handlers registrados actualmente. Para debug/health endpoint. */
export function handlerRegistryCount(): number {
  return handlerRegistry.size;
}
