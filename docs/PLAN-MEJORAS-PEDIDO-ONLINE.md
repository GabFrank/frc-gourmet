# Plan de implementación — Pedidos Online (PICKUP + DELIVERY a producción)

> Branch `mejoras-pedido-online`, base `develop @ 269072f`.
> **v2 — integra dos auditorías independientes del plan v1** (corrección técnica /
> producto y operación). Los hallazgos que cambiaron el plan están marcados 🔺.
>
> Fuentes: auditoría de doc vs código, dos auditorías del subsistema, dos
> auditorías de este plan, y prueba manual del storefront con **el catálogo real
> de producción importado** (148 productos publicables, 9 con variaciones,
> 42 sabores, 33 adicionales, 4 imágenes).

---

## 0. Diagnóstico

La web capta el pedido y lo cotiza bien, pero **el pedido no entra a la
operación**: para PICKUP y DELIVERY no hay puente hacia `Venta`, así que no llega
a cocina, no descuenta stock, no entra en caja ni en reportes. El cajero retipea
el pedido entero — y ni se entera de que llegó.

🔺 **Y el puente es más grande de lo que parecía.** El plan v1 asumía que bastaba
con generalizar `materializarPedidoOnlineEnVenta` reusando sus hooks de cocina.
Es falso: los dos hooks están gateados por mesa o comanda.

```ts
// ventas.handler.ts:4062  (autoPrintComandaIfNeeded)
if (!tieneMesa && !tieneComanda) return; // Venta directa sin cocina
// ventas.handler.ts:4116  (crearComandaItemsSiCorresponde)
if (!venta.mesa?.id && !venta.comanda?.id) return; // venta de mostrador
```

Una `Venta` sin mesa ni comanda crea sus `VentaItem` y **nunca genera un
`ComandaItem`**: no aparece en ningún KDS y no imprime ticket de cocina.
Materializar sin tocar esto deja el problema original intacto.

---

## Fase 0 — Curación del menú (contenido, en el camino crítico)

🔺 **Ambas auditorías coinciden en que esto bloquea la salida tanto como un bug.**

Publiqué los 148 vendibles y la carta es inusable: BEBIDAS termina siendo el
inventario alfabético del bar — shots de vodka («ABSOLUT 50 ML ₲20.000»), chopps,
dosis sueltas — mezclado con las gaseosas.

El problema de fondo no es que falte una pantalla. Es que **la carta online es un
espejo del inventario con un filtro de visibilidad**: las categorías del
storefront son literalmente las `Familia`/`Subfamilia` del catálogo interno
(`menu.page.ts:97,110` toma `categoriaId` directo del producto). Ninguna pantalla
de curaduría arregla eso sola: un toggle masivo sigue dejando que «BEBIDAS» sea la
familia entera del stock, con subfamilias de conveniencia interna que no
significan nada para un cliente.

**Qué hacer:**
- Categorización propia de la tienda, separada de `Familia`/`Subfamilia` — aunque
  sea un `categoriaOnline` con 5-8 valores curados (Hamburguesas, Pizzas, Buffet,
  Bebidas sin alcohol, Cervezas, Postres).
- Pantalla «Carta Online»: grilla con filtro por familia, toggle masivo de
  publicar/pausar (86ing), orden propio y subida de imagen. Hoy publicar es un
  toggle enterrado en el form de cada producto
  (`producto-informacion-general.component.html:107`); armar el menú son 148
  formularios. Está pendiente desde el día uno
  (`docs/arquitectura/webapp-pedidos-plan.md:248`).
- **Contenido:** no publicar 148. Un subconjunto curado a mano de 30-40 productos,
  los que definen la marca, **con foto**. De 218 productos de producción sólo 4
  tienen imagen. El resto del catálogo puede esperar con texto y precio prolijos,
  pero el subconjunto de lanzamiento sale con foto sí o sí.

Es trabajo de contenido de Gabriel, en paralelo al desarrollo, no «después».

---

## Fase 1 — PICKUP a producción

🔺 **Las dos auditorías recomiendan salir con PICKUP primero y DELIVERY después.**
PICKUP no depende del alta de `Delivery` ni de la decisión de costo de envío; deja
al cajero aprender el flujo con el caso simple; y el riesgo de un delivery mal
cobrado o sin repartidor es mayor que el de un pickup demorado.

### F1.1 Materializar en `Venta` — alcance real
`materializarPedidoOnlineEnVenta` (`ventas.handler.ts:147`) exige `mesaId`. Además
de generalizarlo:

