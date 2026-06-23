import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { Presentacion } from 'src/app/database/entities/productos/presentacion.entity';
import { PrecioVenta } from 'src/app/database/entities/productos/precio-venta.entity';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';
import { RepositoryService } from 'src/app/database/repository.service';
import { thumbUrl, resolveAppUrl } from 'src/app/shared/utils/image-url.util';
import { GestionarProductoService } from '../../services/gestionar-producto.service';
import { PrecioVentaDialogComponent } from '../precio-venta-dialog/precio-venta-dialog.component';
import { CodigoBarraDialogComponent } from '../codigo-barra-dialog/codigo-barra-dialog.component';

@Component({
  selector: 'app-producto-presentaciones-precios',
  templateUrl: './producto-presentaciones-precios.component.html',
  styleUrls: ['./producto-presentaciones-precios.component.scss']
})
export class ProductoPresentacionesPreciosComponent implements OnInit, OnDestroy {

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  presentaciones: Presentacion[] = [];
  isLoading = false;
  
  // Propiedades para el tipo de producto
  productoType: ProductoTipo | null = null;
  esVendible = false;
  
  // Propiedades computadas para evitar llamadas directas en template
  shouldShowPreciosVenta = false;
  displayedColumns: string[] = ['id', 'nombre', 'cantidad', 'codigoPrincipal', 'principal', 'activo', 'acciones'];
  
  // Paginación
  totalPresentaciones = 0;
  pageSize = 10;
  pageSizeOptions = [5, 10, 25, 50];
  currentPage = 0;
  
  // Filtro de estado
  filtroActivo = 'activos'; // 'activos', 'inactivos', 'todos'
  filtroActivoControl = new FormControl('activos');
  
  // Formulario para nueva presentación
  presentacionForm!: FormGroup;
  
  // Modo de edición
  isEditing = false;
  editingPresentacionId: number | null = null;
  
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
    // Suscribirse al productoId para cargar presentaciones cuando esté disponible
    this.productoService.productoId$.subscribe(productoId => {
      if (productoId) {
        this.loadPresentaciones(productoId);
      }
    });

    // Suscribirse al estado de carga para inicializar propiedades cuando el formulario esté listo
    this.productoService.isLoading$.subscribe(isLoading => {
      if (!isLoading) {
        // El formulario está listo, inicializar propiedades
        setTimeout(() => {
          const initialFormValue = this.productoService.informacionPrincipalForm.value;
          if (initialFormValue.tipo) {
            this.productoType = initialFormValue.tipo;
            this.esVendible = initialFormValue.esVendible;
            this.updateComputedProperties();
          }
        }, 200);
      }
    });

    // Suscribirse a los cambios del formulario principal para obtener el tipo y si es vendible
    this.productoService.informacionPrincipalForm.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(formValue => {
      this.productoType = formValue.tipo;
      this.esVendible = formValue.esVendible;
      this.updateComputedProperties();
    });

    // Inicializar propiedades computadas con valores por defecto
    this.updateComputedProperties();

    // Suscribirse al valor inicial del formulario para inicializar propiedades
    setTimeout(() => {
      const initialFormValue = this.productoService.informacionPrincipalForm.value;
      if (initialFormValue.tipo) {
        this.productoType = initialFormValue.tipo;
        this.esVendible = initialFormValue.esVendible;
        this.updateComputedProperties();
      }
    }, 100);

