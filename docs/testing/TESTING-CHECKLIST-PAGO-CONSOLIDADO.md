# Manual de pruebas — Pago consolidado desde Caja Mayor

Qué se cambió: el pago de compras, gastos, vales y salarios dejó de vivir en el
diálogo de alta de cada uno y pasó a un único wizard en Caja Mayor, que permite
saldar **varias** obligaciones con **varias** formas de pago en un solo egreso.

Requisitos previos: una caja mayor ABIERTA con saldo en efectivo, al menos una
cuenta bancaria activa, y una cotización cargada para probar multi-moneda
(*Financiero → Monedas → Cotizaciones*).

> Reiniciar la app antes de empezar: hay handlers nuevos y una migración.

---

## 1. Las altas ya no cobran

| # | Paso | Esperado |
|---|---|---|
| 1.1 | Caja Mayor → Egreso → **Gasto**. Cargar categoría, descripción, moneda y monto. Guardar. | El diálogo **no** muestra "Caja Mayor / Cuenta bancaria" ni forma de pago. Avisa que queda pendiente. |
| 1.2 | Ir a la lista de gastos | El gasto figura en estado **PENDIENTE**. El saldo de la caja **no** cambió. |
| 1.3 | Caja Mayor → Egreso → **Compra Simplificada**. Cargar proveedor, monto, contado. Guardar. | No hay checkbox "Pagar ahora" ni "Pago mixto". Avisa que la cuota queda pendiente. |
| 1.4 | Caja Mayor → Egreso → **Registrar Vale** | Crea el vale en **SOLICITADO**, sin mover la caja. |

## 2. Pago de varios gastos en un solo egreso

| # | Paso | Esperado |
|---|---|---|
| 2.1 | Anotar el saldo actual de la caja (sidebar) | — |
| 2.2 | Egreso → **Pagar Gastos** | Lista los gastos PENDIENTE. Sin pendientes, muestra el vacío. |
| 2.3 | Tildar dos gastos de la **misma** moneda | El total del encabezado suma los dos. "Siguiente" se habilita. |
| 2.4 | Intentar tildar un gasto de **otra** moneda | Queda deshabilitado (no se pueden mezclar monedas). |
| 2.5 | Paso 2: agregar una línea Efectivo por el total | Aparece el check verde y "Revisar" se habilita. |
| 2.6 | Paso 3 → **Confirmar pago** | Mensaje de éxito y se cierra. |
| 2.7 | Mirar la tabla de movimientos | **UN** solo movimiento, no dos. Observación: "PAGO CONSOLIDADO DE 2 GASTOS". |
| 2.8 | Verificar el saldo | Bajó exactamente el total pagado. |
| 2.9 | Lista de gastos | Los dos quedaron **PAGADO**. |

## 3. El detalle del movimiento

| # | Paso | Esperado |
|---|---|---|
| 3.1 | En la fila del movimiento: menú ⋮ → **Ver detalle del pago** | Abre el diálogo con los 2 gastos, su beneficiario y lo imputado a cada uno. |
| 3.2 | Revisar el bloque "Formas de pago" | Muestra de dónde salió la plata. |
| 3.3 | En el mismo menú ⋮, elegir **Anular** | **Rechaza** con un mensaje que manda a anular el pago desde su detalle. |

## 4. Multi-moneda

| # | Paso | Esperado |
|---|---|---|
| 4.1 | Pagar un gasto en guaraníes con **dos** líneas: una en Gs y otra en USD | Al elegir USD aparece el campo **Cotización**, precargado. |
| 4.2 | Ajustar los montos hasta que el check quede verde | El total convertido cuadra con la deuda. |
| 4.3 | Confirmar y mirar los movimientos | **Dos** movimientos (uno por moneda), agrupados en **una** fila de la tabla. |
| 4.4 | Verificar los saldos por moneda | Cada moneda bajó en SU moneda; no hubo conversión del saldo. |
| 4.5 | Probar al revés: un gasto en USD pagado con guaraníes | Funciona. (Antes fallaba: sólo existe la cotización USD→Gs y ahora se invierte sola.) |

## 5. Pago parcial (sólo compras)

| # | Paso | Esperado |
|---|---|---|
| 5.1 | Egreso → **Pagar Compras**, tildar una cuota | La columna "Monto a pagar" es **editable**. |
| 5.2 | Bajar el monto a la mitad y pagar | La cuota queda **PARCIAL** con ese monto pagado. |
| 5.3 | Repetir con **Pagar Gastos** | El monto **no** es editable: un gasto se paga entero. |
| 5.4 | En Pagar Compras, tildar cuotas de **dos proveedores distintos** | El segundo queda deshabilitado: un pago cubre un solo proveedor. |

## 6. Vales y salarios

| # | Paso | Esperado |
|---|---|---|
| 6.1 | Egreso → **Pagar Vales**, tildar dos vales, pagar | Los dos quedan **CONFIRMADO** con un solo movimiento. |
| 6.2 | RRHH → Vales, menú de un vale SOLICITADO → **Pagar** | Abre el wizard con ese vale ya tildado. |
| 6.3 | Intentar **anular** un vale ya pagado por el evento | Rechaza y manda a anular el pago consolidado. |
| 6.4 | Egreso → **Pagar Salarios** | Lista liquidaciones APROBADAS. Al tildar una, **se destildan las demás**. |
| 6.5 | RRHH → Liquidación aprobada → botón **Pagar** | Abre el wizard con esa liquidación preseleccionada. |
| 6.6 | Pagar y revisar el funcionario | La liquidación queda PAGADA y sus vales descontados, igual que antes. |

## 7. Anulación

| # | Paso | Esperado |
|---|---|---|
| 7.1 | Abrir el detalle de un pago y **Anular pago** | Pide confirmación diciendo cuántos movimientos y obligaciones toca. |
| 7.2 | Confirmar y verificar el saldo | Vuelve **exactamente** al valor previo al pago. |
| 7.3 | Verificar las obligaciones | Vuelven a PENDIENTE / SOLICITADO / la cuota reabre su saldo. |
| 7.4 | Ver la tabla con "Ver anulaciones" | Aparecen los contra-movimientos. |
| 7.5 | Intentar anular el mismo pago otra vez | Rechaza: ya está anulado. |
| 7.6 | Anular ahora el gasto desde su lista | **Ahora sí** se puede: el bloqueo se libera al anular el evento. |

## 8. Saldo negativo

| # | Paso | Esperado |
|---|---|---|
| 8.1 | Pagar por un monto mayor al saldo de la caja | Pide confirmación mostrando cómo quedaría el saldo. |
| 8.2 | Aceptar | El pago se registra y el saldo queda negativo (es una decisión, no un bloqueo). |

## 9. Que no rompimos el mobile

| # | Paso | Esperado |
|---|---|---|
| 9.1 | En la PWA: Caja Mayor → Nuevo gasto, con caja y forma de pago | Sigue asentando el egreso **al instante**, como siempre. El gasto queda PAGADO. |
| 9.2 | En la PWA: Vales → Confirmar | Sigue funcionando igual. |
| 9.3 | En la PWA: pago de cuota de compra | Sigue funcionando igual. |

## 10. Reportes

| # | Paso | Esperado |
|---|---|---|
| 10.1 | Con un gasto PENDIENTE sin pagar, abrir Reportes → Finanzas | El gasto **no** aparece en "Gastos por categoría" (no salió de la caja). |
| 10.2 | Pagarlo y refrescar | Ahora sí aparece, y cuadra con el flujo de caja. |
