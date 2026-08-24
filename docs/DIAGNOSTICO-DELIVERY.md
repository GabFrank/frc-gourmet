# Diagnóstico del módulo de Delivery (PdV)

> Auditoría completa del módulo de delivery accesible desde el PdV, realizada
> antes de su primer uso en producción. El módulo estaba implementado pero
> **nunca se usó**: este documento registra qué se encontró roto, qué faltaba y
> qué se decidió hacer.
>
> Fecha: 2026-08-24. Base: `origin/develop` @ `59ca83d`.

## Superficie auditada

| Capa | Archivos |
|---|---|
| Entidades | `ventas/delivery.entity.ts`, `ventas/precio-delivery.entity.ts`, `ventas/venta.entity.ts`, `ventas/pdv-config.entity.ts` |
| Handlers | `ventas.handler.ts` (11 handlers de delivery + `getDeliveriesByCaja`), `documentos-tickets.handler.ts` (`print-etiqueta-delivery`) |
| Frontend | `delivery-dialog`, `crear-delivery-dialog`, `list-precios-delivery`, `create-edit-precio-delivery-dialog`, `pdv.component`, `cobrar-venta-dialog` |
| Config | `pdv-config-dialog`, `menu-tree.ts` |

## Resumen ejecutivo

26 hallazgos. **4 bloqueantes** (dinero o integridad de datos), 9 mayores
(funcionalidad incompleta), 8 menores (convenciones, UX) y 5 parámetros
hardcodeados que pasan a ser configurables.

El módulo, tal como estaba, **no era usable en producción**: el restaurante
habría regalado el envío en todos los pedidos y no habría podido imprimir nada
para el repartidor.

---

## A. Bloqueantes

### A-1 · El costo del delivery nunca se cobra

`cobrar-venta-dialog.component.ts:599-607` calcula el total como
`Σ(items) − descuento`. No hay una sola referencia a `delivery` en todo el
diálogo de cobro ni en `buildVentaTicketLines`.

`PrecioDelivery.valor` se muestra en la lista y en la tarjeta de totales del
detalle, pero **nunca entra en lo que se le cobra al cliente**. La zona de
entrega es puramente decorativa.

**Causa raíz:** no existe ningún campo en `Venta` que persista el costo de
envío; la única referencia es `Venta.delivery.precioDelivery.valor`, que el
cobro no lee. Además, si la zona se cambia después del cobro, el valor
histórico se pierde (la FK apunta al `PrecioDelivery` vigente, no a un monto
congelado).

**Decisión:** columna `ventas.costo_delivery` (monto congelado al momento de
asignar/cambiar la zona). El cobro, el estado de cobro parcial y el ticket la
suman como línea propia.

### A-2 · Cancelar un delivery ya cobrado deja el dinero en caja

`delivery-dialog.component.ts:483-518` (`cancelarDelivery`) hace **tres
llamadas independientes desde el renderer**:

```ts
await updateDelivery(id, { estado: CANCELADO, ... });   // 1
await updateVenta(ventaId, { estado: 'CANCELADA' });     // 2
revertirStockVenta(ventaId).subscribe(...)               // 3 — sin await
```

Problemas:

1. **No es atómico.** Si (2) falla, el delivery queda CANCELADO con la venta
   viva y cobrable. (3) es fire-and-forget: su error solo va a `console.error`.
2. **El cobro no se revierte.** Si la venta estaba `CONCLUIDA`, el `Pago` y sus
   `PagoDetalle` siguen `activo: true`. `computeResumenCaja` filtra las ventas
   por `estado: CONCLUIDA`, así que el efectivo esperado sí baja — pero las
   líneas de pago quedan vivas, huérfanas de una venta cancelada, y cualquier
   consumidor que parta del `Pago` (cobro parcial, reportes por forma de pago
   que no filtren por estado de venta) las sigue contando.
3. Las rondas de `CobroParcial` no se desactivan.
4. Los `VentaItem` activos no se cancelan (el flujo equivalente del PdV,
   `pdv.component.ts:2031`, sí lo hace).

**Decisión:** handler transaccional `delivery-cancelar` que hace todo en un
`queryRunner`: ítems, venta, CPC, `PagoDetalle`, `CobroParcial` y stock.

### A-3 · `ConfirmationDialogComponent` no soporta `showInput` — el motivo se pierde

`delivery-dialog.component.ts:459-470` abre la confirmación con
`showInput: true, inputLabel: 'MOTIVO'`. El componente
(`confirmation-dialog.component.ts`) **no tiene input**: su template son dos
botones que cierran con `false`/`true`.

Resultado: `result` es siempre el booleano `true`, la guarda
`typeof result === 'string'` nunca se cumple y **todos los deliveries
cancelados quedan con `motivoCancelacion = 'SIN MOTIVO'`**.

