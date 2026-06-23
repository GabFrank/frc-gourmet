import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RepositoryService } from '@frc/shared-core';

export interface SeleccionarVariacionData {
  productoId: number;
  nombre: string;
}

export interface VariacionSaborResult {
  recetaPresentacionId: number;
  proporcion: number;
  precioReferencia: number;
  costoReferencia: number;
  nombre: string;
}

export interface SeleccionarVariacionResult {
  presentacionId: number;
  recetaPresentacionPrincipalId: number;
  precioVentaPresentacionId: number | null;
  sabores: VariacionSaborResult[];
  precioCalculado: number;
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
  nombre: string;
  precio: number;
  precioId: number | null;
  costo: number;
  sel: boolean;
}

/**
 * Diálogo para vender un producto ELABORADO_CON_VARIACION (ej. pizza): elegir
 * tamaño (presentación) → sabores (hasta `pizzaMaxSabores`) → cantidad. El
 * precio se calcula según `pdvConfig.pizzaEstrategiaPrecio` (MAYOR_PRECIO o
 * PROMEDIO) y el costo es proporcional. Replica el flujo del PdV desktop.
 *
 * Esta primera versión no incluye personalización (adicionales/observaciones)
 * por sabor — llega en una iteración siguiente.
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
  ],
  template: `
    <h2 mat-dialog-title>{{ data.nombre }}</h2>
    <mat-progress-bar *ngIf="cargando" mode="indeterminate"></mat-progress-bar>
    <mat-dialog-content>
      <ng-container *ngIf="presentaciones.length > 1">
        <h3 class="sec">Tamaño</h3>
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
          Sabores
          <span class="hint">(hasta {{ maxSabores }})</span>
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
    `,
  ],
})
export class SeleccionarVariacionDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  cargando = true;
  maxSabores = 2;
  estrategia = 'MAYOR_PRECIO';

  presentaciones: PresentacionVM[] = [];
  presentacionSel: PresentacionVM | null = null;
  sabores: SaborVM[] = [];
  seleccionados: SaborVM[] = [];

  cantidad = 1;
  precioCalculado = 0;
  costoCalculado = 0;
  totalLinea = 0;
  ensamblado = '';

  constructor(
    public ref: MatDialogRef<SeleccionarVariacionDialogComponent, SeleccionarVariacionResult | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: SeleccionarVariacionData,
  ) {}

  ngOnInit(): void {
    this.repo.getPdvConfig().subscribe({
      next: (cfg: any) => {
        this.maxSabores = Number(cfg?.pizzaMaxSabores) || 2;
        this.estrategia = cfg?.pizzaEstrategiaPrecio || 'MAYOR_PRECIO';
      },
      error: () => {},
    });

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
            nombre: v.sabor?.nombre || v.nombre_generado || 'Sabor',
            precio: Number(precio?.valor) || 0,
            precioId: precio?.id ?? null,
            costo: Number(v.costo_calculado) || 0,
            sel: false,
          };
        });
        this.cargando = false;
      },
      error: () => {
        this.snack.open('No se pudieron cargar los sabores', 'CERRAR', { duration: 3000 });
        this.cargando = false;
      },
    });
  }

  toggleSabor(s: SaborVM): void {
    if (!s.sel && this.seleccionados.length >= this.maxSabores) {
      this.snack.open(`Máximo ${this.maxSabores} sabores`, undefined, { duration: 1500 });
      return;
    }
    s.sel = !s.sel;
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
      this.costoCalculado = 0;
      this.totalLinea = 0;
      this.ensamblado = '';
      return;
    }
    const proporcion = 1 / n;
    const precios = this.seleccionados.map((s) => s.precio);
    this.precioCalculado =
      this.estrategia === 'PROMEDIO'
        ? precios.reduce((a, b) => a + b, 0) / n
        : Math.max(...precios);
    this.costoCalculado = this.seleccionados.reduce((sum, s) => sum + s.costo * proporcion, 0);
    this.totalLinea = this.precioCalculado * this.cantidad;
    const fraccion = n > 1 ? `1/${n} ` : '';
    const tam = this.presentacionSel?.nombre ? `${this.presentacionSel.nombre} ` : '';
    this.ensamblado = `${this.data.nombre} ${tam}${this.seleccionados
      .map((s) => `${fraccion}${s.nombre}`)
      .join(' + ')}`.toUpperCase();
  }

  confirmar(): void {
    const n = this.seleccionados.length;
    if (n === 0 || !this.presentacionSel) return;
    const proporcion = 1 / n;
    const principal = this.seleccionados[0];
    const result: SeleccionarVariacionResult = {
      presentacionId: this.presentacionSel.id,
      recetaPresentacionPrincipalId: principal.recetaPresentacionId,
      precioVentaPresentacionId: principal.precioId,
      sabores: this.seleccionados.map((s) => ({
        recetaPresentacionId: s.recetaPresentacionId,
        proporcion,
        precioReferencia: s.precio,
        costoReferencia: s.costo,
        nombre: s.nombre,
      })),
      precioCalculado: this.precioCalculado,
      costoCalculado: this.costoCalculado,
      cantidad: this.cantidad,
      ensambladoDescripcion: this.ensamblado,
    };
    this.ref.close(result);
  }
}
