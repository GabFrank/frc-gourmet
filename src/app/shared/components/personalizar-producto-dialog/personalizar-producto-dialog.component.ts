import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { Producto } from '../../../database/entities/productos/producto.entity';
import { Presentacion } from '../../../database/entities/productos/presentacion.entity';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { RecetaIngrediente } from '../../../database/entities/productos/receta-ingrediente.entity';
import { RecetaIngredienteIntercambiable } from '../../../database/entities/productos/receta-ingrediente-intercambiable.entity';
import { RecetaAdicionalVinculacion } from '../../../database/entities/productos/receta-adicional-vinculacion.entity';
import { Observacion } from '../../../database/entities/productos/observacion.entity';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RepositoryService } from '../../../database/repository.service';

export interface PersonalizarProductoDialogData {
  producto: Producto;
  presentacion: Presentacion;
  precioVenta: PrecioVenta;
  cantidad: number;
  recetaId?: number; // Si viene, usar este en vez de producto.receta?.id (para variaciones)
  // Modo edición: datos existentes
  modoEdicion?: boolean;
  ingredientesRemovidos?: number[];
  ingredientesIntercambiados?: { recetaIngredienteId: number; reemplazoProductoId: number }[];
  adicionalesSeleccionados?: number[];
  observacionIds?: number[];
  observacionLibre?: string;
}

export interface PersonalizarProductoDialogResult {
  cantidad: number;
  ingredientesRemovidos: number[];
  ingredientesIntercambiados: { recetaIngredienteId: number; reemplazoProductoId: number }[];
  adicionalesSeleccionados: { adicionalId: number; precio: number; cantidad: number }[];
  observacionIds: number[];
  observacionLibre: string | null;
  precioAdicionalTotal: number;
}

interface AdicionalPorCategoria {
  categoria: string;
  items: RecetaAdicionalVinculacion[];
}

@Component({
  selector: 'app-personalizar-producto-dialog',
  templateUrl: './personalizar-producto-dialog.component.html',
  styleUrls: ['./personalizar-producto-dialog.component.scss'],
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
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
})
export class PersonalizarProductoDialogComponent implements OnInit {
  loading = true;
  cantidad: number;
  precioBase = 0;
  modoEdicion = false;

  // Ingredientes clasificados
  ingredientesBase: RecetaIngrediente[] = [];
  ingredientesOpcionales: RecetaIngrediente[] = [];
  ingredientesCambiables: RecetaIngrediente[] = [];
  ingredientesNormales: RecetaIngrediente[] = [];

  // Intercambiables por ingrediente
  intercambiablesMap: Map<number, RecetaIngredienteIntercambiable[]> = new Map();

  // Adicionales
  adicionalesPorCategoria: AdicionalPorCategoria[] = [];

  // Observaciones
  observaciones: Observacion[] = [];

  // Estado de personalización
  removedIngredientIds: Set<number> = new Set();
  swapSelections: Map<number, RecetaIngredienteIntercambiable> = new Map();
  selectedAdicionales: Map<number, RecetaAdicionalVinculacion> = new Map();
  selectedObservacionIds: Set<number> = new Set();
  observacionLibreControl = new FormControl('', { nonNullable: true });

  // Totales pre-computados
  totalAdicionales = 0;
  precioFinal = 0;

  // Texto de ingredientes fijos (base + normales) pre-computado
  textoIngredientesFijos = '';

  // Flags para mostrar secciones
  tieneIngredientes = false;
  tieneAdicionales = false;
  tieneObservaciones = false;

  private receta: Receta | null = null;

  constructor(
    public dialogRef: MatDialogRef<PersonalizarProductoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PersonalizarProductoDialogData,
    private repositoryService: RepositoryService
  ) {
    this.cantidad = data.cantidad;
    this.precioBase = data.precioVenta?.valor || 0;
    this.modoEdicion = data.modoEdicion || false;
  }

