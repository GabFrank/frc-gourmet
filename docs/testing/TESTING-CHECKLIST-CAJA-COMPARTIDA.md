# Checklist de pruebas — Caja compartida entre terminales

Cubre los dos cambios de 2026-08:

1. **Cobro configurable en terminales que no abrieron la caja** (dos flags
   nuevos en Configuración del PdV).
2. **Pagos ya registrados en los tickets de delivery.**

> ⚠️ **Hace falta reiniciar la app**: hay cambios en handlers, entidades y dos
> migraciones. No alcanza con el hot reload de Angular.

---

## Preparación

Se necesitan **dos terminales** apuntando a la misma base (modo servidor +
cliente), cada una con su `deviceId` configurado en *Sistema → Modo de
operación*. Sin `deviceId` la app no puede distinguir las terminales y **no
bloquea nada** — que es el comportamiento correcto para una instalación de un
solo equipo, pero hace imposible probar esto.

- **Terminal A** = la que abre la caja (la "dueña").
- **Terminal B** = la que se une (la "ajena").

En B, al unirse, tiene que aparecer el aviso naranja en la barra de caja.

---

## Parte 1 — Los dos flags

Los flags están en *Configuración del PdV → CAJA COMPARTIDA ENTRE TERMINALES*.
Requiere permiso `VENTAS_PDV_CONFIGURAR` (sólo GERENTE en el seed).

> El diálogo de configuración **no se abre desde el PdV**. Se llega por el menú
> lateral, el home o el dashboard de ventas. El PdV relee la config antes de
> cada cobro, así que no hace falta reabrir la pestaña.

### 1.1 — Ambos flags apagados (default: conducta previa)

| # | Paso | Esperado |
|---|---|---|
| 1 | En A, abrir caja. En B, entrar al PdV y unirse a esa caja | Aviso: *"Caja #N abierta en \<terminal A\> · el cobro se hace allá"* |
| 2 | En B, cargar ítems en una mesa | Funciona. Unirse siempre permitió lanzar ítems |
| 3 | En B, mirar los botones COBRAR y COBRO RÁPIDO | **Deshabilitados**, con tooltip explicando dónde se cobra |
| 4 | En B, apretar **F1** y **F2** | No pasa nada / snackbar explicando. **No** se abre el diálogo |
| 5 | En A, cobrar esa venta | Funciona normal |

### 1.2 — Sólo "permitir registrar pagos"

| # | Paso | Esperado |
|---|---|---|
| 1 | Activar sólo `Permitir registrar pagos…` y guardar | — |
| 2 | En B, sin reabrir el PdV, cargar ítems y apretar COBRAR | **Se abre** el diálogo de cobro |
| 3 | Mirar el banner del diálogo | *"…Podés registrar los pagos; la venta la finaliza esa terminal."* |
| 4 | Agregar una línea de EFECTIVO que cubra el total | La línea se agrega |
| 5 | Mirar FINALIZAR y FINALIZAR + TICKET | **Deshabilitados**, con tooltip |
| 6 | Mirar Cobro Parcial, Descuento (F9), Cobrar a crédito | Parcial y Descuento habilitados; **Crédito deshabilitado** (concluye la venta) |
| 7 | Apretar **F9** en B | Abre el ajuste (es una línea de pago, y están habilitadas) |
| 8 | Apretar **F10/F11** en B | No finalizan |
| 9 | En B, mirar COBRO RÁPIDO en el PdV | **Deshabilitado**: registra *y* finaliza, necesita los dos permisos |
| 10 | Cerrar el diálogo en B. En A, abrir el cobro de esa misma venta | **Las líneas cargadas en B aparecen** |
| 11 | En A, finalizar | Funciona. La venta queda CONCLUIDA |

### 1.3 — Sólo "permitir finalizar"

| # | Paso | Esperado |
|---|---|---|
| 1 | Dejar sólo `Permitir finalizar ventas…` | — |
| 2 | En B, abrir el cobro | Banner: *"…Podés finalizar, pero no cargar formas de pago desde acá."* |
| 3 | Intentar agregar una línea | Botón de agregar **deshabilitado**; el menú ⋮ de cada fila, también |
| 4 | En A, cargar las líneas hasta cubrir el total | — |
| 5 | En B, reabrir el cobro y finalizar | Funciona |

### 1.4 — Ambos activados

| # | Paso | Esperado |
|---|---|---|
| 1 | Activar los dos | — |
| 2 | En B, cobrar de punta a punta (COBRAR → líneas → FINALIZAR) | Funciona sin avisos de bloqueo |
| 3 | En B, cobrar otra venta con **F2 (cobro rápido)** | Funciona |
| 4 | En A, cerrar la caja y mirar el resumen | ⚠️ **Las ventas cobradas en B están en el arqueo de la caja de A.** El dinero se acredita a la caja abierta, no a la terminal que cobró |

### 1.5 — Fail-closed (importante)

| # | Paso | Esperado |
|---|---|---|
| 1 | En A (la dueña), con los dos flags apagados, cobrar normalmente | Funciona. La terminal dueña **nunca** debe quedar bloqueada |
| 2 | Desconectar la red de B un instante y volver al PdV | B queda en el estado restrictivo, no en el permisivo |

