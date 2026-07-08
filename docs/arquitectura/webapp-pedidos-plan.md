# Web App de Pedidos Online — Análisis de mercado + Plan de desarrollo

> **Estado:** propuesta / plan (2026-07). No hay código todavía.
> **Objetivo:** una web app exclusiva de marca, conectada al SaaS FRC Gourmet, donde el cliente final hace pedidos (retiro / delivery / mesa por QR), paga online, y el pedido se **recibe y procesa directamente desde el SaaS**. Menú, precios, disponibilidad y configuración se administran desde FRC Gourmet.

---

## 0. TL;DR ejecutivo

- **No necesitamos reinventar casi nada del modelo de datos**: `Producto → Presentacion → PrecioVenta`, `Adicional`, `Observacion`, modificación de ingredientes, multi-sabor, `Venta/VentaItem`, `Delivery`, `PrecioDelivery`, `Cliente`, `Notificaciones` y **facturación electrónica (SIFEN)** ya existen. La carta online es un **subconjunto publicable** del catálogo del POS — el mismo patrón "menú = fuente única de verdad" de Toast/Square/Deliverect.
- **Ya tenemos la mitad de la infraestructura de conexión**: el `mode=server` (Fastify) expone los ~696 handlers por HTTP/JWT, y la **PWA mobile** (`projects/mobile`) ya demostró cómo montar un cliente web sobre ese server reusando `@frc/shared-core`. La web de pedidos es una **segunda app** del mismo workspace con el mismo patrón.
- **Lo que falta y hay que construir de cero**: (1) **superficie pública segura** separada del RPC admin, (2) **auth de cliente autoservicio** (teléfono/OTP), (3) **pasarela de pago online** local (Bancard/Pagopar/Mercado Pago), (4) **storefront PWA de marca**, (5) **bandeja de pedidos entrantes** en el PdV (aceptar/rechazar/tiempo de preparación), (6) **hosting alcanzable por internet con TLS** (hoy el server es LAN sin TLS), (7) **imágenes de producto** (hoy "parcialmente desactivadas").
- **Nuestra ventaja competitiva**: 0% comisión y 0 fee por pedido (POS propio, sin lock-in de hardware ajeno), **PYG sin decimales + multimoneda** nativo, **delivery propio de primera clase**, **pago local + efectivo contra entrega**, y **WhatsApp** como canal — todo lo que las plataformas US-first no priorizan y por lo que Rappi/PedidosYa/Uber cobran 20-35%.

---

## 1. Análisis de mercado (cómo lo hacen los maduros)

### 1.1 POS con ordering nativo (Toast, Square, Lightspeed, Clover)

El aprendizaje central: **el menú online ES el catálogo del POS**, no hay sync bidireccional entre dos sistemas. "86ing" (agotar un ítem) desde cualquier terminal apaga el producto en web/app/agregadores en tiempo real. El pedido online cae al mismo flujo de cocina (KDS/impresora) que la sala.

- **Toast**: "sin comisión" pero cobra procesamiento **~3.5% + US$0.15** por pedido online, y obliga a migrar **todo** el POS a Toast (US$300–1.000+/mes + hardware). Lock-in total.
- **Square Online**: catálogo maestro único; plan gratis con **3.3% + 30¢**, planes pagos bajan a 2.9%. Eliminó los "dispatch fees" de delivery en feb-2025.
- **Lightspeed "Order Anywhere"**: pickup/delivery + **dine-in por QR en mesa** (pagar online o en persona + propina).
- **Clover**: solo DoorDash out-of-box (**US$6.99/pedido**); Uber Eats requiere sumar Deliverect. Exige hardware Clover.

### 1.2 "Direct / commission-free ordering" (web de marca)

Dan al restaurante su propia web/app y se quedan con la data del cliente; cobran suscripción fija en vez de comisión.

