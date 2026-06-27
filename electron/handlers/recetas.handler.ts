import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';

// Import recetas entities
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaIngrediente } from '../../src/app/database/entities/productos/receta-ingrediente.entity';
import { Adicional } from '../../src/app/database/entities/productos/adicional.entity';
import { RecetaAdicionalVinculacion } from '../../src/app/database/entities/productos/receta-adicional-vinculacion.entity';
import { RecetaMaterial } from '../../src/app/database/entities/productos/receta-material.entity';
import { RecetaFase } from '../../src/app/database/entities/productos/receta-fase.entity';
import { RecetaFaseIngrediente } from '../../src/app/database/entities/productos/receta-fase-ingrediente.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { PrecioCosto, FuenteCosto } from '../../src/app/database/entities/productos/precio-costo.entity';
// ✅ NUEVOS: Entidades para sabores y variaciones
import { Sabor } from '../../src/app/database/entities/productos/sabor.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';
import { Presentacion } from '../../src/app/database/entities/productos/presentacion.entity';
import { TipoPrecio } from '../../src/app/database/entities/financiero/tipo-precio.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { Like, IsNull, Not } from 'typeorm';
import { ensurePermission } from '../utils/auth.utils';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
  buildPdfBase64, pdfHeaderEmpresa, pdfTablaSimple, pdfMetadatos,
  pdfFooterPaginado, pdfFmtMonto,
} from '../utils/pdf.utils';

