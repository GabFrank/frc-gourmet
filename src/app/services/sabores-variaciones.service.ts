import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, combineLatest, forkJoin, of } from 'rxjs';
import { map, tap, catchError, switchMap } from 'rxjs/operators';
import { RepositoryService } from '../database/repository.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RecetaIngrediente } from '../database/entities/productos/receta-ingrediente.entity';

export interface Sabor {
  id?: number;
  nombre: string;
  categoria: string;
  descripcion?: string;
  activo: boolean;
  producto?: any;
  variaciones?: RecetaPresentacion[];
  imageUrl?: string | null;
}

export interface RecetaPresentacion {
  id?: number;
  nombre_generado: string;
  sku?: string;
  precio_ajuste?: number;
  costo_calculado: number;
  activo: boolean;
  receta?: {
    id?: number;
    nombre?: string;
    preciosCosto?: Array<{
      id?: number;
      valor: number;
      fuente: string;
      fecha: Date;
      activo: boolean;
    }>;
  };
  presentacion?: any;
  sabor?: any;
  preciosVenta?: any[];
  // ✅ NUEVO: Precio principal de la variación
  precioPrincipal?: {
    id?: number;
    valor: number;
    moneda?: {
      id?: number;
      denominacion: string;
      codigo: string;
    };
    tipoPrecio?: {
      id?: number;
      descripcion: string;
    };
    principal: boolean;
    activo: boolean;
  } | null;
  // ✅ NUEVO: Propiedades pre-calculadas para el template (Regla #2)
  precioPrincipalFormateado?: string;
  tienePrecioPrincipal?: boolean;
  precioPrincipalActivo?: boolean;
  precioPrincipalEsPrincipal?: boolean;
  margenFormateado?: string; // ✅ NUEVO: Margen ya formateado
  // ✅ NUEVO: Moneda y valor separados para el pipe number (Regla #4)
  precioPrincipalMoneda?: string;
  precioPrincipalValor?: number;
  // ✅ NUEVO: Margen separado para el pipe number (Regla #4)
  margenMoneda?: string;
  margenValor?: number;
}

export interface EstadisticasSabores {
  totalSabores: number;
  saboresActivos: number;
  totalRecetas: number;
  totalVariaciones: number;
}

@Injectable({
  providedIn: 'root'
})
export class SaboresVariacionesService {

  // State management
  private _sabores$ = new BehaviorSubject<Sabor[]>([]);
  private _variaciones$ = new BehaviorSubject<RecetaPresentacion[]>([]);
  private _estadisticas$ = new BehaviorSubject<EstadisticasSabores>({
    totalSabores: 0,
    saboresActivos: 0,
    totalRecetas: 0,
    totalVariaciones: 0
  });
  private _loading$ = new BehaviorSubject<boolean>(false);
  private _error$ = new BehaviorSubject<string | null>(null);

  // Public observables
  public readonly sabores$ = this._sabores$.asObservable();
  public readonly variaciones$ = this._variaciones$.asObservable();
  public readonly estadisticas$ = this._estadisticas$.asObservable();
  public readonly loading$ = this._loading$.asObservable();
  public readonly error$ = this._error$.asObservable();

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {}

  // ✅ GESTIÓN DE SABORES

  /**
   * Cargar sabores de un producto específico
   */
  cargarSaboresByProducto(productoId: number): Observable<Sabor[]> {
    console.log('[SaboresVariacionesService] cargarSaboresByProducto', { productoId });
    this._loading$.next(true);
    this._error$.next(null);

    return this.repositoryService.getSaboresByProducto(productoId).pipe(
      tap(sabores => {
        console.log('[SaboresVariacionesService] sabores loaded', { productoId, count: sabores.length });
        this._sabores$.next(sabores);
        this._loading$.next(false);
      }),
      catchError(error => {
        console.error('❌ Error cargando sabores:', error);
        this._error$.next(`Error al cargar sabores: ${error.message}`);
        this._loading$.next(false);
        this.showError('Error al cargar sabores');
        throw error;
      })
    );
  }

