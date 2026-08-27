# Manual de pruebas — Módulo de Delivery del PdV

El módulo de delivery estaba implementado pero **nunca se usó en producción**.
La auditoría encontró 26 problemas (`docs/DIAGNOSTICO-DELIVERY.md`), cuatro de
ellos bloqueantes. Este manual verifica que quedaron cerrados.

> **Reiniciar la app antes de empezar.** Hay handlers nuevos, entidades nuevas y
> una migración (`1787564255118-DeliveryCostoRepartidorYConfig`).

## Preparación

| # | Paso | Esperado |
|---|---|---|
| 0.1 | Abrir la app y dejar que corran las migraciones | Arranca sin errores. La migración es aditiva. |
| 0.2 | Ventas → **Precios de Delivery** | La pantalla **aparece en el menú lateral y en el buscador global** (Ctrl+Espacio → "precios delivery"). Antes sólo se llegaba desde una tarjeta del dashboard de Ventas. |
| 0.3 | Cargar dos zonas: `CENTRO` = 5.000 y `PERIFERIA` = 15.000 | Se guardan y quedan activas. |
| 0.4 | RRHH → Funcionarios: que haya al menos un funcionario activo | Va a ser el repartidor. |
| 0.5 | Configuración de PdV → sección **DELIVERY** | Ahora hay 11 opciones, no dos. Dejar todo por defecto salvo *Zona por defecto* = CENTRO. |
| 0.6 | Abrir una caja en el PdV | — |

---

## 1. El envío se cobra (bloqueante A-1)

**Este es el problema más grave que tenía el módulo: el envío no se cobraba
nunca.** El diálogo de cobro sumaba únicamente ítems − descuento, y el valor de
la zona de entrega era puramente decorativo.

| # | Paso | Esperado |
|---|---|---|
| 1.1 | PdV → botón **DELIVERY** → NUEVO DELIVERY | Se abre el alta. La zona viene preseleccionada en **CENTRO** (la configurada en 0.5). |
| 1.2 | Cargar teléfono, nombre y **dejar la dirección vacía** → CREAR | El botón está **deshabilitado**: la dirección es obligatoria (configurable). |
| 1.3 | Completar la dirección → CREAR DELIVERY | Se crea y el PdV entra en **modo delivery** con la venta lista para cargar ítems. |
| 1.4 | Cargar productos por 60.000 | El carrito muestra 60.000. |
| 1.5 | **COBRAR** | En el encabezado del cobro aparece **`Envío: 5.000`** junto a Subtotal, y el **total a cobrar es 65.000**, no 60.000. |
| 1.6 | Cobrar en efectivo | La venta se cierra. El PdV **sale del modo delivery** (antes el cartel quedaba colgado). |
| 1.7 | Volver a DELIVERY y seleccionar el pedido | El panel derecho muestra SUBTOTAL 60.000 / ENVÍO 5.000 / **TOTAL 65.000**. |

### 1.b Con Postgres (importante)

| # | Paso | Esperado |
|---|---|---|
| 1.8 | Si la instalación usa Postgres, repetir 1.7 | El TOTAL es **65.000**. Antes salía un número absurdo tipo `600005000`: los `decimal` llegan como string desde Postgres y el template los concatenaba en vez de sumarlos. |
| 1.9 | **En Postgres**, cobrar una venta (de delivery o normal) con un ítem que tenga **adicionales/extras** | El total es correcto. Antes salía **NaN / vacío**: `(precioVentaUnitario + precioAdicionales) * cantidad` con los tres campos como string daba NaN. Bug pre-existente del diálogo de cobro, corregido en este trabajo. |

---

## 2. Cambiar la zona recalcula el cobro (B-7)

Antes, el aviso *"el cambio de precio puede afectar el valor de cobro final"*
describía un comportamiento que no existía: cambiar la zona no impactaba en nada.

| # | Paso | Esperado |
|---|---|---|
| 2.1 | Nuevo delivery con zona CENTRO, cargar 40.000 en ítems | Total 45.000. |
| 2.2 | DELIVERY → seleccionar → **DATOS** → cambiar a PERIFERIA | Aparece el aviso "el costo de envío de la venta se actualiza al de la zona nueva". |
| 2.3 | GUARDAR y volver a mirar el detalle | ENVÍO = **15.000**, TOTAL = **55.000**. |
| 2.4 | COBRAR | El total a cobrar es 55.000. |
| 2.5 | Con la venta ya cobrada, entrar de nuevo a **DATOS** | El selector de zona está **bloqueado**, con el aviso de que hay que anular el cobro primero. |

---

## 3. Máquina de estados (bloqueante A-4)

