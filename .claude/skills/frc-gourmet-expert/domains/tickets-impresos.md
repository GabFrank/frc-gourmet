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

- **`2× PIZZA`, no `2  PIZZA`.** El signo de multiplicación ata la cantidad al
  producto. Con sólo espacios, en un ticket angosto y con la vista cansada, el
  número de una línea se lee pegado al nombre de la de arriba. Vale para los
  tres tickets con ítems, y para el resumen en pantalla.
- **Totales en todas las monedas activas.** Los tickets con un total a pagar
  (#2, #3, #4) lo muestran también en las demás monedas configuradas, según la
  cotización vigente (`buscarCotizacion`). En el ticket de delivery se repite
  bajo el «A COBRAR»: el repartidor cobra en la puerta, sin sistema y sin nadie
  a quien preguntarle. Si falta la cotización, **la moneda se omite** — nunca
  se imprime un número convertido con rate 1.
- **Los anchos son 32, 42 o 48 columnas** según la impresora. `ticketColumns`
  **trunca** lo que no entra; para texto largo (direcciones, nombres de
  variación) usar líneas a ancho completo o envolver con `envolverDetalle`.
- **Strings en UPPERCASE**, como todo lo que va a BD y a papel.
- **Ningún handler de impresión es libre**: todos llevan `ensurePermission`,
  casi siempre con `DOCUMENTOS_IMPRIMIR_TICKET` más el permiso del dominio
  (`VENTAS_PDV`, `CAJA_MAYOR_OPERAR`, `CPC_COBRAR`…). La reimpresión del
  ticket de venta pide uno aparte, `DOCUMENTOS_REIMPRIMIR_TICKET_VENTA`.

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
