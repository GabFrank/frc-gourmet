import { Injectable } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { PermissionService } from 'src/app/services/permission.service';
import { RepositoryService } from 'src/app/database/repository.service';
import {
  MENU_TREE, MenuNode, MenuLeaf, OverrideMap,
  buildSidenavTree, flattenBuscables,
} from 'src/app/services/menu-tree';

/**
 * Resuelve el árbol de menú (FUENTE ÚNICA: menu-tree.ts) para el sidenav y el
 * buscador global, aplicando (1) los permisos del usuario actual y (2) los
 * **overrides del ADMIN** (visibilidad/orden por id de nodo) persistidos en
 * `menu_config`.
 *
 * Los overrides se cachean en memoria (`loadOverrides()` en el arranque y tras
 * guardar). `changes$` avisa a `app.component` para reconstruir el sidenav.
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private overrides: OverrideMap = {};
  private changes = new Subject<void>();
  /** Emite cuando cambian los overrides (recargar sidenav). */
  readonly changes$ = this.changes.asObservable();

  constructor(
    private permissionService: PermissionService,
    private repositoryService: RepositoryService,
  ) {}

  private has = (p: string): boolean => this.permissionService.has(p);

  /** Árbol filtrado para el sidenav (permiso + enSidenav + overrides). */
  getSidenavTree(): MenuNode[] {
    return buildSidenavTree(MENU_TREE, this.has, this.overrides);
  }

  /** Hojas indexables por el buscador (enBuscador + overrides). */
  getBuscables(): MenuLeaf[] {
    return flattenBuscables(MENU_TREE, '', this.overrides);
  }

  /** Overrides actuales en cache (para la pantalla de config del ADMIN). */
  getOverridesSnapshot(): OverrideMap {
    return this.overrides;
  }

  /**
   * Carga los overrides desde el backend a la cache. Tolerante a errores
   * (ej. modo cliente sin impl): deja la cache vacía = defaults del árbol.
   */
  loadOverrides(): Observable<void> {
    return this.repositoryService.getMenuConfig().pipe(
      map((rows: any[]) => this.toMap(rows || [])),
      tap((map) => {
        this.overrides = map;
        this.changes.next();
      }),
      map(() => undefined),
      catchError(() => {
        this.overrides = {};
        return of(undefined);
      }),
    );
  }

  /** Persiste overrides y recarga la cache. */
  saveOverrides(items: any[]): Observable<void> {
    return this.repositoryService.saveMenuConfig(items).pipe(
      // Tras guardar, recargar para reflejar la normalización del backend.
      map(() => undefined),
      tap(() => this.loadOverrides().subscribe()),
    );
  }

  private toMap(rows: any[]): OverrideMap {
    const m: OverrideMap = {};
    for (const r of rows) {
      const id = (r?.nodeId || '').toString();
      if (!id) continue;
      m[id] = {
        enSidenav: r.enSidenav ?? null,
        enBuscador: r.enBuscador ?? null,
        orden: r.orden ?? null,
      };
    }
    return m;
  }
}