| Plataforma | Modelo | Aprendizaje replicable |
|---|---|---|
| **ChowNow** | 0% comisión, US$119–328/mes + 2.95%+29¢ | Web+app de marca sobre 30+ POS |
| **Owner.com** | US$249/mes+5% ó **US$499/mes flat** | App de marca → **2× re-order**; loyalty tipo Starbucks; delivery de terceros a ~US$7 flat |
| **GloriaFood** | **Gratis, 0 comisión** + app US$59/mes, pago 2% | Menu builder drag-and-drop; pedido empujado al instante a un device del restaurante |
| **Flipdish** | 49–99€/mes por sitio | Web + app + **QR ordering** + kiosco, todo cae al mismo POS |
| **Menufy / Popmenu / UEAT** | US$149–330/mes ó US$1–1.75/pedido | Loyalty, SMS/email marketing, QR de mesa, upsell |

Debilidad transversal: el "commission-free" suele esconder **fee por pedido (US$1–1.75) + procesamiento + delivery de terceros (~US$7)**, y muchos siguen dependiendo de flotas ajenas (Uber/DoorDash) para el last-mile.

### 1.3 Middleware de inyección al POS (Deliverect, Otter) — el patrón técnico a copiar

**Deliverect** es la mejor referencia de arquitectura, toda basada en **webhooks**:

1. **Register POS webhook** — establece la integración.
2. **Menu Update webhook** — al publicar un menú a un canal, el canal recibe el snapshot (con `channelLinkId`).
3. **Order Notification webhook** — cada pedido nuevo se notifica al POS.

**Modelo de menú (directamente aplicable a nosotros):** jerarquía `Product (type 1) → ModifierGroup (type 3) → Modifier (type 2)`, con atributos `defaultQuantity` (pre-selección), `min`/`max`/`multiMax` (cuántas veces se elige un modificador). El menú publicado es un **subconjunto de los productos del POS**; los PLU con variantes de precio se mapean por `referenceId`. → Mapea casi 1:1 con nuestro `Producto → Adicional/Observacion` + `Presentacion/PrecioVenta`.

**Otter**: consolida canales en un dashboard, inyecta a POS/KDS, "update once, applies everywhere". US$20–89/mes por local.

### 1.4 Marketplaces LatAm (lo que estamos desplazando)

| Plataforma | Comisión (referencia LatAm, **no confirmada para PY**) |
|---|---|
| Rappi | 20–35% + IVA (baja con flota propia) |
| Uber Eats | 25–30% delivery / ~15% pickup + IVA |
| PedidosYa | ~10%+IVA solo-marketplace (reparto propio) · ~18%+IVA con logística |
| **Monchis (PY, 100% paraguaya)** | por comisión sobre ventas — **% no publicado** |

> Nota honesta: no se hallaron cifras oficiales de comisión **específicas de Paraguay**; los rangos son de otros mercados LatAm y sirven como referencia.

### 1.5 Detalles técnicos a retener

- **Delivery branded de terceros**: Uber Direct (OAuth2, quote→create, callbacks de estado) y DoorDash Drive (POST, devuelve tracking URL). Mapa en vivo con **tu** marca. Poco relevante en PY hoy → priorizar **reparto propio + WhatsApp**.
- **Zonas de delivery por drive-time** (no distancia lineal), escalonadas, con mínimo de canasta por zona y auto-asignación por dirección.
- **QR de mesa = PWA**, no app nativa (40–60% más barato, +34% conversión mobile citado en un caso).
- **Pagos LatAm**: Stripe cubre tarjeta/Apple/Google Pay; **Mercado Pago / pasarelas locales** cubren mejor transferencia, wallet y efectivo. **Cash on delivery/pickup** siempre disponible sin procesar online.

### 1.6 Qué copiar / dónde ser mejores

**Copiar:** menú-fuente-única con snapshot publicable · 86ing en tiempo real · QR de mesa como PWA · zonas de delivery por drive-time · tracking branded + notificaciones por estado · cuenta de cliente con historial/favoritos/re-order 1-click + loyalty · scheduling y throttling en horas pico.

**Ser mejores:** **0% comisión y 0 fee/pedido** (POS propio) · **PYG sin decimales + USD/BRL** nativo · **delivery propio de primera clase** (no dependencia obligatoria de flotas ajenas) · **sin lock-in de hardware** · **pago local + efectivo contra entrega** · **WhatsApp** como canal de pedido/notificación (dominante en PY, ausente en las US-first).

