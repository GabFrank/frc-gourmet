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
- **`reportes-delivery.helper.ts`** (2026-08-28) — motor de métricas de delivery/retiro. `construirBloqueDelivery` devuelve el bloque completo (KPIs + comparativo, mix por canal, zonas, repartidores, tiempos/SLA, cancelaciones, cobro anticipado, origen del reparto) y `construirReporteVentasCierre` lo incorpora al payload como `delivery`, más 4 KPIs (`envios`, `retiros`, `ingresoEnvios`, `ticketPromedioDelivery`) dentro de `kpis` para que el frontend los arme con el mismo `buildKpiCard` que el resto. **Lo consumen también** `get-dashboard-ventas-kpis` (chips) y `computeResumenCaja` (bloque del cierre), vía `kpisDelivery` / `deliveriesEnCamino` / `resumenDeliveryCaja`. Ver §8.
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

### Jornada comercial — `resolverPeriodo` comparte el ancla de los dashboards

`resolverPeriodo()` tenía su **propia aritmética de días** (`startOfDay`/`endOfDay`),
independiente de `dashboard-rangos.util.ts`. Cuando se agregó la jornada comercial
(día de 07:00 a 06:59, ver `domains/dashboards.md` §7.6) y los reportes no se
enteraron, **una venta de la 01:30 aparecía en días distintos según la pantalla**:
el dashboard la contaba en la jornada de ayer y el reporte en el día calendario de
hoy. Es el mismo desfase card/chart que ya se había corregido una vez, ahora entre
pantallas.

Hoy los orquestadores leen `getInicioJornada(dataSource)` y lo pasan:
`resolverPeriodo(params, new Date(), inicioJornada)`. `inicioJornada = 0`
reproduce exactamente el día calendario.

**La ventana de comparación también.** El bloque `if (comparar)` armaba
`anterior` con medianoche fija mientras `actual` ya usaba la jornada: con corte a
las 07:00 la comparación salía **24 h más larga** y el % de variación quedaba
sesgado. Y el día de corte se leía de `hasta.getDate()`, que con la jornada
encendida ya rodó al día calendario siguiente (la jornada del 19 cierra el 20 a
las 06:59). Es el **default de la pantalla** (`comparar = true`, rango `month`),
así que se veía siempre. Cubierto por los casos `[I]` de `test:reportes-periodo`
— la suite pasaba con el bug porque ninguno miraba la longitud de `anterior`.

**fix relacionado:** los rangos `custom` corrían un día. `new Date('2026-07-15')`
es UTC-medianoche, que en Paraguay es el 14 a la noche. Se parsea con
`parseFechaLocal()` del util compartido.

## 4. Wiring IPC (4 capas)

`repository.service.ts` (abstract) + `repository-ipc.service.ts` (impl standalone/server) + `repository-http.service.ts` (**stubs que lanzan "no implementado" en modo client** — pendiente) + `preload.ts` (3 métodos) + `api-channel-map.generated.ts` (regenerar con `npm run generate:web-api`). Métodos: `getReporteVentasCierre`, `getReporteFinanzasCierre`, `enviarReporteWhatsapp`.

## 5. Tests

- `npm run test:reportes-periodo` — unit determinístico de `resolverPeriodo`/`variacionPct` (sin DB; cubre el recorte mes-a-fecha y el mes-completo de `prevMonth`).
- `npm run test:reporte-ventas` — e2e SQLite: KPIs, día de semana, top productos + margen, mix, combinaciones, tendencia, comparativo.
- `npm run test:reporte-finanzas` — e2e SQLite: KPIs, exclusión de anulaciones, composición, gastos, aging CPP, POS, vencimientos, flujo.
- `npm run test:reporte-delivery` — e2e SQLite del motor de delivery (57 asserts): KPIs, mix por canal, zonas, repartidores, SLA, cancelaciones, multimoneda, cierre de caja, comparativo. Incluye los dos invariantes de §8.
- `npm run test:canal-venta` — compara el `CASE` de SQL contra el clasificador de TypeScript caso por caso.

## 6. Versión mobile (PWA)

El mismo hub existe en la **PWA mobile** (`projects/mobile/src/app/pages/reportes/`), agregado 2026-07. **No requirió backend nuevo**: reusa los 3 handlers vía `/api/rpc` (el mobile usa `RepositoryIpcService` de `@frc/shared-core` + el shim HTTP); solo se regeneró el api-map (`npm run generate:mobile-api`).

