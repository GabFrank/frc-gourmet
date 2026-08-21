/**
 * Guardas de anulacion cruzada del pago consolidado.
 *
 * Una obligacion saldada por un pago consolidado NO se puede revertir desde su
 * modulo de origen: la reversa tiene que deshacer el evento entero (todos los
 * movimientos, todas las obligaciones que salda). Si se permitiera anular por un
 * lado y por el otro, la misma plata volveria dos veces — o, peor en el caso del
 * vale, el modulo de origen lo marcaria ANULADO sin revertir un guarani, porque
 * `vale.movimientoId` queda en null cuando el pago fue consolidado.
 *
 * Estas guardas van como PRIMERA sentencia del handler correspondiente.
 */
import { PagoConsolidadoDetalle } from '../../src/app/database/entities/financiero/pago-consolidado-detalle.entity';
import { PagoOrigenTipo } from '../../src/app/database/entities/financiero/pago-consolidado-enums';

/**
 * Id del pago consolidado ACTIVO que salda esta obligacion, o null si ninguno.
 * Acepta un DataSource o un EntityManager de transaccion.
 */
export async function getPagoConsolidadoActivo(
  managerOrDs: any,
  origenTipo: PagoOrigenTipo,
  origenId: number,
): Promise<number | null> {
  const repo = managerOrDs.getRepository(PagoConsolidadoDetalle);
  const det = await repo.findOne({
    where: { origenTipo, origenId, anulado: false },
    order: { id: 'DESC' as any },
  });
  return det ? det.pagoConsolidadoId : null;
}

/** Lanza si la obligacion fue saldada por un pago consolidado todavia activo. */
export async function bloquearSiPagoConsolidado(
  managerOrDs: any,
  origenTipo: PagoOrigenTipo,
  origenId: number,
  queEs: string,
): Promise<void> {
  const pagoId = await getPagoConsolidadoActivo(managerOrDs, origenTipo, origenId);
  if (pagoId != null) {
    throw new Error(
      `${queEs} fue pagado dentro del pago consolidado #${pagoId}. ` +
      `Anulá ese pago desde Caja Mayor: la reversa tiene que deshacer todas las obligaciones que cubre.`,
    );
  }
}
