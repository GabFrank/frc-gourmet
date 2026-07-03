import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { SeleccionarPresentacionDialogComponent } from '../seleccionar-presentacion-dialog/seleccionar-presentacion-dialog.component';

export interface AtajoProductosDialogData {
  atajoItemId: number;
  atajoItemNombre: string;
  gridSize?: number;
  /** Cantidad inicial propagada desde el input de cantidad del PdV. */
  cantidad?: number;
}

@Component({
  selector: 'app-atajo-productos-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './atajo-productos-dialog.component.html',
  styleUrls: ['./atajo-productos-dialog.component.scss']
})
export class AtajoProductosDialogComponent implements OnInit {
  productos: any[] = [];
  isLoading = true;
  cantidadFormControl = new FormControl(1);
  willReplace = true;
  gridSize = 3;

  constructor(
    public dialogRef: MatDialogRef<AtajoProductosDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AtajoProductosDialogData,
    private repositoryService: RepositoryService,
    private dialog: MatDialog
  ) {
    this.gridSize = data.gridSize || 3;
    // Propagar la cantidad del PdV como valor inicial (default 1).
    const cantidadInicial = Number(data.cantidad);
    if (cantidadInicial && cantidadInicial > 0) {
      this.cantidadFormControl.setValue(cantidadInicial);
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      const items = await firstValueFrom(this.repositoryService.getPdvAtajoItemProductos(this.data.atajoItemId));
      this.productos = items.filter((item: any) => item.activo && item.producto);
    } catch (error) {
      console.error('Error loading atajo productos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async selectProducto(item: any): Promise<void> {
    const producto = item.producto;
    const presentaciones = producto.presentaciones || [];
    const cantidad = this.cantidadFormControl.value || 1;
    const tipo = producto.tipo;

    // ELABORADO_CON_VARIACION: cerrar y señalar al PdV para abrir diálogo de variaciones
    if (tipo === 'ELABORADO_CON_VARIACION') {
      this.dialogRef.close({ producto, cantidad, isVariacionSelection: true });
      return;
    }

    // ELABORADO_SIN_VARIACION, COMBO: precio directo (no via presentación)
    if (tipo === 'ELABORADO_SIN_VARIACION' || tipo === 'COMBO') {
      const precioVenta = producto.precioDirecto;
      if (!precioVenta) {
        console.error('Producto sin precio de venta configurado');
        return;
      }
      // Presentacion puede ser null para elaborados — el PdV lo maneja
      const presentacion = presentaciones[0] || null;
      this.dialogRef.close({ producto, presentacion, precioVenta, cantidad });
      return;
    }

    // RETAIL / RETAIL_INGREDIENTE: precio via presentación
    if (presentaciones.length === 0) {
      console.error('Producto RETAIL sin presentaciones');
      return;
    }

    // Check if we need the presentation selector
    const totalPrecios = presentaciones.reduce((sum: number, p: any) =>
      sum + (p.preciosVenta?.length || 0), 0);
    const needsSelector = presentaciones.length > 1 || totalPrecios > 1;

    if (needsSelector) {
      const selectorRef = this.dialog.open(SeleccionarPresentacionDialogComponent, {
        width: '450px',
        data: { producto, presentaciones }
      });
      const result = await firstValueFrom(selectorRef.afterClosed());
      if (!result) return;
      this.dialogRef.close({
        producto,
        presentacion: result.presentacion,
        precioVenta: result.precioVenta,
        cantidad
      });
    } else {
      const presentacion = presentaciones[0];
      const precioVenta = presentacion.preciosVenta?.find((p: any) => p.principal)
        || presentacion.preciosVenta?.[0];
      this.dialogRef.close({ producto, presentacion, precioVenta, cantidad });
    }
  }

  getDisplayName(item: any): string {
    return item.nombre_alternativo || item.producto?.nombre || 'Sin nombre';
  }

  getPrice(item: any): number {
    const producto = item.producto;
    // For elaborados/combos: use precioDirecto
    if (producto?.precioDirecto) {
      return Number(producto.precioDirecto.valor) || 0;
    }
    // For retail: search across all presentaciones for principal price
    const presentaciones = producto?.presentaciones || [];
    for (const pres of presentaciones) {
      const precio = pres.preciosVenta?.find((p: any) => p.principal) || pres.preciosVenta?.[0];
      if (precio) return Number(precio.valor) || 0;
    }
    return 0;
  }

  onCantidadPress(digit: number): void {
    if (this.willReplace) {
      this.cantidadFormControl.setValue(digit);
      this.willReplace = false;
    } else {
      this.cantidadFormControl.setValue((this.cantidadFormControl.value || 0) * 10 + digit);
    }
  }

  onClearPress(): void {
    this.cantidadFormControl.setValue(1);
    this.willReplace = true;
  }
}
