import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { ValeEstado } from '../../src/app/database/entities/rrhh/vale-estado.enum';
import { MotivoVale } from '../../src/app/database/entities/rrhh/motivo-vale.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { CajaMayor } from '../../src/app/database/entities/financiero/caja-mayor.entity';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { ensurePermission } from '../utils/auth.utils';

export function registerValesHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ============= MOTIVOS =============
  ipcMain.handle('get-motivos-vale', async () => {
    return await dataSource.getRepository(MotivoVale).find({ order: { nombre: 'ASC' } });
  });

  ipcMain.handle('create-motivo-vale', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(MotivoVale);
    const entity = repo.create({
      nombre: (data.nombre || '').toUpperCase(),
      descripcion: data.descripcion,
      activo: data.activo !== false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('update-motivo-vale', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(MotivoVale);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`MotivoVale ${id} no encontrado`);
    if (data.nombre !== undefined) existing.nombre = (data.nombre || '').toUpperCase();
    if (data.descripcion !== undefined) existing.descripcion = data.descripcion;
    if (data.activo !== undefined) existing.activo = data.activo;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  ipcMain.handle('delete-motivo-vale', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(MotivoVale);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) return { success: false };
    existing.activo = false;
    await repo.save(existing);
    return { success: true };
  });

  // ============= VALES =============
  ipcMain.handle('get-vales', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(Vale);
    const qb = repo.createQueryBuilder('v')
      .leftJoinAndSelect('v.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .leftJoinAndSelect('v.motivo', 'm')
      .leftJoinAndSelect('v.cajaMayor', 'cm')
      .leftJoinAndSelect('v.moneda', 'mon')
      .leftJoinAndSelect('v.formaPago', 'fp')
      .orderBy('v.fecha', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.estado) qb.andWhere('v.estado = :e', { e: filtros.estado });
    if (filtros?.fechaDesde && filtros?.fechaHasta) {
      qb.andWhere('v.fecha BETWEEN :fd AND :fh', { fd: filtros.fechaDesde, fh: filtros.fechaHasta });
    }
    if (filtros?.esAdelanto !== undefined) qb.andWhere('v.es_adelanto = :a', { a: filtros.esAdelanto });
    return await qb.getMany();
  });

  ipcMain.handle('get-vales-pendientes-descuento', async (_e, funcionarioId: number) => {
    const repo = dataSource.getRepository(Vale);
    return await repo.find({
      where: {
        funcionario: { id: funcionarioId } as any,
        estado: ValeEstado.CONFIRMADO,
      },
      relations: ['motivo', 'moneda'],
      order: { fecha: 'ASC' },
    });
  });

  ipcMain.handle('create-vale', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_VALE_CREAR');
    const repo = dataSource.getRepository(Vale);
    const funcionario = await dataSource.getRepository(Funcionario).findOne({ where: { id: data.funcionarioId } });
    if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);
    const moneda = await dataSource.getRepository(Moneda).findOne({ where: { id: data.monedaId } });
    if (!moneda) throw new Error(`Moneda ${data.monedaId} no encontrada`);

    const entity = repo.create({
      funcionario,
      motivo: data.motivoId ? { id: data.motivoId } as any : undefined,
      monto: data.monto,
      fecha: parseLocalDate(data.fecha) || new Date(),
      descripcion: data.descripcion,
      cajaMayor: data.cajaMayorId ? { id: data.cajaMayorId } as any : undefined,
      moneda,
      formaPago: data.formaPagoId ? { id: data.formaPagoId } as any : undefined,
      estado: ValeEstado.SOLICITADO,
      esAdelanto: data.esAdelanto === true,
      comprobanteUrl: data.comprobanteUrl,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  // Crea un vale y lo confirma en una sola transaccion (egreso directo desde Caja Mayor)
  ipcMain.handle('crear-vale-confirmado', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_VALE_CREAR');
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_VALE_CONFIRMAR');

    const esBanco = data?.fuente === 'CUENTA_BANCARIA';
    if (!data?.funcionarioId) throw new Error('Funcionario requerido');
    if (!data?.monedaId) throw new Error('Moneda requerida');
    if (esBanco) {
      if (!data?.cuentaBancariaId) throw new Error('Cuenta bancaria requerida');
    } else {
      if (!data?.cajaMayorId) throw new Error('Caja Mayor requerida');
      if (!data?.formaPagoId) throw new Error('Forma de pago requerida');
    }
    const monto = Number(data.monto);
    if (!monto || monto <= 0) throw new Error('Monto invalido');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const funcionario = await queryRunner.manager.findOne(Funcionario, {
        where: { id: data.funcionarioId },
        relations: ['persona'],
      });
      if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);
      const moneda = await queryRunner.manager.findOne(Moneda, { where: { id: data.monedaId } });
      if (!moneda) throw new Error(`Moneda ${data.monedaId} no encontrada`);

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      if (esBanco) {
        // Egreso del vale desde una cuenta bancaria: debita el saldo, sin
        // movimiento de Caja Mayor.
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: data.cuentaBancariaId } });
        if (!cb) throw new Error(`Cuenta bancaria ${data.cuentaBancariaId} no encontrada`);
        const cajaMayor = data.cajaMayorId
          ? await queryRunner.manager.findOne(CajaMayor, { where: { id: data.cajaMayorId } })
          : null;

        const vale = queryRunner.manager.create(Vale, {
          funcionario,
          motivo: data.motivoId ? { id: data.motivoId } as any : undefined,
          monto,
          fecha: parseLocalDate(data.fecha) || new Date(),
          descripcion: data.descripcion,
          cajaMayor: cajaMayor || undefined,
          moneda,
          estado: ValeEstado.CONFIRMADO,
          esAdelanto: data.esAdelanto === true,
          comprobanteUrl: data.comprobanteUrl,
          cuentaBancariaId: cb.id,
          autorizadoPor: userEntity || undefined,
        });
        await setEntityUserTracking(dataSource, vale, userId, false);
        const valeSaved = await queryRunner.manager.save(Vale, vale);

        cb.saldo = Number(cb.saldo) - monto;
        await queryRunner.manager.save(CuentaBancaria, cb);

        await queryRunner.commitTransaction();
        return valeSaved;
      }

      const cajaMayor = await queryRunner.manager.findOne(CajaMayor, { where: { id: data.cajaMayorId } });
      if (!cajaMayor) throw new Error(`Caja Mayor ${data.cajaMayorId} no encontrada`);
      const formaPago = await queryRunner.manager.findOne(FormasPago, { where: { id: data.formaPagoId } });
      if (!formaPago) throw new Error(`Forma de pago ${data.formaPagoId} no encontrada`);

      const vale = queryRunner.manager.create(Vale, {
        funcionario,
        motivo: data.motivoId ? { id: data.motivoId } as any : undefined,
        monto,
        fecha: parseLocalDate(data.fecha) || new Date(),
        descripcion: data.descripcion,
        cajaMayor,
        moneda,
        formaPago,
        estado: ValeEstado.CONFIRMADO,
        esAdelanto: data.esAdelanto === true,
        comprobanteUrl: data.comprobanteUrl,
        autorizadoPor: userEntity || undefined,
      });
      await setEntityUserTracking(dataSource, vale, userId, false);
      const valeSaved = await queryRunner.manager.save(Vale, vale);

      const obs = `VALE #${valeSaved.id} - ${funcionario.persona?.nombre || ''} ${funcionario.persona?.apellido || ''}`.trim();
      const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
        cajaMayor: { id: cajaMayor.id } as any,
        tipoMovimiento: TipoMovimiento.EGRESO_VALE,
        moneda: { id: moneda.id } as any,
        formaPago: { id: formaPago.id } as any,
        monto,
        fecha: new Date(),
        observacion: obs,
        valeId: valeSaved.id,
        responsable: userEntity || undefined,
      });
      await setEntityUserTracking(dataSource, movimiento, userId, false);
      const movSaved = await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

      await actualizarSaldoCajaMayor(queryRunner, cajaMayor.id, moneda.id, formaPago.id, monto, TipoMovimiento.EGRESO_VALE);

      valeSaved.movimientoId = movSaved.id;
      await setEntityUserTracking(dataSource, valeSaved, userId, true);
      await queryRunner.manager.save(Vale, valeSaved);

      await queryRunner.commitTransaction();
      return valeSaved;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error crear-vale-confirmado:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('confirmar-vale', async (_e, id: number, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_VALE_CONFIRMAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const valeRepo = queryRunner.manager.getRepository(Vale);
      const vale = await valeRepo.findOne({
        where: { id },
        relations: ['funcionario', 'funcionario.persona', 'cajaMayor', 'moneda', 'formaPago'],
      });
      if (!vale) throw new Error(`Vale ${id} no encontrado`);
      if (vale.estado !== ValeEstado.SOLICITADO) {
        throw new Error(`Vale en estado ${vale.estado}, no se puede confirmar`);
      }

      const esBanco = payload?.fuente === 'CUENTA_BANCARIA';
      const monedaId = payload?.monedaId || vale.moneda?.id;

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      if (esBanco) {
        // Egreso del vale desde cuenta bancaria: debita el saldo, sin caja mayor.
        const cuentaBancariaId = payload?.cuentaBancariaId;
        if (!cuentaBancariaId || !monedaId) {
          throw new Error('Faltan datos para confirmar el vale (cuenta bancaria, moneda)');
        }
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: cuentaBancariaId } });
        if (!cb) throw new Error(`Cuenta bancaria ${cuentaBancariaId} no encontrada`);
        cb.saldo = Number(cb.saldo) - Number(vale.monto);
        await queryRunner.manager.save(CuentaBancaria, cb);

        vale.estado = ValeEstado.CONFIRMADO;
        vale.cuentaBancariaId = cb.id;
        vale.moneda = { id: monedaId } as any;
        vale.autorizadoPor = userEntity || undefined;
        await setEntityUserTracking(dataSource, vale, userId, true);
        await valeRepo.save(vale);

        await queryRunner.commitTransaction();
        return vale;
      }

      // Permitir override de cajaMayor/forma pago al confirmar
      const cajaMayorId = payload?.cajaMayorId || vale.cajaMayor?.id;
      const formaPagoId = payload?.formaPagoId || vale.formaPago?.id;
      if (!cajaMayorId || !monedaId || !formaPagoId) {
        throw new Error('Faltan datos para confirmar el vale (caja mayor, moneda, forma de pago)');
      }

      const obs = `VALE #${vale.id} - ${vale.funcionario.persona?.nombre || ''} ${vale.funcionario.persona?.apellido || ''}`.trim();
      const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
        cajaMayor: { id: cajaMayorId } as any,
        tipoMovimiento: TipoMovimiento.EGRESO_VALE,
        moneda: { id: monedaId } as any,
        formaPago: { id: formaPagoId } as any,
        monto: vale.monto,
        fecha: new Date(),
        observacion: obs,
        valeId: vale.id,
        responsable: userEntity || undefined,
      });
      await setEntityUserTracking(dataSource, movimiento, userId, false);
      const movSaved = await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

      await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, Number(vale.monto), TipoMovimiento.EGRESO_VALE);

      vale.estado = ValeEstado.CONFIRMADO;
      vale.movimientoId = movSaved.id;
      vale.cajaMayor = { id: cajaMayorId } as any;
      vale.moneda = { id: monedaId } as any;
      vale.formaPago = { id: formaPagoId } as any;
      vale.autorizadoPor = userEntity || undefined;
      await setEntityUserTracking(dataSource, vale, userId, true);
      await valeRepo.save(vale);

      await queryRunner.commitTransaction();
      return vale;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error confirmar-vale:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-vale', async (_e, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_VALE_CONFIRMAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const valeRepo = queryRunner.manager.getRepository(Vale);
      const vale = await valeRepo.findOne({ where: { id }, relations: ['cajaMayor', 'moneda', 'formaPago'] });
      if (!vale) throw new Error(`Vale ${id} no encontrado`);

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      // Si fue confirmado desde cuenta bancaria, revertir el débito bancario.
      if (vale.estado === ValeEstado.CONFIRMADO && vale.cuentaBancariaId) {
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: vale.cuentaBancariaId } });
        if (cb) {
          cb.saldo = Number(cb.saldo) + Number(vale.monto);
          await queryRunner.manager.save(CuentaBancaria, cb);
        }
      }

      // Si fue confirmado desde caja mayor, generar contra-movimiento
      if (vale.estado === ValeEstado.CONFIRMADO && vale.movimientoId) {
        const movOriginal = await queryRunner.manager.findOne(CajaMayorMovimiento, {
          where: { id: vale.movimientoId },
          relations: ['cajaMayor', 'moneda', 'formaPago'],
        });
        if (movOriginal) {
          const cajaMayorId = movOriginal.cajaMayor?.id;
          const monedaId = movOriginal.moneda?.id;
          const formaPagoId = movOriginal.formaPago?.id;
          if (cajaMayorId && monedaId && formaPagoId) {
            const contra = queryRunner.manager.create(CajaMayorMovimiento, {
              cajaMayor: { id: cajaMayorId } as any,
              tipoMovimiento: TipoMovimiento.AJUSTE_POSITIVO,
              moneda: { id: monedaId } as any,
              formaPago: { id: formaPagoId } as any,
              monto: movOriginal.monto,
              fecha: new Date(),
              observacion: `ANULACION VALE #${vale.id}` + (motivo ? ` - ${motivo}` : ''),
              referenciaAnulacion: movOriginal,
              valeId: vale.id,
              responsable: userEntity || undefined,
            });
            await setEntityUserTracking(dataSource, contra, userId, false);
            await queryRunner.manager.save(CajaMayorMovimiento, contra);
            await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, Number(movOriginal.monto), TipoMovimiento.AJUSTE_POSITIVO);
          }
        }
      }

      vale.estado = ValeEstado.ANULADO;
      await setEntityUserTracking(dataSource, vale, userId, true);
      await valeRepo.save(vale);

      await queryRunner.commitTransaction();
      return vale;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error anular-vale:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('marcar-vale-descontado', async (_e, id: number, liquidacionId: number) => {
    const repo = dataSource.getRepository(Vale);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Vale ${id} no encontrado`);
    existing.estado = ValeEstado.DESCONTADO;
    existing.liquidacionId = liquidacionId;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });
}