- **Nav:** grupo `Reportes` en `core/shell/nav.ts` (permisos `VENTAS_REPORTES_VER`/`FINANCIERO_REPORTES_VER`) + índice de sección + rutas `/reportes/ventas` y `/reportes/finanzas` en `app.routes.ts`.
- **UI 100% nueva mobile-first** (no reusa nada del desktop): `ventas/ventas-reportes.page.ts` y `finanzas/finanzas-reportes.page.ts`, control de período táctil `reporte-periodo-control.component.ts`, estilos `reportes-mobile.scss`, utilidades `reporte-visual.util.ts` (Chart.register + paleta + KPIs + opciones compactas) y `reporte-export.util.ts` (pdfmake por import dinámico, captura de canvas, caption WhatsApp).
- **Visualización híbrida:** KPIs + rankings en tarjetas/progress-bars; gráficos clave con **ng2-charts** (Ventas: tendencia línea + mix dona; Finanzas: flujo barras + composición egresos dona). El **heatmap** se muestra como lista de horas pico y la **ingeniería de menú (burbujas)** se omite en mobile.
- **Extras:** export PDF, WhatsApp y pantalla completa (los 3, igual que desktop).
- **Validar:** `npx ng build mobile` (el pre-commit de husky solo typechequea Electron).

## 7. Gotchas / decisiones

- El **ranking de meseros** (`meseros`) se calcula en el backend pero **aún no se muestra** en el frontend; convierte todas las monedas (dos consultas: cantidad por usuario + monto por usuario/moneda).
- Modo **client** (HTTP): los 3 métodos aún lanzan error — no están portados. Si se necesita en cliente, implementar en `repository-http.service.ts`.
- Los charts requieren `Chart.register(...registerables)` (lo hace `reporte-visual.ts` como side-effect del módulo) — sin eso, bubble y bar+line mixto no renderizan.
- WhatsApp: `sendWhatsappMedia` solo manda imágenes → se envía el primer gráfico como PNG + caption de KPIs; reutiliza `buildEvolutionConfig()` + `getEvolutionApiKey()` + destino de cierre de caja.


## 8. Delivery y retiro en los informes (2026-08-28)

Hasta esta fecha **ninguna pantalla de informes sabía que el delivery existía**:
cero menciones a delivery, `canal_origen`, `costo_delivery` o zona en
`reportes-*.helper.ts`, `dashboard-ventas.handler.ts` y `resumen-caja.utils.ts`.
Los datos estaban todos en la base; nadie los leía.

### El canal es una sola definición, en dos lenguajes

`src/app/shared/utils/canal-venta.util.ts` (TS puro, lo usan backend y
renderer) define **SALÓN / MOSTRADOR / DELIVERY / RETIRO**, y
`electron/utils/canal-venta.utils.ts` lo re-exporta agregando el `CASE` SQL
equivalente (`canalVentaExpr`), el filtro (`condicionCanal`) y el join
(`joinDeliveryCanal`).

Son dos implementaciones de la misma regla y por eso `npm run test:canal-venta`
las compara **fila por fila** contra la base — el mismo resguardo que
`CONCEPTO_ES_INGRESO` / `esIngreso()` en el pago consolidado.

Dos detalles que no son obvios:

- **El reparto gana sobre la mesa.** Si un delivery quedara además con mesa (un
  arrastre de datos), clasificarlo como SALÓN lo borraría de los informes de
  delivery, que es el error caro.
- **Un canal desconocido no abre el filtro.** `condicionCanal('DELIVERI')`
  devuelve `1 = 0`, no "todo": un typo que muestra el universo entero parece
  que funcionó.

⚠️ **El canal NO es `Venta.canalOrigen`** (LOCAL / WEB / QR_MESA), que dice por
qué puerta entró el pedido. Un delivery puede ser LOCAL (lo cargó el cajero por
teléfono) o WEB. Se cruzan, no se reemplazan — `origenDeLosRepartos` es
justamente ese cruce.

### Criterios del motor (leer antes de tocar)

- **La ventana es `ventas.created_at`, para todo.** Contar los envíos por
  `fecha_entregado` sonaba mejor ("envíos entregados en el mes") pero rompe la
  reconciliación: `envíos × ticket promedio` dejaría de dar la facturación de
  delivery del mismo período. El label dice "envíos", no "entregados".
- **La plata sale de `pagos_detalles`** (`PAGO − VUELTO`, `pd.activo`,
  convertido con `cotMap`), igual que `sumaVentasRango`. **La excepción es el
  envío**, que sale de `ventas.costo_delivery`: es un monto congelado y un pago
  mixto no dice qué parte era el envío.
- **Todo pasa por un `FiltroVentas`**, no por un rango: el reporte filtra por
  período y el dashboard por **caja abierta** (la "Opción B" que evita que un
  turno que cruza medianoche reinicie el total). Lo que varía es el filtro, no
  la aritmética.
- **`cancelacionesDelivery` es la única función que mira ventas CANCELADAS** —
  `delivery-cancelar` cancela también la venta. El resto parte de `concluidas()`.
  Hay un assert dedicado a que una cancelada no se cuele en ninguna otra métrica.
- **Los tiempos se restan en JS**, no con date-diff de SQL: `EXTRACT(EPOCH…)` y
  `julianday()` no se parecen, y ramificar por driver cuatro etapas es más
  frágil que traer los timestamps.
