import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatMenuModule } from '@angular/material/menu';
import { MatRadioModule } from '@angular/material/radio';
import { GestionarProductoService } from '../../services/gestionar-producto.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { Producto } from 'src/app/database/entities/productos/producto.entity';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';
import { Receta } from 'src/app/database/entities/productos/receta.entity';
import { PrecioVenta } from 'src/app/database/entities/productos/precio-venta.entity';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { TipoPrecio } from 'src/app/database/entities/financiero/tipo-precio.entity';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-producto-precios-venta',
  templateUrl: './producto-precios-venta.component.html',
  styleUrls: ['./producto-precios-venta.component.scss']
})
export class ProductoPreciosVentaComponent implements OnInit, OnDestroy, AfterViewInit {
  
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  // Observables del servicio de producto
  isEditMode$: Observable<boolean>;
  productoId$: Observable<number | null>;
  
  // Propiedades locales
  producto: Producto | null = null;
  receta: Receta | null = null;
  preciosVenta: PrecioVenta[] = [];
  
  // Estados de carga
  loading = false;
  isLoading = false;
  
  // Estados visuales
  hayReceta = false;
  hayPrecios = false;
  mostrarMensajeSinReceta = false;
  esCombo = false;
  
  // Dropdown data
  monedas: Moneda[] = [];
  monedaPrincipal: Moneda | null = null;
  tiposPrecio: TipoPrecio[] = [];
  
  // Propiedades computadas para performance
  precioPrincipal: PrecioVenta | null = null;
  preciosActivos: PrecioVenta[] = [];
  preciosInactivos: PrecioVenta[] = [];
  precioSugerido = 0;
  
  // Paginación
  totalPreciosVenta = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  currentPage = 0;
  
  // Filtro de estado
  filtroActivo = 'activos'; // 'activos', 'inactivos', 'todos'
  filtroActivoControl = new FormControl('activos');
  
  // Formulario para nuevo precio de venta
  precioVentaForm!: FormGroup;
  
  // Modo de edición
  isEditing = false;
  editingPrecioVentaId: number | null = null;

  // Decimales de la moneda seleccionada en el form
  decimalesMoneda = 0;
  
  // Columnas para la tabla
  displayedColumns: string[] = ['id', 'moneda', 'tipoPrecio', 'valor', 'cmv', 'principal', 'activo', 'acciones'];
  
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private productoService: GestionarProductoService,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {
    this.isEditMode$ = this.productoService.isEditMode$;
    this.productoId$ = this.productoService.productoId$;
    this.initForm();
  }

