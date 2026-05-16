import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { PrecioDelivery } from '../../src/app/database/entities/ventas/precio-delivery.entity';
import { Delivery, DeliveryEstado } from '../../src/app/database/entities/ventas/delivery.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { VentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { VentaItemObservacion } from '../../src/app/database/entities/ventas/venta-item-observacion.entity';
import { VentaItemAdicional } from '../../src/app/database/entities/ventas/venta-item-adicional.entity';
import { VentaItemIngredienteModificacion } from '../../src/app/database/entities/ventas/venta-item-ingrediente-modificacion.entity';
import { PdvGrupoCategoria } from '../../src/app/database/entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from '../../src/app/database/entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from '../../src/app/database/entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from '../../src/app/database/entities/ventas/pdv-item-producto.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { resolveRequestDeviceId } from '../utils/current-device.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { Not, IsNull } from 'typeorm';
import { DeepPartial } from 'typeorm';
import { Reserva } from '../../src/app/database/entities/ventas/reserva.entity';
import { ensurePermission } from '../utils/auth.utils';
import { PdvMesa, PdvMesaEstado } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { Comanda, ComandaEstado } from '../../src/app/database/entities/ventas/comanda.entity';
import { ComandaItem } from '../../src/app/database/entities/ventas/comanda-item.entity';
import { printComandaInternal, printVentaTicketInternal } from './documentos-tickets.handler';
import { Sector } from '../../src/app/database/entities/ventas/sector.entity';
import { PdvAtajoGrupo } from '../../src/app/database/entities/ventas/pdv-atajo-grupo.entity';
import { PdvAtajoItem } from '../../src/app/database/entities/ventas/pdv-atajo-item.entity';
import { PdvAtajoGrupoItem } from '../../src/app/database/entities/ventas/pdv-atajo-grupo-item.entity';
import { PdvAtajoItemProducto } from '../../src/app/database/entities/ventas/pdv-atajo-item-producto.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { PagoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { Caja } from '../../src/app/database/entities/financiero/caja.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { ProductoTipo } from '../../src/app/database/entities/productos/producto-tipo.enum';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaIngrediente } from '../../src/app/database/entities/productos/receta-ingrediente.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';
import { StockMovimiento, StockMovimientoTipo, StockMovimientoTipoReferencia } from '../../src/app/database/entities/productos/stock-movimiento.entity';
import { Combo } from '../../src/app/database/entities/productos/combo.entity';
import { ComboProducto } from '../../src/app/database/entities/productos/combo-producto.entity';
import { Adicional } from '../../src/app/database/entities/productos/adicional.entity';
import { TipoModificacionIngrediente } from '../../src/app/database/entities/ventas/venta-item-ingrediente-modificacion.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { VentaItemSabor } from '../../src/app/database/entities/ventas/venta-item-sabor.entity';
import { dbQuery } from '../utils/db-query';

