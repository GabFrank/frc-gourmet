# Checklist de pruebas — Delivery y retiro en los informes de venta

> Branch `claude/sales-reports-delivery-ihwnbi`. Cubre lo agregado en las fases
> 0–5 del plan `docs/planes/PLAN-INFORMES-DELIVERY.md`.
>
> **Requiere reiniciar la app**: hay cambios en `electron/handlers/`,
> `electron/utils/` y una migración nueva.

## 0 · Preparación

1. Arrancar la app. En el log de arranque tiene que correr la migración
   `BackfillZonaDeliveryPedidosOnline1787877249492` (una sola vez).
2. Tener al menos **dos zonas de entrega** cargadas (*Ventas → Precios de
   delivery*) con tarifas distintas.
3. Tener al menos **un funcionario activo** que pueda ser repartidor.
4. En *Configuración del PdV*, anotar los valores de **Tiempo amarillo** y
   **Tiempo rojo** de delivery — se usan en el paso 5.

## 1 · Zona del pedido online (fase 0)

| # | Paso | Esperado |
|---|---|---|
| 1.1 | Desde la tienda online, hacer un pedido **DELIVERY** eligiendo una dirección que caiga en una zona con tarifa compartida. Aceptarlo desde la bandeja del PdV. | El delivery aparece en la lista del PdV **con su zona**, no vacía. |
| 1.2 | Verificar el costo de envío cobrado. | Es el que vio el cliente en el checkout, **no** la tarifa actual de la zona si alguien la cambió en el medio. |
| 1.3 | Hacer un pedido **PICKUP** desde la tienda y aceptarlo. | Entra como **RETIRO**, sin zona y sin costo de envío. |
| 1.4 | Si la instalación ya tenía pedidos web viejos: abrir *Reportes → Ventas* con un período que los incluya. | En "Envíos por zona" ya **no** están todos agrupados bajo `SIN ZONA`. |

## 2 · Reporte de Ventas — KPIs (fase 2)

| # | Paso | Esperado |
|---|---|---|
| 2.1 | Abrir *Reportes → Ventas* con un período que tenga repartos. | Debajo de la fila de 5 KPIs aparece una **segunda fila de 4**: Envíos, Retiros, Ingreso por envíos, Ticket prom. delivery. |
| 2.2 | Con "comparar" activo. | Cada uno muestra su variación vs el período anterior. |
| 2.3 | Sumar a mano los envíos y retiros del período en la lista del PdV. | Coinciden con los KPIs. **Un delivery cancelado NO cuenta.** |
| 2.4 | Elegir un período **sin ningún reparto**. | La fila de KPIs de delivery y las cinco tarjetas **desaparecen**; el resto de la pantalla queda igual. |

## 3 · Mix por canal

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Mirar la tarjeta "Mix por canal de venta". | Cuatro filas: SALÓN, MOSTRADOR, DELIVERY, RETIRO — **también las que están en cero**. |
| 3.2 | Sumar la columna Facturación de las cuatro. | Da exactamente el KPI **Facturación** de arriba. Este es el chequeo más importante de la pantalla. |
| 3.3 | Mirar el pie de la tarjeta. | Dice cuántos repartos fueron con cobro anticipado y cuántos contra entrega, y cuántos entraron por WEB vs los que cargó el cajero. |

## 4 · Envíos por zona y repartidores

| # | Paso | Esperado |
|---|---|---|
| 4.1 | Contar los envíos de una zona en la lista del PdV. | Coincide con la fila de esa zona en la tabla. |
| 4.2 | Mirar la columna "Envío cobrado". | Es la suma de lo que se cobró de envío en esa zona, no la tarifa × cantidad (si alguien cambió la tarifa, los viejos conservan su monto). |
| 4.3 | Buscar la fila `SIN ZONA`. | Sólo aparece si hay repartos sin zona asignada. **Los retiros no figuran acá**: no tienen zona. |
| 4.4 | Zona cuyos envíos aún no se entregaron. | "Tiempo prom." muestra `—`, **no** `0`. |
| 4.5 | Tarjeta "Repartidores". | Los repartos sin repartidor asignado se agrupan bajo `SIN REPARTIDOR`. |

## 5 · Tiempos de entrega y SLA

| # | Paso | Esperado |
|---|---|---|
| 5.1 | Mirar los tres chips de SLA. | Los minutos que dicen las etiquetas son los de *Configuración del PdV* (paso 0.4), no valores fijos. |
| 5.2 | Sumar los tres chips. | Da la cantidad que dice la leyenda ("Sobre N envíos entregados"). |
| 5.3 | Un delivery que pasó de ABIERTO directo a EN_CAMINO (sin PARA_ENTREGA). | La barra "DESPACHO" **no** lo cuenta como 0 minutos; su etapa simplemente no existe. |
| 5.4 | Período sin ningún envío entregado. | La tarjeta dice "Ningún envío llegó a entregarse en el período" en vez de mostrar ceros. |

## 6 · Cancelaciones

| # | Paso | Esperado |
|---|---|---|
| 6.1 | Cancelar un delivery con un motivo. Recargar el reporte. | Aparece en la tarjeta de cancelaciones con ese motivo. |
| 6.2 | Verificar el resto de la pantalla. | Ese reparto **no** suma en envíos, ni en su zona, ni en su repartidor, ni en la facturación de delivery. |
| 6.3 | "No facturados". | Es el total de los ítems que tenía la venta cancelada. |

## 7 · Tendencia y horas pico

