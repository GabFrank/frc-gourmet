import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

export interface AgregarItemData {
  productoId: number;
  nombre: string;
  precioUnitario: number;
  recetaId?: number | null;
  /** Modo "personalizar" (ej. un sabor de pizza): sin cantidad ni total. */
  soloPersonalizacion?: boolean;
  /** Modo edición de un ítem existente: precarga + botón "Quitar". */
  modoEdicion?: boolean;
  cantidadInicial?: number;
  adicionalesPreSel?: number[]; // ids de Adicional ya seleccionados
  observacionesPreSel?: number[]; // ids de Observacion ya seleccionados
  observacionLibreInicial?: string;
  /** ids de RecetaIngrediente ya quitados */
  ingredientesRemovidosPreSel?: number[];
  /** intercambios ya elegidos */
  ingredientesIntercambiadosPreSel?: { recetaIngredienteId: number; reemplazoProductoId: number }[];
}

/** Sentinela que devuelve el diálogo cuando se pide quitar el ítem (modo edición). */
export type AgregarItemQuitar = 'QUITAR';

export interface AgregarItemResult {
  cantidad: number;
  precioAdicionalTotal: number; // por unidad
  adicionales: { id: number; precio: number }[];
  observaciones: number[]; // ids de Observacion predefinida
  observacionLibre?: string;
  /** ids de RecetaIngrediente quitados → VentaItemIngredienteModificacion REMOVIDO */
  ingredientesRemovidos: number[];
  /** cambios de ingrediente → VentaItemIngredienteModificacion INTERCAMBIADO */
  ingredientesIntercambiados: { recetaIngredienteId: number; reemplazoProductoId: number }[];
}

interface AdicionalVM {
  id: number;
  nombre: string;
  precio: number;
  sel: boolean;
}

interface ObsVM {
  id: number;
  descripcion: string;
  sel: boolean;
}

/** Ingrediente opcional de la receta: se puede quitar ("SIN X"). */
interface IngredienteOpcionalVM {
  recetaIngredienteId: number;
  nombre: string;
  quitado: boolean;
}

/** Ingrediente cambiable: se puede reemplazar por una de sus opciones. */
interface IngredienteCambiableVM {
  recetaIngredienteId: number;
  nombre: string;
  opciones: { productoId: number; nombre: string }[];
  /** productoId elegido, o null = original */
  reemplazoSel: number | null;
}

/**
 * Diálogo para agregar un producto a la cuenta: cantidad + adicionales (de la
 * receta) + observaciones (del producto) + nota libre. Devuelve la selección
 * al confirmar, o `undefined` si se cancela. El precio de adicionales es por
 * unidad (se manda en `createVentaItem.precioAdicionales`, igual que el PdV).
 */
