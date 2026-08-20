import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { AgregarItemDialogComponent, AgregarItemResult } from './agregar-item-dialog.component';
import {
  ajustarProporcion,
  calcularTotalesVariacion,
  etiquetaProporcion,
  proporcionesIguales,
} from './variacion-precio.util';

export interface SeleccionarVariacionData {
  productoId: number;
  nombre: string;
  /**
   * Config de multi-sabor del producto ya resuelta por el backend (override del
   * producto o global del PdV). Si no viene, se cae al global de `PdvConfig`.
   */
  variacionConfig?: { maxSabores?: number; estrategia?: string } | null;
}

export interface VariacionSaborResult {
  recetaPresentacionId: number;
  proporcion: number;
  precioReferencia: number;
  costoReferencia: number;
  nombre: string;
  adicionales: { id: number; precio: number }[];
  observaciones: number[];
  observacionLibre?: string;
  ingredientesRemovidos: number[];
  ingredientesIntercambiados: { recetaIngredienteId: number; reemplazoProductoId: number }[];
}

export interface SeleccionarVariacionResult {
  presentacionId: number;
  recetaPresentacionPrincipalId: number;
  precioVentaPresentacionId: number | null;
  sabores: VariacionSaborResult[];
  precioCalculado: number; // precio por sabores (estrategia), sin adicionales
  precioAdicionalTotal: number; // suma de adicionales por-sabor (por unidad)
  costoCalculado: number;
  cantidad: number;
  ensambladoDescripcion: string;
}

interface PresentacionVM {
  id: number;
  nombre: string;
}

interface SaborVM {
  recetaPresentacionId: number;
  recetaId: number | null;
  nombre: string;
  precio: number;
  precioId: number | null;
  costo: number;
  sel: boolean;
  /** proporción de la pizza que ocupa este sabor (0.5 = mitad) */
  proporcion: number;
  // Personalización por-sabor (todo se persiste con FK ventaItemSabor).
  adicionales: { id: number; precio: number }[];
  observaciones: number[];
  observacionLibre?: string;
  ingredientesRemovidos: number[];
  ingredientesIntercambiados: { recetaIngredienteId: number; reemplazoProductoId: number }[];
  adicTotal: number;
  /** true si tiene alguna personalización cargada (muestra el ✓) */
  personalizado: boolean;
  /** etiqueta de porción pre-computada: `1/2`, `60%`, o vacío si es único */
  etiqueta: string;
}

/** Nombres visibles según el tipo de variación (pizza usa TAMAÑO/SABOR/MITAD). */
interface VariacionLabels {
  size: string;
  variation: string;
  variations: string;
}

/**
 * Diálogo para vender un producto ELABORADO_CON_VARIACION (ej. pizza): elegir
 * tamaño (presentación) → sabores (hasta `pizzaMaxSabores`) → cantidad. El
 * precio se calcula según `pdvConfig.pizzaEstrategiaPrecio` (MAYOR_PRECIO o
 * PROMEDIO) y el costo es proporcional. Cada sabor puede personalizarse con
 * adicionales/observaciones (se persisten con FK `ventaItemSabor`). Replica el
 * flujo del PdV desktop.
 */
