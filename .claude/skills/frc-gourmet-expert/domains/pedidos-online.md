# Pedidos Online / Storefront (webapp pública de clientes)

> Subsistema tipo iFood: **PWA pública** para que clientes finales hagan pedidos, con superficie HTTP **aislada** (`/pub/*`), **auth de cliente propia** (separada del staff) y **bandeja de aceptación** en el PdV. Solo corre en **modo `server`** (Fastify + `/tienda`). Introducido 2026-07-08+.

## Proyecto storefront (tercer proyecto Angular)

Hermano de `mobile` en el monorepo: `angular.json` → `projects: ['frc-gourmet', 'mobile', 'storefront']`, root `projects/storefront`, salida `dist/storefront`.
- Build: `npm run build:storefront` = `ng build storefront --base-href /tienda/` (⚠️ **base-href obligatorio** o los assets rompen). Incluido en `build:prod`.
- Standalone + rutas lazy (`projects/storefront/src/app/app.routes.ts`): `''` (MenuPage), `producto/:id`, `pizza/:productoId/:saborId`, `carrito`, `checkout`, `login`, `mis-pedidos`, `cuenta`.
- Core (`projects/storefront/src/app/core/`): `public-api.service.ts` (cliente de `/pub/rpc`, `POST {base}/pub/rpc {op, params}` con Bearer, refresh en 401 y reintento único, refresh en `localStorage 'frc_sf_refresh'`), `auth.service.ts`, `cart.service.ts`, `menu.service.ts`, `config.service.ts`.

## Aislamiento de superficie (regla dura)

**El cliente final NUNCA toca `/api/rpc`** (que puede invocar ~800 handlers con JWT de staff). Toda operación pública pasa por `POST /pub/rpc {op, params}` acotado por una **whitelist explícita** (`PUBLIC_OPERATIONS` en `electron/server/public-routes.ts`); un `op` no whitelisteado → **403**. Rate limit propio 120/min. Cada op se registra con `registerPublicOperation('menu.get', {channel, requiresAuth})`.

Hoy son **15 ops**: `menu.get`, `tienda.config`, `zonas.get`, `mesa.get`, `pedido.crear`/`pedido.mis`/`pedido.estado` y las 9 de `auth.*`. Se registran desde los propios handlers (`pedidos-online.handler.ts:271`, `pedidos-online-config.handler.ts:126`, `pedidos-online-pedidos.handler.ts:518-524`, `pedidos-online-auth.handler.ts:319-327`).

También: `/pub/health`, `/pub/producto-image/*` (fotos de menú estáticas, `server.ts:165`), y `/tienda/` (SPA `dist/storefront` con fallback, registrada **antes** del static de mobile en `/`).

> Para agregar una feature pública: `registerPublicOperation` + un handler que lea **`event._customerId`** (nunca un userId de staff). Jamás exponer un channel suelto.

### Dos JWT completamente separados

- **Staff:** `@fastify/jwt` + secret de `jwt-secret.utils`, autoriza `/api/rpc`.
- **Cliente:** `electron/utils/customer-jwt.utils.ts` — `jsonwebtoken` con **secret propio** (keytar `customer-jwt-secret`, fallback file `customer-jwt-secret.local`), `aud:'customer'`, access TTL 30m, payload `{ sub: cuentaClienteId, tel, clienteId }`. Un token de cliente no sirve para `/api/rpc` y viceversa.

Propagación: `public-routes.ts` arma `ctx = {userId:null, deviceId:null, customerId}` → `invokeHandlerWithContext` → `handler-registry.ts` inyecta `fakeEvent._customerId`.

## Modelo de datos (`src/app/database/entities/pedidos-online/`)

**Enums** (`pedido-online.enums.ts`): `TipoPedidoOnline {PICKUP, DELIVERY, MESA_QR}`, `EstadoPedidoOnline {RECIBIDO→ACEPTADO→EN_PREPARACION→LISTO→EN_CAMINO→ENTREGADO; RECHAZADO, CANCELADO}`, `CanalPedidoOnline {WEB, QR_MESA, WHATSAPP}`, `MetodoPagoOnline {EFECTIVO, BANCARD, UPAY, PAGOPAR}`.

Todas con `createForeignKeyConstraints: false` (desacoplan borrado):

| Entity | Tabla | Rol |
|---|---|---|
| `PedidoOnline` | `pedidos_online` | "Envelope" inbound **antes** de convertirse en `Venta`. `numero` único (`PO-000001`), `estado` (def RECIBIDO, indexado), snapshots de cliente, `tipoPedido`, `metodoPago`, `fechaProgramada` (null=ASAP), montos, `latitud`/`longitud` (Fase D), `direccionEntrega`, vínculos sueltos `ventaId`/`deliveryId`/`mesaId`, `motivoRechazo`, `zonaDelivery`, `referenciaDireccion`, `notas`, `moneda`, timestamps de estado |
| `PedidoOnlineItem` | `pedido_online_items` | `productoId`/`presentacionId?`, snapshots de nombre, `precioUnitario`/`subtotal` **congelados**, `personalizacion` como **texto JSON** `{opcion, sabores, adicionales, observaciones, notaLibre}` |
| `CuentaCliente` | `cuentas_cliente` | Cuenta de cliente final **separada de `Usuario`**. `telefono` (único, nullable), `email`, `passwordHash?` (bcrypt), `cliente` FK opcional al `Cliente` interno |
| `ZonaDelivery` | `zonas_delivery` | `nombre`, `poligono` (GeoJSON en texto; el servidor resuelve el pin del cliente), `precioDelivery` (**tarifa del PdV, una por zona**: el envío y la atribución del delivery por teléfono), `tarifa` (fallback sin tarifa), `montoMinimo`, `orden` (gana la menor si se superponen), `activa` |
| `TiendaOnlineConfig` | `tienda_online_config` | Fila única. `activa` (master switch), branding, `permitePickup/Delivery`, `prepTimeMinutos`, `montoMinimoPedido`, `aceptacionAutomatica`, `horariosJson` |
| `CustomerRefreshToken` | `customer_refresh_tokens` | Refresh de cliente (`tokenHash` sha256, revocación) |
| `CodigoOtp` | `codigos_otp` | OTP de login (`codigoHash` bcrypt, TTL, intentos) |

