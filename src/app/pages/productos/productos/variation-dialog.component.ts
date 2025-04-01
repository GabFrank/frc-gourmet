import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RepositoryService } from '../../../database/repository.service';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from '../../../database/entities/productos/receta-variacion-item.entity';
import { Ingrediente } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  variacion: RecetaVariacion;
  ingredientes: Ingrediente[];
  variacionItems: RecetaVariacionItem[];
}

@Component({
  selector: 'app-variation-dialog',
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
    MatTableModule,
    MatDividerModule,
    MatTooltipModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isNewVariation ? 'Crear' : 'Editar' }} Variación</h2>

    <div mat-dialog-content>
      <form [formGroup]="variationForm">
        <div class="form-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Nombre</mat-label>
            <input matInput formControlName="nombre" placeholder="Nombre de la variación">
            <mat-error *ngIf="variationForm.get('nombre')?.hasError('required')">
              El nombre es requerido
            </mat-error>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Descripción</mat-label>
            <textarea matInput formControlName="descripcion" placeholder="Descripción de la variación" rows="2"></textarea>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-checkbox formControlName="activo" color="primary">
            Activo
          </mat-checkbox>
        </div>
      </form>

      <mat-divider class="section-divider"></mat-divider>

      <div class="section-header">
        <h3>Ingredientes</h3>
        <button mat-raised-button color="primary" (click)="addIngredient()" [disabled]="loading">
          <mat-icon>add</mat-icon> Agregar Ingrediente
        </button>
      </div>

      <div *ngIf="loading" class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
      </div>

      <div *ngIf="!loading && !items.length" class="no-data">
        No hay ingredientes añadidos a esta variación
      </div>

      <table mat-table [dataSource]="items" class="ingredients-table" *ngIf="!loading && items.length">
        <!-- Ingrediente Column -->
        <ng-container matColumnDef="ingrediente">
          <th mat-header-cell *matHeaderCellDef>Ingrediente</th>
          <td mat-cell *matCellDef="let item">{{ getIngredienteName(item.ingredienteId) }}</td>
        </ng-container>

        <!-- Cantidad Column -->
        <ng-container matColumnDef="cantidad">
          <th mat-header-cell *matHeaderCellDef>Cantidad</th>
          <td mat-cell *matCellDef="let item">{{ item.cantidad }}</td>
        </ng-container>

        <!-- Costo Column -->
        <ng-container matColumnDef="costo">
          <th mat-header-cell *matHeaderCellDef>Costo</th>
          <td mat-cell *matCellDef="let item">{{ calculateItemCost(item) | currency }}</td>
        </ng-container>

        <!-- Acciones Column -->
        <ng-container matColumnDef="acciones">
          <th mat-header-cell *matHeaderCellDef>Acciones</th>
          <td mat-cell *matCellDef="let item">
            <button mat-icon-button color="primary" (click)="editIngredient(item)" matTooltip="Editar">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button color="warn" (click)="deleteIngredient(item)" matTooltip="Eliminar">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
      </table>

      <div class="cost-summary" *ngIf="!loading && items.length">
        <strong>Costo Total: {{ totalCost | currency }}</strong>
      </div>
    </div>

    <div mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="variationForm.invalid || loading">
        <mat-spinner *ngIf="savingVariation" diameter="20"></mat-spinner>
        <span *ngIf="!savingVariation">Guardar</span>
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
      min-height: 300px;
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

    .ingredients-table {
      width: 100%;
      margin-bottom: 16px;
    }

    .cost-summary {
      text-align: right;
      padding: 8px 16px;
      font-size: 16px;
    }
  `]
})
export class VariationDialogComponent implements OnInit {
  variationForm: FormGroup;
  ingredientForm: FormGroup;
  loading = false;
  savingVariation = false;
  items: RecetaVariacionItem[] = [];
  isNewVariation = false;
  totalCost = 0;
  displayedColumns = ['ingrediente', 'cantidad', 'costo', 'acciones'];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<VariationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.variationForm = this.fb.group({
      nombre: ['', Validators.required],
      descripcion: [''],
      activo: [true]
    });

    this.ingredientForm = this.fb.group({
      ingredienteId: ['', Validators.required],
      cantidad: [1, [Validators.required, Validators.min(0.01)]]
    });

    this.isNewVariation = !data.variacion.id;
    this.items = [...data.variacionItems];
  }

  ngOnInit(): void {
    this.variationForm.patchValue({
      nombre: this.data.variacion.nombre,
      descripcion: this.data.variacion.descripcion || '',
      activo: this.data.variacion.activo
    });

    this.calculateTotalCost();
  }

  getIngredienteName(ingredienteId: number): string {
    const ingrediente = this.data.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.descripcion : 'Ingrediente desconocido';
  }

  calculateItemCost(item: RecetaVariacionItem): number {
    const ingrediente = this.data.ingredientes.find(i => i.id === item.ingredienteId);
    if (!ingrediente) return 0;
    return ingrediente.costo * item.cantidad;
  }

  calculateTotalCost(): void {
    this.totalCost = this.items.reduce((sum, item) => sum + this.calculateItemCost(item), 0);
  }

  addIngredient(): void {
    // Implement ingredient selection dialog
    // For now, we'll add a mock implementation
    if (this.data.ingredientes.length === 0) {
      this.snackBar.open('No hay ingredientes disponibles', 'Cerrar', { duration: 3000 });
      return;
    }

    // Open ingredient selection dialog
    // For simplicity, we'll just add the first ingredient
    const firstIngrediente = this.data.ingredientes[0];

    // Check if ingredient already exists
    const existingItem = this.items.find(item => item.ingredienteId === firstIngrediente.id);
    if (existingItem) {
      this.snackBar.open('Este ingrediente ya está agregado a la variación', 'Cerrar', { duration: 3000 });
      return;
    }

    const newItem: RecetaVariacionItem = {
      id: 0, // Temporary ID, will be replaced when saved to DB
      variacionId: this.data.variacion.id,
      ingredienteId: firstIngrediente.id,
      cantidad: 1,
      activo: true,
      createdAt: new Date(),
      updatedAt: new Date()
    } as RecetaVariacionItem;

    this.items.push(newItem);
    this.calculateTotalCost();
  }

  editIngredient(item: RecetaVariacionItem): void {
    // Implement ingredient editing
    // For now, we'll just show a message
    this.snackBar.open('Función de edición de ingredientes a implementar', 'Cerrar', { duration: 3000 });
  }

  deleteIngredient(item: RecetaVariacionItem): void {
    const index = this.items.findIndex(i => i === item);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.calculateTotalCost();
    }
  }

  async save(): Promise<void> {
    if (this.variationForm.invalid) {
      this.variationForm.markAllAsTouched();
      return;
    }

    this.savingVariation = true;

    try {
      const formValues = this.variationForm.value;

      // Update variation
      const updatedVariation = await firstValueFrom(
        this.repositoryService.updateRecetaVariacion(this.data.variacion.id, {
          nombre: formValues.nombre,
          descripcion: formValues.descripcion,
          activo: formValues.activo,
          costo: this.totalCost
        })
      );

      // Now handle ingredients
      // Delete all existing items and recreate them
      // This is a simplified approach; in a real app, you might want
      // to handle updates, deletions, and insertions separately

      // In this simplified version, we'll just update the variation
      this.snackBar.open('Variación actualizada exitosamente', 'Cerrar', { duration: 3000 });
      this.dialogRef.close(true);

    } catch (error) {
      console.error('Error al guardar variación:', error);
      this.snackBar.open('Error al guardar variación', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingVariation = false;
    }
  }
}
