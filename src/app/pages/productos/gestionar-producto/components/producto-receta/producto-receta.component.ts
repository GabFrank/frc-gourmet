import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { GestionarProductoService } from '../../services/gestionar-producto.service';
import { Receta } from 'src/app/database/entities/productos/receta.entity';
import { RecetaIngrediente } from 'src/app/database/entities/productos/receta-ingrediente.entity';
import { Adicional } from 'src/app/database/entities/productos/adicional.entity';
import { RecetaAdicionalVinculacion } from 'src/app/database/entities/productos/receta-adicional-vinculacion.entity';
import { Producto } from 'src/app/database/entities/productos/producto.entity';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { GestionRecetasComponent } from 'src/app/pages/gestion-recetas/gestion-recetas.component';
import { GenericSearchDialogComponent, GenericSearchConfig } from 'src/app/shared/components/generic-search-dialog/generic-search-dialog.component';

@Component({
  selector: 'app-producto-receta',
  templateUrl: './producto-receta.component.html',
  styleUrls: ['./producto-receta.component.scss']
})
export class ProductoRecetaComponent implements OnInit, OnDestroy {

  // Observables del servicio de producto
  isEditMode$: Observable<boolean>;
  productoId$: Observable<number | null>;

  // Propiedades locales
  producto: Producto | null = null;
  receta: Receta | null = null;
  ingredientes: RecetaIngrediente[] = [];
  adicionales: RecetaAdicionalVinculacion[] = [];

  // Estados de carga
  loading = false;
  recetaLoading = false;

  // Propiedades computadas para performance.
  // El costo representa un % del PRECIO FINAL (no un markup sobre el costo).
  // precioSugerido = costo / (porcentajeCosto/100). Configurable via
  // ConfiguracionRrhh 'PORCENTAJE_COSTO_SUGERIDO' (default 35%).
  costoTotalReceta = 0;
  porcentajeCosto = 35;
  precioSugerido = 0;
  gananciaSugerida = 0;

  // Propiedades computadas para ingredientes (evitar llamadas en template)
  ingredientesParaMostrar: Array<{
    ingrediente: RecetaIngrediente;
    nombre: string;
    tipo: string;
    cantidadFormateada: string;
    costoFormateado: any;
  }> = [];

  // Propiedades computadas para adicionales (evitar llamadas en template)
  adicionalesParaMostrar: Array<{
    adicional: RecetaAdicionalVinculacion;
    precioFormateado: string;
  }> = [];

  // Estados visuales
  hayReceta = false;
  hayIngredientes = false;
  hayAdicionales = false;

  private destroy$ = new Subject<void>();

  constructor(
    private productoService: GestionarProductoService,
    private repositoryService: RepositoryService,
    private tabsService: TabsService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.isEditMode$ = this.productoService.isEditMode$;
    this.productoId$ = this.productoService.productoId$;
  }

