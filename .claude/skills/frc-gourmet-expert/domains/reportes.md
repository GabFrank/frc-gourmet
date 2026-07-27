# Reportes de Cierre de Mes (Ventas + Finanzas)

> Nuevo subsistema **2026-07** (branch `claude/reportes-cierre-mes`). Reportes analíticos **interactivos** (y exportables) para presentaciones de cierre de mes: permiten analizar el desempeño diario / semanal / mensual, siempre comparando contra el período anterior. NO son los reportes imprimibles legacy; son un hub aparte con su propio grupo de menú.

## 1. Qué es

Dos pantallas dentro de un **hub "Reportes"**:

- **Reportes · Ventas — Cierre de Mes** → KPIs (facturación, tickets, ticket promedio, margen bruto, mesas), tendencia del período, ranking por día de la semana, horas pico (heatmap), mix de forma de pago, top productos, ingeniería de menú (burbujas popularidad×margen), combinaciones frecuentes (market-basket).
- **Reportes · Finanzas — Cierre de Mes** → KPIs (ingresos, egresos, flujo neto, gastos operativos, por cobrar vencido), flujo de caja semanal, composición de ingresos/egresos, gastos por categoría, aging CPC/CPP, comisiones POS, próximos vencimientos.

Cada pantalla trae un **control de período** común (`app-reporte-periodo-control`): presets `today` / `week` / `month` (mes-a-fecha) / `prevMonth` (mes completo) / `quarter` (90d) / `custom`, toggle **comparar vs período anterior**, selector de moneda y botón **Aplicar** (no hay live-filtering).

**Presentación:** botón **Presentar** (pantalla completa vía Fullscreen API, `[class.presentando]`), **Exportar PDF** (pdfmake) y **WhatsApp** (envía el primer gráfico como imagen + caption con KPIs, vía Evolution API — reutiliza el destino de cierre de caja).

## 2. Archivos

### Backend (`electron/handlers/`)
- **`reportes.handler.ts`** — registra 3 canales:
  - `get-reporte-ventas-cierre` → `ensurePermission('VENTAS_REPORTES_VER')` → `construirReporteVentasCierre`.
  - `get-reporte-finanzas-cierre` → `ensurePermission('FINANCIERO_REPORTES_VER')` → `construirReporteFinanzasCierre`.
  - `enviar-reporte-whatsapp` → `ensurePermission([VENTAS_REPORTES_VER, FINANCIERO_REPORTES_VER])` (OR) → envía imagen por Evolution API al `PdvConfig.whatsappCierreCajaDestino`.
  - Interfaz `ReportePeriodoParams { rango?, desde?, hasta?, comparar?, monedaId? }`.
- **`reportes-periodo.util.ts`** — `resolverPeriodo(params, now?)` → `{ actual, anterior|null, label, labelAnterior }`. `variacionPct(actual, anterior)` (null si base 0). **Regla de comparación:** `month`/`prevMonth` → mes calendario anterior; `month` se recorta al mismo día (mes-a-fecha), `prevMonth` toma el **mes anterior COMPLETO**; el resto → ventana de igual longitud inmediatamente anterior.
- **`reportes-ventas.helper.ts`** — `construirReporteVentasCierre`. Series de tendencia, día de semana, heatmap, productos, mix, combinaciones, meseros.
- **`reportes-finanzas.helper.ts`** — `construirReporteFinanzasCierre`. Flujo de caja, composición, gastos, aging, POS, vencimientos.
- Reutiliza helpers **exportados** de `dashboard-ventas.handler.ts`: `getMonedaPrincipalId`, `getCotizacionMap`, `sumaVentasRango`, `desgloseVentasRango`, `filtroRango`, tipo `VentaFiltro`.

### Frontend (`src/app/pages/reportes/`)
- `ventas-reportes/` y `finanzas-reportes/` — componentes standalone (ts/html/scss).
- `reporte-periodo-control/` — control de período reutilizable (emite `(aplicar)` con `ReportePeriodoParams`). Define localmente `--primary-color`/`--primary-contrast` en `:host` (rojo de marca `#db392e`) — **no** hay token global.
- `reporte-models.ts` — `ReportePeriodoParams` + `RANGO_PRESETS`.
- `reporte-visual.ts` — `Chart.register(...registerables)` (los controllers NO están registrados globalmente por ng2-charts); paleta `REPORTE_ROJO/AZUL/...` + `REPORTE_CATEGORICA`; `formatGs/formatNum/formatDec`; `buildKpiCard`/`buildKpiCardPct`; tipos `KpiCard`/`HeatmapVM`.
- `reporte-export.util.ts` — `exportarReportePdf`, `capturarGraficos` (busca `[data-rep-titulo]` → `canvas.toDataURL`), `primerGraficoBase64`, `captionKpis`. pdfmake vía `loadPdfMake()` de `facturacion/plantillas/plantilla-render.util.ts`.

