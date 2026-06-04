import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';

@Component({
  selector: 'app-create-edit-convenio-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar convenio' : 'Nuevo convenio' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="nombre" placeholder="EJ. FUNCIONARIOS BODEGA FRANCO" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripcion</mat-label>
          <input matInput formControlName="descripcion" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>RUC (empresa)</mat-label>
          <input matInput formControlName="ruc" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Contacto</mat-label>
          <input matInput formControlName="contacto" />
        </mat-form-field>
        <mat-slide-toggle formControlName="activo" class="full">Activo</mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        {{ isEdit ? 'Guardar' : 'Crear convenio' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-width: 480px; padding-top: 6px; }
    .full { grid-column: 1 / -1; }
  `],
})
export class CreateEditConvenioDialogComponent implements OnInit {
  isEdit = false;
  saving = false;
  form: FormGroup;

  constructor(
    private dialogRef: MatDialogRef<CreateEditConvenioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { convenio?: any },
    private fb: FormBuilder,
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      nombre: ['', Validators.required],
      descripcion: [''],
      ruc: [''],
      contacto: [''],
      activo: [true],
    });
  }

  ngOnInit(): void {
    const c = this.data?.convenio;
    if (c) {
      this.isEdit = true;
      this.form.patchValue({
        nombre: c.nombre || '',
        descripcion: c.descripcion || '',
        ruc: c.ruc || '',
        contacto: c.contacto || '',
        activo: c.activo !== false,
      });
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const v = this.form.value;
      if (this.isEdit) {
        await firstValueFrom(this.repo.updateConvenio(this.data.convenio.id, v));
      } else {
        await firstValueFrom(this.repo.createConvenio(v));
      }
      this.snackBar.open('Convenio guardado', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    } finally {
      this.saving = false;
    }
  }
}
