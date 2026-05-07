# Dashboards — padrón unificado

> Refactor del **2026-05-07** (branch `feat/dashboards-padron-unificado`, commit `2a061d8`). Antes de este refactor cada dashboard tenía estilo propio y la mayoría sin datos reales. A partir de ahora **todos los dashboards siguen este padrón** — al crear uno nuevo o modificar uno existente, respetar esto.

## 1. Dashboards del sistema

| Dashboard | Componente | Tab key | Permiso (creado, no chequeado aún) |
|---|---|---|---|
| Home (general) | `pages/home/home.component.ts` | `dashboard-tab` | `HOME_DASHBOARD_VER` |
| Ventas | `pages/ventas/dashboard/ventas-dashboard.component.ts` | `ventas-dashboard-tab` | `VENTAS_DASHBOARD_VER` |
| Compras | `pages/compras/dashboard/compras-dashboard.component.ts` | `compras-dashboard-tab` | `COMPRAS_DASHBOARD_VER` |
| Productos | `pages/productos/dashboard/productos-dashboard.component.ts` | `producto-dashboard-tab` | `PRODUCTOS_DASHBOARD_VER` |
| Financiero | `pages/financiero/dashboard/financiero-dashboard.component.ts` | `financiero-dashboard-tab` | `FINANCIERO_DASHBOARD_VER` |
| Caja Mayor | `pages/financiero/caja-mayor/dashboard/caja-mayor-dashboard.component.ts` | (sin key fijo) | `CAJA_MAYOR_DASHBOARD_VER` |
| RRHH | `pages/rrhh/dashboard/rrhh-dashboard.component.ts` | `rrhh-dash-tab` | `RRHH_DASHBOARD_VER` |

Todos abren vía `TabsService.openTab()` desde `app.component.ts`.

## 2. Estructura visual obligatoria

```
.dashboard-container (flex column, gap 20px, width 100%, box-sizing border-box)
  ├── .dashboard-header
  │     ├── .dashboard-header-title (h1 + subtitle)
  │     └── .dashboard-header-actions (refresh button, periodo selector si aplica)
  │
  ├── .dashboard-stats-row (grid 4 cols con minmax(0, 1fr))
  │     └── 4× <app-dash-stat-chip>
  │
  ├── .dashboard-quick-actions (flex wrap)
  │     └── N× <app-dash-quick-action>
  │
  ├── (opcional) .dashboard-card de "Mis accesos directos" con shortcuts personalizados
  │
  └── .dashboard-main-content (grid: minmax(0,1fr) 380px)
        ├── .dashboard-col-left (overflow:hidden)
        │     ├── <app-dash-chart-card> (chart principal)
        │     ├── (opcional) accordion / lista / sección secundaria
        │     └── ...
        └── .dashboard-col-right (sin overflow)
              └── <app-dash-ranking> O lista compacta de alertas/eventos
```

**Responsive** (breakpoints en `_dashboard.scss`):
- `< 1024px` → main-content pasa a 1 columna; stats-row a 2 cols.
- `< 600px` → stats-row a 1 col; quick actions stack vertical.

## 3. Componentes shared (usar SIEMPRE)

Todos en `src/app/shared/components/dashboard/`, todos standalone:

### `<app-dash-stat-chip>`
KPI compacto con icon + value + label. Color del icon según prop (primary default, success/warning/error/info).
```html
<app-dash-stat-chip
  icon="payments"
  [value]="formatPYG(totalHoyPYG) + ' Gs'"
  label="Total hoy"
  color="success"
  [loading]="loading">
</app-dash-stat-chip>
```

### `<app-dash-quick-action>`
Botón pill con icon coloreado + título.
```html
<app-dash-quick-action
  icon="point_of_sale"
  title="Abrir PdV"
  color="#4caf50"
  (action)="navigateTo('pdv')">
</app-dash-quick-action>
```

### `<app-dash-section-header>`
Header interno de card con icon + title + badge opcional.
```html
<app-dash-section-header
  icon="event"
  title="Próximos vencimientos"
  [badge]="proximosVencimientos.length"
  badgeColor="warning">
</app-dash-section-header>
```

