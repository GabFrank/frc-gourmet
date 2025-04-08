import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { RepositoryService } from '../../../database/repository.service';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from '../../../database/entities/productos/receta-variacion-item.entity';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom, Subscription } from 'rxjs';
import { VariationDialogComponent } from './variation-dialog.component';
import { CreateEditRecetaVariacionItemComponent } from './create-edit-receta-variacion-item/create-edit-receta-variacion-item.component';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { MatMenuModule } from '@angular/material/menu';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { CopyVariationDialogComponent } from './copy-variation-dialog.component';

interface DialogData {
  editMode: boolean;
  receta?: Receta;
}

@Component({
  selector: 'app-create-edit-receta',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTableModule,
    MatTooltipModule,
    MatExpansionModule,
    MatDividerModule,
    MatBadgeModule,
    MatListModule,
    MatCardModule,
    MatMenuModule,
    ConfirmationDialogComponent,
    CopyVariationDialogComponent
  ],
  providers: [
    FormBuilder
  ],
  templateUrl: './create-edit-receta.component.html',
  styleUrls: ['./create-edit-receta.component.scss']
})
export class CreateEditRecetaComponent implements OnInit, OnDestroy {
  recetaForm: FormGroup;
  variationForm: FormGroup;
  loading = false;
  savingReceta = false;
  recetaCreated = false;
  recetaId?: number;
  variaciones: RecetaVariacion[] = [];
  variacionItems: { [key: number]: RecetaVariacionItem[] } = {};
  ingredientes: Ingrediente[] = [];
  tipoMedidaOptions = Object.values(TipoMedida);
  monedas: Moneda[] = [];
  defaultMoneda?: Moneda;
  defaultMonedaSimbolo = '$';

  // New properties
  showNewVariationForm = false;
  savingVariation = false;
  sourceVariacionIdForCopy?: number;

  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.recetaForm = this.fb.group({
      nombre: ['', Validators.required],
      modo_preparo: [''],
      tipoMedida: [TipoMedida.UNIDAD],
      calcularCantidad: [false],
      cantidad: [0],
      activo: [true]
    });

