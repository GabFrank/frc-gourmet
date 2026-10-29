# PLAN — Tienda online (storefront `/tienda/`): seguridad, punta a punta, login y pago uPay

Estado: borrador para auditoría · 29/10/2026 · Autor: CEO FRC Gourmet
Base: análisis completo del 29/10 (backend + storefront + producción + E2E en copia de Don Franco).

## 1. Contexto

La tienda ya existe y **está publicada en internet** (`app.frc-gourmet.com/tienda/`, vía túnel Cloudflare),
activa, abierta y con **aceptación automática** (el pedido entra a venta y cocina sin intervención).

Verificado el 29/10:
- E2E en copia (Postgres de Don Franco, tamaño celular): carta → hamburguesa con adicional y preferencia →
  pizza mitad y mitad + borde (₲100.000, MAYOR_PRECIO) → carrito (persiste al recargar) → login OTP →
  checkout retiro → `PO-000002` → venta 8154 ABIERTA con 2 sabores y 1 adicional; total ₲110.000 = servidor.
- Producción (solo lectura): 3 productos publicados, 0 zonas de delivery, sin `GOOGLE_CLIENT_ID`,
  carta con fotos OK, carrito sin foto y barra «Continuar» flotando a media pantalla.

### Problemas (por severidad)
**Críticos (seguridad, hoy en producción)**
- C1. Sin `WHATSAPP_CLOUD_TOKEN`, `auth.otp.request` devuelve `devCodigo` (`pedidos-online-auth.handler.ts:128`)
  y la pantalla lo muestra: cualquiera entra con cualquier teléfono. Con aceptación automática, un pedido
  falso va directo a cocina. *Hay que confirmar si producción tiene las variables (no verificado).*
- C2. MESA_QR: detrás de `cloudflared` la IP vista es `127.0.0.1`, que está en los rangos LAN por defecto
  (`ip-lan.util.ts:92`) → el control «solo desde el wifi del local» no funciona.
- C3. Rate-limit por IP: detrás del túnel todos los clientes comparten cupo (DoS fácil y anti fuerza bruta inútil).

**Altos**
- A1. Toma de cuenta email→Google: alguien registra el email de otro con contraseña; cuando la víctima entra
  con Google cae en esa cuenta y el atacante conserva acceso (`auth.handler.ts:312`). `perfil.update` cambia
  email sin verificación; cambiar contraseña no revoca refresh tokens; `me/perfil/mis` no miran `cuenta.activo`.
- A2. `pedido.crear` sin idempotencia (doble toque = dos pedidos); `metodoPago`, `canalOrigen`, `fechaProgramada`
  sin validar; `cantidad`, nº de ítems y textos sin tope.
- A3. Delivery sin zonas cargadas → envío ₲0 y se acepta cualquier dirección (`pedidos.handler.ts:388`). Hoy en prod.

**Medios (experiencia, punta a punta)**
- M1. El carrito guarda el precio visto y nunca lo revalida; el servidor cobra su precio y el cliente no se entera.
- M2. Errores crudos al cliente (`producto_no_disponible:…`, «Http failure response…»).
- M3. Visual: carrito sin foto; barra «Continuar» no queda abajo; montos sin `₲` en carrito/checkout/mis pedidos;
  `.sel` sin estilo; íconos mezclados (emoji/«←»); tipo «PICKUP/DELIVERY» en crudo.
- M4. Google: el botón se arma una sola vez en `ngAfterViewInit`; si la config llega después nunca aparece.
- M5. En la prueba, el nombre cargado en «Completá tus datos» no quedó guardado (`nombre_cliente` NULL). Reproducir.
- M6. «Mis pedidos» no muestra adicionales/notas; el invitado de mesa no puede seguir su pedido; el motivo de
  rechazo no le llega al cliente.
- M7. Escritorio: la bandeja de pedidos online no muestra personalización, referencia ni pago, y su «aceptar»
  no pasa `cajaId` ni muestra `errorMaterializacion`. Pantalla «Config Tienda Online» pide VENTAS_PDV pero el
  handler exige PEDIDOS_ONLINE_CONFIGURAR.

**Faltantes funcionales**
- F-a. Pago online: solo el enum `BANCARD/UPAY/PAGOPAR`; nada implementado. Decisión «solo efectivo» de julio
  queda reemplazada por pedido del propietario (29/10): pago online con **uPay**.
- F-b. Credenciales (WhatsApp Cloud, Google) solo por variables de entorno: en la PC Windows del local no hay
  forma práctica de cargarlas.
