# PLAN tienda online — dinelco Checkout embebido (issue #371)

Rama: `bot/ceo-frc-gourmet/feat-tienda-dinelco`, sale de `bot/ceo-frc-gourmet/feat-tienda-piloto`
(PR #370, en borrador). Es la fase 4 de `PLAN-tienda-pagos-multi-icpay.md`. Toca cobro: **antes del
merge se paga de verdad contra el sandbox de dinelco y se cobra y factura el pedido en la copia de
Don Franco** (regla alpha.159). Nada se mergea sin el OK del propietario, y nunca antes que #370.

## Fuente

Documentación oficial: `https://test-checkout.dinelco.com.py/dinelco-checkout/docs/es/` (leída
completa el 2026-11-25, copia en la estación). Respuesta de dinelco/Bepsa del 2026-11-25 por el grupo.
Prueba directa contra el sandbox (2026-11-25, 23:50) con la clave de desarrollo: crear sesión
→ 201 `{ integrityToken, expirationDate (+10 min), sessionId }`; consultar por `sessionId` y por
`clientReferenceId` → 200 `REQUIRES_PAYMENT`; reversa de una operación inexistente → 400
`APPROVED_PAYMENT_NOT_FOUND_FOR_REVERSAL` (la clave tiene `payment:reversal`). El comercio de
prueba se llama «Bepsa Prueba».

| Tema | Qué dice dinelco |
|---|---|
| API | REST JSON. Pruebas `https://test-checkout.dinelco.com.py/dinelco-checkout/api/v1`, producción `https://checkout.dinelco.com.py/dinelco-checkout/api/v1` |
| Auth | `Authorization: Bearer di_sk_…` (una sola clave secreta, solo en el backend) |
| Sesión | `POST /checkout-session` `{ clientReferenceId, amount, currency: "PYG", targetOrigin, callbackUrl?, returnUrl?, lineItems?, metadata?, customer? }` → `{ integrityToken, expirationDate, sessionId }`. El token dura ~10 min |
| Iframe | `<iframe name/id="dinelcoCheckout">` + formulario oculto `#checkoutForm` (POST, `target=dinelcoCheckout`, input `JWT`) a `{host}/d/api/checkout-session/validate`, sin API key |
| Eventos | `postMessage` con `paymentStatus`: `payment.success` (`receiptData`) o `payment.failed` (`data`). Validar `event.origin` = host del ambiente |
| Consulta | `GET /checkout-session/{sessionId}` o `?clientReferenceId=`. `sessionStatus` REQUIRES_PAYMENT / SUCCESS; `payment.status` PROCESSING / APPROVED / REJECTED / VOIDED, con `operationNumber`, `amount`, `currency` |
| Rechazo | La sesión **sigue abierta** para otro intento en el mismo iframe |
| Aviso | POST a `callbackUrl` (o la URL por defecto del comercio). **Sin firma y sin reintentos.** IPs: QA 190.128.216.70, PROD .66 y .67 |
| Reversa | `POST /payment/reversal { operationNumber, clientReferenceId? }`, total, solo tarjetas de marcas habilitadas, **dentro de 24 h**. Avisa a la URL por defecto del comercio con `{ event: payment.reversal.approved/rejected, data }` |
| Pruebas | Visa 4456 5300 0000 1005 y MC 5200 0000 0000 2235 sin fricción; Visa …1096 y MC …2151 con desafío 3DS (OTP 1234). Rechazo: vencimiento pasado o CVV distinto |
| Dominios | El iframe solo carga en dominios que dinelco registra (`frame-ancestors`). No acepta localhost: para pruebas, `https://app.frc-gourmet.com` (pedido a dinelco por el propietario) |

## Diseño

Mismo contrato de proveedores (`electron/services/pagos-online/proveedores/`); el ciclo del pago
(PENDIENTE → PAGADO / FALLIDO / EXPIRADO, pago tardío, cola DEVOLVER, avisos, eventos) **no cambia**.

### Contrato: modo nuevo `IFRAME`

- `tipos.ts`: `modo` suma `'IFRAME'` e `InicioCobro` suma
  `{ tipo: 'IFRAME'; sesionId; token; validarUrl; expiraEn; datos; crudo }`.
- `pagos-online.service.ts`: `respuestaInicio` devuelve `{ tipo: 'IFRAME', token, validarUrl, proveedor, hosts }`.
  El token se guarda en `pago_datos_json` (para volver a mostrar el formulario si el cliente
  recarga) y **nunca** en el historial de eventos (`crudo` sin token).
- Token vencido al recargar: se consulta la sesión; si no hay pago aprobado ni en proceso, se abre
  una sesión nueva (intento nuevo). El intento viejo se sigue resolviendo por su referencia.

### Proveedor `dinelco.proveedor.ts` (+ `dinelco.client.ts`)

- `id: 'DINELCO'`, etiqueta «Tarjeta — dinelco», medio TARJETA, forma de pago `DINELCO ONLINE`.
- `hosts: ['test-checkout.dinelco.com.py', 'checkout.dinelco.com.py']`.
- `campos`: `entorno` (PRUEBA / PRODUCCION) y `apiKey` (secreto, patrón `di_sk_[A-Za-z0-9_]{20,200}`).
- `iniciar`: `clientReferenceId = FRCG-<procesoNumerico>` (pedido.id × 100 + intento: único y se
  sabe de qué pedido e intento es), `amount` = guaraníes enteros, `currency: PYG`,
  `targetOrigin` = origen de la URL pública, `callbackUrl` = `<URL pública>/pub/pagos/dinelco[-<cuenta>]/aviso`,
  `metadata: { pedido, intento }`. **Sin `customer` ni `lineItems`**: no mandamos datos personales
  que no hacen falta, y `lineItems` no admite descuentos negativos (la suma no cerraría).
  `sesionId` = `sessionId` de dinelco; `expiraEn` = `expirationDate`.
- `consultar` (por `sessionId`):
  - `APPROVED` con `amount` = total y `currency` PYG → PAGADO (guarda `operationNumber`,
    `authorizationCode`, marca y tarjeta enmascarada en el detalle). Monto o moneda distintos → INCONSISTENTE.
  - `PROCESSING` o sin `payment` → PENDIENTE; pasado `expiraEn` + 30 min sin pago → EXPIRADO.
  - `REJECTED` → FALLIDO (el cliente ve «Probar de nuevo» y se abre otra sesión). Como dinelco deja
    reintentar en el mismo iframe, el storefront **saca el iframe** al recibir `payment.failed`, y
    el job sigue consultando las sesiones FALLIDO de dinelco hasta su vencimiento + gracia: un
    APPROVED tardío entra por el camino de pago tardío que ya existe (se verifica en el código y,
    si no cubre FALLIDO → aprobado, se suma con su test).
  - `VOIDED` → devolución hecha.
  - 401/403 → `dinelco_credenciales`; 404 → PENDIENTE hasta vencer; 5xx → error, sigue pendiente.
- `procesarAviso`: el aviso no tiene firma, así que **no decide nada**: se lee `clientReferenceId`
  (o `data.clientReferenceId` en el sobre de la reversa), se busca el pedido y se dispara la misma
  consulta que el job. Desconocido → 400 sin detalle. Se registra en el historial sin datos del
  pagador. (Filtrar por IP no es confiable detrás del túnel: no se usa como seguridad.)
- `devolver`: `POST /payment/reversal { operationNumber, clientReferenceId }`. `reversal.status
  APPROVED` → ok. «ya ha sido revertido» → se consulta y, si está VOIDED, ok. «Tiempo límite
  excedido», marca no habilitada o método no soportado → no ok con el texto «devolvelo desde el
  portal de dinelco» (queda en la cola DEVOLVER, como Bancard después del cierre de lote).
- `probarConexion`: consulta una referencia que no existe: 404 = la clave sirve; 401 = clave mala.
- `datosPortal`: la URL de aviso de esa cuenta, para pasársela a dinelco.

### Storefront (`pages/pago`)

- Modo `IFRAME`: dibuja el iframe `dinelcoCheckout` (alto 680 px, 600 en teléfono, ancho 100 %) y
  el formulario oculto; valida que `validarUrl` sea https y de un host del proveedor; inyecta el
  token y envía el formulario. Tema claro (regla de la tienda).
- Listener `message`: descarta todo `event.origin` que no sea el host del proveedor; con
  `payment.success` o `payment.failed` llama enseguida a `verificar()` (la decisión sigue siendo del
  servidor). Se quita el listener al salir de la página.
- Si la tienda manda cabeceras CSP, se suma el host de dinelco a `frame-src` y `form-action`.

### Datos (migración aditiva, driver-aware)

- `MetodoPagoOnline.DINELCO`, `FORMA_PAGO_DINELCO = 'DINELCO ONLINE'` en `FORMAS_PAGO_ONLINE`.
- Forma de pago `DINELCO ONLINE` sembrada **inactiva**, como PIX ONLINE. Sin columnas nuevas:
  `pago_datos_json` y `formas_pago_online` ya existen.

## Fases (commit y push al cerrar cada una)

1. **Proveedor y servidor:** cliente, proveedor, modo IFRAME en el servicio, aviso, migración.
   Simulador de dinelco y `test:pagos-dinelco` (SQLite y Postgres).
2. **Storefront:** iframe, formulario, listener, recarga con token vencido. AOT del storefront.
3. **Sandbox real** (en la copia de Don Franco, con Playwright: la página se presenta como
   `https://app.frc-gourmet.com` y se sirve la tienda local, así el iframe pasa `frame-ancestors`):
   pago aprobado sin fricción, con desafío 3DS (OTP 1234), rechazo y después pago bueno, token
   vencido y recarga, reversa al cancelar un pedido pagado, probar conexión con clave mala. El aviso
   real no llega a la copia (no tiene URL pública): se prueba con el cuerpo real capturado.
4. **Cobro y factura en la copia:** el pedido pagado con dinelco se acepta, pasa por cocina y se
   cobra y factura en el punto de venta con la forma `DINELCO ONLINE`; capturas al propietario.
5. **Cierre:** auditoría del diff, `test:all` (sin fallas nuevas), PR, CI verde.

## Tests (simulador)

- Sesión creada → IFRAME con token; el token no aparece en los eventos.
- Cada `payment.status` de la tabla; monto o moneda distintos → INCONSISTENTE.
- REJECTED → FALLIDO; APPROVED tardío en una sesión FALLIDO o de un intento viejo → pago tardío.
- Aviso de pago y de reversa: dispara la consulta, nunca decide solo; referencia desconocida → 400.
- Reversa: aprobada, ya revertida, fuera de 24 h, marca no habilitada.
- 401 → credenciales; 404 en probar conexión → ok.
- Varios proveedores prendidos (Bancard + dinelco): el checkout ofrece los dos.

## Riesgos y vuelta atrás

- **Cobrar sin registrar:** el aviso no tiene firma ni reintentos; por eso la verdad sale siempre de
  la consulta (job cada minuto + `verificar` desde la página). Un pago que llega con el pedido ya
  cancelado entra a la cola DEVOLVER (reversa automática dentro de 24 h; después, a mano en dinelco).
- **Cobrar dos veces:** una referencia por intento; no se abre otra sesión si la actual tiene un
  pago APPROVED o PROCESSING.
- **Clave expuesta:** la clave va al almacén seguro (campo `secreto`), nunca al storefront, a los
  eventos ni al repo. El token del iframe dura 10 min y no se registra.
- **Vuelta atrás sin release:** dinelco queda apagado hasta que el local carga su clave y prende la
  forma de pago; apagarlo en Config Tienda Online lo saca del checkout al momento, sin tocar los
  pedidos en curso. **Con release:** revert del PR; la migración es aditiva (una forma de pago
  inactiva) y su `down` la borra solo si no tiene ventas.

## Ajustes por la auditoría del plan (2026-11-25, aprobada con observaciones)

1. **Referencia:** `FRCG-<pedido.id>-<intento>-<6 hex al azar>` (guardado en `pago_datos_json`): no
   choca con 100+ intentos ni con la copia u otros entornos que comparten el comercio de prueba.
2. **Una sola sesión viva por pedido:** si el intento actual tiene token sin vencer, se reusa (otra
   pestaña ve el mismo formulario); recién con el token vencido y la sesión sin pago se abre otra.
   Test: dos sesiones del mismo pedido aprobadas → la segunda va a la cola DEVOLVER. Se le pregunta
   a dinelco si un formulario ya cargado puede pagar después de que vence el token.
3. **Aviso:** responde **200 siempre** con el mismo cuerpo (no deja sondear referencias) y usa el
   límite de la ruta pública (`/pub/pagos/:proveedor/aviso`, 120/min). Los sobres de pago y de
   reversa se prueban con los ejemplos de la documentación; el real se valida en la prueba de humo
   de producción (queda en el historial del pedido).
4. **CSP:** si la tienda manda Content-Security-Policy, `frame-src` y `form-action` llevan
   exactamente los hosts del proveedor (`test-checkout` / `checkout.dinelco.com.py`).
5. **Clave rechazada (401/403):** los pedidos siguen PENDIENTE y el job reintenta hasta vencer;
   «Probar conexión» muestra el error y el evento queda en el historial del pedido. La reversa es
   solo total: una devolución parcial se hace a mano en dinelco.
6. **Factura en la copia:** la copia de Don Franco no transmite a la SET (sin facturación
   electrónica real); se verifica en su configuración antes de facturar.
7. **Salida a producción** (después del merge, con OK): dinelco registra `https://app.frc-gourmet.com`
   en la credencial de producción (ya pedido), el local carga la clave en Config Tienda Online y se
   hace una prueba de humo con un pago chico real y su reversa, antes de prender dinelco para clientes.
8. **Plan B si dinelco no habilita el dominio de prueba:** pedirles el dominio de prueba que
   ofrecieron («les indicaremos un dominio de prueba»). Sin pago real en sandbox no se mergea.

## Bloqueos y pendientes con dinelco

- **Bloqueante para la fase 3:** que dinelco habilite `https://app.frc-gourmet.com` como
  `frame-ancestors` de la credencial de prueba (el propietario lo pidió el 25/11).
- Sin respuesta todavía: qué marcas admiten reversa, si QR SIP y cuotas van en el embebido.
  No frenan: sin reversa, la devolución queda en la cola DEVOLVER.
- Producción: la clave llega al terminar el alta del comercio y se carga en Config Tienda Online
  de Don Franco, no pasa por el bot. Su URL de aviso por defecto ya está pedida.
