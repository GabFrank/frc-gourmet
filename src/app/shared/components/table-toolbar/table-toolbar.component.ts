import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Toolbar reusable para listados con tabla. Estandariza el header de la pagina con:
 * - Titulo (opcional con icon)
 * - Boton "Toggle filtros" (si `hasFilters` es true)
 * - Boton "Refrescar" con spin animado durante carga
 * - Slot `<ng-content>` para acciones custom (botones de crear, etc.)
 *
 * Uso minimo:
 *   <app-table-toolbar title="Compras" [loading]="loading" (refresh)="loadData()">
 *     <button mat-flat-button color="primary" (click)="nuevo()">Nueva</button>
 *   </app-table-toolbar>
 *
 * Con filtros:
 *   <app-table-toolbar title="Compras"
 *                      [loading]="loading"
 *                      [hasFilters]="true"
 *                      [filtersVisible]="showFiltros"
 *                      (refresh)="loadData()"
 *                      (toggleFilters)="showFiltros = !showFiltros">
 *     ...acciones custom...
 *   </app-table-toolbar>
 */
@Component({
  selector: 'app-table-toolbar',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './table-toolbar.component.html',
  styleUrls: ['./table-toolbar.component.scss'],
})
export class TableToolbarComponent {
  @Input() title = '';
  @Input() icon: string | null = null;
  @Input() loading = false;
  @Input() hasFilters = false;
  @Input() filtersVisible = false;
  @Input() hideRefresh = false;

  @Output() refresh = new EventEmitter<void>();
  @Output() toggleFilters = new EventEmitter<void>();
}
