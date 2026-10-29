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

## 2. Contención inmediata (F0, hoy, sin código ni merge)
Mientras F1 no esté en producción, el riesgo C1 está abierto. Pasos, en orden, con OK del propietario:
1. **Verificar C1 en producción:** pedir un código (`auth.otp.request`) al número del propietario por
   `/pub/rpc`. Si la respuesta trae `devCodigo` → C1 confirmado; si llega un WhatsApp de Meta → C1 no aplica.
   Es la única forma de saber si prod tiene `WHATSAPP_CLOUD_TOKEN`; no cambia datos salvo un registro de OTP.
2. **Si C1 está confirmado** (o si no se puede verificar hoy): en el escritorio de Don Franco,
   «Config Tienda Online» → **apagar «Aceptación automática»** (los pedidos quedan en la bandeja y el
   personal decide) **o apagar la tienda** (`activa=false`). Recomendación: apagar la tienda; en toda su
   historia tuvo 1 pedido (de prueba), así que no se pierde venta. Lo hace el propietario desde la app
   (mi usuario no tiene PEDIDOS_ONLINE_CONFIGURAR, y está bien). Backup JSON de la config antes.
3. Revisar en la bandeja de pedidos online si hubo pedidos web no reconocidos desde que se publicó.
4. La tienda se vuelve a prender recién con F1 instalada en Don Franco y verificada (punto 1 repetido:
   sin `devCodigo`).

## 3. Alcance y fases

Rama única `bot/ceo-frc-gourmet/feat-tienda-online` desde develop; cada fase es un commit/PR propio para poder mergear F1 antes.
Propuesta de merge (decide el propietario): **F1 sola y cuanto antes** (cierra agujeros que ya están en
internet); F2+F3 juntas; F4 cuando uPay esté probado en su sandbox.

### F1 — Seguridad (urgente)
1. **OTP sin fuga:** `devCodigo` solo si `FRC_OTP_DEV=1` **y** la app no está empaquetada (`!app.isPackaged`).
   Si no hay proveedor real, `tienda.config` devuelve `otpWhatsappDisponible:false`, `auth.otp.request` responde
   `otp_no_disponible` y el login oculta la pestaña Teléfono (queda Email/Google).
2. **IP real detrás del túnel:** nueva util `clientIp(req)`: si el socket es loopback **y** viene
   `cf-connecting-ip` (o `x-forwarded-for` cuando el socket es loopback), esa es la IP del cliente; si no, `req.ip`.
   Regla exacta: (a) socket no loopback → `req.socket.remoteAddress`, se ignoran todas las cabeceras;
   (b) socket loopback **con** `cf-connecting-ip` → ese valor (lo pone Cloudflare y reemplaza el que mande el
   cliente); (c) socket loopback sin `cf-connecting-ip` → loopback (acceso local). **`X-Forwarded-For` no se usa
   nunca** (se puede forjar y Cloudflare lo encadena). `trustProxy` de Fastify queda apagado para `/pub`.
   Cualquier petición con `cf-connecting-ip` o `cf-ray` **nunca** es LAN para MESA_QR, aunque el valor sea una IP
   privada. Rate-limit `/pub/*` usa `clientIp` como `keyGenerator`. Tests con cabeceras forjadas
   (XFF=192.168.0.10 desde fuera, cf-connecting-ip privado, ambas juntas).
3. **Cuentas:**
   - Login Google sobre cuenta existente por email **no verificado** con contraseña: se marca
     `emailVerificado=true`, se borra el hash de contraseña y se revocan todos los refresh tokens (el que la
     registró pierde acceso).
   - `perfil.update`: cambiar email → `emailVerificado=false`; contraseña nueva mínimo 6; cambio de contraseña
     revoca los demás refresh tokens. `me`, `perfil.update`, `pedido.mis/estado` rechazan cuentas inactivas.
   - Anti fuerza bruta de `auth.login` **por par cuenta+IP** (5 fallos → 15 min para esa IP en esa cuenta) más
     un tope por IP (20 fallos/hora en cualquier cuenta). Así un tercero no puede bloquear la cuenta de otro:
     solo se bloquea a sí mismo. Login por Google y por código de WhatsApp no se bloquean por esto.
   - OTP: tope de 10 códigos por teléfono por día, 30 por IP por hora y **tope global de 300/día** (configurable);
     al pasar el 80 % se avisa al staff por el WhatsApp de avisos y al llegar al tope se corta el envío.