- 🔺 **Cocina.** Decidir y aplicar: crear siempre una `Comanda` para la venta
  materializada (no ocupa mesa, sólo satisface el gate y habilita el ruteo por
  sector), o modificar las dos condiciones de arriba. La opción de la `Comanda` no
  exige migración. **Sin esto, F1.1 no cumple su objetivo.**
- 🔺 **Lock.** `withMesaLock(null)` haría que *todas* las materializaciones sin
  mesa compartan una clave y se serialicen entre sí: un mutex global accidental.
  Hace falta un `withPedidoLock(pedidoId)` análogo a `withComandaLock`
  (`ventas.handler.ts:116-129`), que ya existe con ese patrón exacto.
- 🔺 **Cobro.** No hay ningún camino de UI para cobrar una venta de mostrador
  persistida: `ultimas-ventas-dialog` sólo ofrece ver/reimprimir/cancelar, y
  `ventaRapidaActual` es estado del componente, no recuperable por otro cajero.
  Hay que agregar acción «Cobrar» en la bandeja que abra
  `CobrarVentaDialogComponent` contra `pedido.ventaId`.
- 🔺 **Un solo clic.** Que **Aceptar materialice en la misma acción** (estado +
  Venta + hooks, un handler transaccional). El botón «Enviar a cocina» queda sólo
  como recovery, como ya lo usa MESA_QR. Con el local lleno, dos clics más un
  diálogo por pedido no es operable.
- Conservar la idempotencia por `pedido.ventaId`.
- **Limpiar `vincular-venta-pedido-online`**: cableado hasta
  `repository.service.ts:526` y `preload.ts:2345`, nunca invocado, sin impl HTTP
  (`repository-http.service.ts:1097`). O se conecta o se borra.

### F1.2 Reversa al rechazar
Reusar `cancelarVentaCompletaEnTx` (`electron/utils/venta-reversa.utils.ts:81`),
que es idempotente y sólo revierte stock si estaba cobrada — buena pieza, sirve
tal cual.

🔺 **Corrección del diagnóstico v1.** El agujero descrito no es alcanzable por el
flujo principal: la materialización setea `EN_PREPARACION` en la misma transacción
que `ventaId` (`ventas.handler.ts:354-355`), y `rechazar-pedido-online` sólo admite
`RECIBIDO`/`ACEPTADO`. El problema real es el opuesto: **con el guard actual, el
caso común —cancelar algo que ya está en preparación— queda bloqueado**. Hay que
extender el guard a `EN_PREPARACION` y `LISTO`, con la reversa detrás.

### F1.3 Nadie se entera del pedido
`contar-pedidos-online-pendientes` existe en las 3 capas con el comentario «para
badge/sonido» y **nadie lo invoca**. `MenuNode` ya soporta `badgeKey`
(`menu-tree.ts:359`); el nodo `pedidos-online` (`:151`) no lo tiene.

🔺 **No hay infraestructura de sonido en la app** (`new Audio` no aparece en el
repo): es la única pieza nueva de esta tarea, no wiring.

🔺 **Sumar indicador de antigüedad** («hace 3 min» + color a partir de N minutos).
Con tres pedidos juntos, tres tarjetas idénticas hacen que el cajero atienda el
que ve primero, no el que llegó primero. Es una pipe y un `ngClass`.

### F1.4 El cliente no sabe nada de su pedido
🔺 **Subido desde Fase 2.** `mis-pedidos.page.ts:75` es carga única en `ngOnInit`:
sin polling, sin SSE y **sin siquiera un botón de actualizar**. El cliente tiene
que recargar el navegador. Combinado con la falta de notificación, el resultado
esperable es que llame por teléfono al local — el peor desenlace de haber
construido un canal digital.

Un `setInterval` de 10-15 s contra `pedido.estado`, igual que la bandeja, cubre la
mayor parte del problema y es mucho más barato que notificación push o WhatsApp.

### F1.5 Multi-caja
`ventas.handler.ts:172-179` tira `caja_ambigua_especificar_cajaId` con más de una
caja abierta. Afecta a MESA_QR hoy y afectaría a todo pedido apenas exista F1.1.

🔺 **Es co-requisito de rollout de F1.1**, no el séptimo ítem de una cola: en
cualquier local multi-caja, sin esto no se materializa nada.
🔺 **No hay selector de caja para reutilizar** — es un componente nuevo.
🔺 **Default silencioso a la caja abierta en este dispositivo**; mostrar selector
sólo si eso no desambigua. Nunca un diálogo bloqueante en el caso común.

