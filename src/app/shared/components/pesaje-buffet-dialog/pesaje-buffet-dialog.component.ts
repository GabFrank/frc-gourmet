import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { Presentacion } from '../../../database/entities/productos/presentacion.entity';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { calcularCobroBuffet, BuffetCobroResult } from '../../utils/buffet-peso.util';

export interface PesajeBuffetDialogData {
  producto: Producto;
  presentacion: Presentacion;
  precioVenta: PrecioVenta; // valor = precio por kg; precioMinimo/precioMaximo opcionales
  decimalesMoneda?: number;
  // Peso bruto prellenado (ej: leído de etiqueta EAN-13 de balanza).
  pesoInicialGramos?: number;
}

export interface PesajeBuffetDialogResult {
  pesoBrutoGramos: number;
  pesoTaraGramos: number;
  pesoNetoGramos: number;
  cantidadKg: number;
  total: number;
  aplicoLibre: boolean;
  precioVentaUnitarioEfectivo: number;
  precioPorKg: number;
}

@Component({
  selector: 'app-pesaje-buffet-dialog',
  templateUrl: './pesaje-buffet-dialog.component.html',
  styleUrls: ['./pesaje-buffet-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
})
export class PesajeBuffetDialogComponent implements OnInit {
  pesoBruto = 0; // gramos
  tara = 0; // gramos
  precioPorKg = 0;
  precioMinimo: number | null = null;
  precioMaximo: number | null = null;
  pesoMinimoGramos: number | null = null;
  decimalesMoneda = 0;

  // Pre-calculado (regla: nada de funciones en template).
  resultado: BuffetCobroResult = {
    pesoNetoGramos: 0,
    cantidadKg: 0,
    subtotal: 0,
    total: 0,
    aplicoLibre: false,
    precioVentaUnitarioEfectivo: 0,
  };
  bajoMinimo = false;
  puedeAgregar = false;

  constructor(
    public dialogRef: MatDialogRef<PesajeBuffetDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PesajeBuffetDialogData,
  ) {
    this.tara = Number(data.producto?.taraGramos) || 0;
    this.pesoMinimoGramos = data.producto?.pesoMinimoGramos ?? null;
    this.precioPorKg = Number(data.precioVenta?.valor) || 0;
    this.precioMinimo = data.precioVenta?.precioMinimo ?? null;
    this.precioMaximo = data.precioVenta?.precioMaximo ?? null;
    this.decimalesMoneda = data.decimalesMoneda ?? 0;
    if (data.pesoInicialGramos && data.pesoInicialGramos > 0) {
      this.pesoBruto = data.pesoInicialGramos;
    }
  }

  ngOnInit(): void {
    this.recalcular();
  }

  onPesoChange(): void {
    this.recalcular();
  }

  private recalcular(): void {
    this.resultado = calcularCobroBuffet({
      pesoBrutoGramos: Number(this.pesoBruto) || 0,
      taraGramos: this.tara,
      precioPorKg: this.precioPorKg,
      precioMinimo: this.precioMinimo,
      precioMaximo: this.precioMaximo,
    });
    this.bajoMinimo =
      this.pesoMinimoGramos != null &&
      this.resultado.pesoNetoGramos > 0 &&
      this.resultado.pesoNetoGramos < Number(this.pesoMinimoGramos);
    this.puedeAgregar = Number(this.pesoBruto) > 0 && this.resultado.pesoNetoGramos > 0;
  }

  agregar(): void {
    if (!this.puedeAgregar) return;
    const result: PesajeBuffetDialogResult = {
      pesoBrutoGramos: Number(this.pesoBruto),
      pesoTaraGramos: this.tara,
      pesoNetoGramos: this.resultado.pesoNetoGramos,
      cantidadKg: this.resultado.cantidadKg,
      total: this.resultado.total,
      aplicoLibre: this.resultado.aplicoLibre,
      precioVentaUnitarioEfectivo: this.resultado.precioVentaUnitarioEfectivo,
      precioPorKg: this.precioPorKg,
    };
    this.dialogRef.close(result);
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
