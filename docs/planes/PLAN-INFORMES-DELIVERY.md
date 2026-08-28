# Plan — Delivery y Retiro en los informes de venta

> Branch: `claude/sales-reports-delivery-ihwnbi` · base `develop`
> Estado: **propuesto, pendiente de aprobación**

## 1. Diagnóstico

El módulo de delivery está completo y auditado (sesión 2026-08-24), pero **la capa
de informes no lo conoce**. Verificado por grep sobre `electron/handlers/reportes*.ts`,
`dashboard-ventas.handler.ts` y `resumen-caja.utils.ts`: **cero menciones a
delivery, `canal_origen`, `costo_delivery` o zona**.

Consecuencias concretas hoy:

| Pregunta del negocio | Respuesta hoy |
|---|---|
| ¿Cuántos envíos hicimos este mes? | No hay dónde verlo |
| ¿Cuánto recaudamos por costo de envío? | Está fundido dentro de "Facturación" |
| ¿Qué zona pide más? | Sólo contando a mano en el diálogo del PdV |
| ¿Qué repartidor entregó más? | No existe |
| ¿Cuánto tardamos en entregar? | Los 4 timestamps existen pero nadie los lee |
| ¿Cuánto pesa el delivery vs el salón? | No se puede separar |
| ¿Cuántos deliveries se cancelan y por qué? | `motivo_cancelacion` se guarda y nunca se lee |

Los datos **ya están en la base**, no hace falta capturar nada nuevo:

- `deliveries`: `modo` (DELIVERY/RETIRO), `estado`, `precio_delivery_id` (zona),
  `entregado_por_funcionario_id`, `cobro_anticipado`, `motivo_cancelacion` y los
  timestamps `fecha_abierto` / `fecha_para_entrega` / `fecha_en_camino` /
  `fecha_entregado` / `fecha_cancelacion`.
- `ventas`: `delivery_id`, `costo_delivery` (monto congelado), `canal_origen`
  (LOCAL / WEB / QR_MESA).
- `precios_delivery.descripcion` = nombre de la zona; `zonas_delivery` (tienda
  online) apunta al mismo `precio_delivery_id`.

### Hallazgo bloqueante para "envíos por zona"

`materializar-pedido-online-en-venta` (`ventas.handler.ts:295`) crea el `Delivery`
**sin `precioDeliveryId`**: pasa el costo ya congelado pero no la zona. La zona del
pedido web vive sólo en `pedidos_online.zona_delivery_id`.

Resultado: si agrupamos por `delivery.precio_delivery_id`, **todo pedido de la
tienda online cae en "SIN ZONA"**. Es un bug de datos, no de reporte: hay que
arreglar el alta y backfillear, o el gráfico de zonas nace mintiendo. Se trata en
la Fase 0.

## 2. Qué se agrega

### 2.1 Métrica base: canal de venta

Se define una clasificación única, calculada en un solo lugar y reusada por todas
las pantallas:

- **SALÓN** — venta con mesa, sin delivery.
- **MOSTRADOR** — sin mesa y sin delivery.
- **DELIVERY** — `delivery.modo = DELIVERY`.
- **RETIRO** — `delivery.modo = RETIRO`.

Cruzada con `venta.canal_origen` (LOCAL / WEB / QR_MESA) para distinguir el
delivery que cargó el cajero del que entró por la tienda online.

### 2.2 Reportes · Ventas — Cierre de Mes (pantalla existente)

**KPIs nuevos** (con su variación vs período anterior, como los actuales):

1. **Envíos** — deliveries entregados en el período.
2. **Retiros** — pedidos que el cliente pasó a buscar.
3. **Ingreso por envíos** — `SUM(ventas.costo_delivery)`. Hoy está sumado dentro
   de Facturación sin poder separarse.
4. **Ticket promedio delivery** — comparable contra el ticket promedio general.

**Secciones nuevas** (5 tarjetas, insertadas antes de "Combinaciones"):

| Tarjeta | Contenido |
|---|---|
| **Mix por canal** | Dona SALÓN / MOSTRADOR / DELIVERY / RETIRO: facturación, tickets, ticket promedio y % de cada uno. Es la respuesta a "cuánto pesa el delivery". |
| **Envíos por zona** | Barras + tabla: cantidad de envíos, facturación, ticket promedio, costo de envío recaudado y tiempo promedio de entrega por zona. Ordenado por cantidad. |
| **Repartidores** | Ranking: entregas, monto entregado, envíos recaudados y minutos promedio en calle. Reusa `<app-dash-ranking>`. |
| **Tiempos de entrega (SLA)** | Promedio y mediana de cada etapa (preparación → despacho → calle → total) + semáforo verde/amarillo/rojo contra `PdvConfig.deliveryTiempoAmarillo` / `deliveryTiempoRojo`, que hoy sólo colorean la lista del PdV y nunca se agregan. |
| **Cancelaciones** | Tasa de cancelación de delivery, cantidad, monto perdido y top de motivos (`motivo_cancelacion`). |