  /**
   * Crear nuevo sabor con receta base automática
   */
  crearSabor(saborData: {
    nombre: string;
    categoria: string;
    descripcion?: string;
    productoId: number;
    imageUrl?: string | null;
  }): Observable<{ sabor: Sabor; receta: any; mensaje: string }> {

    this._loading$.next(true);
    this._error$.next(null);

    return this.repositoryService.createSabor(saborData).pipe(
      tap(result => {
        console.log('✅ Sabor creado:', result.sabor.nombre);

        // Actualizar lista local
        const saboresActuales = this._sabores$.value;
        this._sabores$.next([...saboresActuales, result.sabor]);

        this._loading$.next(false);
        this.showSuccess(result.mensaje);
      }),
      catchError(error => {
        console.error('❌ Error creando sabor:', error);
        this._error$.next(`Error al crear sabor: ${error.message}`);
        this._loading$.next(false);
        this.showError('Error al crear sabor');
        throw error;
      })
    );
  }

  /**
   * Actualizar sabor existente
   */
  actualizarSabor(saborId: number, saborData: Partial<Sabor>): Observable<Sabor> {
    this._loading$.next(true);
    this._error$.next(null);

    return this.repositoryService.updateSabor(saborId, saborData).pipe(
      tap(saborActualizado => {
        console.log('✅ Sabor actualizado:', saborActualizado.nombre);

        // Actualizar en lista local
        const saboresActuales = this._sabores$.value;
        const index = saboresActuales.findIndex(s => s.id === saborId);
        if (index >= 0) {
          saboresActuales[index] = saborActualizado;
          this._sabores$.next([...saboresActuales]);
        }

        this._loading$.next(false);
        this.showSuccess('Sabor actualizado correctamente');
      }),
      catchError(error => {
        console.error('❌ Error actualizando sabor:', error);
        this._error$.next(`Error al actualizar sabor: ${error.message}`);
        this._loading$.next(false);
        this.showError('Error al actualizar sabor');
        throw error;
      })
    );
  }

  /**
   * Eliminar sabor y sus dependencias
   */
  eliminarSabor(saborId: number): Observable<{ success: boolean; mensaje: string }> {
    this._loading$.next(true);
    this._error$.next(null);

    return this.repositoryService.deleteSabor(saborId).pipe(
      tap(result => {
        if (result.success) {
          console.log('✅ Sabor eliminado:', result.mensaje);

          // Remover de lista local
          const saboresActuales = this._sabores$.value;
          const saboresFiltrados = saboresActuales.filter(s => s.id !== saborId);
          this._sabores$.next(saboresFiltrados);

          this._loading$.next(false);
          this.showSuccess(result.mensaje);
        }
      }),
      catchError(error => {
        console.error('❌ Error eliminando sabor:', error);
        this._error$.next(`Error al eliminar sabor: ${error.message}`);
        this._loading$.next(false);
        this.showError('Error al eliminar sabor');
        throw error;
      })
    );
  }

  // ✅ GESTIÓN DE VARIACIONES

  /**
   * Cargar variaciones de un producto específico
   */
  cargarVariacionesByProducto(productoId: number): Observable<RecetaPresentacion[]> {
    console.log('[SaboresVariacionesService] cargarVariacionesByProducto', { productoId });
    this._loading$.next(true);
    this._error$.next(null);

    return this.repositoryService.getVariacionesByProducto(productoId).pipe(
      tap(variaciones => {
        console.log('[SaboresVariacionesService] variaciones loaded', { productoId, count: variaciones.length });
        this._variaciones$.next(variaciones);
        this._loading$.next(false);
      }),
      catchError(error => {
        console.error('❌ Error cargando variaciones:', error);
        this._error$.next(`Error al cargar variaciones: ${error.message}`);
        this._loading$.next(false);
        this.showError('Error al cargar variaciones');
        throw error;
      })
    );
  }

  /**
   * Cargar variaciones de una receta específica
   */
  cargarVariacionesByReceta(recetaId: number): Observable<RecetaPresentacion[]> {
    return this.repositoryService.getVariacionesByReceta(recetaId).pipe(
      tap(variaciones => {
        console.log(`✅ Variaciones cargadas para receta ${recetaId}:`, variaciones.length);
      }),
      catchError(error => {
        console.error('❌ Error cargando variaciones por receta:', error);
        this.showError('Error al cargar variaciones de la receta');
        throw error;
      })
    );
  }