### 1.6 — Diálogo de selección de caja

| # | Paso | Esperado |
|---|---|---|
| 1 | Con 2+ cajas abiertas, entrar al PdV | Aparece el selector |
| 2 | Mirar el badge de la caja propia | Dice **"ESTE DISPOSITIVO"**, sin el "· COBRA" viejo (que ahora sería mentira la mitad de las veces) |

### 1.7 — Delivery

| # | Paso | Esperado |
|---|---|---|
| 1 | Con ambos flags apagados, en B abrir DELIVERY y seleccionar un pedido | El botón **PAGO** está deshabilitado, con tooltip |
| 2 | Apretar el botón de estado hasta ENTREGADO sobre un pedido sin cobrar | Avisa que el cobro se hace en A. **No** abre el diálogo de cobro |
| 3 | Activar "permitir registrar pagos" y repetir | El botón PAGO abre el cobro, con FINALIZAR deshabilitado |

---

## Parte 2 — Pagos registrados en los tickets de delivery

### 2.1 — Delivery sin nada cobrado (regresión)

| # | Paso | Esperado |
|---|---|---|
| 1 | Crear un delivery con ítems y zona de entrega, e imprimir el ticket | **No** aparece el bloque `PAGOS REGISTRADOS`. Dice `A COBRAR` con el total, igual que siempre |

### 2.2 — Cobro anticipado parcial

| # | Paso | Esperado |
|---|---|---|
| 1 | Crear un delivery de, por ejemplo, Gs. 100.000 + Gs. 15.000 de envío | Total 115.000 |
| 2 | Abrir el cobro y cargar Gs. 40.000 en efectivo, **sin finalizar**. Cerrar el diálogo | — |
| 3 | Reimprimir el ticket del delivery | Aparece `PAGOS REGISTRADOS` con `EFECTIVO … Gs. 40.000` |
| 4 | Mirar el cierre del ticket | `TOTAL 115.000`, `YA PAGADO -40.000` y **`SALDO A COBRAR` `Gs. 75.000` en grande** |
| 5 | Verificar que el número grande **no** sea 115.000 | Es el punto del cambio: si no, el repartidor cobra de más |

### 2.3 — Varias formas de pago y varias monedas

| # | Paso | Esperado |
|---|---|---|
| 1 | En un delivery, cargar EFECTIVO en Gs, EFECTIVO en USD y TRANSFERENCIA en Gs | — |
| 2 | Imprimir y mirar el bloque | `EFECTIVO` sale como **encabezado sin importe**, con `Gs.` y `$` indentados debajo; `TRANSFERENCIA` sale en **una sola línea** con su importe |
| 3 | Comparar con el resumen de cierre de caja enviado por WhatsApp | **La organización tiene que ser la misma** |
| 4 | Verificar el saldo | El monto en USD se convirtió con la cotización vigente |

### 2.4 — Vuelto

| # | Paso | Esperado |
|---|---|---|
| 1 | Cobrar con TRANSFERENCIA por más del total y registrar un VUELTO en efectivo | — |
| 2 | Imprimir | El `VUELTO` sale como línea propia, en negativo. **No** aparece una fila `EFECTIVO` negativa |
| 3 | Mirar el saldo | Descontó el vuelto: `TRANSFERENCIA − VUELTO` |

### 2.5 — Descuento global

| # | Paso | Esperado |
|---|---|---|
| 1 | En un delivery de Gs. 100.000, aplicar Gs. 20.000 de descuento (F9) y cobrar Gs. 80.000 | — |
| 2 | Imprimir el ticket del delivery | `TOTAL Gs. 80.000` y `PAGADO — NO COBRAR` |
| 3 | ⚠️ Verificar que **no** diga `SALDO A COBRAR 20.000` | Ese era el bug: el ticket de delivery ignoraba el descuento del pago |
| 4 | Comparar el TOTAL del ticket de delivery con el del comprobante de venta | **Tienen que coincidir** (antes no coincidían) |

### 2.6 — Venta a crédito

| # | Paso | Esperado |
|---|---|---|
| 1 | Cerrar un delivery a crédito (cliente con crédito habilitado) | — |
| 2 | Reimprimir el ticket | La forma de pago sale como `CREDITO (A CREDITO)` y el cierre dice `NO COBRAR` |
| 3 | Verificar que no parezca que entró plata | El sufijo es justamente para eso |

### 2.7 — Comprobante y pre-cuenta

| # | Paso | Esperado |
|---|---|---|
| 1 | Con un delivery cobrado con dos formas de pago, imprimir el comprobante | Bloque `FORMAS DE PAGO` con las dos, en vez de la línea única |
| 2 | Imprimir la pre-cuenta de un delivery con cobro parcial | Bloque `PAGOS REGISTRADOS` |
| 3 | **Regresión:** cobrar una venta de mostrador (sin delivery) e imprimir | Sigue la línea única `FORMA PAGO`. **Nada cambió** |

### 2.8 — Impresora de 58 mm