**Flags en `Producto`:** `disponibleOnline` (se publica en la carta) y `pausadoOnline` ("86ing" — pausa temporal sin despublicar). Se **revalidan al crear el pedido**, no solo al publicar el menú.

**Migrations:** `1783520460210-AddOnlineFieldsToProducto`, `…211-AddCuentasClienteYOtp`, `…212-AddPedidosOnline`, `1783525141550-AddTiendaConfigYCustomerRefresh`, `1783740826975-CuentaClienteTelefonoNullable`, `1783741165054-AddUbicacionPedidoOnline`, `1785082533104-AddMesaQrAutoservicio`.

> Una versión previa de este doc advertía que estos timestamps eran «rounded, contra la convención». **Es falso** — son epoch-ms reales; las tres primeras comparten el mismo milisegundo con sufijo secuencial `210/211/212` para forzar el orden. Sirven de ejemplo válido.

## Auth de cliente (`electron/handlers/pedidos-online-auth.handler.ts`)

Todas las ops vía `/pub/rpc`:
- **OTP WhatsApp:** `auth.otp.request` (OTP 6 dígitos, hash bcrypt, TTL 5min, anti-spam 3/min) + `auth.otp.verify` (máx 5 intentos, get-or-create de cuenta). **Modo dev:** si faltan credenciales de WhatsApp Cloud, `whatsapp-sender.ts` usa `provider='dev-log'` y el handler **devuelve `devCodigo` en la respuesta** para probar sin WhatsApp (con credenciales reales nunca se echoa).
- **Email/password:** `auth.registrar`, `auth.login` (identificador = teléfono o email).
- **Google:** `auth.google` verifica el ID token contra `oauth2.googleapis.com/tokeninfo` (chequea `aud === GOOGLE_CLIENT_ID` env + `email_verified`).
- **Sesión:** `emitirSesion` firma access + emite refresh; `auth.refresh` rota, `auth.logout` revoca; `auth.me`/`auth.perfil.update` requieren JWT.

> OTP de pedidos online usa **WhatsApp Cloud API (Meta)** (`whatsapp-sender.ts`, config por env `WHATSAPP_CLOUD_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`). Es **distinto** del WhatsApp de notificaciones/resumen de caja, que usa Evolution API. → [domains/financiero-caja-mayor.md] y notificaciones.

## Flujo de pedido y bandeja PdV

**Creación** (`pedidos-online-pedidos.handler.ts:236`, `crear-pedido-online`, **`optionalAuth`**: PICKUP/DELIVERY exigen cuenta autenticada — se valida dentro del handler —, MESA_QR admite invitado con solo el nombre):
- Recalcula **todo server-side** desde el catálogo (no confía en precios del cliente): `resolveOpcion` por tipo de producto, `resolveAdicionales` valida contra `RecetaAdicionalVinculacion`.
- Valida por ítem `disponibleOnline && !pausadoOnline && activo && esVendible`; tienda abierta (`estaAbierta`); tipo habilitado; mínimo global; DELIVERY exige coords o dirección.
- **Congela precios** en los items + snapshot `personalizacion` JSON. Número `PO-000001` (con reintento por colisión).
- Entra **RECIBIDO**, o **ACEPTADO** directo si `cfg.aceptacionAutomatica`. Lecturas del cliente: `pedido.mis`, `pedido.estado`.

**Bandeja PdV** (`pedidos-online-admin.handler.ts`, vía `/api/rpc`, permiso `VENTAS_PDV`):
- `get-pedidos-online-admin`, `contar-pedidos-online-pendientes` (RECIBIDO+ACEPTADO, para badge/sonido).
- `aceptar-pedido-online` (solo desde RECIBIDO; opcionalmente recibe `{ventaId}`), `rechazar-pedido-online` (desde RECIBIDO **o** ACEPTADO, con motivo en UPPERCASE), `avanzar-estado-pedido-online` (máquina `TRANSICIONES`: ACEPTADO→EN_PREPARACION→LISTO→{EN_CAMINO,ENTREGADO}→ENTREGADO), `vincular-venta-pedido-online`. CRUD de zonas. Todos con `ensurePermission('VENTAS_PDV')`.
- **Materialización a `Venta`:** existe el puente `materializarPedidoOnlineEnVenta` (`ventas.handler.ts:147`, ver sección MESA_QR) — pero **exige `mesaId`**: lanza `'El pedido no es de mesa (sin mesaId)'` para PICKUP/DELIVERY. Para esos dos tipos **no hay ningún camino de materialización**: el cajero retipea la venta a mano. `vincular-venta-pedido-online` existe y está cableado hasta `repository.service.ts:526`, pero ningún componente lo llama. Ver «Huecos conocidos» abajo.
- Componente `src/app/pages/ventas/pedidos-online/list-pedidos-online.component.ts` — **auto-refresh por polling cada 15 s** (no hay SSE para la bandeja, a diferencia del KDS).

## Pizza online (sabor × tamaño + mitad y mitad) — Fases E1/E2

- Producto **`ELABORADO_CON_VARIACION`**. Precio de cada celda (sabor × tamaño) vive en **`RecetaPresentacion`** (join `Sabor` × `Presentacion`), NO en la receta.
- `getPizzaConfig(dataSource, producto?)` (`pedidos-online-config.handler.ts:56`) delega en `getVariacionConfig` y **respeta el override por producto** (`Producto.maxVariacionesSimultaneas` / `estrategiaPrecioVariacion`, cambio del 2026-08-18); **`PdvConfig`** (`pizzaMaxSabores` def 2, `pizzaEstrategiaPrecio` `MAYOR_PRECIO` def | `PROMEDIO`) es el fallback global. Ambos callers pasan el producto.
- **Menú** agrupa POR SABOR (UI iFood): cada sabor con `precios[]` por tamaño + `precioDesde`. Rutas `pizza/:productoId/:saborId`.
- **Cotización** (`crear-pedido-online`): item `{opcion:{tipo:'PIZZA', presentacionId, saborIds:[...]}}`. Busca `RecetaPresentacion` de cada (sabor × tamaño), valida existencia+precio y `≤ maxSabores`. Mitad y mitad: `Math.max` (MAYOR_PRECIO) o promedio, redondeado. Guarda desglose `sabores[]` (`proporcion=1/n`, `recetaPresentacionId`) en el snapshot. Mantiene compat con shape viejo `{recetaId}`.

