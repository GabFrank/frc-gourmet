import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

export interface CobrarCreditoDialogData {
  ventaId: number;
  clienteId: number;
  clienteNombre: string;
  saldoActual: number;
  limiteCredito: number;
  monto: number;
  monedaId: number;
  monedaSimbolo?: string;
}

@Component({
  selector: 'app-cobrar-credito-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './cobrar-credito-dialog.component.html',
  styleUrls: ['./cobrar-credito-dialog.component.scss'],
})
export class CobrarCreditoDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;

  saldoProyectado = 0;
  excedeLimite = false;
  saldoClass: 'ok' | 'warn' | 'over' = 'ok';

  // Vista previa de cuotas (pre-computado, no funciones en template)
  cuotasPreview: { numero: number; monto: number; vencimiento: Date }[] = [];

  frecuenciaOptions = [
    { value: 30, label: 'Mensual' },
    { value: 15, label: 'Quincenal' },
    { value: 7, label: 'Semanal' },
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private dialogRef: MatDialogRef<CobrarCreditoDialogComponent>,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: CobrarCreditoDialogData,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      cantidadCuotas: [1, [Validators.required, Validators.min(1), Validators.max(60)]],
      frecuenciaDias: [30, Validators.required],
      fechaInicio: [new Date(), Validators.required],
      descripcion: [''],
    });
    this.recomputeSaldoProyectado();
    this.recomputeCuotas();
    this.form.valueChanges.subscribe(() => this.recomputeCuotas());
  }

  private recomputeSaldoProyectado(): void {
    this.saldoProyectado = (this.data.saldoActual || 0) + (this.data.monto || 0);
    const limite = this.data.limiteCredito || 0;
    if (limite <= 0) {
      this.excedeLimite = false;
      this.saldoClass = 'ok';
    } else if (this.saldoProyectado > limite) {
      this.excedeLimite = true;
      this.saldoClass = 'over';
    } else if (this.saldoProyectado / limite >= 0.8) {
      this.excedeLimite = false;
      this.saldoClass = 'warn';
    } else {
      this.excedeLimite = false;
      this.saldoClass = 'ok';
    }
  }

  private recomputeCuotas(): void {
    const cantidad = Math.max(1, Number(this.form.get('cantidadCuotas')?.value) || 1);
    const frecuencia = Number(this.form.get('frecuenciaDias')?.value) || 30;
    const inicio = this.form.get('fechaInicio')?.value || new Date();
    const monto = this.data.monto || 0;
    const montoCuota = +(monto / cantidad).toFixed(2);
    const arr: { numero: number; monto: number; vencimiento: Date }[] = [];
    for (let i = 0; i < cantidad; i++) {
      const venc = new Date(inicio);
      if (frecuencia === 30) {
        venc.setMonth(venc.getMonth() + i);
      } else {
        venc.setDate(venc.getDate() + frecuencia * i);
      }
      const m = i === cantidad - 1
        ? +(monto - montoCuota * (cantidad - 1)).toFixed(2)
        : montoCuota;
      arr.push({ numero: i + 1, monto: m, vencimiento: venc });
    }
    this.cuotasPreview = arr;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async submit(forzar = false): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.value;
    const payload: any = {
      ventaId: this.data.ventaId,
      clienteId: this.data.clienteId,
      montoTotal: this.data.monto,
      monedaId: this.data.monedaId,
      cantidadCuotas: Number(v.cantidadCuotas),
      frecuenciaDias: Number(v.frecuenciaDias),
      fechaInicio: this.toIsoDate(v.fechaInicio),
      descripcion: v.descripcion?.trim() || null,
      forzar,
    };
    try {
      const res: any = await firstValueFrom(this.repositoryService.cobrarVentaCredito(payload));
      if (res?.requiereConfirmacion) {
        this.saving = false;
        const confirmRef = this.dialog.open(ConfirmationDialogComponent, {
          width: '440px',
          data: {
            title: 'Excede el límite de crédito',
            message: `${res.message}. ¿Aprobar la venta a crédito de todas formas?`,
            confirmText: 'Aprobar',
            cancelText: 'Cancelar',
          },
        });
        confirmRef.afterClosed().subscribe((ok) => {
          if (ok) this.submit(true);
        });
        return;
      }
      this.snackBar.open('Venta a crédito registrada', 'Cerrar', { duration: 2500 });
      // El backend dispara automáticamente la impresión del ticket de venta
      // y el pagaré (cobrar-venta-credito → auto-print con setImmediate).
      this.dialogRef.close({ success: true, ventaId: res?.ventaId, cpcId: res?.cpcId });
    } catch (e: any) {
      console.error('Error cobrarVentaCredito:', e);
      const msg = e?.message?.includes('Error invoking remote method')
        ? 'Error al registrar la venta a crédito'
        : e?.message || 'Error al registrar la venta a crédito';
      this.snackBar.open(msg, 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  private toIsoDate(d: any): string {
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString().split('T')[0];
  }
}
