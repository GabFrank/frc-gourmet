# PLAN tienda online — varios proveedores de pago a la vez + IC Pay (Pix)

Rama: `bot/ceo-frc-gourmet/feat-tienda-pagos-multi`, sale de `feat-tienda-f8b-credito` (punta de la
cadena). Nada se mergea sin el OK del propietario. Toca cobro: **antes del merge se cobra de
verdad** contra el sandbox de cada proveedor (regla de la cadena).

Base: el contrato de proveedores de `PLAN-tienda-pagos-proveedores.md`
(`electron/services/pagos-online/proveedores/`). Este plan **no** cambia el ciclo del pago
(PENDIENTE → PAGADO / FALLIDO / EXPIRADO, pago tardío, decisión al cancelar, cola DEVOLVER, avisos,
eventos): suma lo que falta para tener varios proveedores prendidos y escribe el de IC Pay.

## Por qué

- Bancard y dinelco se aceptan los dos: **hay bancos con exclusividad** con una u otra procesadora,
  así que el cliente elige con cuál paga (decisión del propietario, 2026-11-09).
- IC Pay cobra **Pix de Brasil**: clientes brasileños pagan desde su banco con el QR o el
  «copia e cola». Las claves de sandbox ya están (Bancard y dinelco todavía no).
- dinelco Checkout queda para cuando lleguen sus claves (solicitud enviada 2026-11-09); entra en
  esta misma rama como fase 4.

## Fuente de IC Pay

API «IC Investments API» (IC Investments S.A.). Especificación OpenAPI 3.0 completa publicada en
`https://www.developer.ic.com.py/openapi.json` (50 rutas). Guías en
`https://www.developer.ic.com.py/docs/`. Lo que sigue sale de esa especificación (leída
2026-11-09); lo que no figura está marcado **«no documentado»** y va a la lista de preguntas a IC.

| Tema | Qué dice la API |
|---|---|
| Servidor | Staging `https://stage.api.ic.com.py` (el propietario tiene la URL de sandbox). Producción: no publicada |
| Autenticación | Dos cabeceras en cada llamada: `x-api-key` y `Authorization: Bearer <accessToken>`. El token sale de `POST /api/v1/auth/admin/sign-in` con `{ email, password }` → `{ accessToken, idToken, refreshToken, expiresIn: 3600 (s), tokenType }`. Se renueva con `POST /api/v1/auth/admin/refresh-session` `{ refreshToken }` |
| MFA | El sign-in puede devolver un desafío (`challengeName`: `SOFTWARE_TOKEN_MFA`, `EMAIL_OTP`, `NEW_PASSWORD_REQUIRED`…) en vez de tokens. **Un servidor no puede contestar un MFA**: el usuario de la tienda tiene que ser uno sin MFA, con la contraseña definitiva ya puesta |
| Roles | `store`, `branch`, `supervisor`. Crear órdenes: solo `store` o `branch` |
| Cobrar | `POST /api/v1/payment/order` con `{ amount: "<USD con 2 decimales>", currency: "BRL" }` y cabecera `Idempotency-Key` (1-255: letras, números, `_ - : .`). **El monto va siempre en dólares**; IC lo convierte a reales con su cotización |
| Respuesta | `201` con `id` (uuid), `status`, `amount` (USD), `totalAmount` (lo que paga el cliente en BRL), `quote`, `qrData { type: 'PIX_DYNAMIC', payload, expiresAt, fid }`, `createdAt`. Cabecera `Idempotent-Replayed` dice si fue reintento |
| Errores de idempotencia | `409` ya se está creando con esa clave; `422` misma clave con otro cuerpo; `400` clave inválida |
| Consultar | `GET /api/v1/payment/order/{id}` → mismo objeto, más `completedAt` y `providerMetadata { payerName, taxId }` (datos del pagador) |
| Estados | `pending`, `completed`, `cancelled`, `underpaid`, `under_dispute`, `refunded`, `expired`, `duplicated` |
| Cotización | `GET /api/v1/quote?fromCurrency=&toCurrency=&context=payment_order` → `baseExchangeRate` (USD → moneda), `targetExchangeRate` (moneda → USD), `quotationId`, `expiresAt`. Acepta `PYG` |
| Avisos (webhook) | `POST /api/v1/webhook/subscription` existe, firmado con HMAC (`secret` se muestra una vez), **pero sus eventos son solo de payouts** (`payout.created/in_progress/paid/rejected`). **No hay aviso de órdenes de pago**: la confirmación es por consulta |
| Devolución | **No hay endpoint**. Existe el estado `refunded` y los reclamos (`/claim`), pero devolver no está en la API |
| Saldo | La orden cobrada acredita en la cuenta del comercio en IC (`GET /api/v1/account/me`, moneda de la cuenta) |
| Nuestra referencia | **No se puede mandar** (el cuerpo solo tiene `amount` y `currency`). Se correlaciona por el `id` de la orden, que guardamos como sesión del intento |

