# PLAN — Tienda online: personalizar cada sabor de la pizza (F6b)

Pedido del propietario (02/11/2026): en la tienda se tiene que poder personalizar **cada sabor**
de la pizza antes de agregarla al carrito, como en el PdV. Decisión de UX del propietario:
**botón «Personalizar» en cada sabor elegido, que abre una hoja desde abajo** (bottom sheet),
en la misma página de la pizza.

## Situación actual (verificado en código, rama F6)

- Tienda `projects/storefront/src/app/pages/pizza/pizza-detalle.page.*`: tamaño, mitad y mitad
  (hasta `maxSabores`), adicionales y preferencias **para toda la pizza**, nota libre. No se
  pueden sacar ni cambiar ingredientes.
- Menú público `electron/handlers/pedidos-online.handler.ts`: por sabor publica `saborId`,
  nombre, foto y `precios[] {presentacionId, precio, recetaPresentacionId}`. Los adicionales se
  publican como unión de las recetas base de todos los sabores. No publica ingredientes.
- Alta de pedido `electron/handlers/pedidos-online-pedidos.handler.ts`: el ítem pizza trae
  `opcion {tipo:'PIZZA', presentacionId, saborIds[]}`, `adicionalIds[]`, `observaciones[]`,
  `notaLibre`. Precio recalculado en el servidor (`resolveOpcion`, `resolveAdicionales`).
  Se guarda en `PedidoOnlineItem.personalizacion` (JSON snapshot).
- Materialización `materializarPedidoOnlineEnVenta` (`electron/handlers/ventas.handler.ts`):
  crea `VentaItemSabor` por sabor y `VentaItemAdicional` / `VentaItemObservacion` **a nivel
  ítem** (sin `ventaItemSabor`). No crea `VentaItemIngredienteModificacion`.
- PdV (referencia): `seleccionar-variacion-dialog` (Tamaño → Sabores con botón PERSONALIZAR →
  Confirmar) + `personalizar-producto-dialog` sobre la **receta de la RecetaPresentacion
  (sabor × tamaño)**: ingredientes `esOpcional` (quitar), `esCambiable` con
  `RecetaIngredienteIntercambiable` (cambiar, sin precio), adicionales de
  `RecetaAdicionalVinculacion` (con `precioAdicional`) y observaciones.
  `persistirPersonalizacionConSabor` guarda modificaciones y adicionales con FK
  `ventaItemSabor`. Precio de adicionales por sabor = `precioAdicionalTotal × proporción`.
  KDS (`kds.handler.ts`) y tickets (`documentos-tickets.handler.ts`) ya leen las modificaciones.

## Qué se cambia

### 1. Menú público (servidor)
En `pedidos-online.handler.ts`, para cada precio de sabor (`recetaPresentacionId`) publicar la
personalización de **su receta**, en un mapa por receta para no repetir datos:
`personalizacionPorReceta: { [recetaId]: { quitables[], cambiables[], adicionales[] } }`
- `quitables`: `RecetaIngrediente` activos con `esOpcional` → `{id, nombre}`.
- `cambiables`: activos con `esCambiable` y al menos un intercambiable activo →
  `{id, nombre, opciones:[{productoId, nombre}]}`.
- `adicionales`: vinculaciones activas de esa receta → `{id, nombre, precio}`.
- Cada precio de sabor suma `recetaId`. Solo nombres e ids: ni costos ni cantidades.
- Se mantiene el `adicionales` del producto (unión) por compatibilidad con clientes viejos.

### 2. Tienda (pantalla)
- `pizza-detalle`: debajo de cada sabor elegido, botón **Personalizar** (y resumen corto:
  «Sin cebolla · + Borde cheddar»). Si la receta de ese sabor/tamaño no tiene nada para
  personalizar, el botón no aparece.
- Hoja desde abajo (componente nuevo `sabor-personalizar.sheet`, tema claro, cierre con
  «Listo» o tocando afuera): secciones **Sacar** (casillas), **Cambiar** (selector por
  ingrediente) y **Adicionales** (casillas con precio). Muestra el precio que suma, que es
  el adicional × proporción del sabor (ej.: mitad → 50 %), igual que en el PdV.
- Cambiar el tamaño reinicia la personalización de los sabores (cambia la receta) con aviso;
  quitar un sabor borra la suya.
