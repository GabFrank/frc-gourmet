# Pedidos Online / Storefront (webapp pública de clientes)

> Subsistema tipo iFood: **PWA pública** para que clientes finales hagan pedidos, con superficie HTTP **aislada** (`/pub/*`), **auth de cliente propia** (separada del staff) y **bandeja de aceptación** en el PdV. Plan de referencia: `docs/arquitectura/webapp-pedidos-plan.md` (Fases 0–E). Solo corre en **modo `server`** (Fastify + `/tienda`). Introducido 2026-07-08+.

## Proyecto storefront (tercer proyecto Angular)

Hermano de `mobile` en el monorepo: `angular.json` → `projects: ['frc-gourmet', 'mobile', 'storefront']`, root `projects/storefront`, salida `dist/storefront`.
- Build: `npm run build:storefront` = `ng build storefront --base-href /tienda/` (⚠️ **base-href obligatorio** o los assets rompen). Incluido en `build:prod`.
- Standalone + rutas lazy (`projects/storefront/src/app/app.routes.ts`): `''` (MenuPage), `producto/:id`, `pizza/:productoId/:saborId`, `carrito`, `checkout`, `login`, `mis-pedidos`, `cuenta`.
- Core (`projects/storefront/src/app/core/`): `public-api.service.ts` (cliente de `/pub/rpc`, `POST {base}/pub/rpc {op, params}` con Bearer, refresh en 401 y reintento único, refresh en `localStorage 'frc_sf_refresh'`), `auth.service.ts`, `cart.service.ts`, `menu.service.ts`, `config.service.ts`.

## Aislamiento de superficie (regla dura)

**El cliente final NUNCA toca `/api/rpc`** (que puede invocar ~800 handlers con JWT de staff). Toda operación pública pasa por `POST /pub/rpc {op, params}` acotado por una **whitelist explícita** (`PUBLIC_OPERATIONS` en `electron/server/public-routes.ts`); un `op` no whitelisteado → **403**. Rate limit propio 120/min. Cada op se registra con `registerPublicOperation('menu.get', {channel, requiresAuth})`.

También: `/pub/health`, `/pub/producto-image/*` (fotos de menú estáticas), y `/tienda/` (SPA `dist/storefront` con fallback, registrada **antes** del static de mobile en `/`).

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
| `PedidoOnline` | `pedidos_online` | "Envelope" inbound **antes** de convertirse en `Venta`. `numero` único (`PO-000001`), `estado` (def RECIBIDO, indexado), snapshots de cliente, `tipoPedido`, `metodoPago`, `fechaProgramada` (null=ASAP), montos, `latitud`/`longitud` (Fase D), `direccionEntrega`, vínculos sueltos `ventaId`/`deliveryId`/`mesaId`, `motivoRechazo`, timestamps de estado |
| `PedidoOnlineItem` | `pedido_online_items` | `productoId`/`presentacionId?`, snapshots de nombre, `precioUnitario`/`subtotal` **congelados**, `personalizacion` como **texto JSON** `{opcion, sabores, adicionales, observaciones, notaLibre}` |
| `CuentaCliente` | `cuentas_cliente` | Cuenta de cliente final **separada de `Usuario`**. `telefono` (único, nullable), `email`, `passwordHash?` (bcrypt), `cliente` FK opcional al `Cliente` interno |
| `ZonaDelivery` | `zonas_delivery` | `nombre`, `tarifa`, `montoMinimo`, `orden` (tarifa plana; polígonos = Fase 6) |
| `TiendaOnlineConfig` | `tienda_online_config` | Fila única. `activa` (master switch), branding, `permitePickup/Delivery`, `prepTimeMinutos`, `montoMinimoPedido`, `aceptacionAutomatica`, `horariosJson` |
| `CustomerRefreshToken` | `customer_refresh_tokens` | Refresh de cliente (`tokenHash` sha256, revocación) |
| `CodigoOtp` | `codigos_otp` | OTP de login (`codigoHash` bcrypt, TTL, intentos) |

**Flags en `Producto`:** `disponibleOnline` (se publica en la carta) y `pausadoOnline` ("86ing" — pausa temporal sin despublicar). Se **revalidan al crear el pedido**, no solo al publicar el menú.

**Migrations** (`…210/211/212`, timestamps rounded — ⚠️ contra la convención de epoch-ms real, no imitar): `AddOnlineFieldsToProducto`, `AddCuentasClienteYOtp`, `AddPedidosOnline`, `AddTiendaConfigYCustomerRefresh`, `AddUbicacionPedidoOnline`.