Las transiciones ahora las valida el **backend**. Antes toda la lógica estaba en
el componente Angular, y como `/api/rpc` es *default-allow*, cualquier cliente
podía saltar de ABIERTO a ENTREGADO.

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Delivery nuevo (ABIERTO) → botón **LISTO** | Pasa a PARA_ENTREGA. |
| 3.2 | Botón **ENVIAR** | Se abre el **selector de repartidor** (esto antes no existía: había un `// TODO` y el estado cambiaba sin asignar a nadie). |
| 3.3 | Cancelar el selector | El delivery **no cambia** de estado. |
| 3.4 | ENVIAR → elegir un funcionario → ENVIAR | Pasa a EN_CAMINO y la columna **ENTREGADOR muestra el nombre** (antes siempre "-"). |
| 3.5 | Botón **FINALIZAR** sin haber cobrado | Se abre el diálogo de **cobro** en vez de marcar entregado. |
| 3.6 | Cobrar → aparece "¿marcar como ENTREGADO?" → Sí | Queda ENTREGADO. |
| 3.7 | Menú **ESTADO** con el delivery ENTREGADO | Ofrece **sólo EN_CAMINO** (corrección de un click errado). Antes ofrecía también ABIERTO, que dejaba la venta inconsistente. |
| 3.8 | Menú ESTADO con un delivery ABIERTO | Ofrece PARA_ENTREGA y EN_CAMINO. |
| 3.8b | Botón **REPARTIDOR** sobre un pedido EN_CAMINO | Reasigna el repartidor **sin** cambiar el estado. |
| 3.8c | Click en ENVIAR y, **con el selector de repartidor abierto**, clickear otra fila de la tabla; después confirmar el repartidor | El cambio se aplica al pedido **original**, no al que quedó seleccionado. |

### 3.b El botón ENVIAR sin repartidores

| # | Paso | Esperado |
|---|---|---|
| 3.9 | Configuración de PdV → DELIVERY → destildar *Repartidor obligatorio al enviar* | — |
| 3.10 | ENVIAR → botón **SIN REPARTIDOR** | Pasa a EN_CAMINO sin asignar a nadie. Con la opción tildada, el backend lo rechaza con un mensaje claro. |

---

## 4. Cancelar revierte el dinero (bloqueante A-2)

Antes eran **tres llamadas sueltas** desde el navegador y **el cobro no se
revertía**: la plata quedaba registrada contra una venta cancelada.

| # | Paso | Esperado |
|---|---|---|
| 4.1 | Delivery nuevo, cargar 30.000, **cobrarlo** | Venta CONCLUIDA. |
| 4.2 | Anotar el total de la caja (Utilitarios → resumen o cierre) | Guardar el número. |
| 4.3 | Seleccionar el delivery → **CANCELAR** | Se abre la confirmación con un **campo de texto MOTIVO** y el aviso de que la venta ya fue cobrada. |
| 4.4 | Intentar confirmar con el motivo **vacío** | El botón está deshabilitado. Antes este campo **no existía** y todos los deliveries cancelados quedaban con motivo "SIN MOTIVO". |
| 4.5 | Escribir "cliente se arrepintió" → CANCELAR DELIVERY | El delivery queda CANCELADO y aparece el motivo real en el panel de detalle. |
| 4.6 | Volver a mirar el total de la caja | Bajó en 35.000 (30.000 + envío). |
| 4.7 | Productos → stock del producto vendido | Volvió al valor anterior. |
| 4.8 | Menú ESTADO sobre el delivery cancelado | **Deshabilitado**: cancelar es terminal. Reabrir estaba roto de raíz (el stock revertido no se reactivaba nunca). |

### 4.b Sin permiso

| # | Paso | Esperado |
|---|---|---|
| 4.9 | Entrar con un usuario **CAJERO sin** `VENTAS_DELIVERY_CANCELAR_COBRADO` e intentar cancelar un delivery **ya cobrado** | Snackbar rojo: falta el permiso. |
| 4.10 | El mismo usuario cancela un delivery **sin cobrar** | Funciona: descartar un pedido no cobrado sólo pide `VENTAS_PDV`. |

---

## 5. Impresión del ticket (B-1)

El botón IMPRIMIR abría un cartel *"será implementada próximamente"*. El handler
que existía en el backend era **código muerto** (no estaba expuesto en
`preload.ts`) y sólo imprimía nombre y dirección: sin ítems ni totales, inútil
para el repartidor.

> Requiere una impresora configurada con rol **TICKET_VENTA**.

| # | Paso | Esperado |
|---|---|---|
| 5.1 | Delivery con ítems, **sin cobrar** → **IMPRIMIR** | Sale un ticket con: encabezado de la empresa, DELIVERY N°, cliente, teléfono, **dirección en línea completa**, observación, zona, repartidor, la lista de ítems, SUBTOTAL / ENVÍO / TOTAL y **`A COBRAR Gs. X` en letra grande**. |
| 5.2 | Delivery ya cobrado → IMPRIMIR | En vez de "A COBRAR" dice **`PAGADO — NO COBRAR`**. Es lo más importante del ticket. |
| 5.3 | Sin impresora configurada | Snackbar con el motivo, no un error mudo. |
| 5.4 | Configuración de PdV → DELIVERY → tildar *Imprimir el ticket al enviar* | Al pasar a EN_CAMINO el ticket sale solo. Si la impresora está apagada, **el cambio de estado igual se completa** (la impresión es best-effort). |
| 5.5 | Ticket de venta normal (comprobante al cobrar) de un delivery | Tiene una línea **ENVIO** y el TOTAL la incluye. |
| 5.6 | **Multi-caja (2026-08-27).** Dos cajas, cada una con su térmica: en *Dispositivos*, asignar a cada una su impresora de tickets. Tomar un delivery desde la **caja 2** e IMPRIMIR. | El ticket sale por la impresora **de la caja 2**. *(El bug: salía siempre por la marcada como predeterminada, así que el pedido de una caja se imprimía en la otra.)* |
| 5.7 | Misma prueba con la impresión automática (5.4), creando y enviando desde la caja 2. | Igual: sale por la impresora de la caja 2. |
| 5.8 | Una caja **sin** impresora de tickets asignada | Sigue cayendo a la impresora predeterminada (comportamiento de siempre). |