- **Una etapa sin sus dos extremos no cuenta como cero.** La máquina de estados
  permite ABIERTO → EN_CAMINO sin pasar por PARA_ENTREGA; rellenar el despacho
  con cero diría que fue instantáneo cuando no existió.
- **Ciclo de imports:** `dashboard-ventas.handler` → `reportes-delivery.helper`,
  nunca al revés. Por eso el helper **redeclara** `FiltroVentas` en vez de
  importar `VentaFiltro`.

### Invariantes que cubre el test

1. La suma del mix por canal **es** la facturación del reporte (si un canal
   contara de más, la dona y el KPI dirían cosas distintas).
2. Una venta cancelada no aparece en ninguna métrica salvo la de cancelaciones.

### Bloque del cierre de caja

`computeResumenCaja` devuelve `delivery: ResumenDeliveryCaja` (envíos, retiros,
cancelados, cobro de envíos, anticipados y **pendientes** al cerrar), así que
aparece de una vez en el diálogo, el ticket impreso y la imagen de WhatsApp.
No reusa `kpisDelivery`: el cierre no necesita facturación por canal, y
arrastrar la conversión multimoneda obligaría al util del arqueo a depender del
mapa de cotizaciones.

### La pantalla (desktop)

Cuatro KPIs (Envíos, Retiros, Ingreso por envíos, Ticket prom. delivery) en una
**fila propia** debajo de la general: la grilla de arriba es de 5 columnas y
meter 9 cards dejaba una segunda fila coja. El PDF y el caption de WhatsApp leen
`kpisExport` (`kpis` + `kpisDelivery`), así que ven las dos filas.

Cinco tarjetas entre "Ingeniería de menú" y "Combinaciones", todas bajo
`*ngIf="hayDelivery"` — un local que no reparte no ve media pantalla vacía:

| Tarjeta | Notas |
|---|---|
| **Mix por canal** | Dona + tabla + notas al pie con cobro anticipado y origen (WEB/LOCAL). Se pintan los 4 canales aunque alguno esté en cero: la ausencia es el dato. |
| **Envíos por zona** | Barras + tabla (envíos, facturación, envío cobrado, tiempo prom.). Un tiempo `null` se muestra `—`, no `0`: nadie entregó, no fue instantáneo. |
| **Repartidores** | `<app-dash-ranking>`, ordenado por entregas. |
| **Tiempos de entrega** | Barras promedio/mediana por etapa + 3 chips de SLA con **color y etiqueta juntos** (nunca color solo). Los umbrales del chip vienen del backend, así que el texto dice los minutos reales configurados. |
| **Cancelaciones** | Cantidad, tasa, monto no facturado y top de motivos. |

Además: la **tendencia** gana una tercera serie "Delivery" (sólo si hubo alguno
— una línea en cero le roba lectura a las otras dos), y el **heatmap** gana un
toggle Todos / Solo delivery, porque de noche el reparto sigue y el salón baja:
mezcladas, las dos curvas se promedian en una que no describe a ninguna.

Dos cosas que costaron y conviene no repetir:

- **`<app-dash-section-header>` no proyecta contenido** (no tiene `<ng-content>`).
  Meter el toggle adentro lo hacía desaparecer en silencio; va como hermano, en
  un `.hm-head` flex.
- **`--primary-color` NO es un token global** en este proyecto: cada componente
  define el suyo (`reporte-periodo-control` tiene el rojo de marca en su
  `:host`). Un botón propio que lo usara salía transparente. El toggle reusa
  `.dashboard-range-chip` / `.range-chip-active`, que sí es global vía
  `styles.scss` → `@import './app/shared/styles/dashboard'` (sin guion bajo, por
  eso no aparece grepeando `_dashboard`).

La paleta categórica del repo se validó con el validador de `dataviz` para los 4
canales: pasa en claro (con el WARN de contraste que ya cubren la leyenda con %
y la tabla). En **oscuro**, dos pasos (naranja y amarillo) quedan fuera de la
banda de luminosidad recomendada — es de la paleta preexistente, compartida con
el mix de forma de pago, y cambiarla acá dejaría dos donas con paletas distintas
en la misma pantalla. Anotado como pendiente, no tocado.

### La pantalla (mobile / PWA)

Las mismas métricas, mobile-first y sin backend nuevo: KPIs en fila propia, mix
por canal (dona), zonas y repartidores como listas con `mat-progress-bar`, SLA
como chips y cancelaciones como texto + motivos. Se omiten, igual que el resto
del reporte mobile, el heatmap por canal y cualquier gráfico de burbujas.

Manual de pruebas: [`docs/testing/TESTING-CHECKLIST-INFORMES-DELIVERY.md`](../../../../docs/testing/TESTING-CHECKLIST-INFORMES-DELIVERY.md).
