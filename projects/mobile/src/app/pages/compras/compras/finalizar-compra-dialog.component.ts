import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

export interface FinalizarCompraData {
  compraId: number;
  titulo: string;
  total: number;
  simbolo: string;
  decimales: number;
  credito: boolean;
}

export interface FinalizarCompraResult {
  ok: true;
  /** cppId para navegar al detalle de CxP si el usuario quiere pagar ahora. */
  cppId: number | null;
  pagarAhora: boolean;
}

/**
 * Finaliza una compra en estado ABIERTO (impacta stock/costo/CPP en el backend).
 * Respeta el flag `credito` del borrador: si es a crédito, pide cantidad de
 * cuotas + fecha de inicio; si es contado, ofrece "registrar pago ahora"
 * (que luego lleva al detalle de CxP para cobrar la cuota). COMPRAS_GESTIONAR.
 */
@Component({
  selector: 'app-finalizar-compra-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSlideToggleModule, MatButtonModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './finalizar-compra-dialog.component.html',
})
export class FinalizarCompraDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  saving = false;

  readonly form = this.fb.nonNullable.group({
    cantidadCuotas: [1, [Validators.required, Validators.min(1)]],
    fechaCreditoInicio: [this.hoy()],
    pagarAhora: [false],
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: FinalizarCompraData,
    private readonly dialogRef: MatDialogRef<FinalizarCompraDialogComponent, FinalizarCompraResult>,
  ) {}

  ngOnInit(): void {
    if (!this.data.credito) {
      this.form.controls.cantidadCuotas.clearValidators();
      this.form.controls.cantidadCuotas.updateValueAndValidity();
    }
  }

  private hoy(): string {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  cancelar(): void {
    this.dialogRef.close();
  }

  async confirmar(): Promise<void> {
    if ((this.data.credito && this.form.invalid) || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload: any = { formaPagoCompra: 'EFECTIVO' };
    if (this.data.credito) {
      payload.cantidadCuotas = Number(v.cantidadCuotas) || 1;
      payload.fechaCreditoInicio = v.fechaCreditoInicio || this.hoy();
    } else {
      payload.pagarAhora = !!v.pagarAhora;
    }
    try {
      const res: any = await firstValueFrom(this.repo.finalizarCompra(this.data.compraId, payload));
      const cppId = res?.compra?.cuentaPorPagar?.id ?? null;
      this.dialogRef.close({ ok: true, cppId, pagarAhora: !this.data.credito && !!v.pagarAhora });
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      this.snack.open(/PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo finalizar', 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
