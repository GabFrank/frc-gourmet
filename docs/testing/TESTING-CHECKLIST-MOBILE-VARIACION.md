# Checklist manual — flow de pizza (variación) completo en el PWA mobile

Cubre la paridad del PWA con el PdV desktop para productos
`ELABORADO_CON_VARIACION` (2026-08-17). Antes, desde el celular se podían elegir
tamaño y sabores y cargar adicionales/observaciones, pero **no se podían tocar
los ingredientes**: un mozo no podía mandar "SIN ACEITUNAS" desde la mesa.

> **Requiere reiniciar la app** (el nodo servidor) y **recargar el PWA** en el
> celular — hay cambios de backend y de la app mobile. Si el PWA quedó cacheado,
> forzá la recarga desde el navegador.

**Preparación:**

- Un producto tipo pizza (`ELABORADO_CON_VARIACION`) con al menos 2 sabores en
  la misma presentación, ambos con precio vigente, y **precios distintos** entre
  sí (para verificar la estrategia de precio).
- Al menos un sabor con **ingredientes opcionales** y, si se puede, uno
  **cambiable** con opciones cargadas.
- Un adicional vinculado a la receta de ese sabor (ej. `BORDE CHEDDAR`).
- Una observación vinculada al producto (ej. `BUSCAR`).
- El equivalente exacto configurado en el desktop, para comparar lado a lado.

---

## 1. Armado de la pizza

- [ ] PWA → mesa → **Tomar pedido** → elegí la pizza.
- [ ] Aparece el paso de **Tamaño** (dice "Tamaño", no "Presentación", porque el
      sabor es de categoría PIZZA).
- [ ] Elegí un tamaño: se listan los sabores con su precio.
- [ ] Un sabor **sin precio vigente no aparece** en la lista.
- [ ] Elegí un sabor → **se abre solo el diálogo de personalización** (igual que
      el desktop, sin tener que buscar el botón).
- [ ] **El teclado del sistema NO se abre solo** al abrir ese diálogo, y los
      ítems (ingredientes, adicionales, observaciones) quedan visibles apenas
      terminan de cargar. *(Antes: el campo de nota era lo único presente
      mientras cargaba, el diálogo le daba el foco, saltaba el teclado y tapaba
      todo lo que aparecía después.)*
- [ ] El campo **Nota libre** aparece al final, recién cuando terminó la carga; al
      tocarlo, ahí sí se abre el teclado.

## 2. Personalización de un sabor — lo que faltaba

Dentro del diálogo del sabor:

- [ ] Se ve la línea de **ingredientes fijos** (base + normales) como texto.
- [ ] **INGREDIENTES**: los opcionales aparecen como chips. Tocá uno: queda
      tachado, en rojo y con la ✗ → se va a mandar como `SIN X`.
- [ ] Tocalo de nuevo: vuelve a estado normal.
- [ ] **CAMBIAR POR**: cada ingrediente cambiable tiene su desplegable con
      `Original` + sus opciones. Elegí una.
- [ ] Un ingrediente cambiable **sin opciones** cargadas no muestra un
      desplegable vacío: cae en la línea de ingredientes fijos.
- [ ] **ADICIONALES**: marcá uno; el precio se refleja al confirmar.
- [ ] **OBSERVACIONES** + **nota libre**: cargá una de cada una.
- [ ] Confirmá con **Listo**: al lado del sabor aparece el ✓ de personalizado.
- [ ] Volvé a abrir **Personalizar** de ese sabor: **todo viene precargado**
      (ingredientes quitados, cambio elegido, adicional, observación y nota).

## 3. Proporciones (mitad y mitad, 60/40)

- [ ] Elegí un segundo sabor. Cada uno muestra `1/2`.
- [ ] Tocá **+** en un sabor: pasa a `60%` y el otro a `40%`. El total de la
      línea se actualiza.
- [ ] Seguí tocando **+**: topa en `90%` y el otro no baja de `10%`.
- [ ] Aparece el botón **Partes iguales**; tocalo: vuelve a `1/2` y `1/2`.
- [ ] Deseleccioná un sabor: vuelve a partes iguales y **se limpia su
      personalización** (si lo volvés a elegir, arranca de cero).
