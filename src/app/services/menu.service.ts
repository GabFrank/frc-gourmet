import { Injectable } from '@angular/core';
import { PermissionService } from 'src/app/services/permission.service';
import {
  MENU_TREE, MenuNode, MenuLeaf,
  buildSidenavTree, flattenBuscables,
} from 'src/app/services/menu-tree';

/**
 * Resuelve el árbol de menú (FUENTE ÚNICA: menu-tree.ts) para el sidenav y el
 * buscador global, aplicando permisos del usuario actual.
 *
 * Parte 2 (config del ADMIN) extenderá este servicio para aplicar overrides
 * persistidos (visibilidad/orden por id de nodo) sobre el árbol base.
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  constructor(private permissionService: PermissionService) {}

  private has = (p: string): boolean => this.permissionService.has(p);

  /** Árbol filtrado para el sidenav (permiso + enSidenav, ramas podadas). */
  getSidenavTree(): MenuNode[] {
    return buildSidenavTree(MENU_TREE, this.has);
  }

  /** Hojas indexables por el buscador (enBuscador). El permiso lo filtra el buscador. */
  getBuscables(): MenuLeaf[] {
    return flattenBuscables(MENU_TREE);
  }
}