    // Suscribirse al cambio del filtro
    this.filtroActivoControl.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe(value => {
      if (value) {
        this.filtroActivo = value;
        this.onFiltroChange();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.presentacionForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(255)]],
      cantidad: [1, [Validators.required, Validators.min(0.001)]],
      principal: [false],
      activo: [true],
      imageUrl: [null]
    });
  }

  onPresentacionImagenUploaded(event: { url: string }): void {
    this.presentacionForm.patchValue({ imageUrl: event.url });
    this.presentacionForm.markAsDirty();
  }

  onPresentacionImagenRemoved(): void {
    this.presentacionForm.patchValue({ imageUrl: null });
    this.presentacionForm.markAsDirty();
  }

  thumbForPresentacion(url?: string | null): string | undefined {
    return thumbUrl(url) || resolveAppUrl(url ?? undefined);
  }

  onThumbErrorPres(event: Event, originalUrl?: string | null): void {
    // F4: fallback al original tambien resuelto via proxy en mode=client.
    const img = event.target as HTMLImageElement;
    const fallback = resolveAppUrl(originalUrl);
    if (fallback && img.src !== fallback) {
      img.src = fallback;
    }
  }

  /**
   * Carga las presentaciones del producto actual
   */
  private loadPresentaciones(productoId: number, page = 0, pageSize = 10): void {
    this.isLoading = true;
    this.repository.getPresentacionesByProducto(productoId, page, pageSize, this.filtroActivo).subscribe({
      next: (response) => {
        this.presentaciones = response.data || response;
        this.totalPresentaciones = response.total || this.presentaciones.length;
        this.currentPage = page;
        this.pageSize = pageSize;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error cargando presentaciones:', error);
        this.snackBar.open('Error al cargar las presentaciones', 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  /**
   * Maneja el cambio de página
   */
  onPageChange(event: PageEvent): void {
    this.productoService.productoId$.subscribe(productoId => {
      if (productoId) {
        this.loadPresentaciones(productoId, event.pageIndex, event.pageSize);
      }
    });
  }

  /**
   * Maneja el cambio de filtro de estado
   */
  onFiltroChange(): void {
    this.currentPage = 0; // Resetear a la primera página
    this.productoService.productoId$.subscribe(productoId => {
      if (productoId) {
        this.loadPresentaciones(productoId, 0, this.pageSize);
      }
    });
  }

  /**
   * Crea una nueva presentación
   */
  crearPresentacion(): void {
    if (this.presentacionForm.invalid) {
      this.presentacionForm.markAllAsTouched();
      return;
    }

    // Obtener el productoId actual
    this.productoService.productoId$.subscribe(productoId => {
      if (!productoId) {
        this.snackBar.open('No hay producto seleccionado', 'Cerrar', { duration: 3000 });
        return;
      }

      // Preparar los datos de la presentación
      const formValue = this.presentacionForm.value;
      const presentacionData = {
        nombre: (formValue.nombre.trim() || 'N/A').toUpperCase(), // Si no hay nombre, usar 'N/A'
        cantidad: formValue.cantidad,
        principal: formValue.principal,
        activo: formValue.activo,
        productoId: productoId,
        imageUrl: formValue.imageUrl ?? null
      };

      this.isLoading = true;
      this.repository.createPresentacion(presentacionData).subscribe({
        next: (presentacion) => {
          // Recargar las presentaciones para obtener los datos actualizados
          this.productoService.productoId$.subscribe(productoId => {
            if (productoId) {
              this.loadPresentaciones(productoId, this.currentPage, this.pageSize);
            }
          });
          
          this.presentacionForm.reset({
            nombre: '',
            cantidad: 1,
            principal: false,
            activo: true,
            imageUrl: null
          });
          
          const mensaje = formValue.principal 
            ? 'Presentación creada y marcada como principal exitosamente'
            : 'Presentación creada exitosamente';
          
          this.snackBar.open(mensaje, 'Cerrar', { duration: 3000 });
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error creando presentación:', error);
          this.snackBar.open('Error al crear la presentación', 'Cerrar', { duration: 3000 });
          this.isLoading = false;
        }
      });
    });
  }

  /**
   * Marca una presentación como principal
   */
  marcarComoPrincipal(presentacion: Presentacion): void {
    // Verificar que la presentación esté activa
    if (!presentacion.activo) {
      this.snackBar.open('No se puede marcar como principal una presentación inactiva', 'Cerrar', { duration: 3000 });
      return;
    }

    // Verificar que no sea ya la principal
    if (presentacion.principal) {
      this.snackBar.open('Esta presentación ya es la principal', 'Cerrar', { duration: 3000 });
      return;
    }

    this.isLoading = true;
    this.repository.setPresentacionPrincipal(presentacion.id!).subscribe({
      next: (response) => {
        if (response.success) {
          // Actualizar la UI localmente
          this.presentaciones.forEach(p => p.principal = false);
          presentacion.principal = true;
          
          this.snackBar.open(response.message || 'Presentación marcada como principal', 'Cerrar', { duration: 3000 });
        } else {
          this.snackBar.open(response.message || 'Error al marcar como principal', 'Cerrar', { duration: 3000 });
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error marcando presentación como principal:', error);
        this.snackBar.open('Error al marcar como principal', 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  /**
   * Actualiza solo una presentación específica en la lista
   */
  private updatePresentacionInList(presentacionId: number): void {
    this.repository.getPresentacion(presentacionId).subscribe({
      next: (response) => {
        if (response.success && response.presentacion) {
          // Encontrar y actualizar la presentación en la lista
          const index = this.presentaciones.findIndex(p => p.id === presentacionId);
          if (index !== -1) {
            this.presentaciones[index] = response.presentacion;
            // Trigger change detection
            this.presentaciones = [...this.presentaciones];
          }
        }
      },
      error: (error) => {
        console.error('Error updating presentacion in list:', error);
        // Fallback: recargar toda la lista si hay error
        this.productoService.productoId$.subscribe(productoId => {
          if (productoId) {
            this.loadPresentaciones(productoId, this.currentPage, this.pageSize);
          }
        });
      }
    });
  }

  /**
   * Abre el diálogo para gestionar precios de una presentación
   */
  gestionarPrecios(presentacion: Presentacion): void {
    const dialogRef = this.dialog.open(PrecioVentaDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      height: '80vh',
      data: {
        entityId: presentacion.id,
        entityName: presentacion.nombre,
        entityType: 'presentacion' as const,
        relationField: 'presentacionId' as const,
        recetaId: 0,
      },
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Actualizar solo la presentación específica
        this.updatePresentacionInList(presentacion.id!);
      }
    });
  }

  /**
   * Elimina una presentación
   */
  eliminarPresentacion(presentacion: Presentacion): void {
    // Verificar si es la presentación principal
    if (presentacion.principal) {
      this.snackBar.open('No se puede eliminar la presentación principal', 'Cerrar', { duration: 3000 });
      return;
    }

    const mensaje = `¿Está seguro de eliminar la presentación "${presentacion.nombre}"?`;
    if (confirm(mensaje)) {
      // TODO: Implementar eliminación en el backend
      this.presentaciones = this.presentaciones.filter(p => p.id !== presentacion.id);
      this.snackBar.open(`Presentación "${presentacion.nombre}" eliminada`, 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Actualiza las propiedades computadas basadas en el tipo de producto
   */
  private updateComputedProperties(): void {
    // Calcular si se deben mostrar precios de venta
    if (this.productoType === ProductoTipo.RETAIL_INGREDIENTE) {
      this.shouldShowPreciosVenta = this.esVendible;
    } else if (this.productoType === ProductoTipo.RETAIL) {
      this.shouldShowPreciosVenta = true;
    } else if (this.productoType === ProductoTipo.BUFFET_POR_PESO) {
      // Buffet: el precio por kilo (+ tope/mínimo) se gestiona en la presentación.
      this.shouldShowPreciosVenta = true;
    } else {
      this.shouldShowPreciosVenta = false;
    }
    
    // Actualizar las columnas mostradas
    this.updateDisplayedColumns();
  }

  /**
   * Actualiza las columnas mostradas según el tipo de producto
   */
  private updateDisplayedColumns(): void {
    const baseColumns = ['id', 'nombre', 'cantidad', 'codigoPrincipal', 'principal', 'activo', 'acciones'];
    
    // Agregar columna de precios solo si se deben mostrar
    if (this.shouldShowPreciosVenta) {
      baseColumns.splice(3, 0, 'precioPrincipal'); // Insertar después de 'cantidad'
    }
    
    this.displayedColumns = baseColumns;
  }

  /**
   * Obtiene el stock actual de una presentación
   */
  getStockActual(presentacion: Presentacion): string {
    // TODO: Implementar cálculo de stock
    return '0 Unid.';
  }

  /**
   * Abre el diálogo para gestionar códigos de barras de una presentación
   */
  gestionarCodigos(presentacion: Presentacion): void {
    const dialogRef = this.dialog.open(CodigoBarraDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      height: '80vh',
      data: { presentacion: presentacion },
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Actualizar solo la presentación específica
        this.updatePresentacionInList(presentacion.id!);
      }
    });
  }

  /**
   * Cambia el estado activo de una presentación
   */
  toggleActivo(presentacion: Presentacion): void {
    // Verificar si es la presentación principal
    if (presentacion.principal) {
      this.snackBar.open('No se puede desactivar la presentación principal. Primero debe marcar otra presentación como principal.', 'Cerrar', { duration: 4000 });
      return;
    }

    this.isLoading = true;
    this.repository.togglePresentacionActivo(presentacion.id!).subscribe({
      next: (response) => {
        if (response.success) {
          // Actualizar la UI localmente
          presentacion.activo = !presentacion.activo;
          
          // Si se activó y es la única activa, marcarla como principal
          if (presentacion.activo && response.presentacion?.principal) {
            presentacion.principal = true;
            // Desmarcar otras presentaciones como principales
            this.presentaciones.forEach(p => {
              if (p.id !== presentacion.id) {
                p.principal = false;
              }
            });
          }
          
          this.snackBar.open(response.message || 'Estado de presentación actualizado', 'Cerrar', { duration: 3000 });
        } else {
          this.snackBar.open(response.message || 'Error al cambiar el estado', 'Cerrar', { duration: 3000 });
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error cambiando estado de presentación:', error);
        this.snackBar.open('Error al cambiar el estado de la presentación', 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  /**
   * Abre el diálogo para editar una presentación
   */
  editarPresentacion(presentacion: Presentacion): void {
    // Cargar datos de la presentación en el formulario
    this.cargarDatosEnFormulario(presentacion);
  }

  /**
   * Carga los datos de una presentación en el formulario para edición
   */
  private cargarDatosEnFormulario(presentacion: Presentacion): void {
    this.isEditing = true;
    this.editingPresentacionId = presentacion.id || null;
    
    this.presentacionForm.patchValue({
      nombre: presentacion.nombre,
      cantidad: presentacion.cantidad,
      principal: presentacion.principal,
      activo: presentacion.activo,
      imageUrl: (presentacion as any).imageUrl ?? null
    });
    
    // Hacer scroll al formulario
    this.scrollToForm();
  }

  /**
   * Actualiza una presentación existente
   */
  actualizarPresentacion(): void {
    if (this.presentacionForm.invalid) {
      this.presentacionForm.markAllAsTouched();
      return;
    }

    if (!this.editingPresentacionId) {
      this.snackBar.open('Error: No hay presentación seleccionada para editar', 'Cerrar', { duration: 3000 });
      return;
    }

    const formValue = this.presentacionForm.value;
    const presentacionData = {
      nombre: (formValue.nombre.trim() || 'N/A').toUpperCase(), // Si no hay nombre, usar 'N/A'
      cantidad: formValue.cantidad,
      principal: formValue.principal,
      activo: formValue.activo,
      imageUrl: formValue.imageUrl ?? null
    };

    this.isLoading = true;
    this.repository.updatePresentacion(this.editingPresentacionId, presentacionData).subscribe({
      next: (response) => {
        // Recargar las presentaciones para obtener los datos actualizados
        this.productoService.productoId$.subscribe(productoId => {
          if (productoId) {
            this.loadPresentaciones(productoId, this.currentPage, this.pageSize);
          }
        });
        
        this.cancelarEdicion();
        
        const mensaje = formValue.principal 
          ? 'Presentación actualizada y marcada como principal exitosamente'
          : 'Presentación actualizada exitosamente';
        
        this.snackBar.open(mensaje, 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error actualizando presentación:', error);
        this.snackBar.open('Error al actualizar la presentación', 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  /**
   * Cancela la edición y resetea el formulario
   */
  cancelarEdicion(): void {
    this.isEditing = false;
    this.editingPresentacionId = null;
    this.presentacionForm.reset({
      nombre: '',
      cantidad: 1,
      principal: false,
      activo: true,
      imageUrl: null
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