El mismo componente ignora `showCancel: false` (3 llamadores lo pasan), por lo
que el placeholder de impresión muestra un "Sí / No" sin sentido.

### A-4 · No existe máquina de estados en el backend

Todas las transiciones se hacen con el handler genérico `updateDelivery`, que
es un `repo.merge(entity, data)` sin validación:

```ts
ipcMain.handle('updateDelivery', async (_event, id, data) => {
  await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
  repo.merge(entity, data);            // acepta cualquier campo, cualquier estado
  return await repo.save(entity);
});
```

Como `/api/rpc` es **default-allow**, cualquier cliente con un JWT de
`VENTAS_PDV` puede saltar de `ABIERTO` a `ENTREGADO`, escribir un `estado`
inexistente, o falsear los timestamps. Toda la lógica de "qué transición es
legal" y "qué fechas limpiar" vive en el componente Angular
(`cambiarEstado()`, 60 líneas), que es exactamente donde no debe estar.

---

## B. Funcionalidad incompleta

### B-1 · Impresión: no implementada, y el handler que existe está muerto

- `delivery-dialog.imprimir()` abre un diálogo *"Impresión será implementada
  próximamente"*.
- `print-etiqueta-delivery` (`documentos-tickets.handler.ts:1147`) **existe pero
  no tiene ningún llamador**: no está en `preload.ts`, ni en
  `repository.service.ts`, ni en el mapa de canales. Es código muerto.
- Aunque se conectara, imprime solo cliente/tel/dirección: **sin ítems, sin
  totales, sin costo de envío y sin estado de cobro** — inútil para el
  repartidor, que necesita saber cuánto cobrar.

### B-2 · El repartidor nunca se asigna

`Delivery.entregadoPor` (FK a `Usuario`) existe y se muestra en la columna
ENTREGADOR de la lista, pero `enviar()` tiene literalmente:

```ts
// TODO: seleccionar entregador (por ahora solo cambia estado)
```

La columna siempre muestra `-`.

**Decisión:** el repartidor es un **`Funcionario`**, no un `Usuario` — los
repartidores no suelen tener usuario del sistema, y modelarlo como funcionario
habilita comisiones/liquidación por entrega. Columna nueva
`entregado_por_funcionario_id` (aditiva; `entregado_por` se conserva).

### B-3 · Crear un delivery son dos llamadas sin transacción

`crear-delivery-dialog.confirmar()` hace `createDelivery(...)` y después
`createVenta(...)`. Si la segunda falla, queda un `Delivery` **sin venta**, y
como la lista se arma desde `Venta` (ver B-4), es un registro invisible e
inalcanzable.

### B-4 · La lista pierde los deliveries de turnos anteriores

`getDeliveriesByCaja` parte de `Venta` y filtra `venta.caja_id = :cajaId`. Un
delivery `EN_CAMINO` sin cobrar desaparece de la pantalla en cuanto se cierra
la caja: no hay forma de verlo, cobrarlo ni cerrarlo desde el PdV.

**Decisión:** la lista trae la caja actual **más todos los deliveries en estado
no terminal de cualquier caja**, marcados como "otro turno".

### B-5 · Reactivar desde CANCELADO deja la venta inconsistente

`cambiarEstado()` pone la venta en `ABIERTA` con este comentario:

```ts
// Nota: el stock se re-procesará cuando la venta se finalice nuevamente
```

**No es cierto.** `revertirStockVenta` marca los `StockMovimiento` como
`activo: false` y nada los reactiva; al volver a concluir la venta no se
regeneran. Además el `Pago` anterior queda enganchado a una venta ABIERTA.

### B-6 · `cobroAnticipado` es decorativo

Se guarda en la entidad y se edita con un toggle, pero **ningún flujo lo lee**:
no fuerza el cobro al crear, no altera el orden de estados, no se muestra en la
lista ni en el ticket.

### B-7 · Cambiar la zona de entrega no impacta en nada

`crear-delivery-dialog` en modo edición muestra el aviso *"El cambio de precio
de delivery puede afectar el valor de cobro final"*. No afecta nada: no hay
ítem, no hay campo en la venta, no se recalcula ningún saldo. El warning
describe un comportamiento que no existe.

### B-8 · El ABM de Precios de Delivery está fuera del menú

`ListPreciosDeliveryComponent` solo se alcanza desde una tarjeta del dashboard
de Ventas. No está en `MENU_TREE` → **no aparece ni en el sidenav ni en el
buscador global**, violando la regla 22 del proyecto.

### B-9 · Los umbrales de tiempo no son editables

