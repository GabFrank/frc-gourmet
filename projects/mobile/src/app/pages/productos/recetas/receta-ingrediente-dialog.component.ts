import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

export interface RecetaIngredienteDialogData {
  recetaId: number;
  item?: any; // RecetaIngrediente existente (modo edición)
}

export interface RecetaIngredienteResult {
  id?: number;
  recetaId: number;
  ingredienteId: number | null;
  descripcion: string | null;
  cantidad: number;
  unidad: string;
  unidadOriginal: string;
  costoUnitario: number;
  costoTotal: number;
  activo: boolean;
}

const UNIDADES = ['UNIDADES', 'GRAMOS', 'KILOGRAMOS', 'MILILITROS', 'LITROS', 'PAQUETES'];

/**
 * Alta/edición de un ítem de receta. Dos modos:
 *  - PRODUCTO: buscar y vincular un producto; el costo se autocompleta desde su
 *    precio de costo (editable).
 *  - DESCRIPCIÓN: texto libre sin producto; el costo se carga a mano.
 * En ambos, el usuario puede ajustar cantidad, unidad y costo unitario; el total
 * se calcula (cantidad × costo unitario).
 */
@Component({
  selector: 'app-receta-ingrediente-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule,
  ],
  templateUrl: './receta-ingrediente-dialog.component.html',
  styleUrls: ['./receta-ingrediente-dialog.component.scss'],
})
export class RecetaIngredienteDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly dialogRef = inject(MatDialogRef<RecetaIngredienteDialogComponent, RecetaIngredienteResult>);

  readonly unidades = UNIDADES;
  modo: 'producto' | 'descripcion' = 'producto';

  // Producto vinculado
  termino = '';
  buscando = false;
  resultados: { id: number; nombre: string }[] = [];
  productoId: number | null = null;
  productoNombre = '';

  // Descripción libre
  descripcion = '';

  // Comunes
  cantidad: number | null = 1;
  unidad = 'UNIDADES';
  costoUnitario: number | null = 0;
  totalCalculado = 0;

  private searchTimer: any = null;
  esEdicion = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: RecetaIngredienteDialogData) {}

  ngOnInit(): void {
    const it = this.data.item;
    if (it) {
      this.esEdicion = true;
      this.cantidad = it.cantidad ?? 1;
      this.unidad = it.unidad || 'UNIDADES';
      this.costoUnitario = Number(it.costoUnitario || 0);
      if (it.ingrediente) {
        this.modo = 'producto';
        this.productoId = it.ingrediente.id;
        this.productoNombre = it.ingrediente.nombre || '';
      } else {
        this.modo = 'descripcion';
        this.descripcion = it.descripcion || '';
      }
    }
    this.recalcTotal();
  }

  recalcTotal(): void {
    this.totalCalculado = Math.round((Number(this.cantidad) || 0) * (Number(this.costoUnitario) || 0));
  }

  onTermino(valor: string): void {
    this.termino = (valor || '').toUpperCase();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.termino.trim().length < 2) {
      this.resultados = [];
      return;
    }
    this.searchTimer = setTimeout(() => this.buscar(), 300);
  }

  private buscar(): void {
    const t = this.termino.trim();
    if (!t) return;
    this.buscando = true;
    this.repo.searchProductosByNombre(t, 'compra').subscribe({
      next: (data: any[]) => {
        this.resultados = (data || []).map((p) => ({ id: p.id, nombre: p.nombre }));
        this.buscando = false;
      },
      error: () => {
        this.buscando = false;
      },
    });
  }

  async seleccionarProducto(p: { id: number; nombre: string }): Promise<void> {
    this.productoId = p.id;
    this.productoNombre = p.nombre;
    this.resultados = [];
    this.termino = '';
    // Autocompletar el costo unitario desde el último precio de costo (editable).
    try {
      const precios: any[] = await firstValueFrom(this.repo.getPreciosCostoByProducto(p.id));
      const activo = (precios || []).find((x) => x.activo) || (precios || [])[0];
      if (activo && activo.valor != null) this.costoUnitario = Number(activo.valor);
    } catch {
      /* sin costo → queda el actual */
    }
    this.recalcTotal();
  }

  limpiarProducto(): void {
    this.productoId = null;
    this.productoNombre = '';
  }

  confirmar(): void {
    if (this.modo === 'producto' && this.productoId == null) return;
    if (this.modo === 'descripcion' && !this.descripcion.trim()) return;
    const cantidad = Number(this.cantidad) || 0;
    const costoUnitario = Number(this.costoUnitario) || 0;
    this.dialogRef.close({
      id: this.data.item?.id,
      recetaId: this.data.recetaId,
      ingredienteId: this.modo === 'producto' ? this.productoId : null,
      descripcion: this.modo === 'descripcion' ? this.descripcion.trim().toUpperCase() : null,
      cantidad,
      unidad: this.unidad,
      unidadOriginal: this.unidad,
      costoUnitario,
      costoTotal: Math.round(cantidad * costoUnitario),
      activo: true,
    });
  }

  cancelar(): void {
    this.dialogRef.close();
  }
}
