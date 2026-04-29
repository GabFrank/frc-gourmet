import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { CuentaPorCobrarCuotaEstado } from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

export function registerMovimientosClienteHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
) {

  ipcMain.handle('get-movimientos-cliente', async (_event, clienteId: number, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(MovimientoCliente);
      const qb = repo.createQueryBuilder('mc')
        .where('mc.cliente_id = :clienteId', { clienteId })
        .orderBy('mc.fecha', 'DESC')
        .addOrderBy('mc.id', 'DESC');

      if (filtros?.tipo) qb.andWhere('mc.tipo = :tipo', { tipo: filtros.tipo });
      if (filtros?.fechaInicio) qb.andWhere('mc.fecha >= :fi', { fi: filtros.fechaInicio });
      if (filtros?.fechaFin) qb.andWhere('mc.fecha <= :ff', { ff: filtros.fechaFin });

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 20;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error(`Error getting movimientos cliente ${clienteId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-saldo-cliente', async (_event, clienteId: number) => {
    try {
      const clienteRepo = dataSource.getRepository(Cliente);
      const cuotaRepo = dataSource.getRepository(CuentaPorCobrarCuota);

      const cliente = await clienteRepo.findOne({ where: { id: clienteId } });
      const saldoActual = cliente ? Number(cliente.saldoActual) : 0;

      // Contar cuotas vencidas activas
      const hoy = new Date().toISOString().split('T')[0];
      const cuotasVencidas = await cuotaRepo
        .createQueryBuilder('cuota')
        .innerJoin('cuota.cuentaPorCobrar', 'cpc')
        .where('cpc.cliente_id = :clienteId', { clienteId })
        .andWhere('cuota.estado IN (:...estados)', { estados: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL] })
        .andWhere('cuota.fecha_vencimiento < :hoy', { hoy })
        .getCount();

      return { saldoActual, cuotasVencidas };
    } catch (error) {
      console.error(`Error getting saldo cliente ${clienteId}:`, error);
      throw error;
    }
  });
}
