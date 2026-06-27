import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Timbrado } from '../../src/app/database/entities/facturacion/timbrado.entity';
import { TimbradoDetalle } from '../../src/app/database/entities/facturacion/timbrado-detalle.entity';
import { FacturaPlantilla } from '../../src/app/database/entities/facturacion/factura-plantilla.entity';
import { Factura, EstadoFactura } from '../../src/app/database/entities/facturacion/factura.entity';
import { FacturaItem } from '../../src/app/database/entities/facturacion/factura-item.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

/**
 * Handlers IPC del modulo de facturacion.
 *
 * Cubre CRUD de timbrados, detalles de timbrado (rangos por punto de
 * expedicion), plantillas de diseno y facturas. La numeracion de facturas se
 * asigna de forma atomica desde `TimbradoDetalle.numeroActual` dentro de una
 * transaccion para evitar numeros duplicados.
 */
export function registerFacturacionHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  const uid = () => getCurrentUser()?.id;

  // ----------------------------------------------------------------------
  // Timbrado
  // ----------------------------------------------------------------------
  ipcMain.handle('get-timbrados', async () => {
    try {
      return await dataSource.getRepository(Timbrado).find({
        relations: ['detalles'],
        order: { id: 'DESC' },
      });
    } catch (error) {
      console.error('Error getting timbrados:', error);
      throw error;
    }
  });

  ipcMain.handle('get-timbrado', async (_e: any, id: number) => {
    try {
      return await dataSource.getRepository(Timbrado).findOne({
        where: { id },
        relations: ['detalles', 'detalles.dispositivo'],
      });
    } catch (error) {
      console.error(`Error getting timbrado ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-timbrado', async (_e: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Timbrado);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, uid(), false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating timbrado:', error);
      throw error;
    }
  });

  ipcMain.handle('update-timbrado', async (_e: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Timbrado);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Timbrado ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, uid(), true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating timbrado ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-timbrado', async (_e: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Timbrado);
      const facturaRepo = dataSource.getRepository(Factura);
      const usados = await facturaRepo
        .createQueryBuilder('f')
        .innerJoin('f.timbradoDetalle', 'td')
        .where('td.timbrado_id = :id', { id })
        .getCount();
      if (usados > 0) {
        throw new Error('No se puede eliminar: el timbrado tiene facturas emitidas. Desactivelo en su lugar.');
      }
      await dataSource.getRepository(TimbradoDetalle).delete({ timbrado: { id } as any });
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Timbrado ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting timbrado ${id}:`, error);
      throw error;
    }
  });

  // ----------------------------------------------------------------------
  // TimbradoDetalle
  // ----------------------------------------------------------------------
  ipcMain.handle('get-timbrado-detalles', async (_e: any, timbradoId?: number) => {
    try {
      const repo = dataSource.getRepository(TimbradoDetalle);
      const where = timbradoId ? { timbrado: { id: timbradoId } as any } : {};
      return await repo.find({ where, relations: ['timbrado', 'dispositivo'], order: { id: 'DESC' } });
    } catch (error) {
      console.error('Error getting timbrado detalles:', error);
      throw error;
    }
  });

  ipcMain.handle('create-timbrado-detalle', async (_e: any, data: any) => {
    try {
      const repo = dataSource.getRepository(TimbradoDetalle);
      if (data.numeroActual == null) data.numeroActual = data.rangoDesde ?? 1;
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, uid(), false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating timbrado detalle:', error);
      throw error;
    }
  });

  ipcMain.handle('update-timbrado-detalle', async (_e: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(TimbradoDetalle);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`TimbradoDetalle ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, uid(), true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating timbrado detalle ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-timbrado-detalle', async (_e: any, id: number) => {
    try {
      const repo = dataSource.getRepository(TimbradoDetalle);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`TimbradoDetalle ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting timbrado detalle ${id}:`, error);
      throw error;
    }
  });

  // ----------------------------------------------------------------------
  // FacturaPlantilla (disenos)
  // ----------------------------------------------------------------------
  ipcMain.handle('get-factura-plantillas', async (_e: any, tipo?: string) => {
    try {
      const repo = dataSource.getRepository(FacturaPlantilla);
      const where = tipo ? { tipo: tipo as any } : {};
      return await repo.find({ where, order: { id: 'DESC' } });
    } catch (error) {
      console.error('Error getting factura plantillas:', error);
      throw error;
    }
  });

  ipcMain.handle('get-factura-plantilla', async (_e: any, id: number) => {
    try {
      return await dataSource.getRepository(FacturaPlantilla).findOneBy({ id });
    } catch (error) {
      console.error(`Error getting factura plantilla ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-factura-plantilla', async (_e: any, data: any) => {
    try {
      const repo = dataSource.getRepository(FacturaPlantilla);
      if (data.predeterminada) {
        await repo.update({ tipo: data.tipo, predeterminada: true }, { predeterminada: false });
      }
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, uid(), false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating factura plantilla:', error);
      throw error;
    }
  });

  ipcMain.handle('update-factura-plantilla', async (_e: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(FacturaPlantilla);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`FacturaPlantilla ${id} not found`);
      if (data.predeterminada) {
        await repo.update({ tipo: entity.tipo, predeterminada: true }, { predeterminada: false });
      }
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, uid(), true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating factura plantilla ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-factura-plantilla', async (_e: any, id: number) => {
    try {
      const repo = dataSource.getRepository(FacturaPlantilla);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`FacturaPlantilla ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting factura plantilla ${id}:`, error);
      throw error;
    }
  });

  // ----------------------------------------------------------------------
  // Factura
  // ----------------------------------------------------------------------
  ipcMain.handle('get-facturas', async (_e: any, filtros: any = {}) => {
    try {
      const repo = dataSource.getRepository(Factura);
      const qb = repo.createQueryBuilder('f')
        .leftJoinAndSelect('f.cliente', 'cliente')
        .leftJoinAndSelect('f.moneda', 'moneda')
        .leftJoinAndSelect('f.timbradoDetalle', 'td')
        .orderBy('f.id', 'DESC');
      if (filtros?.estado) qb.andWhere('f.estado = :estado', { estado: filtros.estado });
      if (filtros?.tipoFacturacion) qb.andWhere('f.tipo_facturacion = :tf', { tf: filtros.tipoFacturacion });
      if (filtros?.desde) qb.andWhere('f.fecha >= :desde', { desde: filtros.desde });
      if (filtros?.hasta) qb.andWhere('f.fecha <= :hasta', { hasta: filtros.hasta });
      if (filtros?.ruc) qb.andWhere('f.ruc LIKE :ruc', { ruc: `%${filtros.ruc}%` });
      if (filtros?.limit) qb.take(filtros.limit);
      return await qb.getMany();
    } catch (error) {
      console.error('Error getting facturas:', error);
      throw error;
    }
  });

  ipcMain.handle('get-factura', async (_e: any, id: number) => {
    try {
      return await dataSource.getRepository(Factura).findOne({
        where: { id },
        relations: ['items', 'items.producto', 'cliente', 'moneda', 'timbradoDetalle', 'timbradoDetalle.timbrado', 'plantilla', 'venta'],
      });
    } catch (error) {
      console.error(`Error getting factura ${id}:`, error);
      throw error;
    }
  });

  /**
   * Crea una factura asignando numeracion atomica desde el TimbradoDetalle.
   * `data` = { factura: Partial<Factura> & { timbradoDetalleId? }, items: Partial<FacturaItem>[] }
   */
  ipcMain.handle('create-factura', async (_e: any, data: any) => {
    const { factura, items } = data || {};
    try {
      return await dataSource.transaction(async (manager) => {
        const facturaRepo = manager.getRepository(Factura);
        const itemRepo = manager.getRepository(FacturaItem);
        const detalleRepo = manager.getRepository(TimbradoDetalle);

        const entity = facturaRepo.create(factura);
        const f: any = entity;

        // Asignacion de numeracion si hay timbrado detalle
        const detalleId = factura?.timbradoDetalleId ?? factura?.timbradoDetalle?.id;
        if (detalleId) {
          const detalle = await detalleRepo.findOne({
            where: { id: detalleId },
            relations: ['timbrado'],
          });
          if (!detalle) throw new Error('TimbradoDetalle no encontrado para asignar numeracion');
          if (detalle.numeroActual > detalle.rangoHasta) {
            throw new Error(`El rango del timbrado (${detalle.rangoDesde}-${detalle.rangoHasta}) esta agotado`);
          }
          f.timbradoDetalle = detalle;
          f.numeroFactura = detalle.numeroActual;
          f.numeroCompleto = `${detalle.establecimiento}-${detalle.puntoExpedicion}-${String(detalle.numeroActual).padStart(7, '0')}`;
          detalle.numeroActual = detalle.numeroActual + 1;
          await detalleRepo.save(detalle);
        }

        if (!f.fecha) f.fecha = new Date();
        await setEntityUserTracking(dataSource, entity, uid(), false);
        const saved: any = await facturaRepo.save(entity);

        // Items
        if (Array.isArray(items)) {
          for (const it of items) {
            const item = itemRepo.create({ ...it, factura: saved });
            await setEntityUserTracking(dataSource, item, uid(), false);
            await itemRepo.save(item);
          }
        }

        return await facturaRepo.findOne({
          where: { id: saved.id },
          relations: ['items', 'cliente', 'moneda', 'timbradoDetalle', 'timbradoDetalle.timbrado', 'plantilla'],
        });
      });
    } catch (error) {
      console.error('Error creating factura:', error);
      throw error;
    }
  });

  ipcMain.handle('anular-factura', async (_e: any, id: number, motivo: string) => {
    try {
      const repo = dataSource.getRepository(Factura);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Factura ${id} not found`);
      if (entity.estado === EstadoFactura.ANULADA) throw new Error('La factura ya esta anulada');
      entity.estado = EstadoFactura.ANULADA;
      entity.motivoAnulacion = motivo;
      entity.fechaAnulacion = new Date();
      await setEntityUserTracking(dataSource, entity, uid(), true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error anulando factura ${id}:`, error);
      throw error;
    }
  });
}