---

## 2. Qué ya tenemos vs qué falta

### 2.1 Reutilizable tal cual (base sólida)

| Pieza | Dónde | Uso en pedidos online |
|---|---|---|
| **Server Fastify HTTP+JWT** (`mode=server`) | `electron/server/` | Backend de la web (igual que la PWA mobile) |
| **Patrón PWA cliente** | `projects/mobile` + `@frc/shared-core` + shim HTTP→`/api/rpc` | Clonar para el storefront |
| **Catálogo** | `Familia→Subfamilia→Producto→Presentacion→PrecioVenta` | Carta online (subconjunto publicable) |
| **Modificadores** | `Adicional`, `Observacion`, `VentaItemIngredienteModificacion`, multi-sabor (`VentaItemSabor`) | Personalización en el checkout |
| **Multi-precio / multi-moneda** | `TipoPrecio` (NORMAL/MAYORISTA/VIP), `PrecioVenta` por moneda, `MonedaCambio` | Precio ONLINE + PYG/USD/BRL |
| **Venta** | `Venta/VentaItem` (+ sabores/adicionales/obs) | Materialización del pedido aceptado |
| **Delivery** | `Delivery` (estados) + `PrecioDelivery` (zonas/tarifa) | Envío + tracking |
| **Cliente** | `Cliente`→`Persona`, crédito, cuenta corriente, `MovimientoCliente` | Cliente registrado + loyalty |
| **Notificaciones** | dominio `notificaciones/` (evento/log/receptor/suscripción) | Aviso de pedido al staff |
| **Facturación electrónica** | dominio `facturacion/` (Timbrado, Factura, SIFEN) | Factura del pedido online |
| **Auth tokens** | `refresh-token`, `password-reset-token` | Base para JWT de cliente |
| **Multi-tenant** | `dispositivo_id` (F5) | Trazar canal ONLINE como "dispositivo" |
| **Comandas / impresión** | dominio ventas + `printer` | Ticket a cocina del pedido online |

### 2.2 Gaps a construir

| Gap | Severidad | Nota |
|---|---|---|
| **Superficie pública segura** separada del RPC admin | 🔴 Crítico | Hoy `/api/rpc/:channel` puede invocar **cualquier** handler con un JWT staff. Un cliente NO puede tener eso. |
| **Auth de cliente autoservicio** (teléfono/OTP, WhatsApp) | 🔴 Crítico | `Cliente` no tiene login propio; `Usuario` es staff con password en texto plano. |
| **Pasarela de pago online** (Bancard/Pagopar/Mercado Pago) | 🔴 Crítico | Solo hay formas de pago internas; cero integración de gateway/webhook. |
| **Hosting público + TLS** | 🔴 Crítico | `mode=server` es LAN sin TLS. |
| **Storefront PWA de marca** | 🔴 Crítico | La PWA mobile es admin, no orientada a cliente. |
| **Bandeja de pedidos entrantes** (aceptar/rechazar, prep-time, sonido) | 🔴 Crítico | No existe el concepto de pedido "pre-venta" pendiente de aceptación. |
| **Imágenes de producto** | 🟠 Alto | `imageUrl` "parcialmente desactivado" — imprescindible en un storefront. |
| **Disponibilidad/precio por canal (ONLINE) + 86ing** | 🟠 Alto | Falta flag `disponibleOnline` y toggle en tiempo real. |
| **Config de tienda online** (horarios, tipos de pedido, prep time, throttling) | 🟠 Alto | Entidad nueva. |
| **Seguridad de passwords (bcrypt/argon2) + rate limiting** | 🟠 Alto | Pendiente histórico; bloqueante para exponer a internet. |
| **Tracking del pedido para el cliente** | 🟡 Medio | Reusar estados de `Delivery` + estado del pedido. |
| **Loyalty / re-order / favoritos** | 🟡 Medio | Diferenciador, no MVP. |

---

## 3. Arquitectura propuesta

