import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { Timbrado } from '../../../../database/entities/facturacion/timbrado.entity';

@Component({
  selector: 'app-create-edit-timbrado',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './create-edit-timbrado.component.html',
  styleUrls: ['./create-edit-timbrado.component.scss'],
})
export class CreateEditTimbradoComponent implements OnInit {
  form: FormGroup;
  isEditing = false;
  isSaving = false;
  timbrado?: Timbrado;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() private dialogRef?: MatDialogRef<CreateEditTimbradoComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private data?: any,
  ) {
    this.form = this.fb.group({
      numero: ['', [Validators.required]],
      ruc: [''],
      razonSocial: [''],
      isElectronico: [false],
      csc: [''],
      cscId: [''],
      tipoDocumento: ['FACTURA'],
      fechaInicio: [null],
      fechaFin: [null],
      activo: [true],
    });
  }

  ngOnInit(): void {
    if (this.data?.timbrado) {
      this.timbrado = this.data.timbrado;
      this.isEditing = true;
      this.form.patchValue({
        numero: this.timbrado?.numero || '',
        ruc: this.timbrado?.ruc || '',
        razonSocial: this.timbrado?.razonSocial || '',
        isElectronico: this.timbrado?.isElectronico || false,
        csc: this.timbrado?.csc || '',
        cscId: this.timbrado?.cscId || '',
        tipoDocumento: this.timbrado?.tipoDocumento || 'FACTURA',
        fechaInicio: this.timbrado?.fechaInicio || null,
        fechaFin: this.timbrado?.fechaFin || null,
        activo: this.timbrado?.activo !== undefined ? this.timbrado.activo : true,
      });
    }
  }

  private upper(v: any): any {
    return typeof v === 'string' ? v.trim().toUpperCase() : v;
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    const raw = this.form.value;
    const payload: Partial<Timbrado> = {
      numero: this.upper(raw.numero),
      ruc: this.upper(raw.ruc) || undefined,
      razonSocial: this.upper(raw.razonSocial) || undefined,
      isElectronico: !!raw.isElectronico,
      csc: raw.csc || undefined,
      cscId: raw.cscId || undefined,
      tipoDocumento: this.upper(raw.tipoDocumento) || 'FACTURA',
      fechaInicio: raw.fechaInicio || undefined,
      fechaFin: raw.fechaFin || undefined,
      activo: !!raw.activo,
    };
    try {
      if (this.isEditing && this.timbrado?.id) {
        await firstValueFrom(this.repositoryService.updateTimbrado(this.timbrado.id, payload));
      } else {
        await firstValueFrom(this.repositoryService.createTimbrado(payload));
      }
      this.snackBar.open('Timbrado guardado', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error: any) {
      console.error('Error saving timbrado:', error);
      this.snackBar.open(error?.message || 'Error al guardar el timbrado', 'Cerrar', { duration: 5000 });
    } finally {
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close(false);
  }
}