### F1.6 Account takeover en `auth.perfil.update`
`pedidos-online-auth.handler.ts:245-247` cambia `passwordHash` sin pedir la
contraseña actual, sólo con el JWT (30 min de vida). Exigir `passwordActual`
cuando ya existe hash, o reautenticación por OTP.

### F1.7 Permisos propios
Todo el módulo usa `VENTAS_PDV`, incluida la config de la tienda y el borrado de
zonas. Alta de `PEDIDOS_ONLINE_VER` / `_GESTIONAR` / `_CONFIGURAR`.

🔺 **Especificar qué rol recibe cada permiso, no sólo el nombre.** Este patrón ya
rompió el sistema una vez: `VENTAS_PDV_CONFIGURAR` quedó sólo para GERENTE y a
CAJERO y MOZO la llamada les fallaba con FORBIDDEN, tragado en un `console.error`.
Si `PEDIDOS_ONLINE_GESTIONAR` va sólo a GERENTE, los cajeros pierden la bandeja en
silencio.

### F1.8 Test rojo
🔺 **Diagnosticar antes de tocar código.** `pedido.crear` usa `optionalAuth: true`
a propósito para que MESA_QR admita invitados (`public-routes.ts:113-117`), así que
una llamada sin token **nunca** puede dar 401 de transporte sin romper MESA_QR, que
ya está en producción. La corrección probable es la expectativa del test —
verificar el error de negocio para PICKUP/DELIVERY— no el código.

### F1.9 `TRUST_PROXY` en el host
Checklist de despliegue, no de código (`server.ts:90-99`). Condiciona la validación
LAN de MESA_QR.

---

## Fase 1.5 — DELIVERY (una o dos semanas después de validar PICKUP)

### F1.5.1 🔺 Unificar el modelo de zona — prerrequisito, no pulido

> Resuelto por la decisión 3 de F1.5.2: el polígono resuelve a una fila de precios
> compartida. Lo de abajo es el porqué.
El plan v1 lo tenía en Fase 3 como «decisión de producto». Es un **bloqueante duro
de F1.5.2**: `resolverCostoDelivery` (`delivery.handler.ts`) sólo sabe resolver el
costo desde un `PrecioDelivery.id` y **no acepta un monto arbitrario**, así que no
se puede mapear `pedido.costoEnvio → Venta.costoDelivery` sin resolverlo antes. Su
propio mensaje de error llama «Zona de delivery» a un `PrecioDelivery`, lo que
muestra la confusión.

Además, operativamente: si el storefront muestra «Zona Centro ₲10.000» y el PdV
tiene otra «Zona Centro» con otro precio, el cajero ve dos números para lo mismo.
Una fuente de datos, no dos ABMs paralelos mantenidos a mano.

### F1.5.2 Costo de envío — zonas dibujadas en un mapa
**Verificado con dato real:** `PO-000001`, con dirección y coordenadas, quedó en
`costoEnvio: 0`.

El comentario del propio handler declara el diseño inconcluso:
```ts
// pedidos-online-pedidos.handler.ts:364
// Delivery: el cliente indica DÓNDE entregar; el costo de envío lo define la
// tienda al aceptar (no hay selector de zonas).
```
Ese «al aceptar» no existe: ningún handler muta `costoEnvio`.

🔺 **Decisión revisada (2026-08-24).** El plan v2 proponía un selector de zonas en
el checkout. Se descarta: **la zona es un dato interno del negocio** y pedirle al
cliente que se autoclasifique es pedirle que adivine el mapa del local — si
adivina mal, o el local pierde plata o el cliente se lleva una sorpresa.

**Diseñador visual de zonas.** En la configuración, un mapa donde se dibujan las
zonas como polígonos y se les asigna costo y monto mínimo. El cliente elige su
ubicación en el mapa del checkout (algo que **ya hace**: el `lat`/`lng` ya viaja en
el pedido) y el **backend** resuelve en qué polígono cae y devuelve la tarifa.

Se conserva lo que el auditor defendía —pocas zonas, tarifa plana— y cambia sólo
quién clasifica. Beneficio no obvio: **elimina una clase entera de problema de
seguridad**. Si el cliente manda `zonaDeliveryId` hay que validar que no mande la
zona barata; con polígonos el cliente no manda zona, manda coordenadas, y el
servidor decide. Y «fuera de zona» pasa de ambiguo a determinístico.

