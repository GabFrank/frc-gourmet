import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';

// Import all productos entities
import { Familia } from '../../src/app/database/entities/productos/familia.entity';
import { Subfamilia } from '../../src/app/database/entities/productos/subfamilia.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Presentacion } from '../../src/app/database/entities/productos/presentacion.entity';
import { CodigoBarra } from '../../src/app/database/entities/productos/codigo-barra.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { PrecioCosto } from '../../src/app/database/entities/productos/precio-costo.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaIngrediente } from '../../src/app/database/entities/productos/receta-ingrediente.entity';
import { TamanhoPizza } from '../../src/app/database/entities/productos/tamanho-pizza.entity';
import { SaborPizza } from '../../src/app/database/entities/productos/sabor-pizza.entity';
import { EnsambladoPizza } from '../../src/app/database/entities/productos/ensamblado-pizza.entity';
import { EnsambladoPizzaSabor } from '../../src/app/database/entities/productos/ensamblado-pizza-sabor.entity';
import { Produccion } from '../../src/app/database/entities/productos/produccion.entity';
import { ProduccionIngrediente } from '../../src/app/database/entities/productos/produccion-ingrediente.entity';
import { StockMovimiento, StockMovimientoTipo, StockMovimientoTipoReferencia } from '../../src/app/database/entities/productos/stock-movimiento.entity';
import { escalarProduccion } from '../../src/app/shared/utils/produccion-buffet.util';
import { Combo } from '../../src/app/database/entities/productos/combo.entity';
import { ComboProducto } from '../../src/app/database/entities/productos/combo-producto.entity';
import { Promocion } from '../../src/app/database/entities/productos/promocion.entity';
import { PromocionPresentacion } from '../../src/app/database/entities/productos/promocion-presentacion.entity';
import { ConversionMoneda } from '../../src/app/database/entities/productos/conversion-moneda.entity';
import { ConfiguracionMonetaria } from '../../src/app/database/entities/productos/configuracion-monetaria.entity';
import { Observacion } from '../../src/app/database/entities/productos/observacion.entity';
import { ProductoObservacion } from '../../src/app/database/entities/productos/producto-observacion.entity';
import { RecetaIngredienteIntercambiable } from '../../src/app/database/entities/productos/receta-ingrediente-intercambiable.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { TipoPrecio } from '../../src/app/database/entities/financiero/tipo-precio.entity';
import { Not, Like, In } from 'typeorm';
import { Sabor } from '../../src/app/database/entities/productos/sabor.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';