  ngOnInit(): void {
    this.cargarPorcentajeCosto();
    // Suscribirse a cambios del producto
    this.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
      if (productoId) {
        this.loadProductoData(productoId);
      } else {
        this.resetData();
      }
    });
  }

  /**
   * Carga el porcentaje del precio final que representa el costo (configurable).
   * Default 35% si no esta seteado.
   */
  private cargarPorcentajeCosto(): void {
    this.repositoryService.getConfiguracionRrhh('PORCENTAJE_COSTO_SUGERIDO')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (cfg: any) => {
          const n = parseFloat(cfg?.valor);
          if (!isNaN(n) && n > 0) {
            this.porcentajeCosto = n;
            this.calcularCostos();
          }
        },
        error: () => { /* usa el default 35 */ },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Carga los datos del producto y su receta asociada
   */
  private loadProductoData(productoId: number): void {
    this.loading = true;

    this.repositoryService.getProducto(productoId).subscribe({
      next: (producto: Producto) => {
        this.producto = producto;

        // Si el producto tiene una receta asociada, cargarla
        if (producto.receta) {
          this.loadRecetaData(producto.receta.id!);
        } else {
          this.resetRecetaData();
        }

        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading producto:', error);
        this.snackBar.open('Error al cargar el producto', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  /**
   * Carga los datos de la receta y sus ingredientes/adicionales
   */
  private loadRecetaData(recetaId: number): void {
    this.recetaLoading = true;

    this.repositoryService.getReceta(recetaId).subscribe({
      next: (receta: Receta) => {
        this.receta = receta;
        this.hayReceta = true;

        // Cargar ingredientes y adicionales
        this.loadIngredientes();
        this.loadAdicionales();

        this.recetaLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading receta:', error);
        this.snackBar.open('Error al cargar la receta', 'Cerrar', { duration: 3000 });
        this.recetaLoading = false;
      }
    });
  }

  /**
   * Carga los ingredientes de la receta
   */
  private loadIngredientes(): void {
    if (!this.receta?.id) return;

    this.repositoryService.getRecetaIngredientes(this.receta.id).subscribe({
      next: (ingredientes: RecetaIngrediente[]) => {
        this.ingredientes = ingredientes;
        this.hayIngredientes = ingredientes.length > 0;
        this.calcularCostos();
        this.calcularIngredientesParaMostrar();
      },
      error: (error: any) => {
        console.error('Error loading ingredientes:', error);
        this.snackBar.open('Error al cargar ingredientes', 'Cerrar', { duration: 3000 });
      }
    });
  }

  /**
   * Carga los adicionales de la receta
   */
  private loadAdicionales(): void {
    if (!this.receta?.id) return;

    this.repositoryService.getRecetaAdicionalVinculaciones(this.receta.id).subscribe({
      next: (adicionales: RecetaAdicionalVinculacion[]) => {
        this.adicionales = adicionales;
        this.hayAdicionales = adicionales.length > 0;
        this.calcularAdicionalesParaMostrar();
      },
      error: (error: any) => {
        console.error('Error loading adicionales:', error);
        this.snackBar.open('Error al cargar adicionales', 'Cerrar', { duration: 3000 });
      }
    });
  }

  /**
   * Calcula las propiedades computadas para ingredientes
   */
  private calcularIngredientesParaMostrar(): void {
    this.ingredientesParaMostrar = this.ingredientes.map(ingrediente => {
      const cantidad = ingrediente.cantidad || 0;
      const unidad = ingrediente.unidad || '';
      const costo = ingrediente.costoTotal || 0;

      return {
        ingrediente,
        nombre: ingrediente.ingrediente?.nombre || 'Producto no encontrado',
        tipo: ingrediente.ingrediente?.tipo || '',
        cantidadFormateada: `${cantidad} ${unidad}`,
        costoFormateado: costo
      };
    });
  }

  /**
   * Calcula las propiedades computadas para adicionales
   */
  private calcularAdicionalesParaMostrar(): void {
    this.adicionalesParaMostrar = this.adicionales.map(adicional => {
      const precio = adicional.precioAdicional || 0;

      return {
        adicional,
        precioFormateado: `$${precio.toFixed(2)}`
      };
    });
  }

  /**
   * Calcula los costos totales de la receta
   */
  private calcularCostos(): void {
    this.costoTotalReceta = this.ingredientes.reduce((total, ingrediente) => {
      return total + (Number(ingrediente.costoTotal) || 0);
    }, 0);

    // El costo debe representar `porcentajeCosto`% del precio final, por lo que
    // precio sugerido = costo / (porcentajeCosto/100). Ej: costo 1000 al 35% => 2857.
    const ratio = (this.porcentajeCosto || 35) / 100;
    this.precioSugerido = ratio > 0 ? this.costoTotalReceta / ratio : 0;
    this.gananciaSugerida = this.precioSugerido - this.costoTotalReceta;
  }

  /**
   * Resetea los datos de la receta
   */
  private resetRecetaData(): void {
    this.receta = null;
    this.ingredientes = [];
    this.adicionales = [];
    this.ingredientesParaMostrar = [];
    this.adicionalesParaMostrar = [];
    this.hayReceta = false;
    this.hayIngredientes = false;
    this.hayAdicionales = false;
    this.costoTotalReceta = 0;
    this.precioSugerido = 0;
    this.gananciaSugerida = 0;
  }

  /**
   * Resetea todos los datos
   */
  private resetData(): void {
    this.producto = null;
    this.resetRecetaData();
  }

  /**
   * Crea una nueva receta para el producto
   */
  crearReceta(): void {
    if (!this.producto) return;

    const confirmDialog = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Crear Nueva Receta',
        message: `¿Estás seguro de que quieres crear una nueva receta para "${this.producto.nombre}"?`,
        confirmText: 'Sí, Crear',
        cancelText: 'Cancelar'
      }
    });

    confirmDialog.afterClosed().subscribe(result => {
      if (result) {
        this.abrirGestionRecetas('create');
      }
    });
  }

  /**
   * Edita la receta existente
   */
  editarReceta(): void {
    if (!this.receta) return;

    this.abrirGestionRecetas('edit', this.receta.id);
  }

  /**
   * Abre el módulo de gestión de recetas
   */
  private abrirGestionRecetas(mode: 'create' | 'edit', recetaId?: number): void {
    const tabTitle = mode === 'create'
      ? `Crear Receta - ${this.producto?.nombre}`
      : `Editar Receta - ${this.receta?.nombre}`;

    const tabData = mode === 'create'
      ? { mode: 'create', productoId: this.producto?.id }
      : { mode: 'edit', recetaId: recetaId };

    const tabId = mode === 'create'
      ? `crear-receta-${this.producto?.id}-tab`
      : `editar-receta-${recetaId}-tab`;

    this.tabsService.openTab(
      tabTitle,
      GestionRecetasComponent,
      tabData,
      tabId
    );
  }

  /**
   * Desvincula la receta del producto
   */
  desvincularReceta(): void {
    if (!this.receta || !this.producto || !this.producto.id) return;

    const confirmDialog = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Desvincular Receta',
        message: `¿Estás seguro de que quieres desvincular la receta "${this.receta.nombre}" del producto "${this.producto.nombre}"?`,
        confirmText: 'Sí, Desvincular',
        cancelText: 'Cancelar'
      }
    });

    confirmDialog.afterClosed().subscribe(result => {
      if (result) {
        this.loading = true;

        const productoId = this.producto!.id!;
        const recetaId = this.receta!.id!;

        // Actualizar la receta para desvincularla del producto
        const recetaData = {
          ...this.receta,
          productoId: null
        };

        // Actualizar la receta
        this.repositoryService.updateReceta(recetaId, recetaData).subscribe({
          next: (updatedReceta) => {

            // También actualizar el producto para mantener la relación bidireccional
            const productoData = {
              ...this.producto,
              recetaId: null
            };

            this.repositoryService.updateProducto(productoId, productoData).subscribe({
              next: (updatedProducto) => {
                // Agregar un pequeño delay para asegurar que la base de datos se actualice
                setTimeout(() => {
                  this.resetRecetaData();
                  this.loading = false;
                  this.snackBar.open('Receta desvinculada correctamente', 'Cerrar', { duration: 2000 });
                }, 500);
              },
              error: (error: any) => {
                console.error('Error actualizando producto:', error);
                this.snackBar.open('Error al actualizar el producto', 'Cerrar', { duration: 3000 });
                this.loading = false;
              }
            });
          },
          error: (error: any) => {
            console.error('Error desvinculando receta:', error);
            this.snackBar.open('Error al desvincular la receta', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        });
      }
    });
  }

  /**
   * Abre el diálogo de búsqueda de recetas
   */
  buscarReceta(): void {
    const config: GenericSearchConfig = {
      title: 'BUSCAR RECETA',
      displayedColumns: ['nombre', 'costoCalculado', 'activo'],
      columnLabels: {
        nombre: 'NOMBRE',
        costoCalculado: 'COSTO',
        activo: 'ACTIVO'
      },
      columnAlignments: {
        nombre: 'left',
        costoCalculado: 'right',
        activo: 'center'
      },
      booleanColumns: {
        activo: { trueValue: 'Sí', falseValue: 'No' }
      },
      showActiveFilter: true,
      searchFn: async (query: string, page: number, pageSize: number, activeFilter?: 'all' | 'active' | 'inactive') => {
        try {
          // Obtener todas las recetas
          const recetas = await this.repositoryService.getRecetas().toPromise();

          if (!recetas) {
            return { items: [], total: 0 };
          }

          let filteredRecetas = recetas;

          // Filtrar por query si se proporciona
          if (query && query.trim()) {
            const searchTerm = query.toLowerCase().trim();
            filteredRecetas = recetas.filter(receta =>
              receta.nombre.toLowerCase().includes(searchTerm) ||
              (receta.descripcion && receta.descripcion.toLowerCase().includes(searchTerm))
            );
          }

          // Filtrar por estado activo/inactivo
          if (activeFilter && activeFilter !== 'all') {
            const isActive = activeFilter === 'active';
            filteredRecetas = filteredRecetas.filter(receta => receta.activo === isActive);
          }

          // Filtrar recetas que no estén asignadas a otros productos
          filteredRecetas = filteredRecetas.filter(receta => !receta.producto);

          // Aplicar paginación
          const startIndex = page * pageSize;
          const endIndex = startIndex + pageSize;
          const paginatedRecetas = filteredRecetas.slice(startIndex, endIndex);

          return {
            items: paginatedRecetas,
            total: filteredRecetas.length
          };
        } catch (error) {
          console.error('Error searching recetas:', error);
          return { items: [], total: 0 };
        }
      }
    };

    const dialogRef = this.dialog.open(GenericSearchDialogComponent, {
      width: '60%',
      height: '80%',
      data: config
    });

    dialogRef.afterClosed().subscribe((receta: Receta | undefined) => {
      if (receta) {
        this.asignarReceta(receta);
      }
    });
  }

  /**
   * Asigna una receta al producto
   */
  private asignarReceta(receta: Receta): void {
    if (!this.producto || !this.producto.id) return;

    const confirmDialog = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Asignar Receta',
        message: `¿Estás seguro de que quieres asignar la receta "${receta.nombre}" al producto "${this.producto.nombre}"?`,
        confirmText: 'Sí, Asignar',
        cancelText: 'Cancelar'
      }
    });

    confirmDialog.afterClosed().subscribe(result => {
      if (result) {
        this.loading = true;

        const productoId = this.producto!.id!;

        // Actualizar la receta para asignarla al producto
        const recetaData = {
          ...receta,
          productoId: productoId
        };

        // Actualizar la receta
        this.repositoryService.updateReceta(receta.id!, recetaData).subscribe({
          next: (updatedReceta) => {

            // También actualizar el producto para mantener la relación bidireccional
            const productoData = {
              ...this.producto,
              recetaId: receta.id
            };

            this.repositoryService.updateProducto(productoId, productoData).subscribe({
              next: (updatedProducto) => {
                // Agregar un pequeño delay para asegurar que la base de datos se actualice
                setTimeout(() => {
                  // Recargar los datos del producto para mostrar la receta asignada
                  this.loadProductoData(productoId);
                  this.snackBar.open('Receta asignada correctamente', 'Cerrar', { duration: 2000 });
                }, 500);
              },
              error: (error: any) => {
                console.error('Error actualizando producto:', error);
                this.snackBar.open('Error al actualizar el producto', 'Cerrar', { duration: 3000 });
                this.loading = false;
              }
            });
          },
          error: (error: any) => {
            console.error('Error asignando receta:', error);
            this.snackBar.open('Error al asignar la receta', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        });
      }
    });
  }
}
