import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CajaMayor } from '../../src/app/database/entities/financiero/caja-mayor.entity';
import { CajaMayorSaldo } from '../../src/app/database/entities/financiero/caja-mayor-saldo.entity';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { GastoCategoria } from '../../src/app/database/entities/financiero/gasto-categoria.entity';
import { Gasto } from '../../src/app/database/entities/financiero/gasto.entity';
import { GastoDetalle } from '../../src/app/database/entities/financiero/gasto-detalle.entity';
import { RetiroCaja } from '../../src/app/database/entities/financiero/retiro-caja.entity';
import { RetiroCajaDetalle } from '../../src/app/database/entities/financiero/retiro-caja-detalle.entity';
import { EntradaVariaCategoria } from '../../src/app/database/entities/financiero/entrada-varia-categoria.entity';
import { EntradaVaria } from '../../src/app/database/entities/financiero/entrada-varia.entity';
import { OperacionFinancieraCategoria } from '../../src/app/database/entities/financiero/operacion-financiera-categoria.entity';
import { OperacionFinanciera } from '../../src/app/database/entities/financiero/operacion-financiera.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { CajaMayorEstado, TipoMovimiento, GastoEstado, RetiroCajaEstado } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { TipoOperacionFinanciera, DiferenciaDestinoTipo } from '../../src/app/database/entities/financiero/operaciones-financieras-enums';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { esIngreso, actualizarSaldoCajaMayor } from './caja-mayor-utils';

// Alias local para mantener firma legacy de actualizarSaldo
const actualizarSaldo = actualizarSaldoCajaMayor;

