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
  // Si el padre escucha (itemClick), cada fila se vuelve clickeable.
  // El payload se devuelve tal cual al padre — usalo para llevar el id u otra data.
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
  @Output() itemClick = new EventEmitter<DashRankingItem>();
}
