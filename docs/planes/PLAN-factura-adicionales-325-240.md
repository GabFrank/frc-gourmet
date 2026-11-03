# PLAN #325 + #240: la factura sale por lo mismo que cobra la caja, y el servidor lo verifica

Rama `fix/factura-adicionales-325-240`, desde `origin/develop` (`d3ea0dc9`). Un solo PR.
Bloquea encender `personalizar_sabores` en la tienda (cadena F1→F6b): con la
personalización por sabor, las pizzas con adicionales pasan a ser lo normal.

Auditorías del plan: `AUDIT-PLAN-factura-325-240-A.md` (alcance y convenciones) y
`-B.md` (correctitud técnica). Sus hallazgos están incorporados abajo; los que se
descartaron dicen por qué.

## El problema, contra el código

**#325.** `FacturarDialogComponent.prefillFromData()`
(`src/app/pages/facturacion/facturas/facturar-dialog/facturar-dialog.component.ts:136`)
precarga cada línea con `precioVentaUnitario`. Deja afuera:

| Concepto | Dónde vive | Lo cobra la caja | Lo factura hoy |
|---|---|---|---|
| Adicionales del ítem (incluye los de cada sabor: el PdV guarda Σ adicional × proporción en `VentaItem.precioAdicionales`, `pdv.component.ts:2269-2290`; puede ser fraccionario) | `venta_items.precio_adicionales` (por unidad) | Sí | **No** |
| Descuento del ítem | `venta_items.descuento_unitario` (por unidad) | Sí | **No** |
| Costo del envío | `ventas.costo_delivery` | Sí | **No** |
| Descuento / aumento global del cobro | `pagos_detalles` `DESCUENTO`/`AUMENTO` activos; se persisten al cargarlos y **siempre en moneda principal** (`cobrar-venta-dialog.component.ts:1136-1145`) | Sí | **No** |

