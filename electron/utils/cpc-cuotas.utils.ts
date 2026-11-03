import { EntityManager } from 'typeorm';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { CuentaPorCobrarCuotaEstado } from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';

/**
 * #322 / #347: al cancelar una CPC, sus cuotas abiertas (PENDIENTE/PARCIAL)
 * pasan a CANCELADO para que no sigan sumando en resúmenes ni vencidas.
 * Se llama dentro de la misma transacción que cancela la CPC. Devuelve
 * cuántas cuotas cambió.
 */
export async function cancelarCuotasAbiertasDeCpc(manager: EntityManager, cpcId: number): Promise<number> {
  const r = await manager.getRepository(CuentaPorCobrarCuota)
    .createQueryBuilder()
    .update(CuentaPorCobrarCuota)
    .set({ estado: CuentaPorCobrarCuotaEstado.CANCELADO })
    .where('cuenta_por_cobrar_id = :id AND estado IN (:...ests)', {
      id: cpcId,
      ests: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL],
    })
    .execute();
  return r.affected ?? 0;
}
