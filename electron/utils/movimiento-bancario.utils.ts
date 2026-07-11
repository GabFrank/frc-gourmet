import { DataSource } from 'typeorm';
import {
  MovimientoBancario,
  MovimientoBancarioTipo,
} from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import { setEntityUserTracking } from './entity.utils';

/**
 * Registra un MovimientoBancario en el ledger de la cuenta bancaria.
 *
 * Toda operación que muta `CuentaBancaria.saldo` (pagos, cobros, gastos,
 * depósitos/retiros, sueldos, vales, cheques, acreditaciones, etc.) debe llamar
 * a este helper JUSTO DESPUÉS de guardar la cuenta, dentro de la misma
 * transacción, para dejar rastro en la lista de movimientos del banco. Antes,
 * varios flujos ajustaban el saldo sin registrar el movimiento y el pago no
 * aparecía en el historial (ver banking.handler.ts:create-movimiento-bancario
 * como patrón de referencia).
 *
 * Para movimientos "primarios" usar ENTRADA_MANUAL / SALIDA_MANUAL. Para
 * reversas/anulaciones usar AJUSTE_POSITIVO / AJUSTE_NEGATIVO con una
 * observación que empiece con "ANULACION ..." (contra-movimiento visible, igual
 * que el modelo de Caja Mayor).
 *
 * @param manager   EntityManager de la transacción activa (queryRunner.manager).
 * @param dataSource DataSource, necesario para el user tracking.
 */
export async function registrarMovimientoBancario(
  manager: any,
  dataSource: DataSource,
  params: {
    cuentaBancariaId: number;
    tipo: MovimientoBancarioTipo;
    monto: number;
    observacion?: string;
    numeroComprobante?: string;
    responsable?: any; // Usuario | null | undefined
    fecha?: Date;
  },
): Promise<MovimientoBancario> {
  const mov = manager.create(MovimientoBancario, {
    cuentaBancaria: { id: params.cuentaBancariaId } as any,
    tipoMovimiento: params.tipo,
    monto: params.monto,
    fecha: params.fecha || new Date(),
    observacion: params.observacion ? params.observacion.toUpperCase() : undefined,
    numeroComprobante: params.numeroComprobante
      ? params.numeroComprobante.toUpperCase()
      : undefined,
    responsable: params.responsable || undefined,
  });
  await setEntityUserTracking(dataSource, mov, params.responsable?.id, false);
  return await manager.save(MovimientoBancario, mov);
}
