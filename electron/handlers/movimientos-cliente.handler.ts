import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import {
  CuentaPorCobrarCuotaEstado,
  CuentaPorCobrarEstado,
  MovimientoClienteTipo,
} from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
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

  // Estado de cuenta agregado del cliente (F2)
  ipcMain.handle('get-cliente-estado-cuenta', async (_event, clienteId: number) => {
    try {
      const clienteRepo = dataSource.getRepository(Cliente);
      const movRepo = dataSource.getRepository(MovimientoCliente);
      const cuotaRepo = dataSource.getRepository(CuentaPorCobrarCuota);
      const cpcRepo = dataSource.getRepository(CuentaPorCobrar);
      const ventaRepo = dataSource.getRepository(Venta);

      const cliente = await clienteRepo.findOne({
        where: { id: clienteId },
        relations: ['persona', 'tipo_cliente'],
      });
      if (!cliente) throw new Error(`Cliente ${clienteId} no encontrado`);

      const saldoActual = Number(cliente.saldoActual) || 0;

      const hoy = new Date();
      const hoyStr = hoy.toISOString().split('T')[0];
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();

      const cuotasVencidas = await cuotaRepo
        .createQueryBuilder('cuota')
        .innerJoin('cuota.cuentaPorCobrar', 'cpc')
        .where('cpc.cliente_id = :clienteId', { clienteId })
        .andWhere('cuota.estado IN (:...estados)', {
          estados: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL],
        })
        .andWhere('cuota.fecha_vencimiento < :hoy', { hoy: hoyStr })
        .getCount();

      // KPIs del mes actual
      const movsMes = await movRepo
        .createQueryBuilder('mc')
        .where('mc.cliente_id = :clienteId', { clienteId })
        .andWhere('mc.fecha >= :ini', { ini: inicioMes })
        .andWhere('mc.fecha < :fin', { fin: finMes })
        .getMany();

      let cargosMesTotal = 0;
      let pagosMesTotal = 0;
      for (const m of movsMes) {
        const monto = Number(m.monto) || 0;
        if (m.tipo === MovimientoClienteTipo.CARGO || m.tipo === MovimientoClienteTipo.AJUSTE_POSITIVO) {
          cargosMesTotal += monto;
        } else if (m.tipo === MovimientoClienteTipo.PAGO || m.tipo === MovimientoClienteTipo.AJUSTE_NEGATIVO) {
          pagosMesTotal += monto;
        }
      }

      // CPC abiertas (con sus cuotas)
      const cpcAbiertas = await cpcRepo.find({
        where: { cliente: { id: clienteId }, estado: CuentaPorCobrarEstado.ACTIVO },
        relations: ['cuotas', 'moneda'],
        order: { fechaInicio: 'DESC' },
      });

      // Últimas 10 ventas concluidas
      const ultimasVentas = await ventaRepo
        .createQueryBuilder('v')
        .leftJoinAndSelect('v.formaPago', 'fp')
        .where('v.cliente_id = :clienteId', { clienteId })
        .andWhere('v.estado = :estado', { estado: VentaEstado.CONCLUIDA })
        .orderBy('v.createdAt', 'DESC')
        .take(10)
        .getMany();

      return {
        cliente,
        saldoActual,
        cuotasVencidas,
        kpis: {
          movsMesCount: movsMes.length,
          cargosMesTotal: +cargosMesTotal.toFixed(2),
          pagosMesTotal: +pagosMesTotal.toFixed(2),
          netoMes: +(cargosMesTotal - pagosMesTotal).toFixed(2),
        },
        cpcAbiertas,
        ultimasVentas,
      };
    } catch (error) {
      console.error(`Error getting estado de cuenta cliente ${clienteId}:`, error);
      throw error;
    }
  });

  // Stats agregados para charts (F2)
  ipcMain.handle('get-movimientos-cliente-stats', async (_event, clienteId: number) => {
    try {
      const movRepo = dataSource.getRepository(MovimientoCliente);

      // Últimos 12 meses
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1).toISOString();

      const movs = await movRepo
        .createQueryBuilder('mc')
        .where('mc.cliente_id = :clienteId', { clienteId })
        .andWhere('mc.fecha >= :desde', { desde })
        .orderBy('mc.fecha', 'ASC')
        .getMany();

      // Agrupar por mes
      const porMesMap = new Map<string, { cargo: number; pago: number }>();
      // Inicializar 12 meses con cero para que el chart tenga puntos contínuos
      for (let i = 11; i >= 0; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        porMesMap.set(key, { cargo: 0, pago: 0 });
      }

      const composicion: Record<string, number> = {
        CARGO: 0,
        PAGO: 0,
        AJUSTE_POSITIVO: 0,
        AJUSTE_NEGATIVO: 0,
      };

      for (const m of movs) {
        const fecha = new Date(m.fecha);
        const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        const monto = Number(m.monto) || 0;
        const bucket = porMesMap.get(key) || { cargo: 0, pago: 0 };
        if (m.tipo === MovimientoClienteTipo.CARGO || m.tipo === MovimientoClienteTipo.AJUSTE_POSITIVO) {
          bucket.cargo += monto;
        } else if (m.tipo === MovimientoClienteTipo.PAGO || m.tipo === MovimientoClienteTipo.AJUSTE_NEGATIVO) {
          bucket.pago += monto;
        }
        porMesMap.set(key, bucket);
        composicion[m.tipo] = (composicion[m.tipo] || 0) + monto;
      }

      const porMes = Array.from(porMesMap.entries()).map(([mes, v]) => ({
        mes,
        cargo: +v.cargo.toFixed(2),
        pago: +v.pago.toFixed(2),
      }));

      return { porMes, composicion };
    } catch (error) {
      console.error(`Error stats movimientos cliente ${clienteId}:`, error);
      throw error;
    }
  });
}