**Extras de la misma pantalla, sin tarjeta nueva:**

- La **tendencia** gana una serie opcional "sólo delivery" (toggle), para ver si
  el canal crece o se estanca.
- Las **horas pico** ganan un selector de canal: la curva del delivery no es la
  del salón y hoy están mezcladas.
- **Cobro anticipado vs contra entrega**: dos números en la tarjeta de canal.

Todo entra automáticamente al **PDF** y al **caption de WhatsApp** porque los dos
leen los KPIs y los `[data-rep-titulo]` de la pantalla.

### 2.3 Dashboard de Ventas (desktop) y Resumen de Ventas (PWA)

Cuatro stat-chips nuevas, en vivo, con el mismo filtro de período/cajas que ya
tienen: **Envíos hoy**, **Retiros hoy**, **En camino ahora** y **Recaudado en
envíos**. "En camino ahora" es operativo: dice cuántos pedidos están en la calle
sin cerrar.

### 2.4 Resumen y ticket de cierre de caja

Bloque **DELIVERY** nuevo en `computeResumenCaja` — o sea que aparece de una vez
en los tres consumidores: el diálogo de resumen, el ticket impreso de cierre y la
imagen que se manda por WhatsApp.

```
--------------------------------
           DELIVERY
ENVIOS ENTREGADOS            12
RETIROS                       4
CANCELADOS                    1
COBRO DE ENVIOS       Gs 180.000
COBRO ANTICIPADO              5
```

El cajero cierra el turno sabiendo cuántos envíos salieron y cuánto entró por
ellos; hoy el costo de envío se cobra pero no se rinde en ninguna línea propia.

### 2.5 Historial de ventas (lista)

- Columna **Canal** con chip (SALÓN / MOSTRADOR / DELIVERY / RETIRO + origen WEB).
- Filtros avanzados nuevos: **canal**, **zona de entrega** y **repartidor**.
- Fila de totales del resultado filtrado, con el costo de envío desglosado.

### 2.6 Reportes mobile (PWA)

Los mismos KPIs y, de las tarjetas, las que rinden en pantalla chica: mix por
canal (dona), zonas (barras) y repartidores (ranking). SLA y cancelaciones como
lista compacta. **No requiere backend nuevo** — reusa los mismos canales vía
`/api/rpc`, igual que el resto del hub mobile.

## 3. Fases

Cada fase cierra con commit + push. Todo va a **un solo PR** contra `develop`.

### Fase 0 — Zona del pedido online (corrección de datos)

- `materializar-pedido-online-en-venta` pasa
  `precioDeliveryId: pedido.zonaDelivery?.precioDelivery?.id ?? null` a
  `crearDeliveryEnTx`. El **costo sigue viniendo congelado del pedido** — se
  arregla la trazabilidad de la zona, no el precio.
- Migración **aditiva y driver-aware** que backfillea
  `deliveries.precio_delivery_id` desde `pedidos_online` para las filas que hoy
  quedaron sin zona.
- Sin esto, "Envíos por zona" muestra todo lo web como SIN ZONA.

### Fase 1 — Motor de métricas (backend)

- **`electron/handlers/reportes-delivery.helper.ts`** — nuevo. Funciones:
  `kpisDelivery`, `mixPorCanal`, `enviosPorZona`, `rankingRepartidores`,
  `tiemposEntrega`, `cancelacionesDelivery`.
- **`electron/utils/canal-venta.utils.ts`** — nuevo. Fuente única de la
  clasificación de canal: fragmento SQL + enum compartido con el renderer, para
  que la lista, el reporte y el dashboard no puedan clasificar distinto.
- `construirReporteVentasCierre` incorpora el bloque `delivery` al payload.
- `get-dashboard-ventas-kpis` incorpora las 4 chips, respetando el filtro
  `{rango, desde, hasta, cajaIds}` que ya acepta.
- `computeResumenCaja` incorpora el bloque delivery.
- `getVentasByDateRange` acepta `canal`, `zonaId` y `repartidorId`, y devuelve
  los totales del resultado.

**Reglas que se respetan** (aprendidas de los bugs ya documentados):

- **Plata**: nunca `ventas.total`. Sale de `pagos_detalles` (`PAGO − VUELTO`,
  `pd.activo`) convertido a la principal con `getCotizacionMap`. El costo de
  envío es la excepción explícita: es `ventas.costo_delivery`, monto congelado.
- **`Number()` en todo decimal** — en Postgres llegan como string y `+=`
  concatena. Es el bug que imprimió `NaN` en el arqueo.
- **Series por rango local**, nunca `GROUP BY` de fecha extraída en SQL. Las
  distribuciones (día de semana, hora) sí usan `EXTRACT`/`strftime`, igual
  criterio que hoy.
