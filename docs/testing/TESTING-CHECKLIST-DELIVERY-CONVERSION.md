# Manual de pruebas — Convertir un pedido entre DELIVERY y RETIRO

Un pedido para retirar y un reparto son **el mismo registro** con distinto
`modo`. Hasta ahora el modo se elegía al dar de alta y no se podía cambiar: si
el cliente llamaba de vuelta para decir «mejor lo paso a buscar», había que
cancelar el pedido y cargarlo entero de nuevo.

Lo que se agrega es el botón que lo convierte. Lo que hay que probar no es que
cambie una etiqueta: convertir **mueve el total de la venta** (el envío entra o
sale del cobro), desasigna al repartidor, cambia qué transiciones de estado son
legales y sincroniza el pedido que el cliente está mirando en la tienda online.

> **Reiniciar la app antes de empezar.** Hay un handler nuevo
> (`delivery-convertir-modo`) y cambios en cuatro handlers más.
> **No hay migración**: la columna `modo` ya existía.

## Preparación

| # | Paso | Esperado |
|---|---|---|
| 0.1 | Abrir la app y dejar correr las migraciones | Arranca sin errores. Ninguna migración nueva debería correr. |
| 0.2 | Ventas → Precios de Delivery: dos zonas, `CENTRO` = 5.000 y `PERIFERIA` = 15.000 | Activas. |
| 0.3 | RRHH → Funcionarios: al menos un funcionario activo | Va a ser el repartidor. |
| 0.4 | Configuración de PdV → DELIVERY: *Zona por defecto* = CENTRO, *Requiere dirección* = OFF, *Requiere repartidor* = ON, *Etapa del repartidor* = EN_CAMINO | Es la config con la que se prueban los candados. |
| 0.5 | Abrir una caja en el PdV | — |

---

## 1. De delivery a retiro: se va todo lo que depende de que alguien lo lleve

| # | Paso | Esperado |
|---|---|---|
| 1.1 | PdV → DELIVERY → NUEVO DELIVERY. Teléfono, nombre `JUAN`, dirección `AVDA SIEMPRE VIVA 742`, zona CENTRO → CREAR | Se crea y el PdV entra en modo delivery. |
| 1.2 | Cargar productos por 60.000 y volver a la lista de DELIVERY | El panel derecho muestra SUBTOTAL 60.000 / ENVÍO 5.000 / **TOTAL 65.000**. |
| 1.3 | Con el pedido seleccionado, mirar el footer | Aparece un botón **A RETIRO** (con icono de bolsa). |
| 1.4 | Click en **A RETIRO** | Se abre el diálogo. Lista lo que se pierde: *se quita la dirección*, *se deja de cobrar el envío de 5.000*. El bloque de totales muestra **ENVÍO ~~5.000~~ → 0** y **TOTAL ~~65.000~~ → 60.000**. |
| 1.5 | Confirmar | Snackbar «Pedido #N convertido a RETIRO EN LOCAL». |
| 1.6 | Mirar la fila en la lista | En la columna DELIVERY dice **RETIRAR** en vez de un monto. |
| 1.7 | Mirar el panel derecho | El título dice **RETIRO EN LOCAL**. No hay línea de ENVÍO. TOTAL = 60.000. |
| 1.8 | Abrir el menú **ESTADO** | Ya **no** ofrece EN_CAMINO: un retiro no sale a la calle. |
| 1.9 | Mirar el botón **REPARTIDOR** | Deshabilitado, con tooltip explicando que lo pasa a buscar el cliente. |
| 1.10 | **COBRAR** | El encabezado del cobro **ya no muestra `Envío`** y el total a cobrar es **60.000**. |

## 2. De retiro a delivery: aparecen dirección, zona y envío