@Component({
  selector: 'app-seleccionar-variacion-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.nombre }}</h2>
    <mat-progress-bar *ngIf="cargando" mode="indeterminate"></mat-progress-bar>
    <mat-dialog-content>
      <ng-container *ngIf="presentaciones.length > 1">
        <h3 class="sec">{{ labels.size }}</h3>
        <div class="chips">
          <button
            *ngFor="let p of presentaciones"
            class="chip"
            [class.chip-sel]="presentacionSel?.id === p.id"
            (click)="selectPresentacion(p)"
          >
            {{ p.nombre }}
          </button>
        </div>
      </ng-container>

      <ng-container *ngIf="presentacionSel">
        <h3 class="sec">
          {{ labels.variations }}
          <span class="hint" *ngIf="permiteMultiple">(hasta {{ maxSabores }})</span>
        </h3>
        <div class="opt" *ngFor="let s of sabores">
          <mat-checkbox [checked]="s.sel" (change)="toggleSabor(s)">{{ s.nombre }}</mat-checkbox>
          <span class="opt-precio">{{ s.precio | number: '1.0-2' }}</span>
        </div>
        <p *ngIf="!cargando && sabores.length === 0" class="vacio">
          Sin sabores configurados para este tamaño.
        </p>
      </ng-container>

      <ng-container *ngIf="seleccionados.length">
        <h3 class="sec">Cantidad</h3>
        <div class="stepper">
          <button mat-icon-button (click)="dec()" [disabled]="cantidad <= 1" aria-label="Menos">
            <mat-icon>remove_circle</mat-icon>
          </button>
          <span class="cant">{{ cantidad }}</span>
          <button mat-icon-button (click)="inc()" aria-label="Más">
            <mat-icon>add_circle</mat-icon>
          </button>
        </div>
        <h3 class="sec">
          {{ labelPorVariacion }}
          <button
            *ngIf="seleccionados.length > 1 && proporcionesManuales"
            mat-button
            class="reset-prop"
            (click)="restablecerProporciones()"
          >
            Partes iguales
          </button>
        </h3>
        <div class="sabor-row" *ngFor="let s of seleccionados">
          <div class="sabor-head">
            <span class="sabor-nombre">
              {{ s.nombre }}
              <mat-icon class="badge" *ngIf="s.personalizado">check_circle</mat-icon>
            </span>
            <button mat-button color="primary" (click)="personalizarSabor(s)">Personalizar</button>
          </div>
          <div class="prop-row" *ngIf="seleccionados.length > 1">
            <button mat-icon-button (click)="ajustarProporcion(s, -10)" aria-label="Menos porción">
              <mat-icon>remove</mat-icon>
            </button>
            <span class="prop-val">{{ s.etiqueta }}</span>
            <button mat-icon-button (click)="ajustarProporcion(s, 10)" aria-label="Más porción">
              <mat-icon>add</mat-icon>
            </button>
          </div>
        </div>

        <div class="ensamblado">{{ ensamblado }}</div>
        <div class="total">Total: {{ totalLinea | number: '1.0-2' }}</div>
      </ng-container>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(undefined)">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        (click)="confirmar()"
        [disabled]="cargando || seleccionados.length === 0"
      >
        Agregar {{ cantidad }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .sec {
        margin: 12px 0 6px;
        font-size: 0.85rem;
        text-transform: uppercase;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
      .hint {
        text-transform: none;
        font-weight: 400;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        border: 1px solid var(--border-color, rgba(0, 0, 0, 0.2));
        background: var(--card-background, #fff);
        color: var(--text-primary, inherit);
        border-radius: 16px;
        padding: 6px 14px;
        cursor: pointer;
      }
      .chip-sel {
        background: var(--primary, #1976d2);
        color: #fff;
        border-color: var(--primary, #1976d2);
      }
      .opt {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 0;
      }
      .opt-precio {
        color: var(--primary, #1976d2);
        font-size: 0.9rem;
      }
      .vacio {
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
        font-size: 0.9rem;
      }
      .stepper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        margin: 4px 0;
      }
      .stepper mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
      }
      .cant {
        font-size: 1.6rem;
        font-weight: 600;
        min-width: 48px;
        text-align: center;
      }
      .ensamblado {
        text-align: center;
        font-size: 0.85rem;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
        margin-top: 4px;
      }
      .total {
        text-align: center;
        font-weight: 600;
        color: var(--primary, #1976d2);
        margin-top: 8px;
      }
      .badge {
        font-size: 16px;
        width: 16px;
        height: 16px;
        vertical-align: middle;
        color: var(--success-color, #2e7d32);
      }
      .sabor-row {
        border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
        padding: 4px 0;
      }
      .sabor-row:last-of-type {
        border-bottom: none;
      }
      .sabor-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .sabor-nombre {
        font-size: 0.95rem;
      }
      .prop-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }
      .prop-val {
        min-width: 48px;
        text-align: center;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .reset-prop {
        float: right;
        line-height: 24px;
        font-size: 0.75rem;
      }
    `,
  ],
})
export class SeleccionarVariacionDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  cargando = true;
  maxSabores = 2;
  /** false si el producto acepta un solo sabor por ítem (sin mitad y mitad). */
  permiteMultiple = true;
  estrategia = 'MAYOR_PRECIO';
  labels: VariacionLabels = { size: 'Presentación', variation: 'Variación', variations: 'Variaciones' };
  labelPorVariacion = 'Por variación';
  /** true si el usuario tocó los porcentajes (deja de repartir en partes iguales) */
  proporcionesManuales = false;

  presentaciones: PresentacionVM[] = [];
  presentacionSel: PresentacionVM | null = null;
  sabores: SaborVM[] = [];
  seleccionados: SaborVM[] = [];

  cantidad = 1;
  precioCalculado = 0;
  totalAdicionales = 0;
  costoCalculado = 0;
  totalLinea = 0;
  ensamblado = '';

  constructor(
    public ref: MatDialogRef<SeleccionarVariacionDialogComponent, SeleccionarVariacionResult | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: SeleccionarVariacionData,
  ) {}

  ngOnInit(): void {
    const configProducto = this.data.variacionConfig;
    const maxProducto = Number(configProducto?.maxSabores);
    if (Number.isFinite(maxProducto) && maxProducto >= 1) {
      this.maxSabores = Math.floor(maxProducto);
      this.permiteMultiple = this.maxSabores > 1;
      this.estrategia = String(configProducto?.estrategia || 'MAYOR_PRECIO').toUpperCase();
    } else {
      // Producto sin config propia: rige el global del PdV.
      this.repo.getPdvConfig().subscribe({
        next: (cfg: any) => {
          this.maxSabores = Number(cfg?.pizzaMaxSabores) || 2;
          this.permiteMultiple = this.maxSabores > 1;
          this.estrategia = cfg?.pizzaEstrategiaPrecio || 'MAYOR_PRECIO';
        },
        error: () => {},
      });
    }

    this.repo.getPresentacionesByProducto(this.data.productoId, 0, 100, 'activos').subscribe({
      next: (resp: any) => {
        this.presentaciones = (resp?.data || []).map((p: any) => ({ id: p.id, nombre: p.nombre }));
        if (this.presentaciones.length === 1) {
          this.selectPresentacion(this.presentaciones[0]);
        } else {
          this.cargando = false;
        }
      },
      error: () => {
        this.cargando = false;
      },
    });
  }

  selectPresentacion(p: PresentacionVM): void {
    this.presentacionSel = p;
    this.sabores = [];
    this.seleccionados = [];
    this.recalcular();
    this.cargando = true;
    this.repo.getVariacionesByProductoAndPresentacion(this.data.productoId, p.id).subscribe({
      next: (vars: any[]) => {
        this.sabores = (vars || []).map((v) => {
          const precio = (v.preciosVenta || []).find((pv: any) => pv.principal) || (v.preciosVenta || [])[0];
          return {
            recetaPresentacionId: v.id,
            recetaId: v.receta?.id ?? null,
            nombre: v.sabor?.nombre || v.nombre_generado || 'Sabor',
            precio: Number(precio?.valor) || 0,
            precioId: precio?.id ?? null,
            costo: Number(v.costo_calculado) || 0,
            sel: false,
            proporcion: 1,
            adicionales: [],
            observaciones: [],
            observacionLibre: undefined,
            ingredientesRemovidos: [],
            ingredientesIntercambiados: [],
            adicTotal: 0,
            personalizado: false,
            etiqueta: '',
          };
        });
        // El desktop no deja elegir un sabor sin precio vigente.
        this.sabores = this.sabores.filter((s) => s.precio > 0);
        // Autoselección: con un solo sabor disponible no hay nada que elegir.
        // Se marca solo, sin abrir la personalización (el botón queda igual).
        if (this.sabores.length === 1) {
          this.sabores[0].sel = true;
        }
        // Labels según la categoría del sabor, igual que el desktop.
        const categoria = String((vars || [])[0]?.sabor?.categoria || '').toUpperCase();
        if (categoria === 'PIZZA') {
          this.labels = { size: 'Tamaño', variation: 'Sabor', variations: 'Sabores' };
        }
        this.labelPorVariacion = `Por ${this.labels.variation.toLowerCase()}`;
        this.recalcular();
        this.cargando = false;
      },
      error: () => {
        this.snack.open('No se pudieron cargar los sabores', 'CERRAR', { duration: 3000 });
        this.cargando = false;
      },
    });
  }

  toggleSabor(s: SaborVM): void {
    // Producto de un solo sabor: tocar otro reemplaza al elegido.
    if (!s.sel && !this.permiteMultiple) {
      this.sabores.forEach((x) => {
        if (x !== s && x.sel) this.limpiarSabor(x);
      });
    }
    if (!s.sel && this.seleccionados.length >= this.maxSabores) {
      this.snack.open(`Máximo ${this.maxSabores} ${this.labels.variations.toLowerCase()}`, undefined, { duration: 1500 });
      return;
    }
    s.sel = !s.sel;
    if (!s.sel) this.limpiarSabor(s);
    // Cambiar la cantidad de sabores vuelve a partes iguales, como el desktop.
    this.proporcionesManuales = false;
    this.recalcular();
    // Abrir la personalización del sabor recién elegido sin que el usuario
    // tenga que buscar el botón (mismo comportamiento que el PdV desktop).
    if (s.sel) void this.personalizarSabor(s);
  }

  /** Deselecciona un sabor y descarta su personalización. */
  private limpiarSabor(s: SaborVM): void {
    s.sel = false;
    s.adicionales = [];
    s.observaciones = [];
    s.observacionLibre = undefined;
    s.ingredientesRemovidos = [];
    s.ingredientesIntercambiados = [];
    s.adicTotal = 0;
    s.personalizado = false;
  }

  async personalizarSabor(s: SaborVM): Promise<void> {
    const res = (await firstValueFrom(
      this.dialog
        .open(AgregarItemDialogComponent, {
          data: {
            productoId: this.data.productoId,
            nombre: s.nombre,
            precioUnitario: 0,
            recetaId: s.recetaId,
            soloPersonalizacion: true,
            modoEdicion: false,
            adicionalesPreSel: s.adicionales.map((a) => a.id),
            observacionesPreSel: s.observaciones,
            observacionLibreInicial: s.observacionLibre,
            ingredientesRemovidosPreSel: s.ingredientesRemovidos,
            ingredientesIntercambiadosPreSel: s.ingredientesIntercambiados,
          },
          width: '340px',
          maxHeight: '85vh',
          // Sin autofocus: en el celular, enfocar un campo de texto abre el
          // teclado del sistema y tapa media pantalla apenas se abre el diálogo.
          autoFocus: false,
        })
        .afterClosed(),
    )) as AgregarItemResult | undefined;
    if (!res) return;
    s.adicionales = res.adicionales;
    s.observaciones = res.observaciones;
    s.observacionLibre = res.observacionLibre;
    s.ingredientesRemovidos = res.ingredientesRemovidos || [];
    s.ingredientesIntercambiados = res.ingredientesIntercambiados || [];
    s.adicTotal = res.precioAdicionalTotal;
    s.personalizado =
      s.adicionales.length > 0 ||
      s.observaciones.length > 0 ||
      !!s.observacionLibre ||
      s.ingredientesRemovidos.length > 0 ||
      s.ingredientesIntercambiados.length > 0;
    this.recalcular();
  }

  // ===== Proporciones (mitad y mitad, 60/40, …) =====

  /**
   * Ajusta el % de un sabor compensando en el resto para que siga sumando 100.
   * La matemática vive en `variacion-precio.util` (compartida con sus tests).
   */
  ajustarProporcion(s: SaborVM, deltaPct: number): void {
    const idx = this.seleccionados.indexOf(s);
    if (idx < 0) return;
    const nuevas = ajustarProporcion(
      this.seleccionados.map((x) => x.proporcion),
      idx,
      deltaPct,
    );
    this.seleccionados.forEach((x, i) => (x.proporcion = nuevas[i]));
    this.proporcionesManuales = true;
    this.recalcular();
  }

  restablecerProporciones(): void {
    this.proporcionesManuales = false;
    this.recalcular();
  }

  inc(): void {
    this.cantidad++;
    this.recalcular();
  }

  dec(): void {
    if (this.cantidad > 1) {
      this.cantidad--;
      this.recalcular();
    }
  }

  private recalcular(): void {
    this.seleccionados = this.sabores.filter((s) => s.sel);
    const n = this.seleccionados.length;
    if (n === 0) {
      this.precioCalculado = 0;
      this.totalAdicionales = 0;
      this.costoCalculado = 0;
      this.totalLinea = 0;
      this.ensamblado = '';
      return;
    }
    // Partes iguales salvo que el usuario haya ajustado los porcentajes.
    if (!this.proporcionesManuales) {
      const iguales = proporcionesIguales(n);
      this.seleccionados.forEach((s, i) => (s.proporcion = iguales[i]));
    }
    // Etiqueta de porción pre-computada (el template no llama funciones).
    const props = this.seleccionados.map((s) => s.proporcion);
    this.seleccionados.forEach((s, i) => (s.etiqueta = etiquetaProporcion(props, i)));

    const totales = calcularTotalesVariacion(this.seleccionados, this.estrategia);
    this.precioCalculado = totales.precioCalculado;
    this.totalAdicionales = totales.totalAdicionales;
    this.costoCalculado = totales.costoCalculado;
    this.totalLinea = (this.precioCalculado + this.totalAdicionales) * this.cantidad;
    const tam = this.presentacionSel?.nombre ? `${this.presentacionSel.nombre} ` : '';
    this.ensamblado = `${this.data.nombre} ${tam}${this.seleccionados
      .map((s) => `${s.etiqueta} ${s.nombre}`.trim())
      .join(' + ')}`.toUpperCase();
  }

  confirmar(): void {
    const n = this.seleccionados.length;
    if (n === 0 || !this.presentacionSel) return;
    // Sabor principal = el de mayor precio, como el desktop (define la
    // RecetaPresentacion y el PrecioVenta que se guardan en el VentaItem).
    const principal = this.seleccionados.reduce((max, s) => (s.precio > max.precio ? s : max), this.seleccionados[0]);
    const result: SeleccionarVariacionResult = {
      presentacionId: this.presentacionSel.id,
      recetaPresentacionPrincipalId: principal.recetaPresentacionId,
      precioVentaPresentacionId: principal.precioId,
      sabores: this.seleccionados.map((s) => ({
        recetaPresentacionId: s.recetaPresentacionId,
        proporcion: s.proporcion,
        precioReferencia: s.precio,
        costoReferencia: s.costo,
        nombre: s.nombre,
        adicionales: s.adicionales,
        observaciones: s.observaciones,
        observacionLibre: s.observacionLibre,
        ingredientesRemovidos: s.ingredientesRemovidos,
        ingredientesIntercambiados: s.ingredientesIntercambiados,
      })),
      precioCalculado: this.precioCalculado,
      precioAdicionalTotal: this.totalAdicionales,
      costoCalculado: this.costoCalculado,
      cantidad: this.cantidad,
      ensambladoDescripcion: this.ensamblado,
    };
    this.ref.close(result);
  }
}
