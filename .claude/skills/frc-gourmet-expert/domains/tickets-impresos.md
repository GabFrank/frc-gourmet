# Tickets impresos — qué imprime el sistema y para qué

> Trece documentos distintos salen por impresora térmica. Todos comparten el
> mismo motor (`electron/utils/ticket.utils.ts` → ESC/POS), pero **no comparten
> propósito**: cada uno se escribió para que alguien concreto haga algo
> concreto con el papel en la mano. Antes de tocar cualquiera, preguntarse
> quién lo recibe y qué decide con él.

Casi todo vive en `electron/handlers/documentos-tickets.handler.ts`.

---

## El catálogo

| # | Ticket | Handler IPC | Quién lo recibe | Para qué |
|---|---|---|---|---|
| 1 | **Comanda de cocina** | `print-comanda` | El cocinero del sector | Qué preparar. **Sin precios**: al cocinero no le sirven y ocupan lugar |
| 2 | **Ticket de venta** | `print-venta-ticket` | El cliente | Comprobante de lo que pagó |
| 3 | **Pre-cuenta** | `print-precuenta` | El cliente, en la mesa | Qué va a pagar, **antes** de pagar. Mismo builder que el #2 con `isPrecuenta: true` |
| 4 | **Ticket de delivery** | `delivery-imprimir-ticket` | El repartidor | Adónde va, y **cuánto cobrar** |
| 5 | **Recibo de cobro CPC** | `print-recibo-cobro-cuota-ticket` | El cliente que paga una cuota | Constancia de que pagó |
| 6 | **Recibo de pago CPP** | `print-recibo-pago-cuota-ticket` | El proveedor que cobra | Constancia de que se le pagó |
| 7 | **Retiro de caja** | `print-retiro-caja-ticket` | Quien retira la plata | Constancia con firma |
| 8 | **Vale / adelanto** | `print-vale-ticket` | El funcionario | Constancia del adelanto, con firma |
| 9 | **Pagaré CPC** | `print-pagare-cpc-ticket` | El cliente a crédito | Documento de la deuda |
| 10 | **Acreditación POS** | `print-acreditacion-pos-ticket` | Quien concilia | Constancia de la acreditación bancaria |
| 11 | **Conteo de caja** | `print-conteo-caja-ticket` | El cajero | Arqueo: qué había en el cajón |
| 12 | **Cierre de caja** | `print-cierre-caja` | El cajero y el gerente | Resumen del turno |
| 13 | **Página de prueba** | `print-test-page` | El técnico | Verificar que la impresora responde |

---

## Cómo se agrupan

**Los tres que listan productos** (#1 comanda, #2/#3 venta y pre-cuenta, #4
delivery) son los únicos que muestran ítems, y por eso los únicos donde importa
el **detalle de variación** — tamaño, sabores, ingredientes sacados,
adicionales y observaciones. Los tres lo arman con la misma función,
`cargarDetalleDeItems`, y esa unicidad es deliberada: cuando cada uno lo
componía por su cuenta, el ticket del cliente imprimía «1 PIZZA» mientras la
comanda decía «PIZZA GRANDE CALABRESA SIN CEBOLLA». El panel del PdV consume
la misma fuente vía `get-detalle-variacion-items`.