### 3.1 Decisión clave: modelo de hosting/tenancy

El `mode=server` actual es una **PC en LAN**. Una web pública necesita estar siempre online y con TLS. Tres opciones:

**Opción A — Túnel seguro sobre el server local (MVP rápido).**
Exponer el `mode=server` de cada local por un **Cloudflare Tunnel** (o Tailscale Funnel): TLS + dominio + protección DDoS gratis, sin abrir puertos. Reutiliza el 100% de la infra actual.
- ✅ Time-to-market mínimo, cero infra nueva de servidor.
- ❌ Si la PC del local se apaga, la tienda cae. No hay cola durable si el POS está offline.

**Opción B — Edge cloud + inyección al POS (arquitectura objetivo, estilo Deliverect/Toast).**
Un componente **cloud multi-tenant** siempre online que: (1) sirve el storefront (CDN/TLS/dominio por local), (2) guarda un **snapshot publicado del menú** empujado desde cada POS, (3) recibe pedidos + pagos online y los **inyecta al POS** vía cola durable (webhook si el server local está alcanzable, o el server local hace *poll/long-poll* de pedidos pendientes).
- ✅ Storefront desacoplado del PC local (resiliente), multi-tenant real de SaaS, escala.
- ❌ Más infra y build.

**Recomendación: arrancar con A, evolucionar a B.** El MVP corre el storefront contra el server local por túnel (reusa todo). Cuando haya volumen/varios locales, se introduce el edge cloud con **menú-snapshot + cola de pedidos durable**. El diseño de datos y API se hace desde ya "edge-ready" (snapshot de menú + endpoints idempotentes) para que el salto A→B no rompa nada.

```
   [Cliente / navegador]
            │  HTTPS (dominio de marca)
            ▼
   ┌───────────────────────┐        Fase A: túnel Cloudflare → server local
   │   Storefront PWA       │        Fase B: edge cloud (CDN + API pública + cola)
   │  (projects/storefront) │
   └───────────┬───────────┘
               │  API PÚBLICA (whitelist, JWT cliente)   ← NO es /api/rpc admin
               ▼
   ┌───────────────────────┐
   │  Public API Gateway    │  menú publicado · crear pedido · pago · estado
   │  (Fastify, rutas /pub) │
   └───────────┬───────────┘
               │  materializa pedido aceptado
               ▼
   ┌───────────────────────┐   Bandeja "Pedidos Online" en PdV (aceptar/rechazar)
   │  FRC Gourmet (SaaS)    │→  Venta + VentaItem + Delivery + Comanda/print + stock
   │  handlers existentes   │→  Notificaciones al staff · Factura SIFEN
   └───────────────────────┘
```

### 3.2 Superficie pública separada (seguridad)

**Regla no negociable:** la web de cliente **no** habla con `/api/rpc/:channel` (que puede llamar cualquiera de los 696 handlers). Se crea un **namespace público** `/pub/*` en Fastify con:
- **Whitelist explícita** de operaciones cliente-safe (ver menú, crear pedido, pagar, ver estado, gestionar mi cuenta) — nunca acceso genérico por nombre de canal.
- **JWT de cliente** con `audience: "customer"` y scope propio (sin permisos de staff). Distinto secret/rotación del JWT admin.
- **Rate limiting** (`@fastify/rate-limit`), CORS restringido al dominio de la tienda, captcha en registro/OTP.
- **Webhooks de pago** en `/pub/webhooks/:gateway` con verificación de firma e **idempotencia** (por `transactionId`).

### 3.3 Nuevas entidades (dominio `pedidos-online/`)

Siguiendo la convención (BaseModel, UPPERCASE, migration generada, registrar en `database.config.ts`, 4 capas IPC):