  /**
   * Actualizar precios masivamente
   */
  actualizarPreciosVariaciones(updates: Array<{
    variacionId: number;
    precio_ajuste?: number;
    activo?: boolean;
  }>): Observable<{ success: boolean; actualizadas: number }> {

    this._loading$.next(true);

    return this.repositoryService.bulkUpdateVariaciones(updates).pipe(
      tap(result => {
        console.log(`✅ Actualización masiva: ${result.actualizadas} variaciones`);
        this._loading$.next(false);
        this.showSuccess(`${result.actualizadas} variaciones actualizadas`);

        // Recargar variaciones si están cargadas
        const variacionesActuales = this._variaciones$.value;
        if (variacionesActuales.length > 0) {
          // Trigger reload based on first variation's product
          // This could be improved with better state management
        }
      }),
      catchError(error => {
        console.error('❌ Error en actualización masiva:', error);
        this._loading$.next(false);
        this.showError('Error en actualización masiva');
        throw error;
      })
    );
  }

  /**
   * Alias genérico para actualizaciones masivas (estado/precio)
   */
  actualizarVariacionesMasivo(updates: Array<{ variacionId: number; precio_ajuste?: number; activo?: boolean; }>): Observable<{ success: boolean; actualizadas: number }> {
    return this.repositoryService.bulkUpdateVariaciones(updates).pipe(
      tap(result => {
        this.showSuccess(`${result.actualizadas} variaciones actualizadas`);
      }),
      catchError(error => {
        this.showError('Error actualizando variaciones');
        throw error;
      })
    );
  }

  /**
   * Recalcular costo de una variación específica
   */
  recalcularCostoVariacion(variacionId: number): Observable<any> {
    return this.repositoryService.recalcularCostoVariacion(variacionId).pipe(
      tap(result => {
        console.log(`✅ Costo recalculado: ${result.mensaje}`);
        this.showSuccess(result.mensaje);

        // Actualizar en lista local si está cargada
        const variacionesActuales = this._variaciones$.value;
        const index = variacionesActuales.findIndex(v => v.id === variacionId);
        if (index >= 0) {
          variacionesActuales[index].costo_calculado = result.costoNuevo;
          this._variaciones$.next([...variacionesActuales]);
        }
      }),
      catchError(error => {
        console.error('❌ Error recalculando costo:', error);
        this.showError('Error al recalcular costo');
        throw error;
      })
    );
  }

  /**
   * Recalcular costos masivo
   */
  recalcularCostosMasivo(variacionIds: number[]): Observable<Array<{ success: boolean; costoAnterior: number; costoNuevo: number }>> {
    const tareas = variacionIds.map(id => this.repositoryService.recalcularCostoVariacion(id));
    return forkJoin(tareas).pipe(
      tap(() => this.showSuccess('Costos recalculados')),
      catchError(error => {
        this.showError('Error recalculando costos');
        throw error;
      })
    );
  }



  /**
   * Generar variaciones faltantes automáticamente
   */
  generarVariacionesFaltantes(productoId: number): Observable<{
    success: boolean;
    variacionesGeneradas: number;
    variaciones: RecetaPresentacion[];
  }> {

    this._loading$.next(true);

    return this.repositoryService.generateVariacionesFaltantes(productoId).pipe(
      tap(result => {
        console.log(`✅ Generadas ${result.variacionesGeneradas} variaciones faltantes`);
        this._loading$.next(false);

        if (result.variacionesGeneradas > 0) {
          this.showSuccess(`${result.variacionesGeneradas} variaciones generadas automáticamente`);

          // Actualizar lista local
          const variacionesActuales = this._variaciones$.value;
          this._variaciones$.next([...variacionesActuales, ...result.variaciones]);
        } else {
          this.showInfo('No hay variaciones faltantes para generar');
        }
      }),
      catchError(error => {
        console.error('❌ Error generando variaciones:', error);
        this._loading$.next(false);
        this.showError('Error al generar variaciones automáticas');
        throw error;
      })
    );
  }

