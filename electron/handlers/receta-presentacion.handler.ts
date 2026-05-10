import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { Presentacion } from '../../src/app/database/entities/productos/presentacion.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { Sabor } from '../../src/app/database/entities/productos/sabor.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

// Global variables for dependency injection
let dataSource: DataSource;
let getCurrentUser: () => Usuario | null;

export const recetaPresentacionHandlers = {

  // ✅ Obtener variaciones por producto
  'get-variaciones-by-producto': async (productoId: number): Promise<RecetaPresentacion[]> => {
    try {
      console.log(`📋 Getting variaciones for producto ID: ${productoId}`);

      const variaciones = await dataSource.getRepository(RecetaPresentacion)
        .createQueryBuilder('rp')
        .leftJoinAndSelect('rp.receta', 'receta')
        .leftJoinAndSelect('rp.presentacion', 'presentacion')
        .leftJoinAndSelect('receta.sabor', 'sabor')
        .leftJoinAndSelect('rp.preciosVenta', 'preciosVenta')
        .where('receta.producto_id_variacion = :productoId', { productoId })
        .orderBy('sabor.nombre', 'ASC')
        .addOrderBy('presentacion.cantidad', 'ASC')
        .getMany();

      console.log(`✅ Found ${variaciones.length} variaciones for producto ${productoId}`);
      return variaciones;

    } catch (error) {
      console.error('❌ Error getting variaciones by producto:', error);
      throw new Error(`Error al obtener variaciones del producto: ${error.message}`);
    }
  },

  // ✅ Obtener variaciones por receta
  'get-variaciones-by-receta': async (recetaId: number): Promise<RecetaPresentacion[]> => {
    try {
      console.log(`📋 Getting variaciones for receta ID: ${recetaId}`);

      const variaciones = await dataSource.getRepository(RecetaPresentacion).find({
        where: { receta: { id: recetaId } },
        relations: ['presentacion', 'preciosVenta'],
        order: { presentacion: { cantidad: 'ASC' } }
      });

      console.log(`✅ Found ${variaciones.length} variaciones for receta ${recetaId}`);
      return variaciones;

    } catch (error) {
      console.error('❌ Error getting variaciones by receta:', error);
      throw new Error(`Error al obtener variaciones de la receta: ${error.message}`);
    }
  },

  // ✅ Crear variación individual
  'create-receta-presentacion': async (variacionData: {
    recetaId: number;
    presentacionId: number;
    saborId: number; // ✅ NUEVO: Necesitamos el sabor_id
    nombre_generado?: string;
    sku?: string;
    precio_ajuste?: number;
  }): Promise<RecetaPresentacion> => {

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log(`🔄 Creating variacion: receta ${variacionData.recetaId} + presentacion ${variacionData.presentacionId} + sabor ${variacionData.saborId}`);

      // Verificar que no exista ya esta combinación
      const variacionExistente = await queryRunner.manager.getRepository(RecetaPresentacion).findOne({
        where: {
          presentacion: { id: variacionData.presentacionId },
          sabor: { id: variacionData.saborId }
        }
      });

      if (variacionExistente) {
        throw new Error('Ya existe una variación para esta combinación de presentación y sabor');
      }

      // Obtener datos para auto-generar nombre si no se proporciona
      let nombreGenerado = variacionData.nombre_generado;
      let sku = variacionData.sku;

      if (!nombreGenerado || !sku) {
        const receta = await queryRunner.manager.getRepository(Receta).findOne({
          where: { id: variacionData.recetaId }
        });

        const presentacion = await queryRunner.manager.getRepository(Presentacion).findOne({
          where: { id: variacionData.presentacionId }
        });

        const sabor = await queryRunner.manager.getRepository(Sabor).findOne({
          where: { id: variacionData.saborId }
        });

        if (receta && presentacion && sabor) {
          nombreGenerado = nombreGenerado || generarNombreVariacion(
            receta.nombre || 'Producto',
            presentacion.nombre,
            sabor.nombre
          );

          sku = sku || generarSKU(
            receta.nombre || 'Producto',
            sabor.nombre,
            presentacion.nombre
          );
        }
      }

      // Crear la variación
      const repo = queryRunner.manager.getRepository(RecetaPresentacion);
      const nuevaVariacion = repo.create({
        nombre_generado: nombreGenerado,
        sku,
        precio_ajuste: variacionData.precio_ajuste,
        costo_calculado: 0, // Se calculará después
        activo: true,
        receta: { id: variacionData.recetaId },
        presentacion: { id: variacionData.presentacionId },
        sabor: { id: variacionData.saborId } // ✅ NUEVO: Asignar el sabor
      });

      const variacionGuardada = await repo.save(nuevaVariacion);

      // Calcular costo inicial
      await calcularCostoVariacion(queryRunner, variacionGuardada.id!);

      await queryRunner.commitTransaction();

      // Recargar con relaciones
      const variacionCompleta = await dataSource.getRepository(RecetaPresentacion).findOne({
        where: { id: variacionGuardada.id },
        relations: ['receta', 'presentacion', 'sabor']
      });

      console.log(`✅ Variación creada: ${nombreGenerado}`);
      return variacionCompleta!;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error creating variacion:', error);
      throw new Error(`Error al crear variación: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  },

  // ✅ Actualizar variación
  'update-receta-presentacion': async (variacionId: number, variacionData: Partial<RecetaPresentacion>): Promise<RecetaPresentacion> => {
    try {
      console.log(`🔄 Updating variacion ID: ${variacionId}`);

      const repo = dataSource.getRepository(RecetaPresentacion);

      // Verificar que existe
      const variacionExistente = await repo.findOne({
        where: { id: variacionId },
        relations: ['receta', 'presentacion']
      });

      if (!variacionExistente) {
        throw new Error(`Variación con ID ${variacionId} no encontrada`);
      }

      // Actualizar solo los campos proporcionados
      if (variacionData.nombre_generado !== undefined) {
        await repo.update(variacionId, {
          nombre_generado: variacionData.nombre_generado?.toUpperCase()
        });
      }

      const variacionActualizada = await repo.findOne({
        where: { id: variacionId },
        relations: ['receta', 'presentacion', 'sabor', 'preciosVenta']
      });

      console.log(`✅ Variación ID ${variacionId} updated successfully`);
      return variacionActualizada!;

    } catch (error) {
      console.error('❌ Error updating variacion:', error);
      throw new Error(`Error al actualizar variación: ${error.message}`);
    }
  },

  // ✅ Eliminar variación
  'delete-receta-presentacion': async (variacionId: number): Promise<{ success: boolean; mensaje: string }> => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log(`🔄 Deleting variacion ID: ${variacionId}`);

      // Obtener variación con relaciones
      const variacion = await queryRunner.manager.getRepository(RecetaPresentacion).findOne({
        where: { id: variacionId },
        relations: ['receta', 'presentacion', 'receta.sabor', 'preciosVenta']
      });

      if (!variacion) {
        throw new Error(`Variación con ID ${variacionId} no encontrada`);
      }

      // Eliminar precios de venta asociados
      if (variacion.preciosVenta?.length) {
        await queryRunner.manager.getRepository(PrecioVenta)
          .delete({ recetaPresentacion: { id: variacionId } });
      }

      // Eliminar la variación
      await queryRunner.manager.getRepository(RecetaPresentacion).delete(variacionId);

      await queryRunner.commitTransaction();

      const mensaje = `Variación '${variacion.nombre_generado}' eliminada correctamente`;

      console.log(`✅ ${mensaje}`);

      return {
        success: true,
        mensaje
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error deleting variacion:', error);
      throw new Error(`Error al eliminar variación: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  },

  // ✅ Bulk update de precios/estado
  'bulk-update-variaciones': async (updates: Array<{
    variacionId: number;
    precio_ajuste?: number;
    activo?: boolean;
  }>): Promise<{ success: boolean; actualizadas: number }> => {

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log(`🔄 Bulk updating ${updates.length} variaciones`);

      let actualizadas = 0;
      const repo = queryRunner.manager.getRepository(RecetaPresentacion);

      for (const update of updates) {
        const updateData: Partial<RecetaPresentacion> = {};

        if (update.precio_ajuste !== undefined) {
          updateData.precio_ajuste = update.precio_ajuste;
        }

        if (update.activo !== undefined) {
          updateData.activo = update.activo;
        }

        if (Object.keys(updateData).length > 0) {
          await repo.update(update.variacionId, updateData);
          actualizadas++;
        }
      }

      await queryRunner.commitTransaction();

      console.log(`✅ Bulk update completed: ${actualizadas} variaciones updated`);

      return { success: true, actualizadas };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error in bulk update:', error);
      throw new Error(`Error en actualización masiva: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  },

  // ✅ Recalcular costo de variación específica
  'recalcular-costo-variacion': async (variacionId: number): Promise<{
    success: boolean;
    costoAnterior: number;
    costoNuevo: number;
    mensaje: string;
  }> => {
    try {
      console.log(`🔄 Recalculating cost for variacion ID: ${variacionId}`);

      const resultado = await recalcularCostoVariacion(variacionId);

      console.log(`✅ Cost recalculated for variacion ${variacionId}: ${resultado.costoAnterior} → ${resultado.costoNuevo}`);

      return {
        ...resultado,
        mensaje: `Costo recalculado: $${resultado.costoAnterior.toFixed(2)} → $${resultado.costoNuevo.toFixed(2)}`
      };

    } catch (error) {
      console.error('❌ Error recalculating cost:', error);
      throw new Error(`Error al recalcular costo: ${error.message}`);
    }
  },

  // ✅ Obtener variaciones por producto y presentación (para diálogo de selección en PdV)
  'get-variaciones-by-producto-and-presentacion': async (productoId: number, presentacionId: number): Promise<RecetaPresentacion[]> => {
    try {
      console.log(`📋 Getting variaciones for producto ${productoId} and presentacion ${presentacionId}`);

      const variaciones = await dataSource.getRepository(RecetaPresentacion)
        .createQueryBuilder('rp')
        .leftJoinAndSelect('rp.receta', 'receta')
        .leftJoinAndSelect('rp.presentacion', 'presentacion')
        .leftJoinAndSelect('rp.sabor', 'sabor')
        .leftJoinAndSelect('rp.preciosVenta', 'preciosVenta')
        .leftJoinAndSelect('preciosVenta.moneda', 'moneda')
        .leftJoinAndSelect('preciosVenta.tipoPrecio', 'tipoPrecio')
        .leftJoinAndSelect('receta.ingredientes', 'ingredientes')
        .leftJoinAndSelect('ingredientes.ingrediente', 'ingredienteProducto')
        .leftJoinAndSelect('receta.adicionalesVinculados', 'adicionalesVinculados')
        .leftJoinAndSelect('adicionalesVinculados.adicional', 'adicional')
        .where('receta.producto_variacion_id = :productoId', { productoId })
        .andWhere('rp.presentacion_id = :presentacionId', { presentacionId })
        .andWhere('rp.activo = true')
        .orderBy('sabor.nombre', 'ASC')
        .getMany();

      console.log(`✅ Found ${variaciones.length} variaciones for producto ${productoId} + presentacion ${presentacionId}`);
      return variaciones;

    } catch (error) {
      console.error('❌ Error getting variaciones by producto and presentacion:', error);
      throw new Error(`Error al obtener variaciones: ${error.message}`);
    }
  },

  // ✅ Generar variaciones faltantes para un producto
  'generate-variaciones-faltantes': async (productoId: number): Promise<{
    success: boolean;
    variacionesGeneradas: number;
    variaciones: RecetaPresentacion[];
  }> => {

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log(`🔄 Generating missing variaciones for producto ID: ${productoId}`);

      // Obtener todas las recetas del producto
      const recetas = await queryRunner.manager.getRepository(Receta).find({
        where: { productoVariacion: { id: productoId } },
        relations: ['sabor', 'productoVariacion', 'productoVariacion.presentaciones']
      });

      if (!recetas.length) {
        return {
          success: true,
          variacionesGeneradas: 0,
          variaciones: []
        };
      }

      const variacionesGeneradas: RecetaPresentacion[] = [];

      // Para cada receta, generar variaciones faltantes
      for (const receta of recetas) {
        const presentaciones = receta.productoVariacion?.presentaciones || [];

        for (const presentacion of presentaciones) {
          // Verificar si ya existe esta variación
          const variacionExistente = await queryRunner.manager.getRepository(RecetaPresentacion).findOne({
            where: {
              receta: { id: receta.id },
              presentacion: { id: presentacion.id }
            }
          });

          if (!variacionExistente) {
            // Crear nueva variación
            const nombreGenerado = generarNombreVariacion(
              receta.productoVariacion?.nombre || 'Producto',
              presentacion.nombre,
              receta.sabor?.nombre
            );

            const sku = generarSKU(
              receta.productoVariacion?.nombre || 'Producto',
              receta.sabor?.nombre,
              presentacion.nombre
            );

            const nuevaVariacion = await queryRunner.manager.getRepository(RecetaPresentacion).save({
              nombre_generado: nombreGenerado,
              sku,
              precio_ajuste: 0,
              costo_calculado: 0,
              activo: true,
              receta: { id: receta.id },
              presentacion: { id: presentacion.id },
              sabor: { id: receta.sabor?.id } // ✅ NUEVO: Asignar el sabor
            });

            variacionesGeneradas.push(nuevaVariacion);

            console.log(`✅ Generated variacion: ${nombreGenerado}`);
          }
        }
      }

      await queryRunner.commitTransaction();

      console.log(`✅ Generated ${variacionesGeneradas.length} missing variaciones for producto ${productoId}`);

      return {
        success: true,
        variacionesGeneradas: variacionesGeneradas.length,
        variaciones: variacionesGeneradas
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error generating missing variaciones:', error);
      throw new Error(`Error al generar variaciones faltantes: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }
};

// ✅ HELPER: Calcular costo de variación
async function calcularCostoVariacion(queryRunner: any, variacionId: number): Promise<void> {
  try {
    const variacion = await queryRunner.manager.getRepository(RecetaPresentacion).findOne({
      where: { id: variacionId },
      relations: ['receta', 'receta.ingredientes']
    });

    if (!variacion) return;

    // Calcular costo basado en ingredientes (sin multiplicador)
    const costoCalculado = variacion.receta.ingredientes?.reduce((total, ingrediente) => {
      return total + (ingrediente.costoTotal || 0);
    }, 0) || 0;

    // Actualizar
    await queryRunner.manager.getRepository(RecetaPresentacion).update(variacionId, {
      costo_calculado: costoCalculado
    });

  } catch (error) {
    console.error('❌ Error calculating variation cost:', error);
    throw error;
  }
}

// ✅ HELPER: Recalcular costo (función pública)
async function recalcularCostoVariacion(variacionId: number): Promise<{
  success: boolean;
  costoAnterior: number;
  costoNuevo: number;
}> {
  try {
    const variacion = await dataSource.getRepository(RecetaPresentacion).findOne({
      where: { id: variacionId },
      relations: ['receta', 'receta.ingredientes']
    });

    if (!variacion) {
      throw new Error(`Variación con ID ${variacionId} no encontrada`);
    }

    const costoAnterior = variacion.costo_calculado;

    // Calcular nuevo costo
    const costoNuevo = variacion.receta.ingredientes?.reduce((total, ingrediente) => {
      return total + (ingrediente.costoTotal || 0);
    }, 0) || 0;

    // Actualizar
    await dataSource.getRepository(RecetaPresentacion).update(variacionId, {
      costo_calculado: costoNuevo
    });

    return {
      success: true,
      costoAnterior,
      costoNuevo
    };

  } catch (error) {
    console.error('❌ Error recalculating cost:', error);
    throw error;
  }
}

// ✅ HELPER: Generar nombre de variación
function generarNombreVariacion(nombreProducto: string, nombrePresentacion: string, nombreSabor?: string): string {
  const partes = [nombreProducto, nombrePresentacion, nombreSabor].filter(Boolean);
  return partes.join(' ').toUpperCase();
}

// ✅ HELPER: Generar SKU único
function generarSKU(nombreProducto: string, nombreSabor?: string, nombrePresentacion?: string): string {
  const timestamp = Date.now().toString().slice(-4);
  const partes = [
    nombreProducto.substring(0, 3).toUpperCase(),
    nombreSabor?.substring(0, 3).toUpperCase() || 'STD',
    nombrePresentacion?.substring(0, 1).toUpperCase() || 'U',
    timestamp
  ];
  return partes.join('-');
}

// ✅ FUNCIÓN DE REGISTRO DE HANDLERS
export function registerRecetaPresentacionHandlers(ds: DataSource, getCurrentUserFn: () => Usuario | null): void {
  // Inject dependencies
  dataSource = ds;
  getCurrentUser = getCurrentUserFn;

  console.log('🔧 Registering RecetaPresentacion handlers...');

  // Register all handlers
  Object.entries(recetaPresentacionHandlers).forEach(([event, handler]) => {
    ipcMain.handle(event, async (_evt, ...args: unknown[]) => {
      try {
        console.log(`📞 Handler called: ${event}`, args.length > 0 ? `with ${args.length} args` : '');
        const fn = handler as (...a: unknown[]) => unknown | Promise<unknown>;
        const result = await fn(...args);
        console.log(`✅ Handler ${event} completed successfully`);
        return result as unknown;
      } catch (error) {
        console.error(`❌ Error in handler ${event}:`, error);
        throw error;
      }
    });
  });

  console.log('✅ RecetaPresentacion handlers registered successfully');
}