  async ngOnInit(): Promise<void> {
    try {
      const recetaId = this.data.recetaId || (this.data.producto as any).receta?.id;
      if (!recetaId) {
        this.loading = false;
        return;
      }

      this.receta = await firstValueFrom(this.repositoryService.getReceta(recetaId));
      if (!this.receta) {
        this.loading = false;
        return;
      }

      const [ingredientes, vinculaciones, productoObs] = await Promise.all([
        firstValueFrom(this.repositoryService.getRecetaIngredientesActivos(this.receta.id)),
        firstValueFrom(this.repositoryService.getRecetaAdicionalVinculaciones(this.receta.id)),
        this.data.producto?.id
          ? firstValueFrom(this.repositoryService.getObservacionesByProducto(this.data.producto.id))
          : Promise.resolve([]),
      ]);

      // Clasificar ingredientes
      this.clasificarIngredientes(ingredientes || []);
      this.tieneIngredientes = (this.ingredientesOpcionales.length + this.ingredientesCambiables.length) > 0;
      const fijos = [...this.ingredientesBase, ...this.ingredientesNormales];
      this.textoIngredientesFijos = fijos.map(i => i.ingrediente?.nombre).filter(Boolean).join(', ');

      // Cargar intercambiables
      if (this.ingredientesCambiables.length > 0) {
        const intercambiablesPromises = this.ingredientesCambiables.map(ing =>
          firstValueFrom(this.repositoryService.getRecetaIngredientesIntercambiables(ing.id))
        );
        const intercambiablesResults = await Promise.all(intercambiablesPromises);
        this.ingredientesCambiables.forEach((ing, index) => {
          const items = (intercambiablesResults[index] || []).filter((i: any) => i.activo);
          if (items.length > 0) {
            this.intercambiablesMap.set(ing.id, items);
          }
        });
      }

      // Agrupar adicionales
      const adicionalesActivos = (vinculaciones || []).filter((v: any) => v.activo && v.adicional?.activo);
      this.agruparAdicionales(adicionalesActivos);
      this.tieneAdicionales = adicionalesActivos.length > 0;

      // Observaciones
      this.observaciones = (productoObs || [])
        .filter((po: any) => po.activo && po.observacion?.activo)
        .map((po: any) => po.observacion);
      this.tieneObservaciones = this.observaciones.length > 0;

      // Restaurar selecciones en modo edición
      if (this.modoEdicion) {
        this.restaurarSelecciones();
      }

      this.recalcular();
    } catch (error) {
      console.error('Error loading personalización data:', error);
    } finally {
      this.loading = false;
    }
  }

  private restaurarSelecciones(): void {
    // Ingredientes removidos
    if (this.data.ingredientesRemovidos) {
      for (const id of this.data.ingredientesRemovidos) {
        this.removedIngredientIds.add(id);
      }
    }

    // Ingredientes intercambiados
    if (this.data.ingredientesIntercambiados) {
      for (const swap of this.data.ingredientesIntercambiados) {
        const opciones = this.intercambiablesMap.get(swap.recetaIngredienteId);
        if (opciones) {
          const match = opciones.find(o => o.ingredienteOpcion?.id === swap.reemplazoProductoId);
          if (match) {
            this.swapSelections.set(swap.recetaIngredienteId, match);
          }
        }
      }
    }

    // Adicionales seleccionados
    if (this.data.adicionalesSeleccionados) {
      for (const adicionalId of this.data.adicionalesSeleccionados) {
        // Buscar la vinculación correspondiente
        for (const grupo of this.adicionalesPorCategoria) {
          for (const vinc of grupo.items) {
            const vincAdicionalId = (vinc.adicional as any)?.id || vinc.adicional;
            if (vincAdicionalId === adicionalId) {
              this.selectedAdicionales.set(adicionalId, vinc);
            }
          }
        }
      }
    }

    // Observaciones
    if (this.data.observacionIds) {
      for (const id of this.data.observacionIds) {
        this.selectedObservacionIds.add(id);
      }
    }

    // Observación libre
    if (this.data.observacionLibre) {
      this.observacionLibreControl.setValue(this.data.observacionLibre);
    }
  }

  private clasificarIngredientes(ingredientes: RecetaIngrediente[]): void {
    this.ingredientesBase = [];
    this.ingredientesOpcionales = [];
    this.ingredientesCambiables = [];
    this.ingredientesNormales = [];

    for (const ing of ingredientes) {
      if (ing.esIngredienteBase) {
        this.ingredientesBase.push(ing);
      } else if (ing.esCambiable) {
        this.ingredientesCambiables.push(ing);
      } else if (ing.esOpcional) {
        this.ingredientesOpcionales.push(ing);
      } else {
        this.ingredientesNormales.push(ing);
      }
    }
  }