4. **Pedido:** `idempotencyKey` (uuid v4 del cliente). Unicidad **compuesta** `(cuenta_cliente_id, idempotency_key)`;
   para invitado de mesa `(mesa_token, idempotency_key)`. Reintento del mismo dueño devuelve su pedido; una
   clave igual de otro dueño nunca devuelve datos ajenos (se trata como clave nueva).
   Validar `metodoPago` y `canalOrigen` contra enum (canal lo decide el servidor: WEB o MESA_QR),
   `fechaProgramada` ignorada (no hay UI), `cantidad` 1–50, ≤ 40 ítems, textos recortados a su largo de columna.
5. **Delivery sin zonas:** si no hay zonas activas con polígono, `permiteDelivery` efectivo = false en
   `tienda.config` y `pedido.crear` DELIVERY → `delivery_no_disponible`.
- Migración (solo agrega): `pedidos_online.idempotency_key varchar(64) null` + **dos índices únicos parciales** (`(cuenta_cliente_id, idempotency_key)
  WHERE cuenta_cliente_id IS NOT NULL` y `(mesa_token, idempotency_key) WHERE mesa_token IS NOT NULL`; ambos
  soportados igual en SQLite y Postgres, probados en los dos), índice en
  `cuenta_cliente_id`, tabla `auth_intentos_fallidos (cuenta_id, ip, fallidos, bloqueado_hasta)`. Sin borrar ni
  transformar datos existentes. `down` reversible (columnas nuevas vacías de valor histórico).

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

**F2 — decisiones cerradas tras la auditoría (29/10):**
- Token de seguimiento de mesa: migración nueva que solo agrega `pedidos_online.seguimiento_token_hash varchar(64) null`
  + índice. Se guarda el **SHA-256**, nunca el token en claro; el token (32 bytes aleatorios) se devuelve una sola
  vez al crear. `pedido.estado` por token devuelve solo ese pedido (estado, ítems, motivo de rechazo; sin teléfono
  ni dirección) y **vence** 24 h después de que el pedido llega a un estado final. Aplica el rate-limit de `/pub`.
  Pruebas: token de otro pedido, token inventado, token vencido, token de pedido de otra mesa.
- Caja al aceptar: verificado en `materializarPedidoOnlineEnVenta` (`ventas.handler.ts:261-299`): **nunca** crea
  venta sin caja (sin caja abierta → `no_hay_caja_abierta`; varias → `caja_ambigua_especificar_cajaId`). F2 solo
  muestra ese error al operador en lugar de tragarlo, y manda el `cajaId` de la caja abierta del usuario.
- Permiso de la pantalla de config: `PEDIDOS_ONLINE_CONFIGURAR` ya está en el rol GERENTE por seed
  (`seed-system.ts:488`) y ADMIN tiene todo; nadie que hoy pueda guardar la config pierde acceso.
- Servidor fuente de verdad: `pedido.crear` ignora precios del cliente y recalcula; la revalidación del carrito
  es solo para que el cliente vea el mismo número antes de confirmar. Se agrega test que manda un precio falso.
- Copia de pruebas: facturación electrónica en ambiente de pruebas o deshabilitada (se verifica la config antes de
  facturar), `FRC_OTP_DEV=1` y sin `WHATSAPP_CLOUD_TOKEN`, así no sale nada a clientes reales.
- Rollback más fino: dos commits dentro del PR (backend+escritorio / storefront visual). Orden: F1 se mergea antes
  que F2.

