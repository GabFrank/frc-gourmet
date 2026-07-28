# Reportes de Cierre de Mes (Ventas + Finanzas)

Reportes analíticos **interactivos** y exportables para presentaciones de cierre de mes. Permiten analizar el desempeño diario / semanal / mensual comparando siempre contra el período anterior. Viven en un **hub "Reportes"** propio (grupo de menú entre *Financiero* y *RRHH*).

> Documentación técnica detallada (patrones de dinero, desfase UTC/local, wiring IPC, gotchas): `.claude/skills/frc-gourmet-expert/domains/reportes.md`.

## Pantallas

- **Reportes · Ventas — Cierre de Mes** (`VentasReportesComponent`, permiso `VENTAS_REPORTES_VER`)
  - KPIs: facturación, tickets, ticket promedio, margen bruto, mesas atendidas.
  - Tendencia del período, ranking por día de la semana, horas pico (heatmap), mix de forma de pago, top productos, ingeniería de menú (popularidad × margen), combinaciones frecuentes (market-basket).
- **Reportes · Finanzas — Cierre de Mes** (`FinanzasReportesComponent`, permiso `FINANCIERO_REPORTES_VER`)
  - KPIs: ingresos, egresos, flujo neto, gastos operativos, por cobrar vencido.
  - Flujo de caja semanal, composición de ingresos/egresos, gastos por categoría, aging CPC/CPP, comisiones POS, próximos vencimientos.

## Control de período

Componente común `app-reporte-periodo-control`:

- Presets: **hoy**, **semana**, **mes** (mes-a-fecha), **mes anterior** (completo), **trimestre** (90 días), **personalizado**.
- Toggle **comparar vs período anterior** (mes calendario anterior para mes/mes-anterior; ventana de igual longitud para el resto).
- Selector de moneda + botón **Aplicar** (sin filtrado en vivo).

## Presentación y export

- **Presentar** — pantalla completa (Fullscreen API) para proyectar en la reunión de cierre.
- **Exportar PDF** — genera un PDF (pdfmake) con KPIs, gráficos (capturados de los `<canvas>`) y tablas.
- **WhatsApp** — envía el primer gráfico como imagen + un caption con los KPIs, vía Evolution API (reutiliza el destino de cierre de caja `PdvConfig.whatsappCierreCajaDestino`).

## Dinero (resumen)

- Ventas: `pagos_detalles` → `SUM(PAGO) − SUM(VUELTO)` con conversión multi-moneda (`monedas_cambio.compraLocal`). **No** se usa `ventas.total`.
- Finanzas: `cajas_mayor_movimientos.monto` clasificado por tipo (ingreso/egreso), excluyendo anulaciones y sus originales.
- Las **series por fecha** se suman por **ventana de rango local** (día o semana), no con `GROUP BY` por fecha extraída en SQL — así reconcilian con los KPIs y se evita el desfase UTC/local (los datetime se guardan en UTC).

## Backend

- Handler: `electron/handlers/reportes.handler.ts` → canales `get-reporte-ventas-cierre`, `get-reporte-finanzas-cierre`, `enviar-reporte-whatsapp`.
- Helpers: `reportes-periodo.util.ts`, `reportes-ventas.helper.ts`, `reportes-finanzas.helper.ts`.
- Reutiliza helpers exportados de `dashboard-ventas.handler.ts`.

## Tests

```bash
npm run test:reportes-periodo   # unit: resolución de períodos (sin DB)
npm run test:reporte-ventas     # e2e SQLite: KPIs, series, mix, combinaciones, comparativo
npm run test:reporte-finanzas   # e2e SQLite: KPIs, anulaciones, aging, POS, vencimientos, flujo
```

## Versión mobile (PWA)

El mismo hub está disponible en la **PWA mobile** (`projects/mobile/src/app/pages/reportes/`), con nav propio y las 2 pantallas (`/reportes/ventas`, `/reportes/finanzas`). No necesitó backend nuevo: reusa los mismos handlers por `/api/rpc`. UI mobile-first (tarjetas + progress bars) con gráficos clave en ng2-charts (tendencia/mix en Ventas; flujo/composición en Finanzas); el heatmap se muestra como lista y la ingeniería de menú se omite. Incluye export PDF, WhatsApp y pantalla completa. Validar con `npx ng build mobile`.

## Pendiente

- **Modo client (HTTP) del desktop:** los 3 métodos aún lanzan "no implementado" en `repository-http.service.ts` (el mobile no lo usa; va por el shim).
- **Export a Excel** (hoy solo PDF).
- **Ranking de meseros:** se calcula en el backend pero todavía no se muestra en el frontend.
