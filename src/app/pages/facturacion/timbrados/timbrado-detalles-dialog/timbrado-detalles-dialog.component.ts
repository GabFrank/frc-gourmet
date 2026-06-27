import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { Timbrado } from '../../../../database/entities/facturacion/timbrado.entity';
import { TimbradoDetalle } from '../../../../database/entities/facturacion/timbrado-detalle.entity';

@Component({
  selector: 'app-timbrado-detalles-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatCheckboxModule,
    MatTableModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './timbrado-detalles-dialog.component.html',
  styleUrls: ['./timbrado-detalles-dialog.component.scss'],
})
export class TimbradoDetallesDialogComponent implements OnInit {
  timbrado: Timbrado;
  detalles: TimbradoDetalle[] = [];
  displayedColumns = ['punto', 'rango', 'numeroActual', 'activo', 'acciones'];
  form: FormGroup;
  editingId: number | null = null;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    this.timbrado = data.timbrado;
    this.form = this.fb.group({
      establecimiento: ['001', [Validators.required]],
      puntoExpedicion: ['001', [Validators.required]],
      rangoDesde: [1, [Validators.required, Validators.min(1)]],
      rangoHasta: [1000, [Validators.required, Validators.min(1)]],
      numeroActual: [1, [Validators.required, Validators.min(1)]],
      activo: [true],
    });
  }

  ngOnInit(): void {
    this.loadDetalles();
  }

  async loadDetalles(): Promise<void> {
    this.isLoading = true;
    try {
      this.detalles = await firstValueFrom(this.repositoryService.getTimbradoDetalles(this.timbrado.id!));
    } catch (error) {
      console.error('Error loading detalles:', error);
    } finally {
      this.isLoading = false;
    }
  }

  edit(d: TimbradoDetalle): void {
    this.editingId = d.id!;
    this.form.patchValue({
      establecimiento: d.establecimiento,
      puntoExpedicion: d.puntoExpedicion,
      rangoDesde: d.rangoDesde,
      rangoHasta: d.rangoHasta,
      numeroActual: d.numeroActual,
      activo: d.activo,
    });
  }

  resetForm(): void {
    this.editingId = null;
    this.form.reset({
      establecimiento: '001',
      puntoExpedicion: '001',
      rangoDesde: 1,
      rangoHasta: 1000,
      numeroActual: 1,
      activo: true,
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.value;
    const payload: Partial<TimbradoDetalle> = {
      timbrado: { id: this.timbrado.id } as any,
      establecimiento: String(raw.establecimiento).padStart(3, '0'),
      puntoExpedicion: String(raw.puntoExpedicion).padStart(3, '0'),
      rangoDesde: Number(raw.rangoDesde),
      rangoHasta: Number(raw.rangoHasta),
      numeroActual: Number(raw.numeroActual),
      activo: !!raw.activo,
    };
    try {
      if (this.editingId) {
        await firstValueFrom(this.repositoryService.updateTimbradoDetalle(this.editingId, payload));
      } else {
        await firstValueFrom(this.repositoryService.createTimbradoDetalle(payload));
      }
      this.snackBar.open('Punto de expedición guardado', 'Cerrar', { duration: 2500 });
      this.resetForm();
      this.loadDetalles();
    } catch (error: any) {
      this.snackBar.open(error?.message || 'Error al guardar', 'Cerrar', { duration: 4000 });
    }
  }

  async remove(d: TimbradoDetalle): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.deleteTimbradoDetalle(d.id!));
      this.loadDetalles();
    } catch (error: any) {
      this.snackBar.open(error?.message || 'No se pudo eliminar', 'Cerrar', { duration: 4000 });
    }
  }
}