**Implementación:**
- *Cálculo:* point-in-polygon por ray casting, ~25 líneas, sin dependencias.
- *Datos:* polígono como **GeoJSON en texto** sobre `zonas_delivery` (hoy sólo
  `nombre`, `tarifa`, `montoMinimo`, `activa`, `orden`). Texto y no un tipo
  geométrico porque no hay PostGIS y la regla del repo es driver-aware
  SQLite/Postgres. Migración aditiva.
- *Autoridad:* la resolución corre **server-side** en `crear-pedido-online`. El
  checkout puede previsualizar el costo, pero el backend recalcula.
- *Editor:* el grueso del trabajo. El storefront carga Leaflet **desde el CDN de
  unpkg** (`projects/storefront/src/index.html:12-15`) y el desktop **no tiene
  Leaflet**. Como el desktop es Electron empaquetado no puede ir por CDN: hay que
  sumar `leaflet` + un plugin de dibujo (geoman o Leaflet.draw) como dependencias
  reales del admin.

**Tres decisiones que esto fuerza (las tres acordadas):**
1. **El pin pasa a ser obligatorio para DELIVERY.** Hoy el checkout deja elegir
   entre marcar en el mapa o escribir la dirección (`checkout.page.ts:174`); sin
   coordenadas no hay polígono. El texto queda como complemento —referencia, piso,
   portón— que igual le sirve al repartidor.
2. **Desempate de polígonos superpuestos por `orden`** (gana el menor), y el editor
   avisa cuando dos se pisan.
3. **El polígono resuelve a una fila de precios compartida con el PdV**, en vez de
   tener tarifa propia. Un pedido telefónico lo carga el cajero escribiendo una
   dirección, sin pin, así que ahí no hay polígono: el canal online determina la
   zona por mapa, el cajero la elige de la lista, y **ambos cotizan el mismo
   número**. Más adelante se le puede poner el mismo mapa al diálogo de delivery
   del PdV. Esto reemplaza a F1.5.1 como forma concreta de unificar los modelos.

**Fuera de cobertura:** si el punto no cae en ningún polígono, mensaje explícito y
derivación a PICKUP o al WhatsApp del local. Nunca envío gratis silencioso.

🔺 **Agregar el `case` en `mensajeError`** (`checkout.page.ts:206-223`) en el mismo
commit: su `default` devuelve el código crudo, así que cada error nuevo sale sin
traducir salvo que alguien se acuerde de ese switch.

🔺 **F1.5.2 va antes o junto con F1.5.3**, nunca después: si el alta de `Delivery`
sale primero, todo delivery online se despacha cobrando ₲0 de envío.

### F1.5.3 Crear el `Delivery` real
`PedidoOnline.deliveryId` no se escribe nunca; los dos módulos se ignoran.

🔺 **No es «invocar `delivery-crear`»**: ese handler abre su propia transacción
(`delivery.handler.ts:230`), exige `cajaId`, y valida teléfono mínimo y dirección
con reglas pensadas para el alta manual del cajero — datos que del cliente online
pueden no cumplirse. Hay que **extraer un `crearDeliveryEnTx(manager, ...)`**,
mismo patrón que `cancelarVentaCompletaEnTx`.

🔺 **Repartidor: no al aceptar, sino al pasar a EN_CAMINO.** El módulo del PdV ya
resolvió esto — sólo esa transición lo exige. Aceptar debe seguir siendo un clic;
el repartidor se elige minutos después, con más calma, reusando
`seleccionar-repartidor-dialog`.

🔺 **Sincronizar las dos máquinas de estado.** `avanzar-estado-pedido-online`
(`pedidos-online-admin.handler.ts:179`) permite marcar ENTREGADO sin relación con
`Delivery.estado` ni con `Venta.estado`, mientras el módulo Delivery exige venta
CONCLUIDA para entregar. Sin esto se reintroduce por la puerta de atrás un bug que
ese módulo ya cerró. Opción: delegar en `delivery-cambiar-estado` cuando
`pedido.deliveryId` existe.

---

## Fase 2 — Operable

- **F2.1 El carrito nunca se revalida.** Reproducido: con el catálogo viejo agregué
  «COCA 500 ML ₲9.000»; tras importar el real el carrito seguía mostrando ese
  nombre y ese precio, que ya no existen. El backend recalcula, así que no se cobra
  de menos, pero el cliente ve un precio que la tienda no honra y si el producto
  desapareció recibe `producto_no_disponible:NOMBRE` crudo, sin que el ítem se
  quite solo.
