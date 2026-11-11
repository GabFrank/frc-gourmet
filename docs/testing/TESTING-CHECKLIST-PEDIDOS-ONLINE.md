# Manual de pruebas — Pedidos online a la operación

Rama `mejoras-pedido-online`. Cubre que un pedido de la web llegue a cocina, a
caja y a los reportes, más el fix de impresión por sector en delivery.

**Modo requerido:** `server` (el storefront sólo se sirve ahí). Hace falta una
**caja abierta** y al menos un producto con **sector asignado** y con
`disponibleOnline = true`.

---

## 0 · Preparación

1. *Configuración del PdV* → sección DELIVERY: verificá el par nuevo
   **«Repartidor obligatorio»** + **«EXIGIRLO AL»**. Con el checkbox activo tiene
   que aparecer el desplegable con *Enviar el pedido* / *Finalizar el pedido*.
2. *Ventas → Zonas de Delivery*: creá una zona, abrí su menú `⋮` →
   **Dibujar en el mapa**, marcá 4 puntos alrededor del local y guardá. La
   columna **Cobertura** tiene que pasar de «Sin dibujar» a «Dibujada».
3. Marcá algunos productos como disponibles online desde el form del producto.

> Si ninguna zona está dibujada, la pantalla muestra un aviso: hasta que haya al
> menos una, el sistema no puede cotizar el envío de un pedido online.

---

## 1 · Retiro (PICKUP) de punta a punta

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 1.1 | Desde el celular, entrá a `/tienda`, agregá un producto y confirmá un pedido de **Retiro** | El pedido se crea y caés en «Mis pedidos» |
| 1.2 | Mirá el botón **DELIVERY** del PdV | Badge rojo con el conteo + **un beep de dos notas** |
| 1.3 | Abrí el diálogo de delivery | El panel derecho muestra **PEDIDOS DE LA WEB** con el pedido, marcado `RETIRO` en verde |
| 1.4 | Tocá **ACEPTAR** | Un solo click: snackbar «aceptado y enviado a cocina» |
| 1.5 | Mirá la pantalla de cocina (KDS) y la impresora del sector | **El ítem aparece y se imprime la comanda del sector del producto** |
| 1.6 | Volvé al panel derecho | El pedido pasó a **RETIROS EN CURSO**, marcado `SIN COBRAR` |
| 1.7 | Tocá **COBRAR** | Abre la pantalla de cobro normal, con los ítems del pedido |
| 1.8 | Cobrá | El retiro queda `COBRADO` y aparece el botón **ENTREGADO** |
| 1.9 | Tocá **ENTREGADO** | Sale de la lista |
| 1.10 | Cerrá la caja | **Cierra sin quejarse de ventas abiertas** |

## 2 · Delivery de punta a punta

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2.1 | Desde el celular, elegí **Delivery** en el checkout | Aparece el mapa. **Ya no está la opción de escribir la dirección en vez del mapa** |
| 2.2 | Mové el pin dentro de una zona dibujada | La fila **Envío** muestra el nombre de la zona y **el costo real**, no «A coordinar» |
| 2.3 | Mové el pin bien lejos, fuera de toda zona | Dice **Fuera de cobertura** y no deja confirmar |
| 2.4 | Volvé adentro y confirmá | El pedido se crea con el envío cobrado |
| 2.5 | Aceptalo desde el diálogo de delivery | Aparece **como una fila más en la tabla de la izquierda**, con su repartidor vacío |
| 2.6 | Abrí esa fila | El envío está en el total y la dirección incluye la referencia |
| 2.7 | Mandalo a EN_CAMINO **sin elegir repartidor** | Depende de la config: con etapa *Enviar* lo bloquea; con etapa *Finalizar* lo deja salir |
| 2.8 | Cobrá y marcá ENTREGADO | Con etapa *Finalizar*, acá sí exige el repartidor |

## 3 · El fix de impresión en delivery (sin pedidos online)

Esto es lo que estaba roto desde antes y hay que verificar aparte.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 3.1 | Cargá un delivery **a mano** desde el PdV (NUEVO DELIVERY), con un producto que tenga sector | |
| 3.2 | Mirá el KDS y la impresora del sector | **La comanda sale por la impresora del producto.** Antes no salía nunca: sólo salía el ticket único del reparto |
| 3.3 | Hacé una **venta rápida de mostrador** con el mismo producto | **NO tiene que imprimir comanda** — el mostrador sigue sin ir a cocina |