  // ✅ ESTADÍSTICAS Y UTILIDADES

  /**
   * Cargar estadísticas de sabores para un producto
   */
  cargarEstadisticas(productoId: number): Observable<EstadisticasSabores> {
    console.log('[SaboresVariacionesService] cargarEstadisticas', { productoId });
    return this.repositoryService.getSaboresEstadisticas(productoId).pipe(
      tap(estadisticas => {
        console.log('[SaboresVariacionesService] estadisticas loaded', { productoId, estadisticas });
        this._estadisticas$.next(estadisticas);
      }),
      catchError(error => {
        console.error('❌ Error cargando estadísticas:', error);
        this.showError('Error al cargar estadísticas');
        throw error;
      })
    );
  }

  /**
   * Obtener datos completos de un producto (sabores + variaciones + estadísticas)
   */
  cargarDatosCompletos(productoId: number): Observable<{
    sabores: Sabor[];
    variaciones: RecetaPresentacion[];
    estadisticas: EstadisticasSabores;
  }> {

    this._loading$.next(true);

    return combineLatest([
      this.cargarSaboresByProducto(productoId),
      this.cargarVariacionesByProducto(productoId),
      this.cargarEstadisticas(productoId)
    ]).pipe(
      map(([sabores, variaciones, estadisticas]) => ({
        sabores,
        variaciones,
        estadisticas
      })),
      tap(() => {
        this._loading$.next(false);
        console.log('✅ Datos completos cargados para producto', productoId);
      }),
      catchError(error => {
        this._loading$.next(false);
        console.error('❌ Error cargando datos completos:', error);
        this.showError('Error al cargar datos del producto');
        throw error;
      })
    );
  }

  /**
   * ✅ NUEVO: Cargar sabores con variaciones agrupadas por sabor
   */
  cargarSaboresConVariaciones(productoId: number): Observable<{
    sabores: Sabor[];
    estadisticas: EstadisticasSabores;
  }> {

    this._loading$.next(true);

    return combineLatest([
      this.cargarSaboresByProducto(productoId),
      this.cargarVariacionesByProducto(productoId),
      this.cargarEstadisticas(productoId)
    ]).pipe(
            map(([sabores, variaciones, estadisticas]) => {
        // Agrupar variaciones por sabor
        const saboresConVariaciones = sabores.map(sabor => {
          // Buscar variaciones que pertenecen a este sabor
          const variacionesDelSabor = variaciones.filter(variacion =>
            variacion.sabor?.id === sabor.id
          );

          return {
            ...sabor,
            variaciones: variacionesDelSabor
          };
        });

        return {
          sabores: saboresConVariaciones,
          estadisticas
        };
      }),
      tap(() => {
        this._loading$.next(false);
        console.log('✅ Sabores con variaciones agrupadas cargados para producto', productoId);
      }),
      catchError(error => {
        this._loading$.next(false);
        console.error('❌ Error cargando sabores con variaciones:', error);
        this.showError('Error al cargar sabores con variaciones');
        throw error;
      })
    );
  }

  /**
   * ✅ NUEVO: Actualizar una variación específica
   */
  actualizarVariacion(variacionId: number, datos: Partial<RecetaPresentacion>): Observable<RecetaPresentacion> {
    this._loading$.next(true);
    this._error$.next(null);

    return this.repositoryService.updateRecetaPresentacion(variacionId, datos).pipe(
      tap(variacionActualizada => {
        console.log('✅ Variación actualizada:', variacionActualizada.nombre_generado);

        // Actualizar en lista local de variaciones
        const variacionesActuales = this._variaciones$.value;
        const index = variacionesActuales.findIndex(v => v.id === variacionId);
        if (index >= 0) {
          variacionesActuales[index] = variacionActualizada;
          this._variaciones$.next([...variacionesActuales]);
        }

        this._loading$.next(false);
        this.showSuccess('Variación actualizada correctamente');
      }),
      catchError(error => {
        console.error('❌ Error actualizando variación:', error);
        this._error$.next(`Error al actualizar variación: ${error.message}`);
        this._loading$.next(false);
        this.showError('Error al actualizar variación');
        throw error;
      })
    );
  }