@Component({
  selector: 'app-agregar-item-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.nombre }}</h2>
    <mat-progress-bar *ngIf="cargando" mode="indeterminate"></mat-progress-bar>
    <mat-dialog-content>
      <ng-container *ngIf="!data.soloPersonalizacion">
        <div class="precio">{{ data.precioUnitario | number: '1.0-2' }} c/u</div>

        <div class="stepper">
          <button mat-icon-button (click)="dec()" [disabled]="cantidad <= 1" aria-label="Menos">
            <mat-icon>remove_circle</mat-icon>
          </button>
          <span class="cant">{{ cantidad }}</span>
          <button mat-icon-button (click)="inc()" aria-label="Más">
            <mat-icon>add_circle</mat-icon>
          </button>
        </div>
      </ng-container>

      <p class="fijos" *ngIf="textoIngredientesFijos">{{ textoIngredientesFijos }}</p>

      <ng-container *ngIf="opcionales.length">
        <h3 class="sec">Ingredientes <span class="hint">(tocá para quitar)</span></h3>
        <div class="chips">
          <button
            *ngFor="let ing of opcionales"
            type="button"
            class="ing-chip"
            [class.ing-quitado]="ing.quitado"
            (click)="toggleIngrediente(ing)"
          >
            <mat-icon class="ing-icon">{{ ing.quitado ? 'close' : 'check' }}</mat-icon>
            {{ ing.nombre }}
          </button>
        </div>
      </ng-container>

      <ng-container *ngIf="cambiables.length">
        <h3 class="sec">Cambiar por</h3>
        <div class="cambiable" *ngFor="let ing of cambiables">
          <span class="cambiable-nombre">{{ ing.nombre }}</span>
          <mat-form-field appearance="outline" class="cambiable-select">
            <mat-select [(ngModel)]="ing.reemplazoSel">
              <mat-option [value]="null">Original</mat-option>
              <mat-option *ngFor="let o of ing.opciones" [value]="o.productoId">{{ o.nombre }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </ng-container>

      <ng-container *ngIf="adicionales.length">
        <h3 class="sec">Adicionales</h3>
        <div class="opt" *ngFor="let a of adicionales">
          <mat-checkbox [(ngModel)]="a.sel" (ngModelChange)="recalcular()">
            {{ a.nombre }}
          </mat-checkbox>
          <span class="opt-precio">+{{ a.precio | number: '1.0-2' }}</span>
        </div>
      </ng-container>

      <ng-container *ngIf="observaciones.length">
        <h3 class="sec">Observaciones</h3>
        <div class="opt" *ngFor="let o of observaciones">
          <mat-checkbox [(ngModel)]="o.sel">{{ o.descripcion }}</mat-checkbox>
        </div>
      </ng-container>

      <!--
        La nota va ÚLTIMA y sólo después de cargar. Mientras se cargaban
        ingredientes/adicionales/observaciones, este textarea era el único campo
        presente: el diálogo le daba el foco, se abría el teclado del sistema y
        tapaba los ítems que aparecían un instante después. Además del ngIf, los
        tres open() de este diálogo pasan autoFocus false.
      -->
      <mat-form-field appearance="outline" class="full" *ngIf="!cargando">
        <mat-label>Nota libre (opcional)</mat-label>
        <textarea matInput [(ngModel)]="observacionLibre" rows="2" maxlength="500"></textarea>
      </mat-form-field>

      <div class="total" *ngIf="!data.soloPersonalizacion">Total: {{ totalLinea | number: '1.0-2' }}</div>
    </mat-dialog-content>
    <mat-dialog-actions class="acciones">
      <button *ngIf="data.modoEdicion" mat-button color="warn" (click)="ref.close('QUITAR')">
        Quitar
      </button>
      <span class="acciones-spacer"></span>
      <button mat-button (click)="ref.close(undefined)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="confirmar()" [disabled]="cargando">
        {{ data.modoEdicion ? 'Guardar' : data.soloPersonalizacion ? 'Listo' : 'Agregar ' + cantidad }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .precio {
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
        margin-bottom: 8px;
      }
      .stepper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        margin: 4px 0 8px;
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
      .sec {
        margin: 12px 0 4px;
        font-size: 0.85rem;
        text-transform: uppercase;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
      .hint {
        text-transform: none;
        font-weight: 400;
      }
      .fijos {
        margin: 8px 0 0;
        font-size: 0.8rem;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      /* Chip táctil: alto cómodo para el dedo, igual criterio que el resto del PWA. */
      .ing-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 40px;
        border: 1px solid var(--border-color, rgba(0, 0, 0, 0.2));
        background: var(--card-background, #fff);
        color: var(--text-primary, inherit);
        border-radius: 20px;
        padding: 6px 14px;
        font-size: 0.9rem;
        cursor: pointer;
      }
      .ing-quitado {
        background: var(--warn-bg, #fdecea);
        border-color: var(--warn-color, #c62828);
        color: var(--warn-color, #c62828);
        text-decoration: line-through;
      }
      .ing-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .cambiable {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
      }
      .cambiable-nombre {
        flex: 0 0 40%;
        font-size: 0.9rem;
      }
      .cambiable-select {
        flex: 1 1 auto;
      }
      .cambiable-select ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
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
      .full {
        width: 100%;
        margin-top: 12px;
      }
      .total {
        text-align: center;
        font-weight: 600;
        color: var(--primary, #1976d2);
        margin-top: 8px;
      }
      .acciones {
        display: flex;
        align-items: center;
      }
      .acciones-spacer {
        flex: 1 1 auto;
      }
    `,
  ],
})
export class AgregarItemDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);

  cantidad = 1;
  adicionales: AdicionalVM[] = [];
  observaciones: ObsVM[] = [];
  opcionales: IngredienteOpcionalVM[] = [];
  cambiables: IngredienteCambiableVM[] = [];
  /** Ingredientes que no se pueden tocar (base + normales), sólo informativos. */
  textoIngredientesFijos = '';
  observacionLibre = '';
  cargando = true;

  totalAdicionales = 0;
  totalLinea = 0;

  constructor(
    public ref: MatDialogRef<AgregarItemDialogComponent, AgregarItemResult | AgregarItemQuitar | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: AgregarItemData,
  ) {}

  ngOnInit(): void {
    if (this.data.cantidadInicial && this.data.cantidadInicial > 0) {
      this.cantidad = this.data.cantidadInicial;
    }
    if (this.data.observacionLibreInicial) {
      this.observacionLibre = this.data.observacionLibreInicial;
    }
    this.recalcular();
    const tasks: Promise<void>[] = [];

    if (this.data.recetaId) {
      tasks.push(this.cargarIngredientes(this.data.recetaId as number));
      tasks.push(
        new Promise<void>((resolve) => {
          this.repo.getRecetaAdicionalVinculaciones(this.data.recetaId as number).subscribe({
            next: (vincs: any[]) => {
              this.adicionales = (vincs || [])
                .filter((v) => v.activo !== false && v.adicional)
                .map((v) => ({
                  id: v.adicional.id,
                  nombre: v.adicional.nombre,
                  precio: Number(v.precioAdicional) || 0,
                  sel: (this.data.adicionalesPreSel || []).includes(v.adicional.id),
                }));
              resolve();
            },
            error: () => resolve(),
          });
        }),
      );
    }

    tasks.push(
      new Promise<void>((resolve) => {
        this.repo.getObservacionesByProducto(this.data.productoId).subscribe({
          next: (pos: any[]) => {
            this.observaciones = (pos || [])
              .filter((po) => po.observacion)
              .map((po) => ({
                id: po.observacion.id,
                descripcion: po.observacion.descripcion,
                sel: (this.data.observacionesPreSel || []).includes(po.observacion.id),
              }));
            resolve();
          },
          error: () => resolve(),
        });
      }),
    );

    Promise.all(tasks).then(() => {
      this.recalcular();
      this.cargando = false;
    });
  }

  /**
   * Ingredientes de la receta, clasificados igual que el PdV desktop
   * (`personalizar-producto-dialog`): base → cambiables → opcionales → normales,
   * en ese orden de prioridad. Sólo opcionales y cambiables son accionables; el
   * resto se muestra como texto informativo.
   *
   * `RecetaIngrediente.ingrediente` es nullable (ítem solo-descripción), por eso
   * el nombre siempre sale con fallback a `descripcion`.
   */
  private cargarIngredientes(recetaId: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.repo.getRecetaIngredientesActivos(recetaId).subscribe({
        next: async (ings: any[]) => {
          const fijos: string[] = [];
          const cambiables: IngredienteCambiableVM[] = [];
          for (const ing of ings || []) {
            const nombre = String(ing.ingrediente?.nombre || ing.descripcion || '').trim();
            if (ing.esIngredienteBase) {
              if (nombre) fijos.push(nombre);
            } else if (ing.esCambiable) {
              cambiables.push({ recetaIngredienteId: ing.id, nombre, opciones: [], reemplazoSel: null });
            } else if (ing.esOpcional) {
              this.opcionales.push({
                recetaIngredienteId: ing.id,
                nombre,
                quitado: (this.data.ingredientesRemovidosPreSel || []).includes(ing.id),
              });
            } else if (nombre) {
              fijos.push(nombre);
            }
          }
          this.textoIngredientesFijos = fijos.join(', ');

          // Opciones de cada cambiable (una consulta por ingrediente, como el desktop).
          await Promise.all(
            cambiables.map(
              (c) =>
                new Promise<void>((res) => {
                  this.repo.getRecetaIngredientesIntercambiables(c.recetaIngredienteId).subscribe({
                    next: (items: any[]) => {
                      c.opciones = (items || [])
                        .filter((i) => i.activo !== false && i.ingredienteOpcion)
                        .map((i) => ({
                          productoId: i.ingredienteOpcion.id,
                          nombre: i.ingredienteOpcion.nombre,
                        }));
                      const pre = (this.data.ingredientesIntercambiadosPreSel || []).find(
                        (s) => s.recetaIngredienteId === c.recetaIngredienteId,
                      );
                      if (pre && c.opciones.some((o) => o.productoId === pre.reemplazoProductoId)) {
                        c.reemplazoSel = pre.reemplazoProductoId;
                      }
                      res();
                    },
                    error: () => res(),
                  });
                }),
            ),
          );
          // Un cambiable sin opciones no se puede cambiar: se muestra como fijo.
          this.cambiables = cambiables.filter((c) => c.opciones.length > 0);
          for (const sinOpciones of cambiables.filter((c) => c.opciones.length === 0)) {
            if (sinOpciones.nombre) {
              this.textoIngredientesFijos = this.textoIngredientesFijos
                ? `${this.textoIngredientesFijos}, ${sinOpciones.nombre}`
                : sinOpciones.nombre;
            }
          }
          resolve();
        },
        error: () => resolve(),
      });
    });
  }

  toggleIngrediente(ing: IngredienteOpcionalVM): void {
    ing.quitado = !ing.quitado;
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

  recalcular(): void {
    this.totalAdicionales = this.adicionales
      .filter((a) => a.sel)
      .reduce((sum, a) => sum + a.precio, 0);
    this.totalLinea = (this.data.precioUnitario + this.totalAdicionales) * this.cantidad;
  }

  confirmar(): void {
    const result: AgregarItemResult = {
      cantidad: this.cantidad,
      precioAdicionalTotal: this.totalAdicionales,
      adicionales: this.adicionales.filter((a) => a.sel).map((a) => ({ id: a.id, precio: a.precio })),
      observaciones: this.observaciones.filter((o) => o.sel).map((o) => o.id),
      observacionLibre: this.observacionLibre.trim() || undefined,
      ingredientesRemovidos: this.opcionales.filter((i) => i.quitado).map((i) => i.recetaIngredienteId),
      ingredientesIntercambiados: this.cambiables
        .filter((c) => c.reemplazoSel != null)
        .map((c) => ({
          recetaIngredienteId: c.recetaIngredienteId,
          reemplazoProductoId: c.reemplazoSel as number,
        })),
    };
    this.ref.close(result);
  }
}
