# PLAN Tienda online F6: experiencia de la carta (feedback del propietario, 2/11/2026)

Rama: `bot/ceo-frc-gourmet/feat-tienda-online-f6` desde `feat-tienda-online-f5` (stack F1→F5, nada mergeado).
Origen: prueba del propietario en la vista previa (capturas del 2/11 a las 21:09, 21:12 y 21:15).

## Problemas y cambios

1. **La tienda se vio en modo oscuro.** En el código de la tienda no hay tema oscuro. Lo más probable es que el navegador la haya oscurecido por su cuenta (Auto Dark de Chrome o una extensión).
   - Cambio: `<meta name="color-scheme" content="only light">` en `index.html` y `:root { color-scheme: only light; }` en `styles.scss`. Fondos y textos explícitos en los componentes que hoy heredan del navegador (inputs, checkboxes, textarea).
   - Regla del propietario: la tienda va siempre en claro.
2. **La lista es demasiado larga: hoy se muestran todas las categorías juntas, con scroll.**
   - Cambio de vista: cada pestaña muestra solo su categoría (un listado por categoría). El buscador sigue buscando en toda la carta.
   - **Categorías personalizadas de la tienda** (por ejemplo «Entradas», «Promos», «Pizzas»):
     - Entidad nueva `tienda_categoria`: id, nombre, orden, activo e icono opcional.
     - Relación con productos en `tienda_categoria_producto`: categoría, producto y orden. Un producto puede estar en varias categorías.
     - Migración para SQLite y para Postgres. Solo crea tablas y no toca datos existentes.
     - Handlers (permiso PEDIDOS_ONLINE_CONFIGURAR): listar, crear, editar, borrar, reordenar categorías y asignar u ordenar sus productos.
     - Escritorio, en Config Tienda Online: nueva pestaña «Categorías de la tienda». Lista ordenable (arrastrar o flechas), alta y edición de nombre, y un buscador de productos para agregarlos a la categoría y ordenarlos.
     - `get-menu-online`: si hay al menos una categoría de tienda activa, la carta se arma con esas categorías, en su orden y con los productos en su orden. Los productos online que no estén en ninguna salen en «Otros». Si no hay ninguna, se usa la lógica actual por familia. Así Don Franco no cambia nada hasta que se carguen categorías.
3. **La foto queda debajo del botón «+».** Nuevo orden de la fila: foto a la izquierda (cuadrada, 72–88 px), después nombre, descripción y precio, y el botón de agregar a la derecha. Sin foto, la fila no deja hueco.
4. **Al agregar un producto se vuelve a la primera categoría.** La categoría activa se guarda en un servicio (y en `?cat=` de la URL). Al volver del detalle se restaura la categoría y la posición.
5. **El detalle de la pizza abre a mitad de la imagen.** El router no resetea el scroll. Cambio: `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })`, que abre arriba al ir a un detalle y restaura la posición al volver. Además, `window.scrollTo(0,0)` al iniciar el detalle de producto y el de pizza.
6. **«Ver carrito» da error (ChunkLoadError 403).** El archivo del carrito existe en el build. El 403 aparece porque la vista se reinició mientras la página estaba abierta: la página vieja pedía archivos a una vista cerrada.
   - Cambio defensivo: si falla la carga de una parte de la app (ChunkLoadError), recargar la página una vez, guardando el carrito en localStorage, que ya hoy persiste.
   - Pasa también en producción cuando se publica una versión nueva con la tienda abierta.

## Pruebas
- Unitarias: armado del menú con categorías de tienda, sin categorías (fallback) y con productos fuera de categoría («Otros»). CRUD y reorden de categorías. Validaciones: nombre vacío, producto inexistente, permiso.
- Migración: correrla y revertirla en SQLite y en Postgres local.
- UI en la vista, con capturas en **tema claro**:
  - Pestañas por categoría.
  - Foto a la izquierda.
  - Volver del detalle a la misma categoría.
  - Detalle de pizza arriba de todo.
  - Ver carrito.
  - Pedido de retiro completo, aceptado en el escritorio con caja abierta.
  - Categorías creadas y ordenadas desde Config Tienda Online.
- Gates: build, check y test:all sin fallas nuevas (la línea base son 9 suites). CI en verde.

## Riesgos
- **Productos online fuera de las categorías configuradas:** quedarían ocultos. Se mitiga con la sección «Otros» automática.
- **Migración nueva:** solo agrega tablas, no modifica las existentes.
- **Recarga automática ante ChunkLoadError:** podría entrar en bucle. Se mitiga con una sola vez por sesión (bandera en sessionStorage).
- **Cobro y factura:** no se tocan. El pedido aceptado sigue el mismo camino de F5.

## Ajustes por la auditoría del plan
- **ChunkLoadError:** antes de dar la causa por cierta, se reproduce: con la vista abierta se pide el chunk del carrito con una URL vieja y se compara con la actual. Si el 403 aparece también con la vista recién abierta, es del servidor de la vista y se arregla ahí. Si la recarga única vuelve a fallar, se muestra un aviso «Hay una versión nueva, recargá» con botón, sin bucle. El checkout guarda sus datos (tipo de entrega, mesa, nota) en sessionStorage antes de recargar. Prueba: abrir la tienda, reconstruir y reiniciar el servidor, tocar «Ver carrito».
- **Reglas de `get-menu-online` con categorías de tienda:** solo salen productos activos y online (un producto que deja de serlo desaparece de sus categorías sin borrar la asignación). Las FK tienen `ON DELETE CASCADE` en ambos lados. Las categorías inactivas no se muestran. Un producto en varias categorías aparece en cada una, pero el buscador global deduplica por id. Un `?cat=` inexistente cae en la primera categoría. Las categorías vacías no se muestran. Todo con prueba unitaria.
- **Vuelta atrás:** el `down` borra las categorías cargadas; antes de revertir en producción se exportan a JSON. Antes de migrar producción, backup como siempre (la migración solo agrega tablas).
- **Scroll:** se guarda la posición de la lista por categoría en el servicio y se restaura al volver del detalle; se prueba explícitamente junto con el detalle que abre arriba.

## Vuelta atrás
- Todo va en la rama F6, encima de F5 y sin mergear.
- Si no gusta, se descarta la rama y F5 queda igual.
- Ya mergeado, se puede revertir el PR. La migración tiene `down` (borra las dos tablas nuevas) y el menú vuelve solo a la lógica por familia.
