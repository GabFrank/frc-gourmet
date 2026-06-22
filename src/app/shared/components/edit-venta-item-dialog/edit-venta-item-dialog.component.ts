import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatRadioModule } from '@angular/material/radio';
import { firstValueFrom } from 'rxjs';

import { VentaItem } from '../../../database/entities/ventas/venta-item.entity';
import { RepositoryService } from '../../../database/repository.service';
import { Observacion } from '../../../database/entities/productos/observacion.entity';

export interface EditVentaItemDialogData {
  ventaItem: VentaItem;
}

const REDONDEO_BASE = 500;

@Component({
  selector: 'app-edit-venta-item-dialog',
  templateUrl: './edit-venta-item-dialog.component.html',
  styleUrls: ['./edit-venta-item-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatChipsModule,
    MatRadioModule,
  ],
})
export class EditVentaItemDialogComponent implements OnInit {
  form!: FormGroup;
  totalCalculado = 0;
  totalFinal = 0;
  redondeoArriba = 0;
  redondeoAbajo = 0;
  redondeoSeleccionado: 'arriba' | 'abajo' | 'exacto' = 'exacto';
  // Control reactivo; `modoDescuento` se mantiene sincronizado para los *ngIf del template
  modoDescuentoControl = new FormControl<'monto' | 'porcentaje'>('monto', { nonNullable: true });
  modoDescuento: 'monto' | 'porcentaje' = 'monto';
  porcentajesRapidos = [5, 10, 15, 20, 25, 50];

  observaciones: Observacion[] = [];
  selectedObservacionIds: Set<number> = new Set();
  observacionLibreControl = new FormControl('', { nonNullable: true });

  constructor(
    public dialogRef: MatDialogRef<EditVentaItemDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditVentaItemDialogData,
    private fb: FormBuilder,
    private repositoryService: RepositoryService
  ) {}

  async ngOnInit(): Promise<void> {
    const item = this.data.ventaItem;
    this.form = this.fb.group({
      cantidad: [item.cantidad, [Validators.required, Validators.min(0.01)]],
      descuentoUnitario: [item.descuentoUnitario || 0, [Validators.min(0)]],
      descuentoPorcentaje: [0, [Validators.min(0), Validators.max(100)]],
    });

    // Detectar si el descuento existente corresponde a un porcentaje
    if (item.descuentoUnitario > 0 && item.precioVentaUnitario > 0) {
      const pct = (item.descuentoUnitario / item.precioVentaUnitario) * 100;
      if (Number.isInteger(Math.round(pct))) {
        this.form.get('descuentoPorcentaje')?.setValue(Math.round(pct));
      }
    }

    this.modoDescuentoControl.valueChanges.subscribe(value => {
      this.modoDescuento = value;
    });

    this.recalcular();
    this.form.valueChanges.subscribe(() => this.recalcular());

    // Cargar observaciones vinculadas al producto
    if (item.producto?.id) {
      const productoObs = await firstValueFrom(this.repositoryService.getObservacionesByProducto(item.producto.id));
      this.observaciones = productoObs
        .filter((po: any) => po.activo && po.observacion?.activo)
        .map((po: any) => po.observacion);
    }

    // Cargar observaciones ya asignadas al item
    const assigned = await firstValueFrom(this.repositoryService.getObservacionesByVentaItem(item.id));
    assigned.forEach((a: any) => {
      if (a.observacion?.id) {
        this.selectedObservacionIds.add(a.observacion.id);
      }
      if (a.observacionLibre) {
        this.observacionLibreControl.setValue(a.observacionLibre);
      }
    });
  }

  recalcular(): void {
    const cantidad = this.form.get('cantidad')?.value || 0;
    const precio = this.data.ventaItem.precioVentaUnitario;
    let descuento: number;

    if (this.modoDescuento === 'porcentaje') {
      const pct = this.form.get('descuentoPorcentaje')?.value || 0;
      descuento = Math.round(precio * pct / 100);
      this.form.get('descuentoUnitario')?.setValue(descuento, { emitEvent: false });
    } else {
      descuento = this.form.get('descuentoUnitario')?.value || 0;
    }

    this.totalCalculado = (precio - descuento) * cantidad;
    this.redondeoArriba = Math.ceil(this.totalCalculado / REDONDEO_BASE) * REDONDEO_BASE;
    this.redondeoAbajo = Math.floor(this.totalCalculado / REDONDEO_BASE) * REDONDEO_BASE;
    if (this.redondeoAbajo < REDONDEO_BASE && this.totalCalculado > 0) {
      this.redondeoAbajo = REDONDEO_BASE;
    }

    // Aplicar redondeo seleccionado
    if (this.redondeoSeleccionado === 'arriba') {
      this.totalFinal = this.redondeoArriba;
    } else if (this.redondeoSeleccionado === 'abajo') {
      this.totalFinal = this.redondeoAbajo;
    } else {
      this.totalFinal = this.totalCalculado;
    }

    // Recalcular descuento unitario basado en redondeo
    if (this.redondeoSeleccionado !== 'exacto' && cantidad > 0) {
      const descuentoRedondeado = precio - (this.totalFinal / cantidad);
      this.form.get('descuentoUnitario')?.setValue(Math.round(descuentoRedondeado), { emitEvent: false });
    }
  }

  onModoDescuentoChange(): void {
    if (this.modoDescuento === 'porcentaje') {
      // Calcular % desde el descuento actual
      const descuento = this.form.get('descuentoUnitario')?.value || 0;
      const precio = this.data.ventaItem.precioVentaUnitario;
      if (precio > 0 && descuento > 0) {
        this.form.get('descuentoPorcentaje')?.setValue(Math.round((descuento / precio) * 100));
      }
    }
    this.redondeoSeleccionado = 'exacto';
    this.recalcular();
  }

  aplicarPorcentajeRapido(pct: number): void {
    this.form.get('descuentoPorcentaje')?.setValue(pct);
    this.redondeoSeleccionado = 'exacto';
    this.recalcular();
  }

  aplicarRedondeo(tipo: 'arriba' | 'abajo' | 'exacto'): void {
    this.redondeoSeleccionado = tipo;
    this.recalcular();
  }

  toggleObservacion(obs: Observacion): void {
    if (this.selectedObservacionIds.has(obs.id)) {
      this.selectedObservacionIds.delete(obs.id);
    } else {
      this.selectedObservacionIds.add(obs.id);
    }
  }

  isObservacionSelected(obs: Observacion): boolean {
    return this.selectedObservacionIds.has(obs.id);
  }

  guardar(): void {
    if (this.form.valid) {
      this.dialogRef.close({
        cantidad: this.form.get('cantidad')?.value,
        descuentoUnitario: this.form.get('descuentoUnitario')?.value,
        observacionIds: Array.from(this.selectedObservacionIds),
        observacionLibre: this.observacionLibreControl.value.toUpperCase() || null,
      });
    }
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
