import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Presentacion, TipoMedida, MetodoCalculo } from '../../../database/entities/productos/presentacion.entity';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { Codigo } from '../../../database/entities/productos/codigo.entity';
import { RepositoryService } from '../../../database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditPrecioVentaComponent } from '../productos/create-edit-precio-venta/create-edit-precio-venta.component';
import { CreateEditCodigoComponent } from '../productos/create-edit-codigo/create-edit-codigo.component';

@Component({
  selector: 'app-simple-presencation-section',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatDialogModule,
    MatCheckboxModule,
    ReactiveFormsModule,
    MatMenuModule,
    CreateEditPrecioVentaComponent,
    CreateEditCodigoComponent
  ],
  templateUrl: './simple-presencation-section.component.html',
  styleUrls: ['./simple-presencation-section.component.scss']
})
export class SimplePresentationSectionComponent implements OnInit, OnDestroy {
  // Input property to receive the product ID
  @Input() productoId: number | null = null;

  // Presentacion data
  presentaciones: Presentacion[] = [];
  
  // Precio & Codigo data
  preciosByPresentacion: Map<number, PrecioVenta[]> = new Map();
  codigosByPresentacion: Map<number, Codigo[]> = new Map();
  
  // Tab selection with getter/setter for proper handling
  private _selectedTabIndex = 0;
  get selectedTabIndex(): number {
    return this._selectedTabIndex;
  }
  set selectedTabIndex(value: number) {
    // Check if leaving a tab with unsaved changes
    if (this._selectedTabIndex !== value && this.presentaciones.length > 0) {
      const previousPresentacion = this.presentaciones[this._selectedTabIndex];
      
      if (previousPresentacion &&
          this.unsavedChanges.get(previousPresentacion.id) &&
          this.isNewTab.get(previousPresentacion.id)) {
        // Show warning dialog
        this.showUnsavedChangesDialog(this._selectedTabIndex, value);
        return;
      }
    }
    
    this._selectedTabIndex = value;
  }

  // Form state tracking
  presentacionForms: Map<number, FormGroup> = new Map();
  unsavedChanges: Map<number, boolean> = new Map();
  isNewTab: Map<number, boolean> = new Map();

  // Constants for enum values
  readonly tipoMedidaOptions = Object.values(TipoMedida);
  readonly metodoCalculoOptions = Object.values(MetodoCalculo);

  // Destroy subject for unsubscribing
  private destroy$ = new Subject<void>();

  constructor(
    private repositoryService: RepositoryService,
    private formBuilder: FormBuilder,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // Load presentations if product ID is provided
    if (this.productoId) {
      this.loadPresentaciones();
    }
  }

  ngOnDestroy(): void {
    // Complete the destroy subject to avoid memory leaks
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Loads presentations related to the current product ID
   */
  loadPresentaciones(): void {
    if (this.productoId) {
      // Use repository service to get presentations by product ID
      this.repositoryService.getPresentacionesByProducto(this.productoId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (presentaciones) => {
            this.presentaciones = presentaciones;

            // Create form for each presentacion
            this.presentaciones.forEach(presentacion => {
              this.createFormForPresentacion(presentacion);
              // Load precios and codigos for this presentation
              this.loadPreciosByPresentacion(presentacion.id);
              this.loadCodigosByPresentacion(presentacion.id);
            });
          },
          error: (error) => {
            console.error('Error loading presentations:', error);
          }
        });
    }
  }