## Diseño

### 1. Varios proveedores prendidos a la vez (común a IC Pay, Bancard y dinelco)

Hoy hay **un** proveedor activo (`tienda_online_config.pago_proveedor`). Pasa a ser una lista:

- `tienda_online_config.pago_proveedores` (text, JSON `["BANCARD","ICPAY"]`), migración aditiva.
  Si está vacía se lee `pago_proveedor` como hoy (instalaciones existentes sin cambio).
  `pago_proveedor` queda escrito con el primero de la lista para quien lo lea viejo.
- Cada proveedor declara además `etiqueta` para el cliente y `medio` (`TARJETA` | `PIX` | `QR`):
  el checkout muestra **«Tarjeta — Bancard»**, **«Tarjeta — dinelco»**, **«Pix (Brasil)»**.
  Solo se ofrecen los que están en la lista **y** tienen credenciales completas.
- El cliente elige en el checkout (`metodoPago` = id del proveedor, como hoy). El pedido guarda
  `pago_proveedor` por intento (ya existe). Un pedido viejo se sigue consultando con el suyo.
- **Cambiar de medio:** en la página de pago, si el intento quedó FALLIDO o EXPIRADO, el cliente
  puede elegir otro proveedor prendido → intento nuevo con ese proveedor. Con un intento PENDIENTE
  no se cambia (evita dos cobros vivos del mismo pedido).
- `pedido.crear` valida que el método elegido esté prendido y listo
  (`metodo_pago_no_disponible` si no).
- Config Tienda Online: en «Pago online», cada proveedor con su interruptor, sus campos, «Probar
  conexión» y estado (listo / faltan datos). Se arma desde `campos` como hoy, sin tocar la
  pantalla por proveedor.
- Job (`tickPagosOnline`): ya consulta por el proveedor de cada pedido. Sin cambio.

### 2. Tipo de inicio nuevo: QR

`InicioCobro` suma
`{ tipo: 'QR'; sesionId; payload: string; expiraEn; montoMostrado: { moneda: 'BRL', valor } }`.

Storefront, `/tienda/pago/<numero>` con un QR:
- dibuja el QR desde `payload` en el navegador (la librería `qrcode` ya está en el proyecto);
  **no** se carga ninguna imagen de terceros;
- botón **«Copiar código Pix»** (copia e cola): el cliente brasileño suele pagar desde el mismo
  teléfono y no puede escanear su propia pantalla;
- muestra «Pagás R$ X» (`totalAmount`) y el equivalente en guaraníes del pedido, y la cuenta
  regresiva hasta `expiresAt`;
- consulta el estado cada 5 s (lo que ya hace con los otros proveedores) y pasa a
  «¡Pago recibido!» cuando el servidor lo da por PAGADO. El navegador **nunca** decide.

### 3. IC Pay (`proveedores/icpay.proveedor.ts`)

- `id: 'ICPAY'`, `nombre: 'IC Pay'`, `formaPago: 'PIX ONLINE'` (sembrada inactiva como las otras),
  `medio: 'PIX'`, `modo: 'QR'`.
