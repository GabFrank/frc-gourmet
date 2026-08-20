import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { DashSectionHeaderComponent } from '../section-header/dash-section-header.component';

export interface DashRankingItem {
  nombre: string;
  valorPrincipal: string | number;   // ej: "24 uds"
  valorSecundario?: string | number; // ej: "960.000 Gs"
  porcentaje?: number;               // 0-100 para barra
  /**
   * Dato libre que viaja con el item y vuelve en `itemClick`. Sirve para que el
   * dashboard sepa a que abrir sin tener que buscar por nombre: normalmente el
   * id de la entidad, pero puede ser cualquier cosa que el padre necesite.
   */
  payload?: any;
}

@Component({
  selector: 'app-dash-ranking',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDividerModule, DashSectionHeaderComponent],
  templateUrl: './dash-ranking-list.component.html',
})
export class DashRankingListComponent {
  @Input() title = 'Ranking';
  @Input() icon = 'emoji_events';
  @Input() items: DashRankingItem[] = [];
  @Input() emptyText = 'Sin datos';
  // Si es clickable, cada fila muestra cursor/realce y emite itemClick.
  @Input() clickable = false;
  @Output() itemClick = new EventEmitter<DashRankingItem>();

  onItemClick(item: DashRankingItem): void {
    if (this.clickable) {
      this.itemClick.emit(item);
    }
  }
}
