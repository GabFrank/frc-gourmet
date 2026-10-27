/** Registrar un error (uno o varios funcionarios, mismo tipo y fecha). Los puntos salen de la gravedad vigente. */
import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DisciplinaApiService, drFechaIso, drMensajeError } from '../disciplina-api.service';

export interface RegistrarErrorDialogData {
  tiposError: any[];
  funcionarios: { id: number; nombre: string }[];
}

@Component({
  selector: 'app-registrar-error-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule, MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './registrar-error-dialog.component.html',
  styleUrls: ['./registrar-dialog.scss'],
})
export class RegistrarErrorDialogComponent {
  form: FormGroup;
  guardando = false;
  error = '';
  guardado = false;
  creados: { nombre: string; puntos: number }[] = [];

  constructor(
    private fb: FormBuilder,
    private api: DisciplinaApiService,
    private dialogRef: MatDialogRef<RegistrarErrorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RegistrarErrorDialogData,
  ) {
    this.form = this.fb.group({
      tipoErrorId: [null, Validators.required],
      fecha: [new Date(), Validators.required],
      funcionarioIds: [[], Validators.required],
      detalle: [''],
    });
  }

  cerrar(): void {
    this.dialogRef.close(this.guardado);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.guardando || this.guardado) return;
    this.error = '';
    this.guardando = true;
    const v = this.form.value;
    try {
      const r = await this.api.registrarError({
        tipoErrorId: v.tipoErrorId,
        fecha: drFechaIso(v.fecha)!,
        funcionarioIds: v.funcionarioIds ?? [],
        detalle: v.detalle ? String(v.detalle).trim().toUpperCase() : undefined,
      });
      this.creados = (r ?? []).map((c) => ({
        nombre: this.data.funcionarios.find((f) => f.id === c.funcionarioId)?.nombre ?? `#${c.funcionarioId}`,
        puntos: Number(c.puntos) || 0,
      }));
      this.guardado = true;
    } catch (e) {
      this.error = drMensajeError(e);
    } finally {
      this.guardando = false;
    }
  }
}
