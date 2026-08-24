# Dashboards — padrón unificado

> Refactor del **2026-05-07** (branch `feat/dashboards-padron-unificado`, commit `2a061d8`). Antes de este refactor cada dashboard tenía estilo propio y la mayoría sin datos reales. A partir de ahora **todos los dashboards siguen este padrón** — al crear uno nuevo o modificar uno existente, respetar esto.

## 1. Dashboards del sistema

| Dashboard | Componente | Tab key | Permiso (creado, no chequeado aún) |
|---|---|---|---|
| Home (general) | `pages/home/home.component.ts` | `dashboard-tab` | `HOME_DASHBOARD_VER` |
| Ventas | `pages/ventas/dashboard/ventas-dashboard.component.ts` | `ventas-dashboard-tab` | `VENTAS_DASHBOARD_VER` |
| Compras | `pages/compras/dashboard/compras-dashboard.component.ts` | `compras-dashboard-tab` | `COMPRAS_DASHBOARD_VER` |
| Productos | `pages/productos/dashboard/productos-dashboard.component.ts` | `producto-dashboard-tab` | `PRODUCTOS_DASHBOARD_VER` |
| Financiero (**único dashboard financiero**) | `pages/financiero/dashboard/financiero-dashboard.component.ts` | `financiero-dashboard-tab` | `FINANCIERO_DASHBOARD_VER` |
| ~~Caja Mayor~~ (dashboard **retirado** como destino) | `pages/financiero/caja-mayor/dashboard/caja-mayor-dashboard.component.ts` | — | `CAJA_MAYOR_DASHBOARD_VER` (aún gatea la operativa) |

> **Consolidación Financiero + Caja Mayor (2026-07).** Antes había dos dashboards que "parecían lo mismo": Financiero era casi solo config y Caja Mayor tenía toda la operación, así que el usuario que entraba a Financiero no encontraba nada y tenía que saltar. Ahora el **Dashboard Financiero es el ÚNICO dashboard financiero**: carga en paralelo `get-dashboard-financiero-kpis` + `get-dashboard-caja-mayor-kpis` y muestra saldos (PYG/USD), CPP vencidas, cheques por vencer, cajas abiertas + cotización; quick-actions operativas (Gastos, Entradas, Operaciones, Retiros, CPP, CPC); charts de movimientos 30d + cotizaciones; próximos vencimientos; y un accordion *Operaciones / Cuentas / Bancos & POS / Configuración* con TODO lo financiero.
>
> **`CajaMayorDashboardComponent` quedó SIN ningún punto de entrada** (2ª pasada): se sacó su hoja "Dashboard Caja Mayor" del `MENU_TREE` (el subgrupo *Caja Mayor* queda solo con la operativa), y los accesos "Caja Mayor" de los dashboards Home y Ventas ahora apuntan al Financiero (relabelados "Financiero"). El archivo del componente se conserva pero ya no se navega. Regla general: **las divisiones operativas internas no se reflejan en la UI** — un solo lugar intuitivo por dominio.
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
Top N con barras de progreso. Items: `{nombre, valorPrincipal, valorSecundario?, porcentaje?, payload?}`.

Con `[clickable]="true"` cada fila abre algo: el cursor cambia, el nombre se
subraya al hover y `(itemClick)` emite el item completo. `payload` es el dato
libre que viaja con el item (normalmente el id de la entidad) para que el
dashboard sepa qué abrir sin buscar por nombre. **Sin `[clickable]` el
componente se comporta exactamente como antes** — el hover de fondo existe
siempre, porque es feedback de lectura, no de navegación.

```html
<app-dash-ranking
  title="Top productos vendidos"
  icon="emoji_events"
  [items]="topProductos"
  emptyText="Sin datos del periodo"
  [clickable]="true"
  (itemClick)="abrirProducto($event)">
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
- `.dashboard-cards-row` — fila de cards de igual peso (3 columnas → 2 en <1024px → 1 en <600px), para dashboards sin chart que justifique la asimetría de `.dashboard-main-content`. La usa Productos para sus 3 rankings.
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
| `electron/handlers/dashboard-ventas.handler.ts` | `get-dashboard-ventas-kpis` | `rango: Rango` (default `'week'`) |
| `electron/handlers/dashboard-compras.handler.ts` | `get-dashboard-compras-kpis` | `rango: Rango` (default `'month'`) |
| `electron/handlers/dashboard-productos.handler.ts` | `get-dashboard-productos-kpis` | `rango: Rango` (default `'month'`) |
| `electron/handlers/dashboard-financiero.handler.ts` | `get-dashboard-financiero-kpis` | — |
| `electron/handlers/dashboard-caja-mayor.handler.ts` | `get-dashboard-caja-mayor-kpis` | `rango: Rango` (default `'month'`) |
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

## 7.4. Dos cosas que no se deducen leyendo el código

**Productos — "Mejor margen (CMV)".** El KPI `topCmv` cruza el precio de venta
activo (directo del producto o vía su presentación, priorizando el `principal`)
con el precio de costo activo más reciente. Descarta a propósito los productos
sin ambos precios y los de margen ≤ 0: ahí el dato es carga incompleta, no un
ranking, y meterlos ensucia la lista con ruido que nadie va a accionar. Las tres
listas del dashboard (CMV, más vendidos, parciales) abren el producto en su tab
de edición con el `payload` del item.

**Financiero — "Cajas Mayor activas".** El saldo suma **solo las formas de pago
con `movimenta_caja = true`**, que es el mismo criterio que usa
`agruparSaldosPorFormaPago` en el detalle de la caja mayor para su "Saldo en
caja". Sin ese filtro entra plata que no es efectivo (p. ej. un saldo en
TRANSFERENCIA) y la card muestra un número distinto al de la pantalla que abre
al clickearla — que fue exactamente el bug que apareció probando la UI. Ojo que
el KPI `saldoPYG` del handler de caja mayor **no** aplica este filtro: son dos
cifras con semánticas distintas.

## 7.5. Rangos de tiempo (selector de período)

Fuente única: **`src/app/shared/utils/dashboard-rangos.util.ts`** (TS puro), que
`electron/utils/dashboard-rangos.util.ts` re-exporta. Backend y frontend usan el
mismo tipo `Rango` y los mismos labels, así que agregar un rango no obliga a
tocar los componentes.

```ts
type Rango = 'today' | 'week' | 'month' | 'last-month' | '3months' | '6months';

