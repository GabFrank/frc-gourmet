import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

export interface KdsPantallaDialogData {
  pantalla?: any;
  sectores: { id: number; nombre: string }[];
}

@Component({
  selector: 'app-create-edit-kds-pantalla-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSlideToggleModule,
  ],
  templateUrl: './create-edit-kds-pantalla-dialog.component.html',
})
export class CreateEditKdsPantallaDialogComponent {
  form: FormGroup;
  esEdicion = false;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<CreateEditKdsPantallaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: KdsPantallaDialogData,
  ) {
    const p = data.pantalla;
    this.esEdicion = !!p?.id;
    let sectorIds: number[] = [];
    try { sectorIds = p?.sectores ? JSON.parse(p.sectores) : []; } catch { sectorIds = []; }

    this.form = this.fb.group({
      nombre: [p?.nombre || '', [Validators.required, Validators.maxLength(100)]],
      sectorIds: [sectorIds],
      umbralAmarillo: [p?.umbralAmarillo ?? 5, [Validators.required, Validators.min(1)]],
      umbralRojo: [p?.umbralRojo ?? 10, [Validators.required, Validators.min(1)]],
      sonidoNuevo: [p?.sonidoNuevo ?? true],
      activo: [p?.activo ?? true],
    });
  }

  cancelar(): void { this.dialogRef.close(); }

  guardar(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.value;
    this.dialogRef.close({
      nombre: v.nombre,
      sectores: v.sectorIds || [],
      umbralAmarillo: Number(v.umbralAmarillo),
      umbralRojo: Number(v.umbralRojo),
      sonidoNuevo: !!v.sonidoNuevo,
      activo: !!v.activo,
    });
  }
}
