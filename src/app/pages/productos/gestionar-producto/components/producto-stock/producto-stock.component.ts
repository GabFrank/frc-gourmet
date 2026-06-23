import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { StockMovimiento, StockMovimientoTipo, StockMovimientoTipoReferencia } from 'src/app/database/entities/productos/stock-movimiento.entity';
import { Producto } from 'src/app/database/entities/productos/producto.entity';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';
import { RepositoryService } from 'src/app/database/repository.service';
import { GestionarProductoService } from '../../services/gestionar-producto.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ProduccionBuffetDialogComponent } from 'src/app/shared/components/produccion-buffet-dialog/produccion-buffet-dialog.component';

@Component({
  selector: 'app-producto-stock',
  templateUrl: './producto-stock.component.html',
  styleUrls: ['./producto-stock.component.scss']
})
export class ProductoStockComponent implements OnInit, OnDestroy {

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  stockMovimientos: StockMovimiento[] = [];
  producto: Producto | null = null;
  isLoading = false;
  
  // Paginación
  totalStockMovimientos = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  currentPage = 0;
  
  // Filtro de tipo de movimiento
  filtroTipo = 'todos';
  filtroTipoControl = new FormControl('todos');
  
  // Formulario para ajuste de stock
  ajusteStockForm!: FormGroup;
  
  // Modo de edición
  isEditing = false;
  editingStockMovimientoId: number | null = null;
  
  // Columnas para la tabla
  displayedColumns: string[] = ['fecha', 'tipo', 'cantidad', 'referencia', 'tipoReferencia', 'observaciones', 'acciones'];
  
  // Enums para uso en template
  readonly StockMovimientoTipo = StockMovimientoTipo;
  readonly StockMovimientoTipoReferencia = StockMovimientoTipoReferencia;
  readonly ProductoTipo = ProductoTipo;
  
  // Propiedades computadas para evitar llamadas directas en template
  stockActual = 0;
  stockEstadoColor = '#4caf50';
  stockEstadoTexto = 'Normal';
  
  // Mapa de colores para tipos de movimiento
  tipoMovimientoColores: { [key: string]: string } = {
    [StockMovimientoTipo.COMPRA]: '#4caf50',
    [StockMovimientoTipo.VENTA]: '#f44336',
    [StockMovimientoTipo.AJUSTE_POSITIVO]: '#4caf50',
    [StockMovimientoTipo.AJUSTE_NEGATIVO]: '#f44336',
    [StockMovimientoTipo.TRANSFERENCIA]: '#2196f3',
    [StockMovimientoTipo.DESCARTE]: '#f44336',
    [StockMovimientoTipo.PRODUCCION_ENTRADA]: '#4caf50',
    [StockMovimientoTipo.PRODUCCION_SALIDA]: '#f44336'
  };

  // Mapa de textos para tipos de movimiento
  tipoMovimientoTextos: { [key: string]: string } = {
    [StockMovimientoTipo.COMPRA]: 'Compra',
    [StockMovimientoTipo.VENTA]: 'Venta',
    [StockMovimientoTipo.AJUSTE_POSITIVO]: 'Ajuste +',
    [StockMovimientoTipo.AJUSTE_NEGATIVO]: 'Ajuste -',
    [StockMovimientoTipo.TRANSFERENCIA]: 'Transferencia',
    [StockMovimientoTipo.DESCARTE]: 'Descartes',
    [StockMovimientoTipo.PRODUCCION_ENTRADA]: 'Producción +',
    [StockMovimientoTipo.PRODUCCION_SALIDA]: 'Producción -'
  };
  
  // Opciones de tipo de movimiento
  tiposMovimiento = [
    { value: StockMovimientoTipo.AJUSTE_POSITIVO, label: 'Ajuste Positivo' },
    { value: StockMovimientoTipo.AJUSTE_NEGATIVO, label: 'Ajuste Negativo' },
    { value: StockMovimientoTipo.TRANSFERENCIA, label: 'Transferencia' },
    { value: StockMovimientoTipo.DESCARTE, label: 'Descartes' }
  ];
  
