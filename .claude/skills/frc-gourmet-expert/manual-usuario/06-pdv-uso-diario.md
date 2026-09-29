# Capítulo 6 — PdV: uso diario

El módulo más usado. Ventas en mesa, mostrador y delivery. Cobro multi-pago, multi-moneda. Gestión de comandas (cuentas individuales). Atajos de teclado.

## Pre-requisitos

- Tu usuario tiene rol con permiso de PdV.
- Hay productos con precio.
- Existe al menos un Dispositivo configurado (capítulo 2).
- Existe al menos una Forma de Pago.

## 1. Abrir el PdV

**Menu → Ventas → Dashboard → "Abrir PdV"** o desde tarjeta del Dashboard.

Si **NO tenés una caja abierta**, aparece un dialog: "¿Querés abrir una caja nueva?"

### Apertura de caja

Step 1: **Conteo Apertura**

Tabs por moneda. En cada moneda, ingresar cuántos billetes/monedas tenés:
- 100.000 PYG: 0
- 50.000 PYG: 5
- 20.000 PYG: 10
- 10.000 PYG: 20
- 5.000 PYG: 30
- 2.000 PYG: 0
- 1.000 PYG: 50
- 500 PYG: 100
- 100 PYG: 200

Sistema calcula total.

Step 2: **Resumen**

- Dispositivo (auto-detectado por MAC).
- Moneda principal.
- Conteo total.
- Confirmar → Caja queda **ABIERTA**.

Si rechazás abrir caja, la pestaña del PdV se cierra automáticamente.

### Una sola caja abierta por terminal

Cada terminal puede tener **una sola caja abierta a la vez**. Si intentás abrir
una segunda, el sistema te avisa:

