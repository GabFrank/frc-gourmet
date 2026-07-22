# Dominio: Menú lateral (sidenav) + fuente única de navegación

El sidenav y el buscador global comparten **una sola fuente de verdad**:
`MENU_TREE` en `src/app/services/menu-tree.ts`. (Antes había dos listas
paralelas: el sidenav hardcodeado en `app.component.html` y `menu-registry.ts`
para el buscador — se eliminó el registry.)

> Doc de proyecto: `docs/MENU-SIDENAV.md`. Buscador: [buscador-global.md](buscador-global.md).

## Piezas

- **Árbol único:** `src/app/services/menu-tree.ts` → `MENU_TREE: MenuNode[]`.
  - `MenuNode`: rama si tiene `children` (hasta 3 niveles), hoja si tiene `action`.
  - Cada hoja: `id`, `label`, `icon`, `keywords`, `permiso`, `esConfig`,
    `enSidenav` (default true), `enBuscador` (default true), `badgeKey?`,
    `action: { mode?: 'tab'|'dialog', component, title, tabId?, data?, dialogConfig? }`.
  - Helpers puros exportados: `buildSidenavTree(nodes, has)`, `flattenBuscables(nodes)`, `esHoja(n)`.
- **Servicio:** `src/app/services/menu.service.ts` → `MenuService`.
  - `getSidenavTree()`: filtra permiso + `enSidenav`, poda ramas vacías.
  - `getBuscables()`: aplana hojas con `enBuscador !== false` (el buscador filtra permiso al tipear).
- **Render recursivo:** `src/app/shared/components/sidenav-menu/` (`SidenavMenuComponent`,
  standalone, se auto-referencia para anidar). Ramas → `mat-expansion-panel`;
  hojas → `mat-list-item`. Estado de expansión propio por `id` (Set compartido).
  En modo mini emite `requestExpand`.
- **Host:** `app.component` mantiene `menuNodes` (recalculado al emitir
  `PermissionService.codigos$`) y despacha con `activarNodo(node)` (openTab /
  dialog según `action.mode`). Los ~60 métodos `openXTab()` viejos quedaron como
  fallback pero el sidenav ya no los usa.

## Estructura (nivel 1)

Dashboard · Ventas · Compras · Productos · Financiero · Recursos Humanos ·
Personas · Comisiones · Facturación · Configuración.

- **RRHH**: subgrupos *Personal / Asistencia / Anticipos y Beneficios /
  Liquidaciones / Configuración* (3 niveles).
- **Personas**: separado de RRHH a grupo propio.
- **Financiero**: absorbió *Caja Mayor* y *Bancos* como subgrupos + *Configuración*.

## ⚠️ Regla dura (SKILL.md #22)

Toda pantalla navegable nueva DEBE tener su hoja en `MENU_TREE`, o no aparece ni
en el sidenav ni en el buscador. Elegí `enSidenav`/`enBuscador` según dónde deba
verse. No inventar ítems para pantallas inexistentes.

## Pendiente (serie de PRs)

- **PR 2:** overrides persistidos configurables por el ADMIN (visibilidad/orden
  por `id`) + UI en Sistema; `MenuService` los aplicará sobre el árbol base.
- **PR 3:** consolidar dashboard Financiero + Caja Mayor.
- **No inventados** (aparecen en los prints de RRHH pero no existen aún): *Manual
  de uso*, *Solicitudes de funcionarios*, *Tipos de justificativo*.
