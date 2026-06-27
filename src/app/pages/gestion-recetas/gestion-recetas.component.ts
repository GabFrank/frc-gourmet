import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TabsService } from '../../services/tabs.service';
import { RepositoryService } from '../../database/repository.service';
import { Receta } from '../../database/entities/productos/receta.entity';
import { RecetaIngrediente } from '../../database/entities/productos/receta-ingrediente.entity';
import { Producto } from '../../database/entities/productos/producto.entity';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from '../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { IngredienteDialogComponent } from './dialogs/ingrediente-dialog/ingrediente-dialog.component';
import { VincularRecetaAdicionalDialogComponent } from './dialogs/vincular-receta-adicional-dialog/vincular-receta-adicional-dialog.component';
import { RecetasService } from '../../services/recetas.service';
import { Adicional } from '../../database/entities/productos/adicional.entity';
import { RecetaAdicionalVinculacion } from '../../database/entities/productos/receta-adicional-vinculacion.entity';
import { ConfirmarAgregarIngredienteDialogComponent } from './dialogs/confirmar-agregar-ingrediente-dialog/confirmar-agregar-ingrediente-dialog.component';
import { GestionarIngredienteMultiVariacionDialogComponent } from './dialogs/gestionar-ingrediente-multi-variacion-dialog/gestionar-ingrediente-multi-variacion-dialog.component';
import { SaboresVariacionesService } from '../../services/sabores-variaciones.service';
import { EliminarIngredienteService } from '../../services/eliminar-ingrediente.service';

@Component({
  selector: 'app-gestion-recetas',
  templateUrl: './gestion-recetas.component.html',
  styleUrls: ['./gestion-recetas.component.scss']
})
export class GestionRecetasComponent implements OnInit {

  recetaForm!: FormGroup;
  receta: Receta | null = null;
  loading = false;
  isEditMode = false;
  mode: 'create' | 'edit' = 'create';
  recetaId?: number;
  tabData: any = {};

  // ✅ NUEVO: Propiedades para el contexto de variación
  esRecetaDeVariacion = false;
  productoId?: number;
  saborId?: number;
  variacionId?: number;

  // Propiedades para ingredientes
  ingredientes: RecetaIngrediente[] = [];
  ingredientesLoading = false;
  ingredientesDataSource: RecetaIngrediente[] = [];

  // Propiedades computadas para mostrar en tabla
  ingredientesParaMostrar: Array<{
    ingrediente: RecetaIngrediente;
    cantidadParaMostrar: number;
    unidadParaMostrar: string;
  }> = [];

  // Propiedades computadas para performance
  costoTotalReceta = 0;
  margenGanancia = 30; // 30% por defecto
  precioSugerido = 0;

  // Estados visuales
  hayIngredientes = false;
  ingredientesVacios = true;

  // Propiedades para adicionales
  adicionales: RecetaAdicionalVinculacion[] = [];
  adicionalesLoading = false;

  // Filtros para backend
  // ✅ ACTUALIZADO: Incluye todos los tipos de productos que pueden ser ingredientes
  // - RETAIL_INGREDIENTE: Ingredientes básicos (harina, aceite, etc.)
  // - ELABORADO_SIN_VARIACION: Productos elaborados simples (salsas, bases)
  // - ELABORADO_CON_VARIACION: Productos elaborados con variaciones (pizzas, hamburguesas)
  filtroIngredientes = {
    activo: true,
    esIngrediente: true,
    tipo: ['RETAIL_INGREDIENTE', 'ELABORADO_SIN_VARIACION', 'ELABORADO_CON_VARIACION']
  };

  // ✅ NUEVO: Propiedades para gestión de costos
  recetas: Receta[] = [];
  estadisticasCostos: any = null;

  constructor(
    private fb: FormBuilder,
    private tabsService: TabsService,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private recetasService: RecetasService,
    private saboresVariacionesService: SaboresVariacionesService,
    private eliminarIngredienteService: EliminarIngredienteService
  ) {}

