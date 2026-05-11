import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Cargo } from '../../src/app/database/entities/rrhh/cargo.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { HistoricoCargo } from '../../src/app/database/entities/rrhh/historico-cargo.entity';
import { HistoricoSalario } from '../../src/app/database/entities/rrhh/historico-salario.entity';
import { Persona } from '../../src/app/database/entities/personas/persona.entity';
import { Cargo as CargoEnt } from '../../src/app/database/entities/rrhh/cargo.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';

export function registerRrhhFuncionariosHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ========================= CARGOS =========================
  ipcMain.handle('get-cargos', async () => {
    try {
      const repo = dataSource.getRepository(Cargo);
      return await repo.find({ order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting cargos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-cargo', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(Cargo);
      return await repo.findOne({ where: { id } });
    } catch (error) {
      console.error(`Error getting cargo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-cargo', async (_event, data: any) => {
    try {
      const repo = dataSource.getRepository(Cargo);
      const entity = repo.create({
        nombre: (data.nombre || '').toUpperCase(),
        descripcion: data.descripcion,
        salarioReferencia: data.salarioReferencia,
        activo: data.activo !== false,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating cargo:', error);
      throw error;
    }
  });

  ipcMain.handle('update-cargo', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Cargo);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`Cargo ${id} no encontrado`);
      if (data.nombre !== undefined) existing.nombre = (data.nombre || '').toUpperCase();
      if (data.descripcion !== undefined) existing.descripcion = data.descripcion;
      if (data.salarioReferencia !== undefined) existing.salarioReferencia = data.salarioReferencia;
      if (data.activo !== undefined) existing.activo = data.activo;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating cargo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-cargo', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(Cargo);
      // Soft delete: marcar inactivo
      const existing = await repo.findOne({ where: { id } });
      if (!existing) return { success: false, message: 'Cargo no encontrado' };
      existing.activo = false;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      await repo.save(existing);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting cargo ${id}:`, error);
      throw error;
    }
  });

  // ========================= FUNCIONARIOS =========================
  ipcMain.handle('get-funcionarios', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(Funcionario);
      const qb = repo.createQueryBuilder('f')
        .leftJoinAndSelect('f.persona', 'persona')
        .leftJoinAndSelect('f.cargo', 'cargo')
        .leftJoinAndSelect('f.monedaSalario', 'moneda')
        .leftJoinAndSelect('f.usuario', 'usuario')
        .orderBy('persona.nombre', 'ASC');

      if (filtros?.soloActivos) {
        qb.andWhere('f.activo = :a', { a: true });
      }
      if (filtros?.cargoId) {
        qb.andWhere('cargo.id = :cId', { cId: filtros.cargoId });
      }
      if (filtros?.busqueda) {
        const b = `%${filtros.busqueda.toUpperCase()}%`;
        qb.andWhere('(persona.nombre LIKE :b OR persona.apellido LIKE :b OR f.codigo_interno LIKE :b)', { b });
      }
      return await qb.getMany();
    } catch (error) {
      console.error('Error getting funcionarios:', error);
      throw error;
    }
  });

  ipcMain.handle('get-funcionario', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(Funcionario);
      return await repo.findOne({
        where: { id },
        relations: ['persona', 'cargo', 'monedaSalario', 'usuario'],
      });
    } catch (error) {
      console.error(`Error getting funcionario ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-funcionario', async (_event, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const funcRepo = queryRunner.manager.getRepository(Funcionario);
      const histCargoRepo = queryRunner.manager.getRepository(HistoricoCargo);
      const histSalarioRepo = queryRunner.manager.getRepository(HistoricoSalario);

      const persona = await queryRunner.manager.findOne(Persona, { where: { id: data.personaId } });
      if (!persona) throw new Error(`Persona ${data.personaId} no encontrada`);
      const cargo = await queryRunner.manager.findOne(CargoEnt, { where: { id: data.cargoId } });
      if (!cargo) throw new Error(`Cargo ${data.cargoId} no encontrado`);
      const moneda = await queryRunner.manager.findOne(Moneda, { where: { id: data.monedaSalarioId } });
      if (!moneda) throw new Error(`Moneda ${data.monedaSalarioId} no encontrada`);
      let usuario: Usuario | null = null;
      if (data.usuarioId) {
        usuario = await queryRunner.manager.findOne(Usuario, { where: { id: data.usuarioId } });
      }

      const fechaIngresoLocal = parseLocalDate(data.fechaIngreso) || new Date();
      const entity = funcRepo.create({
        persona,
        codigoInterno: data.codigoInterno ? String(data.codigoInterno).toUpperCase() : undefined,
        cargo,
        fechaIngreso: fechaIngresoLocal,
        salarioBase: data.salarioBase,
        monedaSalario: moneda,
        esJornalero: data.esJornalero === true,
        valorJornal: data.valorJornal,
        usuario: usuario || undefined,
        ipsActivo: data.ipsActivo === true,
        numeroIps: data.numeroIps,
        cuentaBancariaPropia: data.cuentaBancariaPropia,
        observacion: data.observacion,
        activo: data.activo !== false,
      });
      const userId = getCurrentUser()?.id;
      await setEntityUserTracking(dataSource, entity, userId, false);
      const saved = await funcRepo.save(entity);

      // Historico cargo inicial
      const histCargo = histCargoRepo.create({
        funcionario: saved,
        cargo,
        fechaDesde: fechaIngresoLocal,
        motivo: 'INGRESO',
      });
      await setEntityUserTracking(dataSource, histCargo, userId, false);
      await histCargoRepo.save(histCargo);

      // Historico salario inicial
      const histSalario = histSalarioRepo.create({
        funcionario: saved,
        salarioAnterior: undefined,
        salarioNuevo: data.salarioBase,
        moneda,
        fechaVigencia: fechaIngresoLocal,
        motivo: 'INGRESO',
      });
      await setEntityUserTracking(dataSource, histSalario, userId, false);
      await histSalarioRepo.save(histSalario);

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating funcionario:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('update-funcionario', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Funcionario);
      const existing = await repo.findOne({ where: { id }, relations: ['persona', 'cargo', 'monedaSalario', 'usuario'] });
      if (!existing) throw new Error(`Funcionario ${id} no encontrado`);

      if (data.codigoInterno !== undefined) existing.codigoInterno = data.codigoInterno ? String(data.codigoInterno).toUpperCase() : undefined;
      if (data.esJornalero !== undefined) existing.esJornalero = data.esJornalero;
      if (data.valorJornal !== undefined) existing.valorJornal = data.valorJornal;
      if (data.ipsActivo !== undefined) existing.ipsActivo = data.ipsActivo;
      if (data.numeroIps !== undefined) existing.numeroIps = data.numeroIps;
      if (data.cuentaBancariaPropia !== undefined) existing.cuentaBancariaPropia = data.cuentaBancariaPropia;
      if (data.observacion !== undefined) existing.observacion = data.observacion;
      if (data.activo !== undefined) existing.activo = data.activo;
      if (data.usuarioId !== undefined) {
        if (data.usuarioId === null) existing.usuario = undefined;
        else {
          const u = await dataSource.getRepository(Usuario).findOne({ where: { id: data.usuarioId } });
          if (u) existing.usuario = u;
        }
      }

      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating funcionario ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('cambiar-cargo-funcionario', async (_event, id: number, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const funcRepo = queryRunner.manager.getRepository(Funcionario);
      const histRepo = queryRunner.manager.getRepository(HistoricoCargo);

      const funcionario = await funcRepo.findOne({ where: { id }, relations: ['cargo'] });
      if (!funcionario) throw new Error(`Funcionario ${id} no encontrado`);
      const nuevoCargo = await queryRunner.manager.findOne(CargoEnt, { where: { id: data.nuevoCargoId } });
      if (!nuevoCargo) throw new Error(`Cargo ${data.nuevoCargoId} no encontrado`);
      const fechaDesde = parseLocalDate(data.fechaDesde) ?? new Date();

      // Cerrar historico cargo activo
      const activo = await histRepo
        .createQueryBuilder('h')
        .where('h.funcionario_id = :fid', { fid: id })
        .andWhere('h.fecha_hasta IS NULL')
        .getOne();
      if (activo) {
        activo.fechaHasta = fechaDesde;
        await histRepo.save(activo);
      }

      const userId = getCurrentUser()?.id;
      const nuevo = histRepo.create({
        funcionario,
        cargo: nuevoCargo,
        fechaDesde,
        motivo: data.motivo || 'CAMBIO_CARGO',
      });
      await setEntityUserTracking(dataSource, nuevo, userId, false);
      await histRepo.save(nuevo);

      funcionario.cargo = nuevoCargo;
      await setEntityUserTracking(dataSource, funcionario, userId, true);
      await funcRepo.save(funcionario);

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error cambiando cargo del funcionario ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('cambiar-salario-funcionario', async (_event, id: number, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const funcRepo = queryRunner.manager.getRepository(Funcionario);
      const histRepo = queryRunner.manager.getRepository(HistoricoSalario);

      const funcionario = await funcRepo.findOne({ where: { id }, relations: ['monedaSalario'] });
      if (!funcionario) throw new Error(`Funcionario ${id} no encontrado`);

      const moneda = data.monedaId
        ? await queryRunner.manager.findOne(Moneda, { where: { id: data.monedaId } })
        : funcionario.monedaSalario;
      if (!moneda) throw new Error('Moneda invalida');

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;
      const nuevo = histRepo.create({
        funcionario,
        salarioAnterior: funcionario.salarioBase,
        salarioNuevo: data.salarioNuevo,
        moneda,
        fechaVigencia: parseLocalDate(data.fechaVigencia) ?? new Date(),
        motivo: data.motivo || 'AJUSTE_SALARIAL',
        autorizadoPor: userEntity || undefined,
      });
      await setEntityUserTracking(dataSource, nuevo, userId, false);
      await histRepo.save(nuevo);

      funcionario.salarioBase = data.salarioNuevo;
      funcionario.monedaSalario = moneda;
      await setEntityUserTracking(dataSource, funcionario, userId, true);
      await funcRepo.save(funcionario);

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error cambiando salario del funcionario ${id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('egresar-funcionario', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Funcionario);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`Funcionario ${id} no encontrado`);
      existing.fechaEgreso = parseLocalDate(data.fechaEgreso) || new Date();
      existing.motivoEgreso = data.motivoEgreso;
      existing.activo = false;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error egresando funcionario ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-historico-cargos', async (_event, funcionarioId: number) => {
    try {
      const repo = dataSource.getRepository(HistoricoCargo);
      return await repo.find({
        where: { funcionario: { id: funcionarioId } as any },
        relations: ['cargo'],
        order: { fechaDesde: 'DESC' },
      });
    } catch (error) {
      console.error('Error getting historico cargos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-historico-salarios', async (_event, funcionarioId: number) => {
    try {
      const repo = dataSource.getRepository(HistoricoSalario);
      return await repo.find({
        where: { funcionario: { id: funcionarioId } as any },
        relations: ['moneda'],
        order: { fechaVigencia: 'DESC' },
      });
    } catch (error) {
      console.error('Error getting historico salarios:', error);
      throw error;
    }
  });
}