| # | Paso | Esperado |
|---|---|---|
| 1 | Con una impresora de 32 columnas, cobrar con una forma de pago de nombre largo (ej. `TRANSFERENCIA BANCARIA BBVA CONTINENTAL`) e imprimir | El nombre se trunca pero el importe queda **en la misma línea**, no huérfano abajo |
| 2 | Revisar todo el ticket | Ninguna línea se pasa del ancho |

---

## Parte 3 — Acreditaciones POS y transferencias

Esto arregla un bug que ya existía (reabrir el diálogo de cobro perdía el
destino de acreditación), y que con el cobro repartido entre terminales pasaba a
ser el camino normal.

| # | Paso | Esperado |
|---|---|---|
| 1 | Cobrar con una forma de pago vinculada a una **máquina POS**, cerrar el diálogo **sin finalizar** y volver a abrirlo | La línea sigue mostrando la máquina POS |
| 2 | Finalizar | Se crea la `AcreditacionPos` (verificar en *Financiero → Acreditaciones POS*) |
| 3 | Repetir con una forma de pago vinculada a **cuenta bancaria** | La transferencia se acredita al finalizar |
| 4 | Con los dos flags activos: cargar la línea POS en B y finalizar en A | La acreditación se crea igual |

---

## Parte 4 — Integridad de las líneas de cobro

Estos casos no dependen de tener dos terminales: son guards de backend.

| # | Paso | Esperado |
|---|---|---|
| 1 | Cobrar parcialmente una venta (cargar una línea y usar **Cobro Parcial**) | La ronda se registra |
| 2 | Abrir el menú ⋮ de esa línea e intentar **Eliminar** | **Deshabilitado**, con tooltip *"está imputada a una ronda de cobro parcial"* |
| 3 | Finalizar la venta. Volver a abrir el cobro desde Últimas Ventas | No se puede anular la ronda: la venta ya no está abierta |
| 4 | Cerrar la caja e imprimir el cierre | El total no cambió respecto de lo que mostraba el PdV |

## Parte 5 — Acreditaciones (POS y transferencias)

| # | Paso | Esperado |
|---|---|---|
| 1 | **Cobro mixto a crédito:** cliente con crédito, cuenta de Gs. 500.000. Cargar Gs. 300.000 con una forma de pago vinculada a **máquina POS** y cerrar el resto con **Cobrar a crédito** | Se crea la CPC por 200.000 **y** la `AcreditacionPos` por 300.000. Antes la acreditación no se creaba nunca |
| 2 | Verificar en *Financiero → Acreditaciones POS* | Aparece el movimiento |
| 3 | **Moneda cruzada:** elegir una máquina POS de una cuenta en guaraníes, apretar **F2** (cambia a dólares) y cargar `40` | La acreditación se **rechaza** y aparece el aviso "N acreditación(es) no se registraron". Antes acreditaba 40 guaraníes |
| 4 | **Atajos F4–F7:** elegir una forma de pago con POS, apretar F5 para cambiar a otra sin POS, y cargar la línea | La máquina POS se limpia. Antes quedaba la anterior y la plata iba a otra cuenta |
| 5 | **Delivery ya cobrado:** con un delivery EN_CAMINO cuya venta está CONCLUIDA, abrir el diálogo de delivery | El botón **PAGO** está deshabilitado. Antes se podía re-finalizar y **duplicaba** la acreditación |

## Parte 6 — Aritmética (verificar en Postgres si se puede)

| # | Paso | Esperado |
|---|---|---|
| 1 | Con la app en **modo servidor sobre Postgres**, hacer 3–4 ventas en efectivo y cerrar la caja | El resumen y el ticket de cierre muestran números, **no `NaN`** |
| 2 | Verificar el "esperado" contra la suma a mano | Coincide |
| 3 | **Cobro rápido sobre un delivery:** abrir un delivery, editar ítems (queda como venta rápida) y apretar **F2** | El total cobrado **incluye el envío**. Antes se regalaba |
| 4 | **Sin cotización:** desactivar la cotización del dólar, registrar un adelanto en USD en un delivery e imprimir | El ticket dice `VERIFICAR EN CAJA` y el motivo. **No** imprime un saldo ni dice PAGADO |
| 5 | **Sobrepago:** cobrar de más sin registrar vuelto e imprimir | Dice `VUELTO A ENTREGAR` con el monto. Antes decía PAGADO y el vuelto desaparecía |
| 6 | Imprimir un cierre de caja con una forma de pago de nombre largo en una impresora de 58 mm | El importe queda en la misma línea |

---

## Tests automáticos

```bash
npm run test:terminal-caja            # 30 asserts — la matriz del gate
npm run test:ticket-delivery-pagos    # 50 asserts — contenido de los tickets
npm run test:integridad-cobro         # 21 asserts — guards de las líneas de pago
npm run test:resumen-caja-numeros     #  8 asserts — aritmética del arqueo en Postgres
npm run test:delivery                 # regresión
npm run test:ticket-venta             # regresión
npm run test:cobro-parcial            # regresión
npm run check                         # AOT, antes de pushear
```