rangoToFechas(rango, now?)   // { desde, hasta } para filtrar filas
bucketsForRango(rango, now?) // tramos del eje X, con su label
buildRangoChips(rangos, sel) // los chips de la UI
RANGO_LABEL[rango]           // 'Hoy', 'Esta semana', …
```

**`rangoToFechas` se define como la unión de `bucketsForRango`, y eso no es un
detalle de implementación: es la garantía de que el total de la card cierre con
la suma de las barras del chart.** Antes cada una tenía su propia aritmética y
no cerraban — en `3months` la card sumaba 92 días contra los 84 del chart, y en
`6months` había medio mes de diferencia. Si alguna vez hace falta cambiar una,
cambiar la de buckets; la otra la sigue sola. `scripts/test-dashboard-rangos.ts`
verifica ese invariante para todo rango.

Granularidad por rango: horaria (`today`), diaria (`week`, `month`,
`last-month`), semanal (`3months`) y mensual (`6months`).

**Ambos parámetros aceptan `now`, y el handler debe pasar el mismo a las dos.**
Entre `await` y `await` de un request, dos `new Date()` distintos pueden caer en
horas (o días) diferentes y volver a desincronizar card y chart.

## 7.6. Jornada comercial (el corte del "día")

**Un día NO empieza a medianoche.** `PdvConfig.inicioJornadaHora` (default **7**,
configurable desde *Configuración del PdV → JORNADA COMERCIAL*) define la ventana:
un día va de esa hora a la misma del día siguiente menos 1 ms.

Existe porque las cajas del turno noche cruzan las 00:00 y siguen hasta las 2 AM.
Con el corte a medianoche ese turno aparecía **partido en dos días distintos**, y
el "total de hoy" se reiniciaba a mitad del turno.

```ts
anclaJornada(now, inicioJornada)   // a qué fecha-jornada pertenece un instante
rangoToFechas(rango, now, inicioJornada)
bucketsForRango(rango, now, inicioJornada)
ventanaDeFechas(desde, hasta, fallback, inicioJornada)  // fechas del usuario
```

- **`inicioJornada = 0` reproduce exactamente el día calendario.** Es el default
  de todas las firmas, así que un call site que no se enteró sigue comportándose
  como antes en vez de romper.
- **Aritmética de calendario (`setHours`/`setDate`), nunca sumar milisegundos.**
  Sumar 24 h se rompe en los días de cambio de horario.
- El backend la lee con `getInicioJornada(dataSource)` (`dashboard-ventas.handler.ts`),
  cacheada 60 s. **`updatePdvConfig` llama a `invalidarCacheJornada()`** — sin eso
  el usuario cambia el corte y durante un minuto ve el valor viejo.
- **`resolverPeriodo()` de los reportes comparte el mismo ancla.** Tenía su propia
  aritmética de días; con la jornada sólo en los dashboards, una venta de la 01:30
  aparecía en días distintos según la pantalla.
- El front lee `inicioJornada` de la respuesta para rotular el corte; nunca lo
  asume.

Cubierto por `scripts/test-kpis-filtros-e2e.ts` (`npm run test:kpis-filtros`) y
por los casos `[H]` de `test:reportes-periodo`.

## 7.7. Filtros del resumen de ventas

`get-dashboard-ventas-kpis` acepta el string suelto (`'today'`) **o** un objeto
`DashboardVentasFiltro`:

```ts
{ rango?: Rango; desde?: string; hasta?: string; cajaIds?: number[] }
```

- **Fechas y cajas se combinan con AND**, no se pisan.
- `desde`/`hasta` aceptan `YYYY-MM-DD` y se expanden a la **jornada completa**:
  pedir "15/07" trae el turno noche del 15 entero (15 07:00 → 16 06:59).
- **El default histórico se preserva por AUSENCIA de filtro, no por la forma del
  argumento.** `{ rango: 'today' }` sin fechas ni cajas se comporta idéntico al
  string. Sin filtro sigue valiendo la Opción B: el total sigue a la caja abierta,
  así una caja que cruza medianoche no reinicia el total. Con filtro manda lo que
  pidió el usuario.
- La respuesta trae `inicioJornada` y `filtroAplicado` (`{desde, hasta, cajaIds}`
  o `null`) para que la UI pueda rotular el período **con la jornada ya resuelta**.
  Rotular lo que el usuario escribió escondería justamente el corte.
- Con filtro, `totalHoyPYG`/`ventasHoy` ya no son "de hoy" sino del período. El
  nombre quedó del contrato original; el label de la UI **sí** cambia a "Total del
  período".
- El selector de cajas usa **`get-cajas-selector`**, no `get-cajas`: éste no tiene
  `where` ni `LIMIT` y arrastra 6 relaciones eager, incluidos los dos conteos.
- **Filtrar SÓLO por cajas no se acota además a "hoy".** Una caja es un turno
  cerrado y su período es el suyo; cruzarla con la ventana de hoy hacía que
  elegir una caja de la semana pasada devolviera cero con el cartel "No hubo
  ventas en el período" — falso. El selector ofrece cajas viejas, así que es el
  camino normal, no un borde.
- **El chart (`ventasPorPeriodo`) usa la ventana pedida, no el preset.** Con
  fechas explícitas los tramos salen de `bucketsForVentana(desde, hasta)`, que
  elige granularidad por duración (horaria ≤1 día, diaria ≤45, semanal ≤180,
  mensual más allá). Antes el chart se armaba sobre el preset (`'week'` por
  default) mientras las cards usaban la ventana: filtrar julio mostraba las
  cards de julio con un chart de la semana actual en cero — el mismo desfase
  card/chart que el invariante de `rangoToFechas` existe para evitar.
- **Medio rango se rechaza en la UI.** "Hasta el 1/8" no dice desde cuándo; el
  backend completaba el extremo faltante con el preset (que arranca HOY) y
  armaba un rango invertido: cero resultados en silencio. `ventanaDeFechas`
  conserva un piso defensivo por si otro caller manda un solo extremo.

### ⚠️ Fechas en SQLite: el límite se normaliza, la columna no

TypeORM escribe `created_at` con `datetime('now')` → **`YYYY-MM-DD HH:MM:SS`, UTC,
sin `T` ni `Z`**. Los handlers arman los límites con `Date.toISOString()`. SQLite
compara esa columna como **texto**, y el espacio (`0x20`) ordena **antes** que la
`T` (`0x54`):

```
'2026-08-24 09:40:12' >= '2026-08-24T03:00:00.000Z'   →  FALSO
```

Una fila creada hoy quedaba **fuera** del rango "hoy". No fallaba: devolvía cero.
Sólo afecta al modo standalone — en Postgres la columna es `timestamp` de verdad.

**`dbQuery` normaliza los parámetros ISO-Z al formato del driver** cuando el
driver es SQLite (el límite, no la columna, para no perder el índice). Es un punto
único y cubre los 65 call sites. Si escribís una consulta de fechas con
`ds.query()` directo, **no** tenés esa red.

Los tests sellaban `created_at` en ISO — el mismo formato ficticio de los
límites — así que coincidían entre sí y pasaban mientras la app devolvía cero.
`test:kpis-filtros` verifica que el formato sembrado siga siendo el que escribe
BaseModel.

### Cómo se conecta un dashboard

1. El handler recibe `rango: Rango = '<default>'` y resuelve fechas/buckets con
   el util. Los KPIs que **no** son una serie —conteos de catálogo, alertas de
   vencimiento a futuro— NO se filtran por rango; documentarlo con un comentario
   para que no parezca un olvido.
2. El componente arma sus chips con `buildRangoChips(...)`, y en `selectRango()`
   actualiza **todos** los labels que nombran el período (título del chart,
   labels de las stat chips, título del ranking) antes de recargar. Un título
   que dice "del mes" con datos de 6 meses es el bug clásico de esta pantalla.
3. Los chips van dentro de `<app-dash-chart-card>` (content projection). Si el
   dashboard no tiene chart, van en `.dashboard-header-actions` dentro de un
   `.dashboard-chart-chips` — es el "periodo selector si aplica" de la sección 2.

Quién ofrece qué (cada dashboard elige el subset que le sirve):

| Dashboard | Rangos | Default |
|---|---|---|
| Ventas | today, week, month, 3months, 6months | week |
| Compras | week, month, last-month, 3months, 6months | month |
| Productos | today, week, month, last-month, 3months | month |
| Home | today, week, month, 3months | week |

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
11. **Si el dashboard tiene selector de rango, todo texto que nombre el período lo sigue** — título del chart, labels de las stat chips y títulos de los rankings. Precomputados en el `.ts`, actualizados en `selectRango()`.
12. **Una cifra que es un acceso a otra pantalla tiene que coincidir con lo que esa pantalla muestra.** Ver la card de Cajas Mayor en la sección 3.

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