## 4 · Cancelaciones (lo que más puede doler)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 4.1 | Aceptá un pedido web, esperá a que esté EN_PREPARACION, y rechazalo | Pide el **motivo real** (no un texto fijo) y **la venta detrás queda CANCELADA**, sin ítems activos |
| 4.2 | Repetí con un pedido **ya cobrado** | Lo **bloquea**: revertir un cobro exige `VENTAS_DELIVERY_CANCELAR_COBRADO`, que ningún rol tiene por defecto |
| 4.3 | Con dos comensales pidiendo por QR **en la misma mesa**, rechazá uno | **NO cancela la cuenta de la mesa.** Avisa que hay que quitar los ítems desde el PdV. Los platos del otro comensal siguen activos |
| 4.4 | Intentá rechazar un pedido ya ENTREGADO | Lo rechaza como no cancelable |

## 5 · Seguimiento del cliente

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 5.1 | Dejá «Mis pedidos» abierto en el celular y avanzá el pedido desde el PdV | **Se actualiza solo en ~12s**, sin recargar |
| 5.2 | Mirá el pie de la lista | Dice «Se actualiza solo» con la hora, y hay un botón para forzarlo |
| 5.3 | Entregá el pedido y esperá | El refresco **se corta solo** cuando no queda nada en curso |

## 6 · Seguridad

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 6.1 | En «Mi cuenta» del storefront, con contraseña ya puesta, intentá cambiarla sin poner la actual | Pide la actual. Si la ponés mal: **«La contraseña actual no coincide»**, no un código interno |
| 6.2 | Entrá como CAJERO y abrí *Config Tienda Online* o *Zonas de Delivery* | No puede: eso es `PEDIDOS_ONLINE_CONFIGURAR`, sólo GERENTE |
| 6.3 | Como CAJERO, aceptá y rechazá pedidos | Sí puede: tiene `PEDIDOS_ONLINE_GESTIONAR` |

## 7 · Multi-caja

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7.1 | Con **dos cajas abiertas**, aceptá un pedido web | Se materializa contra la caja del diálogo, sin pedir nada |

---

## 8 · Dashboard de Zonas de Delivery (F7)

Ventas → Configuración → Zonas de Delivery. Necesita ventas de delivery **cobradas** en el período.

1. **Sin datos:** abrir la pantalla en una base sin envíos del período → KPIs en 0, todas las zonas
   en la tabla con 0, el mapa centrado en el local. Sin internet, debajo del mapa aparece «No se pudo
   cargar el mapa de fondo».
2. **La tarifa es el precio de envío:** «Nueva zona» abre un diálogo (la pantalla no se mueve).
   «Tarifa de envío (del PdV)» es obligatoria: sin elegirla no se puede guardar. La que ya usa otra
   zona aparece deshabilitada con «(usada por X)». «Nueva tarifa» crea una en Precios de Delivery y
   la deja elegida. No hay otro campo de precio. Una zona vieja sin tarifa se sigue pudiendo
   dibujar y renombrar, y muestra la alerta «zona(s) sin tarifa del PdV».
   - Lo que cobra la tienda al cliente es el valor de esa tarifa (columna «Envío» de la tabla).
   - Editar sólo el nombre de una zona inactiva no la reactiva ni le cambia el orden.
3. **Los dos tipos de delivery:** hacer un pedido delivery por la tienda dentro de CENTRO y cargar
   en el PdV un delivery por teléfono con la tarifa de CENTRO. Cobrar los dos y entregarlos. Elegir
   «Hoy» → **Aplicar**: CENTRO muestra Tienda 1 y Teléfono 1, y el mapa un punto dentro de CENTRO.
4. **Sin zona:** un delivery por teléfono **sin** tarifa → fila «Sin zona» al final de la tabla y la
   alerta «envío(s) del período no tienen zona». La suma de la columna Ventas da el KPI «Ventas de
   delivery», y ese número coincide con el de delivery en Reportes para el mismo período.
5. **Retiro y no cobrados no cuentan:** un retiro y un delivery sin cobrar no aparecen ni en la
   tabla ni en el mapa.
6. **Clic:** clic en una zona del mapa resalta su fila; clic (o Tab + Enter) en la fila acerca el
   mapa a la zona. Volver a hacer clic la deselecciona.
