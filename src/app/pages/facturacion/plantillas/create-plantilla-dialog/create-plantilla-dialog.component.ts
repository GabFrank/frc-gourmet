import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { FacturaPlantilla, TipoPlantilla } from '../../../../database/entities/facturacion/factura-plantilla.entity';
import { emptyPlantillaConfig } from '../plantilla-design.model';

@Component({
  selector: 'app-create-plantilla-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './create-plantilla-dialog.component.html',
  styleUrls: ['./create-plantilla-dialog.component.scss'],
})
export class CreatePlantillaDialogComponent {
  form: FormGroup;
  tipos = [
    { value: TipoPlantilla.PRE_IMPRESO, label: 'Pre-impreso (hoja ya impresa)' },
    { value: TipoPlantilla.AUTO_IMPRESO_A4, label: 'Auto-impreso A4' },
    { value: TipoPlantilla.AUTO_IMPRESO_TERMICA, label: 'Auto-impreso térmica (58/80mm)' },
  ];
  isSaving = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<CreatePlantillaDialogComponent>,
  ) {
    this.form = this.fb.group({
      nombre: ['', [Validators.required]],
      tipo: [TipoPlantilla.PRE_IMPRESO, [Validators.required]],
    });
  }

  private sizeFor(tipo: TipoPlantilla): { anchoMm: number; altoMm: number } {
    switch (tipo) {
      case TipoPlantilla.AUTO_IMPRESO_TERMICA: return { anchoMm: 80, altoMm: 297 };
      case TipoPlantilla.AUTO_IMPRESO_A4:
      case TipoPlantilla.PRE_IMPRESO:
      default: return { anchoMm: 210, altoMm: 297 };
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving = true;
    const raw = this.form.value;
    const size = this.sizeFor(raw.tipo);
    const payload: Partial<FacturaPlantilla> = {
      nombre: String(raw.nombre).trim().toUpperCase(),
      tipo: raw.tipo,
      anchoMm: size.anchoMm,
      altoMm: size.altoMm,
      config: JSON.stringify(emptyPlantillaConfig()),
      activo: true,
    };
    try {
      const created = await firstValueFrom(this.repositoryService.createFacturaPlantilla(payload));
      this.dialogRef.close(created);
    } catch (error: any) {
      this.snackBar.open(error?.message || 'Error al crear la plantilla', 'Cerrar', { duration: 4000 });
      this.isSaving = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