> **Ya hay una caja abierta en esta terminal (caja #123). Cerrá esa caja antes de abrir otra.**

Pasa sobre todo con el **doble click** en «ABRIR CAJA» (el segundo click es el
que recibe el aviso: la caja del primero quedó abierta y en uso) y cuando alguien
abrió la caja del turno desde la PWA o desde *Caja Mayor → Abrir caja desde
conteo* y en esta PC no se actualizó la pantalla.

Que haya una sola caja por terminal **no cambia el modelo de caja compartida**:
otra terminal se puede seguir uniendo a tu caja para lanzar ítems, igual que
antes.

**El conteo que cargaste no queda a medias.** Si el sistema rechaza la apertura,
el conteo de billetes que acabás de contar **no se guarda**: no vas a encontrar
conteos de apertura fantasma en *Financiero → Conteos*, ni al día siguiente ni
nunca. El sistema revisa si la terminal ya tiene caja **antes** de guardar nada.
Vale también para la PWA: la lista de terminales libres que ves al entrar es una
foto de ese momento, así que si alguien abrió esa caja mientras vos cargabas, el
aviso aparece al tocar **ABRIR** — y tampoco deja conteo suelto.

### Si la caja abierta viene de una jornada anterior

Al entrar al PdV, si la **única** caja abierta se abrió antes del comienzo de la
jornada de hoy (el horario de inicio lo configura el local; por defecto las
07:00), el sistema ya **no se une sola**. Te pregunta:

> **La caja #123 está abierta desde 24/09/2026 14:39, o sea de una jornada anterior. ¿La usás igual o la cerrás antes de vender?**

Con dos botones: **Usar igual** (seguís vendiendo en esa caja) o **Ir a
cerrarla** (te lleva al conteo de cierre y después abrís una nueva).

**Por qué importa:** si te unís sin darte cuenta a la caja de ayer, las ventas de
hoy caen en el arqueo de ayer. Eso ya pasó una vez: el almuerzo de un viernes
quedó dentro de la caja del jueves. Como **las cajas no se reabren**, después no
hay forma de separarlas.

## 2. Pantalla del PdV

```
┌────────────────────────────────────────────────────────────────────┐
│  CAJA #5 — Abierta hace 02:35 hs               [F1 COBRAR]         │
├────────────────────────────────────────┬───────────────────────────┤
│ MESA / COMANDA / DELIVERY              │  TABS: MESAS COMANDAS     │
│  Mesa 3 — 4 personas                   │  ATAJOS  CATEGORÍAS       │
│  [👤 Juan García]                      │                           │
│                                        │  ┌──┬──┬──┬──┬──┐         │
│ ┌──────────────────────────────────┐   │  │ 1│ 2│ 3│ 4│ 5│         │
│ │ Cant Producto         Total      │   │  ├──┼──┼──┼──┼──┤         │
│ │  1   Pizza Margherita 45.000     │   │  │ 6│ 7│ 8│ 9│10│         │
│ │  2   Coca 500ml        8.000     │   │  └──┴──┴──┴──┴──┘         │
│ │       (sub: 16.000)              │   │                           │
│ └──────────────────────────────────┘   │  Sector: ▼ Salón A        │
│                                        │                           │
│ Subtotal: 61.000                       │                           │
│ Total:    61.000                       │                           │
│                                        │                           │
│ [F3 BUSCAR PRODUCTO]                   │                           │
│ [F4 CANCELAR] [F2 COBRO RÁPIDO]        │                           │
└────────────────────────────────────────┴───────────────────────────┘
```

### Panel derecho: tabs

- **MESAS**: grid de mesas con número y estado (verde=disponible, rojo=ocupada).
- **COMANDAS**: si están habilitadas, tarjetas físicas con número/código.
- **ATAJOS**: botones rápidos configurados.
- **CATEGORÍAS**: items visuales con imagen (UI parcial).

### Panel izquierdo: detalle de la venta activa

- Datos de mesa / comanda / delivery.
- Cliente vinculado (opcional).
- Tabla de items de la venta.
- Totales por moneda.
- Botones de acción.

## 3. Seleccionar mesa

Click en mesa disponible (verde) → se selecciona y carga sus datos:
- Si la mesa NO tiene venta abierta: tabla items vacía, totales 0.
- Si la mesa YA tiene venta abierta: carga items existentes.

La mesa pasa a OCUPADO al agregar el primer item.

### Filtrar mesas por sector

Selector "Sector" en el panel derecho:
- "Todos" → muestra todas.
- "Salón A" → solo mesas del salón A.

### Reservar mesa (UI parcial)

Si la mesa tiene reserva, aparece icono. (Sistema completo: TODO.)

## 4. Agregar productos

### Buscar y agregar

1. Tab "ATAJOS" o "CATEGORÍAS" → click en el producto.
2. O **F3** o botón "Buscar producto" → dialog de búsqueda → escribir nombre → seleccionar.

**Atajos rápidos**:
- Escribir cantidad antes con `*`: `3*` + buscar pizza → agrega 3 pizzas.

### Si producto tiene receta — Personalizar

Aparece dialog "Personalizar producto":

**Columna izquierda — Ingredientes**:
- Verde (incluido) / Rojo (removido) — click para toggle (solo opcionales).
- Naranja (intercambiado) — usar select para elegir alternativa.
- Texto compacto: ingredientes fijos (no interactivos).

**Columna derecha — Extras y observaciones**:
- Adicionales con precio (chips verde con +valor) — click para seleccionar.
- Observaciones predefinidas (chips celeste).
- Campo de observación libre.

**Footer**:
- Selector cantidad +/-.
- Desglose precio.
- Total.

Click "Agregar" → se suma al carrito.

### Si producto tiene variaciones (multi-sabor) — Pizza

Aparece dialog "Seleccionar variación":

Step 1: Elegir tamaño (Mediana / Grande).
Step 2: Elegir sabor(es) — máximo 2 según `PdvConfig.pizzaMaxSabores`.
Step 3: Personalizar (igual que arriba, pero por sabor).

Confirmar → se agrega con `cantidadSabores=2`, `proporcion=0.5` cada uno.

**Cálculo del precio**:
- Si `pizzaEstrategiaPrecio = MAYOR_PRECIO`: el más caro de los sabores.
- Si `pizzaEstrategiaPrecio = PROMEDIO`: promedio.

## 5. Editar item

Click en menu **⋮** del item → **"Editar"**.

Dialog `Editar item`:
- Cantidad.
- Descuento (fijo o %, chips rápidos: 5/10/15/20/25/50%).
- Redondeo a múltiplos de 500 PYG.
- Observaciones libres.

Guardar → el original se marca como **MODIFICADO**, se crea una versión nueva. El total cuenta la versión nueva.

## 6. Cancelar item

Click ⋮ → **"Cancelar"**.

Estado item → CANCELADO. Aparece tachado en la tabla. NO suma al total.

No se borra (queda en historial con `canceladoPor`, `horaCancelado`).

Tampoco sale impreso: ni en la pre-cuenta, ni en el ticket de venta, ni en la
comanda de cocina. El total del ticket es el mismo que muestra el PdV.

## 7. Cliente

### Asignar nombre rápido

Click "👤 Nombre" en card de mesa → ingresar nombre → guardar.

Se guarda en `Venta.nombreCliente` (sin crear cliente registrado).

### Vincular cliente registrado

Click ícono de buscar (🔍 con persona) → buscar por nombre, RUC, teléfono → seleccionar.

Útil para clientes habituales que están registrados.

## 8. Cobrar venta

**F1** o botón "COBRAR".

Dialog `Cobrar venta`:

**Top**: totales en cada moneda configurada (con banderas y cotizaciones).

**Izquierda (55%)**: tabla de líneas de pago.

**Derecha (45%)**: botones de monedas (F1-F3) + formas de pago (F4-F7) + input valor + indicador PAGO/VUELTO.

### Agregar línea de pago

1. Elegir moneda (click botón o F1/F2/F3).
2. Elegir forma de pago (F4-F7).
3. Ingresar monto.
4. **Enter** → se agrega la línea.

Soporta multi-pago: una venta puede pagarse parcialmente con tarjeta + el resto en efectivo.

### Vuelto

Si el monto pagado > total → aparece "VUELTO" automáticamente. Podés:
- Devolverlo en efectivo.
- Pasarlo como crédito (vuelto en otra moneda → línea VUELTO).

### Descuento / aumento global

**F9** → dialog dedicado:
- Porcentaje o monto fijo.
- Redondeo automático.
- Motivo (obligatorio).
- Autorizado por: usuario actual o seleccionar otro.

### Cobro rápido (F2)

Atajo: cobra todo en moneda principal + forma principal con un click. Útil para mostrador rápido.

### División de cuenta

Botón "Dividir cuenta" → dialog:
- Personas: 2 a 20.
- Auto-calcula monto por persona.

### Ver costo

Botón "Ver costo" → pide credenciales → muestra costo total y margen. Solo lo ve quien tiene permiso.

### Finalizar (F10)

- Venta pasa a CONCLUIDA.
- Pago a PAGADO.
- Mesa libera (DISPONIBLE).
- Stock se descuenta automáticamente (en background).
- Tab del PdV se limpia.

## 9. Cancelar venta completa

Botón "Cancelar venta" o **F4**.

Dialog con motivo obligatorio. Al confirmar:
- Venta → CANCELADA.
- Items → CANCELADO.
- Mesa libera.
- Stock revierte (movimientos `activo=false`).

## 10. Comandas

Si están habilitadas (`PdvConfig.comandasHabilitadas = true`):

Tab "COMANDAS" en el PdV. Tarjetas con código de barras (CMD-001, CMD-002...).

### Crear comandas en lote

**Menu → Ventas → Dashboard → "Gestionar Comandas"** → "Creación masiva":
- Cantidad: 100.
- Prefijo: CMD.
- Generates CMD-001, CMD-002, ..., CMD-100.

### Abrir comanda

Click en comanda DISPONIBLE → dialog ligero:
- Mesa (opcional, se auto-popula sector).
- Sector.
- Observación.

Comanda → OCUPADO. Trabajás en ella como si fuera una mesa.

### Cobrar comanda

Igual que mesa. Al cobrar, comanda libera automáticamente (DISPONIBLE).

## 11. Delivery

Botón "DELIVERY" en el PdV.

Dialog `Lista de Delivery` (90vw × 85vh):
- Filtro por estado.
- "+ NUEVO DELIVERY".

### Nuevo delivery

Dialog "Crear delivery":
- **Teléfono** (autocomplete por debounce 400ms con clientes existentes).
- Nombre, dirección.
- Precio delivery (zona).
- Observación.
- Cobro anticipado (✅).

Si el teléfono no existe → al confirmar se crea Persona + Cliente automáticamente.

Click confirmar → crea Delivery (estado ABIERTO) + Venta vacía. Entrás en **modo delivery** del PdV (mesas deshabilitadas).

### Estados de delivery

```
ABIERTO         (acaba de crearse)
   ↓ botón LISTO
PARA_ENTREGA    (listo para enviar al repartidor)
   ↓ botón ENVIAR
EN_CAMINO       (repartidor en camino)
   ↓ botón FINALIZAR (si no cobrado, abre cobro primero)
ENTREGADO       (cliente recibió)

   o CANCELADO desde cualquier estado (con motivo).
```

### Retiro en local

El mismo botón sirve para los pedidos que el cliente **pasa a buscar**: en el
alta hay un toggle **DELIVERY / RETIRAR**. Un retiro no tiene dirección, ni
costo de envío, ni repartidor — a cambio el **nombre es obligatorio**, porque es
lo que permite encontrar la bolsa en el mostrador.

Un retiro tampoco pasa por EN_CAMINO: va de ABIERTO a PARA_ENTREGA («está
pronto») y de ahí a ENTREGADO cuando el cliente se lo lleva. El **reloj se
congela** al marcarlo PARA_ENTREGA: de ahí en más falta que venga el cliente, y
eso no depende del local.

### Convertir un pedido: de delivery a retiro y al revés

El cliente llama de vuelta: *«mejor lo paso a buscar»*. Con el pedido
seleccionado, el footer tiene un botón **A RETIRO** (o **A DELIVERY** si ya es
un retiro).

El diálogo muestra **qué cambia antes de confirmar**: qué se pierde (la
dirección, el envío, el repartidor asignado) y el total viejo tachado al lado
del nuevo. Al pasar a delivery pide la dirección y la zona; al pasar a retiro,
el nombre si no lo tenía. Y ofrece **reimprimir el ticket**, porque el papel
que ya se entregó dice otra cosa.

Cuándo **no** se puede convertir:

- Si la venta **ya fue cobrada**. Convertir cambia el total, así que primero hay
  que anular el cobro. El botón queda gris y el tooltip lo explica.
- Si el pedido está **ENTREGADO o CANCELADO**.

Dos avisos que vale la pena leer:

- Si el pedido **ya salió** (EN_CAMINO), el diálogo avisa en amarillo y nombra
  al repartidor que se va a desasignar. Al volver a delivery pide elegir uno
  antes de confirmar: el pedido ya no va a pasar de nuevo por el momento en que
  normalmente se pregunta.
- Si ya hay **plata cobrada** contra el pedido y el total nuevo queda por
  debajo, avisa en rojo cuánto sobra. **No devuelve nada solo**: eso lo decide
  el mostrador.

### Pedidos que quedaron en una caja ya cerrada

En la lista de delivery también aparecen los pedidos **pendientes de turnos
anteriores**, para que no se pierdan. Si la caja de alguno de esos pedidos **ya
se cerró**, la fila queda marcada y el botón **PAGO** se deshabilita, con este
tooltip:

> **Caja cerrada: este pedido sólo se puede cancelar y volver a cargar en la caja de hoy.**

**Qué hacer:**

1. **Cancelar** el pedido (con motivo). Cancelar siempre está permitido.
2. **Volver a cargarlo** como pedido nuevo, en la caja de hoy.
3. Cobrarlo normalmente.

**Por qué no se puede cobrar directo:** el dinero tiene que entrar al arqueo de
la caja donde realmente se cobró. Si el sistema lo dejara entrar a una caja ya
cerrada e impresa, ese cierre pasaría a estar mal; y si lo imputara solo a la
caja de hoy, movería plata entre dos arqueos sin que nadie lo decida. Como **las
cajas no se reabren**, la única salida limpia es cancelar y revender.

⚠️ Si intentás cobrarlo por otro camino (por ejemplo el botón **ENTREGADO** sobre
un pedido sin cobrar), el sistema muestra el mismo aviso y no registra nada.

### Timer de espera

Junto a cada delivery, un timer cuenta el tiempo desde apertura:
- Sin color: < 30 min (configurable).
- Amarillo: 30-60 min.
- Rojo: > 60 min.
- Sin color: ENTREGADO/CANCELADO.

## 12. Cierre de caja

Botón "CERRAR CAJA" (en panel derecho).

Si hay ventas ABIERTAS: alerta "Las siguientes mesas tienen venta abierta: Mesa 3, Mesa 5..." → debes cobrar/cancelar todas primero.

Dialog:
- **Step 1**: Conteo Cierre (igual que apertura, ingresar billetes por moneda).
- **Step 2**: Resumen (ventas por forma de pago + conteo apertura + conteo cierre). **No se muestra diferencia** (medida anti-fraude).

Al confirmar:
- Caja → CERRADO, fechaCierre.
- **Resumen post-cierre** con diferencias:
  - Verde: ≤5%.
  - Amarillo: 5-15%.
  - Rojo: >15%.
- Tab del PdV se cierra.

### «Esta caja ya fue cerrada»

Si la caja con la que estabas trabajando se cerró **desde otra pantalla** (otra
terminal, otra pestaña, la PWA, o Caja Mayor), el PdV te avisa con un cartel:

> **ESTA CAJA YA FUE CERRADA**
> La caja #122 ya fue cerrada, así que no se pueden registrar más operaciones en
> ella. Elegí una caja abierta o abrí una nueva para seguir vendiendo.

El aviso aparece **solo, sin que toques nada**, en cuanto volvés a la pestaña del
PdV o cuando alguien cierra la caja. Y si igual llegás a intentar una operación,
el sistema la **rechaza**: no se guarda ni la venta, ni el cobro, ni el gasto, ni
el retiro.

**Si te agarró con el cobro abierto**, no vas a quedar mirando un error raro: la
ventana de cobro te muestra el mismo mensaje, **se cierra sola** y detrás aparece
el cartel de arriba para que elijas caja. Pasa igual si entraste por *Cobrar a
crédito* o si estabas haciendo un **cobro parcial**.

⚠️ **En las PC configuradas como «cliente»** (las que no tienen base propia y
trabajan contra el servidor del local) el aviso **no llega solo al instante**: hay
que cambiar de pestaña, volver a darle foco a la ventana, o esperar el chequeo
automático que corre cada 15 segundos. Lo que **no** cambia es el rechazo: el
servidor no acepta la operación de ninguna manera.

**Qué hacer:** tocar **ENTENDIDO** y elegir una caja abierta (o abrir una nueva).
Después **volvé a hacer la operación**. El sistema no la repite solo a propósito:
cobrar contra una caja que acabás de elegir de apuro es justamente cómo se
imputan cobros a la caja equivocada.

⚠️ **No perdiste nada.** Las ventas y los cobros que sí se registraron antes del
cierre están en la caja correcta. Lo que el sistema impide es agregar plata a una
caja ya cerrada y arqueada.

### Si una mesa quedó con la cuenta de una caja cerrada

Puede pasar: cerraron la caja A, vos elegiste la caja B, pero la mesa 4 seguía con
su cuenta abierta **de la caja A**. Esa cuenta no desaparece y no se pierde — pero
**no se puede cobrar tal cual está**.

Al seleccionarla, arriba de los botones aparece:

> 🔒 **Cuenta de una caja cerrada #A: transferila (pasa a la caja activa) o cancelala**

Y **COBRAR** y **COBRO RÁPIDO** quedan grises, con el motivo en el globito de
ayuda. Si igual apretás **F1** o **F2**, sale el mismo aviso y no se abre nada.

**Qué podés hacer:**

| Si la cuenta es de… | Salida |
|---|---|
| Una **mesa** o una **comanda** | **TRANSFERIR** la cuenta a otra mesa: pasa a tu caja de hoy y la cobrás normal. O **cancelarla**. |
| Una **venta rápida** o un **delivery** | **Cancelarla** y volver a cargarla en la caja de hoy (ahí no hay botón TRANSFERIR). |

**Agregar ítems sigue funcionando** — si la mesa está comiendo, seguís lanzando a
cocina; lo que no se puede es meter la plata en una caja que ya se arqueó.

Si seleccionás otra cuenta, de tu caja de hoy, el aviso desaparece solo.

⚠️ **La lista de mesas todavía no muestra esta marca**: la mesa se ve normal, con
su total, y el aviso aparece recién cuando la seleccionás. Está pendiente.

### Cerrar una caja que ya estaba cerrada

Si abrís el cierre de una caja que **otro ya cerró**, el diálogo te lo dice y no
te deja contar nada:

> **LA CAJA #122 YA FUE CERRADA EL 24/09/2026 14:35. NO SE PUEDE VOLVER A CERRAR. SI NECESITÁS CORREGIR EL CONTEO, USÁ AJUSTAR CONTEO.**

Antes esto **no avisaba nada**: el diálogo mostraba el cierre viejo y parecía que
completabas el cierre, pero no se guardaba nada. Si lo que necesitás es corregir
el conteo o agregar un gasto que faltó, es **Ajustar** desde *Financiero →
Cajas* → ver [capítulo 8](08-caja-mayor-financiero.md).

### Transferir una cuenta cuando la caja de origen ya se cerró

Si transferís una mesa o comanda cuya caja **ya se cerró**, la cuenta que se crea
en el destino va a **tu caja de hoy** (la caja abierta con la que estás
trabajando). El sistema lo hace solo: la plata del turno de hoy entra al cajón de
hoy.

Lo mismo vale **al revés**: si transferís a una mesa que **ya tenía** una cuenta
abierta y esa cuenta es de una caja cerrada, los ítems se suman ahí y la cuenta
entera pasa a tu caja de hoy. Antes los ítems se mudaban a una cuenta que después
no se podía cobrar, y te enterabas al final del almuerzo.

Dos cosas que **no** cambian:

- Los **cobros ya registrados** de esa cuenta **no se mueven**: quedan en la caja
  donde entró la plata.
- Si no tenés una caja abierta, la transferencia se rechaza con *«esta caja ya fue
  cerrada»*. Abrí o elegí una caja y volvé a intentar; o cancelá la cuenta.

⚠️ **Desde el celular (la PWA) esto todavía no funciona.** Si la caja de la cuenta
ya se cerró, la app avisa *«esta caja ya fue cerrada»* y no transfiere. Hacelo
desde una PC del PdV, o **cancelá** la cuenta y volvé a cargarla en la caja de hoy.

## 13. Atajos de teclado

PdV principal:
- **F1**: Cobrar
- **F2**: Cobro rápido
- **F3**: Buscar productos
- **F4**: Cancelar venta
- **F5**: Pre-cuenta / imprimir (TODO impresión real)
- **ESC**: Deselecciona mesa / cierra modo delivery

Dialog Cobrar:
- **F1/F2/F3**: monedas
- **F4-F7**: formas de pago
- **F9**: descuento/aumento
- **F10**: finalizar

## 14. Historial de ventas

**Menu → Ventas → Dashboard → "Listado de ventas"** o desde el PdV.

Filtros:
- Rangos rápidos: HOY, ESTA SEMANA, ESTE MES, ÚLTIMO TRIMESTRE.
- Datepicker desde / hasta.
- Estado (ABIERTA / CONCLUIDA / CANCELADA).
- Caja específica.
- Mozo / vendedor (autocomplete).
- Forma de pago, moneda, rango de valores.
- Mesa.
- Con descuento / aumento.

Acciones:
- Ver detalle (dialog 80vw × 80vh con cards completas).
- Cancelar venta (CONCLUIDA → CANCELADA).
- Rehabilitar venta cancelada.

## 15. Otros módulos de Ventas

Además del PdV, el menú **Ventas** incluye:

- **Buffet por kilo** (`Ventas → Buffet por kilo`): pantalla pensada para vender comida por peso (el producto se pesa y se cobra según el precio por kilo).
- **KDS — Cocina** (`Ventas → KDS — Cocina`): pantalla de cocina (Kitchen Display System) donde el personal de cocina ve los pedidos a preparar en tiempo real, sin papel.
- **Pantallas KDS** (`Ventas → Pantallas KDS`): configuración de las pantallas de cocina (qué sectores/productos muestra cada una).

Estos módulos dependen de permisos y de la configuración del local; pueden no estar visibles si tu negocio no los usa.

## 16. Errores comunes

### "No puedo abrir caja"

- Verificá que no tengas una caja abierta de un día anterior. Cerrala primero.
- El dispositivo debe tener `isCaja=true`.
- Si el aviso dice **"Ya hay una caja abierta en esta terminal"**, es literal:
  esta PC ya tiene su caja del turno. Cerrala antes de abrir otra. Si no la ves
  en pantalla, salí y volvé a entrar al PdV — puede haberla abierto otro usuario
  o la PWA.

### "Me dice que la caja ya fue cerrada y yo la veo abierta"

Lo que ves en pantalla es una foto del momento en que entraste; la caja pudo
cerrarse después desde otra terminal, otra pestaña o la PWA. El sistema le
pregunta al servidor antes de cada operación de plata, y el servidor manda.

Tocá **ENTENDIDO**, elegí una caja abierta (o abrí una nueva) y **repetí la
operación**. Nada de lo que hiciste antes del cierre se perdió.

### "Quiero cobrar un delivery viejo y no me deja"

Su caja ya se cerró. Cancelalo y volvé a cargarlo en la caja de hoy — ver
[Pedidos que quedaron en una caja ya cerrada](#pedidos-que-quedaron-en-una-caja-ya-cerrada).

### "COBRAR está gris y la mesa tiene ítems"

Mirá arriba de los botones: si dice *«Cuenta de una caja cerrada #N»*, esa cuenta
quedó en una caja que ya se arqueó. Transferila a otra mesa (pasa a tu caja de hoy)
o cancelala y volvé a cargarla — ver
[Si una mesa quedó con la cuenta de una caja cerrada](#si-una-mesa-quedó-con-la-cuenta-de-una-caja-cerrada).

### "Cobré una mesa y el dinero no aparece en mi arqueo"

Si esa mesa venía de **otra caja que también está abierta** (por ejemplo, la caja
de otro turno o de otra terminal que no se cerró), el cobro se arquea en **esa**
caja, no en la tuya — el sistema siempre imputa el pago a la caja de la venta. La
plata está en tu cajón, pero el arqueo la espera en la otra caja.

**Cómo evitarlo:** que no queden cajas de turnos anteriores abiertas. Si te pasó,
avisá al encargado antes de cerrar: los dos arqueos van a mostrar diferencia (uno
de más, el otro de menos) y se compensan entre sí.

### "Cancelé la apertura de caja y quedó una pestaña del PdV vacía"

Ya no pasa. Antes, si abrías el PdV desde el menú lateral y cancelabas el diálogo
de apertura, la pestaña quedaba abierta y te volvía a preguntar en cada click.
Ahora la pestaña se cierra sola, la hayas abierto desde el menú o desde el botón
del inicio.

### "El producto no aparece en el buscador"

- Verificá `esVendible=true` en el producto.
- Verificá que esté `activo=true`.

### "Stock no se descontó"

- Para combo / elaborado: verificá que la receta tenga ingredientes con `controlaStock=true`.
- El descuento es fire-and-forget — si falló, podés re-procesar (consultar admin).

### "Mesa quedó OCUPADA sin venta"

→ [workflows/verificacion-bd-sqlite.md](../workflows/verificacion-bd-sqlite.md): query manual para liberarla.

### "El cobro está rechazando una moneda"

- Verificá que la caja tenga esa moneda configurada (CajaMoneda).
- Verificá que el tipo de cambio (MonedaCambio) esté activo.

---

**Próximo capítulo →** [07 — Compras y proveedores](07-compras-y-proveedores.md)
