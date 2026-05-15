/**
 * F5 paso 3 — Device tracking del request en curso.
 *
 * Source pyramid del `dispositivo_id` para los handlers de creacion
 * (createVenta, createCompra, create-conteo, createComanda):
 *
 *   1. Si el handler corre via HTTP (`event._http === true`) y el JWT
 *      trajo un device_id → usar ese (`event._deviceId`).
 *   2. Si no, fallback al device "configurado localmente" en este proceso
 *      (modo standalone/server, donde la app misma identifica el PC).
 *   3. Si ninguno → `null` (la columna es nullable).
 *
 * El device local se setea al boot leyendo `AppSettings.deviceId` (si
 * existe). El cliente HTTP setea el suyo via login (la wizard de F4.2 o
 * mecanismo de selección de dispositivo).
 */

let _currentDevice: { id: number } | null = null;

export function getCurrentDevice(): { id: number } | null {
  return _currentDevice;
}

export function setCurrentDevice(d: { id: number } | null): void {
  _currentDevice = d;
}

/**
 * Resuelve el dispositivo_id del request actual segun la pyramid arriba.
 * Llamado por los create handlers para poblar la columna.
 */
export function resolveRequestDeviceId(event: any): number | null {
  if (event?._http === true && typeof event._deviceId === 'number') {
    return event._deviceId;
  }
  const local = getCurrentDevice();
  return local?.id ?? null;
}
