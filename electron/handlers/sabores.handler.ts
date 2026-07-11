import { ipcMain } from 'electron';
import { DataSource, In } from 'typeorm';
import { Sabor } from '../../src/app/database/entities/productos/sabor.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';
import { Presentacion } from '../../src/app/database/entities/productos/presentacion.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { RecetaIngrediente } from '../../src/app/database/entities/productos/receta-ingrediente.entity';

// Global variables for dependency injection
let dataSource: DataSource;
let getCurrentUser: () => Usuario | null;

export const saboresHandlers = {

  // ✅ Obtener sabores por producto
  'get-sabores-by-producto': async (productoId: number): Promise<Sabor[]> => {
    try {
      console.log(`📋 Getting sabores for producto ID: ${productoId}`);

      const sabores = await dataSource.getRepository(Sabor).find({
        where: { producto: { id: productoId } },
        order: { nombre: 'ASC' }
      });

      // Las recetas de un sabor se alcanzan vía RecetaPresentacion (sabor→rp→receta),
      // no hay relación directa Sabor.recetas. Adjuntamos las recetas (dedupe) por sabor.
      const saborIds = sabores.map((s) => s.id!).filter(Boolean);
      if (saborIds.length) {
        const rps = await dataSource.getRepository(RecetaPresentacion).find({
          where: { sabor: { id: In(saborIds) } },
          relations: ['sabor', 'receta', 'receta.ingredientes'],
        });
        const recetasPorSabor = new Map<number, Map<number, Receta>>();
        for (const rp of rps) {
          const sid = rp.sabor?.id;
          if (sid == null || !rp.receta) continue;
          if (!recetasPorSabor.has(sid)) recetasPorSabor.set(sid, new Map());
          recetasPorSabor.get(sid)!.set(rp.receta.id!, rp.receta);
        }
        for (const s of sabores) {
          (s as any).recetas = Array.from(recetasPorSabor.get(s.id!)?.values() ?? []);
        }
      }

      console.log(`✅ Found ${sabores.length} sabores for producto ${productoId}`);
      return sabores;

    } catch (error) {
      console.error('❌ Error getting sabores:', error);
      throw new Error(`Error al obtener sabores del producto: ${error.message}`);
    }
  },

  // ✅ Crear nuevo sabor con receta base automática
  'create-sabor': async (saborData: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    productoId: number;
  }): Promise<{ sabor: Sabor; receta: Receta; mensaje: string }> => {

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log(`🔄 Creating sabor: ${saborData.nombre} for producto ${saborData.productoId}`);

      // 1. Verificar que el producto existe
      const producto = await queryRunner.manager.getRepository(Producto)
        .findOne({
          where: { id: saborData.productoId },
          relations: ['presentaciones']
        });

      if (!producto) {
        throw new Error(`Producto con ID ${saborData.productoId} no encontrado`);
      }

      // 2. Verificar que no exista un sabor con el mismo nombre para este producto
      const saborExistente = await queryRunner.manager.getRepository(Sabor)
        .findOne({
          where: {
            nombre: saborData.nombre.toUpperCase(),
            producto: { id: saborData.productoId }
          }
        });

      if (saborExistente) {
        throw new Error(`Ya existe un sabor '${saborData.nombre}' para este producto`);
      }

      // 3. Crear el sabor
      const saborRepo = queryRunner.manager.getRepository(Sabor);
      const nuevoSabor = saborRepo.create({
        nombre: saborData.nombre.toUpperCase(),
        categoria: saborData.categoria.toUpperCase(),
        descripcion: saborData.descripcion?.toUpperCase(),
        producto: { id: saborData.productoId },
        activo: true
      });
      const saborGuardado = await saborRepo.save(nuevoSabor);

      // 4. Crear receta base automáticamente
      const recetaRepo = queryRunner.manager.getRepository(Receta);
      const nombreReceta = `${producto.nombre} ${saborData.nombre}`;

      const nuevaReceta = recetaRepo.create({
        nombre: nombreReceta.toUpperCase(),
        descripcion: `Receta base para ${nombreReceta}`,
        productoVariacion: { id: saborData.productoId },
        rendimiento: 1,
        unidadRendimiento: 'UNIDADES',
        costoCalculado: 0,
        activo: true
      });
      const recetaGuardada = await recetaRepo.save(nuevaReceta);

      // 5. Auto-generar variaciones (RecetaPresentacion) para cada presentación,
      //    asignando el sabor recién creado (el sabor vive en RecetaPresentacion).
      const variacionesGeneradas = await generarVariacionesParaReceta(
        queryRunner, recetaGuardada.id, saborGuardado, producto,
      );

      await queryRunner.commitTransaction();

      console.log(`✅ Sabor '${saborData.nombre}' creado con receta base y ${variacionesGeneradas.length} variaciones`);

      return {
        sabor: saborGuardado,
        receta: recetaGuardada,
        mensaje: `Sabor '${saborData.nombre}' creado con receta base y ${variacionesGeneradas.length} variaciones automáticas`
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error creating sabor:', error);
      throw new Error(`Error al crear sabor: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  },

  // ✅ Actualizar sabor
  'update-sabor': async (saborId: number, saborData: Partial<Sabor>): Promise<Sabor> => {
    try {
      console.log(`🔄 Updating sabor ID: ${saborId}`);

      const saborRepo = dataSource.getRepository(Sabor);

      // Verificar que el sabor existe
      const saborExistente = await saborRepo.findOne({
        where: { id: saborId }
      });

      if (!saborExistente) {
        throw new Error(`Sabor con ID ${saborId} no encontrado`);
      }

      // Actualizar sabor
      await saborRepo.update(saborId, {
        ...saborData,
        nombre: saborData.nombre?.toUpperCase(),
        categoria: saborData.categoria?.toUpperCase(),
        descripcion: saborData.descripcion?.toUpperCase()
      });

      // Si cambió el nombre, actualizar nombres de recetas relacionadas
      if (saborData.nombre && saborData.nombre !== saborExistente.nombre) {
        await actualizarNombresRecetasPorSabor(saborId, saborData.nombre);
      }

      const saborActualizado = await saborRepo.findOne({
        where: { id: saborId }
      });

      console.log(`✅ Sabor ID ${saborId} updated successfully`);
      return saborActualizado!;

    } catch (error) {
      console.error('❌ Error updating sabor:', error);
      throw new Error(`Error al actualizar sabor: ${error.message}`);
    }
  },

  // ✅ Eliminar sabor (con validaciones)
  'delete-sabor': async (saborId: number): Promise<{ success: boolean; mensaje: string }> => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      console.log(`🔄 Deleting sabor ID: ${saborId}`);

      // 1. Obtener sabor y sus variaciones a través de la relación inversa
      const sabor = await queryRunner.manager.getRepository(Sabor).findOne({
        where: { id: saborId }
      });

      if (!sabor) {
        throw new Error(`Sabor con ID ${saborId} no encontrado`);
      }

      // Obtener variaciones que usan este sabor
      const variaciones = await queryRunner.manager.getRepository(RecetaPresentacion).find({
        where: { sabor: { id: saborId } },
        relations: ['receta', 'receta.ingredientes']
      });

      // 2. Validar que no tenga variaciones con recetas que tengan ingredientes configurados
      const variacionesConIngredientes = variaciones.filter(variacion =>
        variacion.receta?.ingredientes && variacion.receta.ingredientes.length > 0
      );

      if (variacionesConIngredientes.length > 0) {
        throw new Error(
          `No se puede eliminar el sabor '${sabor.nombre}' porque tiene ${variacionesConIngredientes.length} variación(es) con recetas que tienen ingredientes configurados. ` +
          'Elimine primero los ingredientes de las recetas.'
        );
      }

      // 3. Contar variaciones que se eliminarán
      const totalVariaciones = variaciones.length;

      // 4. Eliminar en orden correcto (por las foreign keys)

      // Eliminar variaciones (RecetaPresentacion) y sus recetas asociadas
      for (const variacion of variaciones) {
        if (variacion.receta) {
          // Eliminar ingredientes de la receta
          await queryRunner.manager
            .getRepository(RecetaIngrediente)
            .delete({ receta: { id: variacion.receta.id } });

          // Eliminar la receta
          await queryRunner.manager
            .getRepository(Receta)
            .delete({ id: variacion.receta.id });
        }

        // Eliminar la variación
        await queryRunner.manager
          .getRepository(RecetaPresentacion)
          .delete({ id: variacion.id });
      }

      // Eliminar el sabor
      await queryRunner.manager.getRepository(Sabor).delete(saborId);

      await queryRunner.commitTransaction();

      const mensaje = `Sabor '${sabor.nombre}' eliminado correctamente junto con ${totalVariaciones} variación(es)`;

      console.log(`✅ ${mensaje}`);

      return {
        success: true,
        mensaje
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error deleting sabor:', error);
      throw new Error(`Error al eliminar sabor: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  },

  // ✅ Obtener estadísticas de sabores por producto
  'get-sabores-estadisticas': async (productoId: number): Promise<{
    totalSabores: number;
    saboresActivos: number;
    totalRecetas: number;
    totalVariaciones: number;
  }> => {
    try {
      const sabores = await dataSource.getRepository(Sabor).find({
        where: { producto: { id: productoId } }
      });

      // Obtener todas las variaciones del producto para calcular estadísticas
      const variaciones = await dataSource.getRepository(RecetaPresentacion)
        .createQueryBuilder('rp')
        .leftJoinAndSelect('rp.presentacion', 'presentacion')
        .leftJoinAndSelect('rp.sabor', 'sabor')
        .leftJoinAndSelect('rp.receta', 'receta')
        .where('sabor.producto_id = :productoId', { productoId })
        .getMany();

      const estadisticas = {
        totalSabores: sabores.length,
        saboresActivos: sabores.filter(s => s.activo).length,
        totalRecetas: variaciones.filter(v => v.receta).length,
        totalVariaciones: variaciones.length
      };

      console.log(`📊 Estadísticas producto ${productoId}:`, estadisticas);
      return estadisticas;

    } catch (error) {
      console.error('❌ Error getting estadisticas:', error);
      throw new Error(`Error al obtener estadísticas: ${error.message}`);
    }
  }
};

// ✅ HELPER: Generar variaciones automáticamente para una receta (una por presentación).
// El sabor se asigna en RecetaPresentacion (columna NOT NULL), por eso se recibe explícito.
async function generarVariacionesParaReceta(
  queryRunner: any,
  recetaId: number,
  sabor: { id: number; nombre: string },
  producto: { nombre: string; presentaciones?: Presentacion[] },
): Promise<RecetaPresentacion[]> {
  try {
    console.log(`🔄 Generating variations for receta ID: ${recetaId}`);

    const presentaciones = producto?.presentaciones || [];
    if (!presentaciones.length) {
      console.log(`⚠️ No presentaciones found for producto (receta ${recetaId})`);
      return [];
    }

    const variacionesRepo = queryRunner.manager.getRepository(RecetaPresentacion);
    const variaciones: RecetaPresentacion[] = [];

    for (const presentacion of presentaciones) {
      // Verificar si ya existe esta variación (por presentación + sabor, que es el índice único)
      const variacionExistente = await variacionesRepo.findOne({
        where: {
          presentacion: { id: presentacion.id },
          sabor: { id: sabor.id }
        }
      });

      if (variacionExistente) {
        console.log(`⚠️ Variación ya existe: ${variacionExistente.nombre_generado}`);
        continue;
      }

      const nombreGenerado = generarNombreVariacion(producto.nombre, presentacion.nombre, sabor.nombre);
      const sku = generarSKU(producto.nombre, sabor.nombre, presentacion.nombre);

      const variacion = variacionesRepo.create({
        nombre_generado: nombreGenerado,
        sku,
        costo_calculado: 0,
        activo: true,
        receta: { id: recetaId },
        presentacion: { id: presentacion.id },
        sabor: { id: sabor.id }
      });

      const variacionGuardada = await variacionesRepo.save(variacion);
      variaciones.push(variacionGuardada);

      console.log(`✅ Variación creada: ${nombreGenerado} (SKU: ${sku})`);
    }

    console.log(`✅ Generated ${variaciones.length} variations for receta ${recetaId}`);
    return variaciones;

  } catch (error) {
    console.error('❌ Error generating variations:', error);
    throw error;
  }
}

// ✅ HELPER: Generar nombre de variación
function generarNombreVariacion(nombreProducto: string, nombrePresentacion: string, nombreSabor?: string): string {
  const partes = [nombreProducto, nombrePresentacion, nombreSabor].filter(Boolean);
  return partes.join(' ').toUpperCase();
}

// ✅ HELPER: Generar SKU
function generarSKU(nombreProducto: string, nombreSabor?: string, nombrePresentacion?: string): string {
  const timestamp = Date.now().toString().slice(-4); // Últimos 4 dígitos para unicidad
  const partes = [
    nombreProducto.substring(0, 3).toUpperCase(),
    nombreSabor?.substring(0, 3).toUpperCase() || 'STD',
    nombrePresentacion?.substring(0, 1).toUpperCase() || 'U',
    timestamp
  ];
  return partes.join('-');
}

// ✅ HELPER: Actualizar nombres de recetas/variaciones cuando cambia el nombre del sabor.
// El vínculo receta↔sabor vive en RecetaPresentacion, así que partimos de ahí.
async function actualizarNombresRecetasPorSabor(saborId: number, nuevoNombreSabor: string): Promise<void> {
  try {
    const nombreSabor = nuevoNombreSabor.toUpperCase();
    const variaciones = await dataSource.getRepository(RecetaPresentacion).find({
      where: { sabor: { id: saborId } },
      relations: ['receta', 'receta.productoVariacion', 'presentacion'],
    });

    const recetasActualizadas = new Set<number>();
    for (const variacion of variaciones) {
      const receta = variacion.receta;
      const nombreProducto = receta?.productoVariacion?.nombre || '';

      // Renombrar la receta base una sola vez.
      if (receta?.id != null && !recetasActualizadas.has(receta.id)) {
        recetasActualizadas.add(receta.id);
        await dataSource.getRepository(Receta).update(receta.id, {
          nombre: `${nombreProducto} ${nombreSabor}`.toUpperCase(),
        });
      }

      // Renombrar la variación (nombre_generado) según producto + tamaño + sabor.
      if (variacion.presentacion) {
        const nuevoNombreVariacion = generarNombreVariacion(
          nombreProducto,
          variacion.presentacion.nombre,
          nombreSabor,
        );
        await dataSource.getRepository(RecetaPresentacion).update(variacion.id!, {
          nombre_generado: nuevoNombreVariacion,
        });
      }
    }

    console.log(`✅ Updated names for ${recetasActualizadas.size} recetas / ${variaciones.length} variaciones after sabor rename`);

  } catch (error) {
    console.error('❌ Error updating receta names:', error);
    throw error;
  }
}

// ✅ FUNCIÓN DE REGISTRO DE HANDLERS
export function registerSaboresHandlers(ds: DataSource, getCurrentUserFn: () => Usuario | null): void {
  // Inject dependencies
  dataSource = ds;
  getCurrentUser = getCurrentUserFn;

  console.log('🔧 Registering Sabores handlers...');

  // Register all handlers
  Object.entries(saboresHandlers).forEach(([event, handler]) => {
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

  console.log('✅ Sabores handlers registered successfully');
}