| # | Paso | Esperado |
|---|---|---|
| 2.1 | NUEVO DELIVERY → toggle **RETIRAR**. Teléfono y nombre `MARIA` → CREAR | El form esconde dirección y precio de envío. |
| 2.2 | Cargar productos por 40.000 y volver a la lista | TOTAL 40.000, sin línea de ENVÍO. |
| 2.3 | Footer → **A DELIVERY** | El diálogo pide **DIRECCIÓN** y **PRECIO DELIVERY**. La zona viene en **CENTRO** (la default de la config). |
| 2.4 | Elegir PERIFERIA sin escribir dirección | El bloque de totales pasa a **ENVÍO 0 → 15.000** y **TOTAL 40.000 → 55.000** en vivo. |
| 2.5 | Escribir la dirección y confirmar | Se convierte. La fila muestra 15.000 en la columna DELIVERY. |
| 2.6 | Abrir **DATOS** | La dirección y la zona están cargadas. |
| 2.7 | **COBRAR** | El encabezado muestra `Envío: 15.000` y el total es **55.000**. |

## 3. Los candados

| # | Paso | Esperado |
|---|---|---|
| 3.1 | Config de PdV → *Requiere dirección* = **ON**. Crear un RETIRO y darle **A DELIVERY** sin escribir dirección | El botón de confirmar está **deshabilitado**. |
| 3.2 | Volver a poner *Requiere dirección* = OFF | — |
| 3.3 | Crear un delivery, cobrarlo y **después** intentar convertirlo | El botón **A RETIRO** está **deshabilitado**, con tooltip «La venta ya fue cerrada: anulá el cobro antes de convertir el pedido». |
| 3.4 | Cancelar un pedido y seleccionarlo | El botón de convertir está deshabilitado («Un pedido CANCELADO ya no se puede convertir»). |
| 3.5 | Marcar un pedido como ENTREGADO y seleccionarlo | Ídem. |

## 4. El repartidor: el candado que se podía saltar

Este es el caso más delicado y la razón por la que el diálogo pide el
repartidor en algunos casos. El candado `Requiere repartidor` sólo dispara **en
la transición** hacia EN_CAMINO. Un pedido que **ya está** en EN_CAMINO no
vuelve a atravesarla, así que convertirlo —que lo deja sin repartidor— lo
dejaría llegar a ENTREGADO sin ninguno.

| # | Paso | Esperado |
|---|---|---|
| 4.1 | Config: *Requiere repartidor* = ON, *Etapa* = EN_CAMINO | — |
| 4.2 | Crear un delivery, cargarle ítems, **LISTO** y **ENVIAR** eligiendo un repartidor | Estado EN_CAMINO, con el repartidor en la columna ENTREGADOR. |
| 4.3 | **A RETIRO** | El diálogo avisa en amarillo: «Este pedido está EN CAMINO. Se va a desasignar a *nombre*». |
| 4.4 | Confirmar | Se convierte. El estado **sigue en EN_CAMINO** (convertir no retrocede el estado) y la columna ENTREGADOR queda vacía. |
| 4.5 | Abrir el menú **ESTADO** | Ofrece ENTREGADO **y PARA_ENTREGA**: si el repartidor dio la vuelta y trajo el pedido de vuelta al local, hay cómo reflejarlo. |
| 4.6 | Ahora **A DELIVERY** sobre ese mismo pedido | El diálogo muestra la fila del repartidor con «Falta elegir quién lo lleva» en rojo, y **el botón de confirmar está deshabilitado**. |
| 4.7 | Botón REPARTIDOR → elegir uno → confirmar | Se convierte y el repartidor queda asignado. |
| 4.8 | Crear un RETIRO nuevo (estado ABIERTO) y darle **A DELIVERY** | **No** pide repartidor: el pedido todavía tiene que pasar por EN_CAMINO, que es donde el candado dispara. |
| 4.9 | Sobre ese pedido, **ENVIAR** sin elegir repartidor | Falla con «Seleccioná el repartidor antes de enviar el pedido»: el candado sigue vivo. |

## 5. La plata: convertir con cobro parcial

| # | Paso | Esperado |
|---|---|---|
| 5.1 | Crear un delivery zona CENTRO (envío 5.000), cargar 20.000 en ítems | TOTAL 25.000. |
| 5.2 | COBRAR → tab **Items** → cubrir todo → registrar el cobro **sin finalizar** la venta | Los ítems quedan marcados PAGADO. La venta sigue ABIERTA. |
| 5.3 | **A RETIRO** | El diálogo muestra, en rojo, «Ya hay 25.000 cobrados contra este pedido: 5.000 por encima del total nuevo». |
| 5.4 | Confirmar igual | Se convierte, y un snackbar rojo repite el excedente. **La plata no se mueve sola**: es el mostrador el que decide si devuelve la diferencia. |