| # | Paso | Esperado |
|---|---|---|
| 7.1 | Mirar el gráfico de tendencia. | Hay una tercera línea "Delivery", **sólo si hubo repartos** en el período. |
| 7.2 | Comparar la línea Delivery con la línea Actual. | La de delivery nunca está por encima: es un subconjunto. |
| 7.3 | En "Horas pico", tocar **Solo delivery**. | El heatmap cambia y muestra la curva del reparto, que típicamente se estira más tarde que la del salón. |
| 7.4 | Volver a **Todos**. | Vuelve el heatmap general. |

## 8 · Export

| # | Paso | Esperado |
|---|---|---|
| 8.1 | Botón **Exportar PDF**. | El PDF trae **los 9 KPIs** (los 5 generales + los 4 de delivery) y una tabla "Envíos por zona". |
| 8.2 | Botón **WhatsApp**. | El caption incluye los KPIs de delivery. |
| 8.3 | Botón **Presentar**. | Las tarjetas nuevas se ven bien en pantalla completa. |

## 9 · Dashboard y resumen PWA (fase 3)

| # | Paso | Esperado |
|---|---|---|
| 9.1 | Abrir el dashboard de Ventas con la caja abierta. | Segunda fila de chips: Envíos, Retiros, En camino ahora, Cobrado en envíos. |
| 9.2 | Poner un delivery EN_CAMINO y refrescar. | "En camino ahora" sube y se pinta en **amarillo**. |
| 9.3 | Cambiar el filtro de período. | Envíos / Retiros / Cobrado siguen el filtro; **"En camino ahora" NO cambia** — es estado del momento. |
| 9.4 | En la PWA, *Ventas → Resumen*. | Las mismas cuatro tarjetas, con "En camino" resaltado si hay pedidos en la calle. |
| 9.5 | Local sin repartos y sin nada en camino. | La fila entera no se muestra, en las dos pantallas. |

## 10 · Cierre de caja (fase 4)

| # | Paso | Esperado |
|---|---|---|
| 10.1 | Abrir el resumen de una caja con repartos. | Card **DELIVERY** con envíos, retiros, cancelados, cobro anticipado y cobrado en envíos. |
| 10.2 | Cerrar la caja dejando un delivery sin entregar. | El resumen muestra "Sin entregar al cierre: N". |
| 10.3 | Imprimir el ticket de cierre. | Bloque `DELIVERY` entre las ventas y el arqueo, y si hay pendientes: `ATENCION: N SIN ENTREGAR`. |
| 10.4 | Enviar el cierre por WhatsApp. | La imagen incluye la sección Delivery. |
| 10.5 | Comparar el arqueo con el de antes del cambio. | **Los números del arqueo no cambian**: el bloque de delivery es informativo, el cobro del envío ya estaba contado en las ventas por forma de pago. |

## 11 · Historial de ventas (fase 4)

| # | Paso | Esperado |
|---|---|---|
| 11.1 | Abrir *Ventas → Historial*. | Columna **CANAL** con chip SALÓN / MOSTRADOR / DELIVERY / RETIRO. |
| 11.2 | Una venta que entró por la tienda online. | Además del canal, un chip **WEB**. Las ventas del cajero **no** muestran chip de origen. |
| 11.3 | Una fila de delivery. | Debajo del chip, la zona; si no tiene zona, el repartidor. |
| 11.4 | Filtros avanzados → **Canal = DELIVERY**. | Sólo repartos (incluye los cancelados). |
| 11.5 | Filtrar por **Zona** y por **Repartidor**. | Acotan como corresponde. |
| 11.6 | Combinar **Canal = DELIVERY** + **Origen = WEB**. | Se combinan con AND. Con una combinación imposible (Canal = SALÓN + Origen = WEB) el resultado es **vacío**, no "todo". |
| 11.7 | Con un filtro que dé más de una página, mirar la fila de totales. | "Cobrado en envíos" es de **todo el filtro**, no de la página; cambiar de página no lo mueve. |
| 11.8 | Botón Reset. | Se limpian también los cuatro filtros nuevos y el contador del badge vuelve a cero. |

## 12 · Reportes mobile (fase 5)

| # | Paso | Esperado |
|---|---|---|
| 12.1 | En la PWA, *Reportes → Ventas*. | Fila de 4 KPIs de delivery. |
| 12.2 | Bajar por la pantalla. | Mix por canal (dona), Envíos por zona, Repartidores, Tiempos de entrega (chips) y Cancelaciones. |
| 12.3 | Exportar PDF desde la PWA. | Incluye los KPIs de delivery. |
| 12.4 | Local sin repartos. | Las secciones no aparecen. |

## 13 · Multimoneda y Postgres

| # | Paso | Esperado |
|---|---|---|
| 13.1 | Cobrar un delivery en **USD** con cotización cargada. | Su facturación aparece convertida a Gs en el mix por canal y en el ranking de zonas. |
| 13.2 | Sin cotización cargada para esa moneda. | Ese cobro aporta 0 (no rompe la pantalla ni muestra `NaN`). |
| 13.3 | **En una instalación Postgres**, repetir 2.1, 3.2, 10.1 y 11.7. | Los montos son números, nunca `NaN` ni cifras concatenadas. |

## Tests automáticos

```bash
npm run test:reporte-delivery      # 77 asserts — motor + integración + filtros del historial
npm run test:canal-venta           # 25 — el CASE de SQL y el clasificador TS coinciden
npm run test:zona-delivery-online  # 11 — fase 0 (alta + backfill)
npm run test:reporte-ventas        # 21 — regresión del reporte
npm run test:resumen-caja-numeros  # 8  — el arqueo no cambió
npm run test:mobile                # 131 — unit de la PWA (necesita CHROME_BIN)
npm run check                      # AOT de producción
npx ng build mobile                # build de la PWA
```
