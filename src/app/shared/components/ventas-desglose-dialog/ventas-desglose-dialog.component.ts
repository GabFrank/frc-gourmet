import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';

export interface DesgloseMonedaRow {
  monedaId: number;
  simbolo: string;
  denominacion: string;
  decimales: number;
  esPrincipal: boolean;
  cotizacion: number;
  total: number;
  totalEnGs: number;
}

export interface DesgloseFormaPagoRow {
  formaPago: string;
  monedaId: number;
  simbolo: string;
  total: number;
  totalEnGs: number;
  cotizacion: number;
}

export interface VentasDesgloseDialogData {
  titulo?: string;
  totalGs: number;
  porMoneda: DesgloseMonedaRow[];
  porFormaPago: DesgloseFormaPagoRow[];
}

interface MonedaVm {
  moneda: string;
  monto: string;
  cotizacion: string;
  enGs: string;
}

interface FormaPagoVm {
  formaPago: string;
  moneda: string;
  monto: string;
  enGs: string;
}

@Component({
  selector: 'app-ventas-desglose-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTableModule],
  templateUrl: './ventas-desglose-dialog.component.html',
  styleUrls: ['./ventas-desglose-dialog.component.scss'],
})
export class VentasDesgloseDialogComponent implements OnInit {
  titulo = 'Desglose del total de ventas';
  totalGsDisplay = '';
  monedasVm: MonedaVm[] = [];
  formasPagoVm: FormaPagoVm[] = [];
  monedaCols = ['moneda', 'monto', 'cotizacion', 'enGs'];
  formaPagoCols = ['formaPago', 'moneda', 'monto', 'enGs'];

  constructor(
    public dialogRef: MatDialogRef<VentasDesgloseDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: VentasDesgloseDialogData
  ) {}

  ngOnInit(): void {
    if (this.data?.titulo) {
      this.titulo = this.data.titulo;
    }
    this.totalGsDisplay = this.fmt(this.data?.totalGs || 0, 0) + ' Gs';

    this.monedasVm = (this.data?.porMoneda || []).map((m) => ({
      moneda: `${m.simbolo || ''} ${m.denominacion || ''}`.trim(),
      monto: `${m.simbolo || ''} ${this.fmt(m.total || 0, m.decimales || 0)}`.trim(),
      cotizacion: m.esPrincipal ? '—' : `${this.fmt(m.cotizacion || 0, 0)} Gs`,
      enGs: `${this.fmt(m.totalEnGs || 0, 0)} Gs`,
    }));

    this.formasPagoVm = (this.data?.porFormaPago || []).map((f) => ({
      formaPago: f.formaPago,
      moneda: f.simbolo || '',
      monto: `${f.simbolo || ''} ${this.fmt(f.total || 0, 0)}`.trim(),
      enGs: `${this.fmt(f.totalEnGs || 0, 0)} Gs`,
    }));
  }

  private fmt(value: number, decimales: number): string {
    return Number(value || 0).toLocaleString('es-PY', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    });
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
