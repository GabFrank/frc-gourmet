import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ReportePeriodoParams, RANGO_PRESETS } from './reporte-periodo.model';

/**
 * Control de período táctil para los reportes mobile. Fila de chips de presets
 * (scroll horizontal), toggle "comparar" y, si el preset es personalizado, dos
 * inputs de fecha nativos. Emite `(aplicar)` con los parámetros.
 */
@Component({
  selector: 'app-reporte-periodo-control',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatSlideToggleModule],
  template: `
    <div class="periodo">
      <div class="chips">
        <button
          *ngFor="let p of presets"
          type="button"
          class="chip"
          [class.on]="rango === p.value"
          (click)="seleccionar(p.value)"
        >{{ p.label }}</button>
      </div>

      <div class="custom" *ngIf="rango === 'custom'">
        <label>Desde <input type="date" [(ngModel)]="desde" /></label>
        <label>Hasta <input type="date" [(ngModel)]="hasta" /></label>
      </div>

      <div class="foot">
        <mat-slide-toggle [(ngModel)]="comparar">Comparar</mat-slide-toggle>
        <button mat-flat-button color="primary" (click)="aplicarClick()">
          <mat-icon>tune</mat-icon> Aplicar
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .periodo { padding: 12px; background: var(--surface); border: 1px solid var(--border-color); border-radius: 14px; margin: 12px; }
      .chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      .chip {
        flex: 0 0 auto; border: 1px solid var(--border-color); background: var(--surface-variant);
        color: var(--text-secondary); padding: 7px 14px; border-radius: 999px; font-size: 0.82rem; font-weight: 600;
        white-space: nowrap; cursor: pointer;
      }
      .chip.on { background: var(--error-color); border-color: var(--error-color); color: #fff; }
      .custom { display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
      .custom label { display: flex; flex-direction: column; font-size: 0.72rem; color: var(--text-secondary); gap: 4px; }
      .custom input { padding: 7px 8px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--surface); color: var(--text-primary); font-size: 0.9rem; }
      .foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; gap: 12px; }
    `,
  ],
})
export class ReportePeriodoControlComponent implements OnInit {
  @Input() autoAplicar = true;
  @Output() aplicar = new EventEmitter<ReportePeriodoParams>();

  presets = RANGO_PRESETS;
  rango: ReportePeriodoParams['rango'] = 'month';
  comparar = true;
  desde = '';
  hasta = '';

  ngOnInit(): void {
    if (this.autoAplicar) this.emitir();
  }

  seleccionar(r: ReportePeriodoParams['rango']): void {
    this.rango = r;
  }

  aplicarClick(): void {
    this.emitir();
  }

  private emitir(): void {
    const params: ReportePeriodoParams = { rango: this.rango, comparar: this.comparar };
    if (this.rango === 'custom') {
      if (!this.desde || !this.hasta) return;
      params.desde = this.desde;
      params.hasta = this.hasta;
    }
    this.aplicar.emit(params);
  }
}
