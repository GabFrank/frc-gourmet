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
| 1.3 | Sin ningún delivery seleccionado, mirá el panel derecho | Muestra sólo el ícono y «SELECCIONE UN DELIVERY», centrado y ocupando **todo** el lado derecho |
| 1.4 | Dejá el diálogo abierto un minuto | No hay actividad de red hacia los pedidos online (el poll de 15 s no arranca) |

---

## 2 · Tienda encendida: una sola cola, en el lugar del detalle

Encendé la tienda en *Config Tienda Online* y volvé a abrir el diálogo (la
config se lee al abrir, no en caliente).

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2.1 | Con al menos un pedido pendiente, abrí el diálogo | Aparece el botón rojo **«N PEDIDOS WEB»** al **extremo derecho** de la fila de *ESTADO* / *NUEVO DELIVERY*, no arriba junto al título |
| 2.2 | Mirá el panel derecho | Una sola sección **PEDIDOS DE LA WEB** con el contador. **No** hay una segunda sección «Retiros en curso» al pie |
| 2.3 | Compará con el detalle: seleccioná un delivery de la tabla y volvé a deseleccionar (botón «N PEDIDOS WEB») | La cola y el detalle arrancan **exactamente en la misma x** y tienen el mismo ancho. Antes la cola quedaba más a la izquierda y más angosta |
| 2.4 | Con pedidos pendientes **y** un retiro aceptado a la vez | Los dos están en la **misma lista**, ordenados por antigüedad (el que espera hace más tiempo, arriba) |
| 2.5 | Mirá los chips de cada tarjeta | Chip **DELIVERY** (azul) o **RETIRO** (verde). El retiro además tiene el borde izquierdo verde |
| 2.6 | Mirá los botones de cada tarjeta | Pendiente → *ACEPTAR* / *RECHAZAR*. Retiro aceptado → *COBRAR* (o *ENTREGADO* si ya se cobró) y la línea de estado («En preparación») |
| 2.7 | Aceptá un pedido | Desaparece de la cola; si es DELIVERY entra en la tabla de la izquierda, si es RETIRO se queda en la cola pero ahora con *COBRAR* |
| 2.8 | Cobrá el retiro y volvé | La tarjeta pasa de «SIN COBRAR» a **COBRADO** en verde y el botón cambia a *ENTREGADO* |
| 2.9 | Vaciá la cola (aceptando o rechazando todo) | Desaparecen el botón «PEDIDOS WEB» y el panel, y vuelve el «SELECCIONE UN DELIVERY» ocupando todo el lado derecho |

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
| 5.4 | Un ítem de **PIZZA** (producto con variación) | El encabezado dice `1 PIZZA` y la línea siguiente **sólo** el tamaño (`GRANDE`). No `PIZZA GRANDE` |
| 5.5 | Destildá «Mostrar en el nombre del producto» en la presentación y reimprimí | La línea del tamaño **no** se imprime |

---

## 6 · Concurrencia (opcional, dos terminales)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 6.1 | Dos operadores sobre el mismo pedido pendiente: A pulsa *ACEPTAR*, B pulsa *RECHAZAR* casi a la vez | El pedido queda en **uno** de los dos estados finales de forma coherente. Si gana el rechazo, **no** puede quedar en «En preparación» con venta viva ni con comanda impresa |
| 6.2 | Avanzá el estado de un pedido con delivery y, si aparece un error de desfasaje, **repetí la acción** | La segunda vez completa: el pedido se pone al día sin volver a pedirle la transición al delivery |