- [ ] Con 3 sabores (si `pizzaMaxSabores` lo permite) muestran `1/3`.
- [ ] Al llegar al máximo de sabores, avisa y no deja marcar otro.

## 4. Precio — comparar contra el desktop ⚠️

Con el **mismo armado** en desktop y en mobile:

- [ ] El precio base de la línea coincide (según `pizzaEstrategiaPrecio`:
      `MAYOR_PRECIO` toma el sabor más caro; `PROMEDIO` promedia).
- [ ] **Un adicional cargado en media pizza se cobra a la mitad.** Ej.: borde de
      10.000 en la mitad calabresa → suma **5.000** al total, no 10.000.
      *(Antes mobile cobraba los 10.000 completos: cobraba de más.)*
- [ ] Con el adicional en una pizza de un solo sabor, se cobra entero.
- [ ] Si ajustaste a 60/40, el adicional del sabor al 60% suma el 60%.
- [ ] El total que muestra el diálogo es el que queda en la cuenta de la mesa.

## 5. Lo que llega a la cuenta y a la cocina

- [ ] Agregá la pizza. En el detalle de la mesa aparece el ensamblado
      (`PIZZA MEDIANO 1/2 CALABRESA + 1/2 MUZZARELLA`) con su total.
- [ ] Abrí el detalle del ítem: se ven los adicionales, las observaciones, la
      nota y **`Sin ACEITUNAS`** con el nombre del ingrediente.
- [ ] La **comanda impresa** muestra el sabor, el `SIN ACEITUNAS` en video
      inverso, el `ADD BORDE CHEDDAR` y las observaciones — igual que si el
      pedido se hubiera cargado desde el desktop.
- [ ] En el **KDS** se ve el mismo detalle.
- [ ] Abrí la misma mesa **en el desktop**: el ítem cargado desde el celular se
      ve completo, con sus modificaciones de ingredientes.

## 6. Producto simple (no regresión + mejora)

El mismo diálogo se usa para productos con receta que no son variación:

- [ ] Agregá un producto simple con receta: ahora también podés quitar
      opcionales y cambiar ingredientes desde el celular.
- [ ] En el detalle de la mesa, **Editar** ese ítem: los ingredientes vienen
      precargados; cambiá algo y guardá.
- [ ] Editá de nuevo sin tocar nada y guardá: **no se duplican** las
      modificaciones (se reconcilian: borrar + recrear).
- [ ] Un producto **sin receta** no muestra secciones de ingredientes y sigue
      funcionando igual que antes.

## 7. Casos borde

- [ ] Cancelar el diálogo de personalización: el sabor queda elegido pero sin
      personalización, y el precio no cambia.
- [ ] Cambiar de tamaño después de haber personalizado: la selección de sabores
      se reinicia (los sabores dependen del tamaño).
- [ ] Sin conexión al servidor en medio del armado: avisa y no deja el ítem a
      medio guardar.

---

## Cobertura automática

- `npm run test:variacion-mobile` (17 asserts): la estructura persistida —
  `VentaItem` + un `VentaItemSabor` por sabor, y adicional / observaciones /
  modificación de ingrediente **atribuidos al sabor correcto** vía la FK
  `ventaItemSabor`; la nota libre; lo que arma la comanda; y el ponderado del
  adicional (5.000 y no 10.000).
- `npm run test:mobile` → `variacion-precio.util.spec.ts` (24 casos): reparto en
  partes iguales, ajuste ±10% con topes y compensación, etiqueta `1/2` vs `60%`,
  estrategias de precio y ponderación de adicionales y costo.

Lo que queda para este checklist es la UI en sí: los chips, los desplegables, la
precarga al reabrir y la comparación de precios contra el desktop.

> **Gotcha al correr los `test:*` localmente:** los `.js` compilados que quedan
> en `electron/` (gitignorados) le ganan a los `.ts` en ts-node. Si tocaste un
> handler, corré `npm run electron:serve-tsc` antes de testear.
