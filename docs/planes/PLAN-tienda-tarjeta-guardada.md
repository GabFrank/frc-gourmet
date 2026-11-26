# PLAN — Tienda: «Guardar mi tarjeta» y pago con un toque (dinelco)

Estado: borrador para auditoría · 26/11/2026 · Pedido del propietario: «Planificarlo ya, para que entre con el piloto».
Base: rama del #372 (`bot/ceo-frc-gourmet/feat-tienda-dinelco`), que a su vez va sobre el #370. PR propio, apilado; se mergean en orden #370 → #372 → este.

## 1. Problema

Hoy, con dinelco (#372), el cliente de la tienda carga los datos de la tarjeta en cada pedido. Solo Google Pay y Click to Pay le evitan tipear. En iFood y PedidosYa la tarjeta queda guardada y desde el segundo pedido se paga con un toque. El propietario quiere esto para el piloto.

## 2. Qué ofrece dinelco (docs locales `/estacion/notas/dinelco-docs/llms-full.txt`)

- **Catastro embebido**: `POST /dinelco-checkout/api/v1/checkout-session/registry` (amount `0`, `targetOrigin`, `clientReferenceId`, `callbackUrl`, `customer`). Iframe `dinelcoRegistry` + form `registryForm` POST a `/d/api/registry/validate`. Eventos `postMessage` `registryStatus`: `registry.success | registry.failed | registry.cancel`. Callback a `callbackUrl` con `registryInfo.status` (`SUCCESSFUL | FAILED`) y `registryInfo.paymentMethodInfo` (`tokenId`, `token`, `cardBrand` VSA/MST/DIN, `cardNumber` enmascarado, `cardType`). No cobra.
- **3DS obligatorio con fricción para catastrar**: si el banco lo resuelve sin fricción, el catastro se cancela (`registry.failed`).
- **Pago con token**: `POST /dinelco-checkout/api/v3/payment` (permiso **`payment:create`**), body `{clientReferenceId, amount, currency:'PYG', paymentMethod:{tokenId}, paymentOptions:{}, metadata, customer:{customerId,…}}`. Respuesta síncrona `status: APPROVED | REJECTED`, `operationNumber`, `authorizationCode`. Consulta idempotente: `GET /v3/payment/{clientReferenceId}` antes de reintentar. Callback a la URL por defecto del comercio (no por operación).
- El token del catastro es de uso ocasional (no sirve para suscripciones; no las usamos).
- Las notificaciones **no se reintentan** (respuesta de dinelco del 25/11): no se puede depender solo del callback.

## 3. Qué se cambia

### 3.1 Datos (migración aditiva, SQLite y Postgres)
Tabla nueva `tienda_tarjetas_guardadas`:
`id, cuenta_cliente_id (FK cuentas_cliente), forma_pago_online_id (FK a la cuenta DINELCO que la catastró: el token vale solo para ese comercio), token_id varchar(80), marca varchar(10), enmascarada varchar(30) (bin****last4), tipo varchar(2), activa bool, creada_en, ultimo_uso_en, registro_ref varchar(60) único`.
- Se guarda **solo `tokenId`**, no el `token`: el pago con token acepta cualquiera de los dos, y así no guardamos el valor más sensible. Nunca hay número completo, vencimiento ni CVV (no pasan por nosotros).
- Índice único `(cuenta_cliente_id, forma_pago_online_id, token_id)`.
- Config: columna `tarjeta_guardada` bool default **false** en la cuenta de pago online DINELCO (formas_pago_online) → la función se prende por cuenta.

### 3.2 Backend (proveedor dinelco + rutas de la tienda)
1. `dinelco.proveedor.ts`: `crearSesionCatastro(creds, {ref, targetOrigin, urlAviso, cliente})`, `cobrarConToken(creds, {ref, monto, tokenId, cliente, metadata})`, `consultarCobroToken(creds, ref)`, `interpretarCobroToken(body, montoEsperado)` → reusa el resultado común (`PAGADO` solo con `APPROVED` + PYG + monto exacto; `REJECTED` → rechazado; otro → pendiente/inconsistente).
2. Rutas de cliente (con sesión de la tienda, rate-limit):
   - `POST /api/tienda/tarjetas/registro` → crea la sesión de catastro (ref `REG-<cuenta>-<rand>`), guarda un registro pendiente y devuelve `integrityToken` + URL de validación.
   - `POST /api/tienda/tarjetas/registro/:ref/confirmar` → el front lo llama al recibir `registry.success`; el backend **consulta** la sesión a dinelco (ver §6 punto abierto 1) y solo si `SUCCESSFUL` guarda la tarjeta. Así no dependemos del callback.
   - `GET /api/tienda/tarjetas` (solo las propias, activas, de la cuenta DINELCO vigente) y `DELETE /api/tienda/tarjetas/:id` (la desactiva; no se borra la fila para auditoría).
   - Cobro: el endpoint actual que inicia el pago del pedido acepta `tarjetaGuardadaId`. Verifica que la tarjeta sea **de esa cuenta de cliente** y de la cuenta DINELCO activa; crea el intento de cobro como hoy (misma referencia `<numero>-<intento>`), llama `cobrarConToken` y aplica el resultado con el servicio común (`pagos-online.service.ts`): PAGADO → mismo camino que el iframe (materializar pedido, aviso, cobro DINELCO ONLINE pre-cargado en el PdV). Timeout/5xx → queda PENDIENTE y el job consulta `GET /v3/payment/{ref}`; **nunca** se reintenta sin consultar antes.
3. Aviso público: `/pub/pagos/dinelco[-<cuenta>]/aviso` reconoce también el payload del catastro y del pago con token. Se acepta solo como disparador: siempre se reconfirma consultando a dinelco (igual que hoy con los pagos). Opcional, filtro por IP de dinelco (190.128.216.66/67 prod, .70 QA) detrás del túnel: se registra pero no bloquea en esta etapa.
4. Job de pagos online: incluye los intentos con token pendientes (consulta v3).
5. Reversa: la anulación automática actual (`POST /payment/reversal` con `operationNumber`) se usa igual para los cobros con token (a verificar en sandbox, §6).

### 3.3 Tienda (storefront, tema claro)
- **Checkout, método Online**: si el cliente tiene tarjetas guardadas, arriba aparece «Visa •••• 1005 — Pagar ₲ X» (un toque, con el monto en el botón para que sea explícito) y debajo «Usar otra tarjeta u otro medio» (el iframe de siempre).
- Si no tiene: casilla/enlace «Guardar una tarjeta para pagar con un toque» → abre el iframe de catastro; al `registry.success` + confirmación, la tarjeta aparece y paga con un toque. Si falla o cancela: mensaje claro («Tu banco no pidió verificación y no se pudo guardar: pagá esta vez con el formulario») y sigue el pago normal. Nunca se pierde el pedido.
- **Mi cuenta → Mis tarjetas**: lista, quitar, agregar.
- Solo cuentas con teléfono verificado pueden guardar tarjetas.
- Texto encima del iframe de pago: de «Ingresá los datos de tu tarjeta» a uno neutro («Elegí cómo pagar…»), porque ahí también está QR (hallazgo del 26/11).

### 3.4 Administración
- Configuración de la tienda online → cuenta DINELCO: interruptor «Permitir guardar tarjetas» (apagado por defecto) y ayuda: requiere el permiso `payment:create` en la clave.
- «Probar conexión» de la cuenta: si el interruptor está prendido, prueba `GET /v3/payment/<ref inexistente>` para detectar 401/403 de permiso.

## 4. Cómo se prueba

1. **Unitarias** (`test:pagos-dinelco` ampliado, dinelco simulado): crear catastro; confirmar SUCCESSFUL/FAILED/cancel; no guarda tarjeta sin consulta exitosa; cobro con token APPROVED → PAGADO; REJECTED → rechazado sin materializar; monto distinto → inconsistente; timeout → pendiente y el job consulta v3 antes de reintentar (no hay doble cobro); tarjeta de otra cuenta → 403; tarjeta desactivada → 404; interruptor apagado → no se ofrece.
2. **Migración**: `test:tienda-online-migracion` + nueva suite en SQLite y Postgres (tabla, índices, columna con default false, la migración es la última).
3. **Build/check**: `build`, `build:storefront`, `check`.
4. **test:all** en paralelo (3 a la vez), una vez, con el cambio terminado: no suma fallas a la línea base (pago-consolidado, permisos, pg-backup).
5. **Sandbox real de dinelco** (por el puente del celular del propietario si el servidor sigue bloqueado; ver `/estacion/notas/dinelco.md` 26/11 10:55): catastrar Visa con fricción (…1096, OTP 1234) desde la tienda en la copia de Don Franco (`donfranco_piloto`); ver la tarjeta en «Mis tarjetas»; pedido nuevo pagado con un toque → PAGADO con operación y autorización; cancelar un pedido pagado con token → reversa APPROVED; catastro con tarjeta sin fricción (…1005) → falla con el mensaje y el pago normal sigue.
6. **PdV (regla alpha.159)**: el pedido pagado con token se cobra en el PdV de la copia con DINELCO ONLINE pre-cargado y se **emite la factura**; venta CONCLUIDA. Capturas al propietario.
7. Pruebas de pantalla en tema claro (regla de la tienda), capturas al propietario.

## 5. Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Doble cobro por reintento | Referencia única por intento + consulta `GET /v3/payment/{ref}` antes de cualquier reintento; el job nunca crea un cobro nuevo. |
| Callback sin reintentos ni firma | El token solo llega por el callback (§10). Se acepta con tres controles: IP de dinelco, catastro PENDIENTE < 30 min de esa cuenta y consulta de la sesión `SUCCESS`. Si no llega, el catastro vence PENDIENTE y el cliente lo repite; ningún pedido queda trabado. |
| Cobrar con la tarjeta de otro cliente | El backend valida dueño (`cuenta_cliente_id`) y cuenta DINELCO; el `tokenId` solo sirve con nuestra clave; botón con el monto visible. |
| Cuenta de cliente robada | Solo teléfono verificado; el cobro va únicamente a Don Franco (pedido visible en cocina/PdV) y se puede anular dentro de 24 h. |
| 3DS sin fricción impide catastrar | Mensaje claro y pago normal; no bloquea el pedido. |
| Permiso `payment:create` no habilitado | Interruptor apagado por defecto; «Probar conexión» lo detecta; sin permiso, la tienda no ofrece la opción. |
| Token de otro comercio (cambio de cuenta DINELCO) | La tarjeta está atada a `forma_pago_online_id`; si cambia la cuenta, no se ofrece. |
| Sandbox inaccesible desde el servidor | Puente del celular (ya probado). Si no hay sandbox, no se mergea (lo exige §4.5). |

### 5.1 Observaciones de la auditoría del plan (se aplican en la implementación)

- **Consentimiento y baja:** casilla «Guardar esta tarjeta para próximos pedidos» sin marcar por defecto, con texto de que se guarda en dinelco y no en Gourmet; se registra fecha del consentimiento. «Quitar» desactiva local y, si dinelco tiene API de borrado, borra el token allá; si no, se le dice al cliente «ya no se usará en Don Franco». Con el interruptor apagado o tras un revert, los tokens quedan sin uso (nunca se cobran).
- **Cuenta robada (sin 3DS por cobro):** tope por pedido con token (configurable, por defecto ₲ 300.000) y tope diario por cliente (3 pedidos); por encima, o con dirección de entrega nueva, se pide el iframe con 3DS. Anulación: el pedido cancelado desde cocina/PdV dispara la reversa automática dentro de 24 h (mismo flujo del #372); pasado ese plazo, devolución manual por dinelco y el caso queda en el registro del pedido.
- **Reversa con token no disponible:** si la prueba 5 muestra que no hay reversa para cobros con token, la función no se mergea (o se mergea apagada) hasta tenerla; no se acepta cobro sin devolución.
- **Dueño de la referencia:** `/registro/:ref/confirmar` y el cobro con token validan que la referencia y la tarjeta son de la cuenta con sesión; el monto se recalcula siempre en el servidor desde el pedido, nunca viene del front.
- **Reintentos y doble toque:** cada intento (iframe o token) usa referencia nueva; candado por pedido (un solo intento PENDIENTE a la vez) y botón deshabilitado al tocar.
- **Vuelta atrás con pagos PENDIENTE:** el job de consulta sigue activo aunque se apague el interruptor, hasta resolverlos. La migración trae `down`.
- **Salida si dinelco no da `payment:create`:** la función queda apagada y el piloto sale solo con iframe + Google Pay/Click to Pay; no frena #370 ni #372.

## 6. Puntos abiertos (se resuelven en la implementación, antes de pedir el OK de merge)

1. **Resuelto el 26/11 (§10): no lo devuelve.** ¿`GET /checkout-session/{sessionId}` o por `clientReferenceId` devuelve el resultado de una sesión de **catastro** con `tokenId`? Se prueba en sandbox. El callback (sin firma) **no decide**: solo dispara esa consulta. Si el sandbox muestra que la consulta no trae el `tokenId`, el catastro no se puede confirmar de forma segura y se vuelve a planificar antes del merge (no se acepta el cuerpo del callback).
2. ¿La reversa por `operationNumber` funciona con cobros con token? Se prueba en sandbox.
3. Pedirle a dinelco: permiso `payment:create` en la clave de pruebas y en la de producción, y cómo borrar un token (si existe API). El propietario se lo pide junto con lo del QR y la IP.

## 7. Cómo se vuelve atrás

- Sin tocar código: apagar «Permitir guardar tarjetas» en la cuenta DINELCO → la tienda deja de ofrecerlo; los pedidos siguen con el iframe.
- Código: revert del PR (squash) → alpha nueva. La migración es aditiva: la tabla y la columna quedan sin uso y no rompen nada.

## 8. Entrega

PR `feat(tienda): guardar tarjeta y pagar con un toque (dinelco)`, en borrador, apilado sobre el #372. Merge solo con OK del propietario, después del #370 y el #372, con CI verde y todas las pruebas de §4 hechas.

## 9. Ajustes hechos en la implementación (auditoría del 26/11)

Controles agregados (no cambian el qué; reducen el riesgo de cobrar sin formulario):
- Tope por pedido del pago con un toque: ₲ 300.000 por defecto, configurable en la cuenta DINELCO. Por encima, formulario con 3DS.
- Máximo de pagos con un toque en las últimas 24 h por cliente (3 por defecto, configurable); cuenta solo los pedidos pagados con un toque.
- Delivery con un toque solo a una dirección ya entregada antes (mismo texto o a 150 m o menos); si no, formulario.
- Máximo 5 catastros por hora por cliente.

Desvíos de diseño:
- El interruptor y los topes van en la configuración de la cuenta DINELCO (`config_json`), no en columnas.
- `tarjetas_guardadas.estado` es texto (PENDIENTE, ACTIVA, FALLIDA, QUITADA) en vez de `activa` booleano.
- «Quitar» deja la fila QUITADA y además borra el `token_id` de nuestra base.
- El callback del catastro: ver §10 (reemplaza a «solo reconsulta»).
- «Probar conexión», con «guardar tarjetas» encendido, consulta `GET /v3/payment/<ref inexistente>` y avisa si da 401/403 (falta `payment:create`).

Pendiente que bloquea el merge: la prueba en el sandbox real de §4.5 y los puntos 1 a 3 de §6. Depende de que dinelco habilite `payment:create` en la clave de pruebas y de llegar al sandbox (IP bloqueada; puente por el celular del propietario).

## 10. Cambio de diseño: el token del catastro llega por el callback (decisión del propietario, 26/11)

**Qué mostró el sandbox real** (26/11 13:05, por el puente del celular; `/estacion/notas/dinelco.md`): el catastro con Visa …1096 + OTP 1234 terminó bien (sesión 17176, `sessionStatus: SUCCESS`), pero `GET /v1/checkout-session/17176` y la consulta por `clientReferenceId` **no traen `registryInfo` ni `tokenId`**. La documentación lo confirma: el token llega solo en la notificación del catastro, que no tiene firma ni reintentos. Con el diseño de §6.1 ninguna tarjeta llegaría a ACTIVA.

**Decisión del propietario** (panel, 26/11 13:05: «Aceptar el aviso con los 3 controles»): el `tokenId` se toma del callback solo si se cumplen los tres:
1. **IP de dinelco**: la IP real del aviso (detrás del túnel, `cf-connecting-ip`; directo, la del socket) está en la lista del entorno de la cuenta: PRODUCCION 190.128.216.66/.67, PRUEBA 190.128.216.70 (las informó dinelco el 25/11). Si no, 403 y no se consulta nada.
2. **Catastro PENDIENTE** de esa referencia (`FRCR-<cuenta>-<rand>`), de la misma cuenta DINELCO de la ruta, abierto hace 30 min o menos (ya existía).
3. **Consulta a dinelco**: la sesión de ese catastro (`registro_sesion_id`, misma referencia) da `sessionStatus: SUCCESS`.

Si la consulta llega a traer el resultado con token (dinelco lo agrega algún día), manda la consulta y el cuerpo del aviso no se usa. Si dinelco no responde, sigue PENDIENTE y vence. El token del aviso no vuelve nunca al storefront ni al registro (igual que antes).

**Qué cubre y qué no:** alguien que no es dinelco no puede inyectar un token: hacen falta la IP, una sesión que dinelco confirme como terminada y la ventana de 30 min de un catastro que abrió ese cliente. El aviso queda atado al catastro por la referencia (`FRCR-<cuenta>-<48 bits al azar>`, que solo ve el cliente). `interpretarCatastroDinelco` descarta un cuerpo con otra referencia, y la consulta tiene que ser de esa misma referencia y sesión. El aviso de dinelco no trae `sessionId` (doc y forma observada en la consulta), así que el atado es por la referencia. Riesgo residual: falsificar una IP de dinelco y además adivinar la referencia de un catastro en curso. **No está verificado** qué hace dinelco con un token que no es suyo. Si llegara a pasar, ese cobro iría contra dinelco con nuestra clave y, si dinelco lo rechaza, queda FALLIDO y se paga con el formulario. Las IPs son una lista fija en el código, con las que informó dinelco. Si dinelco las cambia, el aviso da 403, se registra en el log y la tarjeta no se activa: falla cerrada, y el pago sigue con el formulario.

**Código** (commit sobre el #373): `dinelco.proveedor.ts` (`IPS_AVISO_DINELCO`, `ipAvisoDinelco`, `consultarCatastro` devuelve `exitosa`), `tarjetas-guardadas.service.ts` (`avisoCatastro` con los tres controles), `pedidos-online-pedidos.handler.ts` (pasa la IP del aviso).

**Pruebas** (`test:tienda-tarjeta-guardada`, dinelco simulado con la forma real de la consulta: `SUCCESS` sin `registryInfo`; la forma del aviso sale de la documentación, no de un aviso observado): sesión sin terminar → PENDIENTE; ruta de otra cuenta → 400; IP de dinelco con referencia ajena → 400; consulta caída → PENDIENTE; IP ajena → 403; IP de producción con cuenta de PRUEBA → 403; los tres controles → ACTIVA con el token del aviso; repetido → 400; vencido (> 30 min) → 400; consulta con resultado → manda la consulta.

**Lo que sigue sin poder probarse en sandbox y bloquea el merge (§4.5):** recibir el callback real y cobrar con token + su reversa. El callback va a la `callbackUrl` de la sesión, pero la copia no es alcanzable desde dinelco con una IP suya, y la clave de pruebas no tiene `payment:create`. Salidas, a decidir por el propietario antes del merge: (a) pedirle a dinelco `payment:create` en la clave de pruebas y el `tokenId` de la sesión 17176 (o una URL de prueba alcanzable) y hacer cobro + reversa en sandbox; o (b) mergear con «Permitir guardar tarjetas» apagado (es el valor por defecto, `NO`, de la cuenta DINELCO) y prenderlo en producción solo después de esta prueba: un catastro real, que muestra el aviso real y su formato; un pago chico con un toque; el cobro y la factura de ese pedido en el PdV (alpha.159); y su reversa. Si algo falla, se apaga de nuevo y no afecta al pago con formulario.