- F-c. Sin tests del storefront.

Decisión del propietario (29/10): la tienda va **siempre en tema claro** (ya lo es). Pruebas de pantalla de la
tienda en claro.

## 2. Alcance y fases

Rama única `feat/tienda-online` desde develop; cada fase es un commit/PR propio para poder mergear F1 antes.
Propuesta de merge (decide el propietario): **F1 sola y cuanto antes** (cierra agujeros que ya están en
internet); F2+F3 juntas; F4 cuando uPay esté probado en su sandbox.

### F1 — Seguridad (urgente)
1. **OTP sin fuga:** `devCodigo` solo si `FRC_OTP_DEV=1` **y** la app no está empaquetada (`!app.isPackaged`).
   Si no hay proveedor real, `tienda.config` devuelve `otpWhatsappDisponible:false`, `auth.otp.request` responde
   `otp_no_disponible` y el login oculta la pestaña Teléfono (queda Email/Google).
2. **IP real detrás del túnel:** nueva util `clientIp(req)`: si el socket es loopback **y** viene
   `cf-connecting-ip` (o `x-forwarded-for` cuando el socket es loopback), esa es la IP del cliente; si no, `req.ip`.
   Una petición con `cf-connecting-ip`/`cf-ray` **nunca** se considera LAN para MESA_QR. Rate-limit `/pub/*`
   usa `clientIp` como `keyGenerator`. No se confía en esas cabeceras si el socket no es loopback.
3. **Cuentas:**
   - Login Google sobre cuenta existente por email **no verificado** con contraseña: se marca
     `emailVerificado=true`, se borra el hash de contraseña y se revocan todos los refresh tokens (el que la
     registró pierde acceso).
   - `perfil.update`: cambiar email → `emailVerificado=false`; contraseña nueva mínimo 6; cambio de contraseña
     revoca los demás refresh tokens. `me`, `perfil.update`, `pedido.mis/estado` rechazan cuentas inactivas.
   - Bloqueo de `auth.login` tras 5 fallos por cuenta durante 15 min.
   - OTP: tope de 10 códigos por teléfono por día y 30 por IP por hora.
4. **Pedido:** `idempotencyKey` (uuid del cliente, columna única nullable) → reintento devuelve el mismo pedido.
   Validar `metodoPago` y `canalOrigen` contra enum (canal lo decide el servidor: WEB o MESA_QR),
   `fechaProgramada` ignorada (no hay UI), `cantidad` 1–50, ≤ 40 ítems, textos recortados a su largo de columna.
5. **Delivery sin zonas:** si no hay zonas activas con polígono, `permiteDelivery` efectivo = false en
   `tienda.config` y `pedido.crear` DELIVERY → `delivery_no_disponible`.
- Migración: `pedidos_online.idempotency_key varchar(64) unique null`, índice en `cuenta_cliente_id`,
  `cuentas_cliente.login_fallidos int default 0`, `bloqueado_hasta timestamp null`. Reversible (`down`).

### F2 — Punta a punta (carta → carrito → pedido → local)
1. Revalidar carrito: al abrir carrito/checkout se pide `menu.get` y se recalcula cada línea; si cambió precio o
   ya no está disponible, aviso claro y se actualiza/quita la línea antes de confirmar.
2. Mapa de errores a mensajes en español (tabla única en `public-api.service`).
3. Visual (tema claro): foto en carrito, barra de acción fija abajo (safe-area), `₲` en todos los montos,
   estilo `.sel`, íconos `sf-icon` en lugar de emoji, «Retiro/Delivery» legible.
4. Google: renderizar el botón cuando llegue la config (efecto reactivo), contenedor fuera del `*ngIf`.
5. Reproducir y corregir M5 (nombre de perfil).
6. «Mis pedidos»: adicionales, sabores, notas y motivo de rechazo. Invitado de mesa: `pedido.estado` por
   `token` de seguimiento (devuelto al crear, guardado en sessionStorage).
7. Escritorio: bandeja muestra personalización, referencia, ubicación y pago; «aceptar» pasa `cajaId` y muestra
   `errorMaterializacion`. Permiso de la pantalla de config alineado a PEDIDOS_ONLINE_CONFIGURAR.

