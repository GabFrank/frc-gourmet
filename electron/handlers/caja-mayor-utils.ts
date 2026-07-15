import { CajaMayorSaldo } from '../../src/app/database/entities/financiero/caja-mayor-saldo.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';

// Determina si un tipo de movimiento incrementa el saldo (ingreso) o lo reduce (egreso)
export function esIngreso(tipo: TipoMovimiento): boolean {
  return [
    TipoMovimiento.INGRESO_RETIRO_CAJA,
    TipoMovimiento.INGRESO_CIERRE_CAJA,
    TipoMovimiento.INGRESO_ENTRADA_VARIA,
    TipoMovimiento.INGRESO_OPERACION_FINANCIERA,
    TipoMovimiento.INGRESO_RETIRO_BANCO,
    TipoMovimiento.INGRESO_COBRO_CLIENTE,
    TipoMovimiento.INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO,
    TipoMovimiento.TRANSFERENCIA_ENTRADA,
    TipoMovimiento.AJUSTE_POSITIVO,
  ].includes(tipo);
}

// Actualiza atomicamente el saldo de una caja mayor (moneda + formaPago) dentro de una transaccion.
// Crea el registro CajaMayorSaldo si no existe.
export async function actualizarSaldoCajaMayor(
  queryRunner: any,
  cajaMayorId: number,
  monedaId: number,
  formaPagoId: number,
  monto: number,
  tipo: TipoMovimiento,
): Promise<void> {
  const delta = esIngreso(tipo) ? monto : -monto;

  // M-02: bajo concurrencia (modo server/Postgres) dos transacciones podían leer
  // el mismo saldo y pisarse (lost update). Se toma un lock pesimista de la fila
  // de saldo para serializar el read-modify-write. Solo en Postgres y dentro de
  // una transacción; en SQLite las escrituras ya se serializan por conexión y el
  // driver no soporta SELECT ... FOR UPDATE. Query sin joins => FOR UPDATE limpio.
  const isPg = queryRunner.connection?.options?.type === 'postgres';
  const useLock = isPg && queryRunner.isTransactionActive;

  let saldo: CajaMayorSaldo | null;
  if (useLock) {
    saldo = await queryRunner.manager
      .createQueryBuilder(CajaMayorSaldo, 's')
      .setLock('pessimistic_write')
      .where('s.caja_mayor_id = :c AND s.moneda_id = :m AND s.forma_pago_id = :f', {
        c: cajaMayorId,
        m: monedaId,
        f: formaPagoId,
      })
      .getOne();
  } else {
    saldo = await queryRunner.manager.findOne(CajaMayorSaldo, {
      where: {
        cajaMayor: { id: cajaMayorId },
        moneda: { id: monedaId },
        formaPago: { id: formaPagoId },
      },
    });
  }

  if (saldo) {
    saldo.saldo = Number(saldo.saldo) + delta;
    await queryRunner.manager.save(CajaMayorSaldo, saldo);
  } else {
    const nuevoSaldo = queryRunner.manager.create(CajaMayorSaldo, {
      cajaMayor: { id: cajaMayorId },
      moneda: { id: monedaId },
      formaPago: { id: formaPagoId },
      saldo: delta,
    });
    await queryRunner.manager.save(CajaMayorSaldo, nuevoSaldo);
  }
}