  /**
   * Creates a form for a presentation
   */
  createFormForPresentacion(presentacion: Presentacion): void {
    const form = this.formBuilder.group({
      id: [presentacion.id],
      descripcion: [presentacion.descripcion || ''],
      tipoMedida: [presentacion.tipoMedida || TipoMedida.UNIDAD, Validators.required],
      cantidad: [presentacion.cantidad || 1, [Validators.required, Validators.min(0.01)]],
      principal: [presentacion.principal || false],
      activo: [presentacion.activo !== undefined ? presentacion.activo : true],
      isSabores: [presentacion.isSabores || false],
      metodoCalculo: [presentacion.metodoCalculo || null]
    });

    // Add form to the map using presentation ID as key
    this.presentacionForms.set(presentacion.id, form);
    this.unsavedChanges.set(presentacion.id, false);
    this.isNewTab.set(presentacion.id, false);

    // Subscribe to form value changes to detect modifications
    form.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.unsavedChanges.set(presentacion.id, true);
      });
  }

  /**
   * Creates a new presentation with default values
   */
  createNewPresentacion(): void {
    if (!this.productoId) return;

    // Create a new presentation instance with default values
    const newPresentacion = new Presentacion();
    newPresentacion.id = -Date.now(); // Temporary negative ID for new items
    newPresentacion.productoId = this.productoId;
    newPresentacion.tipoMedida = TipoMedida.UNIDAD;
    newPresentacion.cantidad = 1;
    newPresentacion.activo = true;
    newPresentacion.principal = this.presentaciones.length === 0; // First one is principal

    // Add to the array of presentations
    this.presentaciones.push(newPresentacion);

    // Create and configure the form
    this.createFormForPresentacion(newPresentacion);
    this.isNewTab.set(newPresentacion.id, true);

    // Switch to the new tab
    setTimeout(() => {
      this._selectedTabIndex = this.presentaciones.length - 1;
      this.cdr.detectChanges();
    }, 50);
  }

  /**
   * Shows dialog warning about unsaved changes
   */
  showUnsavedChangesDialog(previousIndex: number, newIndex: number): void {
    // In a real implementation, this would use MatDialog to show a confirmation dialog
    // For simplicity, we're using window.confirm
    const confirmed = window.confirm('You have unsaved changes. Discard changes?');

    if (confirmed) {
      // If user confirms, allow tab switch and remove the new tab if needed
      if (this.isNewTab.get(this.presentaciones[previousIndex].id)) {
        this.presentaciones.splice(previousIndex, 1);
        this._selectedTabIndex = newIndex > previousIndex ? newIndex - 1 : newIndex;
      } else {
        this._selectedTabIndex = newIndex;
      }
      this.cdr.detectChanges();
    } else {
      // Stay on current tab
      this._selectedTabIndex = previousIndex;
      this.cdr.detectChanges();
    }
  }

  /**
   * Saves or updates a presentation
   */
  savePresentacion(index: number): void {
    const presentacion = this.presentaciones[index];
    const form = this.presentacionForms.get(presentacion.id);

    if (form && form.valid) {
      // set descripcion to uppercase
      form.get('descripcion')?.setValue(form.get('descripcion')?.value.toUpperCase());
      const formValue = form.value;

      // Update presentation with form values
      Object.assign(presentacion, formValue);

      // Check if this is a new presentation or an update
      const isNew = this.isNewTab.get(presentacion.id);

      if (isNew) {
        // Create new presentation
        this.repositoryService.createPresentacion({
          ...presentacion,
          // Exclude the temporary ID for new entities
          id: undefined
        })
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (savedPresentacion) => {
              // Remove the temporary ID entry
              this.presentacionForms.delete(presentacion.id);
              this.unsavedChanges.delete(presentacion.id);
              this.isNewTab.delete(presentacion.id);

              // Update with the real ID
              presentacion.id = savedPresentacion.id;

              // Re-create form mappings with the real ID
              this.createFormForPresentacion(savedPresentacion);
            },
            error: (error) => {
              console.error('Error saving presentation:', error);
            }
          });
      } else {
        // Update existing presentation
        this.repositoryService.updatePresentacion(presentacion.id, presentacion)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              // Mark as saved
              this.unsavedChanges.set(presentacion.id, false);
            },
            error: (error) => {
              console.error('Error updating presentation:', error);
            }
          });
      }
    }
  }

  /**
   * Cancels edits to a presentation
   */
  cancelEdit(index: number): void {
    const presentacion = this.presentaciones[index];

    if (this.isNewTab.get(presentacion.id)) {
      // Remove the new tab if it hasn't been saved
      this.presentaciones.splice(index, 1);
      this.presentacionForms.delete(presentacion.id);
      this.unsavedChanges.delete(presentacion.id);
      this.isNewTab.delete(presentacion.id);

      // Adjust selected index if needed
      if (index <= this._selectedTabIndex && this._selectedTabIndex > 0) {
        this._selectedTabIndex--;
        this.cdr.detectChanges();
      }
    } else {
      // For existing presentations, reload the data
      this.repositoryService.getPresentacion(presentacion.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (originalPresentacion) => {
            // Reset the form with original values
            this.presentacionForms.get(presentacion.id)?.reset({
              id: originalPresentacion.id,
              descripcion: originalPresentacion.descripcion || '',
              tipoMedida: originalPresentacion.tipoMedida || TipoMedida.UNIDAD,
              cantidad: originalPresentacion.cantidad || 1,
              principal: originalPresentacion.principal || false,
              activo: originalPresentacion.activo !== undefined ? originalPresentacion.activo : true,
              isSabores: originalPresentacion.isSabores || false,
              metodoCalculo: originalPresentacion.metodoCalculo || null
            });

            this.unsavedChanges.set(presentacion.id, false);
          },
          error: (error) => {
            console.error('Error loading original presentation:', error);
          }
        });
    }
  }

  /**
   * Deletes a presentation
   */
  deletePresentacion(index: number): void {
    const presentacionId = this.presentaciones[index].id;
    
    // show confirmation dialog and delete it from database using repository service
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar presentación',
        message: '¿Estás seguro de querer eliminar esta presentación?'
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Call repository service to delete presentation (cascade deletion handled by backend)
        this.repositoryService.deletePresentacion(presentacionId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              // Remove from UI
              this.presentaciones.splice(index, 1);
              
              // Reset _selectedTabIndex if necessary
              if (this.presentaciones.length <= this._selectedTabIndex) {
                this._selectedTabIndex = Math.max(0, this.presentaciones.length - 1);
                this.cdr.detectChanges();
              }
              
              // Clean up form state maps
              this.presentacionForms.delete(presentacionId);
              this.unsavedChanges.delete(presentacionId);
              this.isNewTab.delete(presentacionId);
            },
            error: (error) => {
              console.error(`Error deleting presentation ${presentacionId}:`, error);
              // Show error message to user
              this.dialog.open(ConfirmationDialogComponent, {
                data: {
                  title: 'Error',
                  message: 'No se pudo eliminar la presentación. Es posible que tenga registros relacionados.'
                }
              });
            }
          });
      }
    });
  }

  /**
   * Load prices for a specific presentation
   */
  loadPreciosByPresentacion(presentacionId: number): void {
    this.repositoryService.getPreciosVentaByPresentacion(presentacionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (precios) => {
          this.preciosByPresentacion.set(presentacionId, precios);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error(`Error loading prices for presentation ${presentacionId}:`, error);
        }
      });
  }

  /**
   * Load codes for a specific presentation
   */
  loadCodigosByPresentacion(presentacionId: number): void {
    this.repositoryService.getCodigosByPresentacion(presentacionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (codigos) => {
          this.codigosByPresentacion.set(presentacionId, codigos);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error(`Error loading codes for presentation ${presentacionId}:`, error);
        }
      });
  }

  /**
   * Opens the dialog to create or edit a price
   */
  openPrecioDialog(presentacion: Presentacion, precio?: PrecioVenta): void {
    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '50%',
      data: {
        presentacion: presentacion,
        precio: precio,
        editMode: !!precio
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        this.loadPreciosByPresentacion(presentacion.id);
      }
    });
  }

  /**
   * Opens the dialog to create or edit a code
   */
  openCodigoDialog(presentacion: Presentacion, codigo?: Codigo): void {
    const dialogRef = this.dialog.open(CreateEditCodigoComponent, {
      width: '50%',
      data: {
        presentacion: presentacion,
        codigo: codigo,
        editMode: !!codigo
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      this.loadCodigosByPresentacion(presentacion.id);
    });
  }

  /**
   * Deletes a price
   */
  deletePrecio(precio: PrecioVenta, presentacionId: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar precio',
        message: '¿Estás seguro de querer eliminar este precio?'
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.repositoryService.deletePrecioVenta(precio.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.loadPreciosByPresentacion(presentacionId);
            },
            error: (error) => {
              console.error(`Error deleting price ${precio.id}:`, error);
            }
          });
      }
    });
  }

  /**
   * Deletes a code
   */
  deleteCodigo(codigo: Codigo, presentacionId: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar código',
        message: '¿Estás seguro de querer eliminar este código?'
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.repositoryService.deleteCodigo(codigo.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.loadCodigosByPresentacion(presentacionId);
            },
            error: (error) => {
              console.error(`Error deleting code ${codigo.id}:`, error);
            }
          });
      }
    });
  }
} 