import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Interface representing a Sector entity 
 */
interface SectorEntity {
  id?: number;
  nombre: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-batch-mesa-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  template: `
    <h2 mat-dialog-title>Creación Masiva de Mesas</h2>
    
    <div *ngIf="loading" class="loading-container">
      <mat-spinner diameter="40"></mat-spinner>
      <p>Cargando...</p>
    </div>
    
    <form *ngIf="!loading" [formGroup]="batchForm" (ngSubmit)="onSubmit()">
      <mat-dialog-content>
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Cantidad de Mesas a Crear</mat-label>
            <input matInput formControlName="quantity" type="number" min="1" required>
            <mat-hint>Se crearán a partir del número {{ startingNumber }}</mat-hint>
            <mat-error *ngIf="batchForm.get('quantity')?.hasError('required')">
              La cantidad es requerida
            </mat-error>
            <mat-error *ngIf="batchForm.get('quantity')?.hasError('min')">
              La cantidad debe ser mayor a 0
            </mat-error>
          </mat-form-field>
          
          <mat-form-field appearance="outline">
            <mat-label>Capacidad para todas las mesas (personas)</mat-label>
            <input matInput formControlName="cantidad_personas" type="number" min="1">
            <mat-error *ngIf="batchForm.get('cantidad_personas')?.hasError('min')">
              La capacidad debe ser mayor a 0
            </mat-error>
          </mat-form-field>
          
          <mat-form-field appearance="outline">
            <mat-label>Sector</mat-label>
            <mat-select formControlName="sector_id">
              <mat-option [value]="null">Sin sector</mat-option>
              <mat-option *ngFor="let sector of sectores" [value]="sector.id">
                {{ sector.nombre }}
              </mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
        <button mat-raised-button color="accent" type="submit" [disabled]="batchForm.invalid || submitting">
          <mat-icon>group_add</mat-icon> Crear Mesas en Lote
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      
      p {
        margin-top: 16px;
        opacity: 0.6;
      }
    }
    
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 16px;
      
      mat-form-field {
        width: 100%;
      }
    }
    
    mat-hint {
      font-style: italic;
      opacity: 0.7;
    }
  `]
})
export class BatchMesaFormDialogComponent implements OnInit {
  batchForm: FormGroup;
  loading = false;
  submitting = false;
  sectores: SectorEntity[] = [];
  
  get startingNumber(): number {
    return this.data.nextNumber || 1;
  }
  
  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<BatchMesaFormDialogComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: { nextNumber: number }
  ) {
    this.batchForm = this.fb.group({
      quantity: [1, [Validators.required, Validators.min(1)]],
      cantidad_personas: [4, [Validators.min(1)]],
      sector_id: [null]
    });
  }
  
  ngOnInit(): void {
    this.loadSectores();
  }
  
  loadSectores(): void {
    this.loading = true;
    
    (window as any).api.getSectoresActivos()
      .then((response: SectorEntity[]) => {
        this.sectores = response;
        this.loading = false;
      })
      .catch((error: any) => {
        console.error('Error loading sectores:', error);
        this.snackBar.open('Error al cargar sectores', 'Cerrar', { duration: 3000 });
        this.loading = false;
      });
  }
  
  onSubmit(): void {
    if (this.batchForm.invalid) {
      return;
    }
    
    this.submitting = true;
    const formData = this.batchForm.value;
    
    // Return the batch data
    const batchData = {
      quantity: formData.quantity,
      cantidad_personas: formData.cantidad_personas,
      sector_id: formData.sector_id,
      startingNumber: this.startingNumber
    };
    
    this.dialogRef.close(batchData);
  }
} 