### F3 — Login WhatsApp y Google con credenciales desde la app
1. En «Config Tienda Online» (escritorio): sección «Ingreso de clientes»:
   - WhatsApp Cloud API: Phone Number ID, plantilla, idioma y token. El token se guarda cifrado con la clave
     de la máquina (keytar; respaldo archivo `.local` como el JWT) — nunca vuelve al cliente ni a la API RPC.
   - Google: Client ID (público).
   - Botón «Probar envío» (manda un código a un número que se ingresa) y estado de cada proveedor.
2. Prioridad: valores de la pantalla > variables de entorno.
3. Prerrequisitos del propietario (fuera del código): cuenta WhatsApp Business en Meta con número propio y
   plantilla de autenticación aprobada; Client ID OAuth web de Google con origen `https://app.frc-gourmet.com`.

### F4 — Pago online con uPay (requiere la documentación de la API de uPay)
Diseño independiente de la pasarela (`electron/services/pagos-online/`), primer proveedor uPay:
1. Pedido con `metodoPago=UPAY` se crea en estado `PENDIENTE_PAGO` (nuevo), **no** se materializa ni va a
   cocina. Se crea la orden en uPay y el cliente va a su checkout (redirect/iframe según doc).
2. Confirmación **solo del lado servidor**: webhook firmado de uPay + consulta de estado a la API de uPay
   antes de dar por pagado (nunca por el retorno del navegador). Idempotente por id de transacción.
3. Pagado → `estadoPago=PAGADO`, sigue el flujo normal (materializa; si aceptación automática, a cocina). La
   venta queda cobrada con forma de pago «uPay online» y entra a acreditaciones POS (#320) con su regla.
4. No pagado en 15 min → `EXPIRADO`, no se cocina. Rechazo del local con pago hecho → queda marcado
   «REEMBOLSO PENDIENTE» para hacerlo a mano en uPay (sin reembolso automático en esta fase).
5. Interruptor `pagoOnlineActivo` (apagado por defecto) y efectivo sigue disponible.
6. Credenciales uPay en la misma sección cifrada de F3.
- Migración: `pedidos_online.estado_pago`, `pago_proveedor`, `pago_referencia`, `pago_payload_json`,
  `pagado_en`; tabla `pagos_online_eventos` (auditoría de webhooks). Reversible.

### Fuera de alcance (propuesta para después)
Avisos por WhatsApp al cliente del estado del pedido, cancelar por el cliente, vincular cuenta web con Cliente/RUC
para factura, pantalla de horarios, curaduría de carta y fotos (operativo, no código).

## 3. Pruebas
- Backend (ts-node, SQLite y Postgres): ampliar `test:pedidos-online`, `test:mesa-qr`,
  `test:zona-delivery-online` + nuevo `test:tienda-seguridad` (OTP sin devCodigo empaquetado, IP detrás de
  túnel, toma de cuenta, idempotencia, topes, delivery sin zonas) y `test:pagos-online` (webhook firmado,
  doble webhook, expiración, monto distinto al pedido → rechazo).
- E2E Playwright en la copia de Don Franco, **tema claro**, tamaño celular y escritorio (bandeja), con capturas
  al propietario: carta → carrito → login → retiro y delivery con zona → mis pedidos → bandeja → aceptar.
- F4 toca cobro: probar **pago real en el sandbox de uPay** y el cobro/factura de la venta resultante en la copia
  antes del merge; si no hay sandbox, se dice y no se mergea.
- Gates: `build`, `check`, `test:all` (sin fallas nuevas sobre la línea base de develop), CI 4/4.

## 4. Riesgos y vuelta atrás
- F1 puede dejar sin login por teléfono si prod no tiene WhatsApp configurado: es el comportamiento buscado
  (quedan Email y, con F3, Google). Se avisa al propietario antes del merge.
- Cambio de IP real puede afectar MESA_QR en el local si el wifi pasa por el túnel: el local accede por LAN
  directa (sin cabeceras de Cloudflare), se prueba en la copia con y sin cabeceras.
- Vuelta atrás: revert del squash-commit de cada fase; migraciones con `down`; F4 detrás de
  `pagoOnlineActivo`; F3 cae a variables de entorno si la tabla de credenciales está vacía.
- Don Franco está en canal alpha: cada merge a develop llega solo al local. No se mergea sin OK.

## 5. Pendientes del propietario
1. OK del plan y de la estrategia de merge (F1 sola primero).
2. Documentación de la API de uPay (y acceso a su sandbox) para F4.
3. Cuenta WhatsApp Business (Meta) y Client ID de Google para F3.
4. Zonas de delivery y carta (productos publicados y fotos) para salir al público.