- `campos`: `baseUrl` (opciones sandbox / producción, o libre con patrón `https://…`),
  `email`; secretos `apiKey` y `password`.
- **Sesión con IC:** módulo `icpay-auth.ts` guarda en memoria `accessToken` + `refreshToken` +
  vencimiento. Antes de cada llamada: si faltan menos de 5 min, `refresh-session`; si el refresh
  falla, `sign-in`. Si el sign-in devuelve un `challengeName` → error `icpay_mfa` («el usuario de
  IC tiene MFA o contraseña temporal: usá uno sin MFA»). Un 401 en una llamada fuerza un sign-in y
  un solo reintento. Los tokens nunca se guardan en la base ni en logs.
- **Monto en USD:** el pedido está en guaraníes. Al iniciar:
  1. `GET /quote?fromCurrency=PYG&toCurrency=USD&context=payment_order` → tasa;
  2. `amountUSD = redondeo hacia arriba a 2 decimales (totalPYG × tasa)` — hacia arriba para no
     cobrar de menos;
  3. `POST /payment/order { amount: amountUSD, currency: 'BRL' }` con `Idempotency-Key` = la
     clave del intento (uuid, ya cumple el formato).
  Se guarda en el pedido: monto USD pedido, `quote`, `totalAmount` BRL y `quotationId` (columna
  `pago_detalle_json`, texto, migración aditiva) para auditoría y para la regla de coincidencia.
  *Decisión pendiente del propietario: cotización de IC o la del sistema (§Decisiones).*
- **Consultar → `ResultadoPago`:**

  | IC | Resultado |
  |---|---|
  | `completed` + `id` igual + `amount` USD igual al pedido + `currency` BRL | PAGADO (`paymentId` = id de la orden) |
  | `completed` con monto o moneda distintos | INCONSISTENTE (aviso, no se da por pagado) |
  | `pending` antes de `qrData.expiresAt` | PENDIENTE |
  | `pending` pasado `expiresAt` + 15 min | EXPIRADO (con aviso, como Bancard) |
  | `expired` | EXPIRADO |
  | `cancelled` | FALLIDO |
  | `underpaid` | INCONSISTENTE (pagó de menos: el personal decide) |
  | `duplicated` | INCONSISTENTE |
  | `under_dispute` | INCONSISTENTE + aviso «reclamo abierto en IC» |
  | `refunded` | si el pedido estaba PAGADO → evento y aviso «IC informa devolución» (no cambia la venta sola) |
  | otro / no se pudo leer | PENDIENTE |

- **Sin webhook:** la confirmación sale de la consulta: la página de pago (cada 5 s mientras el
  cliente mira) y el job (cada minuto, ya existe). No hace falta URL pública ni IP para IC.
- **Devolver:** no hay API → `devolver` no se implementa; la cola DEVOLVER muestra «Devolvelo
  desde el panel de IC» (mismo camino que Bancard después del cierre de lote).
- `probarConexion`: sign-in + `GET /api/v1/store/me` (o `account/me`) → «Conectado como <store>,
  saldo en <moneda>». Sin crear órdenes.
- **Datos del pagador** (`providerMetadata.taxId` = CPF/CNPJ, `payerName`): se guarda **solo el
  nombre** en el evento; el CPF no se guarda.

### 4. dinelco Checkout (cuando lleguen las claves)

Mismo contrato, `modo: 'IFRAME'` (sesión `POST /checkout-session` → `integrityToken`, formulario
al iframe `dinelcoCheckout`), aviso sin firma → solo dispara una consulta, reversión total en 24 h
por API (`devolver`). Detalle en el resumen de su documentación (sesión 2026-11-09); se escribe su
propia sección cuando estén las claves.

## Datos (una migración aditiva, driver-aware)