### Menú
Grupo top-level **`grp-reportes`** (icon `assessment`) en `menu-tree.ts`, entre *Financiero* y *RRHH*, con 2 hojas: `reportes-ventas` (`VentasReportesComponent`, permiso `VENTAS_REPORTES_VER`) y `reportes-finanzas` (`FinanzasReportesComponent`, `FINANCIERO_REPORTES_VER`).

## 3. Cómo se calcula la plata (crítico)

- **Nunca usar `ventas.total`** (poco confiable). El dinero de ventas sale de `pagos_detalles`: `SUM(PAGO) − SUM(VUELTO)` sobre `pd.activo`, con **conversión multi-moneda** vía `monedas_cambio."compraLocal"` (los montos en moneda no-principal se convierten con `cotMap`; la principal usa factor 1).
- **Finanzas** suma `cajas_mayor_movimientos.monto` (positivo; el signo lo implica el `tipo_movimiento`) clasificado por `TIPOS_INGRESO`/`TIPOS_EGRESO`, también convertido a la principal.
- **Exclusión de anulaciones** (`MOV_ACTIVO`): excluye `tipo='ANULACION'`, los contra-movimientos (`referencia_anulacion_id IS NOT NULL`) y los movimientos originales anulados (`id NOT IN (SELECT referencia_anulacion_id ...)`).

### Desfase UTC/local — patrón obligatorio para series por fecha
`created_at` / `cajas_mayor_movimientos.fecha` se guardan como **datetime UTC** (ISO). Un `GROUP BY strftime('%Y-%m-%d', ...)` agrupa por **fecha UTC**, que en un server con huso negativo (PY, UTC-3) **no coincide** con el día calendario local → ventas de la noche caen en el día siguiente o se pierden de la serie. **Por eso las series NO usan `GROUP BY` por fecha extraída en SQL**: suman **una ventana de rango local a la vez** (día para ≤45 días, ventana de 7 días para rangos largos) reutilizando `sumaVentasRango(filtroRango(desde.toISOString(), hasta.toISOString()))`. Así la serie **reconcilia exactamente** con el KPI de facturación (mismo code-path) y no hay drift. Mismo criterio que `buildVentasPorPeriodo` de los dashboards. Las agregaciones por **día de la semana** y **hora** sí usan `EXTRACT`/`strftime` (siguen el huso de `created_at`, decisión documentada — son distribuciones, no totales por fecha).

Cuando el período de comparación tiene más cubetas que el actual (mes anterior más largo), las cubetas sobrantes se **pliegan en el último punto** para que la línea punteada siga sumando el total completo del anterior.

## 4. Wiring IPC (4 capas)

`repository.service.ts` (abstract) + `repository-ipc.service.ts` (impl standalone/server) + `repository-http.service.ts` (**stubs que lanzan "no implementado" en modo client** — pendiente) + `preload.ts` (3 métodos) + `api-channel-map.generated.ts` (regenerar con `npm run generate:web-api`). Métodos: `getReporteVentasCierre`, `getReporteFinanzasCierre`, `enviarReporteWhatsapp`.

## 5. Tests

- `npm run test:reportes-periodo` — unit determinístico de `resolverPeriodo`/`variacionPct` (sin DB; cubre el recorte mes-a-fecha y el mes-completo de `prevMonth`).
- `npm run test:reporte-ventas` — e2e SQLite: KPIs, día de semana, top productos + margen, mix, combinaciones, tendencia, comparativo.
- `npm run test:reporte-finanzas` — e2e SQLite: KPIs, exclusión de anulaciones, composición, gastos, aging CPP, POS, vencimientos, flujo.

## 6. Gotchas / decisiones

- El **ranking de meseros** (`meseros`) se calcula en el backend pero **aún no se muestra** en el frontend; convierte todas las monedas (dos consultas: cantidad por usuario + monto por usuario/moneda).
- Modo **client** (HTTP): los 3 métodos aún lanzan error — no están portados. Si se necesita en cliente, implementar en `repository-http.service.ts`.
- Los charts requieren `Chart.register(...registerables)` (lo hace `reporte-visual.ts` como side-effect del módulo) — sin eso, bubble y bar+line mixto no renderizan.
- WhatsApp: `sendWhatsappMedia` solo manda imágenes → se envía el primer gráfico como PNG + caption de KPIs; reutiliza `buildEvolutionConfig()` + `getEvolutionApiKey()` + destino de cierre de caja.