### `<app-dash-ranking>`
Top N con barras de progreso. Items: `{nombre, valorPrincipal, valorSecundario?, porcentaje?}`.
```html
<app-dash-ranking
  title="Top productos vendidos"
  icon="emoji_events"
  [items]="topProductos"
  emptyText="Sin datos del periodo">
</app-dash-ranking>
```

### `<app-dash-chart-card>`
Wrapper de canvas baseChart con header. Content projection para chips de rango (botones con `.dashboard-range-chip`).
```html
<app-dash-chart-card
  title="Ventas por periodo"
  icon="trending_up"
  [chartData]="chartData"
  [chartOptions]="chartOptions"
  chartType="line">
  <button *ngFor="let chip of rangosChips"
          class="dashboard-range-chip"
          [class.range-chip-active]="chip.selected"
          (click)="selectRango(chip)">
    {{ chip.label }}
  </button>
</app-dash-chart-card>
```

## 4. Estilos comunes

`src/app/shared/styles/_dashboard.scss` — partial **importado globalmente** desde `src/styles.scss` (no requiere import por componente).

Clases disponibles:
- `.dashboard-container`, `.dashboard-header`, `.dashboard-title`, `.dashboard-subtitle`, `.dashboard-header-actions`
- `.dashboard-stats-row`, `.dashboard-stat-chip` (+ variantes `.chip-success`, `.chip-warning`, etc.)
- `.dashboard-quick-actions`, `.dashboard-quick-action`, `.dashboard-quick-action-icon`
- `.dashboard-main-content`, `.dashboard-col-left`, `.dashboard-col-right`
- `.dashboard-card`
- `.dashboard-section-header`, `.dashboard-section-title`, `.dashboard-section-badge` (+ variantes badge color)
- `.dashboard-chart-header`, `.dashboard-chart-title`, `.dashboard-chart-chips`, `.dashboard-range-chip`, `.dashboard-chart-container`
- `.dashboard-empty-state`
- `.dashboard-ranking-list`, `.dashboard-ranking-item`, `.dashboard-ranking-rank` (+ `.rank-gold/silver/bronze`), `.dashboard-ranking-info`, `.dashboard-ranking-bar`
- `.dashboard-alert-list`, `.dashboard-alert-item` (+ `.alert-success/warning/error/info`)

**Variables de tema** (de `src/styles/theme-variables.scss`): `--text-primary`, `--text-secondary`, `--card-background`, `--border-color`, `--hover-bg`, `--success-color`, `--warning-color`, `--error-color`, `--info-color`. **Nunca colores hardcoded** (excepto el accent `#7c4dff` que es el primary del dashboard).

## 5. Helper de chart options

`src/app/shared/utils/dashboard-chart-theme.ts`:

- `getDashboardChartOptions(type)` — devuelve `ChartConfiguration['options']` con grid/text colors leídos de CSS vars. Theme-aware automático.
- `DASHBOARD_CHART_COLORS` — paleta consistente: `primary`, `cyan`, `success`, `warning`, `error`, `info` (cada uno con su `*Soft` variant para fills).
- `buildLineDataset(label, data, color, softColor, fill)` — construye dataset de línea con estilo dashboard (puntos, tension 0.35, etc.).

```typescript
import { getDashboardChartOptions, DASHBOARD_CHART_COLORS, buildLineDataset } from 'src/app/shared/utils/dashboard-chart-theme';

chartOptions = getDashboardChartOptions('line');
chartData = {
  labels: [...],
  datasets: [
    buildLineDataset('Ventas', ventas, DASHBOARD_CHART_COLORS.primary, DASHBOARD_CHART_COLORS.primarySoft, true),
  ],
};
```

## 6. Backend: handlers KPI por dominio

Cada dashboard tiene un IPC único `get-dashboard-{dominio}-kpis(filtros?)` que devuelve un objeto con todos los KPIs del dashboard. Patrón establecido en `dashboard-rrhh.handler.ts:20`.

### Handlers existentes

