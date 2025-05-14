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
import { RepositoryService } from '../../../database/repository.service';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { firstValueFrom } from 'rxjs';

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
    MatSnackBarModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.editMode ? 'Editar' : 'Crear' }} Receta</h2>

    <form [formGroup]="recetaForm" (ngSubmit)="save()">
      <div mat-dialog-content>
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
            <textarea matInput formControlName="modo_preparo" placeholder="Instrucciones de preparación" rows="5"></textarea>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-checkbox formControlName="activo" color="primary">
            Activo
          </mat-checkbox>
        </div>
      </div>

      <div mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
        <button mat-raised-button color="primary" type="submit" [disabled]="recetaForm.invalid || loading">
          <mat-spinner *ngIf="loading" diameter="20"></mat-spinner>
          <span *ngIf="!loading">{{ data.editMode ? 'Actualizar' : 'Guardar' }}</span>
        </button>
      </div>
    </form>
  `,
  styles: [`
    .form-row {
      margin-bottom: 16px;
    }

    .full-width {
      width: 100%;
    }

    mat-dialog-content {
      min-height: 200px;
    }

    button mat-spinner {
      display: inline-block;
      margin-right: 8px;
    }
  `]
})
export class CreateEditRecetaComponent implements OnInit {
  recetaForm: FormGroup;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaComponent>,
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
      this.recetaForm.patchValue({
        nombre: this.data.receta.nombre,
        modo_preparo: this.data.receta.modo_preparo || '',
        activo: this.data.receta.activo
      });
    }
  }

  async save(): Promise<void> {
    if (this.recetaForm.invalid) {
      return;
    }

    this.loading = true;

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
        await firstValueFrom(
          this.repositoryService.createReceta({
            nombre: formValues.nombre,
            modo_preparo: formValues.modo_preparo,
            activo: formValues.activo
          })
        );
        this.snackBar.open('Receta creada exitosamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error al guardar la receta:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }
}
