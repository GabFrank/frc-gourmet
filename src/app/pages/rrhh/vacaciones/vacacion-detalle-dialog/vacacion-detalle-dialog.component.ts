import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-vacacion-detalle-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './vacacion-detalle-dialog.component.html',
  styleUrls: ['./vacacion-detalle-dialog.component.scss'],
})
export class VacacionDetalleDialogComponent implements OnInit {
  loading = true;
  saving = false;
  changed = false;
  vacacion: any = null;

  mostrarProgramar = false;
  mostrarVender = false;
  montoSugerido = 0;
  programarForm: FormGroup;
  venderForm: FormGroup;

  colsPeriodos = ['rango', 'dias', 'estado', 'acciones'];
  colsVentas = ['fecha', 'dias', 'monto', 'estado', 'acciones'];

  constructor(
    private dialogRef: MatDialogRef<VacacionDetalleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { vacacionId: number },
    private fb: FormBuilder,
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {
    this.programarForm = this.fb.group({
      fechaDesde: [null, Validators.required],
      fechaHasta: [null, Validators.required],
      observacion: [''],
    });
    this.venderForm = this.fb.group({
      dias: [1, [Validators.required, Validators.min(1)]],
      monto: [0, [Validators.required, Validators.min(1)]],
      observacion: [''],
    });
    // El monto se sugiere (dias x salario diario) pero es editable: muchas veces
    // se negocia un valor mayor o menor.
    this.venderForm.get('dias')!.valueChanges.subscribe(() => {
      this.montoSugerido = this.montoVentaEstimado;
      this.venderForm.get('monto')!.setValue(this.montoSugerido, { emitEvent: false });
    });
  }

  ngOnInit(): void { this.cargar(); }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.vacacion = await firstValueFrom(this.repo.getVacacion(this.data.vacacionId));
      // Sugerir el monto de venta segun el salario diario (editable).
      this.montoSugerido = this.montoVentaEstimado;
      this.venderForm.get('monto')!.setValue(this.montoSugerido, { emitEvent: false });
    } catch (e: any) {
      this.snackBar.open('Error al cargar: ' + (e?.message || ''), 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  get salarioDiario(): number {
    return Number(this.vacacion?.funcionario?.salarioBase || 0) / 30;
  }

  get montoVentaEstimado(): number {
    const dias = Number(this.venderForm.get('dias')?.value || 0);
    return Math.round(this.salarioDiario * dias);
  }

  nombreFuncionario(): string {
    const p = this.vacacion?.funcionario?.persona;
    return [p?.nombre, p?.apellido].filter(Boolean).join(' ') || '—';
  }

  // ---- Periodos ----
  async programar(): Promise<void> {
    if (this.programarForm.invalid) return;
    this.saving = true;
    try {
      const v = this.programarForm.value;
      await firstValueFrom(this.repo.programarVacacionPeriodo({
        vacacionId: this.data.vacacionId,
        fechaDesde: v.fechaDesde,
        fechaHasta: v.fechaHasta,
        observacion: v.observacion,
      }));
      this.snackBar.open('Periodo programado', 'Cerrar', { duration: 2500 });
      this.mostrarProgramar = false;
      this.programarForm.reset();
      this.changed = true;
      await this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 5000 });
    } finally {
      this.saving = false;
    }
  }

  async gozar(periodo: any): Promise<void> {
    const ok = await this.confirmar('Marcar periodo como gozado', `Se generaran asistencias de VACACION para los dias del periodo (${periodo.fechaDesde} a ${periodo.fechaHasta}). ¿Continuar?`);
    if (!ok) return;
    await this.accion(() => this.repo.marcarPeriodoGozado(periodo.id), 'Periodo marcado como gozado');
  }

  async cancelar(periodo: any): Promise<void> {
    const ok = await this.confirmar('Cancelar periodo', '¿Cancelar este periodo programado?');
    if (!ok) return;
    await this.accion(() => this.repo.cancelarVacacionPeriodo(periodo.id), 'Periodo cancelado');
  }

  // ---- Ventas ----
  async vender(): Promise<void> {
    if (this.venderForm.invalid) return;
    const dias = Number(this.venderForm.get('dias')?.value);
    if (dias > Number(this.vacacion?.diasDisponibles || 0)) {
      this.snackBar.open(`Solo hay ${this.vacacion?.diasDisponibles} dia(s) disponibles`, 'Cerrar', { duration: 4000 });
      return;
    }
    this.saving = true;
    try {
      await firstValueFrom(this.repo.venderDiasVacacion({
        vacacionId: this.data.vacacionId,
        dias,
        monto: Number(this.venderForm.get('monto')?.value) || undefined,
        observacion: this.venderForm.get('observacion')?.value,
      }));
      this.snackBar.open('Venta de dias registrada (se pagara en la liquidacion)', 'Cerrar', { duration: 3500 });
      this.mostrarVender = false;
      this.venderForm.reset({ dias: 1, monto: 0, observacion: '' });
      this.changed = true;
      await this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 5000 });
    } finally {
      this.saving = false;
    }
  }

  async anularVenta(venta: any): Promise<void> {
    const ok = await this.confirmar('Anular venta', '¿Anular esta venta de dias de vacaciones?');
    if (!ok) return;
    await this.accion(() => this.repo.anularVentaVacacion(venta.id), 'Venta anulada');
  }

  private async accion(fn: () => any, msgOk: string): Promise<void> {
    this.saving = true;
    try {
      await firstValueFrom(fn());
      this.snackBar.open(msgOk, 'Cerrar', { duration: 2500 });
      this.changed = true;
      await this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 5000 });
    } finally {
      this.saving = false;
    }
  }

  private async confirmar(title: string, message: string): Promise<boolean> {
    const ref = this.dialog.open(ConfirmationDialogComponent, { data: { title, message } });
    return !!(await firstValueFrom(ref.afterClosed()));
  }

  cerrar(): void { this.dialogRef.close({ changed: this.changed }); }
}