7. **Permisos:** con un usuario que sólo tiene `VENTAS_PDV` la pantalla se ve, sin «Nueva zona» ni
   el menú ⋮ de cada fila. Con `PEDIDOS_ONLINE_CONFIGURAR` aparecen.
8. **Zonas viejas con la misma tarifa** (caso que encontró la auditoría): si dos zonas ya tenían la
   misma tarifa de antes de la regla, la alerta «tarifa(s) vinculada(s) a más de una zona» aparece y
   sus deliverys por teléfono van a «TARIFA · varias zonas». Igual se tiene que poder **renombrar o
   redibujar** cualquiera de las dos sin que diga «Esa tarifa ya la usa…»; el aviso sólo sale al
   **cambiarle** la tarifa a una que ya usa otra zona.
9. **Tamaño:** achicar la ventana por debajo de ~1100 px → mapa arriba y tabla abajo, el mapa se
   redibuja sin quedar gris. Cambiar de pestaña y volver: el mapa sigue encuadrado.
10. **Varias áreas en una zona** (menú ⋮ → «Dibujar en el mapa»):
    - Los vértices se ven; al pasar el mouse se agrandan y aparece «×». Arrastrar uno lo mueve;
      «×» lo borra; clic sobre un borde agrega un punto en ese lado.
    - «Agregar área» crea «Área 2»: tres clics en otro barrio y «Guardar zona». En el dashboard la
      zona se ve en los dos lugares, con su nombre en cada uno.
    - Un pedido de la tienda con el pin en el área 2 cotiza el envío de esa zona.
    - Volver a abrir el diseñador: están las dos áreas (antes se perdía la segunda al guardar).
    - Un área con 1 o 2 puntos deja «Guardar zona» deshabilitado y su chip punteado.
11. **Tema oscuro:** los nombres de las zonas sobre el mapa se leen (el mapa es claro en los dos
    temas) y los puntos de color de la tabla se distinguen.

## 9 · Pago del pedido y moneda del menú (F8)

1. **Métodos:** en «Config Tienda Online», sección «Cómo puede pagar el cliente», prender efectivo,
   tarjeta en el POS, QR, PIX y transferencia. Guardar y recargar: siguen prendidos. Apagar todos:
   la tienda ofrece sólo efectivo.
2. **Moneda del menú:** en la tienda, el selector de la barra (₲ ▾). Elegir $: la carta, la ficha,
   el carrito y el checkout muestran «$ …», con el aviso «Precios aproximados en $ · se cobra en ₲»;
   el checkout muestra también «Se cobra en ₲ …». Con teclado: Tab hasta el selector, Enter, flechas
   / Tab y Enter; Escape o un clic afuera lo cierran. «Mis pedidos» sigue en ₲.
3. **Efectivo con vuelto:** «¿Cómo pagás?» → Efectivo → «Pagás en $» → «¿Necesitás vuelto?». Los
   chips son siempre mayores al total. Escribir «10,50» funciona (coma decimal). Un monto igual o
   menor al total no deja confirmar. Debajo: «Te damos de vuelto ₲ …» (en guaraníes).
4. **Otros métodos:** QR / PIX / transferencia / tarjeta: texto de ayuda «al recibir»; sin moneda
   ni vuelto. Observación del pago opcional (se guarda en MAYÚSCULAS).
5. **Lo que ve el local:**
   - Bandeja: la línea de pago, p. ej. «EFECTIVO · EN $ · PAGA CON $ 5,00 (≈ ₲ 30.000) · VUELTO ₲ 10.000».
   - Aceptar → PdV → DELIVERY → seleccionar el reparto: «PAGO DEL CLIENTE» en el recibo.
   - «PAGO» → el cobro se abre con el aviso «Pago del cliente: …», moneda y forma de pago elegidas y
     el monto «paga con» en el campo. **No hay ninguna línea agregada**: cerrar con Cancelar no
     guarda nada. Agregar la línea y finalizar cobra como siempre.
   - Imprimir el ticket del delivery: bloque «PAGO:» con el vuelto a llevar.
6. **Casos borde (los encontró la auditoría):**
   - Escribir en la observación o en las notas caracteres raros (copiados de otro lado): el pedido
     se crea y el ticket no imprime basura (antes, en Postgres, un NUL hacía fallar el pedido).
   - Desactivar el dólar después de un pedido en $: la bandeja y el ticket siguen diciendo «paga con $».
   - Un pedido viejo (de antes de F8) muestra sólo «EFECTIVO».

