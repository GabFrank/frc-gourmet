import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatBadgeModule } from '@angular/material/badge';
import { MenuNode, esHoja } from 'src/app/services/menu-tree';

/**
 * Renderiza recursivamente el árbol de menú (menu-tree.ts) en el sidenav.
 * Soporta grupos anidados (hasta 3 niveles) manteniendo el look existente:
 * paneles expandibles para ramas y `mat-list-item` para hojas.
 *
 * Estado de expansión propio por id de nodo (independiente por rama). Cuando el
 * sidenav está colapsado (mini), un click en un header emite `requestExpand`
 * para abrir el sidenav antes de expandir el grupo.
 */
@Component({
  selector: 'app-sidenav-menu',
  standalone: true,
  imports: [CommonModule, MatListModule, MatIconModule, MatExpansionModule, MatBadgeModule],
  templateUrl: './sidenav-menu.component.html',
  styleUrls: ['./sidenav-menu.component.scss'],
})
export class SidenavMenuComponent {
  @Input() nodes: MenuNode[] = [];
  @Input() isMenuExpanded = false;
  @Input() level = 0;
  /** Valores de badge por clave (ej: { rrhhNotif: 3 }). */
  @Input() badges: { [key: string]: number } = {};
  /** Set compartido de ids expandidos (una instancia para todo el árbol). */
  @Input() expandedIds = new Set<string>();

  @Output() activate = new EventEmitter<MenuNode>();
  @Output() requestExpand = new EventEmitter<void>();

  esHoja = esHoja;

  trackByNode = (_: number, n: MenuNode) => n.id;

  isExpanded(node: MenuNode): boolean {
    return this.expandedIds.has(node.id);
  }

  badgeValue(node: MenuNode): number | null {
    if (!node.badgeKey) return null;
    const v = this.badges[node.badgeKey];
    return v && v > 0 ? v : null;
  }

  onHeaderClick(event: MouseEvent, node: MenuNode): void {
    event.stopPropagation();
    if (!this.isMenuExpanded) {
      this.requestExpand.emit();
      this.expandedIds.add(node.id);
      return;
    }
    if (this.expandedIds.has(node.id)) this.expandedIds.delete(node.id);
    else this.expandedIds.add(node.id);
  }

  onActivate(node: MenuNode): void {
    this.activate.emit(node);
  }
}