- Las preferencias y la nota siguen siendo de la pizza entera. Los adicionales «de toda la
  pizza» se reemplazan por los de cada sabor, para no cobrarlos dos veces y para que la cocina
  sepa a qué mitad van.
- Carrito: la línea muestra el detalle por sabor; dos pizzas iguales con distinta
  personalización son líneas distintas (`uid`). El carrito guardado viejo (sin
  `personalizacionSabores`) se sigue leyendo.

### 3. Alta del pedido (servidor)
- Ítem pizza acepta `opcion.personalizacionSabores: [{saborId, quitarIds[], cambios:[{recetaIngredienteId, productoId}], adicionalIds[]}]`.
- Validación contra el catálogo (nada se confía al cliente): cada `recetaIngredienteId`
  pertenece a la receta de ese sabor × tamaño y es `esOpcional` (quitar) o `esCambiable` con
  esa opción activa (cambiar); cada adicional está vinculado a esa receta. Si no, el pedido se
  rechaza con `personalizacion_invalida:<producto>` (no se descarta en silencio, regla F5).
- Precio: opción + Σ por sabor (precio adicional × proporción), redondeado como el PdV.
- Snapshot `personalizacion.sabores[i]` suma `quitados[{id,nombre}]`, `cambios[{id,nombre,
  reemplazoId,reemplazoNombre}]`, `adicionales[{id,nombre,precio}]`.