  // Opciones de tipo de referencia
  tiposReferencia = [
    { value: StockMovimientoTipoReferencia.AJUSTE, label: 'Ajuste' },
    { value: StockMovimientoTipoReferencia.TRANSFERENCIA, label: 'Transferencia' },
    { value: StockMovimientoTipoReferencia.DESCARTE, label: 'Descartes' }
  ];
  
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private repository: RepositoryService,
    private productoService: GestionarProductoService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // Suscribirse al productoId para cargar stock cuando esté disponible
    this.productoService.productoId$.subscribe(productoId => {
      if (productoId) {
        this.loadProducto(productoId);
        this.loadStockMovimientos(productoId);
      }
    });

    // Suscribirse al cambio del filtro
    this.filtroTipoControl.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(value => {
      if (value) {
        this.filtroTipo = value;
        this.onFiltroChange();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.ajusteStockForm = this.fb.group({
      tipo: [StockMovimientoTipo.AJUSTE_POSITIVO, [Validators.required]],
      cantidad: [0, [Validators.required, Validators.min(0.01)]],
      tipoReferencia: [StockMovimientoTipoReferencia.AJUSTE, [Validators.required]],
      observaciones: ['']
    });
  }

  /**
   * Carga los datos del producto
   */
  private loadProducto(productoId: number): void {
    this.repository.getProducto(productoId).subscribe({
      next: (producto) => {
        this.producto = producto;
      },
      error: (error) => {
        console.error('Error loading producto:', error);
        this.snackBar.open('Error al cargar datos del producto', 'CERRAR', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  /**
   * Carga los movimientos de stock del producto
   */
  abrirProduccionDialog(): void {
    if (!this.producto) return;
    const ref = this.dialog.open(ProduccionBuffetDialogComponent, {
      width: '480px',
      data: { producto: this.producto },
      disableClose: true,
    });
    ref.afterClosed().subscribe((ok: boolean) => {
      if (ok && this.producto?.id) {
        this.loadProducto(this.producto.id);
        this.loadStockMovimientos(this.producto.id, this.currentPage, this.pageSize);
      }
    });
  }

  private loadStockMovimientos(productoId: number, page = 0, pageSize = 10): void {
    this.isLoading = true;
    this.repository.getStockMovimientosByProducto(productoId).subscribe({
      next: (stockMovimientos) => {
        // Filtrar según el filtro de tipo
        let filteredMovimientos = stockMovimientos;
        if (this.filtroTipo !== 'todos') {
          filteredMovimientos = stockMovimientos.filter(m => m.tipo === this.filtroTipo);
        }
        
        // Aplicar paginación
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        this.stockMovimientos = filteredMovimientos.slice(startIndex, endIndex);
        this.totalStockMovimientos = filteredMovimientos.length;
        
        // Actualizar propiedades computadas
        this.updateComputedProperties();
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading stock movimientos:', error);
        this.snackBar.open('Error al cargar movimientos de stock', 'CERRAR', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        this.isLoading = false;
      }
    });
  }

  /**
   * Actualiza las propiedades computadas
   */
  private updateComputedProperties(): void {
    this.stockActual = this.calculateStockActual();
    const estado = this.calculateStockEstado();
    this.stockEstadoColor = this.getStockEstadoColor(estado);
    this.stockEstadoTexto = this.getStockEstadoTexto(estado);
  }

  /**
   * Calcula el stock actual basado en los movimientos
   */
  private calculateStockActual(): number {
    if (!this.stockMovimientos || this.stockMovimientos.length === 0) {
      return 0;
    }

    return this.stockMovimientos.reduce((total, movimiento) => {
      if (movimiento.tipo === StockMovimientoTipo.COMPRA || 
          movimiento.tipo === StockMovimientoTipo.AJUSTE_POSITIVO ||
          movimiento.tipo === StockMovimientoTipo.PRODUCCION_ENTRADA) {
        return total + movimiento.cantidad;
      } else if (movimiento.tipo === StockMovimientoTipo.VENTA ||
                 movimiento.tipo === StockMovimientoTipo.AJUSTE_NEGATIVO ||
                 movimiento.tipo === StockMovimientoTipo.PRODUCCION_SALIDA ||
                 movimiento.tipo === StockMovimientoTipo.DESCARTE) {
        return total - movimiento.cantidad;
      }
      return total;
    }, 0);
  }

  /**
   * Obtiene el estado del stock basado en los límites
   */
  private calculateStockEstado(): 'NORMAL' | 'BAJO' | 'CRITICO' | 'EXCESIVO' {
    const stockActual = this.calculateStockActual();
    const stockMinimo = this.producto?.stockMinimo;
    const stockMaximo = this.producto?.stockMaximo;

    if (stockMinimo && stockActual <= stockMinimo * 0.5) return 'CRITICO';
    if (stockMinimo && stockActual <= stockMinimo) return 'BAJO';
    if (stockMaximo && stockActual >= stockMaximo) return 'EXCESIVO';
    return 'NORMAL';
  }

  /**
   * Maneja el cambio de página
   */
  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.productoService.productoId$.subscribe(productoId => {
      if (productoId) {
        this.loadStockMovimientos(productoId, this.currentPage, this.pageSize);
      }
    });
  }

  /**
   * Maneja el cambio de filtro
   */
  onFiltroChange(): void {
    this.currentPage = 0;
    if (this.paginator) {
      this.paginator.firstPage();
    }
    this.productoService.productoId$.subscribe(productoId => {
      if (productoId) {
        this.loadStockMovimientos(productoId, this.currentPage, this.pageSize);
      }
    });
  }

  /**
   * Crea un nuevo ajuste de stock
   */
  crearAjusteStock(): void {
    if (this.ajusteStockForm.valid) {
      const formValue = this.ajusteStockForm.value;
      
      this.productoService.productoId$.subscribe(productoId => {
        if (productoId) {
          const stockMovimientoData = {
            cantidad: formValue.cantidad,
            tipo: formValue.tipo,
            tipoReferencia: formValue.tipoReferencia,
            observaciones: formValue.observaciones ? formValue.observaciones.toUpperCase() : '',
            productoId: productoId,
            fecha: new Date(),
            activo: true
          };

          if (this.isEditing && this.editingStockMovimientoId) {
            // Modo edición - actualizar movimiento existente
            this.repository.updateStockMovimiento(this.editingStockMovimientoId, stockMovimientoData).subscribe({
              next: (stockMovimiento) => {
                this.snackBar.open('Movimiento de stock actualizado correctamente', 'CERRAR', {
                  duration: 3000,
                  panelClass: ['success-snackbar']
                });
                
                // Salir del modo edición
                this.cancelarEdicion();
                
                // Recargar la lista
                this.loadStockMovimientos(productoId, this.currentPage, this.pageSize);
              },
              error: (error) => {
                console.error('Error updating stock movimiento:', error);
                this.snackBar.open('Error al actualizar movimiento de stock', 'CERRAR', {
                  duration: 5000,
                  panelClass: ['error-snackbar']
                });
              }
            });
          } else {
            // Modo creación - crear nuevo movimiento
            this.repository.createStockMovimiento(stockMovimientoData).subscribe({
              next: (stockMovimiento) => {
                this.snackBar.open('Ajuste de stock creado correctamente', 'CERRAR', {
                  duration: 3000,
                  panelClass: ['success-snackbar']
                });
                
                // Recargar la lista
                this.loadStockMovimientos(productoId, this.currentPage, this.pageSize);
                
                // Resetear el formulario
                this.resetForm();
              },
              error: (error) => {
                console.error('Error creating stock movimiento:', error);
                this.snackBar.open('Error al crear ajuste de stock', 'CERRAR', {
                  duration: 5000,
                  panelClass: ['error-snackbar']
                });
              }
            });
          }
        }
      });
    } else {
      this.snackBar.open('Por favor complete todos los campos requeridos', 'CERRAR', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  /**
   * Edita un movimiento de stock
   */
  editarStockMovimiento(stockMovimiento: StockMovimiento): void {
    // Solo permitir edición de movimientos de ajuste
    if (stockMovimiento.tipo !== StockMovimientoTipo.AJUSTE_POSITIVO && 
        stockMovimiento.tipo !== StockMovimientoTipo.AJUSTE_NEGATIVO) {
      this.snackBar.open('Solo se pueden editar movimientos de tipo ajuste', 'CERRAR', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
      return;
    }

    // Cargar datos en el formulario
    this.ajusteStockForm.patchValue({
      tipo: stockMovimiento.tipo,
      cantidad: stockMovimiento.cantidad,
      tipoReferencia: stockMovimiento.tipoReferencia,
      observaciones: stockMovimiento.observaciones || ''
    });

    // Activar modo edición
    this.isEditing = true;
    this.editingStockMovimientoId = stockMovimiento.id || null;

    // Scroll al formulario
    this.scrollToForm();
  }

  /**
   * Cancela la edición y resetea el formulario
   */
  cancelarEdicion(): void {
    this.isEditing = false;
    this.editingStockMovimientoId = null;
    this.resetForm();
  }

  /**
   * Resetea el formulario a valores por defecto
   */
  private resetForm(): void {
    this.ajusteStockForm.reset({
      tipo: StockMovimientoTipo.AJUSTE_POSITIVO,
      cantidad: 0,
      tipoReferencia: StockMovimientoTipoReferencia.AJUSTE,
      observaciones: ''
    });
  }

  /**
   * Hace scroll al formulario
   */
  private scrollToForm(): void {
    const formElement = document.querySelector('.form-card');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Elimina un movimiento de stock
   */
  eliminarStockMovimiento(stockMovimiento: StockMovimiento): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CONFIRMAR DESACTIVACIÓN',
        message: `¿Está seguro que desea desactivar este movimiento de stock?`,
        confirmText: 'DESACTIVAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && stockMovimiento.id) {
        // Por ahora solo desactivamos, no eliminamos físicamente
        this.repository.updateStockMovimiento(stockMovimiento.id, { activo: false }).subscribe({
          next: () => {
            this.snackBar.open('Movimiento de stock desactivado correctamente', 'CERRAR', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            
            // Recargar la lista
            this.productoService.productoId$.subscribe(productoId => {
              if (productoId) {
                this.loadStockMovimientos(productoId, this.currentPage, this.pageSize);
              }
            });
          },
          error: (error) => {
            console.error('Error deleting stock movimiento:', error);
            this.snackBar.open('Error al desactivar movimiento de stock', 'CERRAR', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      }
    });
  }

  /**
   * Obtiene el color del estado del stock
   */
  getStockEstadoColor(estado: 'NORMAL' | 'BAJO' | 'CRITICO' | 'EXCESIVO'): string {
    switch (estado) {
      case 'CRITICO': return '#f44336';
      case 'BAJO': return '#ff9800';
      case 'EXCESIVO': return '#9c27b0';
      default: return '#4caf50';
    }
  }

  /**
   * Obtiene el texto del estado del stock
   */
  getStockEstadoTexto(estado: 'NORMAL' | 'BAJO' | 'CRITICO' | 'EXCESIVO'): string {
    switch (estado) {
      case 'CRITICO': return 'Crítico';
      case 'BAJO': return 'Bajo';
      case 'EXCESIVO': return 'Excesivo';
      default: return 'Normal';
    }
  }

  /**
   * Obtiene el texto del tipo de movimiento
   */
  getTipoMovimientoTexto(tipo: StockMovimientoTipo): string {
    return this.tipoMovimientoTextos[tipo] || tipo;
  }

  /**
   * Obtiene el color del tipo de movimiento
   */
  getTipoMovimientoColor(tipo: StockMovimientoTipo): string {
    return this.tipoMovimientoColores[tipo] || '#666666';
  }
} 