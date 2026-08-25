# Manual de pruebas — Panel de pedidos web y alta de delivery

Rama `feat/ticket-detalle-variacion`. Cubre los ajustes de UI del módulo de
delivery, el gate de impresión de cocina y la dirección opcional.

**Modo requerido:** `server` para todo lo que involucre pedidos web; el resto
corre en `standalone`. Hace falta una **caja abierta**.

> Lo que se prueba acá es sobre todo **dónde caen las cosas en la pantalla**.
> Conviene tener el diálogo de delivery abierto y ancho (maximizado), porque
> varios de los bugs sólo se veían con el panel derecho a media pantalla.

---

## 0 · Preparación

1. *Ventas → Config Tienda Online*: dejá **«Tienda activa (toma pedidos)»**
   apagada. Guardá. La primera sección prueba justamente ese estado.
2. Tené al menos **dos deliveries** en la lista y, más adelante, **un pedido
   web pendiente** y **un retiro aceptado** (se generan desde `/tienda`).
3. Al menos un producto con **sector asignado**, para las pruebas de cocina.

---

## 1 · Tienda online apagada: no debe quedar rastro de pedidos web

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 1.1 | Abrí el PdV y mirá el botón **DELIVERY** | Puede tener el badge **naranja** de repartos pendientes. **No** tiene el badge rojo de pedidos web |
| 1.2 | Abrí el diálogo de delivery | En la fila de *ESTADO* / *NUEVO DELIVERY* **no** aparece el botón «N PEDIDOS WEB» |
| 1.3 | Sin ninguna fila seleccionada, mirá el panel derecho | Muestra sólo el ícono y «SELECCIONE UN DELIVERY», centrado y ocupando **todo** el lado derecho |
| 1.4 | Dejá el diálogo abierto un minuto | No hay actividad de red hacia los pedidos online (el poll de 15 s no arranca) |

---

## 2 · La bandeja confirma; la lista muestra el trabajo en curso

Encendé la tienda en *Config Tienda Online* y volvé a abrir el diálogo (la
config se lee al abrir, no en caliente).

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2.1 | Con un pedido pendiente, abrí el diálogo | Botón rojo **«N PEDIDOS WEB»** al extremo derecho de la fila de *ESTADO* / *NUEVO DELIVERY* |
| 2.2 | Mirá el panel derecho | **Sólo** pedidos esperando confirmación, con *ACEPTAR* / *RECHAZAR* |
| 2.3 | **Aceptá** un pedido DELIVERY | Sale de la bandeja y entra en la lista de la izquierda como `ABIERTO`, con su costo de envío |
| 2.4 | Mirá la columna ESTADO de esa fila | Chip **WEB** junto al estado. Las filas que cargó el cajero llevan **LOCAL** |
| 2.5 | **Aceptá** un pedido de RETIRO | También entra en la lista, aunque no genere ningún reparto |
| 2.6 | Mirá su columna DELIVERY | Chip verde **RETIRAR** en lugar de un monto; ENTREGADOR en `-` |
| 2.7 | Vaciá la bandeja | Desaparecen el botón y el panel; vuelve «SELECCIONE UN DELIVERY» |

---

## 2b · Retiro tomado por teléfono (sin la web)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2b.1 | *NUEVO DELIVERY* | Arriba de todo, un toggle **DELIVERY / RETIRAR**, con DELIVERY marcado |
| 2b.2 | Tocá **RETIRAR** | Desaparecen **DIRECCIÓN** y **PRECIO DELIVERY**. Bajo NOMBRE aparece «Obligatorio: identifica el pedido en el mostrador» |
| 2b.3 | Poné sólo el teléfono, sin nombre | **CREAR DELIVERY** queda deshabilitado |
| 2b.4 | Agregá el nombre y creá | Se crea. En la lista: chip **RETIRAR**, canal **LOCAL**, envío 0 |
| 2b.5 | Seleccionalo y mirá el footer | Todos habilitados **menos REPARTIDOR**, que además explica por qué al pasar el mouse |
| 2b.6 | Abrí el menú **ESTADO** | Ofrece `PARA_ENTREGA` y `ENTREGADO`. **No** ofrece `EN_CAMINO` |
| 2b.7 | Cobralo con **PAGO** | Se cobra por el mismo diálogo que un delivery, con envío en cero |
| 2b.8 | Marcá **PARA_ENTREGA** y mirá la columna ESPERA | El reloj **se congela** y la fila deja de ponerse roja: falta que venga el cliente, y eso no depende del local |
| 2b.9 | Volvé a *NUEVO DELIVERY* → **RETIRAR** → volvé a **DELIVERY** | Reaparecen DIRECCIÓN y PRECIO, vacíos |
| 2b.10 | Editá un delivery ya creado (**DATOS**) | El toggle se ve pero está **deshabilitado**: cambiar el modo implicaría rehacer envío y repartidor |

---

