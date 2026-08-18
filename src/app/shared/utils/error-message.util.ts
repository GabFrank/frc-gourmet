/**
 * Mensaje legible de un error que vino del backend.
 *
 * Los errores de los handlers llegan con distinto envoltorio según el
 * transporte:
 *  - IPC (Electron): `Error invoking remote method 'createVentaItem': Error: <msg>`
 *  - HTTP (`/api/rpc` en modo cliente / PWA / web `/admin`): el `error` del
 *    body, ya limpio.
 *
 * Sin desenvolverlo, la UI terminaba mostrando un texto genérico ("no se pudo
 * agregar el ítem") y se perdían mensajes accionables del backend como
 * `PERMISO REQUERIDO: ...` o `DEBE CAMBIAR SU CONTRASEÑA ANTES DE CONTINUAR`.
 */
export function mensajeDeError(error: any, fallback: string): string {
  const raw =
    typeof error === 'string' ? error : error?.message || error?.error || '';
  const msg = String(raw)
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .trim();
  return msg || fallback;
}
