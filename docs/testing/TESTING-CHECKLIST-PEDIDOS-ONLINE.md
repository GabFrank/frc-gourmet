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
2. **Vincular tarifas:** editar cada zona y elegir su «Tarifa del PdV». La tarifa que ya usa otra
   zona aparece deshabilitada con «(usada por X)». Sin tarifa, el campo muestra «Sin tarifa» y la
   alerta «zona(s) sin tarifa del PdV» se ve arriba.
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
10. **Tema oscuro:** los nombres de las zonas sobre el mapa se leen (el mapa es claro en los dos
    temas) y los puntos de color de la tabla se distinguen.

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