## Auth de cliente (`electron/handlers/pedidos-online-auth.handler.ts`)

Todas las ops vía `/pub/rpc`:
- **OTP WhatsApp:** `auth.otp.request` (OTP 6 dígitos, hash bcrypt, TTL 5min, anti-spam 3/min) + `auth.otp.verify` (máx 5 intentos, get-or-create de cuenta). **Modo dev:** si faltan credenciales de WhatsApp Cloud, `whatsapp-sender.ts` usa `provider='dev-log'` y el handler **devuelve `devCodigo` en la respuesta** para probar sin WhatsApp (con credenciales reales nunca se echoa).
- **Email/password:** `auth.registrar`, `auth.login` (identificador = teléfono o email).
- **Google:** `auth.google` verifica el ID token contra `oauth2.googleapis.com/tokeninfo` (chequea `aud === GOOGLE_CLIENT_ID` env + `email_verified`).
- **Sesión:** `emitirSesion` firma access + emite refresh; `auth.refresh` rota, `auth.logout` revoca; `auth.me`/`auth.perfil.update` requieren JWT.

> OTP de pedidos online usa **WhatsApp Cloud API (Meta)** (`whatsapp-sender.ts`, config por env `WHATSAPP_CLOUD_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`). Es **distinto** del WhatsApp de notificaciones/resumen de caja, que usa Evolution API. → [domains/financiero-caja-mayor.md] y notificaciones.

## Flujo de pedido y bandeja PdV

**Creación** (`pedidos-online-pedidos.handler.ts`, `crear-pedido-online`, requiere JWT de cliente):
- Recalcula **todo server-side** desde el catálogo (no confía en precios del cliente): `resolveOpcion` por tipo de producto, `resolveAdicionales` valida contra `RecetaAdicionalVinculacion`.
- Valida por ítem `disponibleOnline && !pausadoOnline && activo && esVendible`; tienda abierta (`estaAbierta`); tipo habilitado; mínimo global; DELIVERY exige coords o dirección.
- **Congela precios** en los items + snapshot `personalizacion` JSON. Número `PO-000001` (con reintento por colisión).
- Entra **RECIBIDO**, o **ACEPTADO** directo si `cfg.aceptacionAutomatica`. Lecturas del cliente: `pedido.mis`, `pedido.estado`.

**Bandeja PdV** (`pedidos-online-admin.handler.ts`, vía `/api/rpc`, permiso `VENTAS_PDV`):
- `get-pedidos-online-admin`, `contar-pedidos-online-pendientes` (RECIBIDO+ACEPTADO, para badge/sonido).
- `aceptar-pedido-online` (desde RECIBIDO), `rechazar-pedido-online` (con motivo), `avanzar-estado-pedido-online` (máquina `TRANSICIONES`), `vincular-venta-pedido-online`. CRUD de zonas.
- **Materialización a `Venta`:** NO hay pipeline paralelo — el pedido se materializa con el flujo normal del PdV y se guarda el vínculo `ventaId`.
- Componente `src/app/pages/ventas/pedidos-online/list-pedidos-online.component.ts` — **auto-refresh por polling cada 15 s** (no hay SSE para la bandeja, a diferencia del KDS).

## Pizza online (sabor × tamaño + mitad y mitad) — Fases E1/E2

- Producto **`ELABORADO_CON_VARIACION`**. Precio de cada celda (sabor × tamaño) vive en **`RecetaPresentacion`** (join `Sabor` × `Presentacion`), NO en la receta.
- `getPizzaConfig` lee de **`PdvConfig`**: `pizzaMaxSabores` (def 2), `pizzaEstrategiaPrecio` (`MAYOR_PRECIO` def | `PROMEDIO`) — reusa la config del mostrador para cotizar igual.
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

**Archivos clave:** `entities/pedidos-online/*`, `electron/handlers/pedidos-online*.handler.ts` (5), `electron/server/public-routes.ts` + `server.ts`, `electron/utils/customer-jwt.utils.ts` + `whatsapp-sender.ts`, `main.ts` (wiring `:262-266`, storefrontRoot `:367-388`), `pages/ventas/pedidos-online/list-pedidos-online.component.ts`, `projects/storefront/src/app/`.

---

## Canal MESA_QR (pedido en mesa por autoservicio)

> Implementado 2026-07 en la rama `claude/pedidos-mesa-qr` (fases F1–F5 + F3b). El cliente se sienta, escanea un **QR estático de la mesa**, se identifica liviano (solo nombre) y pide desde el celular. El **pago es siempre en la caja física** (sin pasarela online). El pedido se **materializa automáticamente en la venta abierta de la mesa** → cocina (KDS).

