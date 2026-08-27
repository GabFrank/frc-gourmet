import { DataSource } from 'typeorm';
import { Caja } from '../../src/app/database/entities/financiero/caja.entity';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { resolveRequestDeviceId } from './current-device.utils';

/**
 * Gate de "terminal ajena": quién puede operar sobre una caja abierta en OTRA
 * terminal.
 *
 * Una caja se abre en un dispositivo (`Caja.dispositivo`) y cualquier otro puede
 * unirse a ella para lanzar ítems. Hasta 2026-08 el cobro estaba reservado sin
 * excepción a la terminal dueña; hoy lo deciden dos flags de `PdvConfig`, y son
 * dos porque son dos actos distintos:
 *
 *  - `PAGO`      → registrar líneas de cobro (crear el `Pago`, agregar
 *                  `PagoDetalle`, ajustes de descuento/aumento).
 *  - `FINALIZAR` → concluir la venta (pasarla a CONCLUIDA, por cualquier vía).
 *
 * ⚠️ **Esto NO es una frontera de seguridad.** La frontera real es
 * `ensurePermission`, que ya está en todos los handlers involucrados; `/api/rpc`
 * es default-allow para cualquier cliente con un JWT válido, y los gates de acá
 * se disparan sólo cuando el llamador manda el flag correspondiente. Es un
 * candado operativo — evita que el cajero cobre sin querer desde la terminal
 * equivocada —, no un control de acceso.
 *
 * ⚠️ **Limitación conocida del device en modo HTTP.** `resolveRequestDeviceId`
 * cae al dispositivo local del proceso servidor cuando el request llega por
 * HTTP sin `device_id` en el JWT (el modo cliente sí lo manda; la PWA móvil y
 * el login web no). O sea: una sesión web contra un nodo servidor se ve como
 * "la terminal del servidor". Se deja así a propósito — resolverlo a `null`
 * aflojaría el gate en vez de apretarlo, porque un device indeterminado no
 * bloquea (ver abajo).
 */

export type AccionTerminal = 'PAGO' | 'FINALIZAR';

export interface EstadoTerminalCaja {
  cajaId: number | null;
  dispositivoCajaId: number | null;
  deviceActual: number | null;
  /** true también cuando no se puede determinar lo contrario (ver nota abajo). */
  esTerminalDeLaCaja: boolean;
  permitePagos: boolean;
  permiteFinalizar: boolean;
}

/** Mensajes de error. Se conserva el string histórico del gate de cobro. */
export const ERROR_PAGO_TERMINAL_AJENA = 'COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO';
export const ERROR_FINALIZAR_TERMINAL_AJENA = 'FINALIZACION_NO_PERMITIDA_EN_ESTE_DISPOSITIVO';

/**
 * Evalúa qué puede hacer el request en curso sobre `cajaId`.
 *
 * Se considera terminal dueña —y por lo tanto no se bloquea nada— cuando NO se
 * puede determinar positivamente lo contrario: si el dispositivo del request no
 * se resuelve, o si la caja no tiene dispositivo asignado. Es la regla que ya
 * tenía `createPago` y existe para no romper el cobro en instalaciones de un
 * solo equipo, donde nadie configuró un `deviceId`.
 */
export async function evaluarTerminalCaja(
  dataSource: DataSource,
  event: any,
  cajaId: number | null | undefined,
): Promise<EstadoTerminalCaja> {
  const idCaja = Number(cajaId) || null;
  const deviceActual = resolveRequestDeviceId(event);

  let dispositivoCajaId: number | null = null;
  if (idCaja) {
    const caja = await dataSource.getRepository(Caja).findOne({
      where: { id: idCaja },
      relations: ['dispositivo'],
    });
    dispositivoCajaId = (caja?.dispositivo as any)?.id ?? null;
  }

  const esTerminalDeLaCaja =
    deviceActual == null || dispositivoCajaId == null || deviceActual === dispositivoCajaId;

  if (esTerminalDeLaCaja) {
    return {
      cajaId: idCaja,
      dispositivoCajaId,
      deviceActual,
      esTerminalDeLaCaja: true,
      permitePagos: true,
      permiteFinalizar: true,
    };
  }

  // Sin fila de config (base donde nadie abrió la configuración del PdV) los dos
  // flags valen false: la conducta previa a esta feature.
  const cfg = await dataSource.getRepository(PdvConfig).findOne({ where: {} });

  return {
    cajaId: idCaja,
    dispositivoCajaId,
    deviceActual,
    esTerminalDeLaCaja: false,
    permitePagos: cfg?.permitirPagosTerminalAjena === true,
    permiteFinalizar: cfg?.permitirFinalizarTerminalAjena === true,
  };
}

/** Lanza si el request no puede ejecutar `accion` sobre esa caja. */
export async function assertTerminalPuedeOperar(
  dataSource: DataSource,
  event: any,
  cajaId: number | null | undefined,
  accion: AccionTerminal,
): Promise<EstadoTerminalCaja> {
  const estado = await evaluarTerminalCaja(dataSource, event, cajaId);
  if (accion === 'PAGO' && !estado.permitePagos) {
    throw new Error(ERROR_PAGO_TERMINAL_AJENA);
  }
  if (accion === 'FINALIZAR' && !estado.permiteFinalizar) {
    throw new Error(ERROR_FINALIZAR_TERMINAL_AJENA);
  }
  return estado;
}