export function registerCajaMayorHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {

  // ===================== CAJA MAYOR CRUD =====================

  ipcMain.handle('get-cajas-mayor', async () => {
    try {
      const repo = dataSource.getRepository(CajaMayor);
      return await repo.find({
        relations: ['responsable', 'responsable.persona', 'saldos', 'saldos.moneda', 'saldos.formaPago'],
        order: { fechaApertura: 'DESC' },
      });
    } catch (error) {
      console.error('Error getting cajas mayor:', error);
      throw error;
    }
  });

  ipcMain.handle('get-caja-mayor', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(CajaMayor);
      return await repo.findOne({
        where: { id },
        relations: ['responsable', 'responsable.persona', 'saldos', 'saldos.moneda', 'saldos.formaPago'],
      });
    } catch (error) {
      console.error(`Error getting caja mayor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-caja-mayor', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(CajaMayor);
      const entity = repo.create({
        ...data,
        fechaApertura: new Date(),
        estado: CajaMayorEstado.ABIERTA,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating caja mayor:', error);
      throw error;
    }
  });

  ipcMain.handle('update-caja-mayor', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(CajaMayor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Caja Mayor ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating caja mayor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('cerrar-caja-mayor', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(CajaMayor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Caja Mayor ID ${id} not found`);
      entity.estado = CajaMayorEstado.CERRADA;
      entity.fechaCierre = new Date();
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error cerrando caja mayor ID ${id}:`, error);
      throw error;
    }
  });

  // ===================== CAJA MAYOR SALDOS =====================

  ipcMain.handle('get-caja-mayor-saldos', async (_event: any, cajaMayorId: number) => {
    try {
      const repo = dataSource.getRepository(CajaMayorSaldo);
      return await repo.find({
        where: { cajaMayor: { id: cajaMayorId } },
        relations: ['moneda', 'formaPago'],
        order: { moneda: { denominacion: 'ASC' } },
      });
    } catch (error) {
      console.error(`Error getting saldos for caja mayor ${cajaMayorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('recalcular-saldos', async (_event: any, cajaMayorId: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Eliminar saldos actuales
      await queryRunner.manager.delete(CajaMayorSaldo, { cajaMayor: { id: cajaMayorId } });

      // Recalcular desde movimientos (excluyendo anulados)
      const movimientos = await queryRunner.manager.find(CajaMayorMovimiento, {
        where: { cajaMayor: { id: cajaMayorId } },
        relations: ['moneda', 'formaPago'],
      });

      // Agrupar por moneda+formaPago
      const saldosMap = new Map<string, { monedaId: number; formaPagoId: number; saldo: number }>();
      for (const mov of movimientos) {
        // Saltar movimientos que fueron anulados (tienen un contra-movimiento apuntando a ellos)
        const key = `${mov.moneda.id}-${mov.formaPago.id}`;
        if (!saldosMap.has(key)) {
          saldosMap.set(key, { monedaId: mov.moneda.id, formaPagoId: mov.formaPago.id, saldo: 0 });
        }
        const entry = saldosMap.get(key)!;
        const delta = esIngreso(mov.tipoMovimiento) ? Number(mov.monto) : -Number(mov.monto);
        entry.saldo += delta;
      }

      // Crear saldos recalculados
      for (const entry of saldosMap.values()) {
        const saldo = queryRunner.manager.create(CajaMayorSaldo, {
          cajaMayor: { id: cajaMayorId },
          moneda: { id: entry.monedaId },
          formaPago: { id: entry.formaPagoId },
          saldo: entry.saldo,
        });
        await queryRunner.manager.save(CajaMayorSaldo, saldo);
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error recalculando saldos caja mayor ${cajaMayorId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== CAJA MAYOR MOVIMIENTOS =====================

  ipcMain.handle('get-caja-mayor-movimientos', async (_event: any, cajaMayorId: number, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(CajaMayorMovimiento);
      const qb = repo.createQueryBuilder('mov')
        .leftJoinAndSelect('mov.moneda', 'moneda')
        .leftJoinAndSelect('mov.formaPago', 'formaPago')
        .leftJoinAndSelect('mov.responsable', 'responsable')
        .leftJoinAndSelect('responsable.persona', 'persona')
        .leftJoinAndSelect('mov.gasto', 'gasto')
        .leftJoinAndSelect('gasto.proveedor', 'proveedor')
        .leftJoinAndSelect('mov.retiroCaja', 'retiroCaja')
        .leftJoinAndSelect('mov.referenciaAnulacion', 'referenciaAnulacion')
        .where('mov.caja_mayor_id = :cajaMayorId', { cajaMayorId })
        .orderBy('mov.fecha', 'DESC')
        .addOrderBy('mov.id', 'DESC');

      if (filtros?.fechaDesde) {
        qb.andWhere('mov.fecha >= :fechaDesde', { fechaDesde: filtros.fechaDesde });
      }
      if (filtros?.fechaHasta) {
        qb.andWhere('mov.fecha <= :fechaHasta', { fechaHasta: filtros.fechaHasta });
      }
      if (filtros?.tipoMovimiento) {
        qb.andWhere('mov.tipo_movimiento = :tipo', { tipo: filtros.tipoMovimiento });
      }
      if (filtros?.responsableId) {
        qb.andWhere('mov.responsable_id = :responsableId', { responsableId: filtros.responsableId });
      }
      if (filtros?.proveedorId) {
        qb.andWhere('gasto.proveedor_id = :proveedorId', { proveedorId: filtros.proveedorId });
      }

      // Paginacion (devuelve { items, total } cuando se pasa pageSize)
      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error(`Error getting movimientos for caja mayor ${cajaMayorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-caja-mayor-movimiento', async (_event: any, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
        ...data,
        fecha: data.fecha || new Date(),
      });

      const currentUser = getCurrentUser();
      if (currentUser) {
        movimiento.responsable = currentUser;
      }
      await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);

      const savedMov = await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

      // Actualizar saldo
      await actualizarSaldo(
        queryRunner,
        data.cajaMayor.id || data.cajaMayor,
        data.moneda.id || data.moneda,
        data.formaPago.id || data.formaPago,
        Number(data.monto),
        data.tipoMovimiento
      );

      await queryRunner.commitTransaction();
      return savedMov;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating caja mayor movimiento:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-caja-mayor-movimiento', async (_event: any, id: number, motivo: string) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const original = await repo.findOne({
        where: { id },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });
      if (!original) throw new Error(`Movimiento ID ${id} not found`);

      // Crear contra-movimiento
      const contraMovimiento = queryRunner.manager.create(CajaMayorMovimiento, {
        cajaMayor: original.cajaMayor,
        tipoMovimiento: TipoMovimiento.ANULACION,
        moneda: original.moneda,
        formaPago: original.formaPago,
        monto: original.monto,
        fecha: new Date(),
        observacion: `ANULACION: ${motivo}`,
        referenciaAnulacion: original,
      });

      const currentUser = getCurrentUser();
      if (currentUser) {
        contraMovimiento.responsable = currentUser;
      }
      await setEntityUserTracking(dataSource, contraMovimiento, currentUser?.id, false);

      await queryRunner.manager.save(CajaMayorMovimiento, contraMovimiento);

      // Revertir saldo: si el original era ingreso, el contra es egreso y viceversa
      const tipoContrario = esIngreso(original.tipoMovimiento)
        ? TipoMovimiento.AJUSTE_NEGATIVO  // para restar
        : TipoMovimiento.AJUSTE_POSITIVO; // para sumar

      await actualizarSaldo(
        queryRunner,
        original.cajaMayor.id,
        original.moneda.id,
        original.formaPago.id,
        Number(original.monto),
        tipoContrario
      );

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando movimiento ID ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== GASTO CATEGORIAS =====================

  ipcMain.handle('get-gasto-categorias', async () => {
    try {
      const repo = dataSource.getRepository(GastoCategoria);
      return await repo.find({
        relations: ['padre', 'hijos'],
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting gasto categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-gasto-categoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(GastoCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['padre', 'hijos'],
      });
    } catch (error) {
      console.error(`Error getting gasto categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-gasto-categoria', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(GastoCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating gasto categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-gasto-categoria', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(GastoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`GastoCategoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating gasto categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-gasto-categoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(GastoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`GastoCategoria ID ${id} not found`);
      // Soft delete
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting gasto categoria ID ${id}:`, error);
      throw error;
    }
  });

  // ===================== GASTOS =====================

  ipcMain.handle('get-gastos', async (_event: any, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(Gasto);
      const qb = repo.createQueryBuilder('gasto')
        .leftJoinAndSelect('gasto.gastoCategoria', 'gastoCategoria')
        .leftJoinAndSelect('gastoCategoria.padre', 'categoriaPadre')
        .leftJoinAndSelect('gasto.moneda', 'moneda')
        .leftJoinAndSelect('gasto.formaPago', 'formaPago')
        .leftJoinAndSelect('gasto.cajaMayor', 'cajaMayor')
        .leftJoinAndSelect('gasto.proveedor', 'proveedor')
        .leftJoinAndSelect('gasto.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .orderBy('gasto.fecha', 'DESC');

      if (filtros?.fechaDesde) {
        qb.andWhere('gasto.fecha >= :fechaDesde', { fechaDesde: filtros.fechaDesde });
      }
      if (filtros?.fechaHasta) {
        qb.andWhere('gasto.fecha <= :fechaHasta', { fechaHasta: filtros.fechaHasta });
      }
      if (filtros?.gastoCategoriaId) {
        qb.andWhere('gasto.gasto_categoria_id = :catId', { catId: filtros.gastoCategoriaId });
      }
      if (filtros?.estado) {
        qb.andWhere('gasto.estado = :estado', { estado: filtros.estado });
      }
      if (filtros?.cajaMayorId) {
        qb.andWhere('gasto.caja_mayor_id = :cmId', { cmId: filtros.cajaMayorId });
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting gastos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-gasto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Gasto);
      return await repo.findOne({
        where: { id },
        relations: ['gastoCategoria', 'gastoCategoria.padre', 'moneda', 'formaPago', 'cajaMayor', 'proveedor', 'createdBy', 'createdBy.persona', 'detalles', 'detalles.moneda', 'detalles.formaPago'],
      });
    } catch (error) {
      console.error(`Error getting gasto ID ${id}:`, error);
      throw error;
    }
  });

  // Crear gasto: transaccional (Gasto + GastoDetalles + CajaMayorMovimientos + actualizar saldos)
  // data.detalles = [{ monedaId, formaPagoId, monto, observacion? }]
  ipcMain.handle('create-gasto', async (_event: any, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const { detalles, ...gastoData } = data;
      const cajaMayorId = gastoData.cajaMayor?.id || gastoData.cajaMayor;

      // Calcular monto total desde detalles
      const montoTotal = (detalles || []).reduce((sum: number, d: any) => sum + Number(d.monto), 0);

      // 1. Crear gasto (moneda y formaPago del primer detalle como referencia)
      const primerDetalle = detalles?.[0];
      const gasto = queryRunner.manager.create(Gasto, {
        ...gastoData,
        monto: montoTotal,
        moneda: primerDetalle ? { id: primerDetalle.monedaId } : null,
        formaPago: primerDetalle ? { id: primerDetalle.formaPagoId } : null,
        estado: GastoEstado.PAGADO,
      });
      await setEntityUserTracking(dataSource, gasto, getCurrentUser()?.id, false);
      const savedGasto = await queryRunner.manager.save(Gasto, gasto);

      // 2. Crear detalles + movimientos por cada detalle
      const currentUser = getCurrentUser();
      for (const det of detalles || []) {
        const monedaId = det.monedaId;
        const formaPagoId = det.formaPagoId;

        // Crear GastoDetalle
        const detalle = queryRunner.manager.create(GastoDetalle, {
          gasto: savedGasto,
          moneda: { id: monedaId },
          formaPago: { id: formaPagoId },
          monto: det.monto,
          observacion: det.observacion || null,
        });
        await queryRunner.manager.save(GastoDetalle, detalle);

        // Crear CajaMayorMovimiento por cada detalle
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.EGRESO_GASTO,
          moneda: { id: monedaId },
          formaPago: { id: formaPagoId },
          monto: det.monto,
          fecha: gastoData.fecha || new Date(),
          observacion: `GASTO: ${gastoData.descripcion || ''}`.toUpperCase(),
          gasto: savedGasto,
        });

        if (currentUser) {
          movimiento.responsable = currentUser;
        }
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

        // Actualizar saldo
        await actualizarSaldo(queryRunner, cajaMayorId, monedaId, formaPagoId, Number(det.monto), TipoMovimiento.EGRESO_GASTO);
      }

      await queryRunner.commitTransaction();
      return savedGasto;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating gasto:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-gasto', async (_event: any, id: number, motivo: string) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const gastoRepo = queryRunner.manager.getRepository(Gasto);
      const gasto = await gastoRepo.findOne({
        where: { id },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });
      if (!gasto) throw new Error(`Gasto ID ${id} not found`);

      // Cancelar gasto
      gasto.estado = GastoEstado.CANCELADO;
      await setEntityUserTracking(dataSource, gasto, getCurrentUser()?.id, true);
      await queryRunner.manager.save(Gasto, gasto);

      // Buscar movimiento original del gasto
      const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const movOriginal = await movRepo.findOne({
        where: { gasto: { id }, tipoMovimiento: TipoMovimiento.EGRESO_GASTO },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });

      if (movOriginal) {
        // Crear contra-movimiento
        const contraMovimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: movOriginal.cajaMayor,
          tipoMovimiento: TipoMovimiento.ANULACION,
          moneda: movOriginal.moneda,
          formaPago: movOriginal.formaPago,
          monto: movOriginal.monto,
          fecha: new Date(),
          observacion: `ANULACION GASTO: ${motivo}`.toUpperCase(),
          gasto: gasto,
          referenciaAnulacion: movOriginal,
        });

        const currentUser = getCurrentUser();
        if (currentUser) {
          contraMovimiento.responsable = currentUser;
        }
        await setEntityUserTracking(dataSource, contraMovimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, contraMovimiento);

        // Revertir saldo (el gasto era egreso, asi que sumamos)
        await actualizarSaldo(
          queryRunner,
          movOriginal.cajaMayor.id,
          movOriginal.moneda.id,
          movOriginal.formaPago.id,
          Number(movOriginal.monto),
          TipoMovimiento.AJUSTE_POSITIVO
        );
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando gasto ID ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Editar gasto: revertir movimientos viejos, actualizar gasto+detalles, crear movimientos nuevos
  ipcMain.handle('edit-gasto', async (_event: any, gastoId: number, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 1. Buscar gasto y sus movimientos actuales
      const gastoRepo = queryRunner.manager.getRepository(Gasto);
      const gasto = await gastoRepo.findOne({
        where: { id: gastoId },
        relations: ['cajaMayor'],
      });
      if (!gasto) throw new Error(`Gasto ID ${gastoId} not found`);

      const cajaMayorId = gasto.cajaMayor?.id;
      const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);

      // 2. Revertir movimientos viejos del gasto
      const movsViejos = await movRepo.find({
        where: { gasto: { id: gastoId }, tipoMovimiento: TipoMovimiento.EGRESO_GASTO },
        relations: ['moneda', 'formaPago'],
      });

      for (const mov of movsViejos) {
        await actualizarSaldo(queryRunner, cajaMayorId, mov.moneda.id, mov.formaPago.id, Number(mov.monto), TipoMovimiento.AJUSTE_POSITIVO);
      }

      // 3. Eliminar movimientos y detalles viejos
      await queryRunner.manager.delete(CajaMayorMovimiento, { gasto: { id: gastoId } });
      await queryRunner.manager.delete(GastoDetalle, { gasto: { id: gastoId } });

      // 4. Actualizar gasto
      const { detalles, ...gastoData } = data;
      const montoTotal = (detalles || []).reduce((sum: number, d: any) => sum + Number(d.monto), 0);
      const primerDetalle = detalles?.[0];

      queryRunner.manager.merge(Gasto, gasto, {
        ...gastoData,
        monto: montoTotal,
        moneda: primerDetalle ? { id: primerDetalle.monedaId } : null,
        formaPago: primerDetalle ? { id: primerDetalle.formaPagoId } : null,
      });
      await setEntityUserTracking(dataSource, gasto, getCurrentUser()?.id, true);
      await queryRunner.manager.save(Gasto, gasto);

      // 5. Crear nuevos detalles y movimientos
      const currentUser = getCurrentUser();
      for (const det of detalles || []) {
        const detalle = queryRunner.manager.create(GastoDetalle, {
          gasto: gasto,
          moneda: { id: det.monedaId },
          formaPago: { id: det.formaPagoId },
          monto: det.monto,
          observacion: det.observacion || null,
        });
        await queryRunner.manager.save(GastoDetalle, detalle);

        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.EGRESO_GASTO,
          moneda: { id: det.monedaId },
          formaPago: { id: det.formaPagoId },
          monto: det.monto,
          fecha: gastoData.fecha || gasto.fecha,
          observacion: `GASTO: ${gastoData.descripcion || gasto.descripcion}`.toUpperCase(),
          gasto: gasto,
        });
        if (currentUser) movimiento.responsable = currentUser;
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

        await actualizarSaldo(queryRunner, cajaMayorId, det.monedaId, det.formaPagoId, Number(det.monto), TipoMovimiento.EGRESO_GASTO);
      }

      await queryRunner.commitTransaction();
      return gasto;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error editing gasto ID ${gastoId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Editar movimiento suelto (ajustes): revertir viejo + crear nuevo
  ipcMain.handle('edit-caja-mayor-movimiento', async (_event: any, movId: number, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const original = await movRepo.findOne({
        where: { id: movId },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });
      if (!original) throw new Error(`Movimiento ID ${movId} not found`);

      const cajaMayorId = original.cajaMayor.id;

      // 1. Revertir saldo del movimiento original
      const tipoContrario = esIngreso(original.tipoMovimiento)
        ? TipoMovimiento.AJUSTE_NEGATIVO
        : TipoMovimiento.AJUSTE_POSITIVO;
      await actualizarSaldo(queryRunner, cajaMayorId, original.moneda.id, original.formaPago.id, Number(original.monto), tipoContrario);

      // 2. Actualizar el movimiento
      const monedaId = data.moneda?.id || data.monedaId || original.moneda.id;
      const formaPagoId = data.formaPago?.id || data.formaPagoId || original.formaPago.id;
      const monto = data.monto !== undefined ? data.monto : original.monto;

      original.moneda = { id: monedaId } as any;
      original.formaPago = { id: formaPagoId } as any;
      original.monto = monto;
      if (data.observacion !== undefined) original.observacion = data.observacion;
      await setEntityUserTracking(dataSource, original, getCurrentUser()?.id, true);
      await queryRunner.manager.save(CajaMayorMovimiento, original);

      // 3. Aplicar nuevo saldo
      await actualizarSaldo(queryRunner, cajaMayorId, monedaId, formaPagoId, Number(monto), original.tipoMovimiento);

      await queryRunner.commitTransaction();
      return original;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error editing movimiento ID ${movId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-gastos-programados', async () => {
    try {
      const repo = dataSource.getRepository(Gasto);
      return await repo.find({
        where: { esRecurrente: true, estado: GastoEstado.PROGRAMADO },
        relations: ['gastoCategoria', 'moneda', 'formaPago', 'cajaMayor'],
        order: { proximoVencimiento: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting gastos programados:', error);
      throw error;
    }
  });

  // ===================== RETIROS DE CAJA =====================

  ipcMain.handle('get-retiros-caja', async (_event: any, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(RetiroCaja);
      const qb = repo.createQueryBuilder('retiro')
        .leftJoinAndSelect('retiro.caja', 'caja')
        .leftJoinAndSelect('caja.dispositivo', 'dispositivo')
        .leftJoinAndSelect('retiro.cajaMayor', 'cajaMayor')
        .leftJoinAndSelect('retiro.responsableRetiro', 'responsableRetiro')
        .leftJoinAndSelect('responsableRetiro.persona', 'retiroPersona')
        .leftJoinAndSelect('retiro.responsableIngreso', 'responsableIngreso')
        .leftJoinAndSelect('responsableIngreso.persona', 'ingresoPersona')
        .leftJoinAndSelect('retiro.detalles', 'detalles')
        .leftJoinAndSelect('detalles.moneda', 'moneda')
        .leftJoinAndSelect('detalles.formaPago', 'formaPago')
        .orderBy('retiro.fechaRetiro', 'DESC');

      if (filtros?.estado) {
        qb.andWhere('retiro.estado = :estado', { estado: filtros.estado });
      }
      if (filtros?.cajaMayorId) {
        qb.andWhere('retiro.caja_mayor_id = :cmId', { cmId: filtros.cajaMayorId });
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting retiros caja:', error);
      throw error;
    }
  });

  ipcMain.handle('get-retiro-caja', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(RetiroCaja);
      return await repo.findOne({
        where: { id },
        relations: [
          'caja', 'caja.dispositivo', 'cajaMayor',
          'responsableRetiro', 'responsableRetiro.persona',
          'responsableIngreso', 'responsableIngreso.persona',
          'detalles', 'detalles.moneda', 'detalles.formaPago',
        ],
      });
    } catch (error) {
      console.error(`Error getting retiro caja ID ${id}:`, error);
      throw error;
    }
  });

  // Crear retiro: si tiene cajaMayor destino queda como VINCULADO_PENDIENTE (no impacta saldos
  // hasta que sea verificado en caja mayor); sin destino queda como FLOTANTE.
  ipcMain.handle('create-retiro-caja', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(RetiroCaja);
      const { detalles, ...retiroData } = data;

      const entity = repo.create({
        ...retiroData,
        fechaRetiro: new Date(),
        estado: retiroData.cajaMayor ? RetiroCajaEstado.VINCULADO_PENDIENTE : RetiroCajaEstado.FLOTANTE,
        detalles: detalles?.map((d: any) => {
          const detalle = new RetiroCajaDetalle();
          detalle.moneda = d.moneda;
          detalle.formaPago = d.formaPago;
          detalle.monto = d.monto;
          return detalle;
        }),
      });

      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const result = await repo.save(entity);
      const savedRetiro = Array.isArray(result) ? result[0] : result;

      return savedRetiro;
    } catch (error) {
      console.error('Error creating retiro caja:', error);
      throw error;
    }
  });

  // Ingresar retiro flotante a una caja mayor
  ipcMain.handle('ingresar-retiro-caja', async (_event: any, retiroId: number, cajaMayorId: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const retiroRepo = queryRunner.manager.getRepository(RetiroCaja);
      const retiro = await retiroRepo.findOne({
        where: { id: retiroId },
        relations: ['detalles', 'detalles.moneda', 'detalles.formaPago'],
      });
      if (!retiro) throw new Error(`RetiroCaja ID ${retiroId} not found`);
      if (retiro.estado === RetiroCajaEstado.INGRESADO) throw new Error('El retiro ya fue ingresado');

      // Actualizar retiro
      retiro.cajaMayor = { id: cajaMayorId } as any;
      retiro.estado = RetiroCajaEstado.INGRESADO;
      retiro.fechaIngreso = new Date();
      const currentUser = getCurrentUser();
      if (currentUser) {
        retiro.responsableIngreso = currentUser;
      }
      await setEntityUserTracking(dataSource, retiro, currentUser?.id, true);
      await queryRunner.manager.save(RetiroCaja, retiro);

      // Crear movimiento por cada detalle
      for (const detalle of retiro.detalles) {
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.INGRESO_RETIRO_CAJA,
          moneda: detalle.moneda,
          formaPago: detalle.formaPago,
          monto: detalle.monto,
          fecha: new Date(),
          observacion: `RETIRO CAJA #${retiroId}`,
          retiroCaja: retiro,
        });

        if (currentUser) {
          movimiento.responsable = currentUser;
        }
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

        await actualizarSaldo(queryRunner, cajaMayorId, detalle.moneda.id, detalle.formaPago.id, Number(detalle.monto), TipoMovimiento.INGRESO_RETIRO_CAJA);
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error ingresando retiro ${retiroId} a caja mayor ${cajaMayorId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== ENTRADA VARIA CATEGORIAS =====================

  ipcMain.handle('get-entrada-varia-categorias', async () => {
    try {
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      return await repo.find({ relations: ['padre', 'hijos'], order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting entrada varia categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-entrada-varia-categoria', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      return await repo.findOne({ where: { id }, relations: ['padre', 'hijos'] });
    } catch (error) {
      console.error(`Error getting entrada varia categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-entrada-varia-categoria', async (_event, data: any) => {
    try {
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      const entity = repo.create({ ...data, nombre: data.nombre?.toUpperCase() });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating entrada varia categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-entrada-varia-categoria', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`EntradaVariaCategoria ${id} no encontrada`);
      const merge: any = { ...data };
      if (data.nombre) merge.nombre = data.nombre.toUpperCase();
      repo.merge(entity, merge);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating entrada varia categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-entrada-varia-categoria', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(EntradaVariaCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`EntradaVariaCategoria ${id} no encontrada`);
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting entrada varia categoria ${id}:`, error);
      throw error;
    }
  });

  // ===================== ENTRADAS VARIAS =====================

  ipcMain.handle('get-entradas-varias', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(EntradaVaria);
      const qb = repo.createQueryBuilder('ev')
        .leftJoinAndSelect('ev.entradaVariaCategoria', 'cat')
        .leftJoinAndSelect('cat.padre', 'catPadre')
        .leftJoinAndSelect('ev.moneda', 'moneda')
        .leftJoinAndSelect('ev.formaPago', 'formaPago')
        .leftJoinAndSelect('ev.cajaMayor', 'cajaMayor')
        .leftJoinAndSelect('ev.cuentaBancaria', 'cuentaBancaria')
        .leftJoinAndSelect('ev.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .orderBy('ev.fecha', 'DESC');

      if (filtros?.fechaDesde) qb.andWhere('ev.fecha >= :fd', { fd: filtros.fechaDesde });
      if (filtros?.fechaHasta) qb.andWhere('ev.fecha <= :fh', { fh: filtros.fechaHasta });
      if (filtros?.entradaVariaCategoriaId) qb.andWhere('ev.entrada_varia_categoria_id = :catId', { catId: filtros.entradaVariaCategoriaId });
      if (filtros?.cajaMayorId) qb.andWhere('ev.caja_mayor_id = :cmId', { cmId: filtros.cajaMayorId });
      if (filtros?.anulado !== undefined) qb.andWhere('ev.anulado = :anulado', { anulado: filtros.anulado });

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting entradas varias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-entrada-varia', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(EntradaVaria);
      return await repo.findOne({
        where: { id },
        relations: ['entradaVariaCategoria', 'entradaVariaCategoria.padre', 'moneda', 'formaPago', 'cajaMayor', 'createdBy', 'createdBy.persona'],
      });
    } catch (error) {
      console.error(`Error getting entrada varia ${id}:`, error);
      throw error;
    }
  });

  // Crear entrada varia: transaccional. Soporta dos destinos:
  // 1. Caja Mayor: crea EntradaVaria + CajaMayorMovimiento INGRESO_ENTRADA_VARIA + actualiza saldo CM
  // 2. Cuenta Bancaria: crea EntradaVaria + suma a saldo de cuenta bancaria
  ipcMain.handle('create-entrada-varia', async (_event, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const destinoTipo = data.destinoTipo || 'CAJA_MAYOR';
      const cajaMayorId = data.cajaMayor?.id || data.cajaMayor || data.cajaMayorId || null;
      const cuentaBancariaId = data.cuentaBancaria?.id || data.cuentaBancariaId || null;
      const monedaId = data.moneda?.id || data.moneda || data.monedaId;
      const formaPagoId = data.formaPago?.id || data.formaPago || data.formaPagoId;
      const monto = Number(data.monto);

      const entrada = queryRunner.manager.create(EntradaVaria, {
        entradaVariaCategoria: data.entradaVariaCategoria || (data.entradaVariaCategoriaId ? { id: data.entradaVariaCategoriaId } : null),
        descripcion: data.descripcion?.toUpperCase(),
        monto,
        numeroComprobante: data.numeroComprobante?.toUpperCase() || null,
        observacion: data.observacion?.toUpperCase() || null,
        fecha: data.fecha || new Date(),
        moneda: { id: monedaId },
        formaPago: { id: formaPagoId },
        cajaMayor: destinoTipo === 'CAJA_MAYOR' && cajaMayorId ? { id: cajaMayorId } : null,
        cuentaBancaria: destinoTipo === 'CUENTA_BANCARIA' && cuentaBancariaId ? { id: cuentaBancariaId } : null,
      });
      await setEntityUserTracking(dataSource, entrada, getCurrentUser()?.id, false);
      const saved = await queryRunner.manager.save(EntradaVaria, entrada);

      if (destinoTipo === 'CAJA_MAYOR') {
        if (!cajaMayorId) throw new Error('cajaMayorId requerido para destino CAJA_MAYOR');
        const currentUser = getCurrentUser();
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId },
          tipoMovimiento: TipoMovimiento.INGRESO_ENTRADA_VARIA,
          moneda: { id: monedaId },
          formaPago: { id: formaPagoId },
          monto,
          fecha: data.fecha || new Date(),
          observacion: `ENTRADA VARIA: ${data.descripcion || ''}`.toUpperCase(),
          entradaVariaId: saved.id,
        });
        if (currentUser) movimiento.responsable = currentUser;
        await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
        await actualizarSaldo(queryRunner, cajaMayorId, monedaId, formaPagoId, monto, TipoMovimiento.INGRESO_ENTRADA_VARIA);
      } else if (destinoTipo === 'CUENTA_BANCARIA') {
        if (!cuentaBancariaId) throw new Error('cuentaBancariaId requerido para destino CUENTA_BANCARIA');
        const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
        const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
        if (!cb) throw new Error(`CuentaBancaria ${cuentaBancariaId} no encontrada`);
        cb.saldo = Number(cb.saldo) + monto;
        await queryRunner.manager.save(CuentaBancaria, cb);
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating entrada varia:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-entrada-varia', async (_event, id: number, motivo: string) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repo = queryRunner.manager.getRepository(EntradaVaria);
      const entrada = await repo.findOne({
        where: { id },
        relations: ['cajaMayor', 'cuentaBancaria', 'moneda', 'formaPago'],
      });
      if (!entrada) throw new Error(`EntradaVaria ${id} no encontrada`);
      if (entrada.anulado) throw new Error('La entrada varia ya esta anulada');

      entrada.anulado = true;
      await setEntityUserTracking(dataSource, entrada, getCurrentUser()?.id, true);
      await queryRunner.manager.save(EntradaVaria, entrada);

      if (entrada.cajaMayor) {
        const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
        const movOriginal = await movRepo.findOne({
          where: { entradaVariaId: id, tipoMovimiento: TipoMovimiento.INGRESO_ENTRADA_VARIA },
          relations: ['cajaMayor', 'moneda', 'formaPago'],
        });
        if (movOriginal) {
          const contra = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: movOriginal.cajaMayor,
            tipoMovimiento: TipoMovimiento.ANULACION,
            moneda: movOriginal.moneda,
            formaPago: movOriginal.formaPago,
            monto: movOriginal.monto,
            fecha: new Date(),
            observacion: `ANULACION ENTRADA VARIA: ${motivo}`.toUpperCase(),
            entradaVariaId: id,
            referenciaAnulacion: movOriginal,
          });
          const currentUser = getCurrentUser();
          if (currentUser) contra.responsable = currentUser;
          await setEntityUserTracking(dataSource, contra, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, contra);

          await actualizarSaldo(
            queryRunner,
            movOriginal.cajaMayor.id,
            movOriginal.moneda.id,
            movOriginal.formaPago.id,
            Number(movOriginal.monto),
            TipoMovimiento.AJUSTE_NEGATIVO,
          );
        }
      }

      if (entrada.cuentaBancaria) {
        const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
        const cb = await cbRepo.findOne({ where: { id: entrada.cuentaBancaria.id } });
        if (cb) {
          cb.saldo = Number(cb.saldo) - Number(entrada.monto);
          await queryRunner.manager.save(CuentaBancaria, cb);
        }
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando entrada varia ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== OPERACION FINANCIERA CATEGORIAS =====================

  ipcMain.handle('get-operacion-financiera-categorias', async () => {
    try {
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      return await repo.find({ relations: ['padre', 'hijos'], order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting operacion financiera categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-operacion-financiera-categoria', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      return await repo.findOne({ where: { id }, relations: ['padre', 'hijos'] });
    } catch (error) {
      console.error(`Error getting operacion financiera categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-operacion-financiera-categoria', async (_event, data: any) => {
    try {
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      const entity = repo.create({ ...data, nombre: data.nombre?.toUpperCase() });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating operacion financiera categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-operacion-financiera-categoria', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`OperacionFinancieraCategoria ${id} no encontrada`);
      const merge: any = { ...data };
      if (data.nombre) merge.nombre = data.nombre.toUpperCase();
      repo.merge(entity, merge);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating operacion financiera categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-operacion-financiera-categoria', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(OperacionFinancieraCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`OperacionFinancieraCategoria ${id} no encontrada`);
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting operacion financiera categoria ${id}:`, error);
      throw error;
    }
  });

  // ===================== OPERACIONES FINANCIERAS =====================

  ipcMain.handle('get-operaciones-financieras', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(OperacionFinanciera);
      const qb = repo.createQueryBuilder('op')
        .leftJoinAndSelect('op.operacionFinancieraCategoria', 'cat')
        .leftJoinAndSelect('op.cajaMayorOrigen', 'cmO')
        .leftJoinAndSelect('op.cajaMayorDestino', 'cmD')
        .leftJoinAndSelect('op.monedaOrigen', 'monO')
        .leftJoinAndSelect('op.monedaDestino', 'monD')
        .leftJoinAndSelect('op.formaPagoOrigen', 'fpO')
        .leftJoinAndSelect('op.formaPagoDestino', 'fpD')
        .leftJoinAndSelect('op.cuentaBancariaOrigen', 'cbO')
        .leftJoinAndSelect('op.cuentaBancariaDestino', 'cbD')
        .leftJoinAndSelect('op.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .orderBy('op.fecha', 'DESC');

      if (filtros?.tipoOperacion) qb.andWhere('op.tipo_operacion = :t', { t: filtros.tipoOperacion });
      if (filtros?.fechaDesde) qb.andWhere('op.fecha >= :fd', { fd: filtros.fechaDesde });
      if (filtros?.fechaHasta) qb.andWhere('op.fecha <= :fh', { fh: filtros.fechaHasta });
      if (filtros?.cajaMayorId) {
        qb.andWhere('(op.caja_mayor_origen_id = :cmId OR op.caja_mayor_destino_id = :cmId)', { cmId: filtros.cajaMayorId });
      }
      if (filtros?.anulado !== undefined) qb.andWhere('op.anulado = :anulado', { anulado: filtros.anulado });

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }

      return await qb.getMany();
    } catch (error) {
      console.error('Error getting operaciones financieras:', error);
      throw error;
    }
  });

  ipcMain.handle('get-operacion-financiera', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(OperacionFinanciera);
      return await repo.findOne({
        where: { id },
        relations: [
          'operacionFinancieraCategoria',
          'cajaMayorOrigen', 'cajaMayorDestino',
          'monedaOrigen', 'monedaDestino',
          'formaPagoOrigen', 'formaPagoDestino',
          'cuentaBancariaOrigen', 'cuentaBancariaDestino',
          'createdBy', 'createdBy.persona',
        ],
      });
    } catch (error) {
      console.error(`Error getting operacion financiera ${id}:`, error);
      throw error;
    }
  });

  // Crear operacion financiera transaccional con form dinamico segun tipo:
  // CAMBIO_DIVISA, DEPOSITO_BANCARIO, RETIRO_BANCARIO, TRANSFERENCIA_ENTRE_CAJAS
  ipcMain.handle('create-operacion-financiera', async (_event, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const tipoOp = data.tipoOperacion as TipoOperacionFinanciera;
      const currentUser = getCurrentUser();

      const op = queryRunner.manager.create(OperacionFinanciera, {
        tipoOperacion: tipoOp,
        operacionFinancieraCategoria: data.operacionFinancieraCategoriaId
          ? { id: data.operacionFinancieraCategoriaId }
          : null,
        descripcion: (data.descripcion || '').toUpperCase(),
        fecha: data.fecha || new Date(),
        cotizacion: data.cotizacion || null,
        numeroComprobante: data.numeroComprobante?.toUpperCase() || null,
        comprobanteUrl: data.comprobanteUrl || null,
        diferencia: data.diferencia || 0,
        diferenciaDestinoTipo: data.diferenciaDestinoTipo || null,
        diferenciaObservacion: data.diferenciaObservacion?.toUpperCase() || null,
        observacion: data.observacion?.toUpperCase() || null,
        cajaMayorOrigen: data.cajaMayorOrigenId ? { id: data.cajaMayorOrigenId } : null,
        monedaOrigen: data.monedaOrigenId ? { id: data.monedaOrigenId } : null,
        formaPagoOrigen: data.formaPagoOrigenId ? { id: data.formaPagoOrigenId } : null,
        montoOrigen: data.montoOrigen || null,
        cuentaBancariaOrigen: data.cuentaBancariaOrigenId ? { id: data.cuentaBancariaOrigenId } : null,
        cajaMayorDestino: data.cajaMayorDestinoId ? { id: data.cajaMayorDestinoId } : null,
        monedaDestino: data.monedaDestinoId ? { id: data.monedaDestinoId } : null,
        formaPagoDestino: data.formaPagoDestinoId ? { id: data.formaPagoDestinoId } : null,
        montoDestino: data.montoDestino || null,
        cuentaBancariaDestino: data.cuentaBancariaDestinoId ? { id: data.cuentaBancariaDestinoId } : null,
      });
      await setEntityUserTracking(dataSource, op, currentUser?.id, false);
      const savedOp = await queryRunner.manager.save(OperacionFinanciera, op);
      const opId = savedOp.id;

      switch (tipoOp) {
        case TipoOperacionFinanciera.CAMBIO_DIVISA: {
          const cmId = data.cajaMayorOrigenId;
          const movOut = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.EGRESO_OPERACION_FINANCIERA,
            moneda: { id: data.monedaOrigenId },
            formaPago: { id: data.formaPagoOrigenId },
            monto: data.montoOrigen,
            fecha: data.fecha || new Date(),
            observacion: `CAMBIO DIVISA (SALIDA): ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movOut.responsable = currentUser;
          await setEntityUserTracking(dataSource, movOut, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movOut);
          await actualizarSaldo(queryRunner, cmId, data.monedaOrigenId, data.formaPagoOrigenId, Number(data.montoOrigen), TipoMovimiento.EGRESO_OPERACION_FINANCIERA);

          const movIn = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.INGRESO_OPERACION_FINANCIERA,
            moneda: { id: data.monedaDestinoId },
            formaPago: { id: data.formaPagoDestinoId },
            monto: data.montoDestino,
            fecha: data.fecha || new Date(),
            observacion: `CAMBIO DIVISA (ENTRADA): ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movIn.responsable = currentUser;
          await setEntityUserTracking(dataSource, movIn, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movIn);
          await actualizarSaldo(queryRunner, cmId, data.monedaDestinoId, data.formaPagoDestinoId, Number(data.montoDestino), TipoMovimiento.INGRESO_OPERACION_FINANCIERA);
          break;
        }

        case TipoOperacionFinanciera.DEPOSITO_BANCARIO: {
          const cmId = data.cajaMayorOrigenId;
          const movOut = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.EGRESO_DEPOSITO_BANCO,
            moneda: { id: data.monedaOrigenId },
            formaPago: { id: data.formaPagoOrigenId },
            monto: data.montoOrigen,
            fecha: data.fecha || new Date(),
            observacion: `DEPOSITO BANCO: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movOut.responsable = currentUser;
          await setEntityUserTracking(dataSource, movOut, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movOut);
          await actualizarSaldo(queryRunner, cmId, data.monedaOrigenId, data.formaPagoOrigenId, Number(data.montoOrigen), TipoMovimiento.EGRESO_DEPOSITO_BANCO);

          const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
          const cb = await cbRepo.findOne({ where: { id: data.cuentaBancariaDestinoId } });
          if (!cb) throw new Error(`Cuenta bancaria destino ${data.cuentaBancariaDestinoId} no encontrada`);
          cb.saldo = Number(cb.saldo) + Number(data.montoDestino);
          await queryRunner.manager.save(CuentaBancaria, cb);
          break;
        }

        case TipoOperacionFinanciera.RETIRO_BANCARIO: {
          const cmId = data.cajaMayorDestinoId;
          const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
          const cb = await cbRepo.findOne({ where: { id: data.cuentaBancariaOrigenId } });
          if (!cb) throw new Error(`Cuenta bancaria origen ${data.cuentaBancariaOrigenId} no encontrada`);
          cb.saldo = Number(cb.saldo) - Number(data.montoOrigen);
          await queryRunner.manager.save(CuentaBancaria, cb);

          const movIn = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cmId },
            tipoMovimiento: TipoMovimiento.INGRESO_RETIRO_BANCO,
            moneda: { id: data.monedaDestinoId },
            formaPago: { id: data.formaPagoDestinoId },
            monto: data.montoDestino,
            fecha: data.fecha || new Date(),
            observacion: `RETIRO BANCO: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movIn.responsable = currentUser;
          await setEntityUserTracking(dataSource, movIn, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movIn);
          await actualizarSaldo(queryRunner, cmId, data.monedaDestinoId, data.formaPagoDestinoId, Number(data.montoDestino), TipoMovimiento.INGRESO_RETIRO_BANCO);
          break;
        }

        case TipoOperacionFinanciera.TRANSFERENCIA_ENTRE_CAJAS: {
          const movOut = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: data.cajaMayorOrigenId },
            tipoMovimiento: TipoMovimiento.TRANSFERENCIA_SALIDA,
            moneda: { id: data.monedaOrigenId },
            formaPago: { id: data.formaPagoOrigenId },
            monto: data.montoOrigen,
            fecha: data.fecha || new Date(),
            observacion: `TRANSFERENCIA → CM #${data.cajaMayorDestinoId}: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movOut.responsable = currentUser;
          await setEntityUserTracking(dataSource, movOut, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movOut);
          await actualizarSaldo(queryRunner, data.cajaMayorOrigenId, data.monedaOrigenId, data.formaPagoOrigenId, Number(data.montoOrigen), TipoMovimiento.TRANSFERENCIA_SALIDA);

          const movIn = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: data.cajaMayorDestinoId },
            tipoMovimiento: TipoMovimiento.TRANSFERENCIA_ENTRADA,
            moneda: { id: data.monedaDestinoId },
            formaPago: { id: data.formaPagoDestinoId },
            monto: data.montoDestino,
            fecha: data.fecha || new Date(),
            observacion: `TRANSFERENCIA ← CM #${data.cajaMayorOrigenId}: ${data.descripcion || ''}`.toUpperCase(),
            operacionFinancieraId: opId,
          });
          if (currentUser) movIn.responsable = currentUser;
          await setEntityUserTracking(dataSource, movIn, currentUser?.id, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movIn);
          await actualizarSaldo(queryRunner, data.cajaMayorDestinoId, data.monedaDestinoId, data.formaPagoDestinoId, Number(data.montoDestino), TipoMovimiento.TRANSFERENCIA_ENTRADA);
          break;
        }
      }

      // Diferencia opcional → AJUSTE_POSITIVO/NEGATIVO en moneda destino
      if (data.diferencia && Number(data.diferencia) !== 0 && data.diferenciaDestinoTipo && data.diferenciaDestinoTipo !== DiferenciaDestinoTipo.IGNORAR) {
        const diferencia = Number(data.diferencia);
        const cmId = data.cajaMayorDestinoId || data.cajaMayorOrigenId;
        const monId = data.monedaDestinoId || data.monedaOrigenId;
        const fpId = data.formaPagoDestinoId || data.formaPagoOrigenId;
        const tipoMov = diferencia > 0 ? TipoMovimiento.AJUSTE_POSITIVO : TipoMovimiento.AJUSTE_NEGATIVO;
        const tipoMovDescriptor = data.diferenciaDestinoTipo === DiferenciaDestinoTipo.GASTO ? 'GASTO POR DIFERENCIA' : 'VALE POR DIFERENCIA';

        const movDif = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cmId },
          tipoMovimiento: tipoMov,
          moneda: { id: monId },
          formaPago: { id: fpId },
          monto: Math.abs(diferencia),
          fecha: data.fecha || new Date(),
          observacion: `${tipoMovDescriptor}: ${data.diferenciaObservacion || ''}`.toUpperCase(),
          operacionFinancieraId: opId,
        });
        if (currentUser) movDif.responsable = currentUser;
        await setEntityUserTracking(dataSource, movDif, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movDif);
        await actualizarSaldo(queryRunner, cmId, monId, fpId, Math.abs(diferencia), tipoMov);
      }

      await queryRunner.commitTransaction();
      return savedOp;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating operacion financiera:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-operacion-financiera', async (_event, id: number, motivo: string) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const opRepo = queryRunner.manager.getRepository(OperacionFinanciera);
      const op = await opRepo.findOne({
        where: { id },
        relations: ['cuentaBancariaOrigen', 'cuentaBancariaDestino'],
      });
      if (!op) throw new Error(`OperacionFinanciera ${id} no encontrada`);
      if (op.anulado) throw new Error('La operacion ya esta anulada');

      op.anulado = true;
      await setEntityUserTracking(dataSource, op, getCurrentUser()?.id, true);
      await queryRunner.manager.save(OperacionFinanciera, op);

      const movRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const movs = await movRepo.find({
        where: { operacionFinancieraId: id },
        relations: ['cajaMayor', 'moneda', 'formaPago'],
      });

      const currentUser = getCurrentUser();
      for (const mov of movs) {
        if (mov.tipoMovimiento === TipoMovimiento.ANULACION) continue;

        const contra = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: mov.cajaMayor,
          tipoMovimiento: TipoMovimiento.ANULACION,
          moneda: mov.moneda,
          formaPago: mov.formaPago,
          monto: mov.monto,
          fecha: new Date(),
          observacion: `ANULACION OP. FIN. #${id}: ${motivo}`.toUpperCase(),
          operacionFinancieraId: id,
          referenciaAnulacion: mov,
        });
        if (currentUser) contra.responsable = currentUser;
        await setEntityUserTracking(dataSource, contra, currentUser?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, contra);

        const tipoContrario = esIngreso(mov.tipoMovimiento)
          ? TipoMovimiento.AJUSTE_NEGATIVO
          : TipoMovimiento.AJUSTE_POSITIVO;
        await actualizarSaldo(queryRunner, mov.cajaMayor.id, mov.moneda.id, mov.formaPago.id, Number(mov.monto), tipoContrario);
      }

      const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
      if (op.tipoOperacion === TipoOperacionFinanciera.DEPOSITO_BANCARIO && op.cuentaBancariaDestino) {
        const cb = await cbRepo.findOne({ where: { id: op.cuentaBancariaDestino.id } });
        if (cb) {
          cb.saldo = Number(cb.saldo) - Number(op.montoDestino || 0);
          await queryRunner.manager.save(CuentaBancaria, cb);
        }
      } else if (op.tipoOperacion === TipoOperacionFinanciera.RETIRO_BANCARIO && op.cuentaBancariaOrigen) {
        const cb = await cbRepo.findOne({ where: { id: op.cuentaBancariaOrigen.id } });
        if (cb) {
          cb.saldo = Number(cb.saldo) + Number(op.montoOrigen || 0);
          await queryRunner.manager.save(CuentaBancaria, cb);
        }
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error anulando operacion financiera ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });
}
