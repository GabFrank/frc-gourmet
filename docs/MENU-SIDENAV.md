# Menú lateral (sidenav) y fuente única de navegación

El sidenav y el **buscador global** (Ctrl+Espacio) se renderizan desde una
**única fuente de verdad**: el árbol `MENU_TREE` en
`src/app/services/menu-tree.ts`. Antes había dos listas paralelas (el sidenav
hardcodeado en `app.component.html` y un `menu-registry.ts` aparte para el
buscador) que podían desincronizarse. Ahora hay un solo árbol.

## Modelo de datos

```ts
interface MenuNode {
  id: string;            // único y estable (clave de override del ADMIN)
  label: string;
  icon?: string;
  keywords?: string[];   // sinónimos en español para el buscador
  permiso?: string;      // *appHasPermission del item; sin permiso = público
  enSidenav?: boolean;   // default true — visible en el menú lateral
  enBuscador?: boolean;  // default true — indexable por el buscador
  esConfig?: boolean;    // sección "Configuraciones" del buscador
  badgeKey?: string;     // badge dinámico (ej: 'rrhhNotif')
  children?: MenuNode[]; // RAMA (grupo) — hasta 3 niveles de anidación
  action?: MenuAction;   // HOJA (destino navegable)
}

interface MenuAction {
  mode?: 'tab' | 'dialog';  // default 'tab'
  component: Type<any>;
  title: string;            // título del tab / diálogo
  tabId?: string;           // reusar tab (mode='tab')
  data?: any;
  dialogConfig?: any;       // config del MatDialog (mode='dialog')
}
```

- Un nodo con `children` es una **rama** (grupo expandible).
- Un nodo con `action` es una **hoja** (abre un tab o un diálogo).
- Los booleanos `enSidenav` / `enBuscador` deciden **dónde aparece cada hoja**.
  Ej: *Crear producto* / *Crear receta* van con `enSidenav: false` (solo se
  buscan, no ocupan lugar en el menú).

## Cómo se resuelve

`MenuService` (`src/app/services/menu.service.ts`) aplica los permisos del
usuario actual sobre el árbol base:

- **`getSidenavTree()`** — filtra por `permiso` + `enSidenav` y poda ramas sin
  hojas visibles. Lo consume `app.component` (`menuNodes`), que se recalcula al
  emitir `PermissionService.codigos$` (login/logout/refresh).
- **`getBuscables()`** — aplana las hojas con `enBuscador !== false`. Lo consume
  el buscador global, que además filtra por permiso al tipear.

## Render del sidenav

El componente recursivo `src/app/shared/components/sidenav-menu/` recorre el
árbol: **ramas** → `mat-expansion-panel` anidados; **hojas** → `mat-list-item`.
Mantiene su propio estado de expansión por `id` (Set compartido). En modo mini
(colapsado), el click en un header emite `requestExpand` para abrir el sidenav.

`app.component` despacha la activación de una hoja con `activarNodo(node)`:
abre el tab (`TabsService.openTab`) o el diálogo (`MatDialog.open`) según
`action.mode`. Esto reemplazó a los ~60 métodos `openXTab()` del sidenav.

## Estructura actual (resumen)

Nivel 1 (grupos): **Dashboard** · Ventas · Compras · Productos · Financiero ·
Recursos Humanos · Personas · Comisiones · Facturación · Configuración.

Reorganizaciones destacadas:

- **RRHH** pasó de una lista plana de 18 ítems a subgrupos: *Personal*,
  *Asistencia*, *Anticipos y Beneficios*, *Liquidaciones*, *Configuración*
  (3 niveles).
- **Personas** (Personas, Usuarios, Clientes, Convenios) se separó de RRHH a su
  propio grupo de nivel 1.
- **Financiero** absorbió *Caja Mayor* (dashboard + cajas mayor, gastos,
  entradas varias, operaciones financieras, retiros, CPP, CPC) y *Bancos*
  (cuentas, cheques, chequeras, POS, acreditaciones) como subgrupos, más
  *Configuración* (monedas, categorías).

## Agregar / reagrupar ítems

Editá **solo** `src/app/services/menu-tree.ts`:

1. Para una pantalla nueva, agregá su **hoja** en el grupo que corresponda con
   `action` (component/title/tabId/data exactos del `openTab`, o `mode:'dialog'`
   + `dialogConfig`).
2. Elegí `enSidenav` / `enBuscador` según dónde deba verse.
3. Para un subgrupo nuevo, agregá una rama con `children`.

No hace falta tocar `app.component` ni el buscador: ambos leen el árbol.
Esta es la regla dura #22 de la skill (toda pantalla navegable debe estar en el
árbol). Ver también [BUSCADOR-GLOBAL.md](BUSCADOR-GLOBAL.md).

## Pendiente (próximos PRs de esta serie)

- **PR 2 — Configurable por el ADMIN:** capa de overrides persistidos
  (visibilidad / orden por `id` de nodo) + pantalla de configuración en Sistema.
  `MenuService` aplicará esos overrides sobre el árbol base.
- **PR 3 — Consolidación de dashboards:** unificar el dashboard Financiero con
  las secciones operativas de Caja Mayor para tener un único punto de entrada
  financiero intuitivo.
