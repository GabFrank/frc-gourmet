import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export interface SectionItem {
  label: string;
  icon: string;
  path: string;
  enabled?: boolean;
}

/**
 * Índice de sección genérico (data-driven). Lista los sub-módulos de un dominio
 * como tarjetas; los `enabled:false` se muestran como "pronto". Items vienen de
 * `route.data.items`. Reusable por todas las olas (RRHH, Financiero, etc.).
 */
@Component({
  selector: 'app-section-index',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  template: `
    <div class="section">
      <a
        *ngFor="let it of items"
        class="tile"
        [class.disabled]="it.enabled === false"
        [routerLink]="it.enabled === false ? null : it.path"
      >
        <mat-icon>{{ it.icon }}</mat-icon>
        <span class="tile-label">{{ it.label }}</span>
        <span class="soon" *ngIf="it.enabled === false">pronto</span>
      </a>
    </div>
  `,
  styles: [
    `
      .section {
        padding: 16px;
        max-width: 900px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 12px;
      }
      .tile {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 22px 10px;
        border-radius: 14px;
        background: var(--surface);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        text-decoration: none;
        box-shadow: 0 1px 6px var(--shadow-color);
      }
      .tile mat-icon {
        font-size: 30px;
        height: 30px;
        width: 30px;
        color: var(--error-color);
      }
      .tile-label {
        font-size: 0.85rem;
        font-weight: 500;
        text-align: center;
      }
      .tile.disabled {
        opacity: 0.55;
        pointer-events: none;
      }
      .tile.disabled mat-icon {
        color: var(--text-secondary);
      }
      .soon {
        position: absolute;
        top: 8px;
        right: 8px;
        font-size: 0.6rem;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--surface-variant);
        color: var(--text-secondary);
      }
    `,
  ],
})
export class SectionIndexPage {
  private readonly route = inject(ActivatedRoute);
  readonly items: SectionItem[] = (this.route.snapshot.data['items'] as SectionItem[]) || [];
}
