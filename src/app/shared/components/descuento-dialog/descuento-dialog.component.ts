import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';

export interface DescuentoDialogData {
  subtotal: number;
  descuentoPorcentaje?: number;
  descuentoMonto?: number;
  descuentoMotivo?: string;
}

@Component({
  selector: 'app-descuento-dialog',
  templateUrl: './descuento-dialog.component.html',
  styleUrls: ['./descuento-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatDividerModule,
  ],
})
export class DescuentoDialogComponent implements OnInit {
  form!: FormGroup;
  tipoDescuento: 'porcentaje' | 'monto' = 'porcentaje';
  totalConDescuento = 0;
  montoDescuento = 0;

  constructor(
    public dialogRef: MatDialogRef<DescuentoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DescuentoDialogData,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    const tipoInicial: 'porcentaje' | 'monto' = this.data.descuentoMonto ? 'monto' : 'porcentaje';
    this.tipoDescuento = tipoInicial;
    this.form = this.fb.group({
      tipoDescuento: [tipoInicial, Validators.required],
      porcentaje: [this.data.descuentoPorcentaje || 0, [Validators.min(0), Validators.max(100)]],
      monto: [this.data.descuentoMonto || 0, [Validators.min(0)]],
      motivo: [this.data.descuentoMotivo || '', Validators.required],
    });
    this.form.get('tipoDescuento')!.valueChanges.subscribe((v: 'porcentaje' | 'monto') => {
      this.tipoDescuento = v;
      this.recalcular();
    });
    this.recalcular();
    this.form.valueChanges.subscribe(() => this.recalcular());
  }

  recalcular(): void {
    if (this.tipoDescuento === 'porcentaje') {
      const pct = this.form.get('porcentaje')?.value || 0;
      this.montoDescuento = this.data.subtotal * (pct / 100);
    } else {
      this.montoDescuento = this.form.get('monto')?.value || 0;
    }
    this.totalConDescuento = Math.max(0, this.data.subtotal - this.montoDescuento);
  }

  quitarDescuento(): void {
    this.dialogRef.close({
      descuentoPorcentaje: null,
      descuentoMonto: null,
      descuentoMotivo: null,
    });
  }

  aplicar(): void {
    if (!this.form.get('motivo')?.valid) return;

    this.dialogRef.close({
      descuentoPorcentaje: this.tipoDescuento === 'porcentaje' ? this.form.get('porcentaje')?.value : null,
      descuentoMonto: this.tipoDescuento === 'monto' ? this.form.get('monto')?.value : null,
      descuentoMotivo: this.form.get('motivo')?.value?.toUpperCase(),
    });
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
