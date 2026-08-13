# Módulo Ventas (meseros)

Este módulo convierte tu celular o tablet en una **comandera de mesero**: abrís la mesa o
la comanda, **tomás el pedido** y lo enviás al sistema, sin tener que ir a la caja. Entrás
tocando **Ventas** (🍽️) en la navegación.

> **Importante:** en mobile el mesero **toma el pedido**, pero **no cobra**. El **pago y
> cierre** de la mesa/comanda se siguen haciendo en el **Punto de Venta del escritorio**
> (la caja). Ver [Qué falta en mobile](10-limitaciones-y-version-escritorio.md).

Esta pantalla funciona distinto a las listas administrativas del [Cómo usar las listas y los formularios](03-como-usar-listas-y-formularios.md):
está pensada para usarse rápido, con tarjetas grandes.

---

## 1. La pantalla de Mesas / Comandas

Al entrar a **Ventas → Mesas** ves dos pestañas arriba, igual que el PdV del escritorio:

- **Mesas** — las mesas del salón, en grilla.
- **Comandas** — pedidos sueltos sin mesa fija (para llevar, mostrador, etc.).

Debajo tenés:

- Un **resumen** de cuántas mesas están ocupadas (ej. `4/12 ocupadas`) y un botón
  **recargar** (🔄) para refrescar el estado.
- **Filtros por sector:** una fila de botones (**Todos** y cada sector del salón). Tocá uno
  para ver solo las mesas/comandas de ese sector.

### Estado de cada tarjeta

- **Mesa libre:** atenuada, sin cuenta abierta.
- **Mesa ocupada:** resaltada, muestra el sector, la capacidad y cuántas **comandas** tiene
  asociadas.

---

## 2. Abrir / entrar a una mesa

1. En la pestaña **Mesas**, tocá la tarjeta de la mesa.
2. Se abre el **detalle de la mesa**:
   - Si está **libre**, vas a ver "Mesa libre — sin cuenta abierta". Al tomar el primer
     pedido se abre la cuenta automáticamente.
   - Si está **ocupada**, ves los **ítems ya cargados** y, al pie, el **total** (en la
     moneda principal y convertido a las otras monedas, con sus banderitas).

### Acciones en el detalle de la mesa

En la barra de arriba y como botones flotantes tenés:

- 🍽️ **Tomar pedido** (botón flotante grande): abre el buscador para agregar productos.
- 🔳 **Escanear** (botón flotante chico): abre el buscador en **modo escáner** de código de
  barras / QR (útil para pesables y productos con código).
- 👤 **Asignar cliente:** asocia un cliente a la cuenta (ver punto 5).
- 🖨️ **Imprimir pre-cuenta:** imprime el detalle de consumo para mostrárselo a la mesa
  (no es la factura ni cierra la venta).
- 🔁 **Transferir mesa:** mueve toda la cuenta a otra mesa (ver punto 6).

---

## 3. Tomar el pedido

Al tocar **Tomar pedido** se abre una pantalla completa con:

1. Un campo **"Buscar producto"** (escribí el nombre y tocá la lupa, o escaneá un código).
2. La **lista de productos** que coinciden.
3. Abajo, un resumen de las **líneas que vas agregando** (`cantidad × producto`).

Según el tipo de producto, al tocarlo se abre un diálogo distinto:

### Producto común

Diálogo con:
- **Cantidad** (botones – / +).
- **Adicionales** del producto (los que tenga configurados, ej. EXTRA QUESO).
- **Observaciones** predefinidas (ej. SIN CEBOLLA) y una **nota libre** opcional.

Tocá **Agregar** para sumarlo a la cuenta.

### Producto con variaciones / sabores (ej. pizza)

Diálogo para elegir:
- **Tamaño** (presentación).
- **Sabores** (hasta el máximo configurado; por ejemplo, pizza de varios sabores).
- **Cantidad.**

El precio se calcula según la estrategia configurada en el sistema (mayor precio o
promedio). Cada sabor se puede personalizar con sus propios adicionales/observaciones.

### Producto pesable (buffet por kilo)

Diálogo de **pesaje:** ingresás el **peso bruto en gramos**; el sistema descuenta la tara y
calcula el importe por kilo, respetando el mínimo y el tope de "buffet libre" si están
configurados.

### Editar o quitar un ítem ya cargado

En el detalle de la mesa, cada ítem tiene un botón para **editar** (cambiar cantidad,
adicionales, observaciones) o **quitarlo** de la cuenta.

Cuando terminás de cargar, tocá **Listo** (o la flecha de volver) para regresar al detalle
de la mesa.

---

## 4. Comandas

En la pestaña **Comandas** trabajás con pedidos que no están atados a una mesa.

- **Comanda disponible:** al tocarla, se abre un diálogo **"Abrir comanda"** donde podés
  (opcionalmente) elegir una **mesa** donde ubicarla y escribir una **observación**. Al
  confirmar, la comanda pasa a ocupada y entrás a su detalle.
- **Comanda ocupada:** al tocarla, entrás directo al detalle (igual que una mesa).

Dentro del detalle de una comanda, además, podés:
- **Editar la comanda** (mesa/observación).
- **Transferir la comanda a una mesa.**
- **Liberar la comanda** (dejarla disponible de nuevo).

El resto (tomar pedido, escanear, asignar cliente) funciona igual que en las mesas.

---

## 5. Asignar un cliente

Tocá **asignar cliente** (👤) en el detalle. Se abre una pantalla para:

- **Buscar** un cliente por nombre, documento o RUC (la búsqueda se va actualizando a
  medida que escribís).
- **Crear un cliente nuevo** en la misma pantalla si no existe (oculta el buscador y muestra
  el formulario de alta).

Al elegir o crear, el cliente queda asociado a la cuenta y volvés al detalle.

---

## 6. Transferir una mesa o comanda

- **Transferir mesa:** desde el detalle, tocá 🔁. Elegí la **mesa destino** de la lista (se
  muestran las mesas con su estado). Toda la cuenta se mueve a la mesa elegida.
- **Transferir comanda a mesa:** desde el menú de acciones de la comanda, elegí la mesa
  destino.

---

## Permisos

Ventas es visible para **cualquier usuario logueado** (no requiere un permiso para entrar).
Las acciones individuales (tomar pedido, transferir, imprimir, etc.) se validan en el
servidor con los **mismos permisos del PdV** que en el escritorio. Si el servidor rechaza
una acción, vas a ver un mensaje de error. Ver [Permisos y roles](08-permisos-y-roles.md).

---

## Errores comunes

- **No veo el total / dice "Mesa libre":** la mesa no tiene cuenta abierta todavía. Se abre
  sola cuando cargás el primer ítem.
- **Quiero cobrar y no encuentro el botón:** el cobro no está en mobile; se hace en la caja
  (PdV del escritorio). La pre-cuenta que imprimís es solo informativa.
- **No encuentro un producto al buscar:** probá con parte del nombre y tocá la lupa; si es
  un producto con código, usá el botón **Escanear**.

---

**Próximo capítulo →** [Módulo RRHH](04-modulo-rrhh.md)
