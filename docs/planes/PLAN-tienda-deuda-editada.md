# PLAN tienda online — la deuda de una venta a cuenta sigue al total

Rama: `bot/ceo-frc-gourmet/feat-tienda-deuda-editada`, sale de `feat-tienda-pagos-multi`.
Nada se mergea sin el OK del propietario.

## Por qué

Pendiente de la auditoría de F8b fase 2: un pedido web «A cuenta» deja, al aceptarse, una venta
ABIERTA con un pago CREDITO por el total y una CPC de una cuota. Si después el local agrega o
quita ítems, cambia el envío o pone un descuento, la deuda quedaba por el total viejo. Decisión del
propietario (2026-11-09): **recalcular la deuda** (cuota, saldo, movimiento) y **bloquear si ya
tiene cobros**; al subir, **respetar el tope** del cliente.

## Reglas

- Solo ventas **ABIERTAS** con una CPC **ACTIVA** (`cuentas_por_cobrar.venta_id`). La venta a
  crédito del PdV queda CONCLUIDA al cobrarse: no entra.
- **Con cobros** (`cpc.monto_cobrado > 0`) los cambios de ítems y de envío se rechazan con
  `VENTA_A_CUENTA_CON_COBROS` antes de tocar nada. Corregir una deuda cobrada en parte es trabajo
  de caja, a mano.
- **Deuda nueva** = ítems activos + envío − descuentos + aumentos − pagos por otros medios en la
  misma moneda (lo que el cliente ya pagó en efectivo al entregar no va a la cuenta).
- **Sube:** hasta lo disponible del cliente (límite − saldo − reservas web). Lo que pase del tope
  queda como saldo de la venta y se cobra al entregar, como cualquier saldo (queda en el log).
- **Baja:** baja. **En cero** (sin ítems activos) la CPC se cancela, sus cuotas también y el pago
  CREDITO se da de baja. Si después se vuelven a agregar ítems, no se recrea: se cobran al entregar.
- Se reescriben `monto_total` de la CPC, el `monto` de sus cuotas (repartido como al crearla), el
  `valor` del pago CREDITO, un `MovimientoCliente` AJUSTE_POSITIVO/NEGATIVO por la diferencia y el
  saldo del cliente (atómico). `recalcular-saldo-cliente` sigue cerrando.
- Idempotente: sin diferencia no escribe. Con el lock del cliente (`withClienteLock` + FOR UPDATE
  en Postgres), como la deuda al aceptar.

## Dónde (`electron/utils/deuda-venta.utils.ts`)

| Puerta | Bloqueo con cobros | Recalcula |
|---|---|---|
| `createVentaItem` / `updateVentaItem` / `deleteVentaItem` (incluye cancelar un ítem, adicionales y descuento por ítem, que pasan por `updateVentaItem`) | sí | sí |
| `delivery-actualizar-datos` (zona → costo) y `delivery-convertir-modo` | sí | sí |
| `createPagoDetalle` / `updatePagoDetalle` / `deletePagoDetalle` (descuento, aumento, pago por otro medio) | no (es el cobro en caja) | sí |

Sin cambios: observaciones, sabores e ingredientes (no tienen precio); `transferir-venta-pdv` ya
rechaza un origen con CPC activa y una venta web no tiene mesa ni comanda para ser destino.

Si recalcular falla, el cambio ya hecho no se revierte: queda en el log y el PdV muestra la
diferencia como saldo.

## Pruebas

`test:tienda-credito` (SQLite y PG), sección [6]: sube, tope, baja con descuento, sin cambio no
escribe, en cero se cancela, saldo recalculado igual, con cobros no se edita ni se borra.