  /**
   * ✅ NUEVO: Eliminar una variación específica
   */
  eliminarVariacion(variacionId: number): Observable<{ success: boolean; mensaje: string }> {
    this._loading$.next(true);
    this._error$.next(null);

    return this.repositoryService.deleteRecetaPresentacion(variacionId).pipe(
      tap(result => {
        if (result.success) {
          console.log('✅ Variación eliminada:', result.mensaje);

          // Remover de lista local
          const variacionesActuales = this._variaciones$.value;
          const variacionesFiltradas = variacionesActuales.filter(v => v.id !== variacionId);
          this._variaciones$.next(variacionesFiltradas);

          this._loading$.next(false);
          this.showSuccess(result.mensaje);
        }
      }),
      catchError(error => {
        console.error('❌ Error eliminando variación:', error);
        this._error$.next(`Error al eliminar variación: ${error.message}`);
        this._loading$.next(false);
        this.showError('Error al eliminar variación');
        throw error;
      })
    );
  }

  /**
   * Limpiar estado del servicio
   */
  limpiarEstado(): void {
    this._sabores$.next([]);
    this._variaciones$.next([]);
    this._estadisticas$.next({
      totalSabores: 0,
      saboresActivos: 0,
      totalRecetas: 0,
      totalVariaciones: 0
    });
    this._error$.next(null);
    this._loading$.next(false);
  }

  /**
   * Obtener resumen actual del estado
   */
  obtenerResumenEstado(): {
    sabores: number;
    variaciones: number;
    loading: boolean;
    hasError: boolean;
  } {
    return {
      sabores: this._sabores$.value.length,
      variaciones: this._variaciones$.value.length,
      loading: this._loading$.value,
      hasError: !!this._error$.value
    };
  }

  /**
   * ✅ NUEVO: Agregar un ingrediente a múltiples variaciones (recetas) a la vez.
   */
  agregarIngredienteMultiplesVariaciones(
    ingredienteOriginal: RecetaIngrediente,
    nuevosIngredientes: Array<{ variacionId: number; cantidad: number }>
  ): Observable<RecetaIngrediente[]> {
    this._loading$.next(true);

    // 1. Obtener los IDs de las recetas para las variaciones seleccionadas
    const variacionIds = nuevosIngredientes.map(i => i.variacionId);
    return this.repositoryService.getRecetasIdsPorVariacionIds(variacionIds).pipe(
      switchMap((mapeoRecetas: { [variacionId: number]: number }) => {
        // 2. Crear un array de observables para las operaciones de creación
        const operacionesCreacion = nuevosIngredientes.map((nuevoIngrediente: { variacionId: number; cantidad: number }) => {
          const recetaId = mapeoRecetas[nuevoIngrediente.variacionId];
          if (!recetaId) {
            // Si no se encuentra una receta, se omite o se maneja el error
            console.warn(`No se encontró receta para la variación ${nuevoIngrediente.variacionId}`);
            return of(null as any); // Retorna un observable nulo que se completa inmediatamente
          }

          // 3. Preparar los datos para el nuevo ingrediente
          // ✅ CORREGIDO: Usar la unidad original en lugar de la convertida
          const unidadParaGuardar = ingredienteOriginal.unidadOriginal || ingredienteOriginal.unidad;
          const datosNuevoIngrediente: Partial<RecetaIngrediente> = {
            receta: { id: recetaId } as any, // Cast temporal para compatibilidad
            ingrediente: { id: ingredienteOriginal.ingrediente?.id } as any, // Cast temporal para compatibilidad
            cantidad: nuevoIngrediente.cantidad,
            unidad: unidadParaGuardar, // ✅ Usar unidad original
            unidadOriginal: ingredienteOriginal.unidadOriginal, // ✅ Mantener unidad original
            costoUnitario: ingredienteOriginal.costoUnitario,
            costoTotal: nuevoIngrediente.cantidad * (ingredienteOriginal.costoUnitario || 0)
          };

          // ✅ DEBUG: Log de los datos que se van a enviar
          console.log(`🔍 [agregarIngredienteMultiplesVariaciones] Datos para variación ${nuevoIngrediente.variacionId}:`, {
            recetaId,
            ingredienteId: ingredienteOriginal.ingrediente?.id,
            cantidad: nuevoIngrediente.cantidad,
            unidad: unidadParaGuardar, // ✅ Unidad que se va a guardar
            unidadOriginal: ingredienteOriginal.unidadOriginal, // ✅ Unidad original
            unidadOriginalIngrediente: ingredienteOriginal.unidad, // ✅ Unidad del ingrediente original (convertida)
            costoUnitario: ingredienteOriginal.costoUnitario
          });

          return this.repositoryService.createRecetaIngrediente(datosNuevoIngrediente);
        });

        // Filtrar observables nulos antes de ejecutar
        const operacionesValidas = operacionesCreacion.filter((op): op is Observable<RecetaIngrediente> => op !== null);
        if (operacionesValidas.length === 0) {
          return of([] as RecetaIngrediente[]); // No hay operaciones válidas
        }

        // 4. Ejecutar todas las operaciones en paralelo
        return forkJoin(operacionesValidas);
      }),
      tap((resultados: RecetaIngrediente[]) => {
        this._loading$.next(false);
        this.showSuccess(`${resultados.length} ingredientes agregados a otras variaciones`);
        console.log('✅ Ingredientes agregados en múltiples variaciones:', resultados);
      }),
      catchError((error: any) => {
        this._loading$.next(false);
        this.showError('Error al agregar ingredientes a otras variaciones');
        console.error('❌ Error en agregarIngredienteMultiplesVariaciones:', error);
        throw error;
      })
    );
  }

