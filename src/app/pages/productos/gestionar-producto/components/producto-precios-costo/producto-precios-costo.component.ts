import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { PrecioCosto, FuenteCosto } from 'src/app/database/entities/productos/precio-costo.entity';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { RepositoryService } from 'src/app/database/repository.service';
import { GestionarProductoService } from '../../services/gestionar-producto.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-producto-precios-costo',
  templateUrl: './producto-precios-costo.component.html',
  styleUrls: ['./producto-precios-costo.component.scss']
})
export class ProductoPreciosCostoComponent implements OnInit, OnDestroy, AfterViewInit {

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  preciosCosto: PrecioCosto[] = [];
  monedas: Moneda[] = [];
  isLoading = false;
  
  // Paginación
  totalPreciosCosto = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  currentPage = 0;
  
  // Filtro de estado
  filtroActivo = 'activos'; // 'activos', 'inactivos', 'todos'
  filtroActivoControl = new FormControl('activos');
  
  // Formulario para nuevo precio de costo
  precioCostoForm!: FormGroup;
  
  // Modo de edición
  isEditing = false;
  editingPrecioCostoId: number | null = null;

  // Decimales de la moneda seleccionada en el form
  decimalesMoneda = 0;

  // Columnas para la tabla
  displayedColumns: string[] = ['id', 'fuente', 'moneda', 'valor', 'fecha', 'activo', 'acciones'];
  