  ngOnInit(): void {
    this.initForm();

    // Check if we already have tabData (from setData)
    if (this.tabData && Object.keys(this.tabData).length > 0) {
      this.checkMode();
    }

    // ✅ NUEVO: Cargar datos adicionales
    this.cargarRecetas();
    this.cargarEstadisticasCostos();
  }

  // Method used by the tab service to set data
  setData(data: any): void {
    console.log('Setting data for GestionRecetasComponent:', data);
    this.tabData = data;

    // ✅ NUEVO: Capturar el contexto de variación
    if (data.contexto === 'variacion') {
      this.esRecetaDeVariacion = true;
      this.productoId = data.productoId;
      this.saborId = data.saborId;
      this.variacionId = data.variacionId;
      console.log('Contexto de variación detectado:', {
        productoId: this.productoId,
        saborId: this.saborId,
        variacionId: this.variacionId,
      });
    } else {
      this.esRecetaDeVariacion = false;
    }

    // Ensure form is initialized before checking mode
    if (this.recetaForm) {
      this.checkMode();
    } else {
      // If form is not ready, check mode after initialization
      setTimeout(() => {
        this.checkMode();
      }, 0);
    }
  }

  // ✅ NUEVO: Unidades disponibles para el rendimiento de la receta
  unidadesDisponibles = [
    { valor: 'UNIDADES', texto: 'Unidades (un)' },
    { valor: 'GRAMOS', texto: 'Gramos (g)' },
    { valor: 'KILOGRAMOS', texto: 'Kilogramos (kg)' },
    { valor: 'MILILITROS', texto: 'Mililitros (ml)' },
    { valor: 'LITROS', texto: 'Litros (l)' },
    { valor: 'PAQUETES', texto: 'Paquetes (pkg)' }
  ];