## 10 · Detalle del pedido, cancelación y WhatsApp (F9)

1. **Detalle:** en «Mis pedidos», tocar la cabecera de una tarjeta («Ver ›»). Se ve estado con
   pasos, productos con su personalización, entrega, pago elegido y total. El botón junto al número
   lo copia. Con el pedido en curso, avanzarlo desde la bandeja: la página cambia sola (≤ 12 s).
2. **Modificar** (pedido recién hecho, el local todavía no lo aceptó): «Modificar pedido» → «Sí,
   modificar». El pedido queda cancelado («MODIFICADO POR EL CLIENTE») y el carrito tiene sus
   productos (lo que había antes en el carrito se reemplaza). Cambiar algo y confirmar: sale un
   pedido nuevo. Aceptarlo en la bandeja: el botón «Modificar» ya no aparece.
3. **Pedir que lo cancelen** (pedido aceptado o en preparación): «Pedir que lo cancelen» → motivo
   → «Enviar solicitud». La tienda dice que el local responde; el botón desaparece.
   - En la bandeja suena/sube el contador; la tarjeta muestra «El cliente pidió cancelar» con el
     motivo. El filtro «Piden cancelar» la lista sola.
   - **Aprobar cancelación** → «Sí, cancelar»: el pedido queda CANCELADO; si tenía venta, la venta
     se cancela (como el rechazo). Si estaba pagado con tarjeta, el aviso de devolver en uPay.
   - En otro pedido, **No se puede cancelar** con motivo: el cliente ve «El local no pudo
     cancelarlo» con ese motivo y ya no puede volver a pedirlo.
   - Pedido de mesa ya en la cuenta: la tienda no ofrece cancelar (se le pide al mozo).
4. **Repetir pedido** (cualquier pedido, también entregado): el carrito se llena con los mismos
   productos al precio de hoy. Pausar uno en la carta antes: el carrito avisa que no se pudo poner.
5. **Compartir:** en el teléfono abre el menú de compartir; en la compu, WhatsApp con el texto
   (número, comercio, estado, productos, total; sin dirección ni teléfono).
6. **Contacto:** cargar «Teléfono del local» en Config Tienda Online → en el detalle aparecen
   «Llamar al local» y «Escribir al local» (WhatsApp con «te escribo por mi pedido …»).
7. **WhatsApp por el número del local:** en Config Tienda Online, «Enviar el código por» →
   «Número del local (Evolution API)». Tiene que decir «conectada» (si no, cargar la conexión en
   Configuración › Notificaciones). «Probar envío» a un teléfono propio: llega «Tu código para
   ingresar a … es 123456». Luego ingresar a la tienda con ese teléfono: el código llega por
   WhatsApp desde el número del local. Con Meta elegido y sin token, sale igual por Evolution
   (aviso en pantalla).

## 11 · Atención desde el diálogo de delivery (F10)

La cola del diálogo de delivery (PdV → DELIVERY) es la pantalla de atención. La bandeja de Pedidos
Online sigue como panel de observación: lo que se hace en una tiene que verse en la otra.

1. **Un solo número:** en la lista de delivery, la columna PEDIDO dice `PO-…` para los de la web y
   `N° 8` para los cargados en el PdV. Al abrir uno web, el comprobante dice «PEDIDO WEB PO-…» y
   debajo «DELIVERY N° 8 · VENTA #14». El ticket impreso dice lo mismo. En la bandeja, la tarjeta
   muestra «Delivery N° 8 · Venta #14».
2. **Cola por secciones:** con un pedido nuevo, uno que pidió cancelar, uno aceptado sin caja
   abierta y uno cancelado que estaba pagado con tarjeta, la cola los muestra en PIDEN CANCELAR,
   NUEVOS, ACEPTADOS SIN ENVIAR A COCINA y DEVOLVER PAGO EN UPAY, cada uno con sus botones. El
   botón rojo del subheader dice cuántos hay.
3. **Badge del PdV:** cuenta lo mismo que la cola. Suena con un pedido nuevo, una cancelación
   pedida o un aceptado sin cocina; una devolución suma al número sin sonar.
4. **Pidió cancelar, con la fila abierta:** la fila muestra «PIDE CANCELAR»; en el footer aparecen
   «CANCELAR (LO PIDIÓ)» y «NO SE PUEDE». Responder desde ahí: la bandeja lo refleja.