- **`TiendaOnlineConfig`** (1 fila por tienda/local): `activa`, `slug/dominio`, branding (logo, colores, banner), `tiposPedido` (PICKUP/DELIVERY/MESA_QR), `horarios` (por día/franja), `prepTimeMinutos`, `throttlingPorFranja` (máx pedidos/franja), `montoMinimoPedido`, `aceptacionAutomatica` (bool), `metodosPagoHabilitados`, `moneda`, `mensajeBienvenida`.
- **`CuentaCliente`** (auth autoservicio): `telefono` (login), `telefonoVerificado`, `passwordHash?` (argon2, opcional si solo OTP), `email?`, `persona_id?`/`cliente_id?` (vincula al `Cliente` existente), `activo`. + **`CodigoOtp`** (código, canal SMS/WhatsApp, expiración, intentos).
- **`PedidoOnline`** (envelope inbound, **antes** de convertirse en Venta): `numero`, `cuentaCliente_id`, `tipoPedido`, `estado` (`RECIBIDO → ACEPTADO → EN_PREPARACION → LISTO → EN_CAMINO → ENTREGADO` | `RECHAZADO` | `CANCELADO`), `fechaProgramada?` (scheduling), `subtotal`, `costoEnvio`, `total`, `moneda`, `direccionEntrega?`, `zona_id?`, `notas`, `venta_id?` (se llena al aceptar), `delivery_id?`, `canalOrigen` (WEB/QR_MESA/WHATSAPP), `mesa_id?`.
- **`PedidoOnlineItem`**: espejo liviano de la selección del cliente (`producto_id`, `presentacion_id`, `cantidad`, adicionales/observaciones/sabores/modificaciones snapshot, precio) → al aceptar se traduce a `VentaItem` con los handlers existentes.
- **`PagoOnline`**: `pedidoOnline_id`, `gateway` (BANCARD/PAGOPAR/MERCADO_PAGO/EFECTIVO), `estado` (INICIADO/PAGADO/RECHAZADO/REEMBOLSADO), `montoAutorizado`, `transactionId`, `payloadRespuesta` (JSON), `fechaConfirmacion`. Concilia con `Pago/PagoDetalle` + `FormaPago` al aceptar.
- **`ZonaDelivery`** (extiende/reemplaza `PrecioDelivery`): `nombre`, `poligono?`/`radio`/`driveTimeMax`, `tarifa`, `montoMinimo`, `activa`. Auto-asignación por dirección.
- **`MenuPublicado`** (snapshot, para Fase B / edge): versión serializada del menú (categorías, productos, modificadores, precios ONLINE, disponibilidad) + `hash` + `publicadoEn`. Endpoint de publish desde el backoffice.

**Extensiones a entidades existentes:**
- `Producto` / `Presentacion`: `disponibleOnline` (bool) + `pausadoOnline` (86ing en vivo).
- `TipoPrecio`: nuevo registro **ONLINE** (markup web opcional).
- Reactivar `imageUrl` de `Producto` (galería multi-imagen recomendable para storefront).
- `MetodoPago` enum: agregar `PAGO_ONLINE` (o mapear vía `FormaPago` nuevas: "TARJETA ONLINE", "TRANSFERENCIA ONLINE").

### 3.4 Flujo end-to-end de un pedido

1. **Cliente** entra al dominio de marca → storefront PWA carga **menú publicado** (`GET /pub/menu`): solo productos `disponibleOnline && !pausadoOnline`, precio `TipoPrecio=ONLINE`, con imágenes.
2. Arma carrito con adicionales/observaciones/sabores (mismos modificadores del PdV). Elige **PICKUP / DELIVERY / MESA_QR** y, si aplica, **scheduling** (ASAP o futuro).
3. **Checkout**: login por **teléfono + OTP (SMS/WhatsApp)**. Dirección → **auto-asigna ZonaDelivery** (tarifa + valida mínimo).
4. **Pago**: `POST /pub/pedido` crea `PedidoOnline (RECIBIDO)` + `PagoOnline (INICIADO)`; redirige a la pasarela. El **webhook** `/pub/webhooks/:gateway` confirma → `PagoOnline=PAGADO`. Efectivo contra entrega salta la pasarela.
5. **Inyección al POS**: aparece en **bandeja "Pedidos Online"** del PdV (con sonido + `Notificaciones`). Según config: **aceptación manual** (cajero revisa) o **automática**.
6. **Aceptar** → handler atómico: crea `Venta (ABIERTA)` + `VentaItem[]` (reusa `createVentaItem`) + `Delivery` (si aplica) + vincula `Pago/PagoDetalle` con la `FormaPago` online + imprime **comanda** a cocina. `PedidoOnline=ACEPTADO`.
7. Cocina marca **EN_PREPARACION → LISTO**; delivery **EN_CAMINO → ENTREGADO** (reusa estados de `Delivery`, repartidor propio = `entregadoPor`). Cada cambio **notifica al cliente** (push/WhatsApp) y actualiza su **página de tracking**.
8. Al concluir la venta → `procesarStockVenta` (stock automático existente) + **Factura SIFEN** opcional.
9. **Rechazo/cancelación** → `PedidoOnline=RECHAZADO`, dispara **reembolso** en el gateway (o marca no-cobro si era efectivo).