- **Jornada comercial**: todo pasa por `resolverPeriodo(params, now, inicioJornada)`.
- **Driver-aware**: cada expresión de fecha ramifica por
  `connection.options.type === 'postgres'`.
- Los handlers nuevos son de **sólo lectura** → sin `ensurePermission` propio;
  cuelgan de los canales existentes, que ya validan `VENTAS_REPORTES_VER` /
  `VENTAS_DASHBOARD_VER`. **No se crean permisos nuevos.**
- Las métricas cuentan **ventas CONCLUIDAS**, salvo la tarjeta de cancelaciones,
  que por definición mira las canceladas.

### Fase 2 — Reportes · Ventas (desktop)

KPIs + 5 tarjetas + toggles de tendencia y horas pico. Padrón de dashboards
obligatorio (`<app-dash-*>`, `_dashboard.scss`, `getDashboardChartOptions()`),
sin funciones ni getters en template, sin colores hardcodeados, `| number:'1.0-2'`.

### Fase 3 — Dashboard desktop + PWA resumen

Las 4 stat-chips en las dos pantallas.

### Fase 4 — Cierre de caja + Historial de ventas

Bloque DELIVERY en el resumen/ticket/imagen WhatsApp; columna Canal, filtros y
totales en el historial.

### Fase 5 — Reportes mobile

Mismos canales vía `/api/rpc`. Regenerar el api-map
(`npm run generate:mobile-api`) sólo si aparece un canal nuevo.

### Fase 6 — Cierre

Auditoría por agentes, batería de tests, `npm run check` (AOT), documentación,
skill y backlog, PR a `develop`, CI en verde.

## 4. Tests

| Script | Qué cubre |
|---|---|
| `npm run test:reporte-delivery` (nuevo, e2e SQLite) | KPIs de envíos/retiros, mix por canal, zonas, repartidores, SLA, cancelaciones, multimoneda, exclusión de anuladas, comparativo. Incluye el caso de regresión de la Fase 0: pedido web con zona → **no** cae en SIN ZONA. |
| `npm run test:canal-venta` (nuevo, unit) | Clasificación de canal para las 6 combinaciones (mesa, mostrador, delivery, retiro, web, QR mesa). |
| `npm run test:resumen-caja-numeros` (existente, se amplía) | El bloque delivery del cierre no rompe el arqueo ni concatena decimales en Postgres. |
| `npm run test:reporte-ventas` (existente, se amplía) | El payload nuevo no altera los KPIs que ya se calculaban. |
| `npm run test:delivery`, `test:kpis-filtros`, `test:reportes-periodo`, `test:mobile` | Regresión. |

Manual: `docs/testing/TESTING-CHECKLIST-INFORMES-DELIVERY.md`.

## 5. Fuera de alcance

- **Mapa de zonas con polígonos Leaflet** — decidido: no por ahora. Sólo cubriría
  las zonas de la tienda online (las del PdV no tienen polígono) y el canvas del
  mapa no se captura bien en el export a PDF. Barras + tabla cubren la pregunta.
- **Pantalla "Reportes · Delivery" aparte** — descartada: duplicaría control de
  período, export y PDF, y partiría el análisis en dos pantallas.
- **Costo del reparto / rentabilidad por envío** — requeriría cargar lo que se le
  paga al repartidor. No hay entidad para eso todavía; queda para el backlog.
- **Modo client (HTTP)** — los 3 canales de reportes ya lanzan "no implementado"
  en `repository-http.service.ts`. Este plan no cambia esa deuda preexistente.

## 6. Archivos afectados

**Nuevos**
```
electron/handlers/reportes-delivery.helper.ts
electron/utils/canal-venta.utils.ts
src/app/database/migrations/<epoch-ms>-BackfillZonaDeliveryPedidosOnline.ts
scripts/test-reporte-delivery-e2e.ts
scripts/test-canal-venta.ts
docs/testing/TESTING-CHECKLIST-INFORMES-DELIVERY.md
```

**Modificados**
```
electron/handlers/reportes-ventas.helper.ts
electron/handlers/dashboard-ventas.handler.ts
electron/handlers/ventas.handler.ts            (materialización + getVentasByDateRange)
electron/utils/resumen-caja.utils.ts
electron/handlers/documentos-tickets.handler.ts
electron/utils/resumen-caja-imagen.util.ts
src/app/pages/reportes/ventas-reportes/*
src/app/pages/ventas/dashboard/*
src/app/pages/ventas/historial/*
src/app/shared/components/filtros-ventas-dialog/*
src/app/shared/components/resumen-caja-dialog/*
projects/mobile/src/app/pages/reportes/ventas/*
projects/mobile/src/app/pages/ventas/resumen/*
package.json                                    (2 scripts de test)
```

Doc de dominio: `domains/reportes.md`, `domains/dashboards.md`,
`domains/ventas-pdv.md` (sección Delivery) + backlog.