5. **Enviar a cocina:** un pedido aceptado sin venta → «ENVIAR A COCINA» usa la caja de este PdV;
   aparece en la lista como un delivery más.
6. **Devolución:** cancelar desde el footer un pedido pagado con tarjeta → aviso de devolver en
   uPay; en la cola sale en DEVOLVER con su referencia; «YA DEVOLVÍ» lo saca (y la bandeja lo
   muestra como «Pago devuelto»).
7. **Chip de pago online** en la lista (PAGADO ONLINE, ESPERANDO PAGO, DEVOLVER, PAGO NO ENTRÓ, PAGO NO DEVUELTO…), igual que la
   insignia de la bandeja.
8. **Qué pasa con el pago al cancelar:** cancelar un pedido pagado con tarjeta por cualquier
   puerta (CANCELAR del diálogo, CANCELAR (LO PIDIÓ), RECHAZAR de la cola o de la bandeja,
   Aprobar cancelación, CANCELAR VENTA del historial o de Últimas ventas, CANCELAR del PdV) abre
   «¿Qué pasa con el pago con tarjeta?» con cuatro opciones. «Hay que devolverlo» viene marcada.
   «El pago no entró» y «No se devuelve» no dejan confirmar sin motivo. «Volver» no cancela nada.
   Resultado: DEVOLVER → cola DEVOLVER; Ya lo devolví → «PAGO DEVUELTO»; no entró → «PAGO NO
   ENTRÓ»; no se devuelve → «PAGO NO DEVUELTO». El personal recibe aviso en todas menos «ya lo
   devolví».
9. **Cerrar una devolución:** en la cola DEVOLVER, «RESOLVER DEVOLUCIÓN» (en la bandeja «Resolver
   devolución») ofrece las tres salidas sin «devolver»; el pedido sale de la cola.
10. **Venta cobrada cancelada desde el historial:** un pedido web pagado online, entregado y
    cobrado; cancelar su venta desde el historial pregunta por el pago y, con «devolver», el pedido
    sigue ENTREGADO pero entra en DEVOLVER.

## 12 · Teléfono de contacto (cuentas de Google o email)

1. Entrar a la tienda con Google (o email) en una cuenta sin teléfono e ir al checkout: arriba
   aparece «Tu teléfono» con el aviso de WhatsApp y del repartidor.
2. Confirmar sin teléfono → «Ingresá un teléfono válido…». Con uno corto, el mismo aviso.
3. Con un teléfono válido el pedido se crea; en la bandeja y en la lista de delivery el pedido
   muestra ese número.
4. El siguiente checkout lo trae precargado; «Mi cuenta» lo muestra como «Teléfono de contacto» y
   se puede cambiar.
5. Una cuenta que entró por código de WhatsApp no ve el campo (ya tiene teléfono).

## 13 · Pago online con Bancard (proveedores intercambiables)

Requiere las claves de PRUEBA de Bancard (Portal de Comercios › vPOS) y la URL pública de la
tienda registrada en el portal como URL de confirmación.

1. **Config:** Config Tienda Online › Pago online › Proveedor «Bancard». Entorno «Prueba», clave
   pública y privada. Guardar: la privada queda «guardada» y no se vuelve a mostrar. Abajo aparece
   la URL de confirmación para copiar al portal. «Probar conexión» → correcta.
2. **Activar** «Ofrecer pago con tarjeta» sin la clave privada → no deja («faltan datos del
   proveedor»). Con las dos → Activo.
3. **Cobro aprobado:** en la tienda, checkout con «Pagar con tarjeta». Lleva a la página de pago con
   el formulario de Bancard dentro. Pagar con la tarjeta de prueba de Bancard. Vuelve a la misma
   página y dice «¡Pago confirmado!». En la bandeja y el delivery: «REF. BANCARD …».
4. **Rechazo:** tarjeta de prueba que Bancard rechaza → «no se aprobó», botón «Intentar de nuevo».
5. **Cancelar en Bancard:** el botón cancelar del formulario vuelve con «Cancelaste el pago» y
   «Pagar con tarjeta».
6. **Cancelación con devolución automática:** activar «Devolver automáticamente», cancelar un
   pedido pagado eligiendo «Hay que devolverlo» → queda «PAGO DEVUELTO» y en Bancard la compra
   aparece anulada. Sin el interruptor, queda en la cola DEVOLVER.