### F3 — Login WhatsApp y Google con credenciales desde la app
1. En «Config Tienda Online» (escritorio): sección «Ingreso de clientes»:
   - WhatsApp Cloud API: Phone Number ID, plantilla, idioma y token. El token se guarda en el almacén seguro
     del sistema operativo con `keytar` (Administrador de credenciales de Windows), el mismo camino que ya usan
     los secretos de Notificaciones y el JWT (`tienda-secrets.util.ts`); si no hay almacén seguro no se guarda
     en texto plano: la pantalla avisa y se siguen usando variables de entorno. Nunca vuelve al cliente ni a la
     API RPC (el handler devuelve solo «configurado sí/no»). *Implementado así en vez de `safeStorage`
     (29/10): reusa un camino probado y no agrega un cifrado propio.*
   - Los datos no secretos (Phone Number ID, plantilla, idioma, Client ID) van en 4 columnas nullable de
     `tienda_online_config` (migración aditiva `TiendaIngresoClientes`). La plantilla es de categoría
     Autenticación: el código va en el cuerpo y en el botón «Copiar código».
   - Google: Client ID (público).
   - Botón «Probar envío» (manda un código a un número que se ingresa) y estado de cada proveedor.
2. Prioridad: valores de la pantalla > variables de entorno.
3. Prerrequisitos del propietario (fuera del código): cuenta WhatsApp Business en Meta con número propio y
   plantilla de autenticación aprobada; Client ID OAuth web de Google con origen `https://app.frc-gourmet.com`.

### F4 — Pago online con uPay (plan reescrito 29/10 con la doc de uPay; OK aparte)
Fuente: guías de uPay bajadas el 29/10 (`/estacion/docs-upay/`): Online Payments API (checkout hospedado), QR
Manager y cajaPOS. **Alcance de F4: solo Online Payments API (tarjeta) en la tienda.** QR y caja uPOS sirven más
al punto de venta: van a un plan aparte (F5/PDV), porque el cliente que pide desde su celular no puede escanear un
QR que está en su propia pantalla.

**Lo que dice la API (piloto v1, solo ambiente STG documentado):**
- `POST /v1/payments/checkout-sessions` con `X-Api-Key` + `Idempotency-Key` (UUID v4); montos como string en
  PYG; `merchant.seller.{id,name,operationReferenceId}` (este último único: `duplicate_reference_id`);
  `checkout.successUrl/failureUrl`; `paymentMethod.types=["card"]`. Devuelve `sessionId`, `checkoutUrl`,
  `expiresAt` (2 h, fijo).
- `GET /v1/payments/checkout-sessions/{id}` → `open | complete | expired`; si `complete`, trae `paymentId`.
- `GET /v1/payments/{id}/status` → `SUCCEEDED/APPROVED|CAPTURED` es cobrado; `DECLINED`, `REJECTED`, `ERROR`,
  `FRAUD`, `EXPIRED`, `CANCELED` no. `POST /v1/payments/{id}/refund|cancel` existen.
- **No hay webhooks documentados para el checkout**: la confirmación es por consulta (polling) del servidor.

**Diseño** (`electron/services/pagos-online/`: interfaz `ProveedorPagoOnline` + `upay-checkout.provider.ts`; el
cliente HTTP va inyectado para poder probar con un uPay simulado):
1. **Config** (Config Tienda Online → nueva sección «Pago online», permiso PEDIDOS_ONLINE_CONFIGURAR):
   interruptor `pagoOnlineActivo` (apagado por defecto), ambiente/URL base (STG por defecto; la de producción la
   da uPay al certificar), `merchantId`, nombre del comercio y la **API Key cifrada con el mismo almacén seguro
   de F3** (no se vuelve a mostrar). Botón «Probar conexión» = un GET de sesión inexistente (espera 404, no 401).
   Si falta algo, la tienda no ofrece «Pagar con tarjeta» (el efectivo sigue igual).