`PdvConfig.deliveryTiempoAmarillo` / `deliveryTiempoRojo` existen en la entidad
y los lee el diálogo, pero `pdv-config-dialog` **no los expone**: de hecho son
30 y 60 fijos, salvo que se edite la base a mano.

---

## C. Bugs de datos y consistencia

### C-1 · `PrecioDelivery.valor` es `decimal` → string en Postgres

No hay `pg.types.setTypeParser(1700, parseFloat)` en el repo (se buscó en todo
`electron/` y `src/app/database/`), así que en modo Postgres los `decimal`
llegan al renderer como **string**.

En `delivery-dialog.component.html`:

```html
{{ (calcTotalItems() + (selectedDelivery.precioDelivery?.valor || 0)) | number:'1.0-0' }}
```

`10000 + "5000"` → `"100005000"`. El total del detalle es basura en Postgres.
Idem `valorDelivery: d.precioDelivery?.valor || 0` en la tabla, que además
rompe cualquier comparación numérica.

### C-2 · `isTerminal` bloquea CANCELAR pero el menú ESTADO no

Con un delivery `ENTREGADO`, el botón CANCELAR está deshabilitado (correcto),
pero el menú ESTADO ofrece `EN_CAMINO` y `ABIERTO`, que lo sacan del estado
terminal sin ninguna de las validaciones que sí tiene el botón.

### C-3 · `crearClienteRapido` se dispara por cada delivery sin match exacto

`confirmar()` crea un cliente nuevo siempre que `clienteEncontrado` sea null.
La autoselección solo ocurre con **coincidencia exacta de string** del teléfono
(`clientesSugeridos[0].persona?.telefono === tel`), así que `0981 123456` y
`0981123456` generan dos clientes distintos para la misma persona.

### C-4 · Borrar un `PrecioDelivery` es hard-delete

`deletePrecioDelivery` hace `repo.remove(entity)` aunque la entidad tenga
`activo`. El chequeo de dependencias mira `deliveries`, pero un borrado en
frío rompe cualquier referencia histórica. Debería ser baja lógica.

### C-5 · Errores silenciosos en todo el módulo

`loadDeliveries`, `confirmar`, `loadDeliveryDetails` y las transiciones de
estado atrapan la excepción y hacen `console.error` sin snackbar. Si crear un
delivery falla, el diálogo simplemente no se cierra y el cajero no sabe por qué.

---

## D. Convenciones del repo violadas

| # | Regla | Dónde |
|---|---|---|
| D-1 | *No funciones en templates* | `calcTotalItems()` en `delivery-dialog.component.html` (tarjeta de totales) |
| D-2 | *Sin getters en templates* | `canConfirm` y `precioDeliveryCambio` en `crear-delivery-dialog.component.html` |
| D-3 | *Confirmaciones con `ConfirmationDialogComponent`* | Se usa, pero pidiéndole features que no tiene (A-3) |
| D-4 | *Toda pantalla navegable en `MENU_TREE`* | B-8 |
| D-5 | *Handler que muta lleva `ensurePermission`* | Se cumple, pero con permiso genérico `VENTAS_PDV` para operaciones sensibles (cancelar un cobro debería exigir más) |

---

## E. Parámetros hardcodeados → configuración

Van a la nueva sección **Delivery** de la configuración del PdV:

| Hoy | Dónde está hardcodeado |
|---|---|
| Umbral amarillo 30 min / rojo 60 min | Existen en `PdvConfig` pero sin UI (B-9) |
| `pageSize = 20` | `delivery-dialog.component.ts:78` |
| Zona por defecto = la de menor valor | `crear-delivery-dialog.component.ts:96` (`preciosDelivery[0]`) |
| Teléfono mínimo 4 dígitos / búsqueda desde 3 | `canConfirm` y el `debounce` del autocomplete |
| El botón DELIVERY siempre visible en el PdV | `pdv.component.html:1025`, sin flag de habilitación |
| Sin auto-impresión al crear / al entregar | No existe el hook |
| Dirección no obligatoria | Sin validación |
| Repartidor no obligatorio al enviar | Sin validación |

---

## Decisiones tomadas (Gabriel, 2026-08-24)

1. **Costo de envío:** columna `ventas.costo_delivery` + línea propia en el
   cobro y en el ticket. No se modela como `VentaItem` para no ensuciar stock,
   costo/rentabilidad, comisiones ni KDS.
2. **Cancelar un delivery cobrado:** se permite, revirtiendo el cobro
   automáticamente en una sola transacción (venta, stock, CPC, `PagoDetalle`,
   `CobroParcial`), bajo permiso propio.
3. **Repartidor:** `Funcionario` de RRHH, no `Usuario`.
4. **Lista:** caja actual + pendientes de cualquier caja, marcados como de otro
   turno.