### 3.5 Storefront (nueva app Angular)

- Nuevo proyecto en el workspace: **`projects/storefront`** (mobile-first PWA, service worker, instalable). Reusa `@frc/shared-core` (entities/enums/pipes), pero con **su propio `PublicDataService`** que pega a `/pub/*` (NO el `RepositoryIpcService` admin).
- Branding por tienda (tema dinámico desde `TiendaOnlineConfig`).
- **QR de mesa**: misma PWA con `?mesa=N` → asocia el pedido a `PdvMesa`, permite "enviar a cocina" y propina/split.
- Regenerar el mapa canal-método solo para los endpoints públicos; **no** reusar `api-channel-map.generated.ts` completo (expone admin).

### 3.6 Pagos — adaptadores

Interfaz `PasarelaPago { crearIntento(), confirmarWebhook(), reembolsar() }` con adapters:
- **Bancard vPOS 2.0** (tarjetas, la más usada en PY).
- **Pagopar** (agregador local: tarjeta + transferencia + billeteras + **pago en efectivo en bocas de cobranza**).
- **Mercado Pago** Checkout Pro (cobertura LatAm, wallet).
- **Efectivo contra entrega / contra retiro** (sin gateway).
Idempotencia por `transactionId`, conciliación contra `Pago`. Las liquidaciones de tarjeta online encajan con el patrón `AcreditacionPos` existente.

---

## 4. Plan de desarrollo por fases

> Convención del proyecto: `synchronize:false` → cada entidad nueva exige **migration generada** (SQLite + Postgres) y registro en `database.config.ts`; tocar backend = reiniciar app.

### Fase 0 — Fundaciones de seguridad (pre-requisito, no negociable)
Exponer a internet obliga a cerrar deuda de seguridad primero.
- Hash de passwords (**argon2/bcrypt**) para `Usuario` + migración de los existentes.
- `JWT_SECRET` en env, rotación, `audience` separada staff/cliente.
- **Namespace público `/pub/*`** con whitelist, `@fastify/rate-limit`, CORS, verificación de firma en webhooks.
- Activar TLS (Cloudflare Tunnel para Fase A).
- **Entregable:** server que puede exponerse a internet sin filtrar handlers admin.

### Fase 1 — Menú publicable + disponibilidad por canal
- Flags `disponibleOnline` / `pausadoOnline` en `Producto`/`Presentacion`; `TipoPrecio=ONLINE`.
- **Reactivar imágenes** de producto (subida + `app://`/`/pub/files`).
- Endpoint `GET /pub/menu` (snapshot: categorías → productos → modificadores → precio online → disponibilidad).
- Backoffice: pantalla "Carta Online" (marcar disponibles, precio online, imágenes, **86ing en vivo**).
- **Entregable:** carta online consultable por HTTP, administrable desde el SaaS.

### Fase 2 — Config de tienda online + auth de cliente
- Entidad `TiendaOnlineConfig` + pantalla de configuración (horarios, tipos de pedido, prep time, mínimos, throttling, branding).
- `CuentaCliente` + `CodigoOtp` + flujo **teléfono + OTP** (SMS/WhatsApp), JWT cliente, refresh.
- **Entregable:** un cliente puede registrarse/loguearse; el local configura su tienda.