- `tienda_online_config.pago_proveedores` text null.
- `pedidos_online.pago_detalle_json` text null (cotización y montos del proveedor, por intento).
- Forma de pago `PIX ONLINE` sembrada inactiva; `MetodoPagoOnline.ICPAY`;
  `METODOS_PAGO_ONLINE` / `FORMAS_PAGO_ONLINE` suman ICPAY.

## Fases (commit y push al cerrar cada una)

1. **Multi-proveedor:** migración, lista de prendidos, checkout con varios medios, cambiar de
   medio tras un fallo, config por proveedor. uPay/Bancard siguen pasando sus tests sin cambios.
2. **IC Pay:** auth con renovación, cotización, orden, consulta, tipo QR en el storefront,
   simulador de IC para tests (`test:pagos-icpay`, SQLite y Postgres).
3. **Prueba real contra el sandbox de IC:** crear una orden chica, verla en su panel, pagarla
   según cómo IC simule el pago en sandbox, ver el pedido pasar a PAGADO y materializarse; un QR
   vencido; probar conexión con credenciales malas.
4. **dinelco** (si llegan las claves esta semana).
5. **Cierre:** auditoría con agentes, batería completa (`test:all` sin fallas nuevas), AOT,
   Chrome contra la copia (checkout con los tres medios, página de pago con QR en ancho de
   teléfono), checklist manual, skill y runbook para agentes.

## Tests (simulador de IC)

- Sign-in → tokens; token por vencer → refresh; refresh rechazado → sign-in; 401 → un reintento.
- Sign-in con `challengeName` → `icpay_mfa`, el pago no se ofrece.
- Cotización PYG→USD: redondeo hacia arriba; tasa ausente o 0 → error, no se crea la orden.
- Reintento de red con la misma `Idempotency-Key` → misma orden (`Idempotent-Replayed`), un solo
  intento en el pedido; `409` → se reintenta la consulta, no se crea otra.
- Cada fila de la tabla de estados de §3.
- Orden `completed` que llega con el pedido cancelado → pago tardío a devolver (cola DEVOLVER).
- Dos proveedores prendidos: el checkout ofrece los dos; uno sin credenciales no aparece;
  `pedido.crear` con un proveedor apagado → `metodo_pago_no_disponible`; cambiar de medio con
  un intento PENDIENTE → rechazado; tras EXPIRADO → intento nuevo con el otro proveedor.

## Decisiones del propietario

1. **Cotización:** ¿la de IC (`/quote` PYG→USD, lo que IC acredita) o la del sistema
   (`moneda_cambio`)? Recomendado: la de IC, porque es la que define lo que se acredita.
2. **Recargo Pix:** ¿se cobra un porcentaje extra por pagar con Pix (cubrir la comisión de IC)?
3. **Moneda que ve el cliente:** recomendado mostrar **R$** grande y los ₲ del pedido chico.

## Preguntas para IC (no documentado)

1. URL de **producción** de la API y si el sandbox es `stage.api.ic.com.py`.
2. ¿Hay **aviso (webhook) de órdenes de pago**? La API solo lista eventos de payouts.
3. Duración del QR (`qrData.expiresAt`) y si se puede elegir.
4. Cómo **simular un pago Pix** en sandbox.
5. **Devoluciones** de un Pix cobrado: ¿por panel, por reclamo, plazos?
6. Comisión, moneda y plazo de acreditación; qué significa «resta el monto del saldo disponible»
   en la descripción de crear orden.
7. Confirmar que el usuario de la API puede quedar **sin MFA** (servidor sin intervención humana).
8. ¿Se puede mandar una **referencia propia** en la orden (número de pedido)?

## Riesgos

- Sin webhook, la confirmación depende de la consulta: si el servidor está caído cuando el cliente
  paga, se confirma al volver (el job recorre los pendientes). No se pierde.
- La cotización cambia entre la orden y el pago: lo que vale es el `amount` USD de la orden, que
  IC fija al crearla.
- Credenciales de usuario y contraseña (no una clave de API sola): van al almacén seguro, nunca a
  la base, a logs ni a la pantalla.
