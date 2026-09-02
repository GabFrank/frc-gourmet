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
import { CurrencyInputDirective } from '../../directives/currency-input.directive';
import { redondear } from '../../utils/pago-consolidado.util';

export interface DescuentoDialogData {
  subtotal: number;
  descuentoPorcentaje?: number;
  descuentoMonto?: number;
  descuentoMotivo?: string;
  /** Decimales de la moneda. Default 0 (guaraní), que es el caso del PdV. */
  decimales?: number;
  /**
   * Tope del descuento como porcentaje del subtotal. Se muestra y se acota acá,
   * pero el backend lo vuelve a validar: la UI no es una frontera.
   */
  maxPorcentaje?: number | null;
  /** Título del diálogo. Default: "DESCUENTO GLOBAL". */
  titulo?: string;
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
    CurrencyInputDirective,
  ],
})
export class DescuentoDialogComponent implements OnInit {
  form!: FormGroup;
  tipoDescuento: 'porcentaje' | 'monto' = 'porcentaje';
  totalConDescuento = 0;
  montoDescuento = 0;
  /** Decimales del monto (venta PdV opera en moneda principal PYG=0). Para appCurrencyInput. */
  decimalesMoneda = 0;
  titulo = 'DESCUENTO GLOBAL';
  /** Tope en monto, derivado de `maxPorcentaje`. null = sin tope. */
  maxMonto: number | null = null;
  topeTexto = '';
  excedeTope = false;

  constructor(
    public dialogRef: MatDialogRef<DescuentoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DescuentoDialogData,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    const tipoInicial: 'porcentaje' | 'monto' = this.data.descuentoMonto ? 'monto' : 'porcentaje';
    this.tipoDescuento = tipoInicial;
    this.titulo = this.data.titulo || 'DESCUENTO GLOBAL';
    const dec = Number(this.data.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
    const pctMax = this.data.maxPorcentaje;
    if (pctMax != null && Number(pctMax) >= 0) {
      this.maxMonto = redondear(Number(this.data.subtotal) * (Number(pctMax) / 100), this.decimalesMoneda);
      this.topeTexto = `Tope de esta caja: ${Number(pctMax)}%`;
    }
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
      this.montoDescuento = redondear(this.data.subtotal * (pct / 100), this.decimalesMoneda);
    } else {
      this.montoDescuento = redondear(this.form.get('monto')?.value || 0, this.decimalesMoneda);
    }
    // Se avisa en vez de recortar en silencio: si el usuario escribió 100.000 y
    // el tope son 50.000, ver "50.000" sin explicación es peor que un error.
    this.excedeTope = this.maxMonto != null && this.montoDescuento > this.maxMonto;
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
    if (!this.form.get('motivo')?.valid || this.excedeTope) return;

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
