import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface RepartidorOpcion {
  id: number;
  nombre: string;
  cargo: string | null;
}

export interface SeleccionarRepartidorDialogData {
  repartidores: RepartidorOpcion[];
  seleccionadoId: number | null;
}

/**
 * Elige el funcionario que lleva el pedido, al pasar el delivery a EN_CAMINO.
 *
 * Antes esto no existía: el botón ENVIAR tenía un `// TODO: seleccionar
 * entregador` y la columna ENTREGADOR de la lista mostraba siempre "-".
 *
 * El repartidor es un `Funcionario` y no un `Usuario` a propósito: rara vez
 * tiene usuario del sistema, y así queda enganchado a comisiones y
 * liquidaciones.
 */
@Component({
  selector: 'app-seleccionar-repartidor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './seleccionar-repartidor-dialog.component.html',
  styleUrls: ['./seleccionar-repartidor-dialog.component.scss'],
})
export class SeleccionarRepartidorDialogComponent {
  filtro = '';
  visibles: RepartidorOpcion[] = [];
  seleccionadoId: number | null;

  constructor(
    public dialogRef: MatDialogRef<SeleccionarRepartidorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SeleccionarRepartidorDialogData,
  ) {
    this.visibles = data.repartidores ?? [];
    this.seleccionadoId = data.seleccionadoId ?? null;
  }

  /**
   * Filtro explícito por botón/Enter: la regla del proyecto es no filtrar en
   * vivo. Con una lista de funcionarios corta, además, el filtro casi nunca se
   * usa.
   */
  aplicarFiltro(): void {
    const q = this.filtro.trim().toUpperCase();
    this.visibles = q
      ? (this.data.repartidores ?? []).filter((r) => r.nombre.toUpperCase().includes(q))
      : (this.data.repartidores ?? []);
  }

  seleccionar(id: number): void {
    this.seleccionadoId = id;
  }

  confirmar(): void {
    this.dialogRef.close(this.seleccionadoId);
  }

  cancelar(): void {
    // `undefined` = cancelado; `null` = "enviar sin repartidor" (lo acepta o lo
    // rechaza el backend según `deliveryRequiereRepartidor`).
    this.dialogRef.close(undefined);
  }

  sinRepartidor(): void {
    this.dialogRef.close(null);
  }
}
