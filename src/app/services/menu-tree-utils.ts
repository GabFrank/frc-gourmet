import type { Type } from '@angular/core';

/**
 * Tipos y helpers PUROS del árbol de menú, SIN importar componentes Angular.
 * Vive separado de `menu-tree.ts` (que sí importa ~80 componentes) para poder
 * testear la lógica de resolución en Node sin arrastrar todo el grafo Angular.
 *
 * `import { Type } from '@angular/core'` es solo un tipo (borrado en runtime),
 * no arrastra dependencias ejecutables.
 */

export interface MenuAction {
  /** 'tab' (default) abre con TabsService; 'dialog' abre con MatDialog. */
  mode?: 'tab' | 'dialog';
  component: Type<any>;
  /** Título del tab / diálogo. */
  title: string;
  /** tabId para reusar el tab (solo mode='tab'). */
  tabId?: string;
  data?: any;
  /** Config del MatDialog cuando mode='dialog'. */
  dialogConfig?: any;
}

export interface MenuNode {
  /** Id estable y único (clave de override de configuración del ADMIN). */
  id: string;
  label: string;
  icon?: string;
  /** Sinónimos en español para el buscador. */
  keywords?: string[];
  /** Permiso requerido (mismo *appHasPermission del item). Sin permiso = público. */
  permiso?: string;
  /** Visible en el sidenav. Default true. */
  enSidenav?: boolean;
  /** Indexable por el buscador. Default true. */
  enBuscador?: boolean;
  /** Sección "Configuraciones" del buscador. */
  esConfig?: boolean;
  /** Clave de badge dinámico (ej: 'rrhhNotif'). */
  badgeKey?: string;
  /** Rama: subnodos. */
  children?: MenuNode[];
  /** Hoja: destino navegable. */
  action?: MenuAction;
}

/** Es hoja si tiene action y no children. */
export function esHoja(n: MenuNode): boolean {
  return !!n.action && !(n.children && n.children.length);
}

/**
 * Árbol para el sidenav: filtra por permiso + enSidenav, poda ramas vacías.
 * `has` = PermissionService.has.
 */
export function buildSidenavTree(
  nodes: MenuNode[],
  has: (p: string) => boolean,
): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of nodes) {
    if (n.enSidenav === false) continue;
    if (esHoja(n)) {
      if (!n.permiso || has(n.permiso)) out.push(n);
    } else {
      const children = buildSidenavTree(n.children || [], has);
      if (children.length) out.push({ ...n, children });
    }
  }
  return out;
}

/** Hoja aplanada para el buscador. */
export interface MenuLeaf {
  id: string;
  label: string;
  icon: string;
  keywords: string[];
  group: string;
  esConfig: boolean;
  permiso?: string;
  action: MenuAction;
}

/**
 * Aplana todas las hojas indexables (enBuscador !== false), con el nombre del
 * grupo raíz como contexto. No filtra por permiso: eso lo hace el buscador con
 * PermissionService (igual que hoy).
 */
export function flattenBuscables(nodes: MenuNode[], groupLabel = ''): MenuLeaf[] {
  const out: MenuLeaf[] = [];
  for (const n of nodes) {
    if (esHoja(n)) {
      if (n.enBuscador === false) continue;
      out.push({
        id: n.id,
        label: n.label,
        icon: n.icon || 'chevron_right',
        keywords: n.keywords || [],
        group: groupLabel,
        esConfig: !!n.esConfig,
        permiso: n.permiso,
        action: n.action!,
      });
    } else {
      // El grupo de nivel superior define el contexto; niveles internos lo heredan.
      out.push(...flattenBuscables(n.children || [], groupLabel || n.label));
    }
  }
  return out;
}