**Los cinco recibos con firma** (#5 a #9) salen casi todos de
`printReciboGenericoInternal`, parametrizado por título y etiquetas. Si hace
falta uno nuevo del mismo tipo, se agrega ahí y no se copia el bloque.

**Los dos de caja** (#11, #12) son resúmenes: no tienen destinatario externo,
se archivan.

---

## Convenciones que valen para todos

- **La cantidad va con `ticketCantidad(qty, ancho)`**, que produce `1  x  ` —
  la `x` **separada** del número, no pegada. `1x` se lee como un código; `1  x`
  se lee como «uno por». El bloque es de ancho fijo para que la `x` caiga en la
  misma posición en todas las líneas aunque una diga 1 y la siguiente 12; con
  tres dígitos empuja la `x` un lugar en vez de desbordar la columna. La
  columna CANT es **6 fija** por eso: con 5 no entra la separación.
- **Totales en todas las monedas activas.** Los tickets con un total a pagar
  (#2, #3, #4) lo muestran también en las demás monedas configuradas, según la
  cotización vigente (`buscarCotizacion`). En el ticket de delivery se repite
  bajo el «A COBRAR»: el repartidor cobra en la puerta, sin sistema y sin nadie
  a quien preguntarle. Si falta la cotización, **la moneda se omite** — nunca
  se imprime un número convertido con rate 1.
- **Los anchos son 32, 42 o 48 columnas** según la impresora. `ticketColumns`
  **trunca** lo que no entra; para texto largo (direcciones, nombres de
  variación) usar líneas a ancho completo o envolver con `envolverDetalle`.

- ⚠️ **El papel es CP437, no Unicode.** Ver la sección siguiente: es el gotcha
  que más silenciosamente rompe tickets.
- **Strings en UPPERCASE**, como todo lo que va a BD y a papel.
- **Ningún handler de impresión es libre**: todos llevan `ensurePermission`,
  casi siempre con `DOCUMENTOS_IMPRIMIR_TICKET` más el permiso del dominio
  (`VENTAS_PDV`, `CAJA_MAYOR_OPERAR`, `CPC_COBRAR`…). La reimpresión del
  ticket de venta pide uno aparte, `DOCUMENTOS_REIMPRIMIR_TICKET_VENTA`.

---

## El charset: por qué en el papel aparecen signos de pregunta

Las térmicas imprimen con **CP437** (`characterSet` de la impresora, default
`PC437_USA`). La librería manda `?` por **todo** lo que no entra en ese
charset, y no avisa: el ticket sale, no hay error en ningún log, y en el papel
hay un signo de pregunta donde iba un carácter.

Verificado carácter por carácter el 2026-08-25:

| Se pierden | Sobreviven |
|---|---|
| `×` `—` `–` `→` `€` `₲` `✓` **`Á`** | `á é í ó ú ñ Ñ ü É ¿ ¡ · º °` |

**Lo de `Á` es lo que más muerde**, y era un bug previo a todo esto: como
**todos los strings van en UPPERCASE**, un cliente llamado «Ángel» se imprimía
**«?NGEL»** en todos los tickets. No es un caso de borde — es cualquier nombre
con tilde en la primera letra.

`sanitizarParaTicket` (en `ticket.utils.ts`) lo resuelve, y corre **al
construir cada línea, no al mandarla**. El orden importa: `→` pasa a `->`, o
sea un carácter que se vuelve dos, y sanear después de calcular el padding
correría las columnas. Como efecto colateral bueno, los tests ven exactamente
lo que sale impreso.

Qué hace:

- Tipográficos con equivalente ASCII: `×`→`x`, `—`→`-`, `→`→`->`, `…`→`...`,
  comillas curvas a rectas, `₲`→`Gs.`.
- Acentuadas que el charset no tiene: se les saca el acento. **«ANGEL» se lee;
  «?NGEL» no.**
- El `·` se degrada a `-` **aunque CP437 lo tenga**: en 203dpi queda casi
  invisible, y el separador de variación («GRANDE · BACON») es justo donde
  tiene que leerse.

**Si agregás texto a un ticket, no hace falta que llames al saneador**: los
constructores (`ticketText`, `ticketKv`, `ticketColumns`) ya lo aplican. Lo que
sí hace falta es no asumir que un símbolo lindo va a salir. Tests en
`scripts/test-ticket-venta-e2e.ts`, bloque «charset».

---

## Ruteo: qué impresora recibe cada cosa

Dos roles en `sector_impresoras` (`SectorImpresoraRol`):

- **`COMANDA`** — la impresora de un sector de cocina. La comanda se rutea por
  la M2M `producto_sectores`: un pedido con productos de tres sectores imprime
  **tres** comandas distintas, cada una con sus ítems.
- **`TICKET_VENTA`** — la impresora del mostrador. Recibe todo lo demás.

El ticket de delivery usa `TICKET_VENTA`, no `COMANDA`: es el papel que se va
con el repartidor, no el que se queda en la cocina. Un delivery imprime **las
dos cosas** — su comanda por sector y su ticket de reparto.

> ⚠️ **Quién va a cocina lo deciden TRES gates que hay que mover juntos.**
> Detalle y tabla en [cocina-impresion.md](cocina-impresion.md) — es el bug que
> hizo que ningún delivery imprimiera su comanda durante días, en silencio.

---

## Modo del pedido en el ticket de delivery

El mismo ticket sirve para reparto y para retiro; lo que cambia es el
encabezado —`DELIVERY` o **`RETIRO EN LOCAL`**— y que en un retiro se omiten
dirección, zona y repartidor, que no existen. Ver
[pedidos-online.md](pedidos-online.md) y el modo `RETIRO` de `Delivery`.

---

## Dónde tocar cada cosa

| Querés cambiar… | Andá a |
|---|---|
| El contenido de un ticket | El `print*Internal` correspondiente |
| El detalle de variación de un ítem | `cargarDetalleDeItems` — cambia los tres a la vez |
| Cómo se dibuja una línea | `electron/utils/ticket.utils.ts` (`ticketText`, `ticketKv`, `ticketColumns`) |
| El encabezado de empresa | `ticketHeaderEmpresa` |
| A qué impresora va | `sector_impresoras` + el rol que pide el handler |

Tests: `scripts/test-ticket-venta-e2e.ts` cubre contenido del ticket de venta y
pre-cuenta, el detalle de variación y el gate de cocina.