- **F2.2 El cliente no puede cancelar.** `CANCELADO`: 0 usos. Se puede salir sin
  esto la primera quincena con el teléfono del local como respaldo — no toca dinero
  ni stock si el pedido no se materializó — pero no es aceptable como estado final.
- **F2.3 `CuentaCliente` nunca se vincula al `Cliente` interno.** La FK se lee
  (`auth.handler.ts:50,66,201`) y nunca se escribe. Sin crédito, sin CPC, sin
  dashboard de cliente. 🔺 Corrección del v1: **no hay campo de RUC en el
  storefront**, así que no es que el RUC «no llegue» — nunca se pide. Diseñar esa
  UI es parte del trabajo, no sólo conectar un campo.
- **F2.4 Bandeja inoperable en modo cliente y ausente en mobile.** 6 métodos sin
  implementar (`repository-http.service.ts:1087-1112`). Bloquea locales con tablets
  o varias cajas.

---

## Fase 3 — Pulido y deuda

**Storefront** (verificado en pantalla con datos reales):
- El título de la pizza queda tapado por la flecha: se lee «←ZA MARGUERITA».
- **Se preselecciona siempre la opción más cara**: la carta anuncia «desde ₲50.000»
  y al entrar viene marcado GRANDE ₲80.000. Debería ser la presentación `principal`
  o la más barata.
- `/producto/151` (producto con variaciones) renderiza sin sabores ni tamaños,
  total 0 y botón deshabilitado. No se llega desde la carta, pero es URL
  compartible.
- La barra fija de «Ver carrito» tapa el último ítem: falta padding inferior.
- Accesibilidad: cero `alt`, dos `aria-label`; las fotos son `background-image` de
  un `div`, invisibles para lectores de pantalla por diseño.
- 🔺 **Nominatim público sin identificar** (`checkout.page.ts:103`): geocodificación
  inversa en cada movimiento del mapa, sin `User-Agent`, contra un servicio con
  política de 1 req/s que bloquea por IP. No rompe el pedido (siguen yendo lat/lng)
  pero puede dejar la dirección en blanco bajo carga.

**Bandeja:**
- Motivo de rechazo hardcodeado a `'RECHAZADO POR EL LOCAL'`
  (`list-pedidos-online.component.ts:151`), pese a que `ConfirmationDialogComponent`
  ganó `showInput` el 2026-08-24 para exactamente esto.
- Confirmación inline en vez de `ConfirmationDialogComponent` (regla 8).
- Funciones en template (regla 4): `list-pedidos-online.component.html:27,78`.

**Zonas:** `eliminar-zona-delivery` borra sin confirmar y sin guard de
dependencias, a diferencia de su par del PdV. Debería ser baja lógica.

**Datos:** sin índice en `pedidos_online.cuenta_cliente_id` (lo usa `pedido.mis` en
cada llamada) ni en `mesa_id`/`venta_id`/`created_at`; sin único en
`cuentas_cliente.email` (carrera de duplicados en registro y en Google);
`presentacion.activo` no se filtra ni en el menú ni al crear el pedido.

**Otros:**
- 🔺 `email_verified === 'false'` (`auth.handler.ts:293`) **falla abierto**:
  `undefined`, boolean `false` o campo ausente pasan como verificados. Debe ser
  `String(...) !== 'true'`.
- OTP sin tope diario ni límite por IP: abusable para spamear WhatsApps a un
  tercero a nombre del negocio.
- 🔺 Idempotencia: el botón ya se deshabilita mientras envía, así que el doble tap
  está mitigado. La exposición real es **multi-pestaña o reintento de red** — hace
  falta idempotency key server-side.
- Moneda mixta en un mismo pedido se suma sin convertir.
- 🔺 El retry de numeración (`:436-445`) reintenta ante **cualquier** error de
  `save()`, no sólo colisión de unicidad: 6 intentos inútiles si el fallo es otro.

---

## 🔺 Lo que sale del alcance

Ambas auditorías coinciden en que no mueven la aguja para este negocio:

- **`BANCARD` / `UPAY` / `PAGOPAR` y `CanalPedidoOnline.WHATSAPP`** — sacar del
  enum ahora. El pago es efectivo contra entrega/retiro y está bien así: es una
  decisión cerrada, no un hueco. Dejarlos declarados invita a que alguien crea que
  hay que completarlos.