    // Initialize variation form
    this.variationForm = this.fb.group({
      nombre: ['', Validators.required],
      descripcion: [''],
      activo: [true],
      principal: [false]
    });
  }

  ngOnInit(): void {
    if (this.data.editMode && this.data.receta) {
      this.recetaId = this.data.receta.id;
      this.recetaForm.patchValue({
        nombre: this.data.receta.nombre,
        modo_preparo: this.data.receta.modo_preparo || '',
        tipoMedida: this.data.receta.tipoMedida || TipoMedida.UNIDAD,
        calcularCantidad: this.data.receta.calcularCantidad || false,
        cantidad: this.data.receta.cantidad || 0,
        activo: this.data.receta.activo
      });

      this.loadRecetaVariaciones();
    }

    this.loadIngredientes();
    this.loadMonedas();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private loadIngredientes(): void {
    this.loading = true;
    this.subscriptions.add(
      this.repositoryService.getIngredientes()
        .subscribe({
          next: (ingredientes) => {
            this.ingredientes = ingredientes.filter(i => i.activo);
            this.loading = false;
          },
          error: (error) => {
            console.error('Error loading ingredientes:', error);
            this.snackBar.open('Error al cargar ingredientes', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        })
    );
  }

  private loadMonedas(): void {
    this.subscriptions.add(
      this.repositoryService.getMonedas()
        .subscribe({
          next: (monedas) => {
            this.monedas = monedas;
            // Find default moneda (principal == true)
            this.defaultMoneda = this.monedas.find(m => m.principal);
            // Pre-compute the default currency symbol
            this.defaultMonedaSimbolo = this.defaultMoneda ? this.defaultMoneda.simbolo : '$';
          },
          error: (error) => {
            console.error('Error loading monedas:', error);
          }
        })
    );
  }

  getDefaultMonedaSimbolo(): string {
    return this.defaultMonedaSimbolo;
  }

  getIngredientName(ingredienteId: number): string {
    const ingrediente = this.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.descripcion : 'Desconocido';
  }

  getIngredientTipoMedida(ingredienteId: number): string {
    const ingrediente = this.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.tipoMedida : '';
  }

  getIngredientMonedaSimbolo(ingredienteId: number): string {
    const ingrediente = this.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente?.moneda?.simbolo || this.defaultMonedaSimbolo;
  }

  getIngredientUnitCost(ingredienteId: number): number {
    const ingrediente = this.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.costo || 0 : 0;
  }

  getIngredientTotalCost(item: RecetaVariacionItem): number {
    const ingrediente = this.ingredientes.find(i => i.id === item.ingredienteId);
    if (!ingrediente || !item.activo) return 0;
    return (ingrediente.costo || 0) * item.cantidad;
  }

  calculateVariationTotalCost(variacionId: number): number {
    const items = this.getVariationIngredients(variacionId);
    let total = 0;

    for (const item of items) {
      if (item.activo) {
        total += this.getIngredientTotalCost(item);
      }
    }

    return total;
  }

  calculateSuggestedPrice(variacionId: number): number {
    const totalCost = this.calculateVariationTotalCost(variacionId);
    // Calculate the suggested price as total cost / 0.35
    // This implies a markup where the cost represents 35% of the final price
    return totalCost / 0.35;
  }

  private loadRecetaVariaciones(): void {
    if (!this.recetaId) return;

    this.loading = true;
    this.subscriptions.add(
      this.repositoryService.getRecetaVariaciones(this.recetaId)
        .subscribe({
          next: (variaciones) => {
            this.variaciones = variaciones;

            // Load ingredients for each variation
            variaciones.forEach(v => this.loadVariationIngredients(v.id));

            this.loading = false;
          },
          error: (error) => {
            console.error('Error loading variations:', error);
            this.snackBar.open('Error al cargar variaciones', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        })
    );
  }

  private loadVariationIngredients(variacionId: number): void {
    this.subscriptions.add(
      this.repositoryService.getRecetaVariacionItems(variacionId)
        .subscribe({
          next: (items) => {
            this.variacionItems[variacionId] = items;
          },
          error: (error) => {
            console.error(`Error loading variation items for variation ${variacionId}:`, error);
          }
        })
    );
  }

  getVariationIngredients(variacionId: number): RecetaVariacionItem[] {
    return this.variacionItems[variacionId] || [];
  }

  addVariation(): void {
    // Check if a receta has been created or if in edit mode
    if (!this.recetaId) return;

    // If there are no existing variations, just show the form without asking to copy
    if (this.variaciones.length === 0) {
      this.showNewVariationForm = true;
      this.resetVariationForm();
      return;
    }

    // Open the copy dialog
    const dialogRef = this.dialog.open(CopyVariationDialogComponent, {
      width: '400px',
      data: { variaciones: this.variaciones }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.showNewVariationForm = true;
        this.resetVariationForm();

        // If the user chose to copy ingredients from an existing variation
        if (result.shouldCopy && result.variacionId) {
          // Store the source variation ID for later use when saving
          this.sourceVariacionIdForCopy = result.variacionId;
        }
      }
    });
  }

  private resetVariationForm(): void {
    // Reset the form values
    this.variationForm.reset({
      nombre: '',
      descripcion: '',
      activo: true,
      principal: false
    });
  }

  cancelAddVariation(): void {
    this.showNewVariationForm = false;
    this.sourceVariacionIdForCopy = undefined;
  }

  saveNewVariation(): void {
    if (this.variationForm.invalid) {
      this.variationForm.markAllAsTouched();
      return;
    }

    if (!this.recetaId) return;

    this.savingVariation = true;

    const formValues = this.variationForm.value;
    const newVariation: Partial<RecetaVariacion> = {
      nombre: formValues.nombre.toUpperCase(),
      descripcion: formValues.descripcion ? formValues.descripcion.toUpperCase() : null,
      activo: formValues.activo,
      principal: formValues.principal,
      recetaId: this.recetaId,
      costo: 0 // Initial cost is 0
    };

    // If this variation is set as principal, we need to update any existing principal variation
    const updatePrincipal = formValues.principal && this.variaciones.some(v => v.principal);

    this.repositoryService.createRecetaVariacion(newVariation)
      .subscribe({
        next: (createdVariation) => {
          // If this is the principal variation, update any existing principal
          if (updatePrincipal) {
            const oldPrincipal = this.variaciones.find(v => v.principal);
            if (oldPrincipal) {
              this.repositoryService.updateRecetaVariacion(oldPrincipal.id, { principal: false })
                .subscribe({
                  next: () => {
                    console.log('Previous principal variation updated');
                  },
                  error: (error) => {
                    console.error('Error updating previous principal variation:', error);
                  }
                });
            }
          }

          // Check if we need to copy ingredients from a source variation
          if (this.sourceVariacionIdForCopy) {
            const sourceVariation = this.variaciones.find(v => v.id === this.sourceVariacionIdForCopy);
            if (sourceVariation) {
              // Get all ingredients from the source variation
              const sourceItems = this.variacionItems[sourceVariation.id] || [];

              // Create a copy of each item for the new variation
              const copyPromises = sourceItems.map(item => {
                const newItem: Partial<RecetaVariacionItem> = {
                  variacionId: createdVariation.id,
                  ingredienteId: item.ingredienteId,
                  cantidad: item.cantidad,
                  activo: item.activo
                };

                return firstValueFrom(this.repositoryService.createRecetaVariacionItem(newItem));
              });

              // Wait for all items to be copied
              Promise.all(copyPromises)
                .then(() => {
                  // Update the cost of the new variation
                  const totalCost = sourceItems.reduce((sum, item) => {
                    if (item.activo) {
                      const ingrediente = this.ingredientes.find(i => i.id === item.ingredienteId);
                      if (ingrediente) {
                        return sum + (ingrediente.costo || 0) * item.cantidad;
                      }
                    }
                    return sum;
                  }, 0);

                  this.repositoryService.updateRecetaVariacion(createdVariation.id, { costo: totalCost })
                    .subscribe({
                      next: () => {
                        console.log('Copied ingredients and updated variation cost');
                      },
                      error: (error) => {
                        console.error('Error updating variation cost after copying ingredients:', error);
                      }
                    });
                })
                .catch(error => {
                  console.error('Error copying ingredients:', error);
                });
            }
          }

          // Reset the copy source
          this.sourceVariacionIdForCopy = undefined;

          // Refresh variations list
          this.loadRecetaVariaciones();
          // Hide form
          this.showNewVariationForm = false;
          this.savingVariation = false;
          this.snackBar.open('Variación creada exitosamente', 'Cerrar', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error creating variation:', error);
          this.snackBar.open('Error al crear variación', 'Cerrar', { duration: 3000 });
          this.savingVariation = false;
        }
      });
  }

  editVariation(variacion: RecetaVariacion): void {
    this.openVariationDialog(variacion);
  }

  addIngredientToVariation(variacion: RecetaVariacion): void {
    // Open the ingredient dialog
    const dialogRef = this.dialog.open(CreateEditRecetaVariacionItemComponent, {
      width: '400px',
      data: {
        variacion: variacion,
        ingredientes: this.ingredientes
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loading = true;

        // Create new item
        const newItem: Partial<RecetaVariacionItem> = {
          variacionId: variacion.id,
          ingredienteId: result.ingredienteId,
          cantidad: result.cantidad,
          activo: true
        };

        this.repositoryService.createRecetaVariacionItem(newItem)
          .subscribe({
            next: (createdItem) => {
              // Add to local collection
              if (!this.variacionItems[variacion.id]) {
                this.variacionItems[variacion.id] = [];
              }
              this.variacionItems[variacion.id].push(createdItem);

              // Calculate the new total cost
              const newTotalCost = this.calculateVariationTotalCost(variacion.id);

              // Update the variation's cost in the database
              this.repositoryService.updateRecetaVariacion(variacion.id, {
                costo: newTotalCost
              }).subscribe({
                next: () => {
                  // Update the local variation object
                  const index = this.variaciones.findIndex(v => v.id === variacion.id);
                  if (index !== -1) {
                    this.variaciones[index].costo = newTotalCost;
                  }
                },
                error: (error) => {
                  console.error('Error updating variation cost:', error);
                }
              });

              this.loading = false;
              this.snackBar.open('Ingrediente agregado exitosamente', 'Cerrar', { duration: 3000 });
            },
            error: (error) => {
              console.error('Error adding ingredient:', error);
              this.snackBar.open('Error al agregar ingrediente', 'Cerrar', { duration: 3000 });
              this.loading = false;
            }
          });
      }
    });
  }

  deleteVariation(variacion: RecetaVariacion): void {
    const confirm = window.confirm(`¿Está seguro que desea eliminar la variación "${variacion.nombre}"?`);
    if (!confirm) return;

    this.loading = true;

    this.repositoryService.deleteRecetaVariacion(variacion.id)
      .subscribe({
        next: () => {
          // Remove from arrays
          const index = this.variaciones.findIndex(v => v.id === variacion.id);
          if (index !== -1) {
            this.variaciones.splice(index, 1);
          }

          // Remove items
          delete this.variacionItems[variacion.id];

          this.loading = false;
          this.snackBar.open('Variación eliminada exitosamente', 'Cerrar', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error deleting variation:', error);
          this.snackBar.open('Error al eliminar variación', 'Cerrar', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  private openVariationDialog(variacion: RecetaVariacion): void {
    const dialogRef = this.dialog.open(VariationDialogComponent, {
      width: '600px',
      data: {
        variacion: variacion,
        ingredientes: this.ingredientes,
        variacionItems: this.variacionItems[variacion.id] || []
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Refresh the variations when dialog is closed with result true
        this.loadRecetaVariaciones();
      }
    });
  }

  async save(): Promise<void> {
    if (this.recetaForm.invalid) {
      this.recetaForm.markAllAsTouched();
      return;
    }

    this.savingReceta = true;

    try {
      const formValues = this.recetaForm.value;

      if (this.data.editMode && this.data.receta && this.data.receta.id) {
        // Update existing receta
        await firstValueFrom(
          this.repositoryService.updateReceta(this.data.receta.id, {
            nombre: formValues.nombre.toUpperCase(),
            modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
            tipoMedida: formValues.tipoMedida,
            calcularCantidad: formValues.calcularCantidad,
            cantidad: formValues.cantidad,
            activo: formValues.activo
          })
        );
        this.snackBar.open('Receta actualizada exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new receta
        const newReceta = await firstValueFrom(
          this.repositoryService.createReceta({
            nombre: formValues.nombre.toUpperCase(),
            modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
            tipoMedida: formValues.tipoMedida,
            calcularCantidad: formValues.calcularCantidad,
            cantidad: formValues.cantidad,
            activo: formValues.activo
          })
        );
        this.recetaId = newReceta.id;
        this.recetaCreated = true;
        this.snackBar.open('Receta creada exitosamente. Ahora puede agregar variaciones.', 'Cerrar', { duration: 3000 });
      }
    } catch (error) {
      console.error('Error al guardar la receta:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingReceta = false;
    }
  }

  openVariacionItem(variacion: RecetaVariacion): void {
    // Open the ingredient dialog with increased width
    const dialogRef = this.dialog.open(CreateEditRecetaVariacionItemComponent, {
      width: '600px',
      data: {
        variacion: variacion,
        ingredientes: this.ingredientes
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Handle result if needed
        this.loadRecetaVariaciones();
      }
    });
  }

  editIngredient(variacion: RecetaVariacion, item: RecetaVariacionItem): void {
    const dialogRef = this.dialog.open(CreateEditRecetaVariacionItemComponent, {
      width: '600px',
      data: {
        variacion: variacion,
        ingredientes: this.ingredientes,
        itemId: item.id,
        ingredienteId: item.ingredienteId,
        cantidad: item.cantidad
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loading = true;

        // When editing, call the update service
        this.repositoryService.updateRecetaVariacionItem(item.id, {
          ingredienteId: result.ingredienteId,
          cantidad: result.cantidad
        }).subscribe({
          next: (updatedItem) => {
            // Update local data
            const variacionItems = this.variacionItems[variacion.id];
            const index = variacionItems.findIndex(i => i.id === item.id);
            if (index !== -1) {
              variacionItems[index] = updatedItem;
            }

            // Update variation cost
            const newTotalCost = this.calculateVariationTotalCost(variacion.id);
            this.repositoryService.updateRecetaVariacion(variacion.id, {
              costo: newTotalCost
            }).subscribe({
              next: () => {
                // Update local variation
                const variationIndex = this.variaciones.findIndex(v => v.id === variacion.id);
                if (variationIndex !== -1) {
                  this.variaciones[variationIndex].costo = newTotalCost;
                }
              },
              error: (error) => {
                console.error('Error updating variation cost:', error);
              }
            });

            this.loading = false;
            this.snackBar.open('Ingrediente actualizado exitosamente', 'Cerrar', { duration: 3000 });
          },
          error: (error) => {
            console.error('Error updating ingredient:', error);
            this.snackBar.open('Error al actualizar ingrediente', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        });
      }
    });
  }

  deleteIngredient(variacion: RecetaVariacion, item: RecetaVariacionItem): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Confirmar eliminación',
        message: '¿Está seguro que desea eliminar este ingrediente de la variación?'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Call service to delete the ingredient
        this.repositoryService.deleteRecetaVariacionItem(item.id).subscribe({
          next: () => {
            this.snackBar.open('Ingrediente eliminado correctamente', 'Cerrar', {
              duration: 3000
            });
            // Reload data
            this.loadRecetaVariaciones();
          },
          error: (error) => {
            console.error('Error deleting ingredient:', error);
            this.snackBar.open('Error al eliminar el ingrediente', 'Cerrar', {
              duration: 3000
            });
          }
        });
      }
    });
  }
}
