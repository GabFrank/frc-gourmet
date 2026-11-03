import { ipcMain } from 'electron';
import { DataSource, EntityManager } from 'typeorm';
import { Timbrado } from '../../src/app/database/entities/facturacion/timbrado.entity';
import { TimbradoDetalle } from '../../src/app/database/entities/facturacion/timbrado-detalle.entity';
import { FacturaPlantilla } from '../../src/app/database/entities/facturacion/factura-plantilla.entity';
import { Factura, EstadoFactura } from '../../src/app/database/entities/facturacion/factura.entity';
import { FacturaItem } from '../../src/app/database/entities/facturacion/factura-item.entity';
import { FacturacionConfig } from '../../src/app/database/entities/facturacion/facturacion-config.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { buscarClientePorRuc, resolverOCrearClientePorRuc } from '../utils/cliente-ruc.utils';
import {
  calcularFacturaDeVenta,
  FacturaInvalidaError,
  renglonesManuales,
  validarFacturaContraVenta,
  withFacturaLock,
} from '../utils/factura-venta.utils';
import { calcularTotalesFactura } from '../../src/app/shared/utils/factura-totales.util';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';

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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_TIMBRADO_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_TIMBRADO_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_TIMBRADO_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_TIMBRADO_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_TIMBRADO_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_TIMBRADO_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_PLANTILLA_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_PLANTILLA_GESTIONAR');
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
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_PLANTILLA_GESTIONAR');
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
  /**
   * Cliente cuyo RUC coincide exactamente. Lo usa el diálogo de facturar para
   * autocompletar el receptor con sólo tipear el RUC.
   *
   * Sin `ensurePermission`, igual que el resto de los `get-*` del repo (ver
   * `get-clientes`). Expone datos de contacto del cliente a cualquier llamador
   * autenticado de /api/rpc, como ya ocurre hoy con el listado.
   */
  ipcMain.handle('get-cliente-por-ruc', async (_e: any, ruc: string) => {
    try {
      return await buscarClientePorRuc(dataSource, ruc);
    } catch (error) {
      console.error('Error buscando cliente por RUC:', error);
      throw error;
    }
  });

  /**
   * La factura que corresponde a una venta, calculada en el servidor: un renglón
   * por ítem ACTIVO (con sus adicionales y su descuento), el envío, el recargo y
   * el descuento del cobro. El diálogo la usa para precargar y `create-factura`
   * para validar (#325, #240).
   *
   * Es una lectura, pero pide `FACTURACION_EMITIR`: sólo la necesita quien va a
   * facturar. Devuelve montos, descripciones e ids, sin entidades hidratadas.
   */
  ipcMain.handle('get-factura-propuesta-venta', async (_e: any, ventaId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_EMITIR');
      const propuesta = await calcularFacturaDeVenta(dataSource, Number(ventaId));
      if (!propuesta) throw new Error(`La venta ${ventaId} no existe`);
      return propuesta;
    } catch (error) {
      console.error('Error calculando la factura de la venta:', error);
      throw error;
    }
  });

  ipcMain.handle('create-factura', async (_e: any, data: any) => {
    const { factura, items } = data || {};
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_EMITIR');

      // El cliente se resuelve ANTES de abrir la transacción, a propósito.
      //
      // Adentro va la numeración atómica del timbrado: si el upsert del cliente
      // fallara ahí dentro, el rollback se llevaría puesta la factura entera. Y en
      // Postgres una excepción aborta el bloque completo, así que ni siquiera
      // alcanzaría con un try/catch. Una factura es un documento legal con
      // numeración: no se pierde porque no se pudo guardar un cliente.
      if (!factura?.cliente && !factura?.cliente_id) {
        try {
          const cliente = await resolverOCrearClientePorRuc(dataSource, {
            ruc: factura?.ruc,
            nombre: factura?.nombreCliente,
            direccion: factura?.direccion,
            telefono: (data || {}).telefono ?? factura?.telefono,
            email: factura?.email,
          }, getCurrentUser()?.id);
          if (cliente) factura.cliente = { id: cliente.id } as any;
        } catch (e) {
          console.error('No se pudo guardar el cliente de la factura (la factura se emite igual):', e);
        }
      }

      const ventaId = Number(factura?.venta?.id ?? factura?.ventaId) || null;
      const esPostgres = dataSource.options.type === 'postgres';
      const detalleId = Number(factura?.timbradoDetalleId ?? factura?.timbradoDetalle?.id) || null;

      /**
       * Todo lo que puede rechazar la factura, sin escribir nada.
       *
       * En Postgres corre DENTRO de la transacción, después de los FOR UPDATE.
       * En SQLite corre ANTES de abrirla: ahí hay una sola conexión y una
       * transacción que se intercala con la de otro handler comparte la misma
       * transacción física (`tx.utils.ts`), así que un rollback por un rechazo
       * de negocio podía llevarse puestas escrituras ajenas. Adentro sólo
       * quedan las escrituras.
       */
      const validar = async (m: EntityManager) => {
        const descuentoPedido = Number(factura?.descuento) || 0;
        let renglones;
        let descuento = descuentoPedido;
        if (ventaId) {
          const otra = await m.getRepository(Factura).findOne({
            where: { venta: { id: ventaId }, estado: EstadoFactura.EMITIDA } as any,
          });
          if (otra) {
            throw new FacturaInvalidaError(
              `La venta ya tiene la factura ${otra.numeroCompleto || otra.id}; anulala para emitir otra`,
            );
          }
          const v = await validarFacturaContraVenta(m, ventaId, items, descuentoPedido);
          renglones = v.renglones;
          descuento = v.descuento;
        } else {
          renglones = renglonesManuales(items);
        }
        if (!renglones.length) throw new FacturaInvalidaError('La factura no tiene renglones');

        let numero: number | null = null;
        if (detalleId) {
          const detalle = await m.getRepository(TimbradoDetalle).findOne({ where: { id: detalleId } });
          if (!detalle) throw new Error('TimbradoDetalle no encontrado para asignar numeracion');
          // numeroManual: en pre-impreso la hoja fisica ya trae su numero; se
          // registra ese valor y la numeracion avanza a partir de el.
          const manual = factura?.numeroManual != null && factura.numeroManual !== '' ? Number(factura.numeroManual) : null;
          if (manual != null && !Number.isInteger(manual)) {
            throw new FacturaInvalidaError(`El número de factura ${factura.numeroManual} no es válido`);
          }
          numero = manual != null ? manual : detalle.numeroActual;
          if (numero > detalle.rangoHasta || numero < detalle.rangoDesde) {
            throw new Error(`El numero ${numero} esta fuera del rango del timbrado (${detalle.rangoDesde}-${detalle.rangoHasta})`);
          }
          const repetida = await m.getRepository(Factura).findOne({
            where: { timbradoDetalle: { id: detalleId }, numeroFactura: numero } as any,
          });
          if (repetida) {
            throw new FacturaInvalidaError(`El número ${repetida.numeroCompleto || numero} ya fue usado`);
          }
        }
        return { renglones, descuento, numero };
      };

      return await withFacturaLock(async () => {
        const previa = esPostgres ? null : await validar(dataSource.manager);

        return await dataSource.transaction(async (manager) => {
          const facturaRepo = manager.getRepository(Factura);
          const itemRepo = manager.getRepository(FacturaItem);
          const detalleRepo = manager.getRepository(TimbradoDetalle);

          // Locks (sólo Postgres; en SQLite ordena `withFacturaLock`). Sin el de
          // la venta, dos emisiones simultáneas ven las dos que no hay factura;
          // sin el del timbrado, las dos leen el mismo `numeroActual`. Van sin
          // relaciones: Postgres no acepta FOR UPDATE sobre el lado nulable de
          // un LEFT JOIN (#258).
          if (esPostgres) {
            if (ventaId) {
              await manager.getRepository(Venta).createQueryBuilder('v')
                .setLock('pessimistic_write').where('v.id = :id', { id: ventaId }).getOne();
            }
            if (detalleId) {
              await detalleRepo.createQueryBuilder('td')
                .setLock('pessimistic_write').where('td.id = :id', { id: detalleId }).getOne();
            }
          }
          const { renglones, descuento, numero } = previa ?? await validar(manager);

          // Los montos los calcula el servidor; los del payload se ignoran.
          const totales = calcularTotalesFactura(renglones, descuento);

          // Lista blanca: sólo lo que el emisor puede elegir. Un `id` en el
          // payload hacía que `save()` pisara una factura existente, y un
          // `estado: 'ANULADA'` anulaba sin `FACTURACION_ANULAR`.
          const ref = (x: any) => { const id = Number(x?.id); return Number.isFinite(id) && id > 0 ? { id } : undefined; };
          const texto = (x: any) => (x == null || x === '' ? undefined : String(x));
          const f: any = facturaRepo.create({
            venta: ventaId ? { id: ventaId } : undefined,
            cliente: ref(factura?.cliente),
            plantilla: ref(factura?.plantilla),
            moneda: ref(factura?.moneda),
            tipoFacturacion: factura?.tipoFacturacion,
            condicionVenta: factura?.condicionVenta,
            nombreCliente: texto(factura?.nombreCliente),
            ruc: texto(factura?.ruc),
            direccion: texto(factura?.direccion),
            email: texto(factura?.email),
          } as any);
          f.gravada10 = totales.gravada10;
          f.gravada5 = totales.gravada5;
          f.exenta = totales.exenta;
          f.iva10 = totales.iva10;
          f.iva5 = totales.iva5;
          f.descuento = totales.descuento;
          f.total = totales.total;
          f.estado = EstadoFactura.EMITIDA;
          f.fecha = new Date();
          if (ventaId && !f.moneda) {
            const principal = await manager.getRepository(Moneda).findOne({ where: { principal: true } as any });
            if (principal) f.moneda = principal;
          }

          // Numeración.
          if (detalleId && numero != null) {
            const detalle = await detalleRepo.findOne({ where: { id: detalleId }, relations: ['timbrado'] });
            if (!detalle) throw new Error('TimbradoDetalle no encontrado para asignar numeracion');
            f.timbradoDetalle = detalle;
            f.numeroFactura = numero;
            f.numeroCompleto = `${detalle.establecimiento}-${detalle.puntoExpedicion}-${String(numero).padStart(7, '0')}`;
            // Avanza el contador (sin retroceder si el manual es menor al actual).
            detalle.numeroActual = Math.max(detalle.numeroActual, numero + 1);
            await detalleRepo.save(detalle);
          }

          await setEntityUserTracking(dataSource, f, uid(), false);
          const saved: any = await facturaRepo.save(f);

          for (let i = 0; i < renglones.length; i++) {
            const item = itemRepo.create({ ...renglones[i], total: totales.totalesLinea[i], factura: saved } as any);
            await setEntityUserTracking(dataSource, item, uid(), false);
            await itemRepo.save(item);
          }

          return await facturaRepo.findOne({
            where: { id: saved.id },
            relations: ['items', 'cliente', 'moneda', 'timbradoDetalle', 'timbradoDetalle.timbrado', 'plantilla'],
          });
        });
      });
    } catch (error) {
      console.error('Error creating factura:', error);
      throw error;
    }
  });

  // ----------------------------------------------------------------------
  // FacturacionConfig (singleton)
  // ----------------------------------------------------------------------
  ipcMain.handle('get-facturacion-config', async () => {
    try {
      const repo = dataSource.getRepository(FacturacionConfig);
      let cfg = await repo.findOne({
        where: {},
        relations: ['plantillaPredeterminada', 'timbradoDetallePredeterminado', 'timbradoDetallePredeterminado.timbrado'],
        order: { id: 'ASC' },
      });
      if (!cfg) {
        cfg = repo.create({ permitirEditarNumeroPreimpreso: true });
        await setEntityUserTracking(dataSource, cfg, uid(), false);
        cfg = await repo.save(cfg);
      }
      return cfg;
    } catch (error) {
      console.error('Error getting facturacion config:', error);
      throw error;
    }
  });

  ipcMain.handle('save-facturacion-config', async (_e: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_CONFIGURAR');
      const repo = dataSource.getRepository(FacturacionConfig);
      let cfg = await repo.findOne({ where: {}, order: { id: 'ASC' } });
      if (!cfg) cfg = repo.create({});
      repo.merge(cfg, {
        tipoFacturacion: data.tipoFacturacion,
        plantillaPredeterminada: data.plantillaPredeterminadaId ? ({ id: data.plantillaPredeterminadaId } as any) : null,
        timbradoDetallePredeterminado: data.timbradoDetallePredeterminadoId ? ({ id: data.timbradoDetallePredeterminadoId } as any) : null,
        permitirEditarNumeroPreimpreso: !!data.permitirEditarNumeroPreimpreso,
      });
      await setEntityUserTracking(dataSource, cfg, uid(), true);
      return await repo.save(cfg);
    } catch (error) {
      console.error('Error saving facturacion config:', error);
      throw error;
    }
  });

  ipcMain.handle('anular-factura', async (_e: any, id: number, motivo: string) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FACTURACION_ANULAR');
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
