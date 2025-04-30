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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

/**
 * Interface representing a PdvMesa entity 
 */
interface PdvMesaEntity {
  id?: number;
  numero: number;
  cantidad_personas?: number;
  activo: boolean;
  reservado: boolean;
  sector?: any;
  reserva?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

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
  selector: 'app-mesa-form-dialog',
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
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.mesa ? 'Editar' : 'Nueva' }} Mesa</h2>
    
    <div *ngIf="loading" class="loading-container">
      <mat-spinner diameter="40"></mat-spinner>
      <p>Cargando...</p>
    </div>
    
    <form *ngIf="!loading" [formGroup]="mesaForm" (ngSubmit)="onSubmit()">
      <mat-dialog-content>
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Número de Mesa</mat-label>
            <input matInput formControlName="numero" type="number" min="1" required>
            <mat-error *ngIf="mesaForm.get('numero')?.hasError('required')">
              El número de mesa es requerido
            </mat-error>
            <mat-error *ngIf="mesaForm.get('numero')?.hasError('min')">
              El número de mesa debe ser mayor a 0
            </mat-error>
          </mat-form-field>
          
          <mat-form-field appearance="outline">
            <mat-label>Capacidad (personas)</mat-label>
            <input matInput formControlName="cantidad_personas" type="number" min="1">
            <mat-error *ngIf="mesaForm.get('cantidad_personas')?.hasError('min')">
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
          
          <div class="checkbox-container">
            <mat-checkbox formControlName="activo">Activo</mat-checkbox>
          </div>
          
          <div class="checkbox-container">
            <mat-checkbox formControlName="reservado">Reservado</mat-checkbox>
          </div>
        </div>
      </mat-dialog-content>
      
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
        <button mat-raised-button color="primary" type="submit" [disabled]="mesaForm.invalid || submitting">
          {{ data.mesa ? 'Actualizar' : 'Crear' }}
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
      
      .checkbox-container {
        margin: 8px 0;
      }
    }
  `]
})
export class MesaFormDialogComponent implements OnInit {
  mesaForm: FormGroup;
  loading = false;
  submitting = false;
  sectores: SectorEntity[] = [];
  
  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<MesaFormDialogComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: { mesa?: PdvMesaEntity, nextNumber?: number }
  ) {
    this.mesaForm = this.fb.group({
      numero: [data.mesa?.numero || data.nextNumber || '', [Validators.required, Validators.min(1)]],
      cantidad_personas: [data.mesa?.cantidad_personas || 4, [Validators.min(1)]],
      sector_id: [data.mesa?.sector?.id || null],
      activo: [data.mesa?.activo ?? true],
      reservado: [data.mesa?.reservado ?? false]
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
    if (this.mesaForm.invalid) {
      return;
    }
    
    this.submitting = true;
    const formData = this.mesaForm.value;
    
    // Process data
    const mesaData: any = {
      numero: formData.numero,
      cantidad_personas: formData.cantidad_personas,
      activo: formData.activo,
      reservado: formData.reservado
    };
    
    // Add sector relation if selected
    if (formData.sector_id) {
      mesaData.sector = { id: formData.sector_id };
    }
    
    this.dialogRef.close(mesaData);
  }
} 