  initForm(): void {
    this.recetaForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3)]],
      descripcion: [''],
      rendimiento: [1, [Validators.required, Validators.min(0.01)]],
      unidadRendimiento: ['UNIDADES', [Validators.required]],
      activo: [true]
    });
  }

  checkMode(): void {
    if (this.tabData && this.tabData.recetaId) {
      this.mode = 'edit';
      this.isEditMode = true;
      this.recetaId = this.tabData.recetaId;
      if (typeof this.recetaId === 'number') {
        this.loadReceta(this.recetaId);
      }
    } else {
      this.mode = 'create';
      this.isEditMode = false;
      this.recetaId = undefined;
      // Limpiar el formulario para modo creación
      if (this.recetaForm) {
        this.recetaForm.reset({
          nombre: '',
          descripcion: '',
          rendimiento: 1,
          unidadRendimiento: 'UNIDADES',
          activo: true
        });
      }
    }
  }

  loadReceta(id: number): void {
    this.loading = true;
    this.repositoryService.getReceta(id).subscribe({
      next: (receta: Receta) => {
        this.receta = receta;
        this.recetaForm.patchValue({
          nombre: receta.nombre?.toUpperCase(),
          descripcion: receta.descripcion?.toUpperCase(),
          rendimiento: receta.rendimiento || 1,
          unidadRendimiento: receta.unidadRendimiento || 'UNIDADES',
          activo: receta.activo
        });

        // Cargar ingredientes y adicionales
        this.loadIngredientes();
        this.loadAdicionales();

        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading receta:', error);
        this.snackBar.open('Error al cargar la receta', 'Cerrar', { duration: 3000 });
        this.loading = false;
        // No cerrar la pestaña, permitir al usuario intentar de nuevo
      }
    });
  }

  // Métodos para gestión de ingredientes
  loadIngredientes(): void {
    if (!this.receta?.id) return;

    this.ingredientesLoading = true;
    this.repositoryService.getRecetaIngredientes(this.receta.id).subscribe({
      next: (ingredientes: RecetaIngrediente[]) => {
        this.ingredientes = ingredientes;
        this.ingredientesDataSource = ingredientes;
        this.updateIngredientesStates();
        // ✅ Usar el nuevo sistema de costos
        this.calcularCostos();
        this.ingredientesLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading ingredientes:', error);
        this.snackBar.open('Error al cargar ingredientes', 'Cerrar', { duration: 3000 });
        this.ingredientesLoading = false;
      }
    });
  }

  loadAdicionales(): void {
    if (!this.receta?.id) return;

    this.adicionalesLoading = true;
    this.repositoryService.getRecetaAdicionalVinculaciones(this.receta.id).subscribe({
      next: (adicionales: RecetaAdicionalVinculacion[]) => {
        this.adicionales = adicionales;
        this.adicionalesLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading adicionales:', error);
        this.snackBar.open('Error al cargar adicionales', 'Cerrar', { duration: 3000 });
        this.adicionalesLoading = false;
      }
    });
  }

  addIngrediente(): void {
    const dialogRef = this.dialog.open(IngredienteDialogComponent, {
      width: '600px',
      data: {
        recetaId: this.receta?.id,
        existingIngredientes: this.ingredientes,
        filtroIngredientes: this.filtroIngredientes
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.crearIngrediente(result);
      }
    });
  }

  editIngrediente(ingrediente: RecetaIngrediente): void {
    const dialogRef = this.dialog.open(IngredienteDialogComponent, {
      width: '600px',
      data: {
        recetaId: this.receta?.id,
        ingrediente: ingrediente,
        existingIngredientes: this.ingredientes,
        filtroIngredientes: this.filtroIngredientes
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.actualizarIngrediente(ingrediente.id!, result);
      }
    });
  }

  deleteIngrediente(ingrediente: RecetaIngrediente): void {
    // ✅ NUEVO: Usar el servicio de eliminación de múltiples variaciones
    this.eliminarIngredienteService.eliminarIngrediente(
      ingrediente.id!,
      ingrediente.ingrediente?.nombre || ingrediente.descripcion || 'Ingrediente',
      this.receta?.nombre || 'Receta',
      ingrediente.cantidad ?? 0,
      ingrediente.unidad || ''
    ).subscribe({
      next: (resultado) => {
        if (resultado.cancelado) {
          console.log('Usuario canceló la eliminación');
        } else {
          // ✅ Recargar ingredientes después de la eliminación
          this.loadIngredientes();
          this.snackBar.open('Ingrediente eliminado correctamente', 'Cerrar', { duration: 2000 });
        }
      },
      error: (error) => {
        console.error('Error al eliminar ingrediente:', error);
        this.snackBar.open('Error al eliminar ingrediente', 'Cerrar', { duration: 3000 });
      }
    });
  }

  vincularAdicionales(): void {
    if (!this.receta) {
      this.snackBar.open('Debe guardar la receta antes de vincular adicionales', 'Cerrar', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(VincularRecetaAdicionalDialogComponent, {
      width: '700px',
      data: {
        receta: this.receta
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Recargar adicionales después de vincular
        this.loadAdicionales();
        this.snackBar.open('Adicional vinculado correctamente', 'Cerrar', { duration: 2000 });
      }
    });
  }

  private crearIngrediente(ingredienteData: any): void {
    this.ingredientesLoading = true;
    this.repositoryService.createRecetaIngrediente(ingredienteData).subscribe({
      next: (nuevoIngrediente: RecetaIngrediente) => {
        this.ingredientes.push(nuevoIngrediente);
        this.ingredientesDataSource = [...this.ingredientes];
        this.updateIngredientesStates();
        // ✅ Recalcular costo automáticamente después de agregar ingrediente
        this.recalcularCostoReceta();
        this.ingredientesLoading = false;
        this.snackBar.open('Ingrediente agregado correctamente', 'Cerrar', { duration: 2000 });

        // ✅ INICIO: Flujo del asistente de ingredientes
        if (this.esRecetaDeVariacion) {
          this.iniciarFlujoAsistenteIngredientes(nuevoIngrediente);
        }
        // ✅ FIN: Flujo del asistente de ingredientes

      },
      error: (error: any) => {
        console.error('Error creating ingrediente:', error);
        this.snackBar.open('Error al agregar ingrediente', 'Cerrar', { duration: 3000 });
        this.ingredientesLoading = false;
      }
    });
  }

  // ✅ NUEVO: Métodos para el asistente de ingredientes
  private iniciarFlujoAsistenteIngredientes(ingredienteAgregado: RecetaIngrediente): void {
    const dialogRef = this.dialog.open(ConfirmarAgregarIngredienteDialogComponent, {
      width: '500px',
      data: {
        nombreIngrediente: ingredienteAgregado.ingrediente?.nombre || ingredienteAgregado.descripcion || ''
      }
    });

    dialogRef.afterClosed().subscribe(confirmado => {
      if (confirmado) {
        this.abrirDialogoGestionMultiVariacion(ingredienteAgregado);
      }
    });
  }

  private abrirDialogoGestionMultiVariacion(ingredienteOriginal: RecetaIngrediente): void {
    if (!this.productoId || !this.saborId) return;

    // 1. Buscar las otras variaciones del mismo sabor
    this.repositoryService.getVariacionesByProducto(this.productoId).subscribe({
      next: (todasLasVariaciones) => {
        const variacionesDelSabor = todasLasVariaciones.filter(v => v.sabor?.id === this.saborId && v.id !== this.variacionId);

        if (variacionesDelSabor.length === 0) {
          this.snackBar.open('No hay otras variaciones en este sabor.', 'Cerrar', { duration: 3000 });
          return;
        }

        // 2. Abrir el diálogo de gestión
        // ✅ CORREGIDO: Pasar la información original para mostrar correctamente
        const cantidadOriginal = ingredienteOriginal.unidadOriginal && ingredienteOriginal.unidadOriginal !== ingredienteOriginal.unidad
          ? this.convertirCantidadParaMostrar(ingredienteOriginal.cantidad ?? 0, ingredienteOriginal.unidad || '', ingredienteOriginal.unidadOriginal)
          : (ingredienteOriginal.cantidad ?? 0);

        const dialogRef = this.dialog.open(GestionarIngredienteMultiVariacionDialogComponent, {
          width: '700px',
          data: {
            nombreIngrediente: ingredienteOriginal.ingrediente?.nombre || ingredienteOriginal.descripcion || '',
            unidadIngrediente: ingredienteOriginal.unidad,
            variaciones: variacionesDelSabor,
            ingredienteOriginal: ingredienteOriginal,
            // ✅ NUEVO: Información para mostrar correctamente
            cantidadOriginal: cantidadOriginal,
            unidadOriginal: ingredienteOriginal.unidadOriginal || ingredienteOriginal.unidad
          }
        });

        dialogRef.afterClosed().subscribe(resultado => {
          if (resultado && resultado.length > 0) {
            // 3. Llamar al servicio para guardar los nuevos ingredientes
            this.saboresVariacionesService.agregarIngredienteMultiplesVariaciones(ingredienteOriginal, resultado)
              .subscribe({
                next: () => {
                  // Opcional: Recargar datos o mostrar un mensaje más detallado.
                },
                error: (err) => {
                  console.error('Error en el flujo de asistente de ingredientes:', err);
                }
              });
          }
        });
      },
      error: (error) => {
        console.error('Error obteniendo variaciones:', error);
        this.snackBar.open('Error al obtener las variaciones del producto', 'Cerrar', { duration: 3000 });
      }
    });
  }

  private actualizarIngrediente(id: number, ingredienteData: any): void {
    this.ingredientesLoading = true;
    this.repositoryService.updateRecetaIngrediente(id, ingredienteData).subscribe({
      next: (ingredienteActualizado: RecetaIngrediente) => {
        const index = this.ingredientes.findIndex(i => i.id === id);
        if (index !== -1) {
          this.ingredientes[index] = ingredienteActualizado;
          this.ingredientesDataSource = [...this.ingredientes];
          this.updateIngredientesStates();
          // ✅ Recalcular costo automáticamente después de actualizar ingrediente
          this.recalcularCostoReceta();
        }
        this.ingredientesLoading = false;
        this.snackBar.open('Ingrediente actualizado correctamente', 'Cerrar', { duration: 2000 });
      },
      error: (error: any) => {
        console.error('Error updating ingrediente:', error);
        this.snackBar.open('Error al actualizar ingrediente', 'Cerrar', { duration: 3000 });
        this.ingredientesLoading = false;
      }
    });
  }

  // ✅ ACTUALIZADO: Método privado para eliminación directa (usado internamente)
  private eliminarIngrediente(id: number): void {
    this.ingredientesLoading = true;
    this.repositoryService.deleteRecetaIngrediente(id).subscribe({
      next: () => {
        this.ingredientes = this.ingredientes.filter(i => i.id !== id);
        this.ingredientesDataSource = [...this.ingredientes];
        this.updateIngredientesStates();
        // ✅ Recalcular costo automáticamente después de eliminar ingrediente
        this.recalcularCostoReceta();
        this.ingredientesLoading = false;
        this.snackBar.open('Ingrediente eliminado correctamente', 'Cerrar', { duration: 2000 });
      },
      error: (error: any) => {
        console.error('Error deleting ingrediente:', error);
        this.snackBar.open('Error al eliminar ingrediente', 'Cerrar', { duration: 3000 });
        this.ingredientesLoading = false;
      }
    });
  }

  // Métodos de cálculo (propiedades computadas para performance)
  private calcularCostos(): void {
    // ✅ Usar costoCalculado de la receta si está disponible
    if (this.receta && this.receta.costoCalculado !== undefined) {
      this.costoTotalReceta = this.receta.costoCalculado;
    } else {
      // Fallback al cálculo local si no está disponible
    this.costoTotalReceta = this.ingredientes.reduce((total, ingrediente) => {
      return total + (ingrediente.costoTotal || 0);
    }, 0);
    }

    this.precioSugerido = this.costoTotalReceta / 0.35;
  }

  // ✅ Nuevo método para recalcular costo de la receta actual
  private recalcularCostoReceta(): void {
    if (!this.receta?.id) return;

    this.repositoryService.recalculateRecipeCost(this.receta.id).subscribe({
      next: (result) => {
        if (result.success) {
          // Actualizar el costo en la receta local
          if (this.receta) {
            this.receta.costoCalculado = result.costoCalculado;
          }
          this.calcularCostos();
          this.snackBar.open('Costo de receta recalculado', 'Cerrar', { duration: 2000 });
        }
      },
      error: (error) => {
        console.error('Error recalculating recipe cost:', error);
        this.snackBar.open('Error al recalcular costo', 'Cerrar', { duration: 3000 });
      }
    });
  }

  // ✅ NUEVO: Cargar recetas para gestión de costos
  cargarRecetas(): void {
    this.loading = true;
    // Usar el repository service para obtener las entidades correctas
    this.repositoryService.getRecetas().subscribe({
      next: (recetas) => {
        this.recetas = recetas;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando recetas:', error);
        this.mostrarMensaje('Error al cargar las recetas', 'error');
        this.loading = false;
      }
    });
  }

  // ✅ NUEVO: Cargar estadísticas de costos
  async cargarEstadisticasCostos(): Promise<void> {
    try {
      this.estadisticasCostos = await this.recetasService.getEstadisticasCostos();
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  }

  // ✅ NUEVO: Recalcular costo de una receta específica usando el servicio
  async recalcularCostoRecetaServicio(receta: Receta): Promise<void> {
    if (!receta.id) return;

    try {
      this.loading = true;
      const resultado = await this.recetasService.recalcularCostoReceta(receta.id);

      if (resultado.success) {
        // Actualizar el costo en la lista local
        receta.costoCalculado = resultado.costoCalculado;
        this.mostrarMensaje(`Costo recalculado: $${resultado.costoCalculado.toFixed(2)}`, 'success');
      }
    } catch (error) {
      console.error('Error recalculando costo:', error);
      this.mostrarMensaje('Error al recalcular el costo', 'error');
    } finally {
      this.loading = false;
    }
  }

  // ✅ NUEVO: Recalcular todos los costos
  async recalcularTodosLosCostos(): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'RECALCULAR TODOS LOS COSTOS',
        message: '¿Está seguro de que desea recalcular el costo de todas las recetas? Esta operación puede tomar varios minutos.',
        confirmText: 'RECALCULAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          this.loading = true;
          const resultados = await this.recetasService.recalcularTodosLosCostos();

          // Contar resultados
          const actualizados = resultados.filter(r => r.updated).length;
          const errores = resultados.filter(r => r.error).length;

          this.mostrarMensaje(
            `Recálculo completado: ${actualizados} actualizados, ${errores} errores`,
            errores > 0 ? 'warning' : 'success'
          );

          // Recargar datos
          this.cargarRecetas();
          this.cargarEstadisticasCostos();
        } catch (error) {
          console.error('Error recalculando todos los costos:', error);
          this.mostrarMensaje('Error al recalcular los costos', 'error');
        } finally {
          this.loading = false;
        }
      }
    });
  }

  // ✅ NUEVO: Verificar si una receta necesita recálculo
  async verificarNecesidadRecalculo(receta: Receta): Promise<{ necesitaRecalculo: boolean; motivo?: string }> {
    if (!receta.id) return { necesitaRecalculo: false };

    try {
      return await this.recetasService.verificarNecesidadRecalculo(receta.id);
    } catch (error) {
      console.error('Error verificando necesidad de recálculo:', error);
      return { necesitaRecalculo: false };
    }
  }

  // ✅ NUEVO: Mostrar historial de precios de costo
  async mostrarHistorialPreciosCosto(receta: Receta): Promise<void> {
    if (!receta.id) return;

    try {
      const historial = await this.recetasService.getHistorialPreciosCosto(receta.id);

      if (historial.length === 0) {
        this.mostrarMensaje('No hay historial de precios de costo para esta receta', 'info');
        return;
      }

      // Aquí podrías abrir un diálogo para mostrar el historial
      console.log('Historial de precios de costo:', historial);
      this.mostrarMensaje(`Historial cargado: ${historial.length} registros`, 'success');
    } catch (error) {
      console.error('Error cargando historial:', error);
      this.mostrarMensaje('Error al cargar el historial', 'error');
    }
  }

  // ✅ NUEVO: Obtener clase CSS para indicar si necesita recálculo
  async getClaseNecesitaRecalculo(receta: Receta): Promise<string> {
    const verificacion = await this.verificarNecesidadRecalculo(receta);
    return verificacion.necesitaRecalculo ? 'necesita-recalculo' : '';
  }

  // ✅ NUEVO: Método para convertir cantidad de vuelta a la unidad original para mostrar
  private convertirCantidadParaMostrar(cantidad: number, unidadGuardada: string, unidadOriginal: string): number {
    if (unidadGuardada === 'KILOGRAMOS' && unidadOriginal === 'GRAMOS') {
      return cantidad * 1000; // Convertir kg a g
    } else if (unidadGuardada === 'LITROS' && unidadOriginal === 'MILILITROS') {
      return cantidad * 1000; // Convertir L a ml
    }
    return cantidad; // Sin conversión
  }

  private mostrarMensaje(mensaje: string, tipo: 'success' | 'error' | 'warning' | 'info'): void {
    this.snackBar.open(mensaje, 'CERRAR', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: [`snackbar-${tipo}`]
    });
  }

  private updateIngredientesStates(): void {
    this.hayIngredientes = this.ingredientes.length > 0;
    this.ingredientesVacios = this.ingredientes.length === 0;

    // Calcular propiedades computadas para mostrar en tabla
    this.ingredientesParaMostrar = this.ingredientes.map(ingrediente => {
      let cantidadParaMostrar = ingrediente.cantidad || 0;
      let unidadParaMostrar = ingrediente.unidad || '';

      // Si hay conversión de unidades, convertir de vuelta para mostrar
      if (ingrediente.unidadOriginal && ingrediente.unidadOriginal !== ingrediente.unidad) {
        if (ingrediente.unidad === 'KILOGRAMOS' && ingrediente.unidadOriginal === 'GRAMOS') {
          cantidadParaMostrar = (ingrediente.cantidad || 0) * 1000;
          unidadParaMostrar = 'GRAMOS';
        } else if (ingrediente.unidad === 'LITROS' && ingrediente.unidadOriginal === 'MILILITROS') {
          cantidadParaMostrar = (ingrediente.cantidad || 0) * 1000;
          unidadParaMostrar = 'MILILITROS';
        }
      }

      return {
        ingrediente,
        cantidadParaMostrar,
        unidadParaMostrar
      };
    });
  }

  // Métodos para cálculos de ingredientes individuales
  calcularCostoIngrediente(ingrediente: RecetaIngrediente): number {
    // Usar el costo total calculado si está disponible, sino calcularlo
    if (ingrediente.costoTotal && ingrediente.costoTotal > 0) {
      return ingrediente.costoTotal;
    }
    return (ingrediente.cantidad || 0) * (ingrediente.costoUnitario || 0);
  }

  saveReceta(): void {
    if (this.recetaForm.valid) {
      this.loading = true;
      const recetaData = this.recetaForm.value;

      // Convertir strings a uppercase
      const normalizedData = {
        ...recetaData,
        nombre: recetaData.nombre?.toUpperCase(),
        descripcion: recetaData.descripcion?.toUpperCase(),
        rendimiento: recetaData.rendimiento,
        unidadRendimiento: recetaData.unidadRendimiento,
        unidadRendimientoOriginal: recetaData.unidadRendimiento
      };

      if (this.isEditMode && this.receta) {
        // Update existing receta
        const updatedReceta = { ...this.receta, ...normalizedData };
        this.repositoryService.updateReceta(this.receta.id!, updatedReceta).subscribe({
          next: () => {
            this.loading = false;
            this.snackBar.open('Receta actualizada correctamente', 'Cerrar', { duration: 2000 });
            // Ya no se cierra la pestaña automáticamente
          },
          error: (error: any) => {
            console.error('Error updating receta:', error);
            this.snackBar.open('Error al actualizar la receta', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        });
      } else {
        // Create new receta
        const newReceta: Partial<Receta> = {
          ...normalizedData,
          costoCalculado: this.costoTotalReceta
        };

        // ✅ NUEVO: Asociar con el producto plantilla si es una variación
        if (this.tabData && this.tabData.productoId) {
          newReceta.producto = { id: this.tabData.productoId } as Producto;
        }

        this.repositoryService.createReceta(newReceta).subscribe({
          next: (recetaCreada: Receta) => {
            this.receta = recetaCreada;
            this.isEditMode = true;
            this.mode = 'edit';
            this.recetaId = recetaCreada.id;

            // Vincular receta al producto si viene desde un producto
            if (this.tabData?.productoId && recetaCreada.id) {
              this.repositoryService.updateProducto(this.tabData.productoId, { recetaId: recetaCreada.id } as any).subscribe({
                next: () => {
                  console.log(`Receta ${recetaCreada.id} vinculada al producto ${this.tabData.productoId}`);
                },
                error: (err: any) => {
                  console.error('Error vinculando receta al producto:', err);
                }
              });
            }

            this.loading = false;
            this.snackBar.open('Receta creada correctamente', 'Cerrar', { duration: 2000 });
          },
          error: (error: any) => {
            console.error('Error creating receta:', error);
            this.snackBar.open('Error al crear la receta', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        });
      }
    }
  }

  cancel(): void {
    // Check if form has been modified
    if (this.recetaForm.dirty) {
      // Show confirmation dialog
      const confirmDialog = this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: {
          title: 'Confirmar Cancelación',
          message: '¿Estás seguro de que quieres cancelar? Los cambios no guardados se perderán.',
          confirmText: 'Sí, Cancelar',
          cancelText: 'No, Continuar Editando'
        }
      });

      confirmDialog.afterClosed().subscribe(result => {
        if (result) {
          this.closeTab();
        }
      });
    } else {
      // If form is not dirty, close directly
      this.closeTab();
    }
  }

  private closeTab(): void {
    // Mark form as pristine to avoid warnings
    if (this.recetaForm) {
      this.recetaForm.markAsPristine();
    }

    // Close current tab and return to list
    const currentTab = this.tabsService.currentTab();
    if (currentTab) {
      this.tabsService.removeTabById(currentTab.id);
    }
  }

  // Métodos para gestión de adicionales
  editAdicional(adicional: RecetaAdicionalVinculacion): void {
    // Abrir diálogo de edición de adicional
    const dialogRef = this.dialog.open(VincularRecetaAdicionalDialogComponent, {
      width: '700px',
      data: {
        receta: this.receta,
        adicional: adicional.adicional,
        precioActual: adicional.precioAdicional,
        cantidadActual: adicional.cantidad,
        unidadActual: adicional.unidad,
        activo: adicional.activo,
        modo: 'edit',
        vinculacionId: adicional.id // Pasar el ID de la vinculación
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Actualizar el adicional en la lista usando el servicio
        this.repositoryService.updateRecetaAdicionalVinculacion(result.vinculacionId, {
          precioAdicional: result.precioAdicional,
          cantidad: result.cantidad,
          unidad: result.unidad,
          activo: result.activo
        }).subscribe({
          next: (updatedAdicional) => {
            // ✅ ACTUALIZADO: Actualizar en la lista local con la entidad completa que viene del servicio
            const index = this.adicionales.findIndex(a => a.id === result.vinculacionId);
            if (index !== -1) {
              this.adicionales[index] = updatedAdicional;
              // ✅ NUEVO: Forzar detección de cambios para actualizar la vista
              this.adicionales = [...this.adicionales];
            }
            this.snackBar.open('Adicional actualizado correctamente', 'Cerrar', { duration: 2000 });
          },
          error: (error) => {
            console.error('Error updating adicional:', error);
            this.snackBar.open('Error al actualizar el adicional', 'Cerrar', { duration: 3000 });
          }
        });
      }
    });
  }

  deleteAdicional(adicional: RecetaAdicionalVinculacion): void {
    // Mostrar diálogo de confirmación
    const confirmDialog = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar Adicional',
        message: `¿Estás seguro de que quieres eliminar el adicional "${adicional.adicional.nombre}" de esta receta?`,
        confirmText: 'Sí, Eliminar',
        cancelText: 'Cancelar'
      }
    });

    confirmDialog.afterClosed().subscribe(result => {
      if (result) {
        // ✅ ACTUALIZADO: Eliminar físicamente el vínculo usando el servicio
        this.repositoryService.deleteRecetaAdicionalVinculacion(adicional.id!).subscribe({
          next: () => {
            // ✅ ACTUALIZADO: Remover de la lista local inmediatamente
            this.adicionales = this.adicionales.filter(a => a.id !== adicional.id);
            this.snackBar.open('Adicional eliminado correctamente', 'Cerrar', { duration: 2000 });
          },
          error: (error) => {
            console.error('Error deleting adicional:', error);
            this.snackBar.open('Error al eliminar el adicional', 'Cerrar', { duration: 3000 });
          }
        });
      }
    });
  }
}