Caso real (issue #325): venta 8191 cobrada ₲ 112.000, factura 001-001-0008479 por ₲ 102.000.

**#240.** `create-factura` (`electron/handlers/facturacion.handler.ts:289`) ya tiene
`ensurePermission('FACTURACION_EMITIR')`, pero persiste `factura` e `items` tal como
llegan: subtotales, IVA, total, y `FacturaItem` con `ventaItem` de cualquier venta o
`CANCELADO`. Además lee el `TimbradoDetalle` **sin lock** antes de avanzar
`numeroActual`: dos emisiones simultáneas en Postgres pueden sacar el mismo número
(preexistente; se cierra acá porque la regla D3 necesita el mismo lock).

## Decisiones de Gabriel (2026-11-02)

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Envío en la factura | Sí: línea `SERVICIO DE DELIVERY`, IVA 10 |
| D2 | Descuento global del cobro | Va en `factura.descuento` y se **reparte entre las tasas** proporcional a cada base |
| D3 | Facturas por venta | **Una sola EMITIDA**; para rehacerla, anular. Se mantiene aunque exista dividir cuenta / cobro parcial |
| D4 | Facturas viejas mal emitidas | Nada |
| D5 | Cuándo se puede facturar | **En cualquier momento** (como hoy). Se valida contra el estado de la venta en ese instante; si después se carga un descuento, hay que anular y rehacer |
| D6 | Aumento del cobro | Línea `RECARGO`, IVA 10 |
| D7 | Modo cliente | Se arregla en este PR (hoy los métodos de facturación de `repository-http.service.ts` son stubs "no implementado") |

## Diseño

### Una sola regla de cálculo, compartida

1. **Total de línea de venta:** se **exporta** `computeNetoBrutoItem` desde un util
   (`electron/utils/venta-total.utils.ts`, donde ya vive `sqlTotalLineaItem`) y
   `ventas.handler.ts` la importa. No se crea otra copia.
2. **Totales de una factura a partir de sus líneas:** función pura nueva
   `calcularTotalesFactura(lineas, descuento)` en `src/app/shared/utils/factura-totales.util.ts`
   (sin dependencias de Angular, importable por electron igual que las entidades). La usan
   **el diálogo** (`recalc()`, factura manual incluida) **y el servidor** (`create-factura`),
   así nunca divergen:
   - bases brutas por tasa (10 / 5 / exenta) = Σ `cantidad × precioUnitario`;
   - `descuento` acotado a `[0, Σ bases]`; se reparte entre las **tres** bases proporcional a
     cada una; el residuo de redondeo va a la base mayor (D2);
   - `gravada10/gravada5/exenta` se guardan **netas** del descuento (son la base imponible);
     `iva10 = round(gravada10/11)`, `iva5 = round(gravada5/21)`;
   - `total = Σ bases − descuento`;
   - redondeo único `Math.round` a entero (PYG). Hoy la factura no tiene moneda en el diálogo;
     el servidor fija `moneda` = principal cuando hay venta.
   - El PDF imprime líneas brutas, el descuento y los subtotales netos que devuelve el servidor.
3. **Propuesta desde una venta:** `electron/utils/factura-venta.utils.ts`
   - pura `armarFacturaDesdeVenta({ items, costoDelivery, descuentoGlobal, aumentoGlobal })`;
   - con base `calcularFacturaDeVenta(manager, ventaId)`: lee ítems ACTIVOS (con producto,
     presentación y nombres de adicionales del ítem y de sus `VentaItemSabor`, sólo para la
     descripción), `costoDelivery` y los ajustes **igual que `getEstadoCobroVentaInternal`**
     (suma de `valor` en principal, que es como los guarda el cobro).
   - Líneas: una por ítem ACTIVO (`precioUnitario = base + adicionales − descuento`, `Number()`
     en todo, `ivaTipo = producto.iva ?? 10`, `ventaItemId`); `SERVICIO DE DELIVERY` (D1) si hay
     envío; `RECARGO` (D6) si hay aumento. `descuento` = descuento global (D2).
   - **Invariante, verificado por test:** `propuesta.total ==
     getEstadoCobroVentaInternal.deudaBruta − descuentoGlobal + aumentoGlobal`.

### Canal `get-factura-propuesta-venta(ventaId)`
Lectura, pero con `ensurePermission('FACTURACION_EMITIR')` (sólo quien puede facturar lo
necesita). Devuelve montos, descripciones e ids; no hidrata entidades ni costos. Sin cambios
en `preload.ts`: facturación usa `callIpc`.

### `create-factura` (#240)
Orden dentro del handler, **todo antes de tocar `numeroActual`**:

1. `ensurePermission` (ya está). Tolerar `data = {}` sin `TypeError`.
2. Lock: en Postgres, transacción con `SELECT … FOR UPDATE` de la venta (si hay) y del
   `TimbradoDetalle`; en SQLite (una sola conexión, `tx.utils.ts`), un **mutex de proceso**
   `withFacturaLock` como `withAperturaCajaLock`. Se descarta el índice único parcial: Don
   Franco puede tener facturas duplicadas históricas y la migración fallaría.
3. **Con venta:**
   - la venta existe;
   - no hay otra factura `EMITIDA` de esa venta (D3) → `Esta venta ya tiene la factura X; anulala para emitir otra`;
   - cada línea con `ventaItem` pertenece a esa venta, está `ACTIVO`, no se repite, y su
     `cantidad`/`precioUnitario` coinciden con la propuesta;
   - líneas sin `ventaItem`: sólo las sintéticas de la propuesta (`SERVICIO DE DELIVERY`,
     `RECARGO`, con su monto) **o** el modo Resumido (una única línea, sin ninguna línea de
     venta, `descuento = 0`). Cualquier otra → rechazo (no se aceptan renglones inventados que
     "cuadran" el total);
   - detallado: `descuento` = el de la propuesta; resumido: la línea es el total neto;
   - total recalculado con `calcularTotalesFactura` == `propuesta.total` (tolerancia ±1 por
     redondeo) → si no, `La factura (₲ X) no coincide con la venta (₲ Y)`.
4. **Sin venta** (factura manual): líneas con `ventaItem` → rechazo.
5. Siempre: `total` de cada `FacturaItem` y `gravada*/exenta/iva*/total` de la `Factura` se
   **recalculan** con `calcularTotalesFactura`; lo que mande el cliente se ignora.
6. Numeración y guardado como hoy.

### Diálogo (#325)
- `prefillFromData()` con venta: pide la propuesta y precarga líneas + descuento. Si falla, avisa
  y no deja emitir.
- Con venta vinculada: precio, cantidad, IVA y producto de las líneas **no se editan**, no se
  agregan ni quitan líneas, el descuento no se edita. Sí: descripción y **Resumido**. Flags
  precomputados (`lineasBloqueadas`), sin funciones en template.
- Resumido: la línea `CONSUMISION` toma el total neto y `descuento = 0` (ya lo hace así).
- `recalc()` usa `calcularTotalesFactura`; la impresión usa los totales que **devuelve el
  servidor**.
- Factura manual: igual que hoy, con la misma función de totales.

### Modo cliente (D7)

> **Corrección 2026-11-02, durante la fase 1 (D7 queda sin efecto):** la premisa era falsa. En
> todos los modos se usa `RepositoryIpcService` (`app.module.ts:84-92`); en `mode=client` el
> preload monkey-patchea `ipcRenderer.invoke` y `callIpc` viaja por `/api/rpc`. `RepositoryHttpService`
> es un esqueleto histórico que no se usa, así que facturar en modo cliente ya funciona. No se
> implementa nada de lo que sigue; el método nuevo se agrega al esqueleto como stub, igual que
> sus vecinos. Se le avisó a Gabriel.

Texto original:
`repository-http.service.ts`: implementar vía `/api/rpc` los métodos que usa el diálogo
(`createFactura`, `getFacturaPropuestaVenta`, `getTimbradoDetalles`, `getFacturaPlantillas`,
`getFacturacionConfig`, `getClientePorRuc`) siguiendo el patrón de los métodos HTTP vecinos.
Los ABM de timbrado/plantilla quedan como están (fuera de alcance).

## Fases
1. Utils compartidos (`computeNetoBrutoItem` exportada, `calcularTotalesFactura`, `factura-venta.utils.ts`) + canal de propuesta + repository IPC/HTTP.
2. `create-factura`: lock, validaciones, recálculo.
3. Diálogo.
4. Pruebas, docs, cierre.

Commit y push al cerrar cada fase.

## Pruebas

`npm run test:factura-venta` (nuevo, `scripts/test-factura-venta-e2e.ts`, SQLite temporal),
**agregado a `test:all`**. Fixture con **varios ítems por venta y cantidad 2**:

1. Pizza 70.000 + adicional 5.000, ×2 → línea 150.000.
2. Descuento por ítem → resta por unidad × cantidad.
3. Ítem `CANCELADO` → fuera de la propuesta.
4. Envío → línea `SERVICIO DE DELIVERY` IVA 10.
5. Aumento → línea `RECARGO` IVA 10.
6. Descuento global con productos IVA 10 + IVA 5 + exentos → reparto exacto, suma = descuento, residuo a la base mayor; IVA calculado sobre la base neta (un `Math.floor` o un IVA sobre bruto ponen el test en rojo).
7. Descuento mayor al bruto → total 0, no negativo.
8. Pizza con sabores + adicionales fraccionarios → descripción con los adicionales, monto = `precioAdicionales`.
9. Invariante contra `getEstadoCobroVentaInternal` en todos los casos anteriores.
10. `create-factura` **rechaza**: ítem de otra venta, ítem `CANCELADO`, ítem repetido, precio cambiado, línea inventada sin `ventaItem` que cuadra el total, descuento distinto, `ventaItem` sin venta, segunda EMITIDA de la misma venta. **Acepta**: detallado, Resumido (con descuento y envío), y una nueva tras anular la anterior.
11. Ignora `gravada10/iva10/total` falsos del payload.
12. La numeración no avanza cuando se rechaza.
13. Concurrencia: dos `create-factura` de la misma venta con `Promise.all` → una sola EMITIDA y números distintos. En SQLite (mutex) dentro de `test:factura-venta`; en Postgres, caso en `npm run test:locks-pg`.
14. Strings decimales (como Postgres) en la función pura.

Existentes que hay que adaptar: `test:factura-cliente` emite con `items: []` y `total: 100000`
(`scripts/test-factura-cliente-e2e.ts:69-75`); con el recálculo el total pasa a 0, se le agrega
una línea. `test-roles-pdv-e2e.ts:86` llama `create-factura` con `{}`: tiene que seguir dando el
mismo resultado.

Cada test de regresión se verifica **revirtiendo el fix** (debe ponerse rojo). `test:all` sin
fallas nuevas sobre la línea base de develop (9 rojas conocidas); `npm run check`.

**Prueba real antes del merge** (`scripts/servidor-prueba-tienda.ts`, SQLite nueva): venta del PdV
con adicional y descuento por ítem; delivery con envío, descuento global y aumento; cobrar y
facturar; también desde `/admin/` (modo web = HTTP). Capturas del cobro y del PDF con el mismo
total. El pedido online personalizado se prueba al rebasar F6b encima.

## Documentación
- `docs/testing/TESTING-CHECKLIST-FACTURA-DESDE-VENTA.md`.
- `domains/facturacion.md`: reescribir los pasos del flujo (hoy quedarían falsos), reglas de totales, D1–D7; quitar el ⚠️ de #240.
- `reference/known-bugs.md`: #240 RESUELTO, #325 agregado como RESUELTO; `reference/handlers-index.md`: canal nuevo.
- PR con `Closes #325`, `Closes #240` y aviso de **reinicio** (cambia backend).
- El plan y las auditorías se borran en el PR final.

## Riesgos
- **Facturas que antes salían y ahora se rechazan** (cajero que editaba precios con venta vinculada). Mitigado bloqueando la edición y con mensajes que dicen la diferencia.
- **D5 en cualquier momento:** una factura emitida antes del descuento queda por más; para corregirla hay que anular. Es la decisión tomada; el manual de pruebas lo cubre.
- **Sube el IVA declarado** en facturas con adicionales o envío: es lo correcto, conviene avisarle al contador de Don Franco.
- **Cambia la base gravada** cuando hay descuento (pasa a neta). Es lo correcto fiscalmente; afecta sólo facturas nuevas.