export function registerVentasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  // Remove this line - get the current user in each handler instead
  // const currentUser = getCurrentUser(); // Get user for tracking

  // --- PrecioDelivery Handlers ---
  ipcMain.handle('getPreciosDelivery', async () => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      return await repo.find({ order: { descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting precios delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('getPrecioDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPrecioDelivery', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating precio delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePrecioDelivery', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Precio Delivery ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePrecioDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Precio Delivery ID ${id} not found`);
      
      // Check dependencies (Deliveries) before deleting
      const deliveryRepo = dataSource.getRepository(Delivery);
      const deliveriesCount = await deliveryRepo.count({ 
        where: { precioDelivery: { id } }
      });
      
      if (deliveriesCount > 0) {
        throw new Error(`No se puede eliminar el precio de delivery porque está asociado a ${deliveriesCount} deliveries.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  // --- Delivery Handlers ---
  ipcMain.handle('getDeliveries', async () => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.find({ 
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
        order: { fechaAbierto: 'DESC' } 
      });
    } catch (error) {
      console.error('Error getting deliveries:', error);
      throw error;
    }
  });

  ipcMain.handle('getDeliveriesByEstado', async (_event: any, estado: DeliveryEstado) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.find({ 
        where: { estado },
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
        order: { fechaAbierto: 'DESC' } 
      });
    } catch (error) {
      console.error(`Error getting deliveries with estado ${estado}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.findOne({ 
        where: { id },
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'] 
      });
    } catch (error) {
      console.error(`Error getting delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createDelivery', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('updateDelivery', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Delivery ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Delivery ID ${id} not found`);
      
      // Check dependencies (Ventas) before deleting
      const ventaRepo = dataSource.getRepository(Venta);
      const ventasCount = await ventaRepo.count({ 
        where: { delivery: { id } }
      });
      
      if (ventasCount > 0) {
        throw new Error(`No se puede eliminar el delivery porque está asociado a ${ventasCount} ventas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting delivery ID ${id}:`, error);
      throw error;
    }
  });

  // Get deliveries by caja with pagination and filters
  ipcMain.handle('getDeliveriesByCaja', async (_event: any, cajaId: number, filtros?: any) => {
    try {
      const ventaRepo = dataSource.getRepository(Venta);
      const qb = ventaRepo.createQueryBuilder('venta')
        .leftJoinAndSelect('venta.delivery', 'delivery')
        .leftJoinAndSelect('delivery.precioDelivery', 'precioDelivery')
        .leftJoinAndSelect('delivery.cliente', 'cliente')
        .leftJoinAndSelect('cliente.persona', 'persona')
        .leftJoinAndSelect('delivery.entregadoPor', 'entregadoPor')
        .leftJoinAndSelect('entregadoPor.persona', 'entregadoPorPersona')
        .leftJoinAndSelect('venta.items', 'items')
        .leftJoinAndSelect('venta.pago', 'pago')
        .where('venta.caja_id = :cajaId', { cajaId })
        .andWhere('delivery.id IS NOT NULL');

      if (filtros?.estado) {
        qb.andWhere('delivery.estado = :estado', { estado: filtros.estado });
      }

      qb.orderBy('delivery.fechaAbierto', 'DESC');

      // Pagination
      const page = filtros?.page || 1;
      const pageSize = filtros?.pageSize || 20;
      qb.skip((page - 1) * pageSize).take(pageSize);

      const [ventas, total] = await qb.getManyAndCount();

      const data = ventas.map(venta => ({
        ...venta.delivery,
        venta: { id: venta.id, estado: venta.estado, items: venta.items, pago: venta.pago },
      }));

      return { data, total };
    } catch (error) {
      console.error(`Error getting deliveries for caja ${cajaId}:`, error);
      throw error;
    }
  });

  // --- Cerrar todas las ventas abiertas de una mesa ---
  ipcMain.handle('cerrarVentasAbiertasMesa', async (_event: any, mesaId: number, estado: string) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Venta);
      const ventasAbiertas = await repo.find({
        where: { mesa: { id: mesaId }, estado: VentaEstado.ABIERTA },
      });
      for (const v of ventasAbiertas) {
        v.estado = estado as VentaEstado;
        await repo.save(v);
      }
      return ventasAbiertas.length;
    } catch (error) {
      console.error(`Error cerrando ventas abiertas de mesa ${mesaId}:`, error);
      throw error;
    }
  });

  // --- Venta Handlers ---
  ipcMain.handle('getVentas', async () => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting ventas:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentasByEstado', async (_event: any, estado: VentaEstado) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        where: { estado },
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting ventas with estado ${estado}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getVenta', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.findOne({
        where: { id },
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ]
      });
    } catch (error) {
      console.error(`Error getting venta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVenta', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Venta);
      const entity: any = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      // F5 paso 3: si el caller no especifico dispositivo, resolverlo del
      // request context (JWT en cliente HTTP, current-device en IPC local).
      if (!data?.dispositivo && !data?.dispositivo_id) {
        const deviceId = resolveRequestDeviceId(_event);
        if (deviceId != null) entity.dispositivo = { id: deviceId };
      }
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentasByDateRange', async (_event: any, desde: string, hasta: string, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(Venta);
      const qb = repo.createQueryBuilder('venta')
        .leftJoinAndSelect('venta.caja', 'caja')
        .leftJoinAndSelect('caja.dispositivo', 'dispositivo')
        .leftJoinAndSelect('caja.createdBy', 'cajaCreatedBy')
        .leftJoinAndSelect('cajaCreatedBy.persona', 'cajaCreatedByPersona')
        .leftJoinAndSelect('venta.formaPago', 'formaPago')
        .leftJoinAndSelect('venta.pago', 'pago')
        .leftJoinAndSelect('venta.mesa', 'mesa')
        .leftJoinAndSelect('venta.cliente', 'cliente')
        .leftJoinAndSelect('cliente.persona', 'persona')
        .leftJoinAndSelect('venta.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .leftJoinAndSelect('venta.items', 'items');

      // Date range filter (skip if cajaId is provided — caja has its own date range)
      if (!filtros?.cajaId) {
        qb.where('venta.createdAt >= :desde', { desde })
          .andWhere('venta.createdAt <= :hasta', { hasta });
      } else {
        qb.where('caja.id = :cajaId', { cajaId: filtros.cajaId });
      }

      // Estado
      if (filtros?.estado) {
        qb.andWhere('venta.estado = :estado', { estado: filtros.estado });
      }

      // Mesa
      if (filtros?.mesaId) {
        qb.andWhere('mesa.id = :mesaId', { mesaId: filtros.mesaId });
      }

      // Formas de pago (multi-select) — subquery en pago_detalles
      if (filtros?.formasPagoIds?.length > 0) {
        qb.andWhere(qb2 => {
          const subQuery = qb2.subQuery()
            .select('pd_fp.pago_id')
            .from('pagos_detalles', 'pd_fp')
            .where('pd_fp.forma_pago_id IN (:...formasPagoIds)')
            .getQuery();
          return 'pago.id IN ' + subQuery;
        }).setParameter('formasPagoIds', filtros.formasPagoIds);
      }

      // Monedas (multi-select) — subquery en pago_detalles
      if (filtros?.monedaIds?.length > 0) {
        qb.andWhere(qb2 => {
          const subQuery = qb2.subQuery()
            .select('pd_m.pago_id')
            .from('pagos_detalles', 'pd_m')
            .where('pd_m.moneda_id IN (:...monedaIds)')
            .getQuery();
          return 'pago.id IN ' + subQuery;
        }).setParameter('monedaIds', filtros.monedaIds);
      }

      // Rango de valores por moneda
      if (filtros?.monedaValorId && (filtros?.valorMin != null || filtros?.valorMax != null)) {
        qb.andWhere(qb2 => {
          let subQuery = qb2.subQuery()
            .select('pd_v.pago_id')
            .from('pagos_detalles', 'pd_v')
            .where('pd_v.moneda_id = :monedaValorId')
            .andWhere('pd_v.tipo = :tipoPago')
            .groupBy('pd_v.pago_id');
          if (filtros.valorMin != null) {
            subQuery = subQuery.having('SUM(pd_v.valor) >= :valorMin');
          }
          if (filtros.valorMax != null) {
            subQuery = subQuery.andHaving('SUM(pd_v.valor) <= :valorMax');
          }
          return 'pago.id IN ' + subQuery.getQuery();
        })
        .setParameter('monedaValorId', filtros.monedaValorId)
        .setParameter('tipoPago', 'PAGO');
        if (filtros.valorMin != null) qb.setParameter('valorMin', filtros.valorMin);
        if (filtros.valorMax != null) qb.setParameter('valorMax', filtros.valorMax);
      }

      // Descuento/Aumento
      if (filtros?.tieneDescuento === 'CON_DESCUENTO') {
        qb.andWhere('(venta.descuento_monto > 0 OR EXISTS (SELECT 1 FROM venta_items vi_d WHERE vi_d.venta_id = venta.id AND vi_d.descuento_unitario > 0))');
      } else if (filtros?.tieneDescuento === 'CON_AUMENTO') {
        qb.andWhere(qb2 => {
          const subQuery = qb2.subQuery()
            .select('pd_a.pago_id')
            .from('pagos_detalles', 'pd_a')
            .where('pd_a.tipo = :tipoAumento')
            .getQuery();
          return 'pago.id IN ' + subQuery;
        }).setParameter('tipoAumento', 'AUMENTO');
      } else if (filtros?.tieneDescuento === 'SIN_DESCUENTO') {
        qb.andWhere('(venta.descuento_monto IS NULL OR venta.descuento_monto = 0)')
          .andWhere('NOT EXISTS (SELECT 1 FROM venta_items vi_nd WHERE vi_nd.venta_id = venta.id AND vi_nd.descuento_unitario > 0)');
      }

      // Mozo (usuario que creó al menos un item)
      if (filtros?.mozoId) {
        qb.andWhere('EXISTS (SELECT 1 FROM venta_items vi_m WHERE vi_m.venta_id = venta.id AND vi_m.created_by = :mozoId)')
          .setParameter('mozoId', filtros.mozoId);
      }

      // F5 paso 4: filtro por dispositivo de origen (multi-PC en LAN).
      if (filtros?.dispositivoId) {
        qb.andWhere('venta.dispositivo_id = :ventaDispositivoId', { ventaDispositivoId: filtros.dispositivoId });
      }

      qb.orderBy('venta.createdAt', 'DESC');

      // Paginación
      const page = filtros?.page || 1;
      const pageSize = filtros?.pageSize || 25;
      qb.skip((page - 1) * pageSize).take(pageSize);

      const [data, total] = await qb.getManyAndCount();
      return { data, total };
    } catch (error) {
      console.error('Error getting ventas by date range:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentasByCaja', async (_event: any, cajaId: number) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        where: { caja: { id: cajaId } },
        relations: ['caja', 'formaPago', 'pago', 'items'],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting ventas for caja ${cajaId}:`, error);
      throw error;
    }
  });

  // Resumen completo de una caja (para diálogo de resumen)
  ipcMain.handle('getResumenCaja', async (_event: any, cajaId: number) => {
    try {
      const cajaRepo = dataSource.getRepository(Caja);
      const caja = await cajaRepo.findOne({
        where: { id: cajaId },
        relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'createdBy', 'createdBy.persona'],
      });
      if (!caja) throw new Error(`Caja ${cajaId} not found`);

      // Conteo apertura por moneda
      const conteoApertura: any[] = [];
      if (caja.conteoApertura?.id) {
        const rows = await dbQuery(dataSource, `
          SELECT mb.moneda_id, m.simbolo, m.denominacion, SUM(cd.cantidad * mb.valor) as total
          FROM conteos_detalles cd
          JOIN monedas_billetes mb ON cd.moneda_billete_id = mb.id
          JOIN monedas m ON mb.moneda_id = m.id
          WHERE cd.conteo_id = ?
          GROUP BY mb.moneda_id, m.simbolo, m.denominacion
        `, [caja.conteoApertura.id]);
        for (const r of rows) {
          conteoApertura.push({ monedaId: r.moneda_id, monedaSimbolo: r.simbolo, monedaDenominacion: r.denominacion, total: r.total || 0 });
        }
      }

      // Conteo cierre por moneda
      const conteoCierre: any[] = [];
      if (caja.conteoCierre?.id) {
        const rows = await dbQuery(dataSource, `
          SELECT mb.moneda_id, m.simbolo, m.denominacion, SUM(cd.cantidad * mb.valor) as total
          FROM conteos_detalles cd
          JOIN monedas_billetes mb ON cd.moneda_billete_id = mb.id
          JOIN monedas m ON mb.moneda_id = m.id
          WHERE cd.conteo_id = ?
          GROUP BY mb.moneda_id, m.simbolo, m.denominacion
        `, [caja.conteoCierre.id]);
        for (const r of rows) {
          conteoCierre.push({ monedaId: r.moneda_id, monedaSimbolo: r.simbolo, monedaDenominacion: r.denominacion, total: r.total || 0 });
        }
      }

      // Ventas de esta caja
      const ventaRepo = dataSource.getRepository(Venta);
      const ventas = await ventaRepo.find({
        where: { caja: { id: cajaId }, estado: VentaEstado.CONCLUIDA },
        relations: ['pago'],
      });

      const cantidadVentas = ventas.length;
      const ventasPorFormaPagoMap: { [key: string]: any } = {};
      const ventasTotalPorMonedaMap: { [key: string]: any } = {};
      const efectivoPorMoneda: { [monedaId: number]: number } = {};

      const pagoDetalleRepo = dataSource.getRepository(PagoDetalle);
      for (const venta of ventas) {
        if (!venta.pago?.id) continue;
        const detalles = await pagoDetalleRepo.find({
          where: { pago: { id: venta.pago.id } },
          relations: ['moneda', 'formaPago'],
        });
        for (const d of detalles) {
          if (!d.moneda || !d.formaPago) continue;
          const monedaId = d.moneda.id;
          const simbolo = d.moneda.simbolo || '';

          if (d.tipo === 'PAGO') {
            const fpKey = `${d.formaPago.nombre}_${monedaId}`;
            if (!ventasPorFormaPagoMap[fpKey]) {
              ventasPorFormaPagoMap[fpKey] = { formaPago: d.formaPago.nombre, monedaId, monedaSimbolo: simbolo, total: 0 };
            }
            ventasPorFormaPagoMap[fpKey].total += d.valor || 0;

            const mKey = `${monedaId}`;
            if (!ventasTotalPorMonedaMap[mKey]) {
              ventasTotalPorMonedaMap[mKey] = { monedaId, monedaSimbolo: simbolo, total: 0 };
            }
            ventasTotalPorMonedaMap[mKey].total += d.valor || 0;

            if ((d.formaPago as any).movimentaCaja) {
              efectivoPorMoneda[monedaId] = (efectivoPorMoneda[monedaId] || 0) + (d.valor || 0);
            }
          } else if (d.tipo === 'VUELTO') {
            const mKey = `${monedaId}`;
            if (!ventasTotalPorMonedaMap[mKey]) {
              ventasTotalPorMonedaMap[mKey] = { monedaId, monedaSimbolo: simbolo, total: 0 };
            }
            ventasTotalPorMonedaMap[mKey].total -= d.valor || 0;

            if ((d.formaPago as any)?.movimentaCaja) {
              efectivoPorMoneda[monedaId] = (efectivoPorMoneda[monedaId] || 0) - (d.valor || 0);
            }
          }
        }
      }

      // Calcular esperado y diferencia
      const esperadoPorMoneda: { [monedaId: number]: number } = {};
      const diferenciaPorMoneda: { [monedaId: number]: number } = {};
      const allMonedaIds = new Set<number>();
      conteoApertura.forEach(c => allMonedaIds.add(c.monedaId));
      conteoCierre.forEach(c => allMonedaIds.add(c.monedaId));
      Object.keys(efectivoPorMoneda).forEach(k => allMonedaIds.add(Number(k)));

      for (const monedaId of allMonedaIds) {
        const apertura = conteoApertura.find(c => c.monedaId === monedaId)?.total || 0;
        const cierre = conteoCierre.find(c => c.monedaId === monedaId)?.total || 0;
        const efectivo = efectivoPorMoneda[monedaId] || 0;
        esperadoPorMoneda[monedaId] = apertura + efectivo;
        diferenciaPorMoneda[monedaId] = cierre - esperadoPorMoneda[monedaId];
      }

      return {
        caja,
        conteoApertura,
        conteoCierre,
        ventasPorFormaPago: Object.values(ventasPorFormaPagoMap),
        ventasTotalPorMoneda: Object.values(ventasTotalPorMonedaMap),
        cantidadVentas,
        efectivoPorMoneda,
        esperadoPorMoneda,
        diferenciaPorMoneda,
      };
    } catch (error) {
      console.error(`Error getting resumen caja ${cajaId}:`, error);
      throw error;
    }
  });

  // Total ventas de una caja en moneda principal (liviano, para la lista)
  ipcMain.handle('getVentasTotalByCaja', async (_event: any, cajaId: number) => {
    try {
      const result = await dbQuery(dataSource, `
        SELECT
          COUNT(DISTINCT v.id) as cantidadVentas,
          COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as totalVentas,
          pd.moneda_id as monedaId
        FROM ventas v
        LEFT JOIN pagos p ON v.pago_id = p.id
        LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id
        WHERE v.caja_id = ? AND v.estado = 'CONCLUIDA'
        GROUP BY pd.moneda_id
      `, [cajaId]);
      return result;
    } catch (error) {
      console.error(`Error getting ventas total for caja ${cajaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('updateVenta', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Venta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta ID ${id} not found`);

      const estadoAnterior = entity.estado;
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      const saved = await repo.save(entity);

      // ─── Hook E2.3: auto-imprimir ticket cuando la venta pasa a CONCLUIDA
      // Fire-and-forget. NUNCA bloquea ni revierte la transición de estado.
      if (estadoAnterior !== VentaEstado.CONCLUIDA && saved.estado === VentaEstado.CONCLUIDA) {
        try {
          const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
          if (pdvConfig?.autoImprimirTicketVenta) {
            setImmediate(() => {
              printVentaTicketInternal(dataSource, id)
                .catch(e => console.warn('[updateVenta] auto-print ticket falló:', e));
            });
          }
        } catch (e) {
          console.warn('[updateVenta] hook auto-imprimir ticket falló:', e);
        }
      }

      return saved;
    } catch (error) {
      console.error(`Error updating venta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVenta', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Venta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta ID ${id} not found`);
      
      // Check if there are venta items before deleting
      const ventaItemRepo = dataSource.getRepository(VentaItem);
      const itemsCount = await ventaItemRepo.count({ 
        where: { venta: { id } }
      });
      
      if (itemsCount > 0) {
        throw new Error(`No se puede eliminar la venta porque tiene ${itemsCount} items asociados. Elimine primero los items.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting venta ID ${id}:`, error);
      throw error;
    }
  });

  // --- VentaItem Handlers ---
  ipcMain.handle('getVentaItems', async (_event: any, ventaId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      return await repo.find({
        where: { venta: { id: ventaId } },
        relations: [
          'producto', 
          'presentacion', 
          'precioVentaPresentacion',
          'precioVentaPresentacion.moneda',
          'canceladoPor',
          'modificadoPor',
          'nuevaVersionVentaItem',
          'createdBy',
          'createdBy.persona'
        ],
        order: { createdAt: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting venta items for venta ID ${ventaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      return await repo.findOne({
        where: { id },
        relations: [
          'venta',
          'producto', 
          'presentacion', 
          'precioVentaPresentacion',
          'precioVentaPresentacion.moneda',
          'canceladoPor',
          'modificadoPor',
          'nuevaVersionVentaItem',
          'createdBy', 
          'createdBy.persona'
        ]
      });
    } catch (error) {
      console.error(`Error getting venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const saved = await repo.save(entity);

      // ─── Hook E2.2: crear ComandaItem y auto-imprimir comanda ──────────
      // Si la venta tiene una Comanda asociada, replicamos el VentaItem como
      // ComandaItem (PENDIENTE) y disparamos `printComandaInternal` en
      // background si `pdv_config.autoImprimirComanda=true`. Si la venta no
      // tiene comanda, no se hace nada (PdV venta directa sin cocina).
      try {
        const savedAny = saved as any;
        const ventaId = savedAny.venta?.id ?? savedAny.venta_id ?? savedAny.ventaId;
        if (ventaId) {
          await ensureComandaItemAndAutoPrint(dataSource, savedAny.id ?? (saved as any).id, ventaId);
        }
      } catch (e) {
        // Hook NUNCA bloquea la creación del item. Solo log.
        console.warn('[createVentaItem] hook auto-imprimir comanda falló:', e);
      }

      return saved;
    } catch (error) {
      console.error('Error creating venta item:', error);
      throw error;
    }
  });

  ipcMain.handle('updateVentaItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta Item ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItem', async (_event: any, id: number) => {
    // return a boolean if success or not
    try {
      const repo = dataSource.getRepository(VentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta Item ID ${id} not found`);
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item ID ${id}:`, error);
      return false;
    }
  });

  // --- VentaItemObservacion Handlers ---
  ipcMain.handle('getObservacionesByVentaItem', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemObservacion);
      return await repo.find({
        where: { ventaItem: { id: ventaItemId } },
        relations: ['observacion'],
      });
    } catch (error) {
      console.error(`Error getting observaciones for venta item ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItemObservacion', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItemObservacion);
      const entity = repo.create(data);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta item observacion:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemObservacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemObservacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`VentaItemObservacion ID ${id} not found`);
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item observacion ${id}:`, error);
      return false;
    }
  });

  // --- VentaItemAdicional Handlers ---
  ipcMain.handle('getVentaItemAdicionales', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemAdicional);
      return await repo.find({
        where: { ventaItem: { id: ventaItemId } },
        relations: ['adicional'],
      });
    } catch (error) {
      console.error(`Error getting adicionales for venta item ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItemAdicional', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItemAdicional);
      const entity = repo.create(data);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta item adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemAdicional', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemAdicional);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`VentaItemAdicional ID ${id} not found`);
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item adicional ${id}:`, error);
      return false;
    }
  });

  // --- VentaItemIngredienteModificacion Handlers ---
  ipcMain.handle('getVentaItemIngredienteModificaciones', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemIngredienteModificacion);
      return await repo.find({
        where: { ventaItem: { id: ventaItemId } },
        relations: ['recetaIngrediente', 'recetaIngrediente.ingrediente', 'ingredienteReemplazo'],
      });
    } catch (error) {
      console.error(`Error getting ingrediente modificaciones for venta item ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItemIngredienteModificacion', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItemIngredienteModificacion);
      const entity = repo.create(data);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta item ingrediente modificacion:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemIngredienteModificacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemIngredienteModificacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`VentaItemIngredienteModificacion ID ${id} not found`);
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item ingrediente modificacion ${id}:`, error);
      return false;
    }
  });

  // --- PdvGrupoCategoria Handlers ---
  ipcMain.handle('getPdvGrupoCategorias', async () => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      return await repo.find({
        relations: ['categorias'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Grupo Categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvGrupoCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['categorias']
      });
    } catch (error) {
      console.error(`Error getting PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvGrupoCategoria', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Grupo Categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvGrupoCategoria', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Grupo Categoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvGrupoCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Grupo Categoria ID ${id} not found`);
      
      // Check dependencies before deleting
      const categoriaRepo = dataSource.getRepository(PdvCategoria);
      const categoriasCount = await categoriaRepo.count({ 
        where: { grupoCategoria: { id } }
      });
      
      if (categoriasCount > 0) {
        throw new Error(`No se puede eliminar el grupo de categoría porque tiene ${categoriasCount} categorías asociadas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvCategoria Handlers ---
  ipcMain.handle('getPdvCategorias', async () => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.find({
        relations: ['grupoCategoria', 'items'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriasByGrupo', async (_event: any, grupoId: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.find({
        where: { grupoCategoria: { id: grupoId } },
        relations: ['grupoCategoria', 'items'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Categorias for Grupo ID ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['grupoCategoria', 'items']
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvCategoria', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvCategoria', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria ID ${id} not found`);
      
      // Check dependencies before deleting
      const itemRepo = dataSource.getRepository(PdvCategoriaItem);
      const itemsCount = await itemRepo.count({ 
        where: { categoria: { id } }
      });
      
      if (itemsCount > 0) {
        throw new Error(`No se puede eliminar la categoría porque tiene ${itemsCount} items asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvCategoriaItem Handlers ---
  ipcMain.handle('getPdvCategoriaItems', async () => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.find({
        relations: ['categoria', 'productos', 'productos.producto'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Categoria Items:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriaItemsByCategoria', async (_event: any, categoriaId: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.find({
        where: { categoria: { id: categoriaId } },
        relations: ['categoria', 'productos', 'productos.producto', 'productos.producto.presentaciones', 'productos.producto.presentaciones.preciosVenta'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria Items for Categoria ID ${categoriaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.findOne({
        where: { id },
        relations: ['categoria', 'productos', 'productos.producto']
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvCategoriaItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Categoria Item:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvCategoriaItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria Item ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvCategoriaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria Item ID ${id} not found`);
      
      // Check dependencies before deleting
      const itemProductoRepo = dataSource.getRepository(PdvItemProducto);
      const productosCount = await itemProductoRepo.count({ 
        where: { categoriaItem: { id } }
      });
      
      if (productosCount > 0) {
        throw new Error(`No se puede eliminar el item de categoría porque tiene ${productosCount} productos asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvItemProducto Handlers ---
  ipcMain.handle('getPdvItemProductos', async () => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.find({
        relations: ['categoriaItem', 'producto'],
        order: { nombre_alternativo: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Item Productos:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvItemProductosByItem', async (_event: any, itemId: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.find({
        where: { categoriaItem: { id: itemId } },
        relations: ['categoriaItem', 'producto'],
        order: { nombre_alternativo: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Item Productos for Item ID ${itemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvItemProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.findOne({
        where: { id },
        relations: ['categoriaItem', 'producto']
      });
    } catch (error) {
      console.error(`Error getting PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvItemProducto', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Item Producto:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvItemProducto', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Item Producto ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvItemProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Item Producto ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  // PDV Config handlers
  ipcMain.handle('getPdvConfig', async (_event: any) => {
    try {
      const repository = dataSource.getRepository(PdvConfig);
      
      let config = await repository.findOne({
        where: { id: Not(IsNull()) },
        relations: ['pdvGrupoCategoria']
      });
      
      // If no config exists, create a default one
      if (!config) {
        const newConfig = repository.create({
          cantidad_mesas: 0,
          activo: true
        } as DeepPartial<PdvConfig>);
        
        config = await repository.save(newConfig);
      }
      
      return config;
    } catch (error) {
      console.error('Error fetching PDV config:', error);
      throw error;
    }
  });

  ipcMain.handle('createPdvConfig', async (_event: any, data: Partial<PdvConfig>) => {
    try {
      const repository = dataSource.getRepository(PdvConfig);
      
      // Make sure there is only one active config
      const existingConfig = await repository.findOne({
        where: { id: Not(IsNull()) }
      });
      
      if (existingConfig) {
        throw new Error('Ya existe una configuración activa. Utilice updatePdvConfig en su lugar.');
      }
      
      // Ensure activo is set to true for new config
      const configData = { ...data, activo: true } as DeepPartial<PdvConfig>;
      const newConfig = repository.create(configData);
      return await repository.save(newConfig);
    } catch (error) {
      console.error('Error creating PDV config:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvConfig', async (_event: any, id: number, data: Partial<PdvConfig>) => {
    try {
      const repository = dataSource.getRepository(PdvConfig);
      
      // Find the config to update
      const config = await repository.findOne({
        where: { id }
      });
      
      if (!config) {
        throw new Error(`Config ID ${id} not found`);
      }
      
      // Apply updates
      repository.merge(config, data as DeepPartial<PdvConfig>);
      return await repository.save(config);
    } catch (error) {
      console.error(`Error updating PDV config ID ${id}:`, error);
      throw error;
    }
  });

  // --- Reserva Handlers ---
  ipcMain.handle('getReservas', async () => {
    try {
      const repo = dataSource.getRepository(Reserva);
      return await repo.find({
        relations: ['cliente', 'cliente.persona'],
        order: { fecha_hora_reserva: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting reservas:', error);
      throw error;
    }
  });

  ipcMain.handle('getReservasActivas', async () => {
    try {
      const repo = dataSource.getRepository(Reserva);
      return await repo.find({
        where: { activo: true },
        relations: ['cliente', 'cliente.persona'],
        order: { fecha_hora_reserva: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting reservas activas:', error);
      throw error;
    }
  });

  ipcMain.handle('getReserva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Reserva);
      return await repo.findOne({
        where: { id },
        relations: ['cliente', 'cliente.persona']
      });
    } catch (error) {
      console.error(`Error getting reserva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createReserva', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Reserva);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating reserva:', error);
      throw error;
    }
  });

  ipcMain.handle('updateReserva', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Reserva);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Reserva ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating reserva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteReserva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Reserva);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Reserva ID ${id} not found`);
      
      // Check for dependencies on PdvMesa
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesasCount = await mesaRepo.count({
        where: { reserva: { id } }
      });
      
      if (mesasCount > 0) {
        throw new Error(`No se puede eliminar la reserva porque está asociada a ${mesasCount} mesas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting reserva ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvMesa Handlers ---
  // Helper: query mesas with only the ABIERTA venta joined + comandas OCUPADO vinculadas
  const queryMesasWithVentaAbierta = (repo: any) => {
    return repo.createQueryBuilder('mesa')
      .leftJoinAndSelect('mesa.reserva', 'reserva')
      .leftJoinAndSelect('mesa.sector', 'sector')
      .leftJoinAndMapOne('mesa.venta', Venta, 'venta', 'venta.mesa_id = mesa.id AND venta.estado = :ventaEstado', { ventaEstado: VentaEstado.ABIERTA })
      .leftJoinAndSelect('mesa.comandas', 'comanda', 'comanda.estado = :comandaEstado AND comanda.activo = :comandaActivo', { comandaEstado: ComandaEstado.OCUPADO, comandaActivo: true })
      .orderBy('mesa.numero', 'ASC');
  };

  ipcMain.handle('getPdvMesas', async () => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return await queryMesasWithVentaAbierta(repo).getMany();
    } catch (error) {
      console.error('Error getting PDV Mesas:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesasActivas', async () => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return await queryMesasWithVentaAbierta(repo)
        .where('mesa.activo = :activo', { activo: true })
        .getMany();
    } catch (error) {
      console.error('Error getting PDV Mesas activas:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesasDisponibles', async () => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return await queryMesasWithVentaAbierta(repo)
        .where('mesa.activo = :activo AND mesa.reservado = :reservado AND mesa.estado = :estado', {
          activo: true, reservado: false, estado: PdvMesaEstado.DISPONIBLE
        })
        .getMany();
    } catch (error) {
      console.error('Error getting PDV Mesas disponibles:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesasBySector', async (_event: any, sectorId: number) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return await queryMesasWithVentaAbierta(repo)
        .where('mesa.sector_id = :sectorId', { sectorId })
        .getMany();
    } catch (error) {
      console.error(`Error getting PDV Mesas for Sector ID ${sectorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesa', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return await repo.findOne({
        where: { id },
        relations: ['reserva', 'reserva.cliente', 'reserva.cliente.persona', 'sector', 'venta']
      });
    } catch (error) {
      console.error(`Error getting PDV Mesa ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvMesa', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Mesa:', error);
      throw error;
    }
  });

  ipcMain.handle('createBatchPdvMesas', async (_event: any, batchData: any[]) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      const savedEntities: any[] = [];
      for (const data of batchData) {
        const entity = repo.create(data as any);
        await setEntityUserTracking(dataSource, entity as any, getCurrentUser()?.id, false);
        const saved = await repo.save(entity as any);
        savedEntities.push(saved);
      }
      return savedEntities;
    } catch (error) {
      console.error('Error creating batch PDV Mesas:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvMesa', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Mesa ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Mesa ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvMesa', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Mesa ID ${id} not found`);
      
      // Check for dependencies on Comandas
      const comandaRepo = dataSource.getRepository(Comanda);
      const comandasCount = await comandaRepo.count({
        where: { pdv_mesa: { id } }
      });
      
      if (comandasCount > 0) {
        throw new Error(`No se puede eliminar la mesa porque está asociada a ${comandasCount} comandas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Mesa ID ${id}:`, error);
      throw error;
    }
  });

  // --- Comanda Handlers (tarjetas de cuenta individual) ---
  ipcMain.handle('getComandas', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Comandas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandasActivas', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Comandas activas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandasByMesa', async (_event: any, mesaId: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { pdv_mesa: { id: mesaId }, activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting Comandas for Mesa ID ${mesaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getComanda', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.findOne({
        where: { id },
        relations: ['pdv_mesa', 'sector']
      });
    } catch (error) {
      console.error(`Error getting Comanda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createComanda', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      const entity: any = repo.create({ ...data, estado: ComandaEstado.DISPONIBLE });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      // F5 paso 3: propagar device_id del request context si no vino explicito.
      if (!data?.dispositivo && !data?.dispositivo_id) {
        const deviceId = resolveRequestDeviceId(_event);
        if (deviceId != null) entity.dispositivo = { id: deviceId };
      }
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating Comanda:', error);
      throw error;
    }
  });

  ipcMain.handle('updateComanda', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Comanda ID ${id} not found`);

      // Si se cambia la mesa, sincronizar sector con el de la mesa
      if ('pdv_mesa' in data) {
        if (data.pdv_mesa?.id) {
          const mesaRepo = dataSource.getRepository(PdvMesa);
          const mesa = await mesaRepo.findOne({ where: { id: data.pdv_mesa.id }, relations: ['sector'] });
          if (mesa) {
            data.sector = mesa.sector || null;
          }
        } else {
          // Sin mesa → limpiar sector también
          data.sector = null;
        }
      }

      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating Comanda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteComanda', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Comanda ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting Comanda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getComandasDisponibles', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { estado: ComandaEstado.DISPONIBLE, activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Comandas disponibles:', error);
      throw error;
    }
  });

  // getComandasOcupadas: carga comandas ocupadas con su venta abierta via query builder
  ipcMain.handle('getComandasOcupadas', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.createQueryBuilder('comanda')
        .leftJoinAndSelect('comanda.pdv_mesa', 'pdv_mesa')
        .leftJoinAndSelect('comanda.sector', 'sector')
        .leftJoinAndMapOne('comanda.venta', Venta, 'venta', 'venta.comanda_id = comanda.id AND venta.estado = :ventaEstado', { ventaEstado: VentaEstado.ABIERTA })
        .where('comanda.estado = :estado AND comanda.activo = :activo', { estado: ComandaEstado.OCUPADO, activo: true })
        .orderBy('comanda.numero', 'ASC')
        .getMany();
    } catch (error) {
      console.error('Error getting Comandas ocupadas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandasBySector', async (_event: any, sectorId: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { sector: { id: sectorId }, estado: ComandaEstado.OCUPADO, activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting Comandas for Sector ID ${sectorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('abrirComanda', async (_event: any, comandaId: number, data: { mesaId?: number, sectorId?: number, observacion?: string }) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      const entity = await repo.findOneBy({ id: comandaId });
      if (!entity) throw new Error(`Comanda ID ${comandaId} not found`);
      if (entity.estado !== ComandaEstado.DISPONIBLE) throw new Error(`Comanda ${comandaId} no está disponible`);

      entity.estado = ComandaEstado.OCUPADO;
      if (data.mesaId) {
        const mesaRepo = dataSource.getRepository(PdvMesa);
        const mesa = await mesaRepo.findOne({ where: { id: data.mesaId }, relations: ['sector'] });
        entity.pdv_mesa = mesa || undefined;
        // Sincronizar sector con el de la mesa (a menos que se haya indicado uno explícitamente)
        if (!data.sectorId && mesa?.sector) {
          entity.sector = mesa.sector;
        }
      }
      if (data.sectorId) {
        const sectorRepo = dataSource.getRepository(Sector);
        entity.sector = await sectorRepo.findOneBy({ id: data.sectorId }) || undefined;
      }
      if (data.observacion !== undefined) {
        entity.observacion = data.observacion;
      }
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error abriendo Comanda ID ${comandaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('cerrarComanda', async (_event: any, comandaId: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      const entity = await repo.findOneBy({ id: comandaId });
      if (!entity) throw new Error(`Comanda ID ${comandaId} not found`);

      entity.estado = ComandaEstado.DISPONIBLE;
      entity.pdv_mesa = undefined as any;
      entity.sector = undefined as any;
      entity.observacion = undefined as any;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error cerrando Comanda ID ${comandaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createBatchComandas', async (_event: any, batchData: any[]) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      const results: any[] = [];
      for (const data of batchData) {
        const entity = repo.create({ ...data, estado: ComandaEstado.DISPONIBLE });
        await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
        const saved = await repo.save(entity);
        results.push(saved);
      }
      return results;
    } catch (error) {
      console.error('Error creating batch Comandas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandaWithVenta', async (_event: any, comandaId: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.createQueryBuilder('comanda')
        .leftJoinAndSelect('comanda.pdv_mesa', 'pdv_mesa')
        .leftJoinAndSelect('comanda.sector', 'sector')
        .leftJoinAndMapOne('comanda.venta', Venta, 'venta', 'venta.comanda_id = comanda.id AND venta.estado = :ventaEstado', { ventaEstado: VentaEstado.ABIERTA })
        .where('comanda.id = :id', { id: comandaId })
        .getOne();
    } catch (error) {
      console.error(`Error getting Comanda with venta ID ${comandaId}:`, error);
      throw error;
    }
  });

  // --- Sector Handlers ---
  ipcMain.handle('getSectores', async () => {
    try {
      const repo = dataSource.getRepository(Sector);
      return await repo.find({
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Sectores:', error);
      throw error;
    }
  });

  ipcMain.handle('getSectoresActivos', async () => {
    try {
      const repo = dataSource.getRepository(Sector);
      return await repo.find({
        where: { activo: true },
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Sectores activos:', error);
      throw error;
    }
  });

  ipcMain.handle('getSector', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Sector);
      return await repo.findOne({
        where: { id },
        relations: ['mesas']
      });
    } catch (error) {
      console.error(`Error getting Sector ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createSector', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Sector);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating Sector:', error);
      throw error;
    }
  });

  ipcMain.handle('updateSector', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Sector);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Sector ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating Sector ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteSector', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Sector);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Sector ID ${id} not found`);
      
      // Check for dependencies on PdvMesa
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesasCount = await mesaRepo.count({
        where: { sector: { id } }
      });
      
      if (mesasCount > 0) {
        throw new Error(`No se puede eliminar el sector porque tiene ${mesasCount} mesas asociadas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting Sector ID ${id}:`, error);
      throw error;
    }
  });

  // --- Stock: Procesar movimientos de stock al finalizar venta ---
  ipcMain.handle('procesarStockVenta', async (_event: any, ventaId: number) => {
    const stockRepo = dataSource.getRepository(StockMovimiento);
    const ventaItemRepo = dataSource.getRepository(VentaItem);
    const recetaIngRepo = dataSource.getRepository(RecetaIngrediente);
    const recetaPresRepo = dataSource.getRepository(RecetaPresentacion);
    const modRepo = dataSource.getRepository(VentaItemIngredienteModificacion);
    const adicRepo = dataSource.getRepository(VentaItemAdicional);
    const comboRepo = dataSource.getRepository(Combo);
    const productoRepo = dataSource.getRepository(Producto);
    const recetaRepo = dataSource.getRepository(Receta);

    try {
      // 1. Idempotencia: verificar si ya se procesó
      const existing = await stockRepo.count({
        where: { referencia: ventaId, tipoReferencia: StockMovimientoTipoReferencia.VENTA, activo: true },
      });
      if (existing > 0) {
        return { success: true, message: 'Ya procesado', movimientosCreados: 0 };
      }

      // 2. Verificar venta
      const ventaRepo = dataSource.getRepository(Venta);
      const venta = await ventaRepo.findOne({ where: { id: ventaId } });
      if (!venta || venta.estado !== VentaEstado.CONCLUIDA) {
        return { success: false, message: 'Venta no encontrada o no CONCLUIDA' };
      }

      // 3. Cargar items activos con relaciones
      const items = await ventaItemRepo.find({
        where: { venta: { id: ventaId }, estado: EstadoVentaItem.ACTIVO },
        relations: ['producto', 'presentacion'],
      });

      if (items.length === 0) {
        return { success: true, message: 'Sin items activos', movimientosCreados: 0 };
      }

      // 4. Recolectar movimientos pendientes
      interface PendingMovement {
        productoId: number;
        cantidad: number;
        ventaItemId: number;
      }
      const pending: PendingMovement[] = [];

      for (const item of items) {
        if (!item.producto) continue;
        const tipo = item.producto.tipo as ProductoTipo;

        switch (tipo) {
          case ProductoTipo.RETAIL:
          case ProductoTipo.RETAIL_INGREDIENTE:
            await processRetail(item, pending);
            break;
          case ProductoTipo.ELABORADO_SIN_VARIACION:
            await processElaboradoSinVariacion(item, pending);
            break;
          case ProductoTipo.ELABORADO_CON_VARIACION:
            await processElaboradoConVariacion(item, pending);
            break;
          case ProductoTipo.COMBO:
            await processCombo(item, pending, 0);
            break;
        }
      }

      if (pending.length === 0) {
        return { success: true, message: 'Nada que descontar', movimientosCreados: 0 };
      }

      // 5. Crear movimientos en transacción
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const currentUser = getCurrentUser();
        for (const mov of pending) {
          const stockMov = new StockMovimiento();
          stockMov.cantidad = Math.round(mov.cantidad * 1000) / 1000; // precision 3 decimales
          stockMov.tipo = StockMovimientoTipo.VENTA;
          stockMov.referencia = ventaId;
          stockMov.tipoReferencia = StockMovimientoTipoReferencia.VENTA;
          stockMov.fecha = new Date();
          stockMov.activo = true;
          stockMov.producto = { id: mov.productoId } as any;
          stockMov.observaciones = `VENTA #${ventaId} - ITEM #${mov.ventaItemId}`;
          if (currentUser) {
            (stockMov as any).createdBy = currentUser;
            (stockMov as any).updatedBy = currentUser;
          }
          await queryRunner.manager.save(StockMovimiento, stockMov);
        }

        await queryRunner.commitTransaction();
        console.log(`Stock procesado para venta #${ventaId}: ${pending.length} movimientos`);
        return { success: true, movimientosCreados: pending.length };
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }

      // --- Funciones auxiliares ---

      async function processRetail(item: VentaItem, out: PendingMovement[]): Promise<void> {
        if (!item.producto.controlaStock) return;
        let cantidad = Number(item.cantidad);
        // Multiplicar por cantidad de la presentación (ej: caja de 12)
        if (item.presentacion && Number(item.presentacion.cantidad) > 1) {
          cantidad *= Number(item.presentacion.cantidad);
        }
        out.push({ productoId: item.producto.id, cantidad, ventaItemId: item.id });
      }

      async function processElaboradoSinVariacion(item: VentaItem, out: PendingMovement[]): Promise<void> {
        // Buscar receta del producto
        const producto = await productoRepo.findOne({
          where: { id: item.producto.id },
          relations: ['receta'],
        });
        const recetaId = producto?.receta?.id;
        if (!recetaId) return;

        const receta = await recetaRepo.findOne({ where: { id: recetaId } });
        if (!receta) return;

        await processReceta(receta, item, out);
      }

      async function processElaboradoConVariacion(item: VentaItem, out: PendingMovement[]): Promise<void> {
        if (!item.presentacion?.id) return;

        // Buscar RecetaPresentacion que coincida con la presentación vendida y el producto
        const recetaPres = await recetaPresRepo.createQueryBuilder('rp')
          .innerJoinAndSelect('rp.receta', 'receta')
          .innerJoin('rp.sabor', 'sabor')
          .where('rp.presentacion_id = :presId', { presId: item.presentacion.id })
          .andWhere('sabor.producto_id = :prodId', { prodId: item.producto.id })
          .andWhere('rp.activo = :activo', { activo: true })
          .getOne();

        if (!recetaPres?.receta) return;
        await processReceta(recetaPres.receta, item, out);
      }

      async function processCombo(item: VentaItem, out: PendingMovement[], depth: number): Promise<void> {
        if (depth >= 2) return; // Prevenir anidamiento infinito

        const combo = await comboRepo.findOne({
          where: { producto: { id: item.producto.id }, activo: true },
          relations: ['productos', 'productos.producto', 'productos.presentacion'],
        });
        if (!combo?.productos) return;

        for (const cp of combo.productos) {
          if (!cp.activo || !cp.producto) continue;
          const cantidadEfectiva = Number(cp.cantidad) * Number(item.cantidad);

          // Crear un item virtual para reusar la lógica
          const virtualItem = {
            id: item.id,
            producto: cp.producto,
            presentacion: cp.presentacion || null,
            cantidad: cantidadEfectiva,
          } as VentaItem;

          const cpTipo = cp.producto.tipo as ProductoTipo;
          switch (cpTipo) {
            case ProductoTipo.RETAIL:
            case ProductoTipo.RETAIL_INGREDIENTE:
              await processRetail(virtualItem, out);
              break;
            case ProductoTipo.ELABORADO_SIN_VARIACION:
              await processElaboradoSinVariacion(virtualItem, out);
              break;
            case ProductoTipo.ELABORADO_CON_VARIACION:
              await processElaboradoConVariacion(virtualItem, out);
              break;
            case ProductoTipo.COMBO:
              await processCombo(virtualItem, out, depth + 1);
              break;
          }
        }
      }

      // Procesa ingredientes de una receta recursivamente (sin modificaciones ni adicionales)
      async function processRecetaIngredientes(receta: Receta, item: { id: number; cantidad: number }, out: PendingMovement[], depth = 0): Promise<void> {
        if (depth >= 3) return; // Límite de recursión
        const rendimiento = Number(receta.rendimiento) || 1;
        const cantidadVendida = Number(item.cantidad);

        const ingredientes = await recetaIngRepo.find({
          where: { receta: { id: receta.id }, activo: true },
          relations: ['ingrediente'],
        });

        for (const ing of ingredientes) {
          if (!ing.ingrediente) continue;

          const aprovechamiento = Number(ing.porcentajeAprovechamiento) || 100;
          const rawCantidad = (Number(ing.cantidad) * cantidadVendida) / rendimiento;
          const actualCantidad = rawCantidad / (aprovechamiento / 100);

          if (ing.ingrediente.controlaStock) {
            out.push({ productoId: ing.ingrediente.id, cantidad: actualCantidad, ventaItemId: item.id });
          } else {
            // Recursar: entrar a la receta del ingrediente
            const ingProd = await productoRepo.findOne({ where: { id: ing.ingrediente.id }, relations: ['receta'] });
            if (ingProd?.receta?.id) {
              const subReceta = await recetaRepo.findOne({ where: { id: ingProd.receta.id } });
              if (subReceta) {
                await processRecetaIngredientes(subReceta, { id: item.id, cantidad: actualCantidad }, out, depth + 1);
              }
            }
          }
        }
      }

      // Procesa receta completa: con modificaciones del VentaItem + adicionales
      async function processReceta(receta: Receta, item: VentaItem, out: PendingMovement[]): Promise<void> {
        const rendimiento = Number(receta.rendimiento) || 1;
        const cantidadVendida = Number(item.cantidad);

        const ingredientes = await recetaIngRepo.find({
          where: { receta: { id: receta.id }, activo: true },
          relations: ['ingrediente'],
        });

        // Cargar modificaciones del item (removidos/intercambiados)
        const modificaciones = await modRepo.find({
          where: { ventaItem: { id: item.id } },
          relations: ['recetaIngrediente', 'ingredienteReemplazo'],
        });

        const removidos = new Set(
          modificaciones
            .filter(m => m.tipoModificacion === TipoModificacionIngrediente.REMOVIDO)
            .map(m => m.recetaIngrediente?.id)
            .filter(Boolean)
        );

        const intercambios = new Map<number, number>();
        for (const m of modificaciones) {
          if (m.tipoModificacion === TipoModificacionIngrediente.INTERCAMBIADO && m.recetaIngrediente?.id && m.ingredienteReemplazo?.id) {
            intercambios.set(m.recetaIngrediente.id, m.ingredienteReemplazo.id);
          }
        }

        for (const ing of ingredientes) {
          if (!ing.ingrediente) continue;
          if (removidos.has(ing.id)) continue;

          let targetProductoId = ing.ingrediente.id;
          let targetControlaStock = ing.ingrediente.controlaStock;

          if (intercambios.has(ing.id)) {
            targetProductoId = intercambios.get(ing.id)!;
            const reemplazo = await productoRepo.findOne({ where: { id: targetProductoId } });
            if (!reemplazo) continue;
            targetControlaStock = reemplazo.controlaStock;
          }

          const aprovechamiento = Number(ing.porcentajeAprovechamiento) || 100;
          const rawCantidad = (Number(ing.cantidad) * cantidadVendida) / rendimiento;
          const actualCantidad = rawCantidad / (aprovechamiento / 100);

          if (targetControlaStock) {
            out.push({ productoId: targetProductoId, cantidad: actualCantidad, ventaItemId: item.id });
          } else {
            // Ingrediente no controla stock: recursar a su receta
            const ingProd = await productoRepo.findOne({ where: { id: targetProductoId }, relations: ['receta'] });
            if (ingProd?.receta?.id) {
              const subReceta = await recetaRepo.findOne({ where: { id: ingProd.receta.id } });
              if (subReceta) {
                await processRecetaIngredientes(subReceta, { id: item.id, cantidad: actualCantidad }, out);
              }
            }
          }
        }

        // Procesar adicionales del item
        const adicionales = await adicRepo.find({
          where: { ventaItem: { id: item.id }, activo: true },
          relations: ['adicional'],
        });

        for (const va of adicionales) {
          if (!va.adicional) continue;
          // Buscar si el adicional tiene receta
          const adicional = await dataSource.getRepository(Adicional).findOne({
            where: { id: (va.adicional as any).id || va.adicional },
            relations: ['receta'],
          });
          if (!adicional?.receta?.id) continue;

          const adicReceta = await recetaRepo.findOne({ where: { id: adicional.receta.id } });
          if (!adicReceta) continue;

          const adicIngredientes = await recetaIngRepo.find({
            where: { receta: { id: adicReceta.id }, activo: true },
            relations: ['ingrediente'],
          });

          const adicRendimiento = Number(adicReceta.rendimiento) || 1;
          const adicCantidad = Number(va.cantidad) * cantidadVendida;

          for (const adicIng of adicIngredientes) {
            if (!adicIng.ingrediente?.controlaStock) continue;
            const aprov = Number(adicIng.porcentajeAprovechamiento) || 100;
            const raw = (Number(adicIng.cantidad) * adicCantidad) / adicRendimiento;
            const actual = raw / (aprov / 100);
            out.push({ productoId: adicIng.ingrediente.id, cantidad: actual, ventaItemId: item.id });
          }
        }
      }

    } catch (error) {
      console.error(`Error procesando stock para venta #${ventaId}:`, error);
      return { success: false, error: (error as any).message };
    }
  });

  // --- Stock: Revertir movimientos de stock al cancelar venta finalizada ---
  ipcMain.handle('revertirStockVenta', async (_event: any, ventaId: number) => {
    const stockRepo = dataSource.getRepository(StockMovimiento);

    try {
      // Buscar movimientos existentes para esta venta
      const movimientos = await stockRepo.find({
        where: { referencia: ventaId, tipoReferencia: StockMovimientoTipoReferencia.VENTA, activo: true },
        relations: ['producto'],
      });

      if (movimientos.length === 0) {
        return { success: true, message: 'Sin movimientos que revertir', movimientosRevertidos: 0 };
      }

      // Marcar movimientos como inactivos (dejan de contar en el cálculo de stock)
      for (const mov of movimientos) {
        mov.activo = false;
      }
      await stockRepo.save(movimientos);

      console.log(`Stock revertido para venta #${ventaId}: ${movimientos.length} movimientos desactivados`);
      return { success: true, movimientosRevertidos: movimientos.length };
    } catch (error) {
      console.error(`Error revirtiendo stock para venta #${ventaId}:`, error);
      return { success: false, error: (error as any).message };
    }
  });

  // =============================================
  // PdvAtajoGrupo handlers
  // =============================================

  ipcMain.handle('getPdvAtajoGrupos', async () => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      return await repo.find({
        relations: ['atajoGrupoItems', 'atajoGrupoItems.atajoItem'],
        order: { posicion: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PdvAtajoGrupos:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvAtajoGrupo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      return await repo.findOne({
        where: { id },
        relations: ['atajoGrupoItems', 'atajoGrupoItems.atajoItem']
      });
    } catch (error) {
      console.error(`Error getting PdvAtajoGrupo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvAtajoGrupo', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PdvAtajoGrupo:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvAtajoGrupo', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoGrupo ID ${id} not found`);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PdvAtajoGrupo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvAtajoGrupo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoGrupo ID ${id} not found`);
      // Delete join table entries first
      const joinRepo = dataSource.getRepository(PdvAtajoGrupoItem);
      await joinRepo.delete({ atajoGrupoId: id });
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PdvAtajoGrupo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('reorderPdvAtajoGrupos', async (_event: any, orderedIds: number[]) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update(orderedIds[i], { posicion: i });
      }
      return { success: true };
    } catch (error) {
      console.error('Error reordering PdvAtajoGrupos:', error);
      throw error;
    }
  });

  // =============================================
  // PdvAtajoItem handlers
  // =============================================

  ipcMain.handle('getPdvAtajoItems', async () => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItem);
      return await repo.find({
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PdvAtajoItems:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvAtajoItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItem);
      return await repo.findOne({
        where: { id },
        relations: ['atajoGrupoItems', 'atajoGrupoItems.atajoGrupo', 'atajoItemProductos', 'atajoItemProductos.producto']
      });
    } catch (error) {
      console.error(`Error getting PdvAtajoItem ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvAtajoItemsByGrupo', async (_event: any, grupoId: number) => {
    try {
      const joinRepo = dataSource.getRepository(PdvAtajoGrupoItem);
      const joinEntries = await joinRepo.find({
        where: { atajoGrupoId: grupoId },
        relations: ['atajoItem'],
        order: { posicion: 'ASC' }
      });
      return joinEntries.map(entry => ({
        ...entry.atajoItem,
        posicion: entry.posicion
      }));
    } catch (error) {
      console.error(`Error getting PdvAtajoItems for grupo ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvAtajoItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItem);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PdvAtajoItem:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvAtajoItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoItem ID ${id} not found`);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PdvAtajoItem ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvAtajoItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoItem ID ${id} not found`);
      // Delete join table entries first
      const grupoItemRepo = dataSource.getRepository(PdvAtajoGrupoItem);
      await grupoItemRepo.delete({ atajoItemId: id });
      const itemProductoRepo = dataSource.getRepository(PdvAtajoItemProducto);
      await itemProductoRepo.delete({ atajoItemId: id });
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PdvAtajoItem ID ${id}:`, error);
      throw error;
    }
  });

  // =============================================
  // PdvAtajoGrupoItem (join table) handlers
  // =============================================

  ipcMain.handle('assignAtajoItemToGrupo', async (_event: any, grupoId: number, itemId: number, posicion: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupoItem);
      // Check if already exists
      const existing = await repo.findOne({
        where: { atajoGrupoId: grupoId, atajoItemId: itemId }
      });
      if (existing) {
        existing.posicion = posicion;
        return await repo.save(existing);
      }
      const entity = repo.create({ atajoGrupoId: grupoId, atajoItemId: itemId, posicion });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error assigning atajo item ${itemId} to grupo ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('removeAtajoItemFromGrupo', async (_event: any, grupoId: number, itemId: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupoItem);
      const entity = await repo.findOne({
        where: { atajoGrupoId: grupoId, atajoItemId: itemId }
      });
      if (!entity) throw new Error(`Join entry not found for grupo ${grupoId} and item ${itemId}`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error removing atajo item ${itemId} from grupo ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('reorderAtajoItemsInGrupo', async (_event: any, grupoId: number, orderedItemIds: number[]) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupoItem);
      for (let i = 0; i < orderedItemIds.length; i++) {
        await repo.update(
          { atajoGrupoId: grupoId, atajoItemId: orderedItemIds[i] },
          { posicion: i }
        );
      }
      return { success: true };
    } catch (error) {
      console.error(`Error reordering atajo items in grupo ${grupoId}:`, error);
      throw error;
    }
  });

  // =============================================
  // PdvAtajoItemProducto (join table) handlers
  // =============================================

  ipcMain.handle('getPdvAtajoItemProductos', async (_event: any, atajoItemId: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      const pvRepo = dataSource.getRepository(PrecioVenta);
      const items = await repo.find({
        where: { atajoItemId },
        relations: [
          'producto',
          'producto.presentaciones',
          'producto.presentaciones.preciosVenta',
          'producto.presentaciones.preciosVenta.moneda',
          'producto.presentaciones.preciosVenta.tipoPrecio',
          'producto.receta'
        ],
        order: { posicion: 'ASC' }
      });

      // Resolve prices based on product type
      const pickPrecio = (precios: any[]) =>
        precios?.find((pv: any) => pv.activo && pv.principal)
        || precios?.find((pv: any) => pv.activo)
        || precios?.[0]
        || null;

      for (const item of items) {
        const p = item.producto as any;
        if (!p) continue;

        if (p.tipo === 'ELABORADO_SIN_VARIACION') {
          const recetaId = p.receta?.id;
          if (recetaId) {
            const precios = await pvRepo.find({
              where: { receta: { id: recetaId }, activo: true },
              relations: ['moneda'],
              order: { principal: 'DESC' }
            });
            p.precioDirecto = pickPrecio(precios);
          }
        } else if (p.tipo === 'ELABORADO_CON_VARIACION') {
          const precios = await pvRepo
            .createQueryBuilder('pv')
            .leftJoinAndSelect('pv.moneda', 'moneda')
            .innerJoin('pv.receta', 'receta')
            .where('receta.producto_id = :prodId', { prodId: p.id })
            .andWhere('pv.activo = :activo', { activo: true })
            .orderBy('pv.principal', 'DESC')
            .getMany();
          p.precioDirecto = pickPrecio(precios);
        } else if (p.tipo === 'COMBO') {
          const precios = await pvRepo.find({
            where: { producto: { id: p.id }, activo: true },
            relations: ['moneda'],
            order: { principal: 'DESC' }
          });
          p.precioDirecto = pickPrecio(precios);
        }
        // RETAIL: prices already loaded via presentaciones.preciosVenta
      }

      return items;
    } catch (error) {
      console.error(`Error getting productos for atajo item ${atajoItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('assignProductoToAtajoItem', async (_event: any, atajoItemId: number, productoId: number, data?: any) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      // Check if already exists
      const existing = await repo.findOne({
        where: { atajoItemId, productoId }
      });
      if (existing) return existing;
      const maxPosResult = await repo.createQueryBuilder('aip')
        .select('MAX(aip.posicion)', 'maxPos')
        .where('aip.atajo_item_id = :atajoItemId', { atajoItemId })
        .getRawOne();
      const nextPos = (maxPosResult?.maxPos ?? -1) + 1;
      const entity = repo.create({
        atajoItemId,
        productoId,
        posicion: nextPos,
        nombre_alternativo: data?.nombre_alternativo || null,
        activo: true
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error assigning producto ${productoId} to atajo item ${atajoItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('removeProductoFromAtajoItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoItemProducto ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error removing PdvAtajoItemProducto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('reorderProductosInAtajoItem', async (_event: any, atajoItemId: number, orderedIds: number[]) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update(orderedIds[i], { posicion: i });
      }
      return { success: true };
    } catch (error) {
      console.error(`Error reordering productos in atajo item ${atajoItemId}:`, error);
      throw error;
    }
  });

  // --- VentaItemSabor Handlers (multi-sabor / variaciones) ---

  ipcMain.handle('createVentaItemSabor', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItemSabor);
      const entity = repo.create({
        ventaItem: { id: data.ventaItemId },
        recetaPresentacion: { id: data.recetaPresentacionId },
        proporcion: data.proporcion,
        precioReferencia: data.precioReferencia,
        costoReferencia: data.costoReferencia,
        activo: true
      });
      const saved = await repo.save(entity);
      return await repo.findOne({
        where: { id: saved.id },
        relations: ['recetaPresentacion', 'recetaPresentacion.sabor', 'recetaPresentacion.presentacion']
      });
    } catch (error) {
      console.error('Error creating VentaItemSabor:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentaItemSabores', async (_event: any, ventaItemId: number) => {
    try {
      return await dataSource.getRepository(VentaItemSabor).find({
        where: { ventaItem: { id: ventaItemId }, activo: true },
        relations: ['recetaPresentacion', 'recetaPresentacion.sabor', 'recetaPresentacion.presentacion', 'recetaPresentacion.preciosVenta'],
        order: { id: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting VentaItemSabores for item ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemSaboresByItem', async (_event: any, ventaItemId: number) => {
    try {
      await dataSource.getRepository(VentaItemSabor).delete({ ventaItem: { id: ventaItemId } });
      return { success: true };
    } catch (error) {
      console.error(`Error deleting VentaItemSabores for item ${ventaItemId}:`, error);
      throw error;
    }
  });
}

/**
 * Hook auto-impresión de comanda (E2.2).
 *
 * Se ejecuta tras `createVentaItem`. Si la Venta tiene una Comanda asociada,
 * replica el VentaItem como `ComandaItem` (PENDIENTE) — patrón "cocina"
 * separada de la venta. Luego, si `pdv_config.autoImprimirComanda=true`,
 * dispara `printComandaInternal` en background (setImmediate) — el item ya
 * fue guardado y la respuesta al frontend NO espera la impresión.
 *
 * Si la venta no tiene Comanda → es una venta directa sin cocina, no se hace nada.
 *
 * Si la impresión falla (impresora apagada, sin sector configurado, etc.) →
 * se loguea y la venta sigue normal. El item queda con `impreso=false` y se
 * puede reimprimir manualmente desde el PdV.
 */
async function ensureComandaItemAndAutoPrint(
  dataSource: DataSource,
  ventaItemId: number,
  ventaId: number,
): Promise<void> {
  // 1. Buscar la venta con su comanda
  const venta = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['comanda'],
  });
  if (!venta?.comanda?.id) return;  // Venta directa sin cocina — nada que hacer

  const comandaId = venta.comanda.id;

  // 2. Crear ComandaItem si aún no existe para este VentaItem
  const ciRepo = dataSource.getRepository(ComandaItem);
  const existente = await ciRepo.findOne({
    where: { ventaItem: { id: ventaItemId } as any, comanda: { id: comandaId } as any },
  });
  if (!existente) {
    const ci = ciRepo.create({
      comanda: { id: comandaId } as any,
      ventaItem: { id: ventaItemId } as any,
      activo: true,
      impreso: false,
    } as any);
    await ciRepo.save(ci);
  }

  // 3. Disparar impresión si está habilitada
  const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
  if (!pdvConfig?.autoImprimirComanda) return;

  setImmediate(() => {
    printComandaInternal(dataSource, comandaId, { soloItemsNoImpresos: true })
      .then(res => {
        if (!res.ok) {
          console.warn(`[auto-print comanda ${comandaId}] errores parciales:`,
            res.errors.map(e => e.message).join('; '));
        }
      })
      .catch(e => console.error(`[auto-print comanda ${comandaId}] excepción:`, e));
  });
} 