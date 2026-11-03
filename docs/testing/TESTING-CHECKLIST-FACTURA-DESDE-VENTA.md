# Checklist de pruebas — Factura desde el cobro (#325, #240)

Cubre:

1. **La factura sale por lo mismo que cobra la caja**: adicionales (también los de
   cada sabor), descuento del ítem, envío, recargo y descuento del cobro.
2. **El servidor valida lo que se factura**: una sola factura emitida por venta,
   renglones de la venta, total igual al de la venta.

> ⚠️ **Hace falta reiniciar la app**: cambia `create-factura` y hay un canal nuevo
> (`get-factura-propuesta-venta`). El hot reload de Angular no alcanza.

> ⚠️ **Cambia lo que se declara.** Las facturas nuevas con adicionales o envío
> salen por más que antes, y con descuento la base gravada pasa a ser la neta. Es
> lo correcto; conviene avisarle al contador.

---

## Preparación

- Moneda principal PYG, forma de pago EFECTIVO, **timbrado vigente** con un punto
  de expedición, una **caja abierta**.
- Productos: uno con IVA 10 que tenga un **adicional vinculado** con precio (p. ej.
  PIZZA + BORDE CATUPIRI ₲ 5.000), uno con IVA 5 y uno exento.
- Usuario con `FACTURACION_EMITIR` y `FACTURACION_ANULAR`.

Reglas que se prueban (decididas por Gabriel, 2026-11-02):

| Concepto | En la factura |
|---|---|
| Adicional del ítem | Suma al precio unitario del renglón y se nombra en la descripción |
| Descuento del ítem | Resta al precio unitario del renglón |
| Envío de un delivery | Renglón **SERVICIO DE DELIVERY**, IVA 10 |
| Aumento del cobro (F9) | Renglón **RECARGO**, IVA 10 |
| Descuento del cobro (F9) | Campo *Descuento*, repartido entre gravada 10, gravada 5 y exenta |
| Facturas por venta | **Una sola emitida**; para rehacerla, anular la anterior |
| Cuándo | En cualquier momento del cobro: se factura lo que hay cargado en ese momento |

---

## Parte 1 — La factura sale por lo cobrado (#325)

| # | Paso | Esperado |
|---|---|---|
| 1.1 | En el PdV, vender **2 × PIZZA** con el adicional BORDE (₲ 70.000 + 5.000) y **1 gaseosa**. Abrir el cobro | Total del cobro = 2 × 75.000 + gaseosa |
| 1.2 | Pulsar **Factura** | Aparece «Calculando la factura de la venta…» y después los renglones. La pizza sale **2 × ₲ 75.000** con «+ BORDE CATUPIRI» en la descripción. **TOTAL = total del cobro** |
| 1.3 | Intentar cambiar cantidad, precio o IVA de un renglón, agregar o quitar uno, o cambiar el descuento | No se puede: los campos son de solo lectura y no están los botones de agregar y quitar. Un aviso dice que los montos son los de la venta |
| 1.4 | Cambiar la **descripción** de un renglón y emitir | Se emite. El PDF tiene la descripción nueva y el mismo total que el cobro |
| 1.5 | Venta con un ítem con **descuento por ítem** | El renglón sale con el precio ya descontado; total = cobro |
| 1.6 | Venta **delivery** con envío ₲ 10.000 | Aparece el renglón SERVICIO DE DELIVERY ₲ 10.000, IVA 10; total = cobro |
| 1.7 | En el cobro, cargar un **descuento** con F9 (p. ej. ₲ 5.000) y después pulsar Factura | Campo Descuento = 5.000; total = cobro. Con productos de IVA 10 y 5, las dos gravadas bajan en proporción |
| 1.8 | En el cobro, cargar un **aumento** con F9 y pulsar Factura | Aparece el renglón RECARGO, IVA 10; total = cobro |
| 1.9 | Pizza mitad y mitad con adicional en un sabor | La descripción muestra los sabores y el adicional; total = cobro |
| 1.10 | Activar **Resumido** | Un renglón CONSUMISION por el total neto, descuento 0. Emitir: se acepta |
| 1.11 | Resumido ida y vuelta (activar y desactivar) | Vuelven los renglones y el descuento de antes |
| 1.12 | Un ítem **cancelado** en la venta | No aparece en la factura |
| 1.13 | En un delivery (1.6) o con recargo (1.8), intentar editar la descripción del renglón SERVICIO DE DELIVERY o RECARGO | No se puede: es de solo lectura |
| 1.14 | Mientras dice «Calculando…», intentar activar Resumido o Emitir | Los dos están deshabilitados |
| 1.15 | Cortar la red del servidor (modo cliente) y pulsar Factura | Mensaje de error en rojo con **Reintentar**; no se puede emitir. Volver la red, Reintentar: carga |

## Parte 2 — El servidor lo verifica (#240)

| # | Paso | Esperado |
|---|---|---|
| 2.1 | Facturar dos veces la misma venta (cerrar el diálogo de factura y volver a pulsar Factura) | La segunda se rechaza: «La venta ya tiene la factura 001-001-…; anulala para emitir otra». **El próximo número no avanza** |
| 2.2 | Anular esa factura (*Facturas* → anular) y volver a facturar la venta | Se emite con el número siguiente |
| 2.3 | Facturar, **después** cargar un descuento con F9 e intentar facturar de nuevo | Rechazada por ya tener factura. Para corregirla, anular y rehacer (decisión: se puede facturar en cualquier momento) |
| 2.4 | Factura **manual** desde *Facturas* → nueva, con dos renglones y descuento | Se emite; los totales y el IVA del PDF son los que muestra el diálogo (IVA sobre la base después del descuento) |
| 2.5 | Dos cajeros pulsan Emitir a la vez sobre la misma venta (dos terminales, modo servidor) | Una sola factura; la otra recibe el mensaje de 2.1. Ningún número repetido |
| 2.6 | Pre-impreso con número editable: tipear un número **ya usado** en ese punto de expedición | Rechazo «El número … ya fue usado»; el contador no se mueve |
| 2.7 | Factura manual: dejar un renglón y pulsar Enter dentro de un campo | No se borra ningún renglón (antes Enter disparaba el botón de quitar) |

## Parte 3 — Lo que no cambió

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Buscar el cliente por RUC al facturar | Igual que antes: autocompleta y vincula |
| 3.2 | Pre-impreso con número editable | Se registra el número tipeado y la numeración avanza desde ahí |
| 3.3 | Modo cliente (PC conectada a un servidor) | Se factura igual que en el servidor: todo viaja por `/api/rpc` |

---

Pruebas automáticas: `npm run test:factura-venta` (SQLite) y el bloque [G] de
`npm run test:locks-pg` (Postgres, concurrencia desde dos procesos).
