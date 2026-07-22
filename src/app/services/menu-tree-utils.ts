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

/** Override del ADMIN por id de nodo (persistido en menu_config). */
export interface MenuOverride {
  enSidenav?: boolean | null;
  enBuscador?: boolean | null;
  orden?: number | null;
}
/** Mapa id → override. */
export type OverrideMap = { [id: string]: MenuOverride };

/** Es hoja si tiene action y no children. */
export function esHoja(n: MenuNode): boolean {
  return !!n.action && !(n.children && n.children.length);
}

/** Valor efectivo de un booleano: el override gana si está definido. */
function effBool(base: boolean, o: boolean | null | undefined): boolean {
  return o === true || o === false ? o : base;
}

/**
 * Ordena una lista de nodos aplicando `orden` del override (si existe). Los
 * nodos con `orden` explícito usan ese valor; los demás, su índice natural. En
 * empate, gana el override explícito (así `orden:0` sube por encima del ítem
 * que estaba naturalmente primero).
 */
function ordenar(nodes: MenuNode[], ov?: OverrideMap): MenuNode[] {
  return nodes
    .map((n, i) => ({ n, i, o: ov?.[n.id]?.orden }))
    .sort((a, b) => {
      const ta = a.o === null || a.o === undefined;
      const tb = b.o === null || b.o === undefined;
      const oa = ta ? a.i : (a.o as number);
      const ob = tb ? b.i : (b.o as number);
      if (oa !== ob) return oa - ob;
      if (ta !== tb) return ta ? 1 : -1; // override explícito primero
      return a.i - b.i;
    })
    .map((x) => x.n);
}

/**
 * Árbol para el sidenav: filtra por permiso + enSidenav (con override), ordena
 * por `orden` (override) y poda ramas vacías.
 * `has` = PermissionService.has. `ov` = overrides del ADMIN (opcional).
 */
export function buildSidenavTree(
  nodes: MenuNode[],
  has: (p: string) => boolean,
  ov?: OverrideMap,
): MenuNode[] {
  const out: MenuNode[] = [];
  for (const n of ordenar(nodes, ov)) {
    if (!effBool(n.enSidenav !== false, ov?.[n.id]?.enSidenav)) continue;
    if (esHoja(n)) {
      if (!n.permiso || has(n.permiso)) out.push(n);
    } else {
      const children = buildSidenavTree(n.children || [], has, ov);
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
export function flattenBuscables(nodes: MenuNode[], groupLabel = '', ov?: OverrideMap): MenuLeaf[] {
  const out: MenuLeaf[] = [];
  for (const n of nodes) {
    if (esHoja(n)) {
      if (!effBool(n.enBuscador !== false, ov?.[n.id]?.enBuscador)) continue;
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
      out.push(...flattenBuscables(n.children || [], groupLabel || n.label, ov));
    }
  }
  return out;
}
