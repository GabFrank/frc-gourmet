import { mensajeDeError } from './error-message.util';

/**
 * Códigos de error del invariante de caja y su traducción al español.
 *
 * **Fuente única del desktop y de la PWA.** El backend
 * (`electron/utils/caja-abierta.utils.ts`) manda el código como **prefijo del
 * `message`** y no como `err.code`, porque es lo único que sobrevive a los tres
 * transportes:
 *
 *  - IPC local: `Error invoking remote method 'createVenta': Error: CAJA_CERRADA: …`
 *  - `/api/rpc`: `500 { error: "CAJA_CERRADA: …" }`
 *  - modo cliente: `new Error('HTTP 500: {"error":"CAJA_CERRADA: …"}')`
 *
 * Por eso se detecta con `includes(...)` sobre el mensaje y **no** se muestra
 * crudo: en modo cliente el usuario vería el JSON del 500.
 */

export const CODIGO_CAJA_CERRADA = 'CAJA_CERRADA';
export const CODIGO_CAJA_ABIERTA_DUPLICADA = 'CAJA_ABIERTA_DUPLICADA';

/**
 * Estados de caja, como strings.
 *
 * No se importa el enum `CajaEstado` de la entidad a propósito: este util es
 * la fuente única del desktop **y de la PWA** (que consume `@frc/shared-core`),
 * y la entidad arrastra los decoradores de TypeORM.
 */
const ESTADO_CAJA_ABIERTO = 'ABIERTO';
const ESTADO_CAJA_CANCELADO = 'CANCELADO';

/**
 * ¿Una caja en este estado NO admite operaciones?
 *
 * El backend rechaza **todo lo que no sea `ABIERTO`** (`assertCajaAbierta`
 * compara `!== ABIERTO`), así que el front tiene que usar el mismo criterio:
 * comparar contra `CERRADO` dejaba `CANCELADO` en tierra de nadie — el botón
 * habilitado y el rechazo recién al confirmar.
 *
 * Con el estado ausente o vacío devuelve `false`: no se sabe, y no se bloquea
 * por un dato que no llegó (el guard del backend tiene la última palabra).
 */
export function esEstadoCajaNoOperable(estado: unknown): boolean {
  const texto = String(estado ?? '').trim().toUpperCase();
  return !!texto && texto !== ESTADO_CAJA_ABIERTO;
}

/** ¿El estado es exactamente `CANCELADO`? (para no decir "ya fue cerrada"). */
export function esEstadoCajaCancelada(estado: unknown): boolean {
  return String(estado ?? '').trim().toUpperCase() === ESTADO_CAJA_CANCELADO;
}

function textoDe(error: unknown): string {
  return mensajeDeError(error, '');
}

/** El backend rechazó la operación porque la caja ya no está abierta. */
export function esCajaCerrada(error: unknown): boolean {
  return textoDe(error).includes(CODIGO_CAJA_CERRADA);
}

/** Esta terminal ya tiene una caja abierta (índice único / guard de apertura). */
export function esCajaAbiertaDuplicada(error: unknown): boolean {
  return textoDe(error).includes(CODIGO_CAJA_ABIERTA_DUPLICADA);
}

/**
 * Mensaje listo para mostrar. Traduce los dos códigos de caja y, para
 * cualquier otro error, devuelve lo que ya devolvía `mensajeDeError`.
 *
 * `estadoCaja` es opcional: el código `CAJA_CERRADA` cubre todo estado distinto
 * de `ABIERTO`, así que cuando el llamador tiene el estado a mano se lo pasa y
 * una caja `CANCELADO` deja de leerse como "ya fue cerrada" (que es falso y
 * manda a buscar un cierre que nunca existió). Sin el estado, el texto queda
 * como estaba.
 */
export function mensajeDeErrorCaja(error: unknown, fallback: string, estadoCaja?: unknown): string {
  if (esCajaCerrada(error)) {
    if (esEstadoCajaCancelada(estadoCaja)) {
      return 'Esta caja fue cancelada: no se pueden registrar operaciones en ella. '
        + 'Elegí una caja abierta o abrí una nueva.';
    }
    return 'Esta caja ya fue cerrada: no se pueden registrar más operaciones en ella. '
      + 'Elegí una caja abierta o abrí una nueva.';
  }
  if (esCajaAbiertaDuplicada(error)) {
    return 'Ya hay una caja abierta en esta terminal. Cerrá esa caja antes de abrir otra.';
  }
  return mensajeDeError(error, fallback);
}