7. **Cambio de proveedor:** con un pedido de uPay en curso, pasar a Bancard: el pedido viejo
   sigue mostrando uPay y no se consulta a Bancard.

## 14 · Cuentas de la tienda vinculadas a un cliente (F8b fase 1)

Pantalla: Ventas → Tienda online → **Cuentas web**. Operación por agentes:
`docs/runbooks/RUNBOOK-TIENDA-VINCULAR-CUENTAS.md`.

1. **Lista:** aparecen las cuentas con su teléfono (verificado o «de contacto, sin verificar»),
   pedidos, último ingreso y cliente vinculado. Filtrar por texto y por vínculo con **Buscar**.
2. **Vincular:** ⋮ → Vincular a un cliente → elegir uno → confirmar con una nota. La fila muestra
   el cliente y «Vinculada por <usuario> · <fecha>».
3. **Un cliente, una cuenta:** intentar vincular otra cuenta al mismo cliente → «ese cliente ya
   tiene otra cuenta web vinculada».
4. **Pedido a nombre del cliente:** con la cuenta vinculada, hacer un pedido en la tienda y
   aceptarlo: la venta del PdV sale con el cliente (y la factura con sus datos).
5. **Ficha del cliente:** Clientes → ⋮ → Ver estado de cuenta: arriba a la derecha
   «Cuenta web: …», con quién vinculó en el tooltip.
6. **Desvincular:** ⋮ → Desvincular → pide motivo. El pedido del paso 4 sigue a nombre del
   cliente; un pedido nuevo ya no.
7. **Historial:** ⋮ → Historial de vínculos: las dos acciones con usuario, fecha y nota/motivo.
8. **Permisos:** con un usuario que solo tiene `CLIENTES_VER` se ve la lista pero no aparecen
   Vincular ni Desvincular; sin `CLIENTES_VER` la pantalla no está en el menú.

## 15 · Compra a cuenta (F8b fase 2)

Preparación: un cliente con crédito y límite (ficha del cliente), su cuenta web vinculada (§14) y
con teléfono o correo verificado; Config Tienda Online → «Permitir A cuenta en la tienda».

1. **Checkout:** con esa cuenta, «¿Cómo pagás?» muestra **A cuenta** con «Disponible: ₲ …».
   Con otra cuenta (sin vincular o sin crédito) no aparece.
2. **No alcanza:** con un total mayor al disponible, el texto dice «No te alcanza…» y no deja
   confirmar.
3. **Pedido:** confirmar → «Mis pedidos» dice «A tu cuenta del local».
4. **Aceptar en el PdV:** en el cliente aparece una cuenta por cobrar por el total con una cuota
   que vence el último día del mes; el saldo del cliente sube; el comprobante del diálogo de
   delivery dice **A CUENTA** (no «A cobrar»).
5. **Entregar:** LISTO → finalizar sin cobrar nada → ENTREGADO. La deuda sigue una sola.
6. **Cancelar** (otro pedido aceptado): la cuenta por cobrar queda CANCELADA y el saldo vuelve.
7. **Sin crédito al aceptar:** quitarle el crédito al cliente con un pedido pendiente → al
   aceptarlo, no se puede (no se crea venta ni deuda).

## 16 · Varios proveedores a la vez y Pix con IC Pay

Requiere la URL de la API, el usuario (email), la API key y la contraseña de IC (usuario «store»
sin MFA). Runbook: `docs/runbooks/RUNBOOK-TIENDA-PAGO-PIX-ICPAY.md`.

1. **Config:** Config Tienda Online › Pago online › «Proveedor a configurar» = IC Pay. Cargar los
   cuatro datos y prender «Ofrecer Pix (Brasil)». El chip pasa a «Datos completos» y arriba dice
   «Se ofrecen: Pix (Brasil)». «Probar conexión» → «Conectado como <comercio> (cuenta en USD)».
2. **Falta un dato:** borrar la contraseña con IC Pay prendido y guardar → no deja («faltan datos
   del proveedor: IC Pay: Contraseña»).
3. **Checkout con un solo proveedor:** «Online» muestra la ayuda del Pix y el botón dice
   «Pagar con Pix · …». No aparece selector de medio.