- **RUC / facturación desde el storefront** — con pago en efectivo y este perfil de
  cliente, la demanda es marginal; se resuelve en caja como cualquier venta física.
- **Cotización por distancia recorrida** — para una ciudad de este tamaño, tarifa
  plana por zona alcanza. (Los **polígonos** salen de esta lista: el auditor los
  daba por sobre-ingeniería, pero con el mapa ya presente en el checkout y el
  cálculo siendo trivial, no lo son — ver F1.5.2.)
- **UI de horarios (`horariosJson`)** — el switch maestro alcanza para lanzar.

---

## Lo que ya está bien (auditado con dureza, sin falsos negativos)

Whitelist `/pub/*` y 403 para lo no registrado; dos JWT separados y **sin IDOR
confirmado** (`pedidos-online-pedidos.handler.ts:474-496` filtra por el
`customerId` del JWT, nunca por parámetro); OTP con hash, TTL y tope de intentos;
refresh con rotación y revocación; recalculo server-side de precios; **cotización
de pizza verificada en pantalla** (mitad y mitad con `MAYOR_PRECIO` dio exactamente
`max(80.000, 85.000)`); numeración con índice único real
(`1783520460212-AddPedidosOnline.ts:73`) + retry; migraciones portables, aditivas e
idempotentes con epoch-ms reales; zona horaria y cruce de medianoche;
`cancelarVentaCompletaEnTx` reusable tal cual; facturación legal sin cambios;
config de variaciones por producto ya adoptada. Este dominio no sufre el gotcha de
`NUMERIC`-como-string.

**El riesgo del plan no está en lo que da por bueno, sino en asumir que alcanza con
«reutilizar»** piezas diseñadas con una precondición que PICKUP/DELIVERY rompe:
los hooks de cocina (`mesa || comanda`), el alta de delivery (transacción propia) y
el candado (`mesaId` no nulo).

---

## Riesgo del día uno

Peor escenario plausible: viernes con el local lleno, entran dos pedidos DELIVERY
casi juntos, el cajero no ve el aviso a tiempo, el cliente espera 25 minutos sin
saber si lo vieron, y cuando se acepta no hay repartidor y el plato se enfrió.

F1.3 y F1.4 cubren la mayor parte. Lo que **no** se cubre con software es el aviso
visto tarde por sobrecarga humana: conviene que el sonido sea deliberadamente
distinto del resto y que el encargado —no sólo el cajero— tenga visibilidad de la
bandeja la primera semana. Va al checklist de go-live.

«Pedido cocinado dos veces» está estructuralmente cubierto mientras la
materialización siga siendo idempotente por `pedido.ventaId`.

---

## Mínimo para salir sin quemar la marca

Menú curado con fotos (30-40 productos) + aviso sonoro + aceptar-y-materializar en
un clic + cocina recibiendo de verdad + reversa al cancelar + permisos propios +
seguimiento del pedido para el cliente + **sólo PICKUP**. Todo lo demás se sostiene
con proceso humano durante la primera quincena sin arriesgar dinero, stock ni
cocina duplicada.

---

## Entorno de trabajo (ya montado)

Dev local en **Postgres** (`frc_gourmet_dev`), mismo motor que producción; config
previa en `app-settings.json.sqlite-backup-20260824`. Catálogo real importado por
`/api/rpc` en solo lectura. Storefront en dev con hot reload (4202) contra Fastify
local (7071). Dos pedidos reales en la bandeja: `PO-000001` (DELIVERY ₲105.000, con
pizza mitad y mitad) y `PO-000002` (PICKUP ₲10.000).

## Tests exigidos

1. Materialización PICKUP → `Venta` **y `ComandaItem` generado** (el gate de cocina).
2. Reversa: cancelar desde `EN_PREPARACION` revierte venta y stock.
3. `withPedidoLock`: dos materializaciones simultáneas del mismo pedido → una venta.
4. Cobro de una venta materializada desde la bandeja.
5. Alta de `Delivery` desde un pedido online (Fase 1.5).
6. Point-in-polygon: un punto dentro devuelve la tarifa de esa zona; un punto
   fuera de todo polígono se rechaza; superposición gana el menor `orden`
   (Fase 1.5).
7. `auth.perfil.update` sin password actual → rechazado.
8. Test rojo actual: corregir la expectativa a error de negocio, no 401.
9. Concurrencia de `numero`: dos `pedido.crear` simultáneos.
10. Smoke E2E de navegador del storefront. Hoy no hay ningún test de UI para
    `projects/storefront`.