2. **Crear pedido con `metodoPago=UPAY`** (solo PICKUP y DELIVERY; MESA_QR sigue en efectivo/caja): el servidor
   calcula el total como hoy (nunca el del navegador), guarda el pedido en estado nuevo **`PENDIENTE_PAGO`** (no
   aparece para aceptar, no se materializa, no va a cocina) y crea la sesión con
   `operationReferenceId = <numero>-<intento>`, `Idempotency-Key` = UUID guardado por intento (reintento de red =
   misma sesión), ítems del pedido como `order.items`, `successUrl/failureUrl =
   https://app.frc-gourmet.com/tienda/pago/<numero>`. Responde `checkoutUrl`; el storefront solo redirige si el
   host es de uPay (`*.upay.com` / `*.upay.com.py`).
3. **Confirmación solo del lado servidor**: (a) al volver a `/tienda/pago/<numero>` el storefront llama a
   `pedido.pago.verificar` y el servidor consulta a uPay; (b) un job cada 60 s revisa los `PENDIENTE_PAGO` (cada
   1 min los primeros 30 min, después cada 5 min hasta `expiresAt`). Se da por pagado **solo si** la sesión está
   `complete`, el payment está `SUCCEEDED` (APPROVED/CAPTURED), monto y moneda coinciden con el pedido y el
   `referenceId` es el del intento. Idempotente: índice único por `pago_id`; dos confirmaciones a la vez → una sola
   gana (update condicionado a `estado_pago='PENDIENTE'`).
