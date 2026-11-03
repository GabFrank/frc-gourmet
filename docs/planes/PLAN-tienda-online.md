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

### F4 — Pago online con uPay (FUERA del alcance que se aprueba ahora)
Diseño preliminar; **no se aprueba ni implementa hasta tener la doc de la API de uPay y su sandbox**. Con eso se
reescribe esta sección, se re-audita y se pide un OK aparte.
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
- Migración (solo agrega): `pedidos_online.estado_pago`, `pago_proveedor`, `pago_referencia`, `pago_payload_json`,
  `pagado_en`; tabla `pagos_online_eventos`. **El `down` no borra datos de pago**: si hubo algún pago registrado,
  el `down` aborta con error; la vuelta atrás de F4 es apagar `pagoOnlineActivo` (los datos quedan).

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
2. Documentación de la API de uPay (y acceso a su sandbox) para F4.
3. Cuenta WhatsApp Business (Meta) y Client ID de Google para F3.
4. Zonas de delivery y carta (productos publicados y fotos) para salir al público.