export function registerProductosHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {

  // Helper function to calculate virtual properties for presentacion
  const calculatePresentacionVirtualProps = (presentacion: Presentacion) => {
    // Calculate precioPrincipal
    if (presentacion.preciosVenta && presentacion.preciosVenta.length > 0) {
      const precioPrincipal = presentacion.preciosVenta.find(p => p.principal);
      presentacion.precioPrincipal = precioPrincipal
        ? precioPrincipal.valor
        : presentacion.preciosVenta[0].valor;
    } else {
      presentacion.precioPrincipal = null;
    }

    // Calculate codigoPrincipal
    if (presentacion.codigosBarras && presentacion.codigosBarras.length > 0) {
      const codigoPrincipal = presentacion.codigosBarras.find(c => c.principal);
      presentacion.codigoPrincipal = codigoPrincipal
        ? codigoPrincipal.codigo
        : presentacion.codigosBarras[0].codigo;
    } else {
      presentacion.codigoPrincipal = null;
    }

    return presentacion;
  };

  // --- Familia Handlers ---
  ipcMain.handle('get-familias', async () => {
    try {
      const familiaRepository = dataSource.getRepository(Familia);
      return await familiaRepository.find({
        where: { activo: true },
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting familias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-familia', async (_event: any, familiaId: number) => {
    try {
      const familiaRepository = dataSource.getRepository(Familia);
      return await familiaRepository.findOne({
        where: { id: familiaId },
        relations: ['subfamilias']
      });
    } catch (error) {
      console.error('Error getting familia:', error);
      throw error;
    }
  });

  ipcMain.handle('create-familia', async (_event: any, familiaData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CATEGORIAS_GESTIONAR');
    try {
      const familiaRepository = dataSource.getRepository(Familia);
      const currentUser = getCurrentUser();

      const familia = familiaRepository.create({
        nombre: familiaData.nombre,
        activo: familiaData.activo !== undefined ? familiaData.activo : true
      });

      await setEntityUserTracking(dataSource, familia, currentUser?.id, false);
      const savedFamilia = await familiaRepository.save(familia);
      return savedFamilia;
    } catch (error) {
      console.error('Error creating familia:', error);
      throw error;
    }
  });

  ipcMain.handle('update-familia', async (_event: any, familiaId: number, familiaData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CATEGORIAS_GESTIONAR');
    try {
      const familiaRepository = dataSource.getRepository(Familia);
      const currentUser = getCurrentUser();
      const familia = await familiaRepository.findOneBy({ id: familiaId });

      if (!familia) {
        return { success: false, message: 'Familia not found' };
      }

      if (familiaData.nombre !== undefined) familia.nombre = familiaData.nombre;
      if (familiaData.activo !== undefined) familia.activo = familiaData.activo;

      await setEntityUserTracking(dataSource, familia, currentUser?.id, true);
      const savedFamilia = await familiaRepository.save(familia);
      return { success: true, familia: savedFamilia };
    } catch (error) {
      console.error('Error updating familia:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-familia', async (_event: any, familiaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'CATEGORIAS_GESTIONAR');
    try {
      const familiaRepository = dataSource.getRepository(Familia);
      const currentUser = getCurrentUser();
      const familia = await familiaRepository.findOneBy({ id: familiaId });

      if (!familia) {
        return { success: false, message: 'Familia not found' };
      }

      familia.activo = false;
      await setEntityUserTracking(dataSource, familia, currentUser?.id, true);
      await familiaRepository.save(familia);
      return { success: true };
    } catch (error) {
      console.error('Error deleting familia:', error);
      throw error;
    }
  });

  // --- Subfamilia Handlers ---
  ipcMain.handle('get-subfamilias', async () => {
    try {
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      return await subfamiliaRepository.find({
        where: { activo: true },
        relations: ['familia'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting subfamilias:', error);
      throw error;
    }
  });

  ipcMain.handle('get-subfamilias-by-familia', async (_event: any, familiaId: number) => {
    try {
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      // adicionar familia a la respuesta
      return await subfamiliaRepository.find({
        where: { familia: { id: familiaId }, activo: true },
        order: { nombre: 'ASC' },
        relations: ['familia']
      });
    } catch (error) {
      console.error('Error getting subfamilias by familia:', error);
      throw error;
    }
  });

  ipcMain.handle('get-subfamilia', async (_event: any, subfamiliaId: number) => {
    try {
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      return await subfamiliaRepository.findOne({
        where: { id: subfamiliaId },
        relations: ['familia']
      });
    } catch (error) {
      console.error('Error getting subfamilia:', error);
      throw error;
    }
  });

  ipcMain.handle('create-subfamilia', async (_event: any, subfamiliaData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CATEGORIAS_GESTIONAR');
    try {
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      const familiaRepository = dataSource.getRepository(Familia);
      const currentUser = getCurrentUser();

      const familia = await familiaRepository.findOneBy({ id: subfamiliaData.familiaId });
      if (!familia) {
        return { success: false, message: 'Familia not found' };
      }

      const subfamilia = subfamiliaRepository.create({
        nombre: subfamiliaData.nombre,
        familia: familia,
        activo: subfamiliaData.activo !== undefined ? subfamiliaData.activo : true
      });

      await setEntityUserTracking(dataSource, subfamilia, currentUser?.id, false);
      const savedSubfamilia = await subfamiliaRepository.save(subfamilia);
      return savedSubfamilia;
    } catch (error) {
      console.error('Error creating subfamilia:', error);
      throw error;
    }
  });

  ipcMain.handle('update-subfamilia', async (_event: any, subfamiliaId: number, subfamiliaData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CATEGORIAS_GESTIONAR');
    try {
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      const familiaRepository = dataSource.getRepository(Familia);
      const currentUser = getCurrentUser();

      const subfamilia = await subfamiliaRepository.findOneBy({ id: subfamiliaId });
      if (!subfamilia) {
        return { success: false, message: 'Subfamilia not found' };
      }

      // Update familia if provided
      if (subfamiliaData.familiaId !== undefined) {
        const familia = await familiaRepository.findOneBy({ id: subfamiliaData.familiaId });
        if (!familia) {
          return { success: false, message: 'Familia not found' };
        }
        subfamilia.familia = familia;
      }

      // Update other fields
      if (subfamiliaData.nombre !== undefined) {
        subfamilia.nombre = subfamiliaData.nombre;
      }
      if (subfamiliaData.activo !== undefined) {
        subfamilia.activo = subfamiliaData.activo;
      }

      await setEntityUserTracking(dataSource, subfamilia, currentUser?.id, true);
      const updatedSubfamilia = await subfamiliaRepository.save(subfamilia);
      return { success: true, subfamilia: updatedSubfamilia };
    } catch (error) {
      console.error('Error updating subfamilia:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-subfamilia', async (_event: any, subfamiliaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'CATEGORIAS_GESTIONAR');
    try {
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      const currentUser = getCurrentUser();

      const subfamilia = await subfamiliaRepository.findOneBy({ id: subfamiliaId });
      if (!subfamilia) {
        return { success: false, message: 'Subfamilia not found' };
      }

      // Check if subfamilia is being used by any productos
      const productoRepository = dataSource.getRepository(Producto);
      const productosUsingSubfamilia = await productoRepository.count({
        where: { subfamilia: { id: subfamiliaId } }
      });

      if (productosUsingSubfamilia > 0) {
        return {
          success: false,
          message: `Cannot delete subfamilia. It is being used by ${productosUsingSubfamilia} product(s).`
        };
      }

      // Soft delete by setting activo to false
      subfamilia.activo = false;
      await setEntityUserTracking(dataSource, subfamilia, currentUser?.id, true);
      await subfamiliaRepository.save(subfamilia);

      return { success: true, message: 'Subfamilia deleted successfully' };
    } catch (error) {
      console.error('Error deleting subfamilia:', error);
      throw error;
    }
  });

  // --- Producto Handlers ---
  ipcMain.handle('get-productos', async () => {
    try {
      const productoRepository = dataSource.getRepository(Producto);
      return await productoRepository.find({
        where: { activo: true },
        relations: ['subfamilia', 'subfamilia.familia', 'receta', 'presentaciones'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting productos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-productos-with-filters', async (_event: any, filters: any) => {
    try {
      const productoRepository = dataSource.getRepository(Producto);

      // Construir where conditions
      const whereConditions: any = {};

      // Filtro por búsqueda
      if (filters.search) {
        whereConditions.nombre = Like(`%${filters.search}%`);
      }

      // Filtro por tipo
      if (filters.tipo && filters.tipo !== '') {
        whereConditions.tipo = filters.tipo;
      }

      // Filtro por estado activo. Acepta tanto 'active'/'inactive' como
      // 'true'/'false' (distintos callers usan una u otra convencion).
      if (filters.activo && filters.activo !== 'all') {
        whereConditions.activo = filters.activo === 'active' || filters.activo === 'true';
      }

      // Filtro por esVendible
      if (filters.esVendible && filters.esVendible !== 'all') {
        whereConditions.esVendible = filters.esVendible === 'true';
      }

      // Filtro por esComprable
      if (filters.esComprable && filters.esComprable !== 'all') {
        whereConditions.esComprable = filters.esComprable === 'true';
      }

      // Filtro por controlaStock
      if (filters.controlaStock && filters.controlaStock !== 'all') {
        whereConditions.controlaStock = filters.controlaStock === 'true';
      }

      // Filtro por esIngrediente
      if (filters.esIngrediente && filters.esIngrediente !== 'all') {
        whereConditions.esIngrediente = filters.esIngrediente === 'true';
      }

      // Filtro por registroCompleto (registro parcial vs completo)
      if (filters.registroCompleto && filters.registroCompleto !== 'all') {
        whereConditions.registroCompleto = filters.registroCompleto === 'true';
      }

      // Configurar paginación
      const page = filters.page || 0;
      const pageSize = filters.pageSize || 10;
      const skip = page * pageSize;

      // Obtener total de registros
      const total = await productoRepository.count({ where: whereConditions });

      // Obtener productos con paginación
      const productos = await productoRepository.find({
        where: whereConditions,
        relations: ['subfamilia', 'subfamilia.familia'],
        order: { nombre: 'ASC' },
        skip: skip,
        take: pageSize
      });

      return {
        items: productos,
        total: total
      };
    } catch (error) {
      console.error('Error getting productos with filters:', error);
      throw error;
    }
  });

  ipcMain.handle('get-producto', async (_event: any, productoId: number) => {
    try {
      const productoRepository = dataSource.getRepository(Producto);
      return await productoRepository.findOne({
        where: { id: productoId },
        relations: ['subfamilia', 'subfamilia.familia', 'receta', 'presentaciones', 'preciosCosto', 'sabores']
      });
    } catch (error) {
      console.error('Error getting producto:', error);
      throw error;
    }
  });

  /**
   * Lista de productos activos con el PRECIO PRINCIPAL resuelto por tipo (para
   * el listado de Productos del mobile). A diferencia de search-productos-by-
   * nombre, no filtra por esVendible (muestra también ingredientes).
   */
  ipcMain.handle('get-productos-con-precio', async () => {
    try {
      const repo = dataSource.getRepository(Producto);
      const pvRepo = dataSource.getRepository(PrecioVenta);
      const productos = await repo.find({
        where: { activo: true },
        relations: ['presentaciones', 'presentaciones.preciosVenta', 'presentaciones.preciosVenta.moneda', 'receta'],
        order: { nombre: 'ASC' },
      });

      const pickPrecio = (precios: any[]) =>
        precios?.find((pv: any) => pv.activo && pv.principal)
        || precios?.find((pv: any) => pv.activo)
        || precios?.[0]
        || null;
      const mapPrecio = (pv: any) =>
        pv ? { valor: Number(pv.valor), simbolo: pv.moneda?.simbolo || '', decimales: pv.moneda?.decimales ?? 0 } : null;

      return await Promise.all(productos.map(async (p: any) => {
        let precio: any = null;
        if (p.tipo === 'RETAIL' || p.tipo === 'RETAIL_INGREDIENTE' || p.tipo === 'BUFFET_POR_PESO') {
          const pres = (p.presentaciones || []).find((pr: any) => pr.principal) || (p.presentaciones || [])[0];
          precio = mapPrecio(pickPrecio(pres?.preciosVenta));
        } else if (p.tipo === 'ELABORADO_SIN_VARIACION') {
          const rid = p.receta?.id;
          if (rid) {
            const precios = await pvRepo.find({ where: { receta: { id: rid }, activo: true }, relations: ['moneda'], order: { principal: 'DESC' } });
            precio = mapPrecio(precios?.[0] || null);
          }
        } else if (p.tipo === 'ELABORADO_CON_VARIACION') {
          const precios = await pvRepo.createQueryBuilder('pv')
            .leftJoinAndSelect('pv.moneda', 'moneda')
            .innerJoin('pv.receta', 'receta')
            .where('receta.productoVariacion = :prodId', { prodId: p.id })
            .andWhere('pv.activo = :activo', { activo: true })
            .orderBy('pv.principal', 'DESC')
            .getMany();
          precio = mapPrecio(precios?.[0] || null);
        } else if (p.tipo === 'COMBO') {
          const precios = await pvRepo.find({ where: { producto: { id: p.id }, activo: true }, relations: ['moneda'], order: { principal: 'DESC' } });
          precio = mapPrecio(precios?.[0] || null);
        }
        return {
          id: p.id, nombre: p.nombre, tipo: p.tipo, activo: p.activo, imageUrl: p.imageUrl ?? null,
          esBuffet: p.tipo === 'BUFFET_POR_PESO',
          precio: precio?.valor ?? null, simbolo: precio?.simbolo || '', decimales: precio?.decimales ?? 0,
        };
      }));
    } catch (error) {
      console.error('Error getting productos con precio:', error);
      throw error;
    }
  });

  /**
   * Detalle completo (solo lectura) de un producto para el mobile: producto +
   * familia/subfamilia + presentaciones con sus precios + precios de receta
   * (elaborados) + precios directos (combos), en un único round-trip.
   */
  ipcMain.handle('get-producto-detalle-mesa', async (_event: any, productoId: number) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const pvRepo = dataSource.getRepository(PrecioVenta);
      const producto = await repo.findOne({
        where: { id: productoId },
        relations: [
          'subfamilia', 'subfamilia.familia', 'receta',
          'presentaciones', 'presentaciones.preciosVenta',
          'presentaciones.preciosVenta.moneda', 'presentaciones.preciosVenta.tipoPrecio',
        ],
      });
      if (!producto) return null;

      let preciosReceta: any[] = [];
      if ((producto as any).receta?.id) {
        preciosReceta = await pvRepo.find({
          where: { receta: { id: (producto as any).receta.id }, activo: true },
          relations: ['moneda', 'tipoPrecio'],
          order: { principal: 'DESC', id: 'ASC' },
        });
      }
      const preciosProducto = await pvRepo.find({
        where: { producto: { id: producto.id }, activo: true },
        relations: ['moneda', 'tipoPrecio'],
        order: { principal: 'DESC', id: 'ASC' },
      });
      return { producto, preciosReceta, preciosProducto };
    } catch (error) {
      console.error('Error getting producto detalle (mesa):', error);
      throw error;
    }
  });

  ipcMain.handle('create-producto', async (_event: any, productoData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PRODUCTOS_GESTIONAR');
    try {
      const productoRepository = dataSource.getRepository(Producto);
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      const currentUser = getCurrentUser();

      // Subfamilia es opcional (productos parciales creados desde import OCR pueden no tenerla).
      let subfamilia: Subfamilia | null = null;
      const subId = productoData.subfamiliaId
        ?? productoData.subfamilia?.id
        ?? null;
      if (subId) {
        subfamilia = await subfamiliaRepository.findOneBy({ id: subId });
        if (!subfamilia) {
          return { success: false, message: 'Subfamilia not found' };
        }
      }

      // Validacion IVA
      const ivaNum = Number(productoData.iva ?? 10);
      if (![0, 5, 10].includes(ivaNum)) {
        throw new Error('IVA inválido. Debe ser 0, 5 o 10.');
      }

      const producto = productoRepository.create({
        nombre: productoData.nombre?.toUpperCase(),
        tipo: productoData.tipo,
        unidadBase: productoData.unidadBase?.toUpperCase(),
        subfamilia: subfamilia ?? undefined,
        activo: productoData.activo !== undefined ? productoData.activo : true,
        iva: ivaNum,
        // Campos de configuración booleanos
        esVendible: productoData.esVendible !== undefined ? productoData.esVendible : true,
        esComprable: productoData.esComprable !== undefined ? productoData.esComprable : false,
        controlaStock: productoData.controlaStock !== undefined ? productoData.controlaStock : true,
        esIngrediente: productoData.esIngrediente !== undefined ? productoData.esIngrediente : false,
        stockMinimo: productoData.stockMinimo,
        stockMaximo: productoData.stockMaximo,
        // Buffet por peso
        taraGramos: productoData.taraGramos ?? null,
        pesoMinimoGramos: productoData.pesoMinimoGramos ?? null,
        descuentaPorReceta: productoData.descuentaPorReceta !== undefined ? productoData.descuentaPorReceta : false,
        registroCompleto: productoData.registroCompleto !== undefined ? productoData.registroCompleto : true,
        imageUrl: productoData.imageUrl || undefined,
      });

      await setEntityUserTracking(dataSource, producto, currentUser?.id, false);
      const savedProducto = await productoRepository.save(producto);
      return savedProducto;
    } catch (error) {
      console.error('Error creating producto:', error);
      throw error;
    }
  });

  ipcMain.handle('update-producto', async (_event: any, productoId: number, productoData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PRODUCTOS_GESTIONAR');
    try {
      const productoRepository = dataSource.getRepository(Producto);
      const subfamiliaRepository = dataSource.getRepository(Subfamilia);
      const currentUser = getCurrentUser();

      const producto = await productoRepository.findOne({
        where: { id: productoId },
        relations: ['subfamilia', 'subfamilia.familia']
      });

      if (!producto) {
        return { success: false, message: 'Producto not found' };
      }

      // Actualizar campos básicos
      if (productoData.nombre !== undefined) producto.nombre = productoData.nombre.toUpperCase();
      if (productoData.tipo !== undefined) producto.tipo = productoData.tipo;
      if (productoData.unidadBase !== undefined) producto.unidadBase = productoData.unidadBase?.toUpperCase();
      if (productoData.activo !== undefined) producto.activo = productoData.activo;

      // Actualizar campos de configuración booleanos
      if (productoData.esVendible !== undefined) producto.esVendible = productoData.esVendible;
      if (productoData.esComprable !== undefined) producto.esComprable = productoData.esComprable;
      if (productoData.controlaStock !== undefined) producto.controlaStock = productoData.controlaStock;
      if (productoData.esIngrediente !== undefined) producto.esIngrediente = productoData.esIngrediente;

      // Actualizar campos de control de stock
      if (productoData.stockMinimo !== undefined) producto.stockMinimo = productoData.stockMinimo;
      if (productoData.stockMaximo !== undefined) producto.stockMaximo = productoData.stockMaximo;

      // Buffet por peso
      if (productoData.taraGramos !== undefined)
        (producto as any).taraGramos = productoData.taraGramos ?? null;
      if (productoData.pesoMinimoGramos !== undefined)
        (producto as any).pesoMinimoGramos = productoData.pesoMinimoGramos ?? null;
      if (productoData.descuentaPorReceta !== undefined)
        producto.descuentaPorReceta = productoData.descuentaPorReceta;

      // IVA con validacion
      if (productoData.iva !== undefined) {
        const ivaNum = Number(productoData.iva);
        if (![0, 5, 10].includes(ivaNum)) {
          throw new Error('IVA inválido. Debe ser 0, 5 o 10.');
        }
        producto.iva = ivaNum;
      }

      // Estado de registro (parcial vs completo)
      if (productoData.registroCompleto !== undefined) producto.registroCompleto = productoData.registroCompleto;

      // Imagen — al cambiar URL, eliminar archivo viejo del filesystem.
      if (productoData.imageUrl !== undefined) {
        const oldUrl = producto.imageUrl;
        const newUrl = productoData.imageUrl || undefined;
        if (oldUrl && oldUrl !== newUrl) {
          const { deleteImageByUrl } = require('../utils/image-resize.utils');
          deleteImageByUrl(oldUrl);
        }
        producto.imageUrl = newUrl;
      }

      // Actualizar subfamilia si se proporciona
      if (productoData.subfamiliaId !== undefined) {
        const subfamilia = await subfamiliaRepository.findOneBy({ id: productoData.subfamiliaId });
        if (subfamilia) {
          producto.subfamilia = subfamilia;
        }
      }

      // Actualizar receta si se proporciona
      if (productoData.recetaId !== undefined) {
        if (productoData.recetaId === null) {
          producto.receta = undefined;
        } else {
          const recetaRepository = dataSource.getRepository(Receta);
          const receta = await recetaRepository.findOneBy({ id: productoData.recetaId });
          if (receta) {
            producto.receta = receta;
          }
        }
      }

      await setEntityUserTracking(dataSource, producto, currentUser?.id, true);
      const updatedProducto = await productoRepository.save(producto);
      return { success: true, producto: updatedProducto };
    } catch (error) {
      console.error('Error updating producto:', error);
      throw error;
    }
  });

  // --- Presentacion Handlers ---
  ipcMain.handle('get-presentaciones', async () => {
    try {
      const presentacionRepository = dataSource.getRepository(Presentacion);
      const presentaciones = await presentacionRepository.find({
        where: { activo: true },
        relations: ['producto', 'codigosBarras', 'preciosVenta'],
        order: { cantidad: 'ASC' }
      });

      // Calculate virtual properties for each presentacion
      return presentaciones.map(presentacion => calculatePresentacionVirtualProps(presentacion));
    } catch (error) {
      console.error('Error getting presentaciones:', error);
      throw error;
    }
  });

  ipcMain.handle('get-presentaciones-by-producto', async (_event: any, productoId: number, page = 0, pageSize = 10, filtroActivo = 'activos') => {
    try {
      const presentacionRepository = dataSource.getRepository(Presentacion);

      // Construir el where clause según el filtro
      const whereClause: any = { producto: { id: productoId } };

      if (filtroActivo === 'activos') {
        whereClause.activo = true;
      } else if (filtroActivo === 'inactivos') {
        whereClause.activo = false;
      }
      // Si filtroActivo === 'todos', no agregamos filtro de activo

      // Get total count
      const total = await presentacionRepository.count({
        where: whereClause
      });

      // Get paginated data
      const presentaciones = await presentacionRepository.find({
        where: whereClause,
        relations: ['producto', 'codigosBarras', 'preciosVenta'],
        order: { cantidad: 'ASC' },
        skip: page * pageSize,
        take: pageSize
      });

      // Calculate virtual properties for each presentacion
      const presentacionesWithVirtualProps = presentaciones.map(presentacion =>
        calculatePresentacionVirtualProps(presentacion)
      );

      return {
        data: presentacionesWithVirtualProps,
        total: total,
        page: page,
        pageSize: pageSize
      };
    } catch (error) {
      console.error('Error getting presentaciones by producto:', error);
      throw error;
    }
  });

  ipcMain.handle('create-presentacion', async (_event: any, presentacionData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PRODUCTOS_GESTIONAR');
    try {
      const presentacionRepository = dataSource.getRepository(Presentacion);
      const productoRepository = dataSource.getRepository(Producto);
      const currentUser = getCurrentUser();

      // Aceptar tanto productoId (legacy) como producto: { id }
      const productoId = presentacionData.productoId ?? presentacionData.producto?.id;
      if (!productoId) {
        return { success: false, message: 'productoId requerido' };
      }
      const producto = await productoRepository.findOneBy({ id: productoId });
      if (!producto) {
        return { success: false, message: 'Producto not found' };
      }

      // Si la nueva presentación será principal, desmarcar todas las demás
      if (presentacionData.principal) {
        await presentacionRepository.update(
          { producto: { id: productoId }, activo: true },
          { principal: false }
        );
      }

      const presentacion = presentacionRepository.create({
        nombre: presentacionData.nombre,
        cantidad: presentacionData.cantidad,
        principal: presentacionData.principal,
        producto: producto,
        activo: presentacionData.activo !== undefined ? presentacionData.activo : true,
        imageUrl: presentacionData.imageUrl || undefined
      });

      await setEntityUserTracking(dataSource, presentacion, currentUser?.id, false);
      const savedPresentacion = await presentacionRepository.save(presentacion);
      return savedPresentacion;
    } catch (error) {
      console.error('Error creating presentacion:', error);
      throw error;
    }
  });

  ipcMain.handle('update-presentacion', async (_event: any, presentacionId: number, presentacionData: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PRODUCTOS_GESTIONAR');
    try {
      const presentacionRepository = dataSource.getRepository(Presentacion);
      const currentUser = getCurrentUser();

      const presentacion = await presentacionRepository.findOne({
        where: { id: presentacionId },
        relations: ['producto']
      });

      if (!presentacion) {
        return { success: false, message: 'Presentacion not found' };
      }

      // Si se está marcando como principal, desmarcar todas las demás del mismo producto
      if (presentacionData.principal && !presentacion.principal) {
        await presentacionRepository.update(
          { producto: { id: presentacion.producto.id }, activo: true },
          { principal: false }
        );
      }

      // Actualizar solo los campos permitidos
      if (presentacionData.nombre !== undefined) {
        presentacion.nombre = presentacionData.nombre;
      }
      if (presentacionData.cantidad !== undefined) {
        presentacion.cantidad = presentacionData.cantidad;
      }
      if (presentacionData.principal !== undefined) {
        presentacion.principal = presentacionData.principal;
      }
      if (presentacionData.activo !== undefined) {
        presentacion.activo = presentacionData.activo;
      }
      if (presentacionData.imageUrl !== undefined) {
        const oldUrl = presentacion.imageUrl;
        const newUrl = presentacionData.imageUrl || undefined;
        if (oldUrl && oldUrl !== newUrl) {
          const { deleteImageByUrl } = require('../utils/image-resize.utils');
          deleteImageByUrl(oldUrl);
        }
        presentacion.imageUrl = newUrl;
      }

      await setEntityUserTracking(dataSource, presentacion, currentUser?.id, true);
      const updatedPresentacion = await presentacionRepository.save(presentacion);
      return updatedPresentacion;
    } catch (error) {
      console.error('Error updating presentacion:', error);
      throw error;
    }
  });

  ipcMain.handle('set-presentacion-principal', async (_event: any, presentacionId: number) => {
    try {
      const presentacionRepository = dataSource.getRepository(Presentacion);
      const currentUser = getCurrentUser();

      // Obtener la presentación que se quiere marcar como principal
      const presentacion = await presentacionRepository.findOne({
        where: { id: presentacionId },
        relations: ['producto']
      });

      if (!presentacion) {
        return { success: false, message: 'Presentacion not found' };
      }

      // Verificar que la presentación esté activa
      if (!presentacion.activo) {
        return { success: false, message: 'No se puede marcar como principal una presentación inactiva' };
      }

      // Desmarcar todas las presentaciones del mismo producto como principales
      await presentacionRepository.update(
        { producto: { id: presentacion.producto.id }, activo: true },
        { principal: false }
      );

      // Marcar la presentación seleccionada como principal
      presentacion.principal = true;
      await setEntityUserTracking(dataSource, presentacion, currentUser?.id, true);
      const updatedPresentacion = await presentacionRepository.save(presentacion);

      return {
        success: true,
        presentacion: updatedPresentacion,
        message: `"${presentacion.nombre}" marcada como presentación principal`
      };
    } catch (error) {
      console.error('Error setting presentacion as principal:', error);
      throw error;
    }
  });

  ipcMain.handle('toggle-presentacion-activo', async (_event: any, presentacionId: number) => {
    try {
      const presentacionRepository = dataSource.getRepository(Presentacion);
      const currentUser = getCurrentUser();

      // Obtener la presentación
      const presentacion = await presentacionRepository.findOne({
        where: { id: presentacionId },
        relations: ['producto']
      });

      if (!presentacion) {
        return { success: false, message: 'Presentacion not found' };
      }

      // Verificar que no se esté intentando desactivar la presentación principal
      if (presentacion.principal && presentacion.activo) {
        return {
          success: false,
          message: 'No se puede desactivar la presentación principal. Primero debe marcar otra presentación como principal.'
        };
      }

      // Cambiar el estado activo
      const nuevoEstado = !presentacion.activo;
      presentacion.activo = nuevoEstado;

      // Si se está activando y es la única presentación activa, marcarla como principal
      if (nuevoEstado) {
        const presentacionesActivas = await presentacionRepository.count({
          where: { producto: { id: presentacion.producto.id }, activo: true }
        });

        if (presentacionesActivas === 0) {
          presentacion.principal = true;
        }
      }

      await setEntityUserTracking(dataSource, presentacion, currentUser?.id, true);
      const updatedPresentacion = await presentacionRepository.save(presentacion);

      const estadoTexto = nuevoEstado ? 'activada' : 'desactivada';
      return {
        success: true,
        presentacion: updatedPresentacion,
        message: `Presentación "${presentacion.nombre}" ${estadoTexto}`
      };
    } catch (error) {
      console.error('Error toggling presentacion activo:', error);
      throw error;
    }
  });

  ipcMain.handle('get-presentacion', async (_event: any, presentacionId: number) => {
    try {
      const presentacionRepository = dataSource.getRepository(Presentacion);
      const presentacion = await presentacionRepository.findOne({
        where: { id: presentacionId },
        relations: ['producto', 'codigosBarras', 'preciosVenta']
      });

      if (!presentacion) {
        return { success: false, message: 'Presentacion not found' };
      }

      // Calculate virtual properties for the presentacion
      const presentacionWithVirtualProps = calculatePresentacionVirtualProps(presentacion);
      return { success: true, presentacion: presentacionWithVirtualProps };
    } catch (error) {
      console.error('Error getting presentacion:', error);
      throw error;
    }
  });

  // --- Codigo Barra Handlers ---
  // Normaliza el código de barra antes de persistir: recorta espacios (los
  // lectores a veces agregan un salto de línea / espacio final) y lo pasa a
  // MAYÚSCULAS, de modo que el guardado y la búsqueda usen la misma forma.
  const normalizarCodigoBarra = (codigo: any): string =>
    (codigo ?? '').toString().trim().toUpperCase();

  ipcMain.handle('create-codigo-barra', async (_event: any, codigoBarraData: any) => {
    try {
      console.log('Creating codigo barra with data:', codigoBarraData);

      const codigoBarraRepository = dataSource.getRepository(CodigoBarra);
      const presentacionRepository = dataSource.getRepository(Presentacion);
      const currentUser = getCurrentUser();

      // Aceptar presentacionId (legacy) o presentacion: { id }
      const presentacionId = codigoBarraData.presentacionId ?? codigoBarraData.presentacion?.id;
      if (!presentacionId) {
        return { success: false, message: 'presentacionId requerido' };
      }
      const presentacion = await presentacionRepository.findOneBy({ id: presentacionId });
      if (!presentacion) {
        return { success: false, message: 'Presentacion not found' };
      }

      // If this is marked as principal, unmark other codes as principal
      if (codigoBarraData.principal) {
        console.log('Marking as principal, unmarking others...');
        await codigoBarraRepository.update(
          { presentacion: { id: presentacionId }, principal: true },
          { principal: false }
        );
      }

      const codigoBarra = codigoBarraRepository.create({
        codigo: normalizarCodigoBarra(codigoBarraData.codigo),
        presentacion: presentacion,
        principal: codigoBarraData.principal !== undefined ? codigoBarraData.principal : false,
        activo: codigoBarraData.activo !== undefined ? codigoBarraData.activo : true
      });

      console.log('Created codigo barra entity:', codigoBarra);

      await setEntityUserTracking(dataSource, codigoBarra, currentUser?.id, false);
      const savedCodigoBarra = await codigoBarraRepository.save(codigoBarra);

      console.log('Saved codigo barra:', savedCodigoBarra);
      return savedCodigoBarra;
    } catch (error) {
      console.error('Error creating codigo barra:', error);
      throw error;
    }
  });

  ipcMain.handle('update-codigo-barra', async (_event: any, codigoBarraId: number, codigoBarraData: any) => {
    try {
      const codigoBarraRepository = dataSource.getRepository(CodigoBarra);
      const currentUser = getCurrentUser();

      const codigoBarra = await codigoBarraRepository.findOne({
        where: { id: codigoBarraId },
        relations: ['presentacion']
      });

      if (!codigoBarra) {
        return { success: false, message: 'Codigo barra not found' };
      }

      // If this is being marked as principal, unmark other codes as principal
      if (codigoBarraData.principal && !codigoBarra.principal) {
        await codigoBarraRepository.update(
          { presentacion: { id: codigoBarra.presentacion.id }, principal: true },
          { principal: false }
        );
      }

      // Update fields
      if (codigoBarraData.codigo !== undefined) {
        codigoBarra.codigo = normalizarCodigoBarra(codigoBarraData.codigo);
      }
      if (codigoBarraData.principal !== undefined) {
        codigoBarra.principal = codigoBarraData.principal;
      }
      if (codigoBarraData.activo !== undefined) {
        codigoBarra.activo = codigoBarraData.activo;
      }

      await setEntityUserTracking(dataSource, codigoBarra, currentUser?.id, true);
      const updatedCodigoBarra = await codigoBarraRepository.save(codigoBarra);
      return updatedCodigoBarra;
    } catch (error) {
      console.error('Error updating codigo barra:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-codigo-barra', async (_event: any, codigoBarraId: number) => {
    try {
      const codigoBarraRepository = dataSource.getRepository(CodigoBarra);
      const currentUser = getCurrentUser();

      const codigoBarra = await codigoBarraRepository.findOne({
        where: { id: codigoBarraId },
        relations: ['presentacion']
      });

      if (!codigoBarra) {
        return { success: false, message: 'Codigo barra not found' };
      }

      // Soft delete by setting activo to false
      codigoBarra.activo = false;
      await setEntityUserTracking(dataSource, codigoBarra, currentUser?.id, true);
      await codigoBarraRepository.save(codigoBarra);

      return { success: true, message: 'Codigo barra deleted successfully' };
    } catch (error) {
      console.error('Error deleting codigo barra:', error);
      throw error;
    }
  });

  ipcMain.handle('get-codigos-barra-by-presentacion', async (_event: any, presentacionId: number) => {
    try {
      const codigoBarraRepository = dataSource.getRepository(CodigoBarra);
      const codigosBarra = await codigoBarraRepository.find({
        where: { presentacion: { id: presentacionId } },
        relations: ['presentacion'],
        order: { principal: 'DESC', id: 'ASC' }
      });
      return codigosBarra;
    } catch (error) {
      console.error('Error getting codigos barra by presentacion:', error);
      throw error;
    }
  });

  // --- Stock Movimiento Handlers ---
  ipcMain.handle('get-stock-movimientos', async () => {
    try {
      const stockMovimientoRepository = dataSource.getRepository(StockMovimiento);
      return await stockMovimientoRepository.find({
        where: { activo: true },
        relations: ['producto'],
        order: { fecha: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting stock movimientos:', error);
      throw error;
    }
  });

  ipcMain.handle('create-stock-movimiento', async (_event: any, stockMovimientoData: any) => {
    try {
      const stockMovimientoRepository = dataSource.getRepository(StockMovimiento);
      const productoRepository = dataSource.getRepository(Producto);
      const currentUser = getCurrentUser();

      const producto = await productoRepository.findOneBy({ id: stockMovimientoData.productoId });
      if (!producto) {
        return { success: false, message: 'Producto not found' };
      }

      const stockMovimiento = stockMovimientoRepository.create({
        cantidad: stockMovimientoData.cantidad,
        tipo: stockMovimientoData.tipo,
        referencia: stockMovimientoData.referencia,
        tipoReferencia: stockMovimientoData.tipoReferencia,
        observaciones: stockMovimientoData.observaciones,
        fecha: stockMovimientoData.fecha || new Date(),
        producto: producto,
        activo: stockMovimientoData.activo !== undefined ? stockMovimientoData.activo : true
      });

      await setEntityUserTracking(dataSource, stockMovimiento, currentUser?.id, false);
      const savedStockMovimiento = await stockMovimientoRepository.save(stockMovimiento);
      return savedStockMovimiento;
    } catch (error) {
      console.error('Error creating stock movimiento:', error);
      throw error;
    }
  });

  ipcMain.handle('get-stock-movimientos-by-producto', async (_event: any, productoId: number) => {
    try {
      const stockMovimientoRepository = dataSource.getRepository(StockMovimiento);
      return await stockMovimientoRepository.find({
        where: { producto: { id: productoId }, activo: true },
        relations: ['producto'],
        order: { fecha: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting stock movimientos by producto:', error);
      throw error;
    }
  });

  ipcMain.handle('update-stock-movimiento', async (_event: any, stockMovimientoId: number, stockMovimientoData: any) => {
    try {
      const stockMovimientoRepository = dataSource.getRepository(StockMovimiento);
      const stockMovimiento = await stockMovimientoRepository.findOneBy({ id: stockMovimientoId });

      if (!stockMovimiento) {
        return { success: false, message: 'Stock movimiento not found' };
      }

      // Actualizar campos
      if (stockMovimientoData.cantidad !== undefined) stockMovimiento.cantidad = stockMovimientoData.cantidad;
      if (stockMovimientoData.tipo !== undefined) stockMovimiento.tipo = stockMovimientoData.tipo;
      if (stockMovimientoData.referencia !== undefined) stockMovimiento.referencia = stockMovimientoData.referencia;
      if (stockMovimientoData.tipoReferencia !== undefined) stockMovimiento.tipoReferencia = stockMovimientoData.tipoReferencia;
      if (stockMovimientoData.observaciones !== undefined) stockMovimiento.observaciones = stockMovimientoData.observaciones;
      if (stockMovimientoData.fecha !== undefined) stockMovimiento.fecha = stockMovimientoData.fecha;
      if (stockMovimientoData.activo !== undefined) stockMovimiento.activo = stockMovimientoData.activo;

      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, stockMovimiento, currentUser?.id, true);
      const updatedStockMovimiento = await stockMovimientoRepository.save(stockMovimiento);
      return { success: true, stockMovimiento: updatedStockMovimiento };
    } catch (error) {
      console.error('Error updating stock movimiento:', error);
      throw error;
    }
  });

  // --- Observacion Handlers ---
  ipcMain.handle('getObservaciones', async () => {
    try {
      const observacionRepository = dataSource.getRepository(Observacion);
      return await observacionRepository.find({ where: { activo: true }, order: { descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting observaciones:', error);
      throw error;
    }
  });

  ipcMain.handle('searchObservaciones', async (_event: any, search: string) => {
    try {
      const observacionRepository = dataSource.getRepository(Observacion);
      const where: any = { activo: true };
      if (search) {
        where.descripcion = Like(`%${search.toUpperCase()}%`);
      }
      return await observacionRepository.find({ where, order: { descripcion: 'ASC' }, take: 50 });
    } catch (error) {
      console.error('Error searching observaciones:', error);
      throw error;
    }
  });

  ipcMain.handle('getObservacion', async (_event: any, id: number) => {
    try {
      const observacionRepository = dataSource.getRepository(Observacion);
      const observacion = await observacionRepository.findOneBy({ id });
      if (!observacion) {
        throw new Error(`Observacion with id ${id} not found`);
      }
      return observacion;
    } catch (error) {
      console.error('Error getting observacion:', error);
      throw error;
    }
  });

  ipcMain.handle('createObservacion', async (_event: any, data: any) => {
    try {
      const observacionRepository = dataSource.getRepository(Observacion);
      const currentUser = getCurrentUser();

      const observacion = observacionRepository.create({
        descripcion: data.descripcion?.toUpperCase(),
        activo: data.activo !== undefined ? data.activo : true
      });

      await setEntityUserTracking(dataSource, observacion, currentUser?.id, false);
      return await observacionRepository.save(observacion);
    } catch (error) {
      console.error('Error creating observacion:', error);
      throw error;
    }
  });

  ipcMain.handle('updateObservacion', async (_event: any, id: number, data: any) => {
    try {
      const observacionRepository = dataSource.getRepository(Observacion);
      const currentUser = getCurrentUser();

      const observacion = await observacionRepository.findOneBy({ id });
      if (!observacion) {
        throw new Error(`Observacion with id ${id} not found`);
      }

      if (data.descripcion !== undefined) observacion.descripcion = data.descripcion.toUpperCase();
      if (data.activo !== undefined) observacion.activo = data.activo;

      await setEntityUserTracking(dataSource, observacion, currentUser?.id, true);
      return await observacionRepository.save(observacion);
    } catch (error) {
      console.error('Error updating observacion:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteObservacion', async (_event: any, id: number) => {
    try {
      const observacionRepository = dataSource.getRepository(Observacion);
      const currentUser = getCurrentUser();

      const observacion = await observacionRepository.findOneBy({ id });
      if (!observacion) {
        throw new Error(`Observacion with id ${id} not found`);
      }

      observacion.activo = false;
      await setEntityUserTracking(dataSource, observacion, currentUser?.id, true);
      return await observacionRepository.save(observacion);
    } catch (error) {
      console.error('Error deleting observacion:', error);
      throw error;
    }
  });

  // --- ProductoObservacion Handlers ---
  ipcMain.handle('get-observaciones-by-producto', async (_event: any, productoId: number) => {
    try {
      const productoObservacionRepository = dataSource.getRepository(ProductoObservacion);
      return await productoObservacionRepository.find({
        where: { producto: { id: productoId }, activo: true },
        relations: ['observacion']
      });
    } catch (error) {
      console.error('Error getting observaciones by producto:', error);
      throw error;
    }
  });

  ipcMain.handle('create-producto-observacion', async (_event: any, data: any) => {
    try {
      const productoObservacionRepository = dataSource.getRepository(ProductoObservacion);
      const currentUser = getCurrentUser();

      const productoObservacion = productoObservacionRepository.create({
        producto: data.producto,
        observacion: data.observacion,
        activo: data.activo !== undefined ? data.activo : true
      });

      await setEntityUserTracking(dataSource, productoObservacion, currentUser?.id, false);
      return await productoObservacionRepository.save(productoObservacion);
    } catch (error) {
      console.error('Error creating producto observacion:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-producto-observacion', async (_event: any, id: number) => {
    try {
      const productoObservacionRepository = dataSource.getRepository(ProductoObservacion);
      const currentUser = getCurrentUser();

      const productoObservacion = await productoObservacionRepository.findOneBy({ id });
      if (!productoObservacion) {
        throw new Error(`ProductoObservacion with id ${id} not found`);
      }

      productoObservacion.activo = false;
      await setEntityUserTracking(dataSource, productoObservacion, currentUser?.id, true);
      return await productoObservacionRepository.save(productoObservacion);
    } catch (error) {
      console.error('Error deleting producto observacion:', error);
      throw error;
    }
  });

  // --- Combo Handlers ---
  ipcMain.handle('getComboByProducto', async (_event: any, productoId: number) => {
    try {
      const comboRepository = dataSource.getRepository(Combo);
      const combo = await comboRepository.findOne({
        where: { producto: { id: productoId }, activo: true },
        relations: ['productos', 'productos.producto', 'productos.producto.preciosCosto', 'productos.producto.preciosCosto.moneda', 'productos.presentacion', 'productos.presentacion.preciosVenta', 'productos.presentacion.preciosVenta.moneda', 'productos.presentacion.preciosVenta.tipoPrecio']
      });

      // Load price info for each producto in the combo
      if (combo && combo.productos) {
        const precioVentaRepo = dataSource.getRepository(PrecioVenta);
        const precioCostoRepo = dataSource.getRepository(PrecioCosto);
        const presentacionRepo = dataSource.getRepository(Presentacion);
        const productoRepo = dataSource.getRepository(Producto);

        for (const cp of combo.productos) {
          if (!cp.producto) continue;
          const prodId = cp.producto.id;

          // Load full producto with receta relation to get receta_id
          const fullProducto = await productoRepo.findOne({
            where: { id: prodId },
            relations: ['receta']
          });
          const receta = fullProducto?.receta;

          // --- Precios de Venta ---
          let preciosVenta: PrecioVenta[] = [];

          // 0. If a specific presentacion is selected, use its prices
          if (cp.presentacion?.preciosVenta && cp.presentacion.preciosVenta.length > 0) {
            preciosVenta = cp.presentacion.preciosVenta.filter(pv => pv.activo);
          }

          // 1. Direct product prices (COMBO type)
          if (preciosVenta.length === 0) {
            preciosVenta = await precioVentaRepo.find({
              where: { producto: { id: prodId }, activo: true },
              relations: ['moneda', 'tipoPrecio'],
              order: { principal: 'DESC', id: 'ASC' }
            });
          }

          // 2. Receta prices (ELABORADO types) — via producto.receta_id
          if (preciosVenta.length === 0 && receta) {
            preciosVenta = await precioVentaRepo.find({
              where: { receta: { id: receta.id }, activo: true },
              relations: ['moneda', 'tipoPrecio'],
              order: { principal: 'DESC', id: 'ASC' }
            });
          }

          // 3. Presentacion prices (RETAIL types) — fallback to all presentaciones
          if (preciosVenta.length === 0) {
            const presentaciones = await presentacionRepo.find({
              where: { producto: { id: prodId }, activo: true },
              relations: ['preciosVenta', 'preciosVenta.moneda', 'preciosVenta.tipoPrecio']
            });
            for (const pres of presentaciones) {
              if (pres.preciosVenta) {
                preciosVenta.push(...pres.preciosVenta.filter(pv => pv.activo));
              }
            }
          }
          (cp.producto as any).preciosVenta = preciosVenta;

          // --- Costo ---
          // 1. For elaborados: use receta.costoCalculado
          if (receta && receta.costoCalculado) {
            (cp.producto as any).costoCalculado = Number(receta.costoCalculado);
          }

          // 2. Direct product costs
          const preciosCosto = cp.producto.preciosCosto?.filter((pc: any) => pc.activo !== false) || [];
          if (preciosCosto.length === 0 && receta) {
            // 3. Receta costs
            const recetaCostos = await precioCostoRepo.find({
              where: { receta: { id: receta.id }, activo: true },
              relations: ['moneda']
            });
            cp.producto.preciosCosto = recetaCostos;
          }
        }
      }

      return combo;
    } catch (error) {
      console.error('Error getting combo by producto:', error);
      throw error;
    }
  });

  ipcMain.handle('createCombo', async (_event: any, data: any) => {
    try {
      const comboRepository = dataSource.getRepository(Combo);
      const currentUser = getCurrentUser();

      const combo = comboRepository.create({
        nombre: data.nombre?.toUpperCase() || '',
        activo: true,
        producto: { id: data.productoId } as any
      });

      await setEntityUserTracking(dataSource, combo, currentUser?.id, false);
      return await comboRepository.save(combo);
    } catch (error) {
      console.error('Error creating combo:', error);
      throw error;
    }
  });

  ipcMain.handle('updateCombo', async (_event: any, id: number, data: any) => {
    try {
      const comboRepository = dataSource.getRepository(Combo);
      const currentUser = getCurrentUser();

      const combo = await comboRepository.findOneBy({ id });
      if (!combo) {
        throw new Error(`Combo with id ${id} not found`);
      }

      if (data.nombre !== undefined) combo.nombre = data.nombre.toUpperCase();
      if (data.activo !== undefined) combo.activo = data.activo;

      await setEntityUserTracking(dataSource, combo, currentUser?.id, true);
      return await comboRepository.save(combo);
    } catch (error) {
      console.error('Error updating combo:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteCombo', async (_event: any, id: number) => {
    try {
      const comboRepository = dataSource.getRepository(Combo);
      const currentUser = getCurrentUser();

      const combo = await comboRepository.findOneBy({ id });
      if (!combo) {
        throw new Error(`Combo with id ${id} not found`);
      }

      combo.activo = false;
      await setEntityUserTracking(dataSource, combo, currentUser?.id, true);
      return await comboRepository.save(combo);
    } catch (error) {
      console.error('Error deleting combo:', error);
      throw error;
    }
  });

  // --- ComboProducto Handlers ---
  ipcMain.handle('getComboProductos', async (_event: any, comboId: number) => {
    try {
      const comboProductoRepository = dataSource.getRepository(ComboProducto);
      return await comboProductoRepository.find({
        where: { combo: { id: comboId }, activo: true },
        relations: ['producto']
      });
    } catch (error) {
      console.error('Error getting combo productos:', error);
      throw error;
    }
  });

  ipcMain.handle('createComboProducto', async (_event: any, data: any) => {
    try {
      const comboProductoRepository = dataSource.getRepository(ComboProducto);
      const currentUser = getCurrentUser();

      const comboProducto = comboProductoRepository.create({
        combo: { id: data.comboId } as any,
        producto: { id: data.productoId } as any,
        presentacion: data.presentacionId ? { id: data.presentacionId } as any : undefined,
        cantidad: data.cantidad,
        esOpcional: data.esOpcional || false,
        activo: true
      });

      await setEntityUserTracking(dataSource, comboProducto, currentUser?.id, false);
      return await comboProductoRepository.save(comboProducto);
    } catch (error) {
      console.error('Error creating combo producto:', error);
      throw error;
    }
  });

  ipcMain.handle('updateComboProducto', async (_event: any, id: number, data: any) => {
    try {
      const comboProductoRepository = dataSource.getRepository(ComboProducto);
      const currentUser = getCurrentUser();

      const comboProducto = await comboProductoRepository.findOneBy({ id });
      if (!comboProducto) {
        throw new Error(`ComboProducto with id ${id} not found`);
      }

      if (data.cantidad !== undefined) comboProducto.cantidad = data.cantidad;
      if (data.esOpcional !== undefined) comboProducto.esOpcional = data.esOpcional;
      if (data.activo !== undefined) comboProducto.activo = data.activo;
      if (data.presentacionId !== undefined) {
        (comboProducto as any).presentacion = data.presentacionId ? { id: data.presentacionId } : null;
      }

      await setEntityUserTracking(dataSource, comboProducto, currentUser?.id, true);
      return await comboProductoRepository.save(comboProducto);
    } catch (error) {
      console.error('Error updating combo producto:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteComboProducto', async (_event: any, id: number) => {
    try {
      const comboProductoRepository = dataSource.getRepository(ComboProducto);
      const currentUser = getCurrentUser();

      const comboProducto = await comboProductoRepository.findOneBy({ id });
      if (!comboProducto) {
        throw new Error(`ComboProducto with id ${id} not found`);
      }

      comboProducto.activo = false;
      await setEntityUserTracking(dataSource, comboProducto, currentUser?.id, true);
      return await comboProductoRepository.save(comboProducto);
    } catch (error) {
      console.error('Error deleting combo producto:', error);
      throw error;
    }
  });

  // --- Helper Methods ---
  // --- Producción de buffet (cargar las cubas) ---
  // Atómico: crea Produccion + ProduccionIngrediente[] + StockMovimiento
  // PRODUCCION_SALIDA por cada insumo (escalado por receta) + PRODUCCION_ENTRADA
  // del producto buffet. Así el stock del buffet = producido - vendido.
  ipcMain.handle('crear-produccion', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'PRODUCTOS_GESTIONAR');
    const currentUser = getCurrentUser();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const productoId = data.productoId;
      const cantidadProducida = Number(data.cantidadProducida) || 0;
      if (!productoId || cantidadProducida <= 0) {
        throw new Error('Producto y cantidad producida son obligatorios');
      }

      const producto = await queryRunner.manager.findOne(Producto, {
        where: { id: productoId },
        relations: ['receta'],
      });
      if (!producto) throw new Error('Producto no encontrado');

      const recetaId = producto.receta?.id;
      let receta: Receta | null = null;
      let ingredientesReceta: RecetaIngrediente[] = [];
      if (recetaId) {
        receta = await queryRunner.manager.findOne(Receta, { where: { id: recetaId } });
        ingredientesReceta = await queryRunner.manager.find(RecetaIngrediente, {
          where: { receta: { id: recetaId }, activo: true },
          relations: ['producto'],
        });
      }

      // Crear cabecera de producción.
      const produccion = queryRunner.manager.create(Produccion, {
        fecha: data.fecha ? new Date(data.fecha) : new Date(),
        cantidadProducida,
        unidad: (data.unidad || producto.unidadBase || receta?.unidadRendimiento || 'KILOGRAMO').toString().toUpperCase(),
        observaciones: data.observaciones ? String(data.observaciones).toUpperCase() : undefined,
        receta: receta ?? undefined,
        usuario: currentUser ?? undefined,
      } as any);
      const savedProduccion = await queryRunner.manager.save(Produccion, produccion);

      // Escalar insumos y descontar stock (PRODUCCION_SALIDA).
      const ingsCalc = escalarProduccion(
        ingredientesReceta.map((ri) => ({
          ingredienteId: (ri as any).producto?.id,
          cantidad: Number(ri.cantidad),
          unidad: ri.unidad,
          porcentajeAprovechamiento: Number(ri.porcentajeAprovechamiento),
        })).filter((x) => !!x.ingredienteId),
        Number(receta?.rendimiento) || 1,
        cantidadProducida,
      );

      for (const ing of ingsCalc) {
        const pi = queryRunner.manager.create(ProduccionIngrediente, {
          cantidadUsada: ing.cantidadUsada,
          unidad: ing.unidad,
          produccion: savedProduccion,
          ingrediente: { id: ing.ingredienteId } as any,
        } as any);
        await queryRunner.manager.save(ProduccionIngrediente, pi);

        const movSalida = queryRunner.manager.create(StockMovimiento, {
          cantidad: ing.cantidadUsada,
          tipo: StockMovimientoTipo.PRODUCCION_SALIDA,
          referencia: savedProduccion.id,
          tipoReferencia: StockMovimientoTipoReferencia.PRODUCCION,
          fecha: new Date(),
          activo: true,
          producto: { id: ing.ingredienteId } as any,
          observaciones: `PRODUCCION #${savedProduccion.id} - INSUMO`,
        } as any);
        if (currentUser) {
          (movSalida as any).createdBy = currentUser;
          (movSalida as any).updatedBy = currentUser;
        }
        await queryRunner.manager.save(StockMovimiento, movSalida);
      }

      // Entrada del producto buffet terminado (en su unidad base).
      const movEntrada = queryRunner.manager.create(StockMovimiento, {
        cantidad: cantidadProducida,
        tipo: StockMovimientoTipo.PRODUCCION_ENTRADA,
        referencia: savedProduccion.id,
        tipoReferencia: StockMovimientoTipoReferencia.PRODUCCION,
        fecha: new Date(),
        activo: true,
        producto: { id: producto.id } as any,
        observaciones: `PRODUCCION #${savedProduccion.id} - BUFFET`,
      } as any);
      if (currentUser) {
        (movEntrada as any).createdBy = currentUser;
        (movEntrada as any).updatedBy = currentUser;
      }
      await queryRunner.manager.save(StockMovimiento, movEntrada);

      await queryRunner.commitTransaction();
      return { success: true, produccionId: savedProduccion.id, insumos: ingsCalc.length };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('Error creando produccion:', error);
      return { success: false, message: error?.message || 'Error al crear producción' };
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-producciones', async (_event: any, filtros: any = {}) => {
    try {
      const repo = dataSource.getRepository(Produccion);
      const qb = repo.createQueryBuilder('p')
        .leftJoinAndSelect('p.receta', 'receta')
        .leftJoinAndSelect('p.ingredientes', 'ingredientes')
        .where('p.activo = :activo', { activo: true })
        .orderBy('p.fecha', 'DESC')
        .addOrderBy('p.id', 'DESC');
      if (filtros?.recetaId) {
        qb.andWhere('receta.id = :recetaId', { recetaId: filtros.recetaId });
      }
      return await qb.getMany();
    } catch (error) {
      console.error('Error obteniendo producciones:', error);
      throw error;
    }
  });

  ipcMain.handle('search-productos-by-codigo', async (_event: any, codigo: string) => {
    try {
      const codigoBarraRepository = dataSource.getRepository(CodigoBarra);
      const codigoBarra = await codigoBarraRepository.findOne({
        where: { codigo: codigo, activo: true },
        relations: ['presentacion', 'presentacion.producto']
      });

      return codigoBarra ? {
        presentacion: codigoBarra.presentacion,
        producto: codigoBarra.presentacion.producto
      } : null;
    } catch (error) {
      console.error('Error searching producto by codigo:', error);
      throw error;
    }
  });

  /**
   * Resuelve un código de barras a un producto LISTO para el módulo de meseros:
   * trae el producto con presentaciones + precios + receta (igual shape que el
   * atajo del PdV), para que el mobile arme el VM y abra el diálogo correcto
   * (incluye buffet por peso). Devuelve null si el código no está registrado.
   */
  ipcMain.handle('buscar-producto-codigo-mesa', async (_event: any, codigo: string) => {
    try {
      const codigoBarraRepository = dataSource.getRepository(CodigoBarra);
      const cb = await codigoBarraRepository.findOne({
        where: { codigo: codigo, activo: true },
        relations: ['presentacion', 'presentacion.producto'],
      });
      const prodId = cb?.presentacion?.producto?.id;
      if (!prodId) return null;

      const productoRepo = dataSource.getRepository(Producto);
      const producto = await productoRepo.findOne({
        where: { id: prodId },
        relations: [
          'presentaciones',
          'presentaciones.preciosVenta',
          'presentaciones.preciosVenta.moneda',
          'receta',
        ],
      });
      if (!producto) return null;
      return { producto, presentacionId: cb!.presentacion.id };
    } catch (error) {
      console.error('Error resolviendo producto por código (mesa):', error);
      throw error;
    }
  });

  ipcMain.handle('search-productos-by-nombre', async (_event: any, nombre: string, mode: 'venta' | 'compra' = 'venta') => {
    try {
      const repo = dataSource.getRepository(Producto);
      const pvRepo = dataSource.getRepository(PrecioVenta);

      const where: any = { activo: true };
      if (mode === 'compra') {
        where.esComprable = true;
      } else {
        where.esVendible = true;
      }

      const productos = await repo.find({
        where,
        relations: ['presentaciones', 'presentaciones.preciosVenta', 'presentaciones.preciosVenta.moneda', 'receta'],
        order: { nombre: 'ASC' }
      });

      // Buscar también por CÓDIGO DE BARRA: si el término coincide con un
      // código activo, incluir ese producto en los resultados (los lectores
      // envían el código completo). Así el buscador "encuentra por código"
      // tanto en el PdV como en el mobile.
      // Se compara con TRIM + UPPER en ambos lados para tolerar diferencias de
      // espacios/mayúsculas (incluye códigos ya guardados sin normalizar).
      const termino = (nombre || '').trim();
      const codigoProdIds = new Set<number>();
      if (termino) {
        const cbRepo = dataSource.getRepository(CodigoBarra);
        const cbs = await cbRepo
          .createQueryBuilder('cb')
          .leftJoinAndSelect('cb.presentacion', 'presentacion')
          .leftJoinAndSelect('presentacion.producto', 'producto')
          .where('cb.activo = :activo', { activo: true })
          .andWhere('UPPER(TRIM(cb.codigo)) = UPPER(:codigo)', { codigo: termino })
          .getMany();
        for (const cb of cbs) {
          const pid = (cb as any)?.presentacion?.producto?.id;
          if (pid) codigoProdIds.add(pid);
        }
      }

      const filtered = productos.filter(p =>
        p.nombre.toUpperCase().includes(termino.toUpperCase()) || codigoProdIds.has(p.id)
      );

      const mapPrecio = (pv: any) => pv ? {
        id: pv.id, valor: Number(pv.valor), principal: pv.principal, activo: pv.activo,
        precioMinimo: pv.precioMinimo != null ? Number(pv.precioMinimo) : null,
        precioMaximo: pv.precioMaximo != null ? Number(pv.precioMaximo) : null,
        moneda: pv.moneda ? { id: pv.moneda.id, nombre: pv.moneda.nombre, simbolo: pv.moneda.simbolo, decimales: pv.moneda.decimales } : null,
      } : null;

      const pickPrecio = (precios: any[]) =>
        precios?.find((pv: any) => pv.activo && pv.principal)
        || precios?.find((pv: any) => pv.activo)
        || precios?.[0]
        || null;

      const mapPres = (pres: any) => pres ? {
        id: pres.id, nombre: pres.nombre, cantidad: Number(pres.cantidad),
        principal: pres.principal, activo: pres.activo,
      } : null;

      return await Promise.all(filtered.map(async p => {
        let principalPresentacion: any = null;
        let principalPrecio: any = null;

        if (p.tipo === 'RETAIL' || p.tipo === 'RETAIL_INGREDIENTE' || p.tipo === 'BUFFET_POR_PESO') {
          const pres = (p.presentaciones as any[])?.find((pr: any) => pr.principal)
            || (p.presentaciones as any[])?.[0];
          principalPresentacion = mapPres(pres);
          principalPrecio = mapPrecio(pickPrecio(pres?.preciosVenta));
        } else if (p.tipo === 'ELABORADO_SIN_VARIACION') {
          const pres = (p.presentaciones as any[])?.[0];
          principalPresentacion = mapPres(pres);
          // Query receta prices separately to avoid joinColumns error
          const recetaId = (p as any).receta?.id;
          if (recetaId) {
            const precios = await pvRepo.find({
              where: { receta: { id: recetaId }, activo: true },
              relations: ['moneda'],
              order: { principal: 'DESC' }
            });
            principalPrecio = mapPrecio(precios?.[0] || null);
          }
        } else if (p.tipo === 'ELABORADO_CON_VARIACION') {
          // Query prices linked to any receta of this product
          const precios = await pvRepo
            .createQueryBuilder('pv')
            .leftJoinAndSelect('pv.moneda', 'moneda')
            .innerJoin('pv.receta', 'receta')
            .where('receta.productoVariacion = :prodId', { prodId: p.id })
            .andWhere('pv.activo = :activo', { activo: true })
            .orderBy('pv.principal', 'DESC')
            .getMany();
          principalPrecio = mapPrecio(precios?.[0] || null);
        } else if (p.tipo === 'COMBO') {
          const precios = await pvRepo.find({
            where: { producto: { id: p.id }, activo: true },
            relations: ['moneda'],
            order: { principal: 'DESC' }
          });
          principalPrecio = mapPrecio(precios?.[0] || null);
        }

        return {
          id: p.id, nombre: p.nombre, tipo: p.tipo, activo: p.activo, esVendible: p.esVendible, unidadBase: p.unidadBase,
          iva: (p as any).iva ?? 10,
          imageUrl: (p as any).imageUrl ?? null,
          // Datos de buffet por peso (para el flujo de pesaje en mobile/PdV).
          taraGramos: (p as any).taraGramos ?? null,
          pesoMinimoGramos: (p as any).pesoMinimoGramos ?? null,
          receta: (p as any).receta ? { id: (p as any).receta.id, costoCalculado: (p as any).receta.costoCalculado } : null,
          recetas: (p as any).recetas?.map((r: any) => ({ id: r.id, costoCalculado: r.costoCalculado })) || [],
          principalPresentacion,
          principalPrecio,
          // true si el término de búsqueda matcheó EXACTAMENTE un código de
          // barra de este producto. El PdV/buscador lo usa para auto-seleccionar
          // (como un click en la fila) cuando hay un único match exacto.
          matchByCodigo: codigoProdIds.has(p.id),
        };
      }));
    } catch (error) {
      console.error('Error searching productos by nombre:', error);
      throw error;
    }
  });

  // --- RecetaIngredienteIntercambiable Handlers ---
  ipcMain.handle('get-receta-ingredientes-intercambiables', async (_event: any, recetaIngredienteId: number) => {
    try {
      const repo = dataSource.getRepository(RecetaIngredienteIntercambiable);
      return await repo.find({
        where: { recetaIngrediente: { id: recetaIngredienteId }, activo: true },
        relations: ['ingredienteOpcion']
      });
    } catch (error) {
      console.error('Error getting receta ingredientes intercambiables:', error);
      throw error;
    }
  });

  // --- PrecioVenta Handlers ---
  ipcMain.handle('get-precios-venta', async () => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.find({
        where: { activo: true },
        relations: ['presentacion', 'moneda', 'tipoPrecio'],
        order: { id: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting precios venta:', error);
      throw error;
    }
  });

  ipcMain.handle('get-precios-venta-by-presentacion', async (_event: any, presentacionId: number, activo: boolean) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      // filttrar por activo solo si no es null
      const where: any = { presentacion: { id: presentacionId } };
      if (activo !== null) {
        where.activo = activo;
      }
      return await repo.find({
        where: where,
        relations: ['moneda', 'tipoPrecio'],
        order: { principal: 'DESC', id: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting precios venta by presentacion:', error);
      throw error;
    }
  });

  ipcMain.handle('get-precios-venta-by-receta', async (_event: any, recetaId: number, activo: boolean) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      // filttrar por activo solo si no es null
      const where: any = { receta: { id: recetaId } };
      if (activo !== null) {
        where.activo = activo;
      }
      return await repo.find({
        where: where,
        relations: ['moneda', 'tipoPrecio'],
        order: { principal: 'DESC', id: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting precios venta by receta:', error);
      throw error;
    }
  });

  ipcMain.handle('get-precios-venta-by-producto', async (_event: any, productoId: number, activo: boolean) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const where: any = { producto: { id: productoId } };
      if (activo !== null) {
        where.activo = activo;
      }
      return await repo.find({
        where: where,
        relations: ['moneda', 'tipoPrecio'],
        order: { principal: 'DESC', id: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting precios venta by producto:', error);
      throw error;
    }
  });

  ipcMain.handle('create-precio-venta', async (_event: any, precioVentaData: any) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const presentacionRepo = dataSource.getRepository(Presentacion);
      const recetaRepo = dataSource.getRepository(Receta);
      const productoRepo = dataSource.getRepository(Producto);
      const monedaRepo = dataSource.getRepository(Moneda);
      const tipoPrecioRepo = dataSource.getRepository(TipoPrecio);
      const currentUser = getCurrentUser();

      // Get related entities
      let presentacion = null;
      let receta = null;
      let producto = null;

      if (precioVentaData.presentacionId) {
        presentacion = await presentacionRepo.findOneBy({ id: precioVentaData.presentacionId });
        if (!presentacion) {
          throw new Error('Presentacion not found');
        }
      } else if (precioVentaData.recetaId) {
        receta = await recetaRepo.findOneBy({ id: precioVentaData.recetaId });
        if (!receta) {
          throw new Error('Receta not found');
        }
      } else if (precioVentaData.productoId) {
        producto = await productoRepo.findOneBy({ id: precioVentaData.productoId });
        if (!producto) {
          throw new Error('Producto not found');
        }
      } else {
        throw new Error('Either presentacionId, recetaId, or productoId must be provided');
      }

      const moneda = await monedaRepo.findOneBy({ id: precioVentaData.monedaId });
      if (!moneda) {
        throw new Error('Moneda not found');
      }

      const tipoPrecio = await tipoPrecioRepo.findOneBy({ id: precioVentaData.tipoPrecioId });
      if (!tipoPrecio) {
        throw new Error('TipoPrecio not found');
      }

      // If this is marked as principal, unmark others
      if (precioVentaData.principal) {
        if (presentacion) {
          const existingPrincipals = await repo.find({
            where: { presentacion: { id: presentacion.id }, principal: true }
          });
          for (const existing of existingPrincipals) {
            existing.principal = false;
            await repo.save(existing);
          }
        } else if (receta) {
          const existingPrincipals = await repo.find({
            where: { receta: { id: receta.id }, principal: true }
          });
          for (const existing of existingPrincipals) {
            existing.principal = false;
            await repo.save(existing);
          }
        } else if (producto) {
          const existingPrincipals = await repo.find({
            where: { producto: { id: producto.id }, principal: true }
          });
          for (const existing of existingPrincipals) {
            existing.principal = false;
            await repo.save(existing);
          }
        }
      }

      const precioVenta = repo.create({
        valor: precioVentaData.valor,
        principal: precioVentaData.principal || false,
        activo: precioVentaData.activo !== undefined ? precioVentaData.activo : true,
        // Programación de vigencia (precios por día/horario)
        diasSemana: precioVentaData.diasSemana || null,
        horaInicio: precioVentaData.horaInicio || null,
        horaFin: precioVentaData.horaFin || null,
        fechaInicio: precioVentaData.fechaInicio || null,
        fechaFin: precioVentaData.fechaFin || null,
        prioridad: precioVentaData.prioridad ?? 0,
        // Buffet por peso: tope/mínimo (cuando aplica)
        precioMinimo: precioVentaData.precioMinimo ?? null,
        precioMaximo: precioVentaData.precioMaximo ?? null,
        moneda: moneda,
        tipoPrecio: tipoPrecio,
        ...(presentacion && { presentacion }),
        ...(receta && { receta }),
        ...(producto && { producto })
      });

      await setEntityUserTracking(dataSource, precioVenta, currentUser?.id, false);
      const savedPrecioVenta = await repo.save(precioVenta);
      return savedPrecioVenta;
    } catch (error) {
      console.error('Error creating precio venta:', error);
      throw error;
    }
  });

  ipcMain.handle('update-precio-venta', async (_event: any, precioVentaId: number, precioVentaData: any) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const monedaRepo = dataSource.getRepository(Moneda);
      const tipoPrecioRepo = dataSource.getRepository(TipoPrecio);
      const currentUser = getCurrentUser();

      const precioVenta = await repo.findOne({
        where: { id: precioVentaId },
        relations: ['presentacion', 'receta', 'moneda', 'tipoPrecio']
      });

      if (!precioVenta) {
        throw new Error('PrecioVenta not found');
      }

      // Update fields
      if (precioVentaData.valor !== undefined) precioVenta.valor = precioVentaData.valor;
      if (precioVentaData.activo !== undefined) precioVenta.activo = precioVentaData.activo;

      // Programación de vigencia. Se nulea con `null` explícito (no undefined,
      // que TypeORM ignora) cuando llega cadena/valor vacío.
      if (precioVentaData.diasSemana !== undefined)
        (precioVenta as any).diasSemana = precioVentaData.diasSemana || null;
      if (precioVentaData.horaInicio !== undefined)
        (precioVenta as any).horaInicio = precioVentaData.horaInicio || null;
      if (precioVentaData.horaFin !== undefined)
        (precioVenta as any).horaFin = precioVentaData.horaFin || null;
      if (precioVentaData.fechaInicio !== undefined)
        (precioVenta as any).fechaInicio = precioVentaData.fechaInicio || null;
      if (precioVentaData.fechaFin !== undefined)
        (precioVenta as any).fechaFin = precioVentaData.fechaFin || null;
      if (precioVentaData.prioridad !== undefined)
        precioVenta.prioridad = precioVentaData.prioridad ?? 0;
      if (precioVentaData.precioMinimo !== undefined)
        (precioVenta as any).precioMinimo = precioVentaData.precioMinimo ?? null;
      if (precioVentaData.precioMaximo !== undefined)
        (precioVenta as any).precioMaximo = precioVentaData.precioMaximo ?? null;

      // Handle principal flag
      if (precioVentaData.principal !== undefined) {
        if (precioVentaData.principal) {
          // Unmark other precios as principal
          if (precioVenta.presentacion) {
            const existingPrincipals = await repo.find({
              where: { presentacion: { id: precioVenta.presentacion.id }, principal: true, id: Not(precioVentaId) }
            });
            for (const existing of existingPrincipals) {
              existing.principal = false;
              await repo.save(existing);
            }
          } else if (precioVenta.receta) {
            const existingPrincipals = await repo.find({
              where: { receta: { id: precioVenta.receta.id }, principal: true, id: Not(precioVentaId) }
            });
            for (const existing of existingPrincipals) {
              existing.principal = false;
              await repo.save(existing);
            }
          }
        }
        precioVenta.principal = precioVentaData.principal;
      }

      // Update related entities if provided
      if (precioVentaData.monedaId) {
        const moneda = await monedaRepo.findOneBy({ id: precioVentaData.monedaId });
        if (moneda) {
          precioVenta.moneda = moneda;
        }
      }

      if (precioVentaData.tipoPrecioId) {
        const tipoPrecio = await tipoPrecioRepo.findOneBy({ id: precioVentaData.tipoPrecioId });
        if (tipoPrecio) {
          precioVenta.tipoPrecio = tipoPrecio;
        }
      }

      await setEntityUserTracking(dataSource, precioVenta, currentUser?.id, true);
      const updatedPrecioVenta = await repo.save(precioVenta);
      return updatedPrecioVenta;
    } catch (error) {
      console.error('Error updating precio venta:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-precio-venta', async (_event: any, precioVentaId: number) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const currentUser = getCurrentUser();

      const precioVenta = await repo.findOneBy({ id: precioVentaId });
      if (!precioVenta) {
        throw new Error('PrecioVenta not found');
      }

      // Soft delete
      precioVenta.activo = false;
      await setEntityUserTracking(dataSource, precioVenta, currentUser?.id, true);
      await repo.save(precioVenta);
      return { success: true };
    } catch (error) {
      console.error('Error deleting precio venta:', error);
      throw error;
    }
  });

  // --- PrecioCosto Handlers ---
  ipcMain.handle('get-precios-costo', async () => {
    try {
      const repo = dataSource.getRepository(PrecioCosto);
      return await repo.find({
        relations: ['producto', 'moneda'],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting precios costo:', error);
      throw error;
    }
  });

  ipcMain.handle('get-precios-costo-by-producto', async (_event: any, productoId: number) => {
    try {
      const repo = dataSource.getRepository(PrecioCosto);
      return await repo.find({
        where: { producto: { id: productoId } },
        relations: ['producto', 'moneda'],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting precios costo by producto:', error);
      throw error;
    }
  });

  ipcMain.handle('create-precio-costo', async (_event: any, precioCostoData: any) => {
    try {
      const repo = dataSource.getRepository(PrecioCosto);
      const productoRepo = dataSource.getRepository(Producto);
      const monedaRepo = dataSource.getRepository(Moneda);
      const currentUser = getCurrentUser();

      // Get related entities
      const producto = await productoRepo.findOneBy({ id: precioCostoData.productoId });
      if (!producto) {
        throw new Error('Producto not found');
      }

      const moneda = await monedaRepo.findOneBy({ id: precioCostoData.monedaId });
      if (!moneda) {
        throw new Error('Moneda not found');
      }

      const precioCosto = repo.create({
        fuente: precioCostoData.fuente,
        valor: precioCostoData.valor,
        fecha: precioCostoData.fecha,
        activo: precioCostoData.activo !== undefined ? precioCostoData.activo : true,
        producto: producto,
        moneda: moneda
      });

      await setEntityUserTracking(dataSource, precioCosto, currentUser?.id, false);
      const savedPrecioCosto = await repo.save(precioCosto);
      return savedPrecioCosto;
    } catch (error) {
      console.error('Error creating precio costo:', error);
      throw error;
    }
  });

  ipcMain.handle('update-precio-costo', async (_event: any, precioCostoId: number, precioCostoData: any) => {
    try {
      const repo = dataSource.getRepository(PrecioCosto);
      const monedaRepo = dataSource.getRepository(Moneda);
      const currentUser = getCurrentUser();

      const precioCosto = await repo.findOne({
        where: { id: precioCostoId },
        relations: ['producto', 'moneda']
      });

      if (!precioCosto) {
        throw new Error('PrecioCosto not found');
      }

      // Update fields
      if (precioCostoData.fuente !== undefined) precioCosto.fuente = precioCostoData.fuente;
      if (precioCostoData.valor !== undefined) precioCosto.valor = precioCostoData.valor;
      if (precioCostoData.fecha !== undefined) precioCosto.fecha = precioCostoData.fecha;
      if (precioCostoData.activo !== undefined) precioCosto.activo = precioCostoData.activo;

      // Update related entities if provided
      if (precioCostoData.monedaId) {
        const moneda = await monedaRepo.findOneBy({ id: precioCostoData.monedaId });
        if (moneda) {
          precioCosto.moneda = moneda;
        }
      }

      await setEntityUserTracking(dataSource, precioCosto, currentUser?.id, true);
      const updatedPrecioCosto = await repo.save(precioCosto);
      return updatedPrecioCosto;
    } catch (error) {
      console.error('Error updating precio costo:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-precio-costo', async (_event: any, precioCostoId: number) => {
    try {
      const repo = dataSource.getRepository(PrecioCosto);
      const currentUser = getCurrentUser();

      const precioCosto = await repo.findOneBy({ id: precioCostoId });
      if (!precioCosto) {
        throw new Error('PrecioCosto not found');
      }

      // Soft delete
      precioCosto.activo = false;
      await setEntityUserTracking(dataSource, precioCosto, currentUser?.id, true);
      await repo.save(precioCosto);
      return { success: true };
    } catch (error) {
      console.error('Error deleting precio costo:', error);
      throw error;
    }
  });

  // ✅ NUEVO: Handler para el asistente de ingredientes
  ipcMain.handle('get-recetas-ids-por-variacion-ids', async (_event: any, variacionIds: number[]) => {
    try {
      const variacionRepository = dataSource.getRepository(RecetaPresentacion);
      const variaciones = await variacionRepository.find({
        where: {
          id: In(variacionIds)
        },
        relations: ['receta']
      });

      const mapeo: { [variacionId: number]: number } = {};
      for (const variacion of variaciones) {
        if (variacion.receta && variacion.receta.id) {
          mapeo[variacion.id] = variacion.receta.id;
        }
      }

      return mapeo;
    } catch (error) {
      console.error('Error en get-recetas-ids-por-variacion-ids:', error);
      throw error;
    }
  });

}
