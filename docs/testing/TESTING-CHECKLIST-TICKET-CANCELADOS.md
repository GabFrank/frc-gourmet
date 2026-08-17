# Testing Checklist — Ítems cancelados y extras en el ticket de venta / pre-cuenta

Pruebas manuales del fix: el ticket térmico de venta y la pre-cuenta ya **no**
imprimen los ítems cancelados (ni los suman a los totales) y ahora detallan los
adicionales/extras activos de cada ítem.

Marcar `[x]` cuando el test pase, `[!]` si falla (registrar en `ERRORES-PDV.md`).

**Test automático que cubre lo mismo a nivel de contenido:** `npm run test:ticket-venta`.

---

## 0. Preparación

- [ ] Impresora con rol `TICKET_VENTA` (o `PRECUENTA`) configurada y respondiendo
      — *Configuración → Impresoras → Probar conexión*. Si la caja tiene
      `Dispositivo.printerTicket`, esa gana.
- [ ] Caja abierta y PdV operativo.
- [ ] Un producto con adicionales disponibles en su receta (ej. hamburguesa con
      *extra queso* / *tocino*) y un par de productos simples.
- [ ] Empresa cargada (*Configuración → Empresa*) para que el ticket traiga el
      encabezado; sin empresa el ticket igual sale, sólo sin header.

> No hace falta reiniciar Angular, pero **sí la app**: el cambio es de backend
> (`electron/handlers/`).

---

## 1. Ítem cancelado en la pre-cuenta (caso reportado)

### 1.1 Cancelación simple
- [ ] Abrir una mesa y cargar 3 ítems con precios distintos (ej. 30.000, 10.000, 25.000).
- [ ] Cancelar el tercero desde el menú `⋮` de la fila → *Cancelar*.
- [ ] En la lista del PdV el ítem queda **tachado** y muestra "Cancelado por … a las …".
- [ ] El total del PdV baja: pasa a 40.000 (no cuenta el cancelado).
- [ ] Imprimir pre-cuenta (`Pre-cuenta` en la barra del PdV).
- [ ] **El ticket NO muestra el ítem cancelado.**
- [ ] **El TOTAL del ticket dice 40.000** — igual al del PdV. *(Antes del fix
      salía 65.000: el cancelado se sumaba porque `venta.total` todavía es null
      en la pre-cuenta.)*
- [ ] El ticket dice `*** NO ES COMPROBANTE FISCAL ***` y no lleva el título
      "COMPROBANTE DE VENTA".

### 1.2 Cancelado con descuento propio
- [ ] Cargar 2 ítems, ponerle un descuento por ítem a uno de ellos (menú `⋮` → *Editar*).
- [ ] Cancelar **el ítem que tiene el descuento**.
- [ ] Imprimir pre-cuenta.
- [ ] El ticket **no** imprime las líneas SUBTOTAL / DESCUENTO (el único descuento
      era del ítem cancelado, y ya no cuenta).
- [ ] El TOTAL coincide con el del PdV.

### 1.3 Descuento sobre un ítem activo
- [ ] Con un descuento por ítem sobre un ítem **activo**, imprimir pre-cuenta.
- [ ] Aparecen SUBTOTAL (bruto de los activos) y DESCUENTO, y TOTAL = SUBTOTAL − DESCUENTO.

### 1.4 Todos los ítems cancelados
- [ ] Cancelar todos los ítems de la mesa e imprimir pre-cuenta.
- [ ] El ticket sale sin líneas de producto y con TOTAL 0 (no debe romperse ni
      imprimir el cancelado).

---

## 2. Ítem cancelado en el comprobante post-cobro

- [ ] Cargar 3 ítems, cancelar uno, cobrar la venta.
- [ ] El diálogo de cobro ya mostraba sólo los activos (comportamiento previo, sin cambio).
- [ ] El ticket de venta que se imprime al cobrar **no** muestra el cancelado.
- [ ] TOTAL del ticket = total cobrado.
- [ ] Reimprimir el ticket desde *Últimas Ventas → ⋮ → Reimprimir*: mismo resultado,
      sin el cancelado.

---

## 3. Adicionales / extras en el ticket

### 3.1 Extras de un ítem activo
- [ ] Cargar un producto y personalizarlo con 2 adicionales, uno con cantidad 2
      (menú `⋮` → *Personalizar*).
- [ ] Imprimir pre-cuenta.
- [ ] Debajo del producto aparecen sus extras indentados: `+ EXTRA QUESO`,
      `+ 2x TOCINO`.
- [ ] **No** hay monto al lado de cada extra: su precio ya está dentro del TOTAL
      de la línea del producto.
- [ ] El TOTAL de la línea del producto = (precio + extras − descuento) × cantidad,
      igual a lo que muestra el PdV en la columna Total.

### 3.2 Extras quitados al re-personalizar
- [ ] Volver a personalizar el ítem y **destildar** un adicional.
- [ ] El precio del ítem baja en el PdV.
- [ ] Imprimir pre-cuenta → el adicional quitado **ya no aparece** y el total refleja el nuevo precio.

### 3.3 Extras de un ítem cancelado
- [ ] Cargar un producto con extras y **cancelarlo**.
- [ ] Imprimir pre-cuenta → no aparece ni el producto ni sus extras.

### 3.4 Pizza multi-sabor con extras por sabor
- [ ] Cargar una pizza mitad y mitad con adicionales en una de las mitades.
- [ ] Imprimir pre-cuenta.
- [ ] Los extras se listan bajo la pizza.
- [ ] El TOTAL de la línea coincide con el del PdV (el precio de extras en pizza
      está ponderado por la proporción del sabor; por eso el ticket no imprime
      el monto de cada extra).

### 3.5 Impresora angosta (58mm / 32 columnas)
- [ ] Con una impresora configurada a 32 columnas, imprimir un ítem con un
      adicional de nombre largo.
- [ ] La sub-línea del extra no desborda ni rompe el alineado de las columnas
      CANT / DESCRIPCION / TOTAL (se recorta al ancho disponible).

---

## 4. Comanda de cocina (no debe cambiar)

- [ ] Cargar ítems, cancelar uno **antes** de ticketear, enviar a cocina.
- [ ] La comanda no incluye el cancelado (comportamiento previo, ya filtraba).
- [ ] Los extras siguen saliendo como `ADD …`, los removidos como `SIN X` invertido.

---

## 5. Personalizar ítem (extras dados de baja)

- [ ] Personalizar un ítem que ya tenía adicionales.
- [ ] El diálogo trae pre-seleccionados los adicionales vigentes.
- [ ] Los chips de adicionales en la fila expandida del PdV coinciden con lo
      elegido (`getVentaItemAdicionales` ahora devuelve sólo `activo = true`).

---

## 6. Multimoneda

- [ ] Con USD/BRL activos y cotización cargada, imprimir pre-cuenta de una venta
      con un ítem cancelado.
- [ ] Las líneas `TOTAL USD` / `TOTAL BRL` se calculan sobre el total **sin** el
      cancelado.