4. **QR:** confirmar → página de pago con el QR, «Pagás R$ X,XX (₲ …)» con coma, «Copiar código
   Pix» (pegarlo en un bloc: empieza con `000201`) y «Vence en 59:xx» bajando.
5. **Volver a la página** (recargar o desde «Mis pedidos»): el mismo QR, no se crea otra orden.
6. **Pagado:** pagar el QR (ver la advertencia de staging en el runbook) → en segundos la página
   dice «¡Pago confirmado!», el pedido aparece en la bandeja y su venta queda saldada con
   PIX ONLINE.
7. **Vencido:** dejar pasar la hora sin pagar → el pedido queda cancelado («no se completó a
   tiempo»).
8. **Dos proveedores:** prender Bancard e IC Pay. En el checkout, «Online» muestra «Tarjeta —
   Bancard» y «Pix (Brasil)»; el botón cambia de texto según el elegido.
9. **Cambiar de medio:** con un pago con tarjeta rechazado, la página ofrece «Intentar de nuevo
   con tarjeta» y «Pagar con Pix (Brasil)». Elegir Pix → aparece el QR (intento 2).
10. **Cancelar un pedido Pix pagado** eligiendo «Hay que devolverlo» → cola DEVOLVER con
    «en IC Pay» (no hay devolución automática).

## 17 · USDT: un pago abierto por vez (IC Pay)

Mientras IC corrige la asignación de pagos USDT, la tienda deja **un solo pago USDT abierto a la
vez** por cuenta de IC (`docs/runbooks/RUNBOOK-TIENDA-PAGO-PIX-ICPAY.md`, «USDT: un pago por vez»).

1. **Config:** la cuenta de IC Pay en moneda USDT. El checkout ofrece «USDT (Tron)».
2. **Primer pedido:** confirmar → página de pago con dirección, monto en USDT y vencimiento.
3. **Segundo pedido mientras el primero está abierto** (otra pestaña u otra cuenta): no se crea
   el pago. El checkout dice «Ahora mismo hay otro pago con USDT en curso. Probá de nuevo en unos
   minutos o elegí otro medio de pago». No queda ninguna orden en IC.
4. **Pagar el primero** (en staging, desde la billetera de prueba de la red Nile): en segundos
   «¡Pago confirmado!» y el pedido entra a la bandeja.
5. **Ahora sí el segundo:** confirmar de nuevo → se crea el pago.
6. **Vencido:** dejar vencer un pago abierto → el siguiente pedido ya puede pagar con USDT.

## 18 · Venta a cuenta editada después de aceptada

Preparación: un pedido **A cuenta** (§15) aceptado, con su venta ABIERTA en el PdV. Anotar el saldo
del cliente y el monto de la cuenta por cobrar antes de cada paso (ficha del cliente → cuentas).

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 18.1 | En el PdV, **agregar** un ítem a esa venta | La deuda sube por el precio del ítem; el saldo del cliente sube lo mismo; en sus movimientos aparece un **AJUSTE POSITIVO** «VENTA #… EDITADA» |
| 18.2 | **Cancelar** o **quitar** un ítem | La deuda baja; **AJUSTE NEGATIVO** |
| 18.3 | Cambiar la **cantidad** o poner un **descuento** a un ítem | La deuda sigue al nuevo total |
| 18.4 | Delivery: **cambiar el costo de envío** o pasar a retiro | La deuda sigue al total |
| 18.5 | Agregar ítems hasta **pasar el límite** del cliente | La deuda queda en el tope; la diferencia aparece como **saldo de la venta** y se cobra al entregar |
| 18.6 | Cancelar todos los ítems (total 0) | La cuenta por cobrar queda **CANCELADA** y el saldo vuelve a como estaba |
| 18.7 | Con otra venta a cuenta: **cobrar una parte** de la deuda desde caja (cobro de CPC), y después intentar agregar, quitar, cancelar, editar o personalizar un ítem | **No deja**, antes de cambiar nada, con el mensaje «Esta venta tiene una deuda a cuenta con cobros y no se puede modificar…». El ítem queda como estaba, **incluidas sus personalizaciones** |
| 18.8 | Cobrar y **facturar** la venta editada al entregar | La factura sale por el total nuevo; la deuda queda en la cuenta del cliente |

## 19 · Avisos del pedido por WhatsApp (Meta)