### 4. Materialización a venta
En `materializarPedidoOnlineEnVenta`, por cada sabor guardado: `VentaItemIngredienteModificacion`
(REMOVIDO / INTERCAMBIADO con `ingredienteReemplazo`) y `VentaItemAdicional` (cantidad 1)
**con `ventaItemSabor`**, igual que `persistirPersonalizacionConSabor`. Para no inventar una
regla nueva se copia exactamente el PdV: `VentaItemAdicional.precioCobrado` = precio de lista
del adicional y `VentaItem.precioAdicionales` = Σ precio × proporción. (Esa diferencia ya existe
en el PdV; se anota como observación para #325/#240, que es donde se decide qué factura.)
Observaciones por sabor: el PdV las permite, la tienda no (quedan de la pizza entera). Así la comanda, el KDS, el ticket y la factura ven lo
mismo que si se cargara en el PdV. Pedidos viejos (sin datos por sabor) siguen igual.

### 5. Bandeja de pedidos online (escritorio)
El detalle del pedido muestra, por sabor, lo que se sacó, cambió y agregó.

## Pruebas
- Unitarias/integración (con Postgres local): menú publica `personalizacionPorReceta`; alta
  rechaza ingrediente ajeno, no opcional, opción de cambio inactiva y adicional de otra receta;
  precio = opción + adicionales × proporción; materialización crea modificaciones y
  adicionales con `ventaItemSabor`; pedido viejo sin personalización sigue andando.
- Suites de tienda existentes (pedidos-online, tienda-seguridad, tienda-categorias, zonas,
  migraciones) en verde; `test:all` sin fallas nuevas (hoy ~9 suites en develop).
- **E2E en la vista** (toca venta y factura): pizza mitad y mitad, en una mitad sacar un
  ingrediente y sumar un adicional, en la otra cambiar uno; pedido en efectivo; aceptarlo
  con caja abierta; verificar comanda/KDS por mitad, cobrar y **facturar**, y que el total de
  la factura = total del pedido. Capturas al propietario de cada paso.
- Celular 390 px y escritorio; tema claro.

## Riesgos y cómo se cubren
- **Cobrar distinto en tienda y en caja**: el precio se calcula solo en el servidor con la
  misma regla del PdV (× proporción); prueba de igualdad pedido = venta = factura.
  Ojo con #325 (factura sin adicionales, aún abierta): la prueba E2E lo va a mostrar; si
  aparece, se documenta y no se mergea a ciegas.
- **Menú más pesado**: solo ids y nombres, agrupado por receta (una vez por receta).
- **Clientes con la versión anterior en caché**: el servidor sigue aceptando el formato viejo.
- **Recetas sin ingredientes marcados** (`esOpcional`/`esCambiable`): no aparece el botón;
  hay que revisar qué tiene cargado Don Franco (dato, no código) antes de prender la tienda.
- Base: las tablas y FKs (`venta_item_sabor_id`) ya existen; solo una columna booleana nueva para el interruptor (ver ajustes).

## Vuelta atrás
Rama `bot/ceo-frc-gourmet/feat-tienda-online-f6b` sobre F6, PR en borrador como el resto de la
tienda (no se mergea sin OK). La única migración es aditiva y tiene `down`: revertir el PR alcanza; los pedidos con datos por
sabor ya materializados quedan como ventas normales del PdV.

## Ajustes tras la auditoría del plan
- **Factura en la prueba:** el E2E se hace en la vista previa / Postgres local de la estación, que
  no tiene internet ni certificado de facturación electrónica: la factura queda como documento
  interno de prueba y no se emite ningún comprobante fiscal real. Producción no se toca.
- **Casos de rechazo del alta (con prueba cada uno):** `saborId` que no está en `saborIds`;
  `saborId` repetido en `personalizacionSabores`; ids repetidos en `quitarIds`, `cambios` o
  `adicionalIds` (se rechaza, no se deduplica, para no cobrar distinto de lo que vio el
  cliente); un mismo ingrediente en `quitarIds` y en `cambios`; ingrediente de otra receta, no
  opcional/no cambiable; opción de cambio inactiva o de otro ingrediente; adicional no
  vinculado a esa receta o inactivo; más de 20 elementos por lista.
- **Stock y costo:** el descargo de stock (`processReceta` en `ventas.handler.ts`) ya lee las
  `VentaItemIngredienteModificacion` del ítem (REMOVIDO no descuenta, INTERCAMBIADO descuenta
  el reemplazo) y los adicionales; como cada modificación apunta a un `RecetaIngrediente` de la
  receta de su sabor, la tienda produce el mismo efecto que el PdV. Prueba: stock de un
  ingrediente quitado no baja y el del reemplazo sí, igual que con la misma pizza cargada en el PdV.
- **Asimetría de precios heredada del PdV:** se le informa al propietario junto con el OK del plan.
- **Vuelta atrás:** los pedidos ya creados con modificaciones quedan en la base y siguen
  leyéndose bien (KDS, tickets, stock ya las entienden). Interruptor sin revertir: si el menú no
  publica `personalizacionPorReceta` el botón no aparece; se agrega la opción
  «Personalizar sabores» en Config Tienda Online (encendida por defecto) para apagarlo. Es una
  columna booleana nueva en `tienda_online_config` (migración chica, aditiva, con `down`); con
  eso el punto «sin migración» de arriba pasa a «una migración aditiva».
- **Datos de Don Franco:** consulta concreta, de solo lectura, que hago yo con gourmet-ops antes
  de prender la tienda: recetas de las RecetaPresentacion de pizza con cuántos ingredientes
  `esOpcional` / `esCambiable` (con intercambiables activos) y adicionales vinculados; el
  resultado va al propietario para que decida qué marcar.

## Ajustes tras la segunda auditoría
- El interruptor «Personalizar sabores» nace **apagado** (default false). Se enciende a mano en
  Config Tienda Online después de revisar los datos de Don Franco. Con el interruptor apagado, el
  menú no publica `personalizacionPorReceta` y el alta **rechaza** `personalizacionSabores`.
- Stock: antes de implementar leo `processReceta` y el caso multi-sabor para ver cómo filtra las
  modificaciones por sabor y por proporción. La prueba de stock incluye una pizza mitad y mitad
  con un sabor personalizado y el otro no, comparada con la misma pizza cargada en el PdV. Si el
  PdV descuenta mal por proporción, se documenta en una issue aparte y la tienda queda igual al PdV.
- Asimetría de precio: si el propietario no la acepta, se corrige en los dos lados (PdV y tienda)
  dentro de #325/#240, no solo en la tienda. Hay una prueba de integración que compara
  pedido.total = venta.total = Σ ítems (precio + precioAdicionales) para pizzas personalizadas.
- Menú: hay una prueba de que no publica ingredientes, opciones ni adicionales inactivos.
- Línea base de test:all: antes de empezar corro develop y guardo la lista de suites que fallan
  en /estacion/logs/baseline-f6b.tsv, para compararla con la rama.
