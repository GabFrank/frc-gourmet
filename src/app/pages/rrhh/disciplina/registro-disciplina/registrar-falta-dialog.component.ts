/**
 * Registrar una falta (uno o varios funcionarios = un lote). Después de guardar muestra qué
 * quedó como ADVERTENCIA y qué como MULTA, y las ignoradas con su motivo.
 */
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

export interface RegistrarFaltaDialogData {
  tiposFalta: any[];
  funcionarios: { id: number; nombre: string }[];
}

interface ResultadoFila {
  nombre: string;
  resultado: string;
  esMulta: boolean;
  monto: number;
  ocurrencia: number;
}

@Component({
  selector: 'app-registrar-falta-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule, MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './registrar-falta-dialog.component.html',
  styleUrls: ['./registrar-dialog.scss'],
})
export class RegistrarFaltaDialogComponent {
  form: FormGroup;
  guardando = false;
  error = '';
  guardado = false;
  creadas: ResultadoFila[] = [];
  ignoradas: { nombre: string; motivo: string }[] = [];
  enTolerancia: string[] = [];
  tipoEsTardanza = false;
  tipos: { id: number; label: string; tardanza: boolean }[];

  constructor(
    private fb: FormBuilder,
    private api: DisciplinaApiService,
    private dialogRef: MatDialogRef<RegistrarFaltaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RegistrarFaltaDialogData,
  ) {
    this.tipos = data.tiposFalta.map((t) => ({
      id: t.id,
      label: t.nombre,
      tardanza: !!t.fuenteAsistencia || (t.toleranciaMinutos !== null && t.toleranciaMinutos !== undefined),
    }));
    this.form = this.fb.group({
      tipoFaltaId: [null, Validators.required],
      fecha: [new Date(), Validators.required],
      funcionarioIds: [[], Validators.required],
      minutosTardanza: [null, Validators.min(0)],
      observacion: [''],
    });
    this.form.get('tipoFaltaId')!.valueChanges.subscribe((id) => {
      this.tipoEsTardanza = !!this.tipos.find((t) => t.id === id)?.tardanza;
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
    const ids: number[] = v.funcionarioIds ?? [];
    try {
      const r = await this.api.registrarFalta({
        tipoFaltaId: v.tipoFaltaId,
        fecha: drFechaIso(v.fecha)!,
        funcionarioIds: ids,
        observacion: v.observacion ? String(v.observacion).trim().toUpperCase() : undefined,
        minutosTardanza: v.minutosTardanza === null || v.minutosTardanza === '' ? null : Number(v.minutosTardanza),
      });
      const nombre = (id: number) => this.data.funcionarios.find((f) => f.id === id)?.nombre ?? `#${id}`;
      this.creadas = (r.creadas ?? []).map((c: any) => ({
        nombre: nombre(c.funcionario?.id),
        resultado: c.resultado,
        esMulta: c.resultado === 'MULTA',
        monto: Number(c.montoCalculado) || 0,
        ocurrencia: Number(c.nOcurrencia) || 0,
      }));
      this.ignoradas = (r.ignoradas ?? []).map((i) => ({ nombre: nombre(i.funcionarioId), motivo: i.motivo }));
      const tratados = new Set<number>([
        ...(r.creadas ?? []).map((c: any) => c.funcionario?.id),
        ...(r.ignoradas ?? []).map((i) => i.funcionarioId),
      ]);
      this.enTolerancia = ids.filter((id) => !tratados.has(id)).map(nombre);
      this.guardado = true;
    } catch (e) {
      this.error = drMensajeError(e);
    } finally {
      this.guardando = false;
    }
  }
}
