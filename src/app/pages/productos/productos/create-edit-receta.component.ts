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
import { Ingrediente } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom, Subscription } from 'rxjs';
import { VariationDialogComponent } from './variation-dialog.component';

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
    MatCardModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.editMode ? 'Editar' : 'Crear' }} Receta</h2>

    <div mat-dialog-content>
      <!-- Basic recipe info -->
      <form [formGroup]="recetaForm">
        <div class="form-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Nombre</mat-label>
            <input matInput formControlName="nombre" placeholder="Nombre de la receta">
            <mat-error *ngIf="recetaForm.get('nombre')?.hasError('required')">
              El nombre es requerido
            </mat-error>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Modo de Preparación</mat-label>
            <textarea matInput formControlName="modo_preparo" placeholder="Instrucciones de preparación" rows="3"></textarea>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-checkbox formControlName="activo" color="primary">
            Activo
          </mat-checkbox>
        </div>
      </form>

      <mat-divider class="section-divider"></mat-divider>

      <!-- Variations section -->
      <div class="section-header">
        <h3>Variaciones de la Receta</h3>
        <button
          mat-raised-button
          color="primary"
          (click)="addVariation()"
          [disabled]="loading || (!data.editMode && !recetaCreated)"
          matTooltip="{{ (!data.editMode && !recetaCreated) ? 'Guarde la receta primero para agregar variaciones' : 'Agregar nueva variación' }}"
        >
          <mat-icon>add</mat-icon> Agregar Variación
        </button>
      </div>

      <div *ngIf="loading" class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
      </div>

      <div *ngIf="!loading && variaciones.length === 0" class="no-data">
        {{ (!data.editMode && !recetaCreated) ? 'Guarde la receta primero para agregar variaciones' : 'No hay variaciones disponibles' }}
      </div>

      <div *ngIf="!loading && variaciones.length > 0" class="variations-container">
        <mat-card *ngFor="let variacion of variaciones; let i = index" class="variation-card" [class.inactive-card]="!variacion.activo">
          <mat-card-header>
            <mat-card-title>
              {{ variacion.nombre }}
              <span class="status-badge" [class.active]="variacion.activo" [class.inactive]="!variacion.activo">
                {{ variacion.activo ? 'Activo' : 'Inactivo' }}
              </span>
            </mat-card-title>
            <mat-card-subtitle>
              <span class="costo-badge">Costo: {{ variacion.costo | currency }}</span>
              <span class="items-badge" *ngIf="getVariationIngredients(variacion.id).length > 0">
                {{ getVariationIngredients(variacion.id).length }} ingrediente(s)
              </span>
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content *ngIf="variacion.descripcion">
            <p>{{ variacion.descripcion }}</p>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button color="primary" (click)="editVariation(variacion)">
              <mat-icon>edit</mat-icon> Editar
            </button>
            <button mat-button color="warn" (click)="deleteVariation(variacion)">
              <mat-icon>delete</mat-icon> Eliminar
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>

    <div mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="recetaForm.invalid || loading">
        <mat-spinner *ngIf="loading" diameter="20"></mat-spinner>
        <span *ngIf="!loading">{{ data.editMode ? 'Actualizar' : 'Guardar' }}</span>
      </button>
    </div>
  `,
  styles: [`
    .form-row {
      margin-bottom: 16px;
    }

    .full-width {
      width: 100%;
    }

    mat-dialog-content {
      min-height: 400px;
      max-height: 70vh;
    }

    button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    .section-divider {
      margin: 24px 0;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 24px;
    }

    .no-data {
      text-align: center;
      padding: 16px;
      color: rgba(0, 0, 0, 0.54);
    }

    .variations-container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .variation-card {
      margin-bottom: 16px;
      border-left: 4px solid #2e7d32;
    }

    .inactive-card {
      border-left-color: #c62828;
      opacity: 0.7;
    }

    .status-badge {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      margin-left: 8px;
    }

    .active {
      background-color: #e6f7e6;
      color: #2e7d32;
    }

    .inactive {
      background-color: #ffebee;
      color: #c62828;
    }

    .costo-badge {
      font-weight: 500;
      margin-right: 16px;
    }

    .items-badge {
      background-color: #e3f2fd;
      color: #1565c0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    mat-card-content {
      margin-top: 8px;
      white-space: pre-line;
    }
  `]
})
export class CreateEditRecetaComponent implements OnInit, OnDestroy {
  recetaForm: FormGroup;
  variationForms: FormGroup[] = [];
  loading = false;
  savingReceta = false;
  recetaCreated = false;
  recetaId?: number;
  variaciones: RecetaVariacion[] = [];
  variacionItems: { [key: number]: RecetaVariacionItem[] } = {};
  ingredientes: Ingrediente[] = [];

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
      activo: [true]
    });
  }

  ngOnInit(): void {
    if (this.data.editMode && this.data.receta) {
      this.recetaId = this.data.receta.id;
      this.recetaForm.patchValue({
        nombre: this.data.receta.nombre,
        modo_preparo: this.data.receta.modo_preparo || '',
        activo: this.data.receta.activo
      });

      this.loadRecetaVariaciones();
    }

    this.loadIngredientes();
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
    // Create a new variation
    if (!this.recetaId) return;

    this.loading = true;

    const newVariation: Partial<RecetaVariacion> = {
      nombre: 'Nueva Variación',
      activo: true,
      recetaId: this.recetaId,
      costo: 0
    };

    this.repositoryService.createRecetaVariacion(newVariation)
      .subscribe({
        next: (variation) => {
          this.variaciones.push(variation);
          this.variacionItems[variation.id] = [];
          this.loading = false;

          // Immediately open the edit dialog for the new variation
          this.editVariation(variation);

          this.snackBar.open('Variación creada exitosamente', 'Cerrar', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error creating variation:', error);
          this.snackBar.open('Error al crear variación', 'Cerrar', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  editVariation(variacion: RecetaVariacion): void {
    this.openVariationDialog(variacion);
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

  updateVariationCost(variacionId: number): void {
    // Calculate total cost based on ingredients
    const items = this.variacionItems[variacionId] || [];
    let totalCost = 0;

    for (const item of items) {
      if (item.ingrediente && item.ingrediente.costo) {
        totalCost += item.cantidad * item.ingrediente.costo;
      }
    }

    // Update the variation cost
    const variationIndex = this.variaciones.findIndex(v => v.id === variacionId);
    if (variationIndex !== -1) {
      this.loading = true;

      this.repositoryService.updateRecetaVariacion(variacionId, { costo: totalCost })
        .subscribe({
          next: (updatedVariation) => {
            // Update the variation in the array with spread operator maintaining the object type
            this.variaciones[variationIndex].costo = updatedVariation.costo;
            this.loading = false;
          },
          error: (error) => {
            console.error('Error updating variation cost:', error);
            this.loading = false;
          }
        });
    }
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
            nombre: formValues.nombre,
            modo_preparo: formValues.modo_preparo,
            activo: formValues.activo
          })
        );
        this.snackBar.open('Receta actualizada exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new receta
        const newReceta = await firstValueFrom(
          this.repositoryService.createReceta({
            nombre: formValues.nombre,
            modo_preparo: formValues.modo_preparo,
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
}