## Gotchas

- Nunca exponer un pedido online por `/api/rpc`; siempre por la whitelist de `/pub/*`.
- Dos secrets/JWT independientes (staff vs cliente); el de cliente en keytar `customer-jwt-secret`.
- Precios siempre server-side y congelados; flags de producto revalidados al crear el pedido.
- `aceptacionAutomatica` cambia el estado inicial (RECIBIDO vs ACEPTADO); el contador de pendientes incluye ambos.
- Bandeja por **polling 15 s** (no realtime).
- Solo corre en **modo `server`**; en standalone/client no hay storefront.
- Migrations del dominio usan timestamps rounded consecutivos (contra la convención) — no imitar.

## Estado tras el trabajo de 2026-08-24

PICKUP y DELIVERY **ya llegan a la operación**. Lo que cambió:

| Antes | Ahora |
|---|---|
| `materializarPedidoOnlineEnVenta` exigía `mesaId` | Bifurca por canal. Con mesa reusa la cuenta; sin mesa abre una venta propia por pedido |
| Una venta sin mesa ni comanda no generaba `ComandaItem` | `ventas.canal_origen` (`LOCAL`/`WEB`/`QR_MESA`) hace explícito el «va a cocina». El gate ahora es mesa, comanda, **delivery** o web |
| Aceptar sólo cambiaba el estado | Aceptar **materializa en la misma acción** y manda a cocina |
| `PedidoOnline.deliveryId` nunca se escribía | Un DELIVERY abre su `Delivery` en la misma transacción (`crearDeliveryEnTx`) y arrastra `costoEnvio` a `venta.costoDelivery` |
| Rechazar dejaba la venta viva | Corre `cancelarVentaCompletaEnTx` en la misma transacción, y admite cancelar desde `EN_PREPARACION`/`LISTO` |
| El envío quedaba siempre en 0 | Zonas dibujadas como **polígonos**; el servidor resuelve por el pin del cliente (`geo.utils.ts`) |
| Todo con `VENTAS_PDV` | `PEDIDOS_ONLINE_VER` / `_GESTIONAR` (CAJERO+GERENTE) / `_CONFIGURAR` (GERENTE) |
| Nadie llamaba a `contar-pedidos-online-pendientes` | Dos badges en el botón DELIVERY del PdV + beep WebAudio cuando sube el conteo |
| La bandeja era una pantalla aparte | La cola vive en el **panel derecho del diálogo de delivery** |
| Los retiros iban en una sección aparte | Entran en la **lista principal** como fila, con chip `RETIRAR` en la columna DELIVERY |
| No se distinguía un pedido web de uno cargado por el cajero | Chip de canal `WEB`/`LOCAL` en la columna ESTADO |
| El panel de la cola se partía el lado derecho con el empty-state | Excluyentes, y los dos ocupan exactamente el mismo lugar |
| Con la tienda apagada seguían apareciendo el botón y el panel | Todo lo web se oculta cuando `TiendaOnlineConfig.activa = false` |
| `mis-pedidos` era carga única | Poll de 12 s que se autodetiene |

### Reglas que hay que respetar al tocar esto

- **La cuenta de una mesa es compartida.** Varios comensales de la misma mesa
  materializan en UNA `Venta`. Por eso `rechazar-pedido-online` **se niega** a
  revertir un pedido MESA_QR ya materializado (`error: 'mesa_ya_materializada'`):
  cancelar esa venta borraría los platos de los demás. No se sabe qué `VentaItem`
  vino de qué pedido — no se persiste el vínculo.
- **Revertir un cobro pide permiso aparte.** Si la venta está `CONCLUIDA`,
  rechazar exige `VENTAS_DELIVERY_CANCELAR_COBRADO`, igual que `delivery-cancelar`.
  Ese permiso **no lo tiene ningún rol plantilla** a propósito.
- **Un PICKUP no genera `Delivery`**, así que su venta no sale en la tabla del
  diálogo. Vive en la cola del panel derecho (`get-retiros-online-en-curso`),
  que es el único lugar donde se puede cobrar.
- **El panel derecho es la BANDEJA: sólo pedidos esperando confirmación**
  (`colaWeb`, estado `RECIBIDO`). Es una lista de decisiones pendientes, no de
  trabajo en curso: en cuanto se acepta uno, sale del panel y pasa a la lista
  de la izquierda, junto a los deliveries que carga el cajero.
- **Un retiro aceptado es una fila sintética de la lista** (`mapRetiroRow`),
  con `delivery: null` y `pedido` cargado. La columna DELIVERY muestra el chip
  `RETIRAR` en vez de un costo de envío que no existe, y la columna ESTADO
  lleva el chip de canal `WEB`/`LOCAL`. Seleccionarla abre un detalle propio
  con `COBRAR`/`ENTREGADO`, porque el footer de acciones opera sobre un
  `Delivery` que acá no hay.
- **Los retiros en curso se traen SIEMPRE, con la tienda encendida o apagada.**
  Apagarla no hace desaparecer los pedidos ya aceptados, y como su venta no
  sale en ninguna otra pantalla, dejar de traerlos los volvería invisibles y
  sin forma de cobrarlos. Lo que sí se apaga es la bandeja de pendientes.
- **La bandeja, el detalle y el empty-state «seleccione un delivery» son
  excluyentes** (`panelOcupado`). Cuando se renderizaban los dos, se repartían el lado derecho
  entre sí y la cola quedaba a media pantalla en vez de donde cae el detalle.
  Los tres paneles usan `flex-basis: 0`: con `auto`, el reparto 70/30 depende
  del ancho intrínseco del contenido y las tarjetas con botones lo empujaban.
