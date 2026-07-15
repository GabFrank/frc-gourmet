import { Component, Input, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { SelectionModel } from '@angular/cdk/collections';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { FormControl } from '@angular/forms';
import { SaboresVariacionesService, RecetaPresentacion, Sabor } from '../../../../../services/sabores-variaciones.service';
import { VariacionDialogComponent, VariacionDialogData } from '../../dialogs/variacion-dialog/variacion-dialog.component';
import { ConfirmationDialogComponent } from '../../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { TabsService } from '../../../../../services/tabs.service';
import { GestionRecetasComponent } from '../../../../../pages/gestion-recetas/gestion-recetas.component';

@Component({
  selector: 'app-producto-variaciones',
  templateUrl: './producto-variaciones.component.html',
  styleUrls: ['./producto-variaciones.component.scss']
})
export class ProductoVariacionesComponent implements OnInit, OnDestroy {

  @Input() productoId!: number;
  @Input() productoNombre!: string;
  @Input() productoTipo!: string;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // Data source y tabla
  dataSource = new MatTableDataSource<RecetaPresentacion>();
  selection = new SelectionModel<RecetaPresentacion>(true, []);

  displayedColumns: string[] = [
    'select',
    'nombre_generado',
    // 'sku', // removido para evitar overflow
    // 'receta_sabor',
    'presentacion',
    'costo_calculado',
    'precio_ajuste',
    'margen',
    'activo'
  ];

  // State
  variaciones: RecetaPresentacion[] = [];
  sabores: Sabor[] = [];
  loading = false;
  error: string | null = null;

  // Filtros y búsqueda
  searchControl = new FormControl('');
  filtroSabor = new FormControl('TODOS');
  filtroPresentacion = new FormControl('TODOS');
  filtroActivo = new FormControl('TODOS');

  // Opciones de filtros
  saboresDisponibles: Array<{ value: string; label: string }> = [{ value: 'TODOS', label: 'Todos los Sabores' }];
  presentacionesDisponibles: Array<{ value: string; label: string }> = [{ value: 'TODOS', label: 'Todas las Presentaciones' }];
  opcionesActivo = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'ACTIVO', label: 'Solo Activos' },
    { value: 'INACTIVO', label: 'Solo Inactivos' }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private saboresService: SaboresVariacionesService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService
  ) {}

  ngOnInit(): void {
    this.initializeComponent();
    this.setupTable();
    this.setupFilters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeComponent(): void {
    if (!this.productoId) {
      this.error = 'ID de producto no válido';
      return;
    }

    this.cargarDatos();
    this.suscribirAEstadoServicio();
  }

  private setupTable(): void {
    // Configurar paginator después de cargar datos
    setTimeout(() => {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });

    // Custom filter predicate
    this.dataSource.filterPredicate = (data: RecetaPresentacion, filter: string) => {
      const searchTerm = filter.toLowerCase();
      return (
        data.nombre_generado.toLowerCase().includes(searchTerm) ||
        (data.sku && data.sku.toLowerCase().includes(searchTerm)) ||
        (data.receta?.sabor?.nombre && data.receta.sabor.nombre.toLowerCase().includes(searchTerm)) ||
        (data.presentacion?.nombre && data.presentacion.nombre.toLowerCase().includes(searchTerm))
      );
    };
  }

  private setupFilters(): void {
    // Búsqueda con debounce
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.dataSource.filter = (searchTerm || '').trim().toLowerCase();
      });

    // Filtros específicos
    this.filtroSabor.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.aplicarFiltrosEspecificos());

    this.filtroPresentacion.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.aplicarFiltrosEspecificos());

    this.filtroActivo.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.aplicarFiltrosEspecificos());
  }

  private cargarDatos(): void {
    this.loading = true;
    this.error = null;

    this.saboresService.cargarVariacionesByProducto(this.productoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (datos: RecetaPresentacion[]) => {
          this.variaciones = datos;
          this.actualizarOpcionesFiltros();
          this.actualizarDataSource();
          this.loading = false;
          console.log('✅ Variaciones cargadas:', this.variaciones.length);
        },
        error: (error: unknown) => {
          console.error('❌ Error cargando variaciones:', error);
          this.error = 'Error al cargar las variaciones del producto';
          this.loading = false;
        }
      });
  }

  private suscribirAEstadoServicio(): void {
    this.saboresService.variaciones$
      .pipe(takeUntil(this.destroy$))
      .subscribe(variaciones => {
        this.variaciones = variaciones;
        this.actualizarDataSource();
      });

    this.saboresService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.loading = loading;
      });

    this.saboresService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.error = error;
      });
  }

  private actualizarOpcionesFiltros(): void {
    // Actualizar opciones de sabores
    const saboresUnicos = [...new Set(this.variaciones
      .map(v => v.receta?.sabor?.nombre)
      .filter(Boolean))]
      .map(sabor => ({ value: sabor!, label: sabor! }));

    this.saboresDisponibles = [
      { value: 'TODOS', label: 'Todos los Sabores' },
      ...saboresUnicos
    ];

    // Actualizar opciones de presentaciones
    const presentacionesUnicas = [...new Set(this.variaciones
      .map(v => v.presentacion?.nombre)
      .filter(Boolean))]
      .map(presentacion => ({ value: presentacion!, label: presentacion! }));

    this.presentacionesDisponibles = [
      { value: 'TODOS', label: 'Todas las Presentaciones' },
      ...presentacionesUnicas
    ];
  }

  private actualizarDataSource(): void {
    this.dataSource.data = this.variaciones;
    this.aplicarFiltrosEspecificos();
  }

  private aplicarFiltrosEspecificos(): void {
    let datosFiltrados = [...this.variaciones];

    // Filtro por sabor
    const sabor = this.filtroSabor.value;
    if (sabor && sabor !== 'TODOS') {
      datosFiltrados = datosFiltrados.filter(v =>
        v.receta?.sabor?.nombre === sabor
      );
    }

    // Filtro por presentación
    const presentacion = this.filtroPresentacion.value;
    if (presentacion && presentacion !== 'TODOS') {
      datosFiltrados = datosFiltrados.filter(v =>
        v.presentacion?.nombre === presentacion
      );
    }

    // Filtro por estado activo
    const activo = this.filtroActivo.value;
    if (activo && activo !== 'TODOS') {
      datosFiltrados = datosFiltrados.filter(v =>
        activo === 'ACTIVO' ? v.activo : !v.activo
      );
    }

    this.dataSource.data = datosFiltrados;
  }

  // ✅ ACCIONES INDIVIDUALES

  verVariacion(variacion: RecetaPresentacion): void {
    const dialogData: VariacionDialogData = {
      variacion,
      modo: 'ver',
      productoNombre: this.productoNombre
    };

    this.dialog.open(VariacionDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      data: dialogData
    });
  }

  editarVariacion(variacion: RecetaPresentacion): void {
    const dialogData: VariacionDialogData = {
      variacion,
      modo: 'editar',
      productoNombre: this.productoNombre
    };

    const dialogRef = this.dialog.open(VariacionDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      data: dialogData,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'updated') {
        console.log('✅ Variación actualizada:', result.variacion.nombre_generado);
        this.recargarDatos();
      }
    });
  }

  eliminarVariacion(variacion: RecetaPresentacion): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title: 'Eliminar Variación',
        message: `¿Estás seguro de que quieres eliminar "${variacion.nombre_generado}"?`,
        details: [
          'Esta acción eliminará:',
          '• La variación permanentemente',
          '• Los precios configurados',
          '• Los registros de venta asociados'
        ],
        confirmText: 'Sí, Eliminar',
        cancelText: 'Cancelar',
        dangerous: true
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed && variacion.id) {
    this.saboresService.eliminarVariacion(variacion.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('✅ Variación eliminada:', variacion.nombre_generado);
          this.recargarDatos();
        },
        error: (error: unknown) => {
          console.error('❌ Error eliminando variación:', error);
        }
      });
      }
    });
  }

  toggleActivoVariacion(variacion: RecetaPresentacion): void {
    if (!variacion.id) return;

    const nuevoEstado = !variacion.activo;
    this.saboresService.actualizarVariacion(variacion.id, { activo: nuevoEstado })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          variacion.activo = nuevoEstado;
          console.log(`✅ Variación ${nuevoEstado ? 'activada' : 'desactivada'}:`, variacion.nombre_generado);
        },
        error: (error: unknown) => {
          console.error('❌ Error actualizando estado:', error);
        }
      });
  }

  // ✅ SELECCIÓN Y ACCIONES MASIVAS

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  toggleAllRows() {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.dataSource.data.forEach(row => this.selection.select(row));
    }
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: RecetaPresentacion): string {
    if (!row) {
      return `${this.isAllSelected() ? 'deselect' : 'select'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row`;
  }

  get tieneVariacionesSeleccionadas(): boolean {
    return this.selection.hasValue();
  }

  get cantidadVariacionesSeleccionadas(): number {
    return this.selection.selected.length;
  }

  activarSeleccionadas(): void {
    const seleccionadas = this.selection.selected.filter(v => !v.activo);
    if (seleccionadas.length === 0) {
      this.snackBar.open('No hay variaciones inactivas seleccionadas', 'Cerrar', { duration: 3000 });
      return;
    }

    this.actualizarEstadoMasivo(seleccionadas, true);
  }

  desactivarSeleccionadas(): void {
    const seleccionadas = this.selection.selected.filter(v => v.activo);
    if (seleccionadas.length === 0) {
      this.snackBar.open('No hay variaciones activas seleccionadas', 'Cerrar', { duration: 3000 });
      return;
    }

    this.actualizarEstadoMasivo(seleccionadas, false);
  }

  eliminarSeleccionadas(): void {
    const seleccionadas = this.selection.selected;
    if (seleccionadas.length === 0) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title: 'Eliminar Variaciones Seleccionadas',
        message: `¿Estás seguro de que quieres eliminar ${seleccionadas.length} variación(es)?`,
        details: [
          'Esta acción eliminará:',
          `• ${seleccionadas.length} variaciones permanentemente`,
          '• Todos los precios configurados',
          '• Los registros de venta asociados'
        ],
        confirmText: 'Sí, Eliminar Todas',
        cancelText: 'Cancelar',
        dangerous: true
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.eliminarVariacionesMasivo(seleccionadas);
      }
    });
  }

  recalcularCostosSeleccionadas(): void {
    const seleccionadas = this.selection.selected;
    if (seleccionadas.length === 0) return;

    this.saboresService.recalcularCostosMasivo(seleccionadas.map(v => v.id!))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resultado: Array<{ success: boolean; costoAnterior: number; costoNuevo: number }>) => {
          console.log('✅ Costos recalculados:', resultado);
          this.selection.clear();
          this.recargarDatos();
        },
        error: (error: unknown) => {
          console.error('❌ Error recalculando costos:', error);
        }
      });
  }

  private actualizarEstadoMasivo(variaciones: RecetaPresentacion[], nuevoEstado: boolean): void {
    const updates = variaciones
      .filter(v => v.id)
      .map(v => ({ variacionId: v.id!, activo: nuevoEstado }));

    this.saboresService.actualizarVariacionesMasivo(updates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resultado: { success: boolean; actualizadas: number }) => {
          console.log(`✅ ${resultado.actualizadas} variaciones ${nuevoEstado ? 'activadas' : 'desactivadas'}`);
          this.selection.clear();
          this.recargarDatos();
        },
        error: (error: unknown) => {
          console.error('❌ Error actualizando estados:', error);
        }
      });
  }

  private eliminarVariacionesMasivo(variaciones: RecetaPresentacion[]): void {
    // TODO: Implementar eliminación masiva en el backend
    this.snackBar.open('Función en desarrollo: Eliminación masiva', 'Cerrar', { duration: 3000 });
  }

  // ✅ UTILIDADES Y NAVEGACIÓN

  /**
   * Abrir la gestión de recetas para editar la receta vinculada a esta variación
   */
  editarRecetaVinculada(variacion: RecetaPresentacion): void {
    if (!variacion.receta?.id) {
      this.snackBar.open('Esta variación no tiene receta vinculada', 'Cerrar', { duration: 3000 });
      return;
    }

    console.log('✅ Editando receta vinculada:', variacion.receta.id);

    // Abrir nueva pestaña con gestión de recetas
    this.tabsService.addTab(
      `Editar Receta: ${variacion.receta?.nombre || 'Sin nombre'}`,
      GestionRecetasComponent,
      {
        recetaId: variacion.receta.id,
        productoId: this.productoId,
        productoNombre: this.productoNombre,
        modo: 'edit'
      },
      `receta-${variacion.receta.id}`,
      true
    );

    // Mostrar mensaje de confirmación
    this.snackBar.open(
      `Receta "${variacion.receta?.nombre || 'Sin nombre'}" abierta en nueva pestaña`,
      'Cerrar',
      { duration: 3000 }
    );
  }

  recargarDatos(): void {
    this.cargarDatos();
  }

  limpiarFiltros(): void {
    this.searchControl.setValue('');
    this.filtroSabor.setValue('TODOS');
    this.filtroPresentacion.setValue('TODOS');
    this.filtroActivo.setValue('TODOS');
  }

  exportarDatos(): void {
    // TODO: Implementar exportación
    this.snackBar.open('Función en desarrollo: Exportar datos', 'Cerrar', { duration: 3000 });
  }

  // ✅ CÁLCULOS Y FORMATEO

  calcularMargen(variacion: RecetaPresentacion): number {
    // M-03: usar el costo total de la variación (mismo cálculo que el diálogo),
    // no el costo_calculado crudo, para que el margen sea consistente en toda la UI.
    const costo = this.saboresService.calcularCostoTotalVariacion(variacion);
    if (!variacion.precio_ajuste || !costo) return 0;
    return variacion.precio_ajuste - costo;
  }

  calcularPorcentajeMargen(variacion: RecetaPresentacion): number {
    if (!variacion.precio_ajuste) return 0;
    const margen = this.calcularMargen(variacion);
    return (margen / variacion.precio_ajuste) * 100;
  }

  getColorMargen(variacion: RecetaPresentacion): string {
    const porcentaje = this.calcularPorcentajeMargen(variacion);
    if (porcentaje > 30) return 'success';
    if (porcentaje > 15) return 'warning';
    return 'danger';
  }

  formatearMoneda(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    return `$${value.toFixed(2)}`;
  }

  formatearPorcentaje(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  get hayFiltrosActivos(): boolean {
    return (this.searchControl.value && this.searchControl.value.length > 0) ||
           this.filtroSabor.value !== 'TODOS' ||
           this.filtroPresentacion.value !== 'TODOS' ||
           this.filtroActivo.value !== 'TODOS';
  }

  get mensajeResultados(): string {
    const total = this.variaciones.length;
    const mostrados = this.dataSource.data.length;

    if (total === 0) {
      return 'No hay variaciones generadas para este producto';
    }

    if (this.hayFiltrosActivos && mostrados !== total) {
      return `Mostrando ${mostrados} de ${total} variaciones`;
    }

    return `${total} variación${total !== 1 ? 'es' : ''} disponible${total !== 1 ? 's' : ''}`;
  }

  // ✅ CÁLCULOS PARA TEMPLATE

  contarVariacionesActivas(): number {
    return this.variaciones.filter(v => v.activo).length;
  }

  // ✅ TRACK BY FUNCTIONS
  trackByVariacionId(index: number, variacion: RecetaPresentacion): any {
    return variacion.id || index;
  }
}
