import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AppImagePipe } from '../../../core/pipes/app-image.pipe';

export interface ItemInfoData {
  descripcion: string;
  imageUrl?: string | null;
  cantidad: number;
  unitario: number;
  total: number;
  estado: string;
  cancelado: boolean;
  createdAt?: string | Date;
  usuario?: string;
  estadoKds?: string; // cuando el KDS esté en cocina
  adicionales: { id: number; nombre: string; precio: number }[];
  observaciones: { id: number; texto: string }[];
  ingredientes: { id: number; texto: string }[];
  sabores: string[];
}

/**
 * Diálogo de información (solo lectura) de un venta-item: descripción, cantidad,
 * precios, estado, hora del pedido, usuario que lo lanzó y el detalle de su
 * personalización (adicionales / observaciones / ingredientes / sabores).
 */
@Component({
  selector: 'app-item-info-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, AppImagePipe],
  template: `
    <h2 mat-dialog-title>{{ data.descripcion }}</h2>
    <mat-dialog-content>
      <div class="img-wrap">
        <img *ngIf="data.imageUrl | appImage as src; else noImg" class="prod-img" [src]="src" alt="" />
        <ng-template #noImg>
          <div class="prod-img placeholder"><mat-icon>restaurant</mat-icon></div>
        </ng-template>
      </div>
      <div class="row"><span>Estado</span><span [class.cancel]="data.cancelado">{{ data.estado }}</span></div>
      <div class="row" *ngIf="data.estadoKds"><span>Cocina (KDS)</span><span>{{ data.estadoKds }}</span></div>
      <div class="row"><span>Cantidad</span><span>{{ data.cantidad | number: '1.0-2' }}</span></div>
      <div class="row"><span>Unitario</span><span>{{ data.unitario | number: '1.0-2' }}</span></div>
      <div class="row total"><span>Total</span><span>{{ data.total | number: '1.0-2' }}</span></div>
      <div class="row" *ngIf="data.createdAt"><span>Pedido</span><span>{{ data.createdAt | date: 'short' }}</span></div>
      <div class="row" *ngIf="data.usuario"><span>Mozo</span><span>{{ data.usuario }}</span></div>

      <ng-container *ngIf="data.sabores.length">
        <h3 class="sec">Sabores</h3>
        <div class="line" *ngFor="let s of data.sabores">{{ s }}</div>
      </ng-container>

      <ng-container *ngIf="data.adicionales.length">
        <h3 class="sec">Adicionales</h3>
        <div class="line adic" *ngFor="let a of data.adicionales">
          <span>+ {{ a.nombre }}</span><span>{{ a.precio | number: '1.0-2' }}</span>
        </div>
      </ng-container>

      <ng-container *ngIf="data.ingredientes.length">
        <h3 class="sec">Ingredientes</h3>
        <div class="line" *ngFor="let g of data.ingredientes">{{ g.texto }}</div>
      </ng-container>

      <ng-container *ngIf="data.observaciones.length">
        <h3 class="sec">Observaciones</h3>
        <div class="line" *ngFor="let o of data.observaciones">• {{ o.texto }}</div>
      </ng-container>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .img-wrap {
        display: flex;
        justify-content: center;
        margin-bottom: 10px;
      }
      .prod-img {
        width: 100%;
        max-width: 240px;
        height: 150px;
        object-fit: cover;
        border-radius: 10px;
        background: var(--surface-variant, #f0f0f0);
      }
      .prod-img.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .prod-img.placeholder mat-icon {
        font-size: 56px;
        width: 56px;
        height: 56px;
        color: var(--text-secondary, rgba(0, 0, 0, 0.35));
      }
      .row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 0.92rem;
      }
      .row > span:first-child {
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
      .row.total {
        font-weight: 700;
        border-top: 1px solid var(--border-color, rgba(0, 0, 0, 0.12));
        margin-top: 4px;
        padding-top: 8px;
      }
      .cancel {
        color: var(--warn-color, #c62828);
        font-weight: 600;
      }
      .sec {
        margin: 12px 0 4px;
        font-size: 0.8rem;
        text-transform: uppercase;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
      .line {
        font-size: 0.9rem;
        padding: 2px 0;
      }
      .line.adic {
        display: flex;
        justify-content: space-between;
      }
    `,
  ],
})
export class ItemInfoDialogComponent {
  constructor(
    public ref: MatDialogRef<ItemInfoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ItemInfoData,
  ) {}
}