- **Con `TiendaOnlineConfig.activa = false` se oculta todo lo que habla de
  pedidos web**: el botón del subheader, el panel y el poll de 15 s en el
  diálogo, y el badge rojo del botón DELIVERY del PdV. No hay pedidos posibles,
  así que un sector vacío sólo confunde.
- **El pin es obligatorio para DELIVERY**: sin coordenadas no hay polígono que
  resolver. La dirección escrita quedó como complemento para el repartidor.
- **GeoJSON va en `[lng, lat]`.** Invertirlo es el error clásico; hay un test que
  lo cubre.

### La caja a la que entra un pedido web

`materializarPedidoOnlineEnVenta` acepta un `cajaId` opcional; si no viene, usa **la
única caja abierta**. Con **ninguna** abierta falla con `no_hay_caja_abierta`, y con
**más de una** con `caja_ambigua_especificar_cajaId` — o sea que aceptar un pedido web
en un local con dos cajas abiertas exige decir cuál. No hay caja virtual "ONLINE": la
venta web entra a la misma caja que la del mostrador, y por eso aparece en su arqueo.

### Para qué existe este módulo (posicionamiento, 2026-07)

El storefront no compite con PedidosYa: lo **desplaza**. Lo que lo justifica frente a
un marketplace es **0% de comisión y 0 fee por pedido** (el POS ya es nuestro),
guaraníes sin decimales con USD/BRL nativos, **delivery propio de primera clase** sin
depender de una flota ajena, sin lock-in de hardware, **pago local y efectivo contra
entrega**, y **WhatsApp** como canal — dominante en Paraguay y ausente en las
plataformas pensadas para EE.UU. Varias decisiones que parecen huecos (no hay
pasarela, el pago es efectivo, no se pide RUC) son esa postura, no deuda.

Lo que sí se copió de los maduros: menú de fuente única con snapshot publicable, 86ing
en tiempo real, QR de mesa como PWA, zonas de delivery, tracking por estado y cuenta de
cliente con historial.

### Hosting: hoy túnel, mañana edge cloud

El `mode=server` es una PC en LAN sin TLS, y una web pública necesita ambas cosas. La
estrategia decidida en 2026-07 tiene dos etapas y **hoy corre la primera**:

1. **Túnel seguro (actual).** Cloudflare Tunnel expone el nodo `server`: TLS, dominio y
   protección DDoS **sin abrir puertos ni IP pública**. Reutiliza toda la infra
   existente. La contra es real: **la PC tiene que estar prendida y online**, porque
   cada navegación de la carta la golpea.
2. **Edge cloud (post-MVP, no construido).** Separar lecturas de escrituras, que es el
   patrón de Deliverect/Toast: la PC **publica un snapshot del menú** al cloud y el
   cloud sirve la carta sin tocarla (≈95% del tráfico); los pedidos y los webhooks de
   pago entran a una **cola durable** en el cloud, y **la PC se conecta hacia afuera**
   (nunca se expone). La fuente de verdad sigue siendo la PC.

⚠️ **Por eso el diseño es "edge-ready" desde ahora, y hay que mantenerlo así:** los
endpoints `/pub/*` son **idempotentes**, el precio y el stock se **congelan en el
pedido** (snapshot en `PedidoOnlineItem`, para que no haya disputa si el precio cambia
mientras el cliente arma el carrito), y el menú se modela como snapshot publicable
aunque hoy se sirva directo. Romper cualquiera de las tres convierte la migración en
un rediseño.

### Concurrencia: dónde están las costuras

`aceptar-pedido-online` escribe `estado = ACEPTADO` **sin lock** y recién
después llama a `materializarPedidoOnlineEnVenta`. Entre las dos escrituras hay
una ventana en la que el pedido está ACEPTADO y todavía sin `ventaId`, y un
`rechazar-pedido-online` de otro operador entra ahí: pasa el chequeo de estados
cancelables, no encuentra venta que revertir, y comitea `RECHAZADO`. Hasta que
se cerró (2026-08-25), el `save` final de la materialización pisaba ese rechazo
y el pedido resucitaba en `EN_PREPARACION` con venta viva y comanda impresa.

La materialización **relee el estado dentro de su transacción** justo antes de
escribir, y hace rollback si el pedido quedó `RECHAZADO`/`CANCELADO` o si otro
camino ya lo materializó. Si tocás ese camino, mantené la relectura: el objeto
`pedido` en memoria se cargó al abrir la transacción y no refleja lo que pasó
mientras tanto.

`avanzar-estado-pedido-online` tiene la otra costura: delega la transición al
módulo de delivery, que abre y comitea **su propia** transacción, y recién
después guarda el `PedidoOnline`. No son atómicas y no se pueden unificar sin
reescribir el módulo de delivery, así que la operación se hizo **reintentable**:
si el delivery ya está en el estado destino no se le vuelve a pedir la
transición (la rechazaría por inválida) y el handler sigue para poner el pedido
al día. El operador destraba un desfasaje repitiendo la acción.

### Dashboard de Zonas de Delivery (F7, 2026-11)

La pantalla de zonas dejó de ser una tabla: KPIs del período (hoy / 7 días / este mes, con
**Aplicar** y jornada comercial), alertas, mapa con todas las zonas y los pedidos web como puntos,
y tabla por zona con **los dos tipos de delivery**. Handler `get-dashboard-zonas-delivery`.

**A qué zona va cada envío** (`asignarEnviosAZonas`, `electron/utils/zonas-dashboard.utils.ts`):
- Web con zona → la del pedido (la que resolvió el pin), aunque la tarifa del delivery sea de otra.
  Zona que ya no existe (la FK no tiene constraint) → «Zona eliminada».
- Teléfono, o web sin zona (un retiro web convertido a delivery en el PdV) → la zona que tiene esa
  **tarifa del PdV**. Sin zona con esa tarifa → «Tarifa X · sin zona»; con varias (dato previo a la
  regla) → «Tarifa X · varias zonas», sin adivinar ni repartir. Sin tarifa → «Sin zona».