---

## 6. La lista no pierde pedidos (B-4)

| # | Paso | Esperado |
|---|---|---|
| 6.1 | Dejar un delivery en EN_CAMINO **sin cobrar** y **cerrar la caja** | — |
| 6.2 | Abrir una caja nueva → DELIVERY | El pedido de ayer **sigue en la lista**, con un ícono de reloj y el tooltip "Delivery de otro turno". Antes desaparecía y no había forma de cobrarlo ni cerrarlo. |
| 6.3 | Cobrarlo y finalizarlo desde la caja nueva | Funciona. |
| 6.4 | Configuración de PdV → destildar *Mostrar pendientes de otros turnos* | Vuelve al comportamiento viejo: sólo la caja actual. |

---

## 7. Alta atómica (B-3)

| # | Paso | Esperado |
|---|---|---|
| 7.1 | Crear varios deliveries seguidos | Cada uno aparece en la lista con su venta. |
| 7.2 | (Verificación en BD) `SELECT COUNT(*) FROM deliveries d LEFT JOIN ventas v ON v.delivery_id = d.id WHERE v.id IS NULL` | **0**. Antes el alta eran dos llamadas y un fallo en la segunda dejaba un delivery sin venta, invisible para la lista. |

---

## 8. Cliente duplicado (C-3)

| # | Paso | Esperado |
|---|---|---|
| 8.1 | Crear un delivery con teléfono `0981 123456` (con espacio) | Se crea el cliente. |
| 8.2 | Crear otro con `0981123456` (sin espacio) | **Reconoce al cliente existente** (chip verde) y no crea uno nuevo. Antes cada variante de formato generaba un cliente distinto para la misma persona. |

---

## 9. Configuración (§E del diagnóstico)

Configuración de PdV → **DELIVERY**. Cada opción debe surtir efecto sin tocar código:

| # | Opción | Cómo verificarlo |
|---|---|---|
| 9.1 | *Módulo de delivery habilitado* → destildar | El botón **DELIVERY desaparece** del PdV (reabrir la pestaña). |
| 9.2 | *Tiempo amarillo / rojo* | Poner 1 y 2 minutos: la columna ESPERA cambia de color a ese ritmo. |
| 9.3 | *Zona por defecto* | La zona elegida viene preseleccionada al crear. |
| 9.4 | *Dirección obligatoria* → destildar | Se puede crear sin dirección. |
| 9.5 | *Repartidor obligatorio al enviar* | Ver 3.9–3.10. |
| 9.6 | *Cobro anticipado por defecto* | El toggle del alta arranca activado. |
| 9.7 | *Mín. dígitos del teléfono* → 8 | Con 5 dígitos el botón CREAR queda deshabilitado. |
| 9.8 | *Filas por página* → 5 | La lista pagina de a 5. |
| 9.9 | *Mostrar pendientes de otros turnos* | Ver 6.4. |
| 9.10 | *Imprimir al crear / al enviar* | Ver 5.4. |

---

## 10. Regresión: el diálogo de confirmación

`ConfirmationDialogComponent` cambió (ahora soporta campo de texto) y lo usa
**toda la app**. Verificar que las confirmaciones de siempre siguen igual:

| # | Paso | Esperado |
|---|---|---|
| 10.1 | PdV → cancelar una venta normal | Confirmación de dos botones, **sin** campo de texto. |
| 10.2 | Productos → eliminar cualquier cosa | Igual: dos botones, sin campo. |
| 10.3 | Caja Mayor → anular un movimiento | Igual. |
| 10.4 | Cualquier confirmación con textos propios ("ELIMINAR" / "VOLVER") | Los botones muestran esos textos, no "Sí / No". |

---

## Test automatizado

```
npm run test:delivery
npm run test:delivery-impresora
```

`test:delivery`: 53 asserts contra SQLite con las migraciones reales — alta
atómica, máquina de estados, guard de `updateDelivery`, costo del envío en la
deuda, cancelación transaccional con reversa de cobro/stock, permisos y lista
multi-caja.

`test:delivery-impresora`: 6 asserts sobre el ruteo del ticket por dispositivo
(pasos 5.6–5.8). Las impresoras del test apuntan a puertos donde no escucha
nadie, así que el intento falla al instante y el resultado dice **cuál** eligió
— que es lo que se quiere afirmar. Verificado que sin el fix se pone rojo.
