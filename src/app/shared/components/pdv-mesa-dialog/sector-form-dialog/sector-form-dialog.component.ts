import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

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
  selector: 'app-sector-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.sector ? 'Editar' : 'Nuevo' }} Sector</h2>
    
    <form [formGroup]="sectorForm" (ngSubmit)="onSubmit()">
      <mat-dialog-content>
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Nombre del Sector</mat-label>
            <input matInput formControlName="nombre" required>
            <mat-error *ngIf="sectorForm.get('nombre')?.hasError('required')">
              El nombre del sector es requerido
            </mat-error>
          </mat-form-field>
          
          <div class="checkbox-container">
            <mat-checkbox formControlName="activo">Activo</mat-checkbox>
          </div>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
        <button mat-raised-button color="primary" type="submit" [disabled]="sectorForm.invalid || submitting">
          {{ data.sector ? 'Actualizar' : 'Crear' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 16px;
      
      mat-form-field {
        width: 100%;
      }
      
      .checkbox-container {
        margin: 8px 0;
      }
    }
  `]
})
export class SectorFormDialogComponent {
  sectorForm: FormGroup;
  submitting = false;
  
  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<SectorFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { sector?: SectorEntity }
  ) {
    this.sectorForm = this.fb.group({
      nombre: [data.sector?.nombre || '', [Validators.required]],
      activo: [data.sector?.activo ?? true]
    });
  }
  
  onSubmit(): void {
    if (this.sectorForm.invalid) {
      return;
    }
    
    this.submitting = true;
    const sectorData = this.sectorForm.value;
    
    this.dialogRef.close(sectorData);
  }
} 