- Invariante testeada: cada envío cae en una sola fila, Σ filas = KPIs, y los KPIs = `kpisDelivery`
  de Reportes con el mismo filtro (ventas CONCLUIDAS, sin retiros, `SOLO_ENVIOS`).

**Decisiones del propietario (05/11):**
1. **La tarifa del PdV es EL precio de envío de la zona, obligatoria y una por zona.**
   `guardar-zona-delivery`: `tarifa_requerida` al crear o al sacársela, `tarifa_invalida` si no
   existe, `tarifa_en_uso` si ya la tiene otra zona. Sólo se controla cuando la tarifa **cambia**:
   dos zonas viejas que la compartían, o una vieja sin tarifa, se siguen pudiendo editar. La columna
   `tarifa` de la zona queda como respaldo de datos viejos (no se pide ni se muestra; aditivo, no
   se borra); `zonas.get` publica el precio que se cobra, no el crudo.
   Un guardado parcial conserva los campos que no vienen (antes reactivaba la zona y ponía orden y
   mínimo en 0).
2. **Lectura con `VENTAS_PDV`** (el permiso del menú); crear, editar, dibujar y eliminar siguen con
   `PEDIDOS_ONLINE_CONFIGURAR`, y la pantalla oculta esas acciones (`puedeConfigurar`).
3. **Puntos = pedidos web cobrados** (el mismo conjunto que la tabla), coordenadas redondeadas a 3
   decimales (~110 m), sin datos del cliente, tope 1000 con aviso. La zona del punto es la misma
   que cuenta la tabla.
4. **Colores**: variables del tema `--zona-1…8` (puntos de la tabla, claro y oscuro) y
   `--zona-mapa-*` (sobre los mosaicos, que son claros en los dos temas). Paleta categórica
   validada con la guía `dataviz`; contraste < 3:1 en algunos pasos, por eso la zona siempre lleva
   su nombre visible. Con más de 8 zonas el color se repite.

**Gotchas del motor (`reportes-delivery.helper.ts`):**
- `agrupar` deduplica sólo la cantidad de tickets (`COUNT(DISTINCT v.id)`); la plata y el envío
  suman filas. Por eso el pedido web se une por una **subconsulta deduplicada por venta**
  (`pedidos_online.venta_id` no es único: en la mesa varios pedidos comparten la venta).
- `agrupar`/`envioRecaudado` aceptan varias columnas de agrupación; la clave se arma en JS
  (`a|b|c`, '' para NULL) para no concatenar en SQL (`||` con un entero falla en Postgres).
- Mosaicos de **OpenStreetMap** (CARTO exige clave desde 2026-11): diálogo de zonas, dashboard y
  checkout de la tienda. Atribución visible; sin internet la pantalla avisa.

Tests: `test:dashboard-zonas` y `test:dashboard-zonas-pg` (misma suite contra una base Postgres
temporal que se crea y se borra; se saltea sin Postgres).

### Pago del pedido y moneda del menú (F8, 2026-11)

El pedido **registra cómo va a pagar el cliente; no cobra** (salvo uPay, que ya cobraba). El
cajero cobra en el PdV como siempre, con el cobro del delivery **precargado**.

- **Métodos al recibir / retirar** (`METODOS_AL_RECIBIR`: EFECTIVO, TARJETA_POS, QR, PIX,
  TRANSFERENCIA), con interruptores en «Config Tienda Online» (`tienda_online_config.metodos_pago`,
  JSON). Sin configurar o vacío = sólo efectivo, como antes. Online = uPay (`PagoModalidad.ONLINE`).
- **Efectivo**: moneda (cualquiera activa con cotización), «paga con» (`vuelto_para`, en esa moneda)
  que tiene que superar el total del servidor y no pasar de 100 veces el total, la cotización usada
  (`pago_cotizacion`, 4 decimales) y una observación (MAYÚSCULAS, 200). **Por detrás todo es
  guaraní; el vuelto va siempre en la principal.**
- **Conversión**: extranjera → principal = × `compraLocal` (la tasa a la que el local recibe esa
  moneda; buscada en los dos sentidos, `moneda.utils.ts`). La resuelve el servidor (`monedas.get`);
  la tienda no la reimplementa. El total en otra moneda se redondea hacia arriba a sus decimales,
  igual en tienda (`moneda-tienda.ts`) y servidor (`pago-pedido.utils.ts`).
- **Moneda del menú**: sólo visual (selector en la barra, aviso «precios aproximados»; el pipe
  `precio` recibe la moneda como argumento). Lo registrado (mis pedidos, pago) sigue en ₲.
- **Sugerencias de vuelto**: con los billetes de la moneda (`monedas_billetes`) que valen al menos
  el 10 % del total, el primer múltiplo que pasa el total; siempre mayores al total.
- **Lo que ve el local**: `resumenPago` («EFECTIVO · EN US$ · PAGA CON US$ 10,00 (≈ ₲ 60.000) ·
  VUELTO ₲ 15.000») en la bandeja, el recibo del panel de delivery y el ticket de delivery. Usa
  todas las monedas (`monedasParaResumen`): si se desactiva una, el pedido sigue diciendo con qué
  paga. Un pedido anterior a F8 muestra sólo el método.
- **Precarga del cobro**: agregar una línea en el cobro ya la guarda (`createPagoDetalle`), así que
  la precarga es de los **campos** (forma de pago, moneda, monto) y nunca guarda nada sola; sólo en
  la primera ronda. QR no tiene forma de pago propia en el PdV: se precarga TRANSFERENCIA si no
  existe una «QR».
- **Texto libre del cliente sin caracteres de control** (`recortar`, observación y
  `sanitizarParaTicket`): Postgres rechaza el NUL (el alta fallaba con 500) y la térmica toma
  ESC/GS como comandos.
- Pendientes: crédito y vinculación cuenta ↔ Cliente en F8b. («Mis pedidos» ya muestra el pago
  elegido desde F9.)