Preparación: Config Tienda Online → «Avisos al cliente por WhatsApp» prendido, «Teléfono de prueba»
= tu número, canal Meta con token vigente y las plantillas `aviso_pedido_*` APROBADAS
(`docs/runbooks/RUNBOOK-TIENDA-AVISOS-WHATSAPP.md`). Fuera de la app instalada **solo salen al
teléfono de prueba**: la cuenta del cliente tiene que tener ese número verificado.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 19.1 | Checkout con la cuenta de teléfono verificado | Aparece la casilla «Quiero recibir por WhatsApp los avisos de este pedido», **destildada** |
| 19.2 | Retiro con la casilla tildada → aceptar → LISTO → entregar | Llegan 3 mensajes del número de Meta: aceptado, listo para retirar, entregado; cada uno con el enlace al pedido |
| 19.3 | Delivery con casilla → aceptar → EN_CAMINO → entregar | aceptado, **en camino** («el repartidor puede llamarte»), entregado. «Listo» **no** se avisa en delivery |
| 19.4 | Cancelar un pedido aceptado (pago al recibir) | «fue cancelado» (sin devolución) |
| 19.5 | Cancelar un pedido Pix pagado eligiendo devolverlo | «fue cancelado. Te devolvemos el pago» |
| 19.6 | Pedido **sin** tildar la casilla | No llega nada |
| 19.7 | Un pago online que vence sin pagarse | No llega «cancelado» (el cliente ya lo vio en la página de pago) |
| 19.8 | Pedido por QR de mesa | No hay casilla ni avisos |
| 19.9 | Apagar el interruptor con un aviso pendiente | No sale |
| 19.10 | Dos cambios de estado seguidos (aceptar y en camino en menos de 15 s) | Sale solo el último |

## 20 · Ingreso con código por WhatsApp (Meta)

1. «Ingresar» → teléfono → llega el código del número de Meta, con botón «Copiar código».
2. Código equivocado → no entra; el correcto → entra y la cuenta queda con el teléfono verificado.
3. Con el número de **prueba** de Meta el código solo llega a destinatarios autorizados en el panel;
   a otro número falla («no se pudo enviar el código»). En producción, con el número real, llega a
   cualquiera.
4. Token vencido (el temporal dura ~24 h): no llegan ni códigos ni avisos. Cargar uno nuevo.

## Qué NO se probó automáticamente

- **SQLite es lo que corren los tests** (`.tmp/*.db` con todas las migraciones).
  El desarrollo de esta rama se hizo contra **Postgres**, así que los dos motores
  están cubiertos, pero la app **empaquetada** sobre SQLite sólo se validó por
  tests, no a mano.
- **Impresión y KDS reales**: los tests verifican que se genere el `ComandaItem`,
  que es la condición necesaria. Que la impresora física escupa el papel hay que
  verlo en el local (pasos 1.5 y 3.2).
- **El mapa** (dibujo de zonas, dashboard de zonas y pin del checkout) necesita
  internet: los mosaicos vienen de OpenStreetMap (CARTO dejó de servirlos sin
  clave en 2026-11) y la dirección en texto de Nominatim.

## 21 · Campo de teléfono con país

El ingreso por código, «Mi cuenta» y el checkout usan el mismo campo: país (Paraguay por defecto)
y número, validado mientras se escribe. Se guarda internacional, solo dígitos (595981123456).
Reglas en `projects/storefront/src/app/core/telefono.ts`; test `npm run test:telefono`.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 21.1 | Escribir `0981 123 456` y también `981123456` | Los dos quedan válidos, con tilde verde y «+595 981 123 456» debajo |
| 21.2 | Escribir a medias (`09811`) | Pista gris «Faltan N dígitos»; recién al salir del campo pasa a error rojo |
| 21.3 | En el ingreso, escribir un fijo (`021 123 456`) | Error «Tiene que ser un celular con WhatsApp». En «Mi cuenta» y el checkout el fijo sí vale |
| 21.4 | Pegar `+55 11 91234 5678` | El país cambia solo a Brasil |
| 21.5 | «Otro país» y `+44 7400 123456` | Válido. Un número con 0 adelante pide el código de país |
| 21.6 | Cuenta vieja guardada como `0981…` | Al ingresar con código entra a **la misma** cuenta (no crea otra) y pasa a guardarse `595981…` |
| 21.7 | En el admin, Cuentas de la tienda, buscar `0981…` | Encuentra la cuenta guardada `595981…` |