  // ✅ MÉTODOS AUXILIARES PARA UI

  /**
   * ✅ NUEVO: Calcular costo total de una receta desde precio_costo
   */
  calcularCostoTotalReceta(receta: any): number {
    if (!receta?.preciosCosto || !Array.isArray(receta.preciosCosto)) {
      return 0;
    }

    // Sumar solo los costos activos
    return receta.preciosCosto
      .filter((precio: any) => precio.activo)
      .reduce((total: number, precio: any) => total + precio.valor, 0);
  }

  /**
   * ✅ NUEVO: Calcular costo total de una variación
   */
  calcularCostoTotalVariacion(variacion: RecetaPresentacion): number {
    if (!variacion.receta) {
      return variacion.costo_calculado || 0;
    }

    // Usar el costo calculado desde precio_costo si está disponible
    const costoDesdePrecioCosto = this.calcularCostoTotalReceta(variacion.receta);

    // Si no hay precio_costo, usar el costo_calculado existente
    return costoDesdePrecioCosto > 0 ? costoDesdePrecioCosto : (variacion.costo_calculado || 0);
  }

  /**
   * ✅ NUEVO: Eliminar un ingrediente de múltiples variaciones (recetas) a la vez.
   */
  eliminarIngredienteMultiplesVariaciones(
    recetaIngredienteId: number,
    eliminarDeOtrasVariaciones: boolean
  ): Observable<any> {
    this._loading$.next(true);

    return this.repositoryService.deleteRecetaIngredienteMultiplesVariaciones({
      recetaIngredienteId,
      eliminarDeOtrasVariaciones
    }).pipe(
      tap((resultado: any) => {
        this._loading$.next(false);
                   if (eliminarDeOtrasVariaciones) {
             this.showSuccess(`Ingrediente eliminado permanentemente de ${resultado.eliminadas} variaciones del mismo sabor`);
           } else {
             this.showSuccess('Ingrediente eliminado permanentemente de la variación actual');
           }
        console.log('✅ Ingrediente eliminado de múltiples variaciones:', resultado);
      }),
      catchError((error: any) => {
        this._loading$.next(false);
        this.showError('Error al eliminar ingrediente de variaciones');
        console.error('❌ Error en eliminarIngredienteMultiplesVariaciones:', error);
        throw error;
      })
    );
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: ['snackbar-success']
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: ['snackbar-error']
    });
  }

  private showInfo(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: ['snackbar-info']
    });
  }
}