Tests: `test:pedidos-online-pago` (+ `-pg`), `test:storefront-vuelto`, F8 en
`test:tienda-online-migracion`.

### Detalle del pedido, cancelación y WhatsApp elegible (F9, 2026-11)

**Detalle** (`/pedido/:numero`, desde cada tarjeta de «Mis pedidos»): estado con pasos, ítems con
su personalización, entrega, pago elegido (F8), totales, número copiable; se refresca cada 12 s
mientras está en curso. **Qué botones hay lo decide el servidor** (`acciones` en `mapPedido`,
`electron/utils/pedido-acciones.utils.ts`); la tienda sólo los muestra y cada operación vuelve a
validar con un UPDATE condicionado.

- **Cancelar = siempre una solicitud** (`pedido.cancelacion.solicitar`, motivo opcional en
  MAYÚSCULAS sin caracteres de control): RECIBIDO/ACEPTADO/EN_PREPARACION/LISTO, sin otra
  pendiente, sin una ya rechazada, y no en una mesa con el pedido en la cuenta (eso se pide al
  mozo). Columnas `cancelacion_solicitada_en`, `cancelacion_motivo`, `cancelacion_respuesta`.
- **El local responde en la bandeja** (`resolver-cancelacion-pedido-online`, GESTIONAR; filtro
  «Piden cancelar»; suma al contador del badge). **Aprobar** pasa por `cancelarPedido`, el MISMO
  camino que el rechazo (reversa de la venta, permiso de cobrado, devolución uPay) y termina en
  **CANCELADO** (lo pidió el cliente; RECHAZADO = lo decidió el local). **No se puede cancelar**:
  se guarda la respuesta, el cliente la ve y no puede volver a pedirlo (para eso, el teléfono).
- **Modificar** (excepción decidida por el propietario): cancela **al instante** sólo si está
  RECIBIDO, sin venta, sin cobro online PAGADO/PENDIENTE y sin solicitud pendiente; no en mesa.
  Motivo «MODIFICADO POR EL CLIENTE». La tienda rearma el carrito con esos productos.
- **Repetir**: `core/repetir-pedido.ts` rearma las líneas del snapshot de cada ítem (que ahora
  guarda también `opcion.recetaId`; `mapPedido` manda `productoId`/`presentacionId`) contra la
  carta **vigente**: lo que ya no se vende no vuelve y se avisa en el carrito; el precio es el de
  hoy. Un pedido viejo sin receta con dos variaciones posibles no se adivina: se avisa.
- **Compartir** (`navigator.share` o `wa.me/?text=`): número, comercio, estado, productos y
  total; sin dirección ni teléfono. **Llamar / escribir al local** con
  `tienda_online_config.telefono_contacto` (validado: dígitos, espacios, + y guiones).
- **Carrera con la materialización** (auditoría A1): `materializarPedidoOnlineEnVenta` ahora fija
  `venta_id` con un UPDATE condicionado (`venta_id IS NULL AND estado NOT IN (RECHAZADO,
  CANCELADO)`); si el cliente canceló en el medio, la transacción se deshace y no queda una venta
  suelta.
- **Topes**: 20 acciones por cuenta y 60 por IP por hora (`accionClientePermitida`).
- **Dónde lo ve el personal**: la bandeja y también la cola «Pedidos de la web» del diálogo de
  delivery (con «PIDIÓ CANCELAR» y los botones CANCELAR PEDIDO / NO SE PUEDE en lugar de
  ACEPTAR/RECHAZAR). El contador del badge es una sola consulta (un RECIBIDO que pide cancelar
  cuenta uno). **El badge del PdV leía `res.total`, que nunca existió**: estuvo siempre en 0 hasta
  F9 (ahora lee `pendientes`).
- **Solicitud que se queda sin responder**: si el pedido pasa a EN_CAMINO/ENTREGADO (bandeja o
  sincronización con el delivery), `cierreSolicitudAlSalir` la cierra con «EL PEDIDO YA HABÍA
  SALIDO»; si no, el cliente quedaba «esperando respuesta» para siempre.
- Tras un «no» del local tampoco se puede «Modificar» (sería cancelarlo igual).
- El invitado de mesa (sin cuenta) ve su pedido pero sin acciones.

**WhatsApp elegible** (`tienda_online_config.whatsapp_proveedor` = META | EVOLUTION): el código de
ingreso sale por Meta Cloud (plantilla) o por **el número del local vía Evolution API**
(`POST {url}/message/sendText/{instancia}`, encabezado `apikey`, número `595…`). Evolution **no se
configura dos veces**: usa la de «Configuración › Notificaciones» (`configuracion_notificaciones`
+ `getEvolutionApiKey`), releída como mucho cada 30 s en las llamadas públicas
(`refrescarCredencialesWhatsapp`, lectura compartida; un error deja las credenciales que había) y
siempre en la pantalla de config y en «Probar envío». Si el
elegido no está cargado sale por el otro; un **error** de envío no cae al otro (serían dos
códigos). La clave nunca aparece en errores. Google ya verificaba de verdad (tokeninfo + `aud`);
falta sólo cargar el Client ID. Apple: no por ahora (decisión 05/11).

Tests: `test:pedidos-online-detalle` (+ `-pg`), `test:whatsapp-proveedores`,
`test:storefront-detalle`, F9 en `test:tienda-online-migracion`.

### Dos pantallas, un pedido: atención en el diálogo de delivery (F10, 2026-11)

**Decisión del propietario (2026-11-06):** la pantalla de **atención** de los pedidos web es la
cola del **diálogo de delivery del PdV** (`shared/components/delivery-dialog`). La **bandeja**
(`pages/ventas/pedidos-online/list-pedidos-online`) sigue viva como **panel de observación y
acción**: historial, filtros, mesa QR y actuar sin entrar al PdV.

⚠️ **Regla: todo cambio en el flujo de atención se hace en LAS DOS pantallas.** Una acción, un
estado o un aviso que aparece en una y no en la otra es exactamente el desfase que motivó F10
(el cajero veía el pedido en un lugar y no podía hacer nada con él en el otro). Al tocar
cualquiera de las dos, revisar la otra en el mismo PR. Los dos componentes lo dicen en su
cabecera.