## 6. Reimpresión

| # | Paso | Esperado |
|---|---|---|
| 6.1 | Crear un delivery y darle IMPRIMIR | Sale un ticket que dice **DELIVERY**, con DIRECCION y ZONA. |
| 6.2 | **A RETIRO**, tildando «Reimprimir el ticket con los datos nuevos» | Sale un ticket nuevo que dice **RETIRO EN LOCAL**, sin dirección, sin zona y sin repartidor, y con el total sin envío. |

## 7. Concurrencia: el pedido no se despega de su envío

| # | Paso | Esperado |
|---|---|---|
| 7.1 | Con un pedido convertido a RETIRO, abrir **DATOS** y guardar cambiando sólo la observación | El pedido **sigue en RETIRO** y el envío sigue en 0. (Antes, editar los datos escribía de vuelta el modo que se había leído antes y revertía la conversión.) |
| 7.2 | Ídem con el botón REPARTIDOR y con un cambio de ESTADO | Igual: el modo y el envío siguen contando la misma historia. |
| 7.3 | Sobre un RETIRO, intentar asignarle un repartidor | Rechazado: «Un pedido para retirar no tiene repartidor». |

## 8. El diálogo de cobro no se queda con el total viejo

Esto es lo que evita que convertir haga perder plata en silencio.

| # | Paso | Esperado |
|---|---|---|
| 8.1 | Abrir un RETIRO y darle **COBRAR** (total sin envío). **Dejar el diálogo abierto.** | — |
| 8.2 | Desde otra terminal (o cerrando y reabriendo el módulo en otra ventana), convertir ese mismo pedido a DELIVERY con zona CENTRO | El envío pasa a 5.000. |
| 8.3 | Volver al diálogo de cobro abierto y darle **FINALIZAR** | **Se aborta** con «El costo de envío de este pedido cambió mientras cobrabas. Se actualizó el total: revisalo y volvé a finalizar». El total en pantalla ya muestra el envío nuevo. |
| 8.4 | Finalizar de nuevo | Ahora sí cierra, cobrando el total correcto. |

## 9. Pedidos que entraron por la tienda online

Requiere la tienda encendida (modo servidor).

| # | Paso | Esperado |
|---|---|---|
| 9.1 | Hacer un pedido DELIVERY desde la tienda y aceptarlo en el PdV | Entra a la lista con el chip **WEB**. |
| 9.2 | Convertirlo a RETIRO | Se convierte igual que uno cargado a mano. |
| 9.3 | Abrir el seguimiento del pedido como cliente | Ya **no** dice que es un envío: figura como retiro, sin dirección de entrega y con el total sin costo de envío. |
| 9.4 | Volver a convertirlo a DELIVERY con zona PERIFERIA | El seguimiento del cliente vuelve a mostrar envío, con la dirección nueva y el total actualizado. |

> ⚠️ La **zona de la tienda** (`zonaDelivery`, la de los polígonos del mapa) no
> se puede reconstruir al pasar de retiro a delivery: es una entidad distinta de
> las zonas del PdV y no hay mapa entre ellas. Queda vacía; la zona real del
> pedido queda en el delivery, que es la que se cobra. En el panel admin de
> pedidos online eso se ve como una fila sin nombre de zona.

## Tests automáticos

```bash
npm run test:delivery-conversion   # 67 asserts, específico de esta feature
npm run test:delivery              # 53 asserts, el módulo completo
npm run test:locks-pg              # el lock del delivery, sobre Postgres real
```

El de locks se **saltea** si no hay un Postgres a mano. Vale la pena correrlo
antes de tocar la concurrencia del módulo: es el único que prueba que el
candado del delivery **bloquea de verdad** a un segundo escritor, en vez de
pasar de largo en silencio.
