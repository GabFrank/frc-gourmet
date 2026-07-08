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
  // Conteo resumido: total cargado directamente para la moneda (sin desglose).
  total: number | null;
}

/**
 * Formulario de conteo agrupado por moneda. Dos modos:
 * - Completo (default): conteo por denominación (billetes × cantidad), como el
 *   desktop. Recalcula el subtotal por moneda.
 * - Resumido: un único input de total por moneda (el usuario carga el total).
 * Muta los grupos que recibe; el padre los lee de vuelta para armar los
 * ConteoDetalle. Sin funciones en el template.
 */
@Component({
  selector: 'app-conteo-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="conteo-grupo" *ngFor="let g of grupos">
      <div class="conteo-grupo-head">
        <span class="conteo-moneda">{{ g.denominacion }}</span>
        <span class="conteo-subtotal" *ngIf="!resumido">{{ g.subtotalFmt }} {{ g.simbolo }}</span>
      </div>

      <ng-container *ngIf="!resumido">
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
      </ng-container>

      <div class="conteo-fila conteo-total" *ngIf="resumido">
        <span class="conteo-valor">Total {{ g.simbolo }}</span>
        <input
          class="conteo-input conteo-input-total"
          type="number"
          inputmode="decimal"
          min="0"
          [(ngModel)]="g.total"
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
      .conteo-total .conteo-valor {
        font-weight: 600;
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
      .conteo-input-total {
        flex: 0 0 140px;
        font-weight: 700;
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
  /** Modo resumido: un total por moneda en vez de conteo por denominación. */
  @Input() resumido = false;

  recalc(g: ConteoGrupo): void {
    let s = 0;
    for (const b of g.billetes) s += (Number(b.cantidad) || 0) * Number(b.valor);
    g.subtotal = s;
    g.subtotalFmt = s.toLocaleString('es-PY', { maximumFractionDigits: g.decimales || 0 });
  }
}
