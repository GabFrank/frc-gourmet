import { Component, Input, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { FormControl } from '@angular/forms';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { SaboresVariacionesService, Sabor, RecetaPresentacion, EstadisticasSabores } from '../../../../../services/sabores-variaciones.service';
import { SaborDialogComponent, SaborDialogData } from '../../dialogs/sabor-dialog/sabor-dialog.component';
import { VariacionDialogComponent, VariacionDialogData } from '../../dialogs/variacion-dialog/variacion-dialog.component';
import { PrecioVentaDialogComponent, PrecioVentaDialogData } from '../precio-venta-dialog/precio-venta-dialog.component';
import { ConfirmationDialogComponent } from '../../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { TabsService } from '../../../../../services/tabs.service';
import { GestionRecetasComponent } from '../../../../gestion-recetas/gestion-recetas.component';

@Component({
  selector: 'app-producto-sabores',
  templateUrl: './producto-sabores.component.html',
  styleUrls: ['./producto-sabores.component.scss'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', display: 'none' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ])
  ]
})
export class ProductoSaboresComponent implements OnInit, OnDestroy {

  @Input() productoId!: number;
  @Input() productoNombre!: string;
  @Input() productoTipo!: string;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // ✅ TABLA JERÁRQUICA UNIFICADA
  dataSource = new MatTableDataSource<Sabor>();
  displayedColumns: string[] = [
    'expand',
    'nombre',
    'categoria',
    'variaciones_count',
    'activo',
    'actions'
  ];

  // ✅ COLUMNAS PARA LA TABLA PRINCIPAL (sin expandedDetail)
  columnsToDisplay: string[] = [...this.displayedColumns];

  // ✅ CONTROL DE EXPANSIÓN (patrón estándar Angular Material)
  expandedSabor: Sabor | null = null;

  // ✅ COLUMNAS PARA VARIACIONES (sub-tabla)
  variacionesColumns: string[] = [
    'nombre_generado',
    'presentacion',
    'costo_calculado',
    // 'precio_ajuste',
    'precio_principal', // ✅ NUEVA: Columna para precio principal
    'margen',
    'activo_variacion',
    'actions_variacion'
  ];

  // State
  sabores: Sabor[] = [];
  saboresFiltrados: Sabor[] = [];
  estadisticas: EstadisticasSabores = {
    totalSabores: 0,
    saboresActivos: 0,
    totalRecetas: 0,
    totalVariaciones: 0
  };
  loading = false;
  error: string | null = null;

  // ✅ PRE-CALCULATED VALUES (Regla #2: No function calls in templates)
  saboresConDatosCalculados: (Sabor & {
    variacionesCount: number;
    variacionesActivasCount: number;
    categoriaColor: string;
    categoriaIcono: string;
    variacionesCalculadas: (RecetaPresentacion & {
      margenCalculado: number;
      margenPorcentaje: number;
      margenColor: string;
      precioPrincipalFormateado: string;
      tienePrecioPrincipal: boolean;
      precioPrincipalActivo: boolean;
      precioPrincipalEsPrincipal: boolean;
      margenFormateado: string; // ✅ NUEVO: Margen ya formateado
    })[];
  })[] = [];

  // Filtros y búsqueda
  searchControl = new FormControl('');
  filtroCategoria = new FormControl('TODOS');
  filtroActivo = new FormControl('TODOS');

  // Opciones de filtros
  categoriasDisponibles = [
    { value: 'TODOS', label: 'Todas las Categorías' },
    { value: 'PIZZA', label: 'Pizza' },
    { value: 'HAMBURGUESA', label: 'Hamburguesa' },
    { value: 'PASTA', label: 'Pasta' },
    { value: 'EMPANADA', label: 'Empanada' },
    { value: 'SANDWICH', label: 'Sandwich' },
    { value: 'ENSALADA', label: 'Ensalada' },
    { value: 'POSTRE', label: 'Postre' },
    { value: 'BEBIDA', label: 'Bebida' },
    { value: 'OTRO', label: 'Otro' }
  ];

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
    console.log('[ProductoSaboresComponent] ngOnInit', {
      productoId: this.productoId,
      productoNombre: this.productoNombre,
      productoTipo: this.productoTipo
    });
    this.initializeComponent();
    this.setupFilters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeComponent(): void {
    console.log('[ProductoSaboresComponent] initializeComponent: productoId=', this.productoId);
    if (!this.productoId) {
      this.error = 'ID de producto no válido';
      console.warn('[ProductoSaboresComponent] ProductoId inválido. No se cargarán datos.');
      return;
    }

    this.cargarDatos();
    this.suscribirAEstadoServicio();
  }

  private setupFilters(): void {
    // Búsqueda con debounce
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.aplicarFiltros();
      });

    // Filtros inmediatos
    this.filtroCategoria.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.aplicarFiltros();
      });

    this.filtroActivo.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.aplicarFiltros();
      });
  }

  private cargarDatos(): void {
    console.log('[ProductoSaboresComponent] cargarDatos: start');
    this.loading = true;
    this.error = null;

    // ✅ NUEVO: Cargar sabores con variaciones agrupadas
    this.saboresService.cargarSaboresConVariaciones(this.productoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (datos) => {
          console.log('[ProductoSaboresComponent] cargarDatos: success', datos);

          // ✅ NUEVO: Log detallado de las variaciones y precios
          datos.sabores.forEach(sabor => {
            console.log(`🍕 [cargarDatos] Sabor: ${sabor.nombre}`, {
              variaciones: sabor.variaciones?.length || 0
            });

            sabor.variaciones?.forEach(variacion => {
              console.log(`  📊 [cargarDatos] Variación: ${variacion.nombre_generado}`, {
                id: variacion.id,
                recetaId: variacion.receta?.id,
                precioPrincipal: variacion.precioPrincipal,
                preciosVenta: variacion.preciosVenta?.length || 0,
                costo_calculado: variacion.costo_calculado
              });
            });
          });

          this.sabores = datos.sabores;
          this.estadisticas = datos.estadisticas;
          this.aplicarFiltros();
          this.setupTable();
          this.loading = false;
          console.log('✅ Datos de sabores con variaciones cargados:', datos);
        },
        error: (error) => {
          console.error('❌ Error cargando sabores:', error);
          this.error = 'Error al cargar los sabores del producto';
          this.loading = false;
        }
      });
  }

  private suscribirAEstadoServicio(): void {
    // Suscribirse a cambios en el servicio
    this.saboresService.sabores$
      .pipe(takeUntil(this.destroy$))
      .subscribe(sabores => {
        this.sabores = sabores;
        this.aplicarFiltros();
      });

    this.saboresService.estadisticas$
      .pipe(takeUntil(this.destroy$))
      .subscribe(estadisticas => {
        this.estadisticas = estadisticas;
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

  private aplicarFiltros(): void {
    let saboresFiltrados = [...this.sabores];

    // Filtro por búsqueda
    const searchTerm = this.searchControl.value?.toLowerCase().trim();
    if (searchTerm) {
      saboresFiltrados = saboresFiltrados.filter(sabor =>
        sabor.nombre.toLowerCase().includes(searchTerm) ||
        sabor.categoria.toLowerCase().includes(searchTerm) ||
        (sabor.descripcion && sabor.descripcion.toLowerCase().includes(searchTerm)) ||
        // ✅ NUEVO: También buscar en variaciones
        (sabor.variaciones && sabor.variaciones.some(v =>
          v.nombre_generado.toLowerCase().includes(searchTerm) ||
          v.sku?.toLowerCase().includes(searchTerm)
        ))
      );
    }

    // Filtro por categoría
    const categoria = this.filtroCategoria.value;
    if (categoria && categoria !== 'TODOS') {
      saboresFiltrados = saboresFiltrados.filter(sabor =>
        sabor.categoria === categoria
      );
    }

    // Filtro por estado activo
    const activo = this.filtroActivo.value;
    if (activo && activo !== 'TODOS') {
      saboresFiltrados = saboresFiltrados.filter(sabor =>
        activo === 'ACTIVO' ? sabor.activo : !sabor.activo
      );
    }

    this.saboresFiltrados = saboresFiltrados;
    this.calcularDatosSabores(); // ✅ Pre-calcular valores para templates
    this.dataSource.data = this.saboresConDatosCalculados;
  }

  // ✅ NUEVO: Configurar tabla
  private setupTable(): void {
    setTimeout(() => {
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }





  // ✅ PRE-CALCULATE VALUES (Regla #2: No function calls in templates)
  private calcularDatosSabores(): void {
    console.log('🔄 [calcularDatosSabores] Iniciando cálculo de datos...');

    this.saboresConDatosCalculados = this.saboresFiltrados.map(sabor => {
      console.log(`🔍 [calcularDatosSabores] Procesando sabor: ${sabor.nombre}`);

      const variacionesCalculadas = sabor.variaciones?.map(variacion => {
        console.log(`  📊 [calcularDatosSabores] Variación: ${variacion.nombre_generado}`, {
          precioPrincipal: variacion.precioPrincipal,
          preciosVenta: variacion.preciosVenta?.length || 0,
          costo_calculado: variacion.costo_calculado
        });

        // ✅ NUEVO: Pre-calcular valores para el template (Regla #2)
        const precioPrincipalFormateado = this.calcularPrecioPrincipalFormateado(variacion);
        const tienePrecioPrincipal = !!variacion.precioPrincipal;
        const precioPrincipalActivo = variacion.precioPrincipal?.activo || false;
        const precioPrincipalEsPrincipal = variacion.precioPrincipal?.principal || false;

        // ✅ NUEVO: Separar moneda y valor para el pipe number (Regla #4)
        const precioPrincipalMoneda = variacion.precioPrincipal?.moneda?.denominacion || '';
        const precioPrincipalValor = variacion.precioPrincipal?.valor || 0;

        // ✅ NUEVO: Pre-calcular margen formateado (Regla #2)
        const margenCalculado = this.calcularMargen(variacion);
        const margenFormateado = this.formatearMoneda(margenCalculado);

        // ✅ NUEVO: Separar margen en moneda y valor para el pipe number (Regla #4)
        const margenMoneda = '$'; // Asumiendo que el margen se muestra en pesos
        const margenValor = margenCalculado;

        return {
          ...variacion,
          margenCalculado,
          margenFormateado, // ✅ NUEVO: Margen ya formateado
          margenPorcentaje: this.calcularPorcentajeMargen(variacion),
          margenColor: this.getColorMargen(variacion),
          // ✅ NUEVO: Usar el costo calculado desde precio_costo
          costo_calculado: this.saboresService.calcularCostoTotalVariacion(variacion),
          // ✅ NUEVO: Propiedades pre-calculadas para el template (Regla #2)
          precioPrincipalFormateado,
          tienePrecioPrincipal,
          precioPrincipalActivo,
          precioPrincipalEsPrincipal,
          // ✅ NUEVO: Moneda y valor separados para el pipe number (Regla #4)
          precioPrincipalMoneda,
          precioPrincipalValor,
          // ✅ NUEVO: Margen separado para el pipe number (Regla #4)
          margenMoneda,
          margenValor
        };
      }) || [];

      return {
        ...sabor,
        variacionesCount: this.contarVariacionesPorSabor(sabor),
        variacionesActivasCount: this.contarVariacionesActivasPorSabor(sabor),
        categoriaColor: this.getColorCategoria(sabor.categoria),
        categoriaIcono: this.getIconoCategoria(sabor.categoria),
        variacionesCalculadas
      };
    });

    console.log('✅ [calcularDatosSabores] Datos calculados:', this.saboresConDatosCalculados.length);
  }

  // ✅ NUEVO: Método privado para calcular precio principal formateado (Regla #2)
  private calcularPrecioPrincipalFormateado(variacion: RecetaPresentacion): string {
    if (!variacion.precioPrincipal) {
      return 'Sin precio';
    }

    const moneda = variacion.precioPrincipal.moneda?.denominacion || '';
    const valor = variacion.precioPrincipal.valor;

    if (valor === null || valor === undefined) {
      return 'Sin precio';
    }

    // ✅ CORREGIDO: Solo retornar moneda y valor, el formato se hace en el template (Regla #4)
    return `${moneda} ${valor}`;
  }

  // ❌ ELIMINADO: Métodos que violan Regla #2 (no se usan en templates)
  // getPrecioPrincipal() y tienePrecioPrincipal() ya no son necesarios

  // ✅ ACCIONES PRINCIPALES

  nuevoSabor(): void {
    // Guard: sin un producto persistido no hay contexto para asociar el sabor.
    // Evita enviar productoId indefinido al backend (que terminaba creando
    // sabores huérfanos y variaciones contra el producto equivocado).
    if (!this.productoId) {
      this.snackBar.open('Guardá primero el producto antes de agregar sabores', 'Cerrar', {
        duration: 4000,
        panelClass: ['snackbar-error']
      });
      return;
    }

    const dialogData: SaborDialogData = {
      productoId: this.productoId,
      productoNombre: this.productoNombre,
      modo: 'crear'
    };

    const dialogRef = this.dialog.open(SaborDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: dialogData,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'created') {
        console.log('✅ Sabor creado desde dialog:', result.sabor.nombre);
        // El servicio ya actualiza su estado interno
        this.recargarEstadisticas();
      }
    });
  }

  editarSabor(sabor: Sabor): void {
    const dialogData: SaborDialogData = {
      sabor,
      productoId: this.productoId,
      productoNombre: this.productoNombre,
      modo: 'editar'
    };

    const dialogRef = this.dialog.open(SaborDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: dialogData,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'updated') {
        console.log('✅ Sabor actualizado desde dialog:', result.sabor.nombre);
        // El servicio ya actualiza su estado interno
      }
    });
  }

  eliminarSabor(sabor: Sabor): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title: 'Eliminar Sabor',
        message: `¿Estás seguro de que quieres eliminar el sabor "${sabor.nombre}"?`,
        details: [
          'Esta acción eliminará:',
          '• El sabor permanentemente',
          '• Todas las recetas asociadas',
          '• Todas las variaciones generadas',
          '• Los precios configurados'
        ],
        confirmText: 'Sí, Eliminar',
        cancelText: 'Cancelar',
        dangerous: true
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed && sabor.id) {
        this.saboresService.eliminarSabor(sabor.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              console.log('✅ Sabor eliminado:', sabor.nombre);
              this.recargarEstadisticas();
            },
            error: (error) => {
              console.error('❌ Error eliminando sabor:', error);
            }
          });
      }
    });
  }

  // ✅ ACCIONES MASIVAS

  generarTodasLasVariaciones(): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title: 'Generar Variaciones Automáticas',
        message: `¿Generar automáticamente todas las variaciones faltantes para "${this.productoNombre}"?`,
        details: [
          'Esto creará combinaciones de:',
          `• ${this.estadisticas.totalSabores} sabores configurados`,
          '• Todas las presentaciones del producto',
          '• Solo se crearán las variaciones que no existan'
        ],
        confirmText: 'Sí, Generar',
        cancelText: 'Cancelar',
        dangerous: false
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.saboresService.generarVariacionesFaltantes(this.productoId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (result) => {
              console.log('✅ Variaciones generadas:', result.variacionesGeneradas);
              if (result.variacionesGeneradas > 0) {
                // ✅ NUEVO: Recargar datos de forma eficiente
                this.recargarDespuesDeCrearVariaciones();
                this.snackBar.open(`${result.variacionesGeneradas} variaciones generadas correctamente`, 'Cerrar', {
                  duration: 3000,
                  panelClass: ['snackbar-success']
                });
              } else {
                this.snackBar.open('No hay variaciones faltantes para generar', 'Cerrar', {
                  duration: 3000,
                  panelClass: ['snackbar-info']
                });
              }
            },
            error: (error) => {
              console.error('❌ Error generando variaciones:', error);
              this.snackBar.open('Error al generar variaciones', 'Cerrar', {
                duration: 5000,
                panelClass: ['snackbar-error']
              });
            }
          });
      }
    });
  }

  recargarDatos(): void {
    this.cargarDatos();
  }

  // ✅ NUEVO: Método específico para recargar después de crear variaciones
  private recargarDespuesDeCrearVariaciones(): void {
    console.log('🔄 Recargando datos después de crear variaciones...');

    // Recargar solo los datos necesarios de forma eficiente
    this.saboresService.cargarSaboresConVariaciones(this.productoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (datos) => {
          console.log('[ProductoSaboresComponent] recarga exitosa:', datos);
          this.sabores = datos.sabores;
          this.estadisticas = datos.estadisticas;
          this.aplicarFiltros();
          this.setupTable();
        },
        error: (error) => {
          console.error('❌ Error recargando datos:', error);
          this.snackBar.open('Error al recargar los datos', 'Cerrar', {
            duration: 5000,
            panelClass: ['snackbar-error']
          });
        }
      });
  }

  limpiarFiltros(): void {
    this.searchControl.setValue('');
    this.filtroCategoria.setValue('TODOS');
    this.filtroActivo.setValue('TODOS');
  }

  // ✅ NAVEGACIÓN

  gestionarReceta(sabor: Sabor): void {
    // ✅ NUEVO: Ahora las recetas se gestionan por variación, no por sabor
    // Mostrar mensaje informativo
    this.snackBar.open('Las recetas ahora se gestionan por variación. Selecciona una variación específica para gestionar su receta.', 'Cerrar', {
      duration: 5000
    });
  }

  gestionarRecetaDeVariacion(variacion: RecetaPresentacion): void {
    // Asumimos que la 'receta' se carga junto con la variación desde el backend
    if (variacion.receta && variacion.receta.id) {
      const recetaId = variacion.receta.id;
      const titulo = `Receta - ${variacion.nombre_generado}`;

      // ✅ NUEVO: Encontrar el sabor al que pertenece esta variación para pasar el contexto
      const saborContenedor = this.sabores.find(s => s.variaciones?.some(v => v.id === variacion.id));

      const tabData = {
        recetaId,
        // ✅ NUEVO: Pasar información de contexto para el asistente de ingredientes
        contexto: 'variacion',
        productoId: this.productoId,
        saborId: saborContenedor?.id,
        variacionId: variacion.id,
      };

      this.tabsService.openTab(titulo, GestionRecetasComponent, tabData);
    } else {
      this.snackBar.open('Esta variación no tiene una receta asociada.', 'Cerrar', {
        duration: 4000
      });
    }
  }

  // ✅ UTILIDADES

  private recargarEstadisticas(): void {
    this.saboresService.cargarEstadisticas(this.productoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (estadisticas) => {
          this.estadisticas = estadisticas;
        },
        error: (error) => {
          console.error('❌ Error recargando estadísticas:', error);
        }
      });
  }

  getIconoCategoria(categoria: string): string {
    const iconos: { [key: string]: string } = {
      'PIZZA': 'local_pizza',
      'HAMBURGUESA': 'lunch_dining',
      'PASTA': 'ramen_dining',
      'EMPANADA': 'bakery_dining',
      'SANDWICH': 'lunch_dining',
      'ENSALADA': 'eco',
      'POSTRE': 'cake',
      'BEBIDA': 'local_drink',
      'OTRO': 'restaurant'
    };
    return iconos[categoria] || 'restaurant';
  }

  getColorCategoria(categoria: string): string {
    const colores: { [key: string]: string } = {
      'PIZZA': 'warn',
      'HAMBURGUESA': 'accent',
      'PASTA': 'primary',
      'EMPANADA': 'warn',
      'SANDWICH': 'accent',
      'ENSALADA': 'primary',
      'POSTRE': 'warn',
      'BEBIDA': 'primary',
      'OTRO': ''
    };
    return colores[categoria] || '';
  }

  get hayFiltrosActivos(): boolean {
    return (this.searchControl.value && this.searchControl.value.length > 0) ||
           this.filtroCategoria.value !== 'TODOS' ||
           this.filtroActivo.value !== 'TODOS';
  }

  get mensajeResultados(): string {
    const total = this.sabores.length;
    const filtrados = this.saboresFiltrados.length;

    if (total === 0) {
      return 'No hay sabores configurados para este producto';
    }

    if (this.hayFiltrosActivos) {
      return `Mostrando ${filtrados} de ${total} sabores`;
    }

    return `${total} sabor${total !== 1 ? 'es' : ''} configurado${total !== 1 ? 's' : ''}`;
  }

  // ✅ GESTIÓN DE VARIACIONES (integradas en la tabla jerárquica)

  /**
   * Editar una variación específica
   */
  editarVariacion(variacion: RecetaPresentacion): void {
    const dialogData: VariacionDialogData = {
      variacion,
      modo: 'editar',
      productoNombre: this.productoNombre
    };

    const dialogRef = this.dialog.open(VariacionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: dialogData,
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'updated') {
        console.log('✅ Variación actualizada desde dialog:', result.variacion.nombre_generado);
        // Recargar datos para reflejar cambios
        this.recargarDatos();
      }
    });
  }

  /**
   * Eliminar una variación específica
   */
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
            error: (error) => {
              console.error('❌ Error eliminando variación:', error);
            }
          });
      }
    });
  }

  /**
   * Toggle estado activo de una variación
   */
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
        error: (error) => {
          console.error('❌ Error actualizando estado:', error);
        }
      });
  }

  /**
   * Abrir dialog para gestionar precios de venta de una variación
   */
  gestionarPreciosVariacion(variacion: RecetaPresentacion): void {
    if (!variacion.id) {
      this.snackBar.open('No se puede gestionar precios: ID de variación no válido', 'Cerrar', {
        duration: 4000,
        panelClass: ['snackbar-error']
      });
      return;
    }

    // ✅ NUEVO: Verificar que la variación tenga una receta asociada
    if (!variacion.receta?.id) {
      this.snackBar.open('No se puede gestionar precios: La variación no tiene una receta asociada', 'Cerrar', {
        duration: 4000,
        panelClass: ['snackbar-error']
      });
      return;
    }

    const dialogData: PrecioVentaDialogData = {
      entityId: variacion.id,
      entityName: variacion.nombre_generado,
      entityType: 'variacion',
      recetaId: variacion.receta.id, // ✅ OBLIGATORIO: ID de la receta
      relationField: 'recetaId', // ✅ CORREGIDO: Usar recetaId para variaciones
      preciosExistentes: variacion.preciosVenta || [],
      onPrecioCreated: (precio) => {
        // Actualizar la variación con el nuevo precio
        if (variacion.preciosVenta) {
          variacion.preciosVenta.push(precio);
        } else {
          variacion.preciosVenta = [precio];
        }
        this.calcularDatosSabores();
        this.dataSource.data = [...this.dataSource.data];
      },
      onPrecioUpdated: (precio) => {
        // Actualizar el precio en la variación
        if (variacion.preciosVenta) {
          const index = variacion.preciosVenta.findIndex(p => p.id === precio.id);
          if (index !== -1) {
            variacion.preciosVenta[index] = precio;
          }
        }
        this.calcularDatosSabores();
        this.dataSource.data = [...this.dataSource.data];
      },
      onPrecioDeleted: (precioId) => {
        // Remover el precio de la variación
        if (variacion.preciosVenta) {
          variacion.preciosVenta = variacion.preciosVenta.filter(p => p.id !== precioId);
        }
        this.calcularDatosSabores();
        this.dataSource.data = [...this.dataSource.data];
      }
    };

    const dialogRef = this.dialog.open(PrecioVentaDialogComponent, {
      data: dialogData,
      width: '900px',
      maxHeight: '80vh',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.action === 'closed') {
        // Actualizar precios locales si se modificaron
        if (result.precios) {
          variacion.preciosVenta = result.precios;
          // Recalcular datos para reflejar cambios en costos/márgenes
          this.calcularDatosSabores();
          this.dataSource.data = this.saboresConDatosCalculados;

          this.snackBar.open('Precios de venta actualizados correctamente', 'Cerrar', {
            duration: 3000,
            panelClass: ['snackbar-success']
          });
        }
      }
    });
  }

  /**
   * Calcular margen de una variación
   */
  calcularMargen(variacion: RecetaPresentacion): number {
    if (!variacion.precio_ajuste || !variacion.costo_calculado) return 0;
    return variacion.precio_ajuste - variacion.costo_calculado;
  }

  /**
   * Calcular porcentaje de margen
   */
  calcularPorcentajeMargen(variacion: RecetaPresentacion): number {
    if (!variacion.precio_ajuste || !variacion.costo_calculado) return 0;
    const margen = this.calcularMargen(variacion);
    return (margen / variacion.precio_ajuste) * 100;
  }

  /**
   * Obtener color del margen para el styling
   */
  getColorMargen(variacion: RecetaPresentacion): string {
    const porcentaje = this.calcularPorcentajeMargen(variacion);
    if (porcentaje > 30) return 'success';
    if (porcentaje > 15) return 'warning';
    return 'danger';
  }

  /**
   * Formatear moneda
   */
  formatearMoneda(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    // ✅ CORREGIDO: No usar toFixed(), solo retornar el valor para el pipe number (Regla #4)
    return `$${value}`;
  }

  /**
   * Formatear porcentaje
   */
  formatearPorcentaje(value: number): string {
    // ✅ CORREGIDO: No usar toFixed(), solo retornar el valor para el pipe number (Regla #4)
    return `${value}%`;
  }

  /**
   * Contar variaciones por sabor
   */
  contarVariacionesPorSabor(sabor: Sabor): number {
    return sabor.variaciones?.length || 0;
  }

  /**
   * Contar variaciones activas por sabor
   */
  contarVariacionesActivasPorSabor(sabor: Sabor): number {
    return sabor.variaciones?.filter(v => v.activo).length || 0;
  }

    // ❌ ELIMINADO: Métodos que violan Regla #2 (no se usan en templates)
  // getPrecioPrincipal() y tienePrecioPrincipal() ya no son necesarios

  // ✅ TRACK BY FUNCTIONS FOR PERFORMANCE
  trackBySaborId(index: number, sabor: Sabor): number {
    return sabor.id || index;
  }

  trackByVariacionId(index: number, variacion: RecetaPresentacion): number {
    return variacion.id || index;
  }
}