| Handler | IPC | Filtros |
|---|---|---|
| `electron/handlers/dashboard-ventas.handler.ts` | `get-dashboard-ventas-kpis` | `rango: 'today'\|'week'\|'month'\|'3months'\|'6months'` |
| `electron/handlers/dashboard-compras.handler.ts` | `get-dashboard-compras-kpis` | — |
| `electron/handlers/dashboard-productos.handler.ts` | `get-dashboard-productos-kpis` | — |
| `electron/handlers/dashboard-financiero.handler.ts` | `get-dashboard-financiero-kpis` | — |
| `electron/handlers/dashboard-caja-mayor.handler.ts` | `get-dashboard-caja-mayor-kpis` | — |
| `electron/handlers/dashboard-rrhh.handler.ts` | `get-dashboard-rrhh-kpis` | `periodo: 'YYYY-MM'` |

### Registro en 3 capas

1. **`main.ts`** (líneas ~125-130): `registerDashboardXxxHandlers(dataSource, getCurrentUser)`.
2. **`preload.ts`** (sección "Dashboards por dominio"): `getDashboardXxxKpis: async (...) => ipcRenderer.invoke('get-dashboard-xxx-kpis', ...)`.
3. **`src/app/database/repository.service.ts`**: tipo en interface + método público que retorna `Observable<any>`.

### Reutilización

Los handlers nuevos reutilizan agregaciones existentes cuando puede:
- Ventas: reusa `getResumenCaja` (`ventas.handler.ts:477`).
- Compras: reusa `get-cuotas-pendientes-compras` (`cuentas-por-pagar.handler.ts:675`).
- Caja Mayor: reusa `get-caja-mayor-saldos` (`caja-mayor.handler.ts:107`), `get-caja-mayor-cpp-resumen` (línea 1679).

## 7. Permisos por dashboard

Seedeados en `electron/handlers/permissions.handler.ts`:
- `HOME_DASHBOARD_VER` (módulo SISTEMA)
- `VENTAS_DASHBOARD_VER` (módulo VENTAS)
- `COMPRAS_DASHBOARD_VER` (módulo COMPRAS)
- `PRODUCTOS_DASHBOARD_VER` (módulo PRODUCTOS)
- `FINANCIERO_DASHBOARD_VER` (módulo FINANCIERO)
- `CAJA_MAYOR_DASHBOARD_VER` (módulo FINANCIERO)
- `RRHH_DASHBOARD_VER` (pre-existente)

`syncAdminPermissions()` en `electron/utils/seed-system.ts` reasigna automáticamente al rol ADMINISTRADOR los permisos faltantes al startup (idempotente). Necesario porque `seedAdminUserAndRole` sólo corre cuando no hay usuarios.

**⚠️ Estado del chequeo:** los permisos están **creados en BD** y asignados al admin, pero **no se chequean en frontend** todavía. El sidenav y `openXxxTab` no llaman a `PermissionService.has(...)`. `PermissionService` existe (`src/app/services/permission.service.ts`) pero ningún componente lo inyecta. Aplicar el chequeo es trabajo de sesión separada.

## 8. Reglas duras del padrón

1. **`width: 100%; box-sizing: border-box;`** en `.dashboard-container`. NUNCA `max-width: 1400px; margin: 0 auto` (eso centraba y limitaba en pantallas anchas — fallback ya corregido).
2. **`grid-template-columns: repeat(N, minmax(0, 1fr))`** en lugar de `1fr`, para evitar overflow horizontal con contenidos largos.
3. **Stat chips, no KPI cards grandes** — la densidad de Ventas es la referencia. KPI cards al estilo viejo de RRHH no se usan más.
4. **`* { box-sizing: border-box }`** dentro del container — selector universal aplicado para evitar que padding sume al ancho.
5. **`min-width: 0`** en `.dashboard-main-content`, `.dashboard-col-left`, `.dashboard-col-right` para permitir que grid items se encojan bajo `min-content` (chart canvas, contenidos largos).
6. **`overflow: hidden`** en `.dashboard-col-left` para que el chart canvas no fuerce overflow horizontal.
7. **No funciones en templates** — pre-computar arrays en componente, usar pipes para transformar.
8. **Loading state** en stat-chips vía `[loading]="loading"` (muestra spinner inline).
9. **Empty state** consistente con `<div class="dashboard-empty-state"><mat-icon>info_outline</mat-icon><span>...</span></div>`.
10. **No mocks** — siempre conectar a un handler real, mostrar empty state si no hay data.