## 2c · El resumen que se le manda al cliente

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2c.1 | Seleccioná un delivery con varios ítems | El panel derecho es un **comprobante sobre papel blanco**, con el nombre del local arriba |
| 2c.2 | Mirá un ítem con variación | Dice lo mismo que el ticket: `1  x  PIZZA` y debajo `GRANDE - 1/2 CALABRESA + 1/2 MARGUERITO`, los `+ EXTRAS` en verde y los `sin ...` en rojo |
| 2c.3 | Mirá los totales | TOTAL en guaraníes y debajo el mismo total en las **otras monedas configuradas** |
| 2c.4 | Mirá el sello | **A COBRAR** en rojo, o **PAGADO** en verde si ya se cobró |
| 2c.5 | Sacale una foto con el celular | Se lee como un comprobante, no como un pedazo de pantalla. No hay botones dentro del papel |
| 2c.6 | Con un ítem que tenga adicionales | El precio de la línea **incluye** los adicionales y la suma cierra con el TOTAL |
| 2c.7 | En un retiro | **No** aparece la fila DIRECCIÓN, y el encabezado dice RETIRAR |

---

## 3 · Badges del botón DELIVERY del PdV

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 3.1 | Con repartos pendientes y pedidos web pendientes | Dos círculos en la **esquina superior derecha** del botón, uno al lado del otro. Antes caían sobre el medio, encima del texto |
| 3.2 | Mirá los colores | **Rojo** = pedidos web por aceptar (pide una decisión ahora). **Naranja** = repartos en curso |
| 3.3 | Apagá la tienda online y reabrí el PdV | Queda sólo el naranja. El conteo de repartos **no** depende de la tienda |
| 3.4 | Que entre un pedido web nuevo con el PdV abierto | Suena el beep y el badge rojo sube |

---

## 4 · Alta de delivery: dirección y navegación por teclado

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 4.1 | *NUEVO DELIVERY* y mirá el campo DIRECCIÓN | **No** dice «Obligatoria» debajo |
| 4.2 | Escribí sólo el teléfono y dejá la dirección vacía | El botón **CREAR DELIVERY** se habilita |
| 4.3 | Creá el delivery sin dirección | Se crea. En el detalle, DIR muestra `-` |
| 4.4 | *Configuración del PdV* → activá «Dirección obligatoria» y repetí 4.1 | Vuelve el hint «Obligatoria» y el botón queda deshabilitado sin dirección. **Volvé a apagarlo** antes de seguir |
| 4.5 | Con la dirección opcional: teléfono → `Enter` | Foco al NOMBRE |
| 4.6 | `Enter` de nuevo | Foco a DIRECCIÓN |
| 4.7 | `Enter` | Foco a PRECIO DELIVERY, con el desplegable abierto |
| 4.8 | Elegí una zona y `Enter` | Foco a OBSERVACIÓN |
| 4.9 | **`Enter` en OBSERVACIÓN** | Foco al botón **CREAR DELIVERY** (se ve el anillo de foco). Esto **nunca** había funcionado |
| 4.10 | `Enter` otra vez | Crea el delivery |

---

## 5 · Cocina: que el papel salga

Requiere una impresora configurada con rol COMANDA en el sector del producto.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 5.1 | Creá un **delivery**, agregale un ítem de un producto con sector y enviá | Sale la comanda **en la impresora del sector**. Antes el ítem aparecía en el KDS y el papel no salía nunca, sin ningún error |
| 5.2 | Lo mismo con un **pedido web** aceptado | Igual: comanda por sector |
| 5.3 | Venta rápida de mostrador (sin mesa, sin comanda, sin delivery) | **No** sale comanda de cocina. Es el único caso que no va |
| 5.4 | Un ítem de **PIZZA** (producto con variación) | El encabezado dice `1  x  PIZZA` y la línea siguiente **sólo** el tamaño (`GRANDE`). No `PIZZA GRANDE` |
| 5.6 | Mirá la cantidad en los tres tickets | `1  x  PIZZA`: la **x separada** del número. Con cantidades de dos dígitos la x no se corre de columna |
| 5.7 | Cargá un cliente con tilde en mayúscula (ej. «ÁNGEL») e imprimí | Sale **ANGEL**, no `?NGEL`. El charset de la impresora no tiene `Á` y antes salía un signo de pregunta |
| 5.8 | Imprimí el ticket de un **delivery sin cobrar** | Bajo «A COBRAR» aparece el monto en guaraníes **y en las demás monedas**: el repartidor cobra en la puerta sin sistema |
| 5.9 | Imprimí el ticket de un **retiro** | Encabezado **RETIRO EN LOCAL**, sin dirección, sin zona y sin repartidor |
| 5.5 | Destildá «Mostrar en el nombre del producto» en la presentación y reimprimí | La línea del tamaño **no** se imprime |

---

## 6 · Concurrencia (opcional, dos terminales)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 6.1 | Dos operadores sobre el mismo pedido pendiente: A pulsa *ACEPTAR*, B pulsa *RECHAZAR* casi a la vez | El pedido queda en **uno** de los dos estados finales de forma coherente. Si gana el rechazo, **no** puede quedar en «En preparación» con venta viva ni con comanda impresa |
| 6.2 | Avanzá el estado de un pedido con delivery y, si aparece un error de desfasaje, **repetí la acción** | La segunda vez completa: el pedido se pone al día sin volver a pedirle la transición al delivery |