  ngOnInit(): void {
    // Suscribirse a cambios del producto
    this.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
      if (productoId) {
        this.loadProductoData(productoId);
      } else {
        this.resetData();
      }
    });

    // Suscribirse al cambio del filtro
    this.filtroActivoControl.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(value => {
      if (value) {
        this.filtroActivo = value;
        this.onFiltroChange();
      }
    });

    // Cargar datos de dropdowns
    this.loadDropdownData();
  }

  ngAfterViewInit(): void {
    // Inicializar el filtro después de que el view esté listo
    this.filtroActivoControl.setValue('activos', { emitEvent: false });
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.precioVentaForm = this.fb.group({
      valor: [0, [Validators.required, Validators.min(0.01)]],
      monedaId: ['', [Validators.required]],
      tipoPrecioId: ['', [Validators.required]],
      principal: [false],
      activo: [true]
    });
    this.precioVentaForm.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
  }

  private recalcDecimalesMoneda(): void {
    const id = this.precioVentaForm?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  /**
   * Carga los datos del producto y su receta asociada
   */
  private loadProductoData(productoId: number): void {
    this.loading = true;

    this.repositoryService.getProducto(productoId).subscribe({
      next: (producto: Producto) => {
        this.producto = producto;
        this.esCombo = producto.tipo === ProductoTipo.COMBO;

        // Ajustar columnas según tipo
        if (this.esCombo) {
          this.displayedColumns = ['id', 'moneda', 'tipoPrecio', 'valor', 'principal', 'activo', 'acciones'];
        } else {
          this.displayedColumns = ['id', 'moneda', 'tipoPrecio', 'valor', 'cmv', 'principal', 'activo', 'acciones'];
        }

        if (this.esCombo) {
          // COMBO: precios directos vinculados al producto
          this.hayReceta = false;
          this.mostrarMensajeSinReceta = false;
          this.loadPreciosVentaByProducto(productoId);
          this.loadDropdownData();
        } else if (producto.receta) {
          this.loadRecetaData(producto.receta.id!);
        } else {
          this.handleProductoSinReceta();
        }

        this.loading = false;
      },
      error: (error: any) => {
        console.error('ProductoPreciosVentaComponent: Error loading producto:', error);
        this.snackBar.open('Error al cargar el producto', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  /**
   * Carga los datos de la receta y sus precios de venta
   */
  private loadRecetaData(recetaId: number): void {
    this.repositoryService.getReceta(recetaId).subscribe({
      next: (receta: Receta) => {
        this.receta = receta;
        this.hayReceta = true;
        this.mostrarMensajeSinReceta = false;
        
        // Cargar precios de venta de la receta
        this.loadPreciosVenta();
        
        // Cargar datos de dropdowns
        this.loadDropdownData();
      },
      error: (error: any) => {
        console.error('Error loading receta:', error);
        this.snackBar.open('Error al cargar la receta', 'Cerrar', { duration: 3000 });
      }
    });
  }

  /**
   * Maneja el caso de producto sin receta vinculada
   */
  private handleProductoSinReceta(): void {
    this.receta = null;
    this.hayReceta = false;
    this.preciosVenta = [];
    this.hayPrecios = false;
    this.mostrarMensajeSinReceta = true;
    
    // Cargar datos de dropdowns para precios manuales
    this.loadDropdownData();
  }

  /**
   * Carga los precios de venta de la receta
   */
  private loadPreciosVenta(): void {
    if (this.esCombo && this.producto?.id) {
      this.loadPreciosVentaByProducto(this.producto.id);
      return;
    }
    if (!this.receta?.id) return;

    this.isLoading = true;

    this.repositoryService.getPreciosVentaByReceta(this.receta.id, null).subscribe({
      next: (precios: PrecioVenta[]) => {
        this.procesarPrecios(precios);
      },
      error: (error: any) => {
        console.error('Error loading precios venta:', error);
        this.snackBar.open('Error al cargar precios de venta', 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  /**
   * Carga los precios de venta directos del producto (COMBO)
   */
  private loadPreciosVentaByProducto(productoId: number): void {
    this.isLoading = true;

    this.repositoryService.getPreciosVentaByProducto(productoId, null).subscribe({
      next: (precios: PrecioVenta[]) => {
        this.procesarPrecios(precios);
      },
      error: (error: any) => {
        console.error('Error loading precios venta by producto:', error);
        this.snackBar.open('Error al cargar precios de venta', 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  /**
   * Procesa y pagina los precios cargados
   */
  private procesarPrecios(precios: PrecioVenta[]): void {
    let filteredPrecios = precios;
    if (this.filtroActivo === 'activos') {
      filteredPrecios = precios.filter(p => p.activo);
    } else if (this.filtroActivo === 'inactivos') {
      filteredPrecios = precios.filter(p => !p.activo);
    }

    // Calcular CMV solo si hay receta (no aplica para COMBO)
    if (!this.esCombo) {
      filteredPrecios = filteredPrecios.map(precio => {
        const costo = this.receta?.costoCalculado || 0;
        const precioValor = precio.valor || 1;
        (precio as any).cmv = costo > 0 && precioValor > 0 ? (costo / precioValor) * 100 : 0;
        return precio;
      });
    }

    // Aplicar paginación
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.preciosVenta = filteredPrecios.slice(startIndex, endIndex);
    this.totalPreciosVenta = filteredPrecios.length;

    this.hayPrecios = precios.length > 0;
    this.calcularPreciosComputados();
    this.isLoading = false;
  }

  /**
   * Carga datos para dropdowns
   */
  private loadDropdownData(): void {
    // Cargar monedas
    this.repositoryService.getMonedas().subscribe({
      next: (monedas: Moneda[]) => {
        this.monedas = monedas;
        // Seleccionar la moneda principal por defecto
        setTimeout(() => {
          const monedaPrincipal = monedas.find(m => m.principal);
          this.monedaPrincipal = monedaPrincipal || null;
          if (monedaPrincipal) {
            this.precioVentaForm.patchValue({
              monedaId: monedaPrincipal.id
            }, { emitEvent: false });
            this.cdr.detectChanges();
          }
        });
      },
      error: (error: any) => {
        console.error('Error loading monedas:', error);
      }
    });

    // Cargar tipos de precio
    this.repositoryService.getTiposPrecio().subscribe({
      next: (tipos: TipoPrecio[]) => {
        this.tiposPrecio = tipos;
      },
      error: (error: any) => {
        console.error('Error loading tipos precio:', error);
      }
    });
  }

  /**
   * Calcula las propiedades computadas para performance
   */
  private calcularPreciosComputados(): void {
    this.precioPrincipal = this.preciosVenta.find(p => p.principal && p.activo) || null;
    this.preciosActivos = this.preciosVenta.filter(p => p.activo);
    this.preciosInactivos = this.preciosVenta.filter(p => !p.activo);
    this.precioSugerido = this.receta?.costoCalculado ? this.receta.costoCalculado / 0.35 : 0;
  }

  /**
   * Resetea todos los datos
   */
  private resetData(): void {
    this.producto = null;
    this.receta = null;
    this.preciosVenta = [];
    this.hayReceta = false;
    this.hayPrecios = false;
    this.mostrarMensajeSinReceta = false;
    this.precioPrincipal = null;
    this.preciosActivos = [];
    this.preciosInactivos = [];
    this.precioSugerido = 0;
  }

  /**
   * Maneja el cambio de página
   */
  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadPreciosVenta();
  }

  /**
   * Maneja el cambio de filtro
   */
  onFiltroChange(): void {
    this.currentPage = 0;
    if (this.paginator) {
      this.paginator.firstPage();
    }
    this.loadPreciosVenta();
  }

  /**
   * Crea un nuevo precio de venta
   */
  crearPrecioVenta(): void {
    const canCreate = this.esCombo ? this.producto?.id : this.receta?.id;
    if (this.precioVentaForm.valid && canCreate) {
      const formValue = this.precioVentaForm.value;

      const precioVentaData: any = {
        valor: formValue.valor,
        monedaId: formValue.monedaId,
        tipoPrecioId: formValue.tipoPrecioId,
        principal: formValue.principal,
        activo: formValue.activo
      };

      if (this.esCombo) {
        precioVentaData.productoId = this.producto!.id;
      } else {
        precioVentaData.recetaId = this.receta!.id;
      }

      this.isLoading = true;

      this.repositoryService.createPrecioVenta(precioVentaData).subscribe({
        next: (precioVenta: PrecioVenta) => {
          this.snackBar.open('Precio de venta creado correctamente', 'Cerrar', { 
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          
          // Recargar los precios de venta
          this.loadPreciosVenta();
          
          // Resetear el formulario
          this.precioVentaForm.reset({
            valor: 0,
            monedaId: this.monedaPrincipal?.id || '',
            tipoPrecioId: '',
            principal: false,
            activo: true
          });
          
          this.isLoading = false;
        },
        error: (error: any) => {
          console.error('Error creating precio venta:', error);
          this.snackBar.open('Error al crear precio de venta', 'Cerrar', { 
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoading = false;
        }
      });
    } else {
      this.snackBar.open('Por favor complete todos los campos requeridos', 'Cerrar', { 
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  /**
   * Actualiza un precio de venta existente
   */
  actualizarPrecioVenta(): void {
    if (this.precioVentaForm.valid && this.editingPrecioVentaId) {
      const formValue = this.precioVentaForm.value;
      
      const precioVentaData = {
        valor: formValue.valor,
        monedaId: formValue.monedaId,
        tipoPrecioId: formValue.tipoPrecioId,
        principal: formValue.principal,
        activo: formValue.activo
      };

      this.isLoading = true;

      this.repositoryService.updatePrecioVenta(this.editingPrecioVentaId, precioVentaData).subscribe({
        next: (precioVenta: PrecioVenta) => {
          this.snackBar.open('Precio de venta actualizado correctamente', 'Cerrar', { 
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          
          // Recargar los precios de venta
          this.loadPreciosVenta();
          
          // Salir del modo edición
          this.cancelarEdicion();
          
          this.isLoading = false;
        },
        error: (error: any) => {
          console.error('Error updating precio venta:', error);
          this.snackBar.open('Error al actualizar precio de venta', 'Cerrar', { 
            duration: 5000,
            panelClass: ['error-snackbar']
          });
          this.isLoading = false;
        }
      });
    }
  }

  /**
   * Edita un precio de venta existente
   */
  editarPrecioVenta(precio: PrecioVenta): void {
    this.isEditing = true;
    this.editingPrecioVentaId = precio.id || null;
    this.cargarDatosEnFormulario(precio);
  }

  /**
   * Carga los datos de un precio de venta en el formulario
   */
  private cargarDatosEnFormulario(precio: PrecioVenta): void {
    this.precioVentaForm.patchValue({
      valor: precio.valor,
      monedaId: precio.moneda?.id,
      tipoPrecioId: precio.tipoPrecio?.id,
      principal: precio.principal,
      activo: precio.activo
    });
  }

  /**
   * Cancela la edición
   */
  cancelarEdicion(): void {
    this.isEditing = false;
    this.editingPrecioVentaId = null;
    this.precioVentaForm.reset({
      valor: 0,
      monedaId: '',
      tipoPrecioId: '',
      principal: false,
      activo: true
    });
  }

  /**
   * Activa/desactiva un precio de venta
   */
  toggleActivo(precio: PrecioVenta): void {
    const newActivo = !precio.activo;
    const action = newActivo ? 'activar' : 'desactivar';
    
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CONFIRMAR CAMBIO',
        message: `¿Está seguro que desea ${action} este precio de venta?`,
        confirmText: 'CONFIRMAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && precio.id) {
        this.isLoading = true;

        this.repositoryService.updatePrecioVenta(precio.id, { activo: newActivo }).subscribe({
          next: () => {
            this.snackBar.open(`Precio de venta ${action}do correctamente`, 'Cerrar', { 
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            
            // Recargar los precios de venta
            this.loadPreciosVenta();
            
            this.isLoading = false;
          },
          error: (error: any) => {
            console.error('Error updating precio venta activo:', error);
            this.snackBar.open(`Error al ${action} precio de venta`, 'Cerrar', { 
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.isLoading = false;
          }
        });
      }
    });
  }

  /**
   * Marca un precio como principal
   */
  marcarComoPrincipal(precio: PrecioVenta): void {
    if (precio.principal) return; // Ya es principal

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Marcar como Principal',
        message: `¿Estás seguro de que quieres marcar el precio de ${precio.valor} como principal?`,
        confirmText: 'Sí, Marcar',
        cancelText: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && precio.id) {
        this.isLoading = true;

        this.repositoryService.updatePrecioVenta(precio.id, { principal: true }).subscribe({
          next: () => {
            this.snackBar.open('Precio marcado como principal correctamente', 'Cerrar', { 
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            
            // Recargar los precios de venta
            this.loadPreciosVenta();
            
            this.isLoading = false;
          },
          error: (error: any) => {
            console.error('Error marking precio as principal:', error);
            this.snackBar.open('Error al marcar precio como principal', 'Cerrar', { 
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.isLoading = false;
          }
        });
      }
    });
  }

  /**
   * Elimina un precio de venta
   */
  eliminarPrecioVenta(precio: PrecioVenta): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar Precio',
        message: `¿Estás seguro de que quieres eliminar el precio de ${precio.valor}?`,
        confirmText: 'Sí, Eliminar',
        cancelText: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && precio.id) {
        this.isLoading = true;

        this.repositoryService.deletePrecioVenta(precio.id).subscribe({
          next: () => {
            this.snackBar.open('Precio de venta eliminado correctamente', 'Cerrar', { 
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            
            // Recargar los precios de venta
            this.loadPreciosVenta();
            
            this.isLoading = false;
          },
          error: (error: any) => {
            console.error('Error deleting precio venta:', error);
            this.snackBar.open('Error al eliminar precio de venta', 'Cerrar', { 
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.isLoading = false;
          }
        });
      }
    });
  }

  /**
   * Navega a la pestaña de receta para crear una
   */
  irAReceta(): void {
    // Buscar el MatTabGroup y cambiar a la pestaña de receta
    const tabGroup = document.querySelector('mat-tab-group');
    if (tabGroup) {
      // La pestaña de receta está en el índice 2 (después de Información General y Presentaciones)
      // Pero para productos ELABORADO_SIN_VARIACION, puede estar en índice 1
      const tabLabels = Array.from(tabGroup.querySelectorAll('mat-tab-label'));
      const recetaTabIndex = tabLabels.findIndex(tab => 
        tab.textContent?.toLowerCase().includes('receta')
      );
      
      if (recetaTabIndex !== -1) {
        // Cambiar a la pestaña de receta
        const tabGroupElement = tabGroup as any;
        if (tabGroupElement.selectedIndex !== undefined) {
          tabGroupElement.selectedIndex = recetaTabIndex;
        }
      } else {
        this.snackBar.open('No se encontró la pestaña de receta', 'Cerrar', { duration: 2000 });
      }
    } else {
      this.snackBar.open('Error al navegar a la pestaña de receta', 'Cerrar', { duration: 2000 });
    }
  }

  /**
   * Obtiene el texto del tooltip para el CMV
   */
  getCmvTooltip(cmv: number): string {
    if (cmv >= 0 && cmv < 35) {
      return 'Excelente margen - CMV bajo (< 35%)';
    } else if (cmv >= 35 && cmv < 45) {
      return 'Buen margen - CMV moderado (35-45%)';
    } else if (cmv >= 45 && cmv < 55) {
      return 'Margen bajo - CMV alto (45-55%)';
    } else {
      return 'Margen crítico - CMV muy alto (≥ 55%)';
    }
  }
} 