**Modelo de seguridad (3 capas):**
1. **QR estático por mesa** con **token opaco** (`PdvMesa.qrToken`, UUID aleatorio, nunca el número). Lámina imprimible por mesa.
2. **Habilitación del cajero** (`PdvMesa.autoservicioActivo`): la mesa solo acepta pedidos si el cajero la habilitó. Corta el ataque de escanear una foto del QR desde afuera.
3. **Validación de red LAN** (`TiendaOnlineConfig.requiereLanMesa` + `rangoLanMesa`): el pedido debe venir de una IP permitida. ⚠️ Detrás del reverse proxy en la nube, los clientes en la WiFi del local egresan por la **IP pública del local** → `rangoLanMesa` debe contener esa IP pública (no un rango privado). Requiere `TRUST_PROXY` en el server para leer `X-Forwarded-For`. Util `electron/utils/ip-lan.util.ts` (`ipEnRangosLan`). Si la topología no expone IPs útiles, poner `requiereLanMesa=false` y confiar en el gate del cajero.

**Datos** (F1a, migración `1785082533104-AddMesaQrAutoservicio`): `PdvMesa.qrToken` (único) + `autoservicioActivo`; `TiendaOnlineConfig.permiteMesa` + `requiereLanMesa` + `rangoLanMesa`.

**Backend:**
- `mesa-qr.handler.ts` (F1b, `ensurePermission('VENTAS_PDV')`): `generar-qr-mesa(mesaId,{baseUrl?,rotar?})` (asegura/rota token + genera imagen QR con la lib `qrcode`, apunta a `<baseUrl>/tienda?mesa=<token>`), `get-qr-mesas({baseUrl?})` (todas las mesas activas, para la lámina), `set-autoservicio-mesa(mesaId,activo)` (gate del cajero).
- **Puente** (F2) `materializarPedidoOnlineEnVenta(dataSource, pedidoId, opts?, userId?)` — función **module-level exportada en `ventas.handler.ts`** (sin `ensurePermission`, gateada por la validación de mesa; el ipc handler `materializar-pedido-online-en-venta` la envuelve con permiso). Resuelve/abre la Venta ABIERTA de la mesa (`comanda IsNull`) o la crea con la caja abierta + marca la mesa OCUPADO; vuelca cada `PedidoOnlineItem` como `VentaItem` (separando `precioVentaUnitario` y `precioAdicionales` porque el pedido congela `precioUnitario = base + adicionales`); mapea sabores (pizza) y adicionales inline; escribe en transacción y dispara los hooks KDS/impresión **post-commit**. Idempotente por `pedido.ventaId`. **Observaciones/nota libre no se mapean** (el snapshot online es solo texto, sin id de `Observacion` que es FK obligatoria) → se devuelven en `observacionesNoMapeadas` (pendiente F2b).
- **`crear-pedido-online`** rama MESA_QR (F3): invitado permitido (nombre obligatorio, `customerId` null OK), resuelve la mesa por `data.mesaToken`, valida `permiteMesa` + `activo` + `autoservicioActivo` + IP LAN, `canalOrigen=QR_MESA`, pago EFECTIVO, y **auto-materializa best-effort** al crear (si no hay caja abierta, queda para la bandeja — nunca falla el pedido).
- `get-mesa-online-por-token` (público): el storefront resuelve nº de mesa + si está habilitada.
- **`optionalAuth`** en `public-routes` (`pedido.crear`): resuelve el cliente si viene token pero no rechaza (MESA_QR admite invitado); `mesa.get` es público sin auth.

**Frontend:**
- **PdV** — `mesa-selection-dialog` (F5): indicador de "autoatención QR en curso" (borde celeste + icono de celular) + toggle por mesa (`set-autoservicio-mesa`, el gate del cajero). Pantalla **"QR de Mesas"** (`pages/ventas/pedidos-online/mesas-qr/`, menú Ventas) con la lámina imprimible.
- **Storefront** (F4) — `MesaService` captura el token de `/tienda?mesa=<token>` (o sessionStorage) y resuelve `mesa.get`; banner "Estás en la Mesa N"; el checkout en modo mesa pide nombre, sin dirección/mapa/login, total sin envío, y envía `pedido.crear` con `tipoPedido=MESA_QR` + `mesaToken` + `nombreCliente`.

**Pendiente (F2b):** mapear observaciones/nota libre del pedido a `VentaItemObservacion` (requiere guardar `observacionId` en el snapshot online o hacer lookup por texto). Modificaciones de ingredientes no se capturan online.