Qué comparten (para no duplicar reglas):
- **Qué espera a alguien:** `motivoAtencion()` y `WHERE_ATENCION` en `electron/utils/pedido-acciones.utils.ts`
  — `CANCELACION` > `NUEVO` > `SIN_COCINA` > `DEVOLVER`, una sola por pedido. Lo usan el filtro
  `get-pedidos-online-admin({ atencion: true })` (la cola del diálogo), el `motivoAtencion` de
  cada pedido y `contar-pedidos-online-pendientes`. Un test (`[K]` del e2e de detalle) verifica
  que el WHERE y la función digan lo mismo.
- **Contador del PdV:** `pendientes` (nuevos + piden cancelar + sin cocina) hace sonar el aviso;
  `total` (suma las devoluciones de uPay) es el número del badge. Antes contaba todo ACEPTADO
  aunque ya estuviera en cocina.
- **Un solo número:** el pedido web se nombra con su **PO-…** (el que ve el cliente) en la lista
  de delivery (columna PEDIDO), en el comprobante del diálogo y en el ticket impreso
  («PEDIDO WEB PO-000005» y debajo «DELIVERY N° 8 · VENTA #14»). La bandeja muestra a su vez
  «Delivery N° 8 · Venta #14». `delivery-listar-pdv` trae `pedidoWeb` (`resumenPedidoWeb()`:
  sólo número, estado, pago online y cancelación — nada del cliente).

Qué hace la cola del diálogo, por sección: **PIDEN CANCELAR** (cancelar / no se puede; también
desde el footer con la fila seleccionada), **NUEVOS** (aceptar / rechazar), **ACEPTADOS SIN ENVIAR
A COCINA** (enviar a cocina con la caja de este PdV / rechazar), **DEVOLVER PAGO EN UPAY** (ya
devolví). Cancelar desde el footer un pedido pagado online avisa que queda para devolver.

**Mesa QR queda afuera a propósito:** su aprobación es habilitar la mesa en el PdV y después va
sola a cocina (ver «Canal MESA_QR»). El recovery de una mesa sin venta sigue en la bandeja. Idea
del propietario para más adelante: que los pedidos pasen solos a cocina con reglas de cuidado
para casos especiales.

### Lo que sigue pendiente

- ~~El cliente no puede cancelar su pedido.~~ Hecho en F9 (solicitud que aprueba el local).
- **No hay aviso al cliente por WhatsApp**; el seguimiento es por poll.
- `CuentaCliente` **nunca se vincula** al `Cliente` interno: sin crédito, sin CPC,
  sin dashboard. Y el storefront no pide RUC en ningún lado. **El crédito en la tienda
  y esa vinculación quedaron para F8b** (decisión del propietario, 05/11): manual, con
  permiso de clientes y registro de quién vinculó; nunca automática (riesgo de fraude).
- `BANCARD`/`PAGOPAR` y `CanalPedidoOnline.WHATSAPP` siguen declarados sin
  implementación. ~~«El pago es efectivo contra entrega y es una decisión cerrada.»~~
  **Reabierta y cambiada en F8 (05/11):** tarjeta online por uPay (F4) y, al recibir o
  retirar, los métodos que habilita el local (ver «Pago del pedido (F8)»).
- Falta **pantalla de curación de la carta**, y no es sólo una pantalla que falta:
  la carta online es **un espejo del inventario con un filtro de visibilidad**.
  `menu.page.ts` toma `categoriaId` directo del producto, así que las categorías
  que ve el cliente son las `Familia`/`Subfamilia` internas — «BEBIDAS» termina
  siendo el inventario alfabético del bar (shots sueltos, chopps y gaseosas
  mezclados). Un toggle masivo no lo arregla: hace falta una **categorización
  propia de la tienda** (un `categoriaOnline` con 5-8 valores curados) además de
  la grilla con publicar/pausar en lote, orden propio e imagen. Y publicar hoy es
  un toggle enterrado en el form de cada producto
  (`producto-informacion-general.component.html`): armar el menú son 148
  formularios. De 218 productos de producción **sólo 4 tienen imagen**, así que el
  cuello real es contenido, no código.
- **`horariosJson` no tiene UI.** El switch maestro `activa` es lo único que se
  puede tocar; los horarios quedan como dato muerto hasta que exista la pantalla.
- **La tarifa es plana por zona y es una decisión, no una carencia**: cotizar por
  distancia recorrida no mueve la aguja en una ciudad de este tamaño.
- Sin índice en `pedidos_online.cuenta_cliente_id`, sin único en
  `cuentas_cliente.email`, y `presentacion.activo` no se filtra en el menú.
- **`siguienteNumero` es `count()+1` con un retry que se traga *cualquier* error
  seis veces** (`pedidos-online-pedidos.handler.ts`), no sólo la colisión del
  índice único. El índice único evita el número duplicado; el retry ciego puede
  esconder otra falla.
- **Diseñador de zonas (F7, 2026-11):** una zona puede tener **varias áreas** con
  el mismo precio (se guarda `Polygon` con una, `MultiPolygon` con varias; el
  servidor ya resolvía los dos). Vértices visibles, arrastrables, se destacan al
  pasar el mouse y muestran «×» para borrarlos; clic sobre un borde inserta un
  punto en ese lado. Antes el diseñador leía sólo la primera área y al guardar
  borraba las demás. Geometría pura y testeada en
  `pages/ventas/pedidos-online/zona-geometria.ts` (`test:zonas-geometria`).
  Pendiente: **un polígono que se cruza a sí mismo no se detecta ni se avisa** —
  con la regla par-impar queda una zona muerta que el dueño no ve en el mapa.
- **Accesibilidad del storefront:** prácticamente cero `alt` en imágenes y dos
  `aria-label` en todo el proyecto.
- **Nominatim se llama sin identificar** desde `checkout.page.ts`. Su política es
  1 req/s con `User-Agent` con contacto; sin eso el bloqueo es por IP — el mismo
  problema que ya se resolvió para MusicBrainz.