  private agruparAdicionales(vinculaciones: RecetaAdicionalVinculacion[]): void {
    const grupoMap = new Map<string, RecetaAdicionalVinculacion[]>();

    for (const v of vinculaciones) {
      const cat = (v.adicional as any)?.categoria || 'OTROS';
      if (!grupoMap.has(cat)) {
        grupoMap.set(cat, []);
      }
      grupoMap.get(cat)!.push(v);
    }

    this.adicionalesPorCategoria = Array.from(grupoMap.entries()).map(([categoria, items]) => ({
      categoria,
      items,
    }));
  }

  toggleIngrediente(ing: RecetaIngrediente): void {
    if (this.removedIngredientIds.has(ing.id)) {
      this.removedIngredientIds.delete(ing.id);
    } else {
      this.removedIngredientIds.add(ing.id);
    }
  }

  isIngredienteRemovido(ing: RecetaIngrediente): boolean {
    return this.removedIngredientIds.has(ing.id);
  }

  isIngredienteIntercambiado(ing: RecetaIngrediente): boolean {
    return this.swapSelections.has(ing.id);
  }

  selectSwap(ing: RecetaIngrediente, swap: RecetaIngredienteIntercambiable | null): void {
    if (swap) {
      this.swapSelections.set(ing.id, swap);
    } else {
      this.swapSelections.delete(ing.id);
    }
  }

  getSelectedSwap(ing: RecetaIngrediente): RecetaIngredienteIntercambiable | null {
    return this.swapSelections.get(ing.id) || null;
  }

  getSwapLabel(ing: RecetaIngrediente): string {
    const swap = this.swapSelections.get(ing.id);
    return swap ? swap.ingredienteOpcion?.nombre || '' : '';
  }

  toggleAdicional(vinc: RecetaAdicionalVinculacion): void {
    const adicionalId = (vinc.adicional as any)?.id || vinc.adicional;
    if (this.selectedAdicionales.has(adicionalId)) {
      this.selectedAdicionales.delete(adicionalId);
    } else {
      this.selectedAdicionales.set(adicionalId, vinc);
    }
    this.recalcular();
  }

  isAdicionalSelected(vinc: RecetaAdicionalVinculacion): boolean {
    const adicionalId = (vinc.adicional as any)?.id || vinc.adicional;
    return this.selectedAdicionales.has(adicionalId);
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

  incrementarCantidad(): void {
    this.cantidad++;
    this.recalcular();
  }

  decrementarCantidad(): void {
    if (this.cantidad > 1) {
      this.cantidad--;
      this.recalcular();
    }
  }

  recalcular(): void {
    this.totalAdicionales = 0;
    this.selectedAdicionales.forEach(vinc => {
      this.totalAdicionales += Number(vinc.precioAdicional) || 0;
    });
    this.precioFinal = (this.precioBase + this.totalAdicionales) * this.cantidad;
  }

  confirmar(): void {
    const ingredientesIntercambiados: { recetaIngredienteId: number; reemplazoProductoId: number }[] = [];
    this.swapSelections.forEach((swap, ingId) => {
      ingredientesIntercambiados.push({
        recetaIngredienteId: ingId,
        reemplazoProductoId: swap.ingredienteOpcion?.id || (swap.ingredienteOpcion as any),
      });
    });

    const adicionalesSeleccionados: { adicionalId: number; precio: number; cantidad: number }[] = [];
    this.selectedAdicionales.forEach((vinc, adicionalId) => {
      adicionalesSeleccionados.push({
        adicionalId,
        precio: Number(vinc.precioAdicional),
        cantidad: 1,
      });
    });

    const result: PersonalizarProductoDialogResult = {
      cantidad: this.cantidad,
      ingredientesRemovidos: Array.from(this.removedIngredientIds),
      ingredientesIntercambiados,
      adicionalesSeleccionados,
      observacionIds: Array.from(this.selectedObservacionIds),
      observacionLibre: this.observacionLibreControl.value?.trim().toUpperCase() || null,
      precioAdicionalTotal: this.totalAdicionales,
    };

    this.dialogRef.close(result);
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
