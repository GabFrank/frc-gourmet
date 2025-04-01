import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TipoPrecio } from '../../../database/entities/financiero/tipo-precio.entity';
import { RepositoryService } from '../../../database/repository.service';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  tipoPrecio?: TipoPrecio;
  editMode: boolean;
}

@Component({
  selector: 'app-create-edit-tipo-precio',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="tipo-precio-form-container">
      <div class="loading-overlay" *ngIf="isLoading">
        <mat-spinner diameter="50"></mat-spinner>
      </div>

      <h2 mat-dialog-title>{{ isEditing ? 'Editar' : 'Nuevo' }} Tipo de Precio</h2>

      <mat-dialog-content>
        <form [formGroup]="tipoPrecioForm" class="form-container">
          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Descripción</mat-label>
              <input matInput formControlName="descripcion" required>
              <mat-error *ngIf="tipoPrecioForm.get('descripcion')?.hasError('required')">
                La descripción es requerida
              </mat-error>
            </mat-form-field>
          </div>

          <div class="form-row checkbox-row">
            <mat-checkbox formControlName="autorizacion" color="primary">
              Requiere Autorización
            </mat-checkbox>
            <mat-checkbox formControlName="activo" color="primary">
              Activo
            </mat-checkbox>
          </div>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="dialogRef.close()">Cancelar</button>
        <button mat-raised-button color="primary" (click)="saveTipoPrecio()" [disabled]="tipoPrecioForm.invalid || isLoading">
          {{ isEditing ? 'Actualizar' : 'Guardar' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .tipo-precio-form-container {
      position: relative;
      min-width: 350px;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: rgba(0, 0, 0, 0.1);
      border-radius: 4px;
    }

    .form-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-top: 16px;
    }

    .form-row {
      display: flex;
      gap: 16px;
    }

    .full-width {
      width: 100%;
    }

    .checkbox-row {
      display: flex;
      gap: 24px;
      margin-top: 8px;
    }
  `]
})
export class CreateEditTipoPrecioComponent {
  tipoPrecioForm: FormGroup;
  isLoading = false;
  isEditing = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<CreateEditTipoPrecioComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.isEditing = data.editMode;

    this.tipoPrecioForm = this.fb.group({
      descripcion: ['', Validators.required],
      autorizacion: [false],
      activo: [true]
    });

    // If editing, fill form with data
    if (this.isEditing && this.data.tipoPrecio) {
      this.tipoPrecioForm.patchValue({
        descripcion: this.data.tipoPrecio.descripcion,
        autorizacion: this.data.tipoPrecio.autorizacion,
        activo: this.data.tipoPrecio.activo
      });
    }
  }

  async saveTipoPrecio(): Promise<void> {
    if (this.tipoPrecioForm.invalid || this.isLoading) return;

    this.isLoading = true;
    //get descripcion and set uppercase
    const descripcion = this.tipoPrecioForm.get('descripcion')?.value.toUpperCase();
    this.tipoPrecioForm.get('descripcion')?.setValue(descripcion);
    const formValue = this.tipoPrecioForm.value;

    try {
      if (this.isEditing && this.data.tipoPrecio) {
        // Update existing tipoPrecio
        await firstValueFrom(
          this.repositoryService.updateTipoPrecio(this.data.tipoPrecio.id, formValue)
        );
        this.snackBar.open('Tipo de precio actualizado exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new tipoPrecio
        await firstValueFrom(
          this.repositoryService.createTipoPrecio(formValue)
        );
        this.snackBar.open('Tipo de precio creado exitosamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving tipo precio:', error);
      this.snackBar.open('Error al guardar el tipo de precio', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }
}
