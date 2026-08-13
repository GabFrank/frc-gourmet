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
  - `getSidenavTree()`: filtra permiso + `enSidenav`, ordena por `orden`, poda ramas vacías.
  - `getBuscables()`: aplana hojas con `enBuscador !== false` (el buscador filtra permiso al tipear).
  - `loadOverrides()` / `saveOverrides()` / `changes$`: overrides del ADMIN (ver abajo).
- **Render recursivo:** `src/app/shared/components/sidenav-menu/` (`SidenavMenuComponent`,
  standalone, se auto-referencia para anidar). Ramas → `mat-expansion-panel`;
  hojas → `mat-list-item`. Estado de expansión propio por `id` (Set compartido).
  En modo mini emite `requestExpand`.
  - ⚠️ **El estilo del sidenav vive en `sidenav-menu.component.scss`, NO en
    `app.component.scss`.** Al mudar el menú a este componente, la encapsulación
    de vista dejó afuera las reglas de app.component; sin replicarlas, los ítems
    caen a los defaults de Material MDC (icono líder `margin-right: 32px` → gap
    enorme + texto truncado). El layout compacto (icono **20px**, texto **13px**,
    gap **12px** en `.mdc-list-item__start`, alto de fila 44px, texto con el ancho
    restante, indentación por nivel **10px** vía `.submenu-container`, y margen a
    la derecha del `.mat-content` del header para que el título trunque ANTES del
    chevron) está en el scss del componente bajo `:host ::ng-deep`.
  - **Colapsar cierra los submenús:** `app.component` limpia `menuExpandedIds`
    (`.clear()`) en cada punto de colapso (toggle, click afuera, `closeMenu`,
    init) para que al minimizar el sidenav no queden paneles abiertos rotos en el
    rail angosto. Al reexpandir arranca con todo cerrado (no se restaura estado).
- **Host:** `app.component` mantiene `menuNodes` (recalculado al emitir
  `PermissionService.codigos$`) y despacha con `activarNodo(node)` (openTab /
  dialog según `action.mode`). Los ~60 métodos `openXTab()` viejos quedaron como
  fallback pero el sidenav ya no los usa.

## Configurable por el ADMIN (overrides)

*Configuración → Configuración del menú* (`MenuConfigComponent`, permiso
`SISTEMA_MENU_CONFIGURAR`) deja al ADMIN ocultar/mostrar por sidenav y buscador y
fijar orden, **sin código**.

- Entidad `MenuConfig` (`menu_config`, dominio `sistema`): 1 fila por `nodeId`,
  columnas `en_sidenav` / `en_buscador` / `orden` nullable (`null` = default del
  árbol). Migración `1784756065888-AddMenuConfig`.
- Handlers `menu-config.handler.ts`: `get-menu-config` (lectura, sin permiso),
  `save-menu-config` (bulk upsert, `ensurePermission('SISTEMA_MENU_CONFIGURAR')`,
  borra filas que vuelven al default). Registrado en `main.ts`. Preload
  `getMenuConfig`/`saveMenuConfig` + 3 capas de repository (http = defaults).
- `MenuService` cachea overrides (`loadOverrides()` en login y tras guardar) y
  los pasa a `buildSidenavTree`/`flattenBuscables` como `OverrideMap`. El
  override gana sobre el default; `orden` explícito ordena por encima del índice.
- El leaf `menu-config` está en el grupo *Configuración* de `MENU_TREE`.

## Estructura (nivel 1)

Dashboard · Ventas · Compras · Productos · Financiero · Recursos Humanos ·
Personas · Comisiones · Facturación · Configuración.

- **RRHH**: subgrupos *Personal / Asistencia / Anticipos y Beneficios /
  Liquidaciones / Configuración* (3 niveles).
- **Personas**: separado de RRHH a grupo propio.
- **Financiero**: absorbió *Caja Mayor* y *Bancos* como subgrupos + *Configuración*.
  El subgrupo *Caja Mayor* **no tiene dashboard propio** — el único dashboard
  financiero es el de Financiero (ver domains/dashboards.md); el subgrupo queda
  solo con la operativa (Cajas Mayor, Gastos, Entradas, Operaciones, Retiros, CPP, CPC).

## ⚠️ Regla dura (SKILL.md #22)

Toda pantalla navegable nueva DEBE tener su hoja en `MENU_TREE`, o no aparece ni
en el sidenav ni en el buscador. Elegí `enSidenav`/`enBuscador` según dónde deba
verse. No inventar ítems para pantallas inexistentes.

## Pendiente (serie de PRs)

- **PR 3:** consolidar dashboard Financiero + Caja Mayor.
- **No inventados** (aparecen en los prints de RRHH pero no existen aún): *Manual
  de uso*, *Solicitudes de funcionarios*, *Tipos de justificativo*.

_Hecho: PR 1 (árbol único + sidenav 3 niveles), PR 2 (configurable por el ADMIN)._