**Archivos clave:** `entities/pedidos-online/*`, `electron/utils/geo.utils.ts`, `electron/utils/delivery-alta.utils.ts`, `src/app/pages/ventas/pedidos-online/mapa-zonas-dialog/`, `src/app/shared/components/delivery-dialog/`, `electron/handlers/pedidos-online*.handler.ts` (5), `electron/server/public-routes.ts` + `server.ts`, `electron/utils/customer-jwt.utils.ts` + `whatsapp-sender.ts`, `main.ts` (storefrontRoot `:225-234`, `startServer` `:246`), `electron/utils/register-all-handlers.ts:178-183`, `pages/ventas/pedidos-online/list-pedidos-online.component.ts`, `projects/storefront/src/app/`.

---

## Canal MESA_QR (pedido en mesa por autoservicio)

> Implementado 2026-07, **mergeado a `develop`** (PRs #211 y #212, merge `c29521b`); fases F1–F5 + F3b + F2b completas. El cliente se sienta, escanea un **QR estático de la mesa**, se identifica liviano (solo nombre) y pide desde el celular. El **pago es siempre en la caja física** (sin pasarela online). El pedido se **materializa automáticamente en la venta abierta de la mesa** → cocina (KDS).

**Modelo de seguridad (3 capas):**
1. **QR estático por mesa** con **token opaco** (`PdvMesa.qrToken`, UUID aleatorio, nunca el número). Lámina imprimible por mesa.
2. **Habilitación del cajero** (`PdvMesa.autoservicioActivo`): la mesa solo acepta pedidos si el cajero la habilitó. Corta el ataque de escanear una foto del QR desde afuera.
3. **Validación de red LAN** (`TiendaOnlineConfig.requiereLanMesa` + `rangoLanMesa`): el pedido debe venir de una IP permitida. ⚠️ Detrás del reverse proxy en la nube, los clientes en la WiFi del local egresan por la **IP pública del local** → `rangoLanMesa` debe contener esa IP pública (no un rango privado). Requiere `TRUST_PROXY` en el server para leer `X-Forwarded-For`. Util `electron/utils/ip-lan.util.ts` (`ipEnRangosLan`). Si la topología no expone IPs útiles, poner `requiereLanMesa=false` y confiar en el gate del cajero.

**Datos** (F1a, migración `1785082533104-AddMesaQrAutoservicio`): `PdvMesa.qrToken` (único) + `autoservicioActivo`; `TiendaOnlineConfig.permiteMesa` + `requiereLanMesa` + `rangoLanMesa`.

**Backend:**
- `mesa-qr.handler.ts` (F1b, `ensurePermission('VENTAS_PDV')`): `generar-qr-mesa(mesaId,{baseUrl?,rotar?})` (asegura/rota token + genera imagen QR con la lib `qrcode`, apunta a `<baseUrl>/tienda?mesa=<token>`), `get-qr-mesas({baseUrl?})` (todas las mesas activas, para la lámina), `set-autoservicio-mesa(mesaId,activo)` (gate del cajero).
- **Puente** (F2) `materializarPedidoOnlineEnVenta(dataSource, pedidoId, opts?, userId?)` — función **module-level exportada en `ventas.handler.ts`** (sin `ensurePermission`, gateada por la validación de mesa; el ipc handler `materializar-pedido-online-en-venta` la envuelve con permiso). Resuelve/abre la Venta ABIERTA de la mesa (`comanda IsNull`) o la crea con la caja abierta + marca la mesa OCUPADO; vuelca cada `PedidoOnlineItem` como `VentaItem` (separando `precioVentaUnitario` y `precioAdicionales` porque el pedido congela `precioUnitario = base + adicionales`); mapea sabores (pizza), adicionales y **observaciones/nota libre** inline; escribe en transacción y dispara los hooks KDS/impresión **post-commit**. Idempotente por `pedido.ventaId`. Las observaciones predefinidas se resuelven por **texto contra el catálogo `Observacion`** (descripcion única); la nota libre y las no matcheadas se cuelgan de un **sentinel `'NOTA DEL CLIENTE'`** (find-or-create) vía `observacionLibre`, así la cocina las ve. Modificaciones de ingredientes no se capturan en pedidos online.
- **`crear-pedido-online`** rama MESA_QR (F3): invitado permitido (nombre obligatorio, `customerId` null OK), resuelve la mesa por `data.mesaToken`, valida `permiteMesa` + `activo` + `autoservicioActivo` + IP LAN, `canalOrigen=QR_MESA`, pago EFECTIVO, y **auto-materializa best-effort** al crear (si no hay caja abierta, queda para la bandeja — nunca falla el pedido).
- `get-mesa-online-por-token` (público): el storefront resuelve nº de mesa + si está habilitada.
- **`optionalAuth`** en `public-routes` (`pedido.crear`): resuelve el cliente si viene token pero no rechaza (MESA_QR admite invitado); `mesa.get` es público sin auth.

**Frontend:**
- **PdV** — `mesa-selection-dialog` (F5): indicador de "autoatención QR en curso" (borde celeste + icono de celular) + toggle por mesa (`set-autoservicio-mesa`, el gate del cajero). Pantalla **"QR de Mesas"** (`pages/ventas/pedidos-online/mesas-qr/`, menú Ventas) con la lámina imprimible.
- **Storefront** (F4) — `MesaService` captura el token de `/tienda?mesa=<token>` (o sessionStorage) y resuelve `mesa.get`; banner "Estás en la Mesa N"; el checkout en modo mesa pide nombre, sin dirección/mapa/login, total sin envío, y envía `pedido.crear` con `tipoPedido=MESA_QR` + `mesaToken` + `nombreCliente`.

**Config UI:** los flags `permiteMesa` / `requiereLanMesa` / `rangoLanMesa` se editan desde *Config Tienda Online* (sección "Pedidos en mesa (QR)"). `requiereLanMesa` se apaga en desarrollo. **Todas las fases (F1–F5 + F3b + F2b) están implementadas y mergeadas a `develop`.**