  // Opciones de fuente de costo
  fuentesCosto = [
    { value: FuenteCosto.COMPRA, label: 'COMPRA' },
    { value: FuenteCosto.MANUAL, label: 'MANUAL' },
    { value: FuenteCosto.AJUSTE_RECETA, label: 'AJUSTE_RECETA' }
  ];
  
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private repository: RepositoryService,
    private productoService: GestionarProductoService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    // Suscribirse al productoId para cargar precios de costo cuando esté disponible
    this.productoService.productoId$.subscribe(productoId => {
      if (productoId) {
        this.loadPreciosCosto(productoId);
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

    // Cargar monedas
    this.loadMonedas();
  }

  ngAfterViewInit(): void {
    // Inicializar el filtro después de que el view esté listo
    // Esto evita el ExpressionChangedAfterItHasBeenCheckedError
    this.filtroActivoControl.setValue('activos', { emitEvent: false });
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.precioCostoForm = this.fb.group({
      fuente: ['MANUAL', [Validators.required]],
      valor: [0, [Validators.required, Validators.min(0.01)]],
      monedaId: ['', [Validators.required]],
      activo: [true]
    });
    this.precioCostoForm.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
  }

  private recalcDecimalesMoneda(): void {
    const id = this.precioCostoForm?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  /**
   * Carga las monedas disponibles
   */
  private loadMonedas(): void {
    this.repository.getMonedas().subscribe({
      next: (monedas) => {
        this.monedas = monedas;
        // Seleccionar la moneda principal por defecto después del ciclo de detección
        setTimeout(() => {
          const monedaPrincipal = monedas.find(m => m.principal);
          if (monedaPrincipal) {
            this.precioCostoForm.patchValue({
              monedaId: monedaPrincipal.id
            }, { emitEvent: false });
            this.cdr.detectChanges();
          }
        });
      },
      error: (error) => {
        console.error('Error loading monedas:', error);
        this.snackBar.open('Error al cargar monedas', 'CERRAR', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  /**
   * Carga los precios de costo del producto actual
   */
  private loadPreciosCosto(productoId: number, page = 0, pageSize = 10): void {
    this.isLoading = true;
    this.repository.getPreciosCostoByProducto(productoId).subscribe({
      next: (preciosCosto) => {
        // Filtrar según el filtro activo
        let filteredPrecios = preciosCosto;
        if (this.filtroActivo === 'activos') {
          filteredPrecios = preciosCosto.filter(p => p.activo);
        } else if (this.filtroActivo === 'inactivos') {
          filteredPrecios = preciosCosto.filter(p => !p.activo);
        }
        
        // Aplicar paginación
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        this.preciosCosto = filteredPrecios.slice(startIndex, endIndex);
        this.totalPreciosCosto = filteredPrecios.length;
        
        // Usar setTimeout para evitar cambios durante la detección de cambios
        setTimeout(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        console.error('Error loading precios costo:', error);
        this.snackBar.open('Error al cargar precios de costo', 'CERRAR', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        setTimeout(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      }
    });
  }

  /**
   * Maneja el cambio de página
   */
  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    
    // Usar take(1) para evitar múltiples suscripciones
    this.productoService.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
      if (productoId) {
        this.loadPreciosCosto(productoId, this.currentPage, this.pageSize);
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
    
    // Usar take(1) para evitar múltiples suscripciones
    this.productoService.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
      if (productoId) {
        this.loadPreciosCosto(productoId, this.currentPage, this.pageSize);
      }
    });
  }

  /**
   * Crea un nuevo precio de costo
   */
  crearPrecioCosto(): void {
    if (this.precioCostoForm.valid) {
      const formValue = this.precioCostoForm.value;
      
      // Usar take(1) para evitar múltiples suscripciones
      this.productoService.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
        if (productoId) {
          const precioCostoData = {
            fuente: formValue.fuente,
            valor: formValue.valor,
            fecha: new Date(), // Fecha por defecto
            monedaId: formValue.monedaId,
            productoId: productoId,
            activo: formValue.activo
          };

          this.repository.createPrecioCosto(precioCostoData).subscribe({
            next: (precioCosto) => {
              this.snackBar.open('Precio de costo creado correctamente', 'CERRAR', {
                duration: 3000,
                panelClass: ['success-snackbar']
              });
              
              // Recargar la lista
              this.loadPreciosCosto(productoId, this.currentPage, this.pageSize);
              
              // Resetear el formulario
              this.precioCostoForm.reset({
                fuente: 'MANUAL',
                valor: 0,
                monedaId: '',
                activo: true
              });
              
              this.scrollToForm();
            },
            error: (error) => {
              console.error('Error creating precio costo:', error);
              this.snackBar.open('Error al crear precio de costo', 'CERRAR', {
                duration: 5000,
                panelClass: ['error-snackbar']
              });
            }
          });
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
   * Actualiza un precio de costo existente
   */
  actualizarPrecioCosto(): void {
    if (this.precioCostoForm.valid && this.editingPrecioCostoId) {
      const formValue = this.precioCostoForm.value;
      
      const precioCostoData = {
        fuente: formValue.fuente,
        valor: formValue.valor,
        fecha: new Date(), // Fecha por defecto
        monedaId: formValue.monedaId,
        activo: formValue.activo
      };

      this.repository.updatePrecioCosto(this.editingPrecioCostoId, precioCostoData).subscribe({
        next: (precioCosto) => {
          this.snackBar.open('Precio de costo actualizado correctamente', 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          
          // Actualizar en la lista
          if (this.editingPrecioCostoId) {
            this.updatePrecioCostoInList(this.editingPrecioCostoId);
          }
          
          // Salir del modo edición
          this.cancelarEdicion();
        },
        error: (error) => {
          console.error('Error updating precio costo:', error);
          this.snackBar.open('Error al actualizar precio de costo', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      });
    }
  }

  /**
   * Actualiza un precio de costo en la lista local
   */
  private updatePrecioCostoInList(precioCostoId: number): void {
    // Usar take(1) para evitar múltiples suscripciones
    this.productoService.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
      if (productoId) {
        this.loadPreciosCosto(productoId, this.currentPage, this.pageSize);
      }
    });
  }

  /**
   * Elimina un precio de costo
   */
  eliminarPrecioCosto(precioCosto: PrecioCosto): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CONFIRMAR DESACTIVACIÓN',
        message: `¿Está seguro que desea desactivar el precio de costo de ${precioCosto.valor} ${precioCosto.moneda?.simbolo}?`,
        confirmText: 'DESACTIVAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && precioCosto.id) {
        this.repository.deletePrecioCosto(precioCosto.id).subscribe({
          next: () => {
            this.snackBar.open('Precio de costo desactivado correctamente', 'CERRAR', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            
            // Recargar la lista
            // Usar take(1) para evitar múltiples suscripciones
            this.productoService.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
              if (productoId) {
                this.loadPreciosCosto(productoId, this.currentPage, this.pageSize);
              }
            });
          },
          error: (error) => {
            console.error('Error deleting precio costo:', error);
            this.snackBar.open('Error al desactivar precio de costo', 'CERRAR', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      }
    });
  }

  /**
   * Cambia el estado activo/inactivo de un precio de costo
   */
  toggleActivo(precioCosto: PrecioCosto): void {
    const newActivo = !precioCosto.activo;
    const action = newActivo ? 'activar' : 'desactivar';
    
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CONFIRMAR CAMBIO',
        message: `¿Está seguro que desea ${action} este precio de costo?`,
        confirmText: 'CONFIRMAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && precioCosto.id) {
        this.repository.updatePrecioCosto(precioCosto.id, { activo: newActivo }).subscribe({
          next: () => {
            this.snackBar.open(`Precio de costo ${action}do correctamente`, 'CERRAR', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            
            // Actualizar en la lista
            this.updatePrecioCostoInList(precioCosto.id);
          },
          error: (error) => {
            console.error('Error updating precio costo activo:', error);
            this.snackBar.open(`Error al ${action} precio de costo`, 'CERRAR', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
      }
    });
  }

  /**
   * Edita un precio de costo existente
   */
  editarPrecioCosto(precioCosto: PrecioCosto): void {
    this.isEditing = true;
    this.editingPrecioCostoId = precioCosto.id || null;
    this.cargarDatosEnFormulario(precioCosto);
    this.scrollToForm();
  }

  /**
   * Carga los datos de un precio de costo en el formulario
   */
  private cargarDatosEnFormulario(precioCosto: PrecioCosto): void {
    this.precioCostoForm.patchValue({
      fuente: precioCosto.fuente,
      valor: precioCosto.valor,
      monedaId: precioCosto.moneda?.id,
      activo: precioCosto.activo
    });
  }

  /**
   * Cancela la edición
   */
  cancelarEdicion(): void {
    this.isEditing = false;
    this.editingPrecioCostoId = null;
    this.precioCostoForm.reset({
      fuente: 'MANUAL',
      valor: 0,
      monedaId: '',
      activo: true
    });
  }

  /**
   * Hace scroll al formulario
   */
  private scrollToForm(): void {
    setTimeout(() => {
      const formElement = document.querySelector('.form-card');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }
}