## 9. Estilo del componente local

El SCSS específico del dashboard sólo debe tener **lo que es exclusivo** del componente (ej. el accordion de cajas en Ventas, el accordion 3-grupos en Caja Mayor, los shortcuts cards en Home/Financiero). El resto se hereda del partial global.

Ejemplo del SCSS de Ventas (sólo lo específico):
```scss
// caja-panel, caja-detail-grid, etc. - propio del accordion de cajas abiertas
.caja-panel { ... }
.caja-detail-grid { ... }
```

## 10. Para crear dashboard nuevo

1. **Crear handler backend** en `electron/handlers/dashboard-{dominio}.handler.ts` — un único IPC `get-dashboard-{dominio}-kpis` que devuelve todos los KPIs.
2. **Registrar** en `main.ts`, `preload.ts`, `repository.service.ts`.
3. **Componente standalone** importando los componentes shared del padrón.
4. **HTML** siguiendo la estructura de la sección 2.
5. **SCSS** sólo con lo específico del componente (no duplicar lo común).
6. **Permiso** `XXX_DASHBOARD_VER` al seed de `permissions.handler.ts`.
7. **Abrir desde** `app.component.ts` con `openXxxDashboardTab()` y agregar al sidenav.
8. **Testing**: `npm run build` para TS, `npm start` lo corre el usuario.

## 11. Datos disponibles por dominio (qué hay y qué no)

Si el usuario pide un KPI nuevo, primero verificar si los datos existen:

- **Ventas**: `Venta`, `VentaItem`, `Caja`, `Mesa`, `Comanda`/`ComandaItem`. Campos: `total`, `estado` (ABIERTA/CONCLUIDA/CANCELADA), `fechaCierre`, `caja_id`, `mesa_id`, `vendedor_id`. Items: `cantidad`, `precio_venta_unitario`, `producto_id`.
- **Compras**: `Compra`, `CompraDetalle`, `Proveedor`. Campos: `total`, `estado` (ABIERTO/ACTIVO/FINALIZADO/CANCELADO), `fechaCompra`, `proveedor_id`. Proveedor tiene `nombre` + `razon_social` (nullable).
- **Productos**: `Producto` (`activo`, `registroCompleto`, `iva`), `PrecioVenta` (`activo`, `valor`, `tipo_precio_id`, `moneda_id`), `PrecioCosto` (`activo`, `valor`, `fecha`, `presentacion_id`), `Receta` (`activo`).
- **Financiero**: `Caja` (`estado: ABIERTO/CERRADO`, `fecha_apertura`, `fecha_cierre`, `dispositivo_id`), `Moneda` (`activo`, `principal`, `simbolo`), `MonedaCambio` (`compra_local`, `venta_local`, `created_at`).
- **Caja Mayor**: `CajaMayor` (`estado`), `CajaMayorSaldo` (`saldo` por caja+moneda+formaPago), `CajaMayorMovimiento` (TipoMovimiento: 14 INGRESOS + 13 EGRESOS — ver enum), `CuentaPorPagar`/`CuentaPorPagarCuota` (estado, fecha_vencimiento, monto, monto_pagado), `Cheque` (estado: EMITIDO/DIFERIDO/COBRADO/ANULADO, fecha_pago).
- **RRHH**: `Funcionario` (`activo`), `LiquidacionSueldo` (estado, totalNeto, periodo), `Asistencia` (estado, fecha), `Vale` (estado, esAdelanto), `VacacionPeriodo` (estado, fechaDesde, fechaHasta).

## 12. Snapshot del refactor

- **Branch:** `feat/dashboards-padron-unificado` (PR pending).
- **Commit:** `2a061d8 feat(dashboards): padron unificado para los 7 dashboards + KPIs reales`.
- **Archivos creados:** 14 (1 partial SCSS + 5 handlers + 5 componentes shared con HTML + helper chart-theme + this doc skill).
- **Archivos modificados:** 30 (7 dashboards × 3 archivos + main.ts + preload.ts + repository.service.ts + permissions.handler.ts + seed-system.ts + styles.scss).