export function registerRecetasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {

  // Helper function to calculate recipe cost
  const calculateRecipeCost = async (recetaId: number): Promise<number> => {
    try {
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const recetaRepository = dataSource.getRepository(Receta);
      const precioCostoRepository = dataSource.getRepository(PrecioCosto);
      const currentUser = getCurrentUser();

      console.log(`🔄 Calculando costo de receta ID: ${recetaId}`);

      // Get the recipe
      const receta = await recetaRepository.findOne({
        where: { id: recetaId },
        relations: ['producto']
      });

      if (!receta) {
        throw new Error('Receta not found');
      }

      console.log(`📋 Receta encontrada: ${receta.nombre}`);

      const ingredientes = await recetaIngredienteRepository.find({
        where: {
          receta: { id: recetaId },
          activo: true
        },
        relations: ['ingrediente']
      });

            console.log(`🥘 Ingredientes encontrados: ${ingredientes.length}`);

      let costoTotal = 0;
      for (const ingrediente of ingredientes) {
        let costoUnitario = 0;

        // Ítem solo-descripción (sin ingrediente vinculado aún): no aporta costo.
        if (!ingrediente.ingrediente) {
          continue;
        }

        // Check if the ingredient is an elaborated product with its own recipe
        if (ingrediente.ingrediente.tipo === 'ELABORADO_SIN_VARIACION') {
          // Get the recipe of the ingredient product
          const recetaIngrediente = await recetaRepository.findOne({
            where: { producto: { id: ingrediente.ingrediente.id } }
          });

          if (recetaIngrediente && recetaIngrediente.costoCalculado > 0) {
            // Use the calculated cost from the ingredient's recipe
            costoUnitario = recetaIngrediente.costoCalculado;
            console.log(`🍳 Ingrediente elaborado: ${ingrediente.ingrediente.nombre} - Costo desde receta: ${costoUnitario}`);
          } else {
            // If no recipe or no calculated cost, try to get direct cost price
        const precioCosto = await precioCostoRepository.findOne({
          where: {
            producto: { id: ingrediente.ingrediente.id },
            activo: true
          },
          order: { createdAt: 'DESC' }
        });

        if (precioCosto) {
              costoUnitario = precioCosto.valor;
              console.log(`💰 Ingrediente elaborado: ${ingrediente.ingrediente.nombre} - Costo directo: ${costoUnitario}`);
            } else {
              console.log(`⚠️ Ingrediente elaborado sin costo: ${ingrediente.ingrediente.nombre}`);
            }
          }
        } else {
          // For non-elaborated products, get the direct cost price
          const precioCosto = await precioCostoRepository.findOne({
            where: {
              producto: { id: ingrediente.ingrediente.id },
              activo: true
            },
            order: { createdAt: 'DESC' }
          });

          if (precioCosto) {
            costoUnitario = precioCosto.valor;
            console.log(`💰 Ingrediente directo: ${ingrediente.ingrediente.nombre} - Costo: ${costoUnitario}`);
          } else {
            console.log(`⚠️ Ingrediente sin costo: ${ingrediente.ingrediente.nombre}`);
          }
        }

        if (costoUnitario > 0) {
          let costoIngrediente = 0;

          // Si hay unidad original guardada, significa que hubo conversión
          if (ingrediente.unidadOriginal && ingrediente.unidadOriginal !== ingrediente.unidad) {
            // Caso 1: Producto por kg, usuario seleccionó gramos
            if (ingrediente.ingrediente.unidadBase === 'KILOGRAMO' &&
                ingrediente.unidadOriginal === 'GRAMOS' &&
                ingrediente.unidad === 'KILOGRAMOS') {
              // La cantidad está en kg, pero el usuario trabajó en gramos
              // El costo unitario base es por kg, multiplicar directamente
              costoIngrediente = costoUnitario * ingrediente.cantidad;
            }
            // Caso 2: Producto por litro, usuario seleccionó mililitros
            else if (ingrediente.ingrediente.unidadBase === 'LITRO' &&
                     ingrediente.unidadOriginal === 'MILILITROS' &&
                     ingrediente.unidad === 'LITROS') {
              // La cantidad está en litros, pero el usuario trabajó en mililitros
              // El costo unitario base es por litro, multiplicar directamente
              costoIngrediente = costoUnitario * ingrediente.cantidad;
            }
            // Otros casos de conversión
            else {
              // Para otros casos, usar el costo unitario convertido
              costoIngrediente = costoUnitario * ingrediente.cantidad;
            }
          } else {
            // No hay conversión, usar el cálculo normal
            costoIngrediente = costoUnitario * ingrediente.cantidad;
          }

          // ✅ MODIFICADO: El porcentaje de aprovechamiento no afecta el costo del ingrediente
          // Solo se almacena para cálculos futuros de producción
          ingrediente.costoUnitario = costoUnitario;
          ingrediente.costoTotal = costoIngrediente;
          costoTotal += costoIngrediente;

          console.log(`📊 ${ingrediente.ingrediente.nombre}: ${ingrediente.cantidad} ${ingrediente.unidad} x ${costoUnitario} = ${costoIngrediente} (Aprovechamiento: ${ingrediente.porcentajeAprovechamiento || 100.00}% - no afecta costo)`);
          await recetaIngredienteRepository.save(ingrediente);
        }
      }

      console.log(`💵 Costo total calculado: ${costoTotal}`);

      // Update recipe total cost in the entity
      await recetaRepository.update(recetaId, { costoCalculado: costoTotal });

      // ✅ MEJORA: Verificar si el precio anterior es igual al nuevo antes de crear registro
      const monedaRepository = dataSource.getRepository(Moneda);
      const monedaPrincipal = await monedaRepository.findOne({
        where: { principal: true }
      });

      if (monedaPrincipal) {
        // Buscar el precio de costo más reciente para esta receta
        const precioCostoAnterior = await precioCostoRepository.findOne({
          where: {
            receta: { id: recetaId },
            activo: true,
            fuente: FuenteCosto.AJUSTE_RECETA
          },
          order: { createdAt: 'DESC' }
        });

        // Solo crear nuevo registro si el precio ha cambiado o no existe precio anterior
        const precioHaCambiado = !precioCostoAnterior ||
                                Math.abs(precioCostoAnterior.valor - costoTotal) > 0.01; // Tolerancia de 0.01

        if (precioHaCambiado) {
          console.log(`💾 Creando nuevo registro de PrecioCosto - Valor anterior: ${precioCostoAnterior?.valor || 'N/A'}, Nuevo valor: ${costoTotal}`);

          const precioCostoData: any = {
            fuente: FuenteCosto.AJUSTE_RECETA,
            valor: costoTotal,
            fecha: new Date(),
            activo: true,
            moneda: monedaPrincipal
          };

          // Vincular a la receta directamente
          precioCostoData.receta = receta;

          // Si la receta tiene producto, también vincular al producto (para compatibilidad)
          if (receta.producto) {
            precioCostoData.producto = receta.producto;
          }

          const precioCosto = precioCostoRepository.create(precioCostoData);
          await setEntityUserTracking(dataSource, precioCosto, currentUser?.id, false);
          await precioCostoRepository.save(precioCosto);
        } else {
          console.log(`✅ Precio sin cambios - No se crea nuevo registro de PrecioCosto`);
        }
      }

      console.log(`✅ Cálculo de costo completado para receta: ${receta.nombre}`);
      return costoTotal;
    } catch (error) {
      console.error('❌ Error calculating recipe cost:', error);
      throw error;
    }
  };

  // ===== Helpers unificados (antes en handlers separados) =====
  async function generarVariacionesParaProducto(queryRunner: any, productoId: number, saborId: number, recetaId: number): Promise<RecetaPresentacion[]> {
    const producto = await queryRunner.manager.getRepository(Producto).findOne({
      where: { id: productoId },
      relations: ['presentaciones']
    });

    if (!producto?.presentaciones?.length) return [];

    const repo = queryRunner.manager.getRepository(RecetaPresentacion);
    const variaciones: RecetaPresentacion[] = [];

    for (const presentacion of producto.presentaciones) {
      // Verificar si ya existe una variación para esta presentación y sabor
      const existente = await repo.findOne({
        where: {
          presentacion: { id: presentacion.id },
          sabor: { id: saborId }
        }
      });

      if (existente) continue;

      const nombre = generarNombreVariacion(producto.nombre, presentacion.nombre, producto.nombre);
      const sku = generarSKU(producto.nombre, producto.nombre, presentacion.nombre);

      const nueva = repo.create({
        nombre_generado: nombre,
        sku,
        costo_calculado: 0,
        activo: true,
        receta: { id: recetaId },
        presentacion: { id: presentacion.id },
        sabor: { id: saborId }
      });

      const guardada = await repo.save(nueva);
      variaciones.push(guardada);
    }

    return variaciones;
  }

  function generarNombreVariacion(nombreProducto: string, nombrePresentacion: string, nombreSabor?: string): string {
    const partes = [nombreProducto, nombrePresentacion, nombreSabor].filter(Boolean);
    return partes.join(' ').toUpperCase();
  }

  function generarSKU(nombreProducto: string, nombreSabor?: string, nombrePresentacion?: string): string {
    const timestamp = Date.now().toString().slice(-4);
    const partes = [
      nombreProducto.substring(0, 3).toUpperCase(),
      (nombreSabor?.substring(0, 3).toUpperCase() || 'STD'),
      (nombrePresentacion?.substring(1).toUpperCase() || 'U'),
      timestamp
    ];
    return partes.join('-');
  }

  async function calcularCostoVariacion(queryRunner: any, variacionId: number): Promise<void> {
    const variacion = await queryRunner.manager.getRepository(RecetaPresentacion).findOne({
      where: { id: variacionId },
      relations: ['receta', 'receta.ingredientes']
    });
    if (!variacion) return;
    const costoCalculado = variacion.receta.ingredientes?.reduce((t: number, ing: any) => t + (ing.costoTotal || 0), 0) || 0;
    await queryRunner.manager.getRepository(RecetaPresentacion).update(variacionId, { costo_calculado: costoCalculado });
  }

  async function recalcularCostoVariacion(variacionId: number): Promise<{ success: boolean; costoAnterior: number; costoNuevo: number; }> {
    const variacion = await dataSource.getRepository(RecetaPresentacion).findOne({ where: { id: variacionId }, relations: ['receta', 'receta.ingredientes'] });
    if (!variacion) throw new Error(`Variación con ID ${variacionId} no encontrada`);
    const costoAnterior = variacion.costo_calculado;
    const costoNuevo = variacion.receta.ingredientes?.reduce((t: number, ing: any) => t + (ing.costoTotal || 0), 0) || 0;
    await dataSource.getRepository(RecetaPresentacion).update(variacionId, { costo_calculado: costoNuevo });
    return { success: true, costoAnterior, costoNuevo };
  }

  // --- Receta Handlers ---
  ipcMain.handle('get-recetas', async () => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      return await recetaRepository.find({
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting recetas:', error);
      throw error;
    }
  });

  ipcMain.handle('get-recetas-with-filters', async (_event: any, filters: {
    search?: string;
    activo?: boolean | null;
    page?: number;
    pageSize?: number;
  }) => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);

      // Construir condiciones de búsqueda
      const whereConditions: any = {};

      if (filters.activo !== null && filters.activo !== undefined) {
        whereConditions.activo = filters.activo;
      }

      if (filters.search && filters.search.trim()) {
        whereConditions.nombre = Like(`%${filters.search.trim()}%`);
      }

      // Configurar paginación
      const page = filters.page || 0;
      const pageSize = filters.pageSize || 10;
      const skip = page * pageSize;

      // Obtener total de registros
      const total = await recetaRepository.count({ where: whereConditions });

      // Obtener registros paginados
      const recetas = await recetaRepository.find({
        where: whereConditions,
        order: { nombre: 'ASC' },
        skip,
        take: pageSize
      });

      return {
        items: recetas,
        total,
        page,
        pageSize
      };
    } catch (error) {
      console.error('Error getting recetas with filters:', error);
      throw error;
    }
  });

  ipcMain.handle('get-receta', async (_event: any, recetaId: number) => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      const receta = await recetaRepository.findOne({
        where: { id: recetaId },
        relations: ['preciosVenta', 'preciosVenta.moneda', 'preciosVenta.tipoPrecio', 'ingredientes', 'ingredientes.ingrediente', 'adicionalesVinculados', 'adicionalesVinculados.adicional', 'producto']
      });

      if (!receta) {
        throw new Error('Receta not found');
      }

      // Calcular precio principal
      if (receta.preciosVenta && receta.preciosVenta.length > 0) {
        const precioPrincipal = receta.preciosVenta.find(p => p.principal && p.activo);
        if (precioPrincipal) {
          receta.precioPrincipal = precioPrincipal.valor;
        } else {
          // Si no hay precio principal, tomar el primero activo
          const precioActivo = receta.preciosVenta.find(p => p.activo);
          if (precioActivo) {
            receta.precioPrincipal = precioActivo.valor;
          } else {
            receta.precioPrincipal = 0;
          }
        }
      } else {
        receta.precioPrincipal = 0;
      }

      return receta;
    } catch (error) {
      console.error('Error getting receta:', error);
      throw error;
    }
  });

  ipcMain.handle('create-receta', async (_event: any, recetaData: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const recetaRepository = dataSource.getRepository(Receta);
      const currentUser = getCurrentUser();

      const receta = recetaRepository.create({
        nombre: recetaData.nombre,
        descripcion: recetaData.descripcion,
        costoCalculado: 0,
        rendimiento: recetaData.rendimiento || 1,
        unidadRendimiento: recetaData.unidadRendimiento || 'UNIDADES',
        unidadRendimientoOriginal: recetaData.unidadRendimientoOriginal,
        tiempoPreparo: recetaData.tiempoPreparo ?? null,
        imageUrl: recetaData.imageUrl ?? null,
        activo: recetaData.activo !== undefined ? recetaData.activo : true
      });

      setEntityUserTracking(dataSource, receta, currentUser?.id, false);
      const savedReceta = await recetaRepository.save(receta);
      return savedReceta;
    } catch (error) {
      console.error('Error creating receta:', error);
      throw error;
    }
  });

  ipcMain.handle('update-receta', async (_event: any, recetaId: number, recetaData: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const recetaRepository = dataSource.getRepository(Receta);
      const currentUser = getCurrentUser();

      const receta = await recetaRepository.findOne({ where: { id: recetaId } });
      if (!receta) {
        throw new Error('Receta not found');
      }

      Object.assign(receta, {
        nombre: recetaData.nombre,
        descripcion: recetaData.descripcion,
        rendimiento: recetaData.rendimiento,
        unidadRendimiento: recetaData.unidadRendimiento,
        unidadRendimientoOriginal: recetaData.unidadRendimientoOriginal,
        activo: recetaData.activo,
        productoId: recetaData.productoId // Agregar actualización del productoId
      });
      // tiempoPreparo / imageUrl: solo actualizar si vienen en el payload.
      if (recetaData.tiempoPreparo !== undefined) receta.tiempoPreparo = recetaData.tiempoPreparo;
      if (recetaData.imageUrl !== undefined) receta.imageUrl = recetaData.imageUrl;

      setEntityUserTracking(dataSource, receta, currentUser?.id, true);
      return await recetaRepository.save(receta);
    } catch (error) {
      console.error('Error updating receta:', error);
      throw error;
    }
  });

  ipcMain.handle('check-receta-dependencies', async (_event: any, recetaId: number) => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      const productoRepository = dataSource.getRepository(Producto);

      // Buscar la receta con sus relaciones
      const receta = await recetaRepository.findOne({
        where: { id: recetaId },
        relations: ['producto']
      });

      if (!receta) {
        throw new Error('Receta not found');
      }

      // Buscar productos que usan esta receta
      const productosVinculados = await productoRepository.find({
        where: { receta: { id: recetaId } },
        select: ['id', 'nombre', 'tipo', 'activo']
      });

      return {
        receta: {
          id: receta.id,
          nombre: receta.nombre
        },
        productosVinculados: productosVinculados
      };
    } catch (error) {
      console.error('Error checking receta dependencies:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-receta', async (_event: any, recetaId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const recetaRepository = dataSource.getRepository(Receta);
      const productoRepository = dataSource.getRepository(Producto);
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const recetaAdicionalVinculacionRepository = dataSource.getRepository(RecetaAdicionalVinculacion);
      const precioVentaRepository = dataSource.getRepository(PrecioVenta);
      const precioCostoRepository = dataSource.getRepository(PrecioCosto);
      const currentUser = getCurrentUser();

      // Buscar la receta
      const receta = await recetaRepository.findOne({ where: { id: recetaId } });
      if (!receta) {
        throw new Error('Receta not found');
      }

      // Verificar si hay productos vinculados
      const productosVinculados = await productoRepository.find({
        where: { receta: { id: recetaId } }
      });

      if (productosVinculados.length > 0) {
        throw new Error(`No se puede eliminar la receta porque está vinculada a ${productosVinculados.length} producto(s)`);
      }

      // Eliminar en cascada todas las relaciones
      // 1. Eliminar ingredientes de la receta
      await recetaIngredienteRepository.delete({ receta: { id: recetaId } });

      // 2. Eliminar vinculaciones de adicionales de la receta
      await recetaAdicionalVinculacionRepository.delete({ receta: { id: recetaId } });

      // 3. Eliminar precios de venta asociados a la receta
      await precioVentaRepository.delete({ receta: { id: recetaId } });

      // 4. Eliminar precios de costo asociados a la receta
      await precioCostoRepository.delete({ receta: { id: recetaId } });

      // 5. Finalmente eliminar la receta
      await recetaRepository.delete(recetaId);

      return { success: true, message: 'Receta eliminada correctamente' };
    } catch (error) {
      console.error('Error deleting receta:', error);
      throw error;
    }
  });

  // Additional Receta handlers
  ipcMain.handle('get-recetas-by-estado', async (_event: any, activo: boolean | null) => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      const whereCondition = activo !== null ? { activo } : {};

      return await recetaRepository.find({
        where: whereCondition,
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting recetas by estado:', error);
      throw error;
    }
  });

  ipcMain.handle('search-recetas-by-nombre', async (_event: any, nombre: string) => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      return await recetaRepository.find({
        where: {
          nombre: Like(`%${nombre}%`),
          activo: true
        },
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error searching recetas by nombre:', error);
      throw error;
    }
  });

  ipcMain.handle('get-recetas-with-ingredientes', async () => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      return await recetaRepository.find({
        relations: ['ingredientes', 'ingredientes.ingrediente'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting recetas with ingredientes:', error);
      throw error;
    }
  });

  ipcMain.handle('calcular-costo-receta', async (_event: any, recetaId: number) => {
    try {
      return await calculateRecipeCost(recetaId);
    } catch (error) {
      console.error('Error calculating receta cost:', error);
      throw error;
    }
  });

  ipcMain.handle('actualizar-costo-receta', async (_event: any, recetaId: number) => {
    try {
      await calculateRecipeCost(recetaId);
      return { success: true };
    } catch (error) {
      console.error('Error updating receta cost:', error);
      throw error;
    }
  });

  // --- RecetaIngrediente Handlers ---
  ipcMain.handle('get-receta-ingredientes', async (_event: any, recetaId: number) => {
    try {
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      return await recetaIngredienteRepository.find({
        where: { receta: { id: recetaId } },
        relations: ['ingrediente', 'reemplazoDefault'],
        order: { createdAt: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting receta ingredientes:', error);
      throw error;
    }
  });

    ipcMain.handle('create-receta-ingrediente', async (_event: any, recetaIngredienteData: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'INGREDIENTES_GESTIONAR');
      // ✅ DEBUG: Log de los datos recibidos
      console.log('🔍 [create-receta-ingrediente] Datos recibidos:', {
        cantidad: recetaIngredienteData.cantidad,
        unidad: recetaIngredienteData.unidad,
        unidadOriginal: recetaIngredienteData.unidadOriginal,
        ingredienteId: recetaIngredienteData.ingrediente?.id || recetaIngredienteData.ingredienteId,
        recetaId: recetaIngredienteData.receta?.id || recetaIngredienteData.recetaId
      });

      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const productoRepository = dataSource.getRepository(Producto);
      const currentUser = getCurrentUser();

            // --- ✅ VALIDACIÓN ---
      // 1. Extraer IDs correctamente del objeto anidado
      const ingredienteId = recetaIngredienteData.ingrediente?.id || recetaIngredienteData.ingredienteId;
      const recetaId = recetaIngredienteData.receta?.id || recetaIngredienteData.recetaId;
      const descripcion = (recetaIngredienteData.descripcion || '').trim() || null;

      if (!recetaId) {
        throw new Error('ID de la receta no proporcionado');
      }

      // El ítem debe tener un ingrediente vinculado O una descripción libre.
      if (!ingredienteId && !descripcion) {
        throw new Error('Debe indicar un ingrediente o una descripción');
      }

      // 2. Si hay ingredienteId, verificar que el Producto exista. Si es ítem
      //    solo-descripción, no se vincula ingrediente.
      let ingrediente: Producto | null = null;
      if (ingredienteId) {
        ingrediente = await productoRepository.findOne({ where: { id: ingredienteId } });
        if (!ingrediente) {
          throw new Error(`El ingrediente con ID ${ingredienteId} no fue encontrado.`);
        }
      }
      // --- FIN DE LA VALIDACIÓN ---

      const recetaIngrediente = recetaIngredienteRepository.create({
        cantidad: recetaIngredienteData.cantidad ?? null,
        unidad: recetaIngredienteData.unidad ?? null,
        unidadOriginal: recetaIngredienteData.unidadOriginal,
        descripcion: descripcion ? descripcion.toUpperCase() : null,
        costoUnitario: recetaIngredienteData.costoUnitario || 0,
        costoTotal: recetaIngredienteData.costoTotal || 0,
        esExtra: recetaIngredienteData.esExtra || false,
        esOpcional: recetaIngredienteData.esOpcional || false,
        esCambiable: recetaIngredienteData.esCambiable || false,
        costoExtra: recetaIngredienteData.costoExtra || 0,
        activo: recetaIngredienteData.activo !== undefined ? recetaIngredienteData.activo : true,
        receta: { id: recetaId },
        ingrediente: ingrediente ?? null, // null = ítem solo-descripción
        reemplazoDefault: recetaIngredienteData.reemplazoDefaultId ? { id: recetaIngredienteData.reemplazoDefaultId } : undefined
      });

            setEntityUserTracking(dataSource, recetaIngrediente, currentUser?.id, false);
      const savedRecetaIngrediente = await recetaIngredienteRepository.save(recetaIngrediente);

      // ✅ DEBUG: Log de lo que se guardó
      console.log('✅ [create-receta-ingrediente] Ingrediente guardado:', {
        id: savedRecetaIngrediente.id,
        cantidad: savedRecetaIngrediente.cantidad,
        unidad: savedRecetaIngrediente.unidad,
        unidadOriginal: savedRecetaIngrediente.unidadOriginal,
        ingredienteId: savedRecetaIngrediente.ingrediente?.id,
        recetaId: savedRecetaIngrediente.receta?.id
      });

            // Calculate and update costs

      // Calculate and update costs
      await calculateRecipeCost(recetaId);

      // Return the saved ingredient with relations
      return await recetaIngredienteRepository.findOne({
        where: { id: savedRecetaIngrediente.id },
        relations: ['ingrediente', 'reemplazoDefault']
      });
    } catch (error) {
      console.error('Error creating receta ingrediente:', error);
      throw error;
    }
  });

  ipcMain.handle('update-receta-ingrediente', async (_event: any, recetaIngredienteId: number, recetaIngredienteData: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'INGREDIENTES_GESTIONAR');
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const currentUser = getCurrentUser();

      const recetaIngrediente = await recetaIngredienteRepository.findOne({
        where: { id: recetaIngredienteId },
        relations: ['receta', 'ingrediente']
      });

      if (!recetaIngrediente) {
        throw new Error('Receta ingrediente not found');
      }

      const nuevoIngredienteId =
        recetaIngredienteData.ingredienteId ?? recetaIngredienteData.ingrediente?.id ?? null;
      const nuevaDescripcion = (recetaIngredienteData.descripcion || '').trim() || null;
      if (!nuevoIngredienteId && !nuevaDescripcion) {
        throw new Error('Debe indicar un ingrediente o una descripción');
      }

      Object.assign(recetaIngrediente, {
        cantidad: recetaIngredienteData.cantidad ?? null,
        unidad: recetaIngredienteData.unidad ?? null,
        unidadOriginal: recetaIngredienteData.unidadOriginal,
        descripcion: nuevaDescripcion ? nuevaDescripcion.toUpperCase() : null,
        costoUnitario: recetaIngredienteData.costoUnitario || 0,
        costoTotal: recetaIngredienteData.costoTotal || 0,
        esExtra: recetaIngredienteData.esExtra,
        esOpcional: recetaIngredienteData.esOpcional,
        esCambiable: recetaIngredienteData.esCambiable,
        costoExtra: recetaIngredienteData.costoExtra,
        activo: recetaIngredienteData.activo,
        ingrediente: nuevoIngredienteId ? { id: nuevoIngredienteId } : null,
        reemplazoDefault: recetaIngredienteData.reemplazoDefaultId ? { id: recetaIngredienteData.reemplazoDefaultId } : undefined
      });

      setEntityUserTracking(dataSource, recetaIngrediente, currentUser?.id, true);
      const savedRecetaIngrediente = await recetaIngredienteRepository.save(recetaIngrediente);

      // Calculate and update costs
      await calculateRecipeCost(recetaIngrediente.receta.id);

      // Return the updated ingredient with relations
      return await recetaIngredienteRepository.findOne({
        where: { id: savedRecetaIngrediente.id },
        relations: ['ingrediente', 'reemplazoDefault']
      });
    } catch (error) {
      console.error('Error updating receta ingrediente:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-receta-ingrediente', async (_event: any, recetaIngredienteId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'INGREDIENTES_GESTIONAR');
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const currentUser = getCurrentUser();
      const recetaIngrediente = await recetaIngredienteRepository.findOne({
        where: { id: recetaIngredienteId },
        relations: ['receta']
      });

      if (!recetaIngrediente) {
        throw new Error('Receta ingrediente not found');
      }

      // ✅ NUEVA LÓGICA: Si ya está desactivado, hacer hard delete
      if (!recetaIngrediente.activo) {
        console.log(`🔴 [delete-receta-ingrediente] Ingrediente ${recetaIngredienteId} ya desactivado, ejecutando hard delete`);

        // Hard delete - eliminar físicamente de la base de datos
        await recetaIngredienteRepository.remove(recetaIngrediente);

        console.log(`✅ [delete-receta-ingrediente] Hard delete completado para ingrediente ${recetaIngredienteId}`);
      } else {
        // ✅ LÓGICA EXISTENTE: Soft delete si está activo
        console.log(`🟡 [delete-receta-ingrediente] Ejecutando soft delete para ingrediente ${recetaIngredienteId}`);

        recetaIngrediente.activo = false;
        setEntityUserTracking(dataSource, recetaIngrediente, currentUser?.id, true);
        await recetaIngredienteRepository.save(recetaIngrediente);

        console.log(`✅ [delete-receta-ingrediente] Soft delete completado para ingrediente ${recetaIngredienteId}`);
      }

      // ✅ RECALCULAR COSTOS: Siempre recalcular después de eliminar
      await calculateRecipeCost(recetaIngrediente.receta.id);

      return {
        success: true,
        message: recetaIngrediente.activo ? 'Ingrediente desactivado correctamente' : 'Ingrediente eliminado permanentemente',
        hardDelete: !recetaIngrediente.activo
      };
    } catch (error) {
      console.error('Error deleting receta ingrediente:', error);
      throw error;
    }
  });

  // ✅ NUEVO: Eliminar ingrediente de múltiples variaciones
  ipcMain.handle('delete-receta-ingrediente-multiples-variaciones', async (_event: any, data: {
    recetaIngredienteId: number;
    eliminarDeOtrasVariaciones: boolean;
  }) => {
    try {
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const currentUser = getCurrentUser();

      // 1. Obtener el ingrediente a eliminar con sus relaciones
      const recetaIngrediente = await recetaIngredienteRepository.findOne({
        where: { id: data.recetaIngredienteId },
        relations: ['receta', 'ingrediente']
      });

      if (!recetaIngrediente) {
        throw new Error('Receta ingrediente not found');
      }

      // 2. Si se debe eliminar de otras variaciones, buscar solo las recetas del MISMO SABOR que usan este ingrediente.
      //    Un ítem solo-descripción (sin ingrediente vinculado) no aplica a la lógica multi-variación.
      if (data.eliminarDeOtrasVariaciones && recetaIngrediente.ingrediente) {
        // ✅ NUEVO: Obtener el sabor de la receta actual a través de RecetaPresentacion
        const recetaPresentacionRepository = dataSource.getRepository(RecetaPresentacion);
        const variacionActual = await recetaPresentacionRepository.findOne({
          where: { receta: { id: recetaIngrediente.receta.id } },
          relations: ['sabor']
        });

        if (!variacionActual?.sabor?.id) {
          throw new Error('No se pudo determinar el sabor de la receta actual');
        }

        // ✅ CORREGIDO: Buscar solo recetas del mismo sabor que usen este ingrediente
        // La relación correcta es: RecetaIngrediente -> Receta -> RecetaPresentacion -> Sabor
        // ✅ NUEVO: Sin filtro de activo porque usamos hard delete
        const recetasConMismoIngrediente = await recetaIngredienteRepository
          .createQueryBuilder('ri')
          .leftJoinAndSelect('ri.receta', 'receta')
          .leftJoinAndSelect('ri.ingrediente', 'ingrediente')
          .innerJoin('receta_presentacion', 'rp', 'rp.receta_id = receta.id')
          .innerJoin('sabor', 's', 's.id = rp.sabor_id')
          .where('ri.ingrediente.id = :ingredienteId', { ingredienteId: recetaIngrediente.ingrediente.id })
          .andWhere('s.id = :saborId', { saborId: variacionActual.sabor.id })
          .getMany();

        console.log(`🔄 [delete-receta-ingrediente-multiples-variaciones] Encontradas ${recetasConMismoIngrediente.length} recetas del mismo sabor con el mismo ingrediente (incluyendo inactivos)`);

        // ✅ NUEVO: Mostrar si se encontraron ingredientes inactivos
        const ingredientesInactivos = recetasConMismoIngrediente.filter(ri => !ri.activo);
        if (ingredientesInactivos.length > 0) {
          console.log(`⚠️ [delete-receta-ingrediente-multiples-variaciones] Se encontraron ${ingredientesInactivos.length} ingredientes inactivos que también serán eliminados`);
        }

        // 3. Eliminar el ingrediente de todas las recetas encontradas (HARD DELETE)
        for (const recetaIng of recetasConMismoIngrediente) {
          // ✅ HARD DELETE: Eliminar físicamente de la base de datos
          await recetaIngredienteRepository.remove(recetaIng);

          // Recalcular costos de cada receta
          await calculateRecipeCost(recetaIng.receta.id);
        }

        console.log(`✅ [delete-receta-ingrediente-multiples-variaciones] Ingrediente eliminado permanentemente de ${recetasConMismoIngrediente.length} variaciones del mismo sabor`);

        return {
          success: true,
          message: `Ingrediente eliminado permanentemente de ${recetasConMismoIngrediente.length} variaciones del mismo sabor`,
          eliminadas: recetasConMismoIngrediente.length,
          recetasAfectadas: recetasConMismoIngrediente.map(ri => ri.receta.id),
          incluyoInactivos: recetasConMismoIngrediente.some(ri => !ri.activo)
        };
      } else {
        // 4. Solo eliminar de la receta actual (HARD DELETE)
        // ✅ HARD DELETE: Eliminar físicamente de la base de datos
        await recetaIngredienteRepository.remove(recetaIngrediente);

        // Recalcular costos
        await calculateRecipeCost(recetaIngrediente.receta.id);

        return {
          success: true,
          message: 'Ingrediente eliminado permanentemente de la variación actual',
          eliminadas: 1,
          recetasAfectadas: [recetaIngrediente.receta.id]
        };
      }
    } catch (error) {
      console.error('Error deleting receta ingrediente from multiple variations:', error);
      throw error;
    }
  });

  // Additional RecetaIngrediente handlers
  ipcMain.handle('get-receta-ingredientes-activos', async (_event: any, recetaId: number) => {
    try {
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      return await recetaIngredienteRepository.find({
        where: {
          receta: { id: recetaId },
          activo: true
        },
        relations: ['ingrediente', 'reemplazoDefault'],
        order: { createdAt: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting receta ingredientes activos:', error);
      throw error;
    }
  });

  ipcMain.handle('calcular-costo-ingrediente', async (_event: any, recetaIngredienteId: number) => {
    try {
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const recetaIngrediente = await recetaIngredienteRepository.findOne({
        where: { id: recetaIngredienteId },
        relations: ['ingrediente']
      });

      if (!recetaIngrediente) {
        throw new Error('Receta ingrediente not found');
      }

      // Ítem solo-descripción (sin ingrediente vinculado): costo 0.
      if (!recetaIngrediente.ingrediente) {
        return 0;
      }

      let costoUnitario = 0;

      // Check if the ingredient is an elaborated product with its own recipe
      if (recetaIngrediente.ingrediente.tipo === 'ELABORADO_SIN_VARIACION') {
        // Get the recipe of the ingredient product
        const recetaRepository = dataSource.getRepository(Receta);
        const recetaIngredienteElaborado = await recetaRepository.findOne({
          where: { producto: { id: recetaIngrediente.ingrediente.id } }
        });

        if (recetaIngredienteElaborado && recetaIngredienteElaborado.costoCalculado > 0) {
          // Use the calculated cost from the ingredient's recipe
          costoUnitario = recetaIngredienteElaborado.costoCalculado;
        } else {
          // If no recipe or no calculated cost, try to get direct cost price
      const precioCostoRepository = dataSource.getRepository(PrecioCosto);
      const precioCosto = await precioCostoRepository.findOne({
        where: {
          producto: { id: recetaIngrediente.ingrediente.id },
          activo: true
        },
        order: { createdAt: 'DESC' }
      });

      if (precioCosto) {
            costoUnitario = precioCosto.valor;
          }
        }
      } else {
        // For non-elaborated products, get the direct cost price
        const precioCostoRepository = dataSource.getRepository(PrecioCosto);
        const precioCosto = await precioCostoRepository.findOne({
          where: {
            producto: { id: recetaIngrediente.ingrediente.id },
            activo: true
          },
          order: { createdAt: 'DESC' }
        });

        if (precioCosto) {
          costoUnitario = precioCosto.valor;
        }
      }

      if (costoUnitario > 0) {
        // ✅ CORRECCIÓN: Aplicar la misma lógica de conversión de unidades
        let costoTotal = 0;

        // Si hay unidad original guardada, significa que hubo conversión
        if (recetaIngrediente.unidadOriginal && recetaIngrediente.unidadOriginal !== recetaIngrediente.unidad) {
          // Caso 1: Producto por kg, usuario seleccionó gramos
          if (recetaIngrediente.ingrediente.unidadBase === 'KILOGRAMO' &&
              recetaIngrediente.unidadOriginal === 'GRAMOS' &&
              recetaIngrediente.unidad === 'KILOGRAMOS') {
            // La cantidad está en kg, pero el usuario trabajó en gramos
            // El costo unitario base es por kg, multiplicar directamente
            costoTotal = costoUnitario * recetaIngrediente.cantidad;
          }
          // Caso 2: Producto por litro, usuario seleccionó mililitros
          else if (recetaIngrediente.ingrediente.unidadBase === 'LITRO' &&
                   recetaIngrediente.unidadOriginal === 'MILILITROS' &&
                   recetaIngrediente.unidad === 'LITROS') {
            // La cantidad está en litros, pero el usuario trabajó en mililitros
            // El costo unitario base es por litro, multiplicar directamente
            costoTotal = costoUnitario * recetaIngrediente.cantidad;
          }
          // Otros casos de conversión
          else {
            // Para otros casos, usar el costo unitario convertido
            costoTotal = costoUnitario * recetaIngrediente.cantidad;
          }
        } else {
          // No hay conversión, usar el cálculo normal
          costoTotal = costoUnitario * recetaIngrediente.cantidad;
        }

        recetaIngrediente.costoUnitario = costoUnitario;
        recetaIngrediente.costoTotal = costoTotal;

        await recetaIngredienteRepository.save(recetaIngrediente);
        return costoTotal;
      }

      return 0;
    } catch (error) {
      console.error('Error calculating ingrediente cost:', error);
      throw error;
    }
  });

  ipcMain.handle('validar-stock-ingrediente', async (_event: any, recetaIngredienteId: number) => {
    try {
      const recetaIngredienteRepository = dataSource.getRepository(RecetaIngrediente);
      const recetaIngrediente = await recetaIngredienteRepository.findOne({
        where: { id: recetaIngredienteId },
        relations: ['ingrediente']
      });

      if (!recetaIngrediente) {
        throw new Error('Receta ingrediente not found');
      }

      // For now, we'll return true. In a real implementation, you would check the stock
      // This would involve checking the stock movements and calculating current stock
      return true;
    } catch (error) {
      console.error('Error validating ingrediente stock:', error);
      throw error;
    }
  });

  // --- Adicional Handlers (Nueva Arquitectura) ---
  ipcMain.handle('get-adicionales', async (_event: any) => {
    try {
      const adicionalRepository = dataSource.getRepository(Adicional);
      return await adicionalRepository.find({
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting adicionales:', error);
      throw error;
    }
  });

  ipcMain.handle('get-adicional', async (_event: any, adicionalId: number) => {
    try {
      const adicionalRepository = dataSource.getRepository(Adicional);
      const adicional = await adicionalRepository.findOne({
        where: { id: adicionalId },
        relations: ['receta'] // ✅ NUEVO: Cargar relación de receta
      });
      if (!adicional) {
        throw new Error('Adicional not found');
      }
      return adicional;
    } catch (error) {
      console.error('Error getting adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('create-adicional', async (_event: any, adicionalData: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'ADICIONALES_GESTIONAR');
      const adicionalRepository = dataSource.getRepository(Adicional);
      const currentUser = getCurrentUser();

      const adicional = adicionalRepository.create({
        nombre: adicionalData.nombre,
        precioBase: adicionalData.precioBase,
        activo: adicionalData.activo !== undefined ? adicionalData.activo : true,
        categoria: adicionalData.categoria,
        receta: adicionalData.recetaId ? { id: adicionalData.recetaId } : undefined
      });

      setEntityUserTracking(dataSource, adicional, currentUser?.id, false);
      return await adicionalRepository.save(adicional);
    } catch (error) {
      console.error('Error creating adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('update-adicional', async (_event: any, adicionalId: number, adicionalData: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'ADICIONALES_GESTIONAR');
      const adicionalRepository = dataSource.getRepository(Adicional);
      const currentUser = getCurrentUser();

      const adicional = await adicionalRepository.findOne({ where: { id: adicionalId } });
      if (!adicional) {
        throw new Error('Adicional not found');
      }

      Object.assign(adicional, {
        nombre: adicionalData.nombre,
        precioBase: adicionalData.precioBase,
        activo: adicionalData.activo,
        categoria: adicionalData.categoria,
        receta: adicionalData.recetaId ? { id: adicionalData.recetaId } : undefined
      });

      setEntityUserTracking(dataSource, adicional, currentUser?.id, true);
      await adicionalRepository.save(adicional);

      // ✅ NUEVO: Retornar el adicional con la receta cargada
      return await adicionalRepository.findOne({
        where: { id: adicionalId },
        relations: ['receta']
      });
    } catch (error) {
      console.error('Error updating adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-adicional', async (_event: any, adicionalId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'ADICIONALES_GESTIONAR');
      const adicionalRepository = dataSource.getRepository(Adicional);
      const currentUser = getCurrentUser();
      const adicional = await adicionalRepository.findOne({ where: { id: adicionalId } });
      if (!adicional) {
        throw new Error('Adicional not found');
      }

      // Soft delete
      adicional.activo = false;
      setEntityUserTracking(dataSource, adicional, currentUser?.id, true);
      return await adicionalRepository.save(adicional);
    } catch (error) {
      console.error('Error deleting adicional:', error);
      throw error;
    }
  });

  // ✅ NUEVOS HANDLERS: Para manejar la receta del adicional
  ipcMain.handle('get-adicional-with-receta', async (_event: any, adicionalId: number) => {
    try {
      const adicionalRepository = dataSource.getRepository(Adicional);
      const adicional = await adicionalRepository.findOne({
        where: { id: adicionalId },
        relations: ['receta', 'receta.ingredientes', 'receta.ingredientes.ingrediente']
      });
      if (!adicional) {
        throw new Error('Adicional not found');
      }
      return adicional;
    } catch (error) {
      console.error('Error getting adicional with receta:', error);
      throw error;
    }
  });

  ipcMain.handle('create-receta-for-adicional', async (_event: any, adicionalId: number, recetaData: any) => {
    try {
      const adicionalRepository = dataSource.getRepository(Adicional);
      const recetaRepository = dataSource.getRepository(Receta);
      const currentUser = getCurrentUser();

      // Crear la receta
      const receta = recetaRepository.create({
        nombre: recetaData.nombre,
        descripcion: recetaData.descripcion,
        activo: true
      });

      setEntityUserTracking(dataSource, receta, currentUser?.id, false);
      const savedReceta = await recetaRepository.save(receta);

      // Vincular la receta al adicional
      const adicional = await adicionalRepository.findOne({ where: { id: adicionalId } });
      if (!adicional) {
        throw new Error('Adicional not found');
      }

      adicional.receta = savedReceta;
      setEntityUserTracking(dataSource, adicional, currentUser?.id, true);
      await adicionalRepository.save(adicional);

      return savedReceta;
    } catch (error) {
      console.error('Error creating receta for adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('update-receta-for-adicional', async (_event: any, adicionalId: number, recetaData: any) => {
    try {
      const adicionalRepository = dataSource.getRepository(Adicional);
      const recetaRepository = dataSource.getRepository(Receta);
      const currentUser = getCurrentUser();

      const adicional = await adicionalRepository.findOne({
        where: { id: adicionalId },
        relations: ['receta']
      });

      if (!adicional) {
        throw new Error('Adicional not found');
      }

      if (!adicional.receta) {
        throw new Error('Adicional does not have a receta');
      }

      Object.assign(adicional.receta, {
        nombre: recetaData.nombre,
        descripcion: recetaData.descripcion,
        activo: recetaData.activo
      });

      setEntityUserTracking(dataSource, adicional.receta, currentUser?.id, true);
      return await recetaRepository.save(adicional.receta);
    } catch (error) {
      console.error('Error updating receta for adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-receta-for-adicional', async (_event: any, adicionalId: number) => {
    try {
      const adicionalRepository = dataSource.getRepository(Adicional);
      const currentUser = getCurrentUser();

      const adicional = await adicionalRepository.findOne({
        where: { id: adicionalId },
        relations: ['receta']
      });

      if (!adicional) {
        throw new Error('Adicional not found');
      }

      if (!adicional.receta) {
        throw new Error('Adicional does not have a receta');
      }

      // Desvincular la receta del adicional
      adicional.receta = undefined as unknown as Receta;
      setEntityUserTracking(dataSource, adicional, currentUser?.id, true);
      await adicionalRepository.save(adicional);

      return { success: true };
    } catch (error) {
      console.error('Error deleting receta for adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('get-adicionales-with-filters', async (_event: any, filters: {
    search?: string;
    activo?: boolean | null;
    categoria?: string;
    page?: number;
    pageSize?: number;
  }) => {
    try {
      const adicionalRepository = dataSource.getRepository(Adicional);

      // Build where conditions
      const whereConditions: any = {};

      if (filters.search) {
        whereConditions.nombre = Like(`%${filters.search}%`);
      }

      if (filters.activo !== null && filters.activo !== undefined) {
        whereConditions.activo = filters.activo;
      }

      if (filters.categoria) {
        whereConditions.categoria = filters.categoria;
      }

      // Get total count
      const total = await adicionalRepository.count({
        where: whereConditions
      });

      // Get paginated results
      const page = filters.page || 0;
      const pageSize = filters.pageSize || 10;
      const skip = page * pageSize;

      const items = await adicionalRepository.find({
        where: whereConditions,
        relations: ['receta'], // ✅ NUEVO: Cargar relación de receta
        order: { nombre: 'ASC' },
        skip: skip,
        take: pageSize
      });



      return {
        items,
        total,
        page,
        pageSize
      };
    } catch (error) {
      console.error('Error getting adicionales with filters:', error);
      throw error;
    }
  });

  // --- RecetaAdicionalVinculacion Handlers (Nueva Arquitectura) ---
  ipcMain.handle('get-receta-adicional-vinculaciones', async (_event: any, recetaId: number) => {
    try {
      const vinculacionRepository = dataSource.getRepository(RecetaAdicionalVinculacion);
      return await vinculacionRepository.find({
        where: { receta: { id: recetaId } },
        relations: ['adicional'],
        order: { id: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting receta adicional vinculaciones:', error);
      throw error;
    }
  });

  ipcMain.handle('get-receta-adicional-vinculacion', async (_event: any, vinculacionId: number) => {
    try {
      const vinculacionRepository = dataSource.getRepository(RecetaAdicionalVinculacion);
      const vinculacion = await vinculacionRepository.findOne({
        where: { id: vinculacionId },
        relations: ['adicional', 'receta']
      });
      if (!vinculacion) {
        throw new Error('Receta adicional vinculacion not found');
      }
      return vinculacion;
    } catch (error) {
      console.error('Error getting receta adicional vinculacion:', error);
      throw error;
    }
  });

  ipcMain.handle('create-receta-adicional-vinculacion', async (_event: any, vinculacionData: any) => {
    try {
      const vinculacionRepository = dataSource.getRepository(RecetaAdicionalVinculacion);
      const currentUser = getCurrentUser();

      const vinculacion = vinculacionRepository.create({
        precioAdicional: vinculacionData.precioAdicional,
        cantidad: vinculacionData.cantidad || 1,
        unidad: vinculacionData.unidad || 'UNIDADES',
        unidadOriginal: vinculacionData.unidadOriginal,
        activo: vinculacionData.activo !== undefined ? vinculacionData.activo : true,
        receta: { id: vinculacionData.recetaId },
        adicional: { id: vinculacionData.adicionalId }
      });

      setEntityUserTracking(dataSource, vinculacion, currentUser?.id, false);
      return await vinculacionRepository.save(vinculacion);
    } catch (error) {
      console.error('Error creating receta adicional vinculacion:', error);
      throw error;
    }
  });

  ipcMain.handle('update-receta-adicional-vinculacion', async (_event: any, vinculacionId: number, vinculacionData: any) => {
    try {
      const vinculacionRepository = dataSource.getRepository(RecetaAdicionalVinculacion);
      const currentUser = getCurrentUser();

      const vinculacion = await vinculacionRepository.findOne({ where: { id: vinculacionId } });
      if (!vinculacion) {
        throw new Error('Receta adicional vinculacion not found');
      }

      Object.assign(vinculacion, {
        precioAdicional: vinculacionData.precioAdicional,
        cantidad: vinculacionData.cantidad,
        unidad: vinculacionData.unidad,
        unidadOriginal: vinculacionData.unidadOriginal,
        activo: vinculacionData.activo
      });

      setEntityUserTracking(dataSource, vinculacion, currentUser?.id, true);
      const savedVinculacion = await vinculacionRepository.save(vinculacion);

      // Retornar la entidad con las relaciones cargadas
      return await vinculacionRepository.findOne({
        where: { id: vinculacionId },
        relations: ['adicional']
      });
    } catch (error) {
      console.error('Error updating receta adicional vinculacion:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-receta-adicional-vinculacion', async (_event: any, vinculacionId: number) => {
    try {
      const vinculacionRepository = dataSource.getRepository(RecetaAdicionalVinculacion);
      const vinculacion = await vinculacionRepository.findOne({ where: { id: vinculacionId } });
      if (!vinculacion) {
        throw new Error('Receta adicional vinculacion not found');
      }

      // ✅ ACTUALIZADO: Eliminar físicamente el vínculo
      await vinculacionRepository.delete(vinculacionId);
      return { success: true, message: 'Vínculo eliminado correctamente' };
    } catch (error) {
      console.error('Error deleting receta adicional vinculacion:', error);
      throw error;
    }
  });

  // Handler to recalculate all recipe costs
  ipcMain.handle('recalculate-all-recipe-costs', async () => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      const allRecetas = await recetaRepository.find({
        order: { nombre: 'ASC' }
      });

      const results = [];
      for (const receta of allRecetas) {
        try {
          const newCost = await calculateRecipeCost(receta.id!);
          results.push({
            recetaId: receta.id,
            nombre: receta.nombre,
            oldCost: receta.costoCalculado,
            newCost: newCost,
            updated: newCost !== receta.costoCalculado
          });
        } catch (error) {
          console.error(`Error recalculating cost for recipe ${receta.nombre}:`, error);
          results.push({
            recetaId: receta.id,
            nombre: receta.nombre,
            error: (error as Error).message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error recalculating all recipe costs:', error);
      throw error;
    }
  });

  // Handler to recalculate a single recipe cost
  ipcMain.handle('recalculate-recipe-cost', async (_event: any, recetaId: number) => {
    try {
      const newCost = await calculateRecipeCost(recetaId);
      return { success: true, costoCalculado: newCost };
    } catch (error) {
      console.error('Error recalculating recipe cost:', error);
      throw error;
    }
  });

  // ✅ NUEVO: Handler para obtener el historial de precios de costo de una receta
  ipcMain.handle('get-precios-costo-receta', async (_event: any, recetaId: number) => {
    try {
      const precioCostoRepository = dataSource.getRepository(PrecioCosto);
      const preciosCosto = await precioCostoRepository.find({
        where: {
          receta: { id: recetaId },
          activo: true
        },
        relations: ['moneda'],
        order: { createdAt: 'DESC' }
      });

      return preciosCosto;
    } catch (error) {
      console.error('Error getting recipe cost history:', error);
      throw error;
    }
  });

  // --- Sabor Handlers (LEGACY + Nueva Arquitectura) ---
  // LEGACY: get-sabores por categoria (mantener para compatibilidad)
  ipcMain.handle('get-sabores', async () => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      const sabores = await recetaRepository
        .createQueryBuilder('receta')
        .select('DISTINCT receta.categoria', 'categoria')
        .where('receta.categoria IS NOT NULL')
        .andWhere("receta.categoria != ''")
        .orderBy('receta.categoria', 'ASC')
        .getRawMany();

      return sabores.map(s => s.categoria);
    } catch (error) {
      console.error('Error getting sabores:', error);
      throw error;
    }
  });

  // ✅ NUEVO: CRUD y helpers para Sabores (nueva arquitectura)
  ipcMain.handle('get-sabores-by-producto', async (_e: IpcMainInvokeEvent, productoId: number) => {
    const repo = dataSource.getRepository(Sabor);
    return await repo.find({
      where: { producto: { id: productoId } },
      order: { nombre: 'ASC' }
    });
  });

  ipcMain.handle('create-sabor', async (_e: IpcMainInvokeEvent, saborData: { nombre: string; categoria: string; descripcion?: string; productoId: number; imageUrl?: string; }) => {
    await ensurePermission(dataSource, getCurrentUser, 'SABORES_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const producto = await queryRunner.manager.getRepository(Producto).findOne({ where: { id: saborData.productoId }, relations: ['presentaciones'] });
      if (!producto) throw new Error('Producto no encontrado');

      // Crear sabor
      const saborRepo = queryRunner.manager.getRepository(Sabor);
      const sabor = saborRepo.create({
        nombre: saborData.nombre.toUpperCase(),
        categoria: saborData.categoria.toUpperCase(),
        descripcion: saborData.descripcion?.toUpperCase(),
        producto: { id: saborData.productoId },
        activo: true,
        imageUrl: saborData.imageUrl || undefined
      });
      const saborGuardado = await saborRepo.save(sabor);

      // Crear receta base
      const recetaRepo = queryRunner.manager.getRepository(Receta);
      const receta = recetaRepo.create({
        nombre: `${producto.nombre} ${saborData.nombre}`.toUpperCase(),
        descripcion: `Receta base para ${producto.nombre} ${saborData.nombre}`,
        rendimiento: 1,
        unidadRendimiento: 'UNIDADES',
        costoCalculado: 0,
        activo: true
      });
      const recetaGuardada = await recetaRepo.save(receta);

      // Generar variaciones para cada presentación del producto
      const variaciones = await generarVariacionesParaProducto(queryRunner, producto.id, saborGuardado.id, recetaGuardada.id);

      await queryRunner.commitTransaction();
      return { sabor: saborGuardado, receta: recetaGuardada, mensaje: `Sabor creado con ${variaciones.length} variaciones` };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('update-sabor', async (_e: IpcMainInvokeEvent, id: number, saborData: Partial<Sabor> & { imageUrl?: string | null }) => {
    await ensurePermission(dataSource, getCurrentUser, 'SABORES_GESTIONAR');
    const repo = dataSource.getRepository(Sabor);

    // Si llega imageUrl distinta, borrar archivo viejo
    if (saborData.imageUrl !== undefined) {
      const existing = await repo.findOne({ where: { id } });
      const oldUrl = existing?.imageUrl;
      const newUrl = saborData.imageUrl || undefined;
      if (oldUrl && oldUrl !== newUrl) {
        const { deleteImageByUrl } = require('../utils/image-resize.utils');
        deleteImageByUrl(oldUrl);
      }
    }

    await repo.update(id, {
      ...saborData,
      nombre: saborData.nombre?.toUpperCase(),
      categoria: saborData.categoria?.toUpperCase(),
      descripcion: saborData.descripcion?.toUpperCase()
    } as any);
    return await repo.findOne({ where: { id } });
  });

  ipcMain.handle('delete-sabor', async (_e: IpcMainInvokeEvent, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'SABORES_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Obtener variaciones que usan este sabor
      const variaciones = await queryRunner.manager.getRepository(RecetaPresentacion).find({
        where: { sabor: { id } },
        relations: ['receta', 'receta.ingredientes']
      });

      // 1) Eliminar primero todas las variaciones (FK a receta).
      const recetaIds = new Set<number>();
      for (const variacion of variaciones) {
        if (variacion.receta?.id) recetaIds.add(variacion.receta.id);
        await queryRunner.manager.getRepository(RecetaPresentacion).delete({ id: variacion.id });
      }
      // 2) Después borrar recetas (deduplicadas) y sus ingredientes — varias variaciones pueden compartir la misma receta.
      for (const recetaId of recetaIds) {
        await queryRunner.manager.getRepository(RecetaIngrediente).delete({ receta: { id: recetaId } });
        await queryRunner.manager.getRepository(Receta).delete({ id: recetaId });
      }

      // Eliminar el sabor
      await queryRunner.manager.getRepository(Sabor).delete(id);
      await queryRunner.commitTransaction();
      return { success: true, mensaje: 'Sabor eliminado correctamente' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-sabores-estadisticas', async (_e: IpcMainInvokeEvent, productoId: number) => {
    const sabores = await dataSource.getRepository(Sabor).find({ where: { producto: { id: productoId } } });

    // Obtener variaciones del producto para calcular estadísticas
    const variaciones = await dataSource.getRepository(RecetaPresentacion)
      .createQueryBuilder('rp')
      .leftJoinAndSelect('rp.sabor', 'sabor')
      .leftJoinAndSelect('rp.receta', 'receta')
      .where('sabor.producto_id = :productoId', { productoId })
      .getMany();

    return {
      totalSabores: sabores.length,
      saboresActivos: sabores.filter(s => s.activo).length,
      totalRecetas: variaciones.filter(v => v.receta).length,
      totalVariaciones: variaciones.length
    };
  });

  // ✅ NUEVO: Variaciones (RecetaPresentacion)
  ipcMain.handle('get-variaciones-by-producto', async (_e: IpcMainInvokeEvent, productoId: number) => {
    return await dataSource.getRepository(RecetaPresentacion)
      .createQueryBuilder('rp')
      .leftJoinAndSelect('rp.receta', 'receta')
      .leftJoinAndSelect('rp.presentacion', 'presentacion')
      .leftJoinAndSelect('rp.sabor', 'sabor')
      .leftJoinAndSelect('receta.preciosCosto', 'preciosCosto') // ✅ NUEVO: Cargar costos de la receta
      .where('sabor.producto_id = :productoId', { productoId })
      .orderBy('sabor.nombre', 'ASC')
      .addOrderBy('presentacion.cantidad', 'ASC')
      .getMany()
      .then(async (variaciones) => {
        // ✅ NUEVO: Buscar precios de venta por recetaId para cada variación
        const variacionesConPrecios = await Promise.all(
          variaciones.map(async (variacion) => {
            if (!variacion.receta?.id) {
              return {
                ...variacion,
                precioPrincipal: null
              };
            }

            // ✅ CORREGIDO: Buscar precios por receta_id, no por recetaId
            console.log(`🔍 Buscando precios para receta ID: ${variacion.receta.id}`);

            const preciosVenta = await dataSource.getRepository(PrecioVenta)
              .createQueryBuilder('pv')
              .leftJoinAndSelect('pv.moneda', 'moneda')
              .leftJoinAndSelect('pv.tipoPrecio', 'tipoPrecio')
              .leftJoinAndSelect('pv.receta', 'receta') // ✅ NUEVO: Join con receta
              .where('pv.receta.id = :recetaId', { recetaId: variacion.receta.id })
              .andWhere('pv.activo = :activo', { activo: true })
              .orderBy('pv.principal', 'DESC') // Precio principal primero
              .addOrderBy('pv.created_at', 'DESC')
              .getMany();

            console.log(`💰 Precios encontrados para receta ${variacion.receta.id}:`, preciosVenta.length);

            // Buscar el precio principal
            const precioPrincipal = preciosVenta.find(p => p.principal);

            return {
              ...variacion,
              preciosVenta, // ✅ NUEVO: Incluir todos los precios de la receta
              precioPrincipal: precioPrincipal ? {
                id: precioPrincipal.id,
                valor: precioPrincipal.valor,
                moneda: precioPrincipal.moneda,
                tipoPrecio: precioPrincipal.tipoPrecio,
                principal: precioPrincipal.principal,
                activo: precioPrincipal.activo
              } : null
            };
          })
        );

        return variacionesConPrecios;
      });
  });

  ipcMain.handle('get-variaciones-by-receta', async (_e: IpcMainInvokeEvent, recetaId: number) => {
    return await dataSource.getRepository(RecetaPresentacion).find({
      where: { receta: { id: recetaId } },
      relations: ['presentacion', 'preciosVenta'],
      order: { presentacion: { cantidad: 'ASC' } }
    });
  });

  // Obtener variaciones por producto y presentación (para diálogo de selección en PdV)
  ipcMain.handle('get-variaciones-by-producto-and-presentacion', async (_e: IpcMainInvokeEvent, productoId: number, presentacionId: number) => {
    const variaciones = await dataSource.getRepository(RecetaPresentacion)
      .createQueryBuilder('rp')
      .leftJoinAndSelect('rp.receta', 'receta')
      .leftJoinAndSelect('rp.presentacion', 'presentacion')
      .leftJoinAndSelect('rp.sabor', 'sabor')
      .leftJoinAndSelect('receta.ingredientes', 'ingredientes')
      .leftJoinAndSelect('ingredientes.ingrediente', 'ingredienteProducto')
      .leftJoinAndSelect('receta.adicionalesVinculados', 'adicionalesVinculados')
      .leftJoinAndSelect('adicionalesVinculados.adicional', 'adicional')
      .where('sabor.producto_id = :productoId', { productoId })
      .andWhere('rp.presentacion_id = :presentacionId', { presentacionId })
      .andWhere('rp.activo = true')
      .orderBy('sabor.nombre', 'ASC')
      .getMany();

    // Cargar precios de venta para cada variación
    const variacionesConPrecios = await Promise.all(
      variaciones.map(async (variacion) => {
        if (!variacion.receta?.id) return { ...variacion, preciosVenta: [] };

        const preciosVenta = await dataSource.getRepository(PrecioVenta)
          .createQueryBuilder('pv')
          .leftJoinAndSelect('pv.moneda', 'moneda')
          .leftJoinAndSelect('pv.tipoPrecio', 'tipoPrecio')
          .where('pv.receta_id = :recetaId', { recetaId: variacion.receta.id })
          .andWhere('pv.activo = :activo', { activo: true })
          .orderBy('pv.principal', 'DESC')
          .getMany();

        return { ...variacion, preciosVenta };
      })
    );

    return variacionesConPrecios;
  });

  ipcMain.handle('create-receta-presentacion', async (_e: IpcMainInvokeEvent, variacionData: { recetaId: number; presentacionId: number; nombre_generado?: string; sku?: string; precio_ajuste?: number; }) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // evitar duplicados
      const exists = await queryRunner.manager.getRepository(RecetaPresentacion).findOne({ where: { receta: { id: variacionData.recetaId }, presentacion: { id: variacionData.presentacionId } } });
      if (exists) throw new Error('Ya existe esa variación');

      let nombre = variacionData.nombre_generado;
      let sku = variacionData.sku;
      if (!nombre || !sku) {
        const receta = await queryRunner.manager.getRepository(Receta).findOne({ where: { id: variacionData.recetaId } });
        const presentacion = await queryRunner.manager.getRepository(Presentacion).findOne({ where: { id: variacionData.presentacionId } });
        if (receta && presentacion) {
          nombre = nombre || generarNombreVariacion(receta.nombre || 'Producto', presentacion.nombre, 'Sabor');
          sku = sku || generarSKU(receta.nombre || 'Producto', 'Sabor', presentacion.nombre);
        }
      }

      const repo = queryRunner.manager.getRepository(RecetaPresentacion);
      const nueva = repo.create({
        nombre_generado: nombre!,
        sku: sku!,
        precio_ajuste: variacionData.precio_ajuste,
        costo_calculado: 0,
        activo: true,
        receta: { id: variacionData.recetaId },
        presentacion: { id: variacionData.presentacionId }
      });
      const guardada = await repo.save(nueva);
      await calcularCostoVariacion(queryRunner, guardada.id!);
      await queryRunner.commitTransaction();
      return await dataSource.getRepository(RecetaPresentacion).findOne({ where: { id: guardada.id }, relations: ['receta', 'presentacion', 'sabor'] });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('update-receta-presentacion', async (_e: IpcMainInvokeEvent, id: number, data: Partial<RecetaPresentacion>) => {
    await dataSource.getRepository(RecetaPresentacion).update(id, { ...data, nombre_generado: data.nombre_generado?.toUpperCase() });
    const updated = await dataSource.getRepository(RecetaPresentacion).findOne({ where: { id }, relations: ['receta', 'presentacion', 'sabor', 'preciosVenta'] });
    return updated;
  });

  ipcMain.handle('delete-receta-presentacion', async (_e: IpcMainInvokeEvent, id: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.getRepository(PrecioVenta).delete({ recetaPresentacion: { id } });
      await queryRunner.manager.getRepository(RecetaPresentacion).delete(id);
      await queryRunner.commitTransaction();
      return { success: true, mensaje: 'Variación eliminada correctamente' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('bulk-update-variaciones', async (_e: IpcMainInvokeEvent, updates: Array<{ variacionId: number; precio_ajuste?: number; activo?: boolean;}>) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let actualizadas = 0;
      const repo = queryRunner.manager.getRepository(RecetaPresentacion);
      for (const u of updates) {
        const updateData: Partial<RecetaPresentacion> = {};
        if (u.precio_ajuste !== undefined) updateData.precio_ajuste = u.precio_ajuste;
        if (u.activo !== undefined) updateData.activo = u.activo;
        if (Object.keys(updateData).length > 0) {
          await repo.update(u.variacionId, updateData);
          actualizadas++;
        }
      }
      await queryRunner.commitTransaction();
      return { success: true, actualizadas };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('recalcular-costo-variacion', async (_e: IpcMainInvokeEvent, variacionId: number) => {
    const resultado = await recalcularCostoVariacion(variacionId);
    return { ...resultado, mensaje: `Costo recalculado: $${resultado.costoAnterior.toFixed(2)} → $${resultado.costoNuevo.toFixed(2)}` };
  });

  ipcMain.handle('generate-variaciones-faltantes', async (_e: IpcMainInvokeEvent, productoId: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Obtener el producto con sus presentaciones y sabores
      const producto = await queryRunner.manager.getRepository(Producto).findOne({
        where: { id: productoId },
        relations: ['presentaciones', 'sabores']
      });

      if (!producto?.presentaciones?.length || !producto?.sabores?.length) {
        return { success: true, variacionesGeneradas: 0, variaciones: [] };
      }

      const nuevas: RecetaPresentacion[] = [];

      // Para cada combinación de sabor y presentación, verificar si existe una variación
      for (const sabor of producto.sabores) {
        for (const presentacion of producto.presentaciones) {
          const existe = await queryRunner.manager.getRepository(RecetaPresentacion).findOne({
            where: {
              sabor: { id: sabor.id },
              presentacion: { id: presentacion.id }
            }
          });

          if (!existe) {
            // Crear una nueva receta para esta variación
            const recetaRepo = queryRunner.manager.getRepository(Receta);
            const nuevaReceta = recetaRepo.create({
              nombre: `${producto.nombre} ${sabor.nombre}`.toUpperCase(),
              descripcion: `Receta para ${producto.nombre} ${sabor.nombre}`,
              rendimiento: 1,
              unidadRendimiento: 'UNIDADES',
              costoCalculado: 0,
              activo: true
            });

            const recetaGuardada = await recetaRepo.save(nuevaReceta);

            // Crear la variación
            const nombre = generarNombreVariacion(producto.nombre, presentacion.nombre, sabor.nombre);
            const sku = generarSKU(producto.nombre, sabor.nombre, presentacion.nombre);

            const nueva = await queryRunner.manager.getRepository(RecetaPresentacion).save({
              nombre_generado: nombre,
              sku,
              costo_calculado: 0,
              activo: true,
              receta: { id: recetaGuardada.id },
              presentacion: { id: presentacion.id },
              sabor: { id: sabor.id }
            });

            nuevas.push(nueva);
          }
        }
      }

      await queryRunner.commitTransaction();
      return { success: true, variacionesGeneradas: nuevas.length, variaciones: nuevas };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('create-or-update-sabor', async (_event: any, saborData: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log('--- Iniciando transacción para crear/actualizar sabor ---');
      console.log('Datos recibidos:', JSON.stringify(saborData, null, 2));

      const { categoria, ingredientesBase, variaciones } = saborData;

      if (!categoria || !Array.isArray(variaciones) || variaciones.length === 0) {
        throw new Error('Datos insuficientes: se requiere categoría y al menos una variación');
      }

      const recetaRepository = queryRunner.manager.getRepository(Receta);
      const recetaIngredienteRepository = queryRunner.manager.getRepository(RecetaIngrediente);
      const precioVentaRepository = queryRunner.manager.getRepository(PrecioVenta);
      const productoRepository = queryRunner.manager.getRepository(Producto);
      const tipoPrecioRepository = queryRunner.manager.getRepository(TipoPrecio);

      // Obtener el primer tipo de precio activo (ya que TipoPrecio no tiene campo principal)
      const tipoPrecioPrincipal = await tipoPrecioRepository.findOne({
        where: { activo: true }
      });

      if (!tipoPrecioPrincipal) {
        throw new Error('No se encontró un tipo de precio principal configurado');
      }

      // Eliminar recetas existentes para esta categoría (si es una edición)
      const recetasExistentes = await recetaRepository.find({
        where: { categoria },
        relations: ['ingredientes', 'preciosVenta']
      });

      for (const receta of recetasExistentes) {
        // Eliminar ingredientes
        await recetaIngredienteRepository.delete({ receta: { id: receta.id } });
        // Eliminar precios de venta
        await precioVentaRepository.delete({ receta: { id: receta.id } });
        // Eliminar receta
        await recetaRepository.delete({ id: receta.id });
      }

      // Crear nuevas recetas para cada variación
      for (const variacion of variaciones) {
        const { subcategoria, precio, ingredientesEspecificos } = variacion;

        if (!subcategoria) {
          throw new Error('Cada variación debe tener una subcategoría');
        }

        // Crear la receta
        const nuevaReceta = recetaRepository.create({
          nombre: `${categoria} ${subcategoria}`,
          categoria: categoria,
          subcategoria: subcategoria,
          descripcion: `Receta para ${categoria} ${subcategoria}`,
          rendimiento: 1,
          activo: true,
          costoCalculado: 0 // Se calculará después
        });

        const recetaGuardada = await recetaRepository.save(nuevaReceta);

        // Agregar ingredientes base (si existen)
        if (Array.isArray(ingredientesBase)) {
          for (const ingredienteBase of ingredientesBase) {
            const { productoId, cantidad, unidad } = ingredienteBase;

            if (!productoId || !cantidad || !unidad) {
              continue; // Saltar ingredientes incompletos
            }

            const producto = await productoRepository.findOne({
              where: { id: productoId }
            });

            if (producto) {
              const ingrediente = recetaIngredienteRepository.create({
                receta: { id: recetaGuardada.id } as Receta,
                ingrediente: producto,
                cantidad: parseFloat(cantidad),
                unidad: unidad,
                esIngredienteBase: true,
                activo: true
              });

              await recetaIngredienteRepository.save(ingrediente);
            }
          }
        }

        // Agregar ingredientes específicos (si existen)
        if (Array.isArray(ingredientesEspecificos)) {
          for (const ingredienteEspecifico of ingredientesEspecificos) {
            const { productoId, cantidad, unidad } = ingredienteEspecifico;

            if (!productoId || !cantidad || !unidad) {
              continue; // Saltar ingredientes incompletos
            }

            const producto = await productoRepository.findOne({
              where: { id: productoId }
            });

            if (producto) {
              const ingrediente = recetaIngredienteRepository.create({
                receta: { id: recetaGuardada.id } as Receta,
                ingrediente: producto,
                cantidad: parseFloat(cantidad),
                unidad: unidad,
                esIngredienteBase: false,
                activo: true
              });

              await recetaIngredienteRepository.save(ingrediente);
            }
          }
        }

        // Crear precio de venta si se proporcionó
        if (precio && precio > 0) {
          const precioVenta = precioVentaRepository.create({
            receta: { id: recetaGuardada.id } as Receta,
            tipoPrecio: tipoPrecioPrincipal,
            valor: parseFloat(precio),
            principal: true,
            activo: true
          });

          await precioVentaRepository.save(precioVenta);
        }
      }

      await queryRunner.commitTransaction();
      console.log('--- Transacción completada exitosamente ---');

      // Recalcular costos de las nuevas recetas
      try {
        const recetasCreadas = await recetaRepository.find({
          where: { categoria }
        });

        for (const receta of recetasCreadas) {
          await calculateRecipeCost(receta.id);
        }
      } catch (costError) {
        console.warn('Error al recalcular costos, pero las recetas se guardaron correctamente:', costError);
      }

      return { success: true, message: `Sabor "${categoria}" guardado correctamente con ${variaciones.length} variaciones` };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      console.error('--- Error en la transacción, rollback ejecutado ---', error);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Error al guardar el sabor: ${msg}`);
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-sabor-details', async (_event: any, categoria: string) => {
    try {
      const recetaRepository = dataSource.getRepository(Receta);
      const recetas = await recetaRepository.find({
        where: { categoria },
        relations: ['ingredientes', 'ingredientes.ingrediente', 'preciosVenta']
      });

      if (!recetas || recetas.length === 0) {
        throw new Error('No se encontraron recetas para el sabor proporcionado.');
      }

      // Asumimos que todos los ingredientes base son los mismos en todas las variaciones
      const primeraReceta = recetas[0];
      const ingredientesBase = primeraReceta.ingredientes
        ?.filter(ing => ing.esIngredienteBase)
        .map(ing => ({
          productoId: ing.ingrediente?.id ?? null,
          nombre: ing.ingrediente?.nombre ?? ing.descripcion ?? '',
          cantidad: ing.cantidad,
          unidad: ing.unidad
        })) || [];

      const variaciones = recetas.map(receta => {
        const precioPrincipal = receta.preciosVenta?.find(p => p.principal)?.valor || 0;
        const ingredientesEspecificos = receta.ingredientes
          ?.filter(ing => !ing.esIngredienteBase)
          .map(ing => ({
            productoId: ing.ingrediente?.id ?? null,
            nombre: ing.ingrediente?.nombre ?? ing.descripcion ?? '',
            cantidad: ing.cantidad,
            unidad: ing.unidad
          })) || [];

        return {
          subcategoria: receta.subcategoria,
          multiplicador: 1, // Placeholder - La lógica del multiplicador se define en el front
          precio: precioPrincipal,
          ingredientesEspecificos: ingredientesEspecificos
        };
      });

      return {
        categoria: categoria,
        ingredientesBase: ingredientesBase,
        variaciones: variaciones
      };

    } catch (error) {
      console.error('Error getting sabor details:', error);
      throw error;
    }
  });

  // ===================== RECETA FASES (modo de preparo) =====================

  ipcMain.handle('get-receta-fases', async (_event: any, recetaId: number) => {
    try {
      const repo = dataSource.getRepository(RecetaFase);
      return await repo.find({
        where: { receta: { id: recetaId }, activo: true },
        relations: [
          'ingredientes',
          'ingredientes.recetaIngrediente',
          'ingredientes.recetaIngrediente.ingrediente',
        ],
        order: { orden: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting receta fases:', error);
      throw error;
    }
  });

  ipcMain.handle('create-receta-fase', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const repo = dataSource.getRepository(RecetaFase);
      const recetaId = data.recetaId || data.receta?.id;
      if (!recetaId) throw new Error('recetaId requerido');
      if (!data.descripcion || !`${data.descripcion}`.trim()) throw new Error('La fase requiere una descripción');
      const fase = repo.create({
        receta: { id: recetaId } as any,
        orden: data.orden ?? 0,
        titulo: data.titulo ? `${data.titulo}`.toUpperCase() : null,
        descripcion: `${data.descripcion}`.toUpperCase(),
        activo: true,
      });
      setEntityUserTracking(dataSource, fase, getCurrentUser()?.id, false);
      return await repo.save(fase);
    } catch (error) {
      console.error('Error creating receta fase:', error);
      throw error;
    }
  });

  ipcMain.handle('update-receta-fase', async (_event: any, faseId: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const repo = dataSource.getRepository(RecetaFase);
      const fase = await repo.findOne({ where: { id: faseId } });
      if (!fase) throw new Error('Fase not found');
      if (data.titulo !== undefined) fase.titulo = data.titulo ? `${data.titulo}`.toUpperCase() : undefined;
      if (data.descripcion !== undefined) fase.descripcion = `${data.descripcion}`.toUpperCase();
      if (data.orden !== undefined) fase.orden = data.orden;
      if (data.activo !== undefined) fase.activo = data.activo;
      setEntityUserTracking(dataSource, fase, getCurrentUser()?.id, true);
      return await repo.save(fase);
    } catch (error) {
      console.error('Error updating receta fase:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-receta-fase', async (_event: any, faseId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const repo = dataSource.getRepository(RecetaFase);
      const fiRepo = dataSource.getRepository(RecetaFaseIngrediente);
      await fiRepo.delete({ fase: { id: faseId } } as any);
      await repo.delete(faseId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting receta fase:', error);
      throw error;
    }
  });

  // Reordena las fases segun el array de IDs recibido (indice = nuevo orden).
  ipcMain.handle('reorder-receta-fases', async (_event: any, recetaId: number, ordenIds: number[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const repo = dataSource.getRepository(RecetaFase);
      for (let i = 0; i < (ordenIds || []).length; i++) {
        await repo.update(ordenIds[i], { orden: i });
      }
      return { success: true };
    } catch (error) {
      console.error('Error reordering receta fases:', error);
      throw error;
    }
  });

  // Reemplaza el conjunto de itemes de receta vinculados a una fase.
  ipcMain.handle('set-receta-fase-ingredientes', async (_event: any, faseId: number, recetaIngredienteIds: number[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const fiRepo = dataSource.getRepository(RecetaFaseIngrediente);
      await fiRepo.delete({ fase: { id: faseId } } as any);
      for (const riId of recetaIngredienteIds || []) {
        const link = fiRepo.create({
          fase: { id: faseId } as any,
          recetaIngrediente: { id: riId } as any,
        });
        setEntityUserTracking(dataSource, link, getCurrentUser()?.id, false);
        await fiRepo.save(link);
      }
      return { success: true };
    } catch (error) {
      console.error('Error setting receta fase ingredientes:', error);
      throw error;
    }
  });

  // ===================== RECETA MATERIALES =====================

  ipcMain.handle('get-receta-materiales', async (_event: any, recetaId: number) => {
    try {
      const repo = dataSource.getRepository(RecetaMaterial);
      return await repo.find({
        where: { receta: { id: recetaId }, activo: true },
        order: { orden: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting receta materiales:', error);
      throw error;
    }
  });

  ipcMain.handle('create-receta-material', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const repo = dataSource.getRepository(RecetaMaterial);
      const recetaId = data.recetaId || data.receta?.id;
      if (!recetaId) throw new Error('recetaId requerido');
      if (!data.descripcion || !`${data.descripcion}`.trim()) throw new Error('El material requiere una descripción');
      const material = repo.create({
        receta: { id: recetaId } as any,
        descripcion: `${data.descripcion}`.toUpperCase(),
        orden: data.orden ?? 0,
        activo: true,
      });
      setEntityUserTracking(dataSource, material, getCurrentUser()?.id, false);
      return await repo.save(material);
    } catch (error) {
      console.error('Error creating receta material:', error);
      throw error;
    }
  });

  ipcMain.handle('update-receta-material', async (_event: any, materialId: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const repo = dataSource.getRepository(RecetaMaterial);
      const material = await repo.findOne({ where: { id: materialId } });
      if (!material) throw new Error('Material not found');
      if (data.descripcion !== undefined) material.descripcion = `${data.descripcion}`.toUpperCase();
      if (data.orden !== undefined) material.orden = data.orden;
      if (data.activo !== undefined) material.activo = data.activo;
      setEntityUserTracking(dataSource, material, getCurrentUser()?.id, true);
      return await repo.save(material);
    } catch (error) {
      console.error('Error updating receta material:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-receta-material', async (_event: any, materialId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RECETAS_GESTIONAR');
      const repo = dataSource.getRepository(RecetaMaterial);
      await repo.delete(materialId);
      return { success: true };
    } catch (error) {
      console.error('Error deleting receta material:', error);
      throw error;
    }
  });

  // ===================== EXPORT PDF DE RECETA =====================

  // Convierte una URL app://carpeta/archivo a dataURL para incrustar en el PDF.
  const appUrlToDataUrl = (appUrl?: string | null): string | null => {
    try {
      if (!appUrl || !appUrl.startsWith('app://')) return null;
      const rest = appUrl.replace(/^app:\/\//, '');
      const slash = rest.indexOf('/');
      if (slash <= 0) return null;
      const carpeta = rest.substring(0, slash);
      const relPath = rest.substring(slash + 1);
      const abs = path.join(app.getPath('userData'), carpeta, relPath);
      if (!fs.existsSync(abs)) return null;
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = ext === '.png' ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.gif' ? 'image/gif'
        : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  };

  ipcMain.handle('export-receta-pdf', async (_event: any, recetaId: number) => {
    try {
      const recetaRepo = dataSource.getRepository(Receta);
      const receta = await recetaRepo.findOne({
        where: { id: recetaId },
        relations: ['ingredientes', 'ingredientes.ingrediente'],
      });
      if (!receta) throw new Error('Receta not found');

      const fases = await dataSource.getRepository(RecetaFase).find({
        where: { receta: { id: recetaId }, activo: true },
        relations: ['ingredientes', 'ingredientes.recetaIngrediente', 'ingredientes.recetaIngrediente.ingrediente'],
        order: { orden: 'ASC' },
      });
      const materiales = await dataSource.getRepository(RecetaMaterial).find({
        where: { receta: { id: recetaId }, activo: true },
        order: { orden: 'ASC' },
      });

      const nombreIng = (ri: any): string =>
        (ri?.ingrediente?.nombre || ri?.descripcion || '').toUpperCase();

      const header = await pdfHeaderEmpresa(dataSource, { titulo: receta.nombre });

      const content: any[] = [header];

      // Foto del producto final.
      const fotoDataUrl = appUrlToDataUrl(receta.imageUrl);
      if (fotoDataUrl) {
        content.push({ image: fotoDataUrl, width: 180, alignment: 'center', margin: [0, 0, 0, 10] });
      }

      // Metadatos (tiempo + rendimiento).
      const meta: { label: string; value: string }[] = [];
      if (receta.tiempoPreparo != null) meta.push({ label: 'Tiempo de preparo', value: `${receta.tiempoPreparo} MIN` });
      meta.push({
        label: 'Rendimiento',
        value: `${pdfFmtMonto(receta.rendimiento, 2)} ${(receta.unidadRendimiento || '').toUpperCase()}`.trim(),
      });
      content.push(pdfMetadatos(meta, 2));

      if (receta.descripcion) {
        content.push({ text: receta.descripcion, style: 'legal', margin: [0, 6, 0, 0] });
      }

      // Ingredientes.
      const ingRows = (receta.ingredientes || []).map((ri: any) => [
        nombreIng(ri),
        ri.cantidad != null ? pdfFmtMonto(ri.cantidad, 2) : '',
        (ri.unidad || '').toUpperCase(),
      ]);
      content.push({ text: 'INGREDIENTES', style: 'sectionHeader' });
      content.push(ingRows.length
        ? pdfTablaSimple(['INGREDIENTE', 'CANTIDAD', 'UNIDAD'], ingRows, { widths: ['*', 'auto', 'auto'], alignment: ['left', 'right', 'left'] })
        : { text: 'Sin ingredientes.', style: 'smallMuted' });

      // Materiales.
      if (materiales.length) {
        content.push({ text: 'MATERIALES', style: 'sectionHeader' });
        content.push({ ul: materiales.map((m: any) => m.descripcion) });
      }

      // Modo de preparo (fases).
      if (fases.length) {
        content.push({ text: 'MODO DE PREPARO', style: 'sectionHeader' });
        fases.forEach((f: any, i: number) => {
          const titulo = f.titulo ? `FASE ${i + 1} — ${f.titulo}` : `FASE ${i + 1}`;
          content.push({ text: titulo, style: 'h3' });
          content.push({ text: f.descripcion || '' });
          const ings = (f.ingredientes || [])
            .map((fi: any) => nombreIng(fi.recetaIngrediente))
            .filter((x: string) => !!x);
          if (ings.length) {
            content.push({ ul: ings, margin: [0, 2, 0, 4], style: 'smallMuted' });
          }
        });
      }

      const base64 = await buildPdfBase64({ content, footer: pdfFooterPaginado() });
      return { base64, fileName: `RECETA_${(receta.nombre || 'RECETA').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}.pdf` };
    } catch (error) {
      console.error('Error exporting receta PDF:', error);
      throw error;
    }
  });
}