4. **Pagado** → `estadoPago=PAGADO`, `pagadoEn`, el pedido pasa a `RECIBIDO` y sigue el flujo normal (aceptación
   automática si está activa). Al aceptar, la venta se materializa como hoy y **queda cobrada** con una forma de
   pago nueva «UPAY ONLINE» (sembrada, no seleccionable a mano en el PDV) por el monto pagado, en la caja de quien
   acepta; la factura sale por el flujo normal. La forma de pago entra a acreditaciones POS (#320) con una regla
   **desactivada** hasta tener el primer extracto de uPay.
5. **No pagado**: `DECLINED/REJECTED/ERROR/FRAUD` → `estadoPago=FALLIDO`, el cliente ve el motivo y puede
   reintentar (intento nuevo = sesión nueva) o cambiar a efectivo. Sesión `expired` → `EXPIRADO` y el pedido queda
   `CANCELADO` (nunca se cocinó). **Pago que llega tarde** (pedido ya cancelado o rechazado) → `REEMBOLSO_PENDIENTE`
   + aviso al personal por WhatsApp (evento de notificaciones de F1).
6. **Rechazo por el local de un pedido pagado**: se permite, con confirmación que dice «hay que devolver
   ₲X en uPay»; queda `REEMBOLSO_PENDIENTE` y se lista en la bandeja hasta marcarlo «Devuelto» (devolución
   manual en el portal de uPay; la devolución por API queda para después, cuando la probemos en STG).
7. **Bandeja de escritorio**: insignia «Pagado con tarjeta (uPay)» / «Esperando pago» / «Devolver», y la
   referencia de uPay. «Mis pedidos» del cliente muestra el estado del pago.
8. **Registro**: tabla `pagos_online_eventos` (pedido, intento, tipo, estado uPay, respuesta sin la API Key) para
   auditar cada consulta; logs nunca imprimen la clave.
9. **Ajustes tras la auditoría del plan (29/10)**:
   - **Estados de uPay**: pagado solo con `SUCCEEDED` + `APPROVED|CAPTURED`. `DECLINED/REJECTED/ERROR/FRAUD/
     CANCELED/EXPIRED` del payment → `FALLIDO`. Cualquier otro (`CREATED`, `PENDING/AUTHORIZED`, desconocido,
     error de red o 5xx) → sigue `PENDIENTE_PAGO`, se registra en `pagos_online_eventos` y se vuelve a consultar;
     **nunca** se marca pagado ni fallido por un estado que no está en esta lista.
   - **Dónde corre**: el job vive en el proceso principal del servidor de Gourmet (el mismo que atiende la tienda
     en app.frc-gourmet.com). Si el servidor está cerrado, la tienda tampoco toma pedidos; al volver a abrir, el job
     revisa primero todos los `PENDIENTE_PAGO` atrasados. Antes de pasar a `EXPIRADO` se hace **una última
     consulta** a uPay; si aparece pagado, se confirma.
   - **Caja con aceptación automática**: el pedido pagado se acepta con el usuario configurado para la aceptación
     automática y su caja abierta (lo mismo que hoy con efectivo). Si no hay caja abierta o la materialización falla,
     el pedido queda `ACEPTADO` con `errorMaterializacion` (F2), **el pago queda `PAGADO`** y se avisa al personal por
     WhatsApp; al abrir caja, «Reintentar» lo materializa cobrado. Un pago nunca se pierde por falta de caja.
   - **Pagado sin aceptar**: si un pedido pagado no se acepta en 20 min (configurable), avisa al personal; si se
     rechaza o vence, `REEMBOLSO_PENDIENTE`.
   - **Aviso al cliente**: con pedido pagado rechazado o pago tardío, «Mis pedidos» muestra «Te devolvemos ₲X a tu
     tarjeta; puede tardar hasta lo que indique tu banco» y, si el WhatsApp de F3 está configurado, se le manda ese
     mismo texto.
   - **Apagar el interruptor** solo deja de ofrecer «Pagar con tarjeta» a pedidos nuevos: el job y la verificación
     siguen hasta resolver todo `PENDIENTE_PAGO` y los pagos tardíos. Si hubo pagos reales, la vuelta atrás de
     esquema no es el `down` sino un revert del código con las columnas intactas (las columnas nuevas no molestan).
   - **Endpoint público** `pedido.pago.verificar`: exige la sesión del cliente dueño del pedido (o el token de
     seguimiento), no el número; tope 1 consulta a uPay cada 10 s por pedido (si no, devuelve el último estado
     guardado) y el límite por IP de F1.
   - **Redirección**: solo `https:` y host igual a `upay.com`/`upay.com.py` o terminado en `.upay.com` /
     `.upay.com.py` (sufijo exacto con punto: `evilupay.com` no pasa).
- **Migración (solo agrega)**: `pedidos_online.estado_pago`, `pago_proveedor`, `pago_intento`,
  `pago_sesion_id`, `pago_id` (único parcial), `pago_monto`, `pago_expira_en`, `pagado_en`; tabla
  `pagos_online_eventos`; forma de pago «UPAY ONLINE». `estado` es varchar: `PENDIENTE_PAGO` no requiere cambio de
  tipo. **El `down` aborta si hay algún pago registrado**; la vuelta atrás de F4 es apagar `pagoOnlineActivo`.
- **Pruebas F4**: `test:pagos-online` (SQLite y Postgres) contra un uPay simulado (servidor HTTP local con las
  respuestas de la doc): sesión creada, reintento con la misma Idempotency-Key, complete+SUCCEEDED, DECLINED,
  expired, monto distinto → no se paga, referencia ajena → no se paga, doble confirmación concurrente → un solo
  pago, pago tarde → REEMBOLSO_PENDIENTE, 401 de uPay → error claro sin crear pedido cobrable. E2E en la copia
  (tienda en tema claro, celular) con el checkout simulado, y **cobro + factura de la venta resultante en la
  copia** (regla alpha.159). **Antes del merge, un pago real en el STG de uPay** con las claves de prueba; si no
  llegan, F4 queda en borrador y no se mergea (se le avisa al propietario).
- **Riesgos**: (1) la API es piloto v1 y solo hay STG documentado → URL base configurable y certificación con uPay
  antes de activar en producción; (2) sin webhooks, un pago puede verse con hasta 1–5 min de demora → el cliente
  ve «confirmando pago» y el job lo resuelve; (3) toca cobro → venta cobrada automática probada con factura en la
  copia; (4) Don Franco en canal alpha → `pagoOnlineActivo` apagado por defecto: el merge no cambia nada en el
  local hasta que el propietario lo active con las claves de producción.
- **Del propietario**: claves STG (API Key + merchantId) de integraciones@upay.com.py; después, certificación y
  claves de producción; la cuenta donde acredita uPay (para la regla de acreditaciones).

### Fuera de alcance (propuesta para después)
Avisos por WhatsApp al cliente del estado del pedido, cancelar por el cliente, vincular cuenta web con Cliente/RUC
para factura, pantalla de horarios, curaduría de carta y fotos (operativo, no código).

## 4. Pruebas
- Backend (ts-node, SQLite y Postgres): ampliar `test:pedidos-online`, `test:mesa-qr`,
  `test:zona-delivery-online` + nuevo `test:tienda-seguridad` (OTP sin devCodigo empaquetado, IP detrás de
  túnel, toma de cuenta, idempotencia, topes, delivery sin zonas) y `test:pagos-online` (webhook firmado,
  doble webhook, expiración, monto distinto al pedido → rechazo).
- E2E Playwright en la copia de Don Franco, **tema claro**, tamaño celular y escritorio (bandeja), con capturas
  al propietario: carta → carrito → login → retiro y delivery con zona → mis pedidos → bandeja → aceptar.
- F4 toca cobro: probar **pago real en el sandbox de uPay** y el cobro/factura de la venta resultante en la copia
  antes del merge; si no hay sandbox, se dice y no se mergea.
- Gates: `build`, `check`, `test:all` (sin fallas nuevas sobre la línea base de develop), CI 4/4.

## 5. Riesgos y vuelta atrás
- Si F0 confirma que prod no tiene WhatsApp, F1 quita el login por teléfono hasta cargar las credenciales (F3):
  es intencional (hoy ese login es inseguro); quedan Email y Google. Si F0 muestra que sí tiene WhatsApp, F1 no
  cambia nada para el cliente. Se avisa al propietario antes del merge con el resultado de F0.
- **Migraciones sobre la base real:** antes de cada merge se confirma que Don Franco tiene backup automático
  reciente y se pide un backup manual; las migraciones solo agregan columnas/tablas (no tocan filas); después de
  que la alpha se instala se verifica por la API que la tienda responde (`tienda.config`, `menu.get`) y que el
  pedido de prueba no trae `devCodigo`. Un pedido de prueba real en prod solo con OK del propietario.
- Cambio de IP real puede afectar MESA_QR en el local si el wifi pasa por el túnel: el local accede por LAN
  directa (sin cabeceras de Cloudflare), se prueba en la copia con y sin cabeceras.
- Vuelta atrás: revert del squash-commit de cada fase. **Revertir F1 reabre C1/C2/A1: antes (o a la vez) se
  vuelve a apagar la tienda (F0).** Anti fuerza bruta distribuido contra una cuenta solo queda acotado por el
  tope por IP: compromiso aceptado y documentado. migraciones con `down`; F4 detrás de
  `pagoOnlineActivo`; F3 cae a variables de entorno si la tabla de credenciales está vacía.
- Don Franco está en canal alpha: cada merge a develop llega solo al local. No se mergea sin OK.

## 6. Pendientes del propietario
0. OK para F0 (verificar con un código a su número y, si se confirma, apagar la tienda desde la app).
1. OK del plan (F1–F3) y de la estrategia de merge (F1 sola primero).
2. Claves STG de uPay (API Key + merchantId) para probar F4; certificación y claves de producción para activarlo.
3. Cuenta WhatsApp Business (Meta) y Client ID de Google para F3.
4. Zonas de delivery y carta (productos publicados y fotos) para salir al público.