### Fase 3 — Storefront PWA (MVP pedido pickup, pago efectivo)
- `projects/storefront`: menú, carrito con modificadores, checkout, cuenta, historial.
- Tipo **PICKUP** + **efectivo contra retiro** (sin gateway todavía).
- `PedidoOnline` + `PedidoOnlineItem` + `POST /pub/pedido`.
- **Entregable:** demo real de pedido de punta a punta sin pagos online.

### Fase 4 — Bandeja de pedidos en el PdV (inyección al POS)
- Panel "Pedidos Online" en PdV: lista en vivo (auto-refresh/SSE), sonido, `Notificaciones`.
- Handler atómico **aceptar** (crea `Venta`+items+comanda/print) y **rechazar**.
- Aceptación manual/automática según config; countdown de prep time.
- **Entregable:** el pedido online se procesa como venta real en el SaaS.

### Fase 5 — Pagos online
- Interfaz `PasarelaPago` + adapter **Bancard** (o Pagopar/Mercado Pago según prioridad comercial).
- `PagoOnline`, `POST /pub/pedido/pagar`, webhook idempotente, conciliación con `Pago`, reembolso en rechazo.
- **Entregable:** cobro online real, conciliado en caja.

### Fase 6 — Delivery + tracking
- `ZonaDelivery` (por drive-time/polígono, tarifa, mínimo), auto-asignación por dirección.
- Reusar estados de `Delivery`; **página de tracking** para el cliente; notificaciones por estado (WhatsApp/push).
- Repartidores propios (`entregadoPor`). Integración Uber Direct/DoorDash = opcional futuro.
- **Entregable:** delivery propio completo con seguimiento.

### Fase 7 — Diferenciadores
- **Loyalty** por puntos, **favoritos**, **re-order 1-click** (Owner reporta 2× reorder).
- **QR de mesa** (dine-in): misma PWA con `?mesa=N`, split bill, propina.
- **WhatsApp** como canal de pedido/estado (Twilio/WhatsApp Cloud API).
- **Facturación SIFEN** automática del pedido online.
- **Scheduling** de pedidos futuros + **throttling** en horas pico.

### Fase 8 — Edge cloud (escala multi-local, evolución de A→B)
- `MenuPublicado` snapshot empujado al edge; **cola durable de pedidos** (resiliencia si el POS está offline); dominio por local; panel SaaS multi-tenant.
- **Entregable:** storefront desacoplado del PC local, listo para muchos locales.

---

## 5. Decisiones abiertas (para definir con Gabriel)

1. **Hosting:** ¿arrancamos con túnel sobre el server local (rápido) o vamos directo al edge cloud? *(Recomendado: túnel para MVP.)*
2. **Pasarela de pago prioritaria en PY:** ¿Bancard, Pagopar o Mercado Pago primero?
3. **Alcance del MVP:** ¿solo **pickup** primero, o pickup + delivery desde el arranque?
4. **QR de mesa dine-in:** ¿entra en el MVP o es fase posterior?
5. **Auth de cliente:** ¿solo OTP por teléfono/WhatsApp, o también email+password?
6. **Multi-local desde el día 1**, o un solo local y generalizar después.

---

## 6. Riesgos y notas

- **Seguridad primero:** hoy los passwords son texto plano y el RPC expone todos los handlers — **no** exponer nada a internet hasta cerrar Fase 0.
- **Imágenes**: el pipeline `app://producto-images` está "parcialmente desactivado"; es bloqueante para un storefront y hay que rehabilitarlo bien (incluyendo el proxy `/pub/files` estilo mobile).
- **Consistencia de precio/stock**: definir si el precio online se congela al momento del pedido (snapshot en `PedidoOnlineItem`) — sí, para evitar disputas.
- **Caja**: decidir a qué `Caja` entra la venta online (¿una caja virtual "ONLINE" por dispositivo/canal?). Encaja con el `dispositivo_id` de F5.
- **Facturación legal**: pedidos con RUC requieren SIFEN; el dominio existe pero hay que cablearlo al flujo online.
```
