import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

export interface AgregarItemData {
  productoId: number;
  nombre: string;
  precioUnitario: number;
  recetaId?: number | null;
  /** Modo "personalizar" (ej. un sabor de pizza): sin cantidad ni total. */
  soloPersonalizacion?: boolean;
}

export interface AgregarItemResult {
  cantidad: number;
  precioAdicionalTotal: number; // por unidad
  adicionales: { id: number; precio: number }[];
  observaciones: number[]; // ids de Observacion predefinida
  observacionLibre?: string;
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

      <mat-form-field appearance="outline" class="full">
        <mat-label>Nota libre (opcional)</mat-label>
        <textarea matInput [(ngModel)]="observacionLibre" rows="2" maxlength="500"></textarea>
      </mat-form-field>

      <div class="total" *ngIf="!data.soloPersonalizacion">Total: {{ totalLinea | number: '1.0-2' }}</div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(undefined)">Cancelar</button>
      <button mat-flat-button color="primary" (click)="confirmar()" [disabled]="cargando">
        {{ data.soloPersonalizacion ? 'Listo' : 'Agregar ' + cantidad }}
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
    `,
  ],
})
export class AgregarItemDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);

  cantidad = 1;
  adicionales: AdicionalVM[] = [];
  observaciones: ObsVM[] = [];
  observacionLibre = '';
  cargando = true;

  totalAdicionales = 0;
  totalLinea = 0;

  constructor(
    public ref: MatDialogRef<AgregarItemDialogComponent, AgregarItemResult | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: AgregarItemData,
  ) {}

  ngOnInit(): void {
    this.recalcular();
    const tasks: Promise<void>[] = [];

    if (this.data.recetaId) {
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
                  sel: false,
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
                sel: false,
              }));
            resolve();
          },
          error: () => resolve(),
        });
      }),
    );

    Promise.all(tasks).then(() => {
      this.cargando = false;
    });
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
    };
    this.ref.close(result);
  }
}
