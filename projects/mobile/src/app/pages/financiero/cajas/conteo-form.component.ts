import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface ConteoBillete {
  billeteId: number;
  valor: number;
  valorFmt: string;
  cantidad: number | null;
}

export interface ConteoGrupo {
  monedaId: number;
  denominacion: string;
  simbolo: string;
  decimales: number;
  billetes: ConteoBillete[];
  subtotal: number;
  subtotalFmt: string;
}

/**
 * Formulario de conteo por denominación (billetes × cantidad), agrupado por
 * moneda — el mismo sistema de conteo del desktop. Muta los grupos que recibe;
 * el padre los lee de vuelta para armar los ConteoDetalle. Recalcula el subtotal
 * por moneda en cada cambio (sin funciones en el template).
 */
@Component({
  selector: 'app-conteo-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="conteo-grupo" *ngFor="let g of grupos">
      <div class="conteo-grupo-head">
        <span class="conteo-moneda">{{ g.denominacion }}</span>
        <span class="conteo-subtotal">{{ g.subtotalFmt }} {{ g.simbolo }}</span>
      </div>
      <div class="conteo-fila" *ngFor="let b of g.billetes">
        <span class="conteo-valor">{{ b.valorFmt }}</span>
        <span class="conteo-x">×</span>
        <input
          class="conteo-input"
          type="number"
          inputmode="numeric"
          min="0"
          [(ngModel)]="b.cantidad"
          (ngModelChange)="recalc(g)"
          placeholder="0"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .conteo-grupo {
        background: var(--surface);
        border: 1px solid var(--border-color);
        border-radius: 14px;
        padding: 10px 14px;
        margin-bottom: 12px;
      }
      .conteo-grupo-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding-bottom: 6px;
        margin-bottom: 4px;
        border-bottom: 1px solid var(--border-color);
      }
      .conteo-moneda {
        font-weight: 600;
        color: var(--text-primary);
      }
      .conteo-subtotal {
        font-weight: 700;
        color: var(--text-primary);
      }
      .conteo-fila {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 0;
      }
      .conteo-valor {
        flex: 1 1 auto;
        color: var(--text-primary);
        font-size: 0.92rem;
      }
      .conteo-x {
        color: var(--text-secondary);
      }
      .conteo-input {
        flex: 0 0 92px;
        height: 42px;
        padding: 0 12px;
        text-align: right;
        font-size: 1rem;
        border: 1px solid var(--border-color);
        border-radius: 10px;
        background: var(--surface);
        color: var(--text-primary);
      }
      .conteo-input:focus {
        outline: none;
        border-color: var(--info-color);
      }
    `,
  ],
})
export class ConteoFormComponent {
  @Input() grupos: ConteoGrupo[] = [];

  recalc(g: ConteoGrupo): void {
    let s = 0;
    for (const b of g.billetes) s += (Number(b.cantidad) || 0) * Number(b.valor);
    g.subtotal = s;
    g.subtotalFmt = s.toLocaleString('es-PY', { maximumFractionDigits: g.decimales || 0 });
  }
}
