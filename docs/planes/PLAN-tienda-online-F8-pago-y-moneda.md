# PLAN — Tienda online F8: moneda del menú y datos de pago del pedido

Rama: `bot/ceo-frc-gourmet/feat-tienda-online-f8`, encima de F7. Pedido del propietario (05/11), tras
hacer un pedido delivery de punta a punta:

1. Cambiar la **moneda general del menú** (ícono junto al de la cuenta).
2. Después de elegir retiro / delivery y sus datos, registrar **cómo paga**:
   - **Modalidad**: online o al recibir / retirar.
   - **Método**: efectivo, QR, PIX, transferencia, crédito (sólo clientes vinculados con crédito
     habilitado) y otros.
   - **Efectivo**: moneda (por defecto la general, se puede cambiar), «¿Necesitás vuelto?» y
     «Vuelto para:» con chips sugeridos (siempre mayores al total). Ej.: total ₲ 45.000 → 50.000, 100.000.
   - **Observación** libre del pago.

## 1. Lo que hay hoy (verificado)

- Checkout (`projects/storefront/.../checkout.page.*`): sólo `EFECTIVO` o `UPAY` (tarjeta online por
  uPay, F4, detrás de `pagoOnlineActivo`). Sin pago online, «efectivo contra entrega». `notas` del
  pedido es la única observación.
- `PedidoOnline.metodoPago` varchar(20), enum `MetodoPagoOnline` = EFECTIVO | BANCARD | UPAY | PAGOPAR.
  `moneda` (relación) existe pero es la del menú. No hay vuelto ni moneda de pago.
- Menú: precios en moneda principal (`menu.get` publica `moneda`). El servidor recalcula el total.
- Monedas en Don Franco: ₲ (principal), US$, R$, con cotización (`monedas_cambio`, `compraLocal` /
  `ventaLocal`: US$ 6.000/6.200, R$ 1.000/1.175) y billetes (`monedas_billetes`: ₲ 500…100.000,
  US$ 1…100, R$ 1…200).
- PdV: formas de pago EFECTIVO, PIX, TRANSFERENCIA, CHEQUE, CREDITO, TARJETA DEBITO/CREDITO, UPAY ONLINE.
- Crédito: `Cliente.credito` + `limite_credito` (56 de 68 clientes en la copia). `CuentaCliente`
  (cuenta web) tiene `cliente` **opcional, sin ninguna pantalla ni handler que lo vincule** (el
  backlog lo dejó «fuera de alcance»).
- La bandeja muestra `metodoPago` y `notas`; el ticket de delivery imprime dirección y observación.

## 2. Diseño propuesto

### 2.1 Moneda del menú (storefront)
- Selector en la barra (ícono de monedas junto a cuenta) con las monedas activas que tengan
  cotización vigente a la principal. Se recuerda por navegador.
- **Es de visualización**: la carta y el carrito muestran precios convertidos «≈ US$ 7,50», con la
  nota «Se cobra en ₲; el valor en otra moneda es aproximado». El pedido y su total siguen en la
  principal (el servidor no cambia cómo calcula).
- Conversión con la cotización que usa el local al **recibir** esa moneda (`compraLocal`): es la
  que va a aplicar el cajero al cobrar. Redondeo a 2 decimales (US$/R$), 0 en ₲.
- Nueva op pública `monedas.get`: monedas activas con cotización, decimales y símbolo (sin otros datos).

### 2.2 Pago del pedido (checkout)
Paso «¿Cómo pagás?» después de los datos de entrega:
- **Modalidad**: «Al recibir / retirar» (por defecto) | «Online» (sólo si hay métodos online).
- **Métodos** por modalidad, **configurables** en «Config Tienda Online» (cada uno con interruptor):
  - Al recibir: **Efectivo**, **Tarjeta (POS)**, **QR**, **PIX**, **Transferencia**, **Crédito**.
  - Online: **Tarjeta (uPay)** (lo que ya existe); el resto online queda para otra fase (§5).
- **Efectivo** → moneda (default: la elegida en el menú), «¿Necesitás vuelto?» y «Vuelto para».
  Chips: billetes de esa moneda (y sumas redondas de billetes) **mayores al total en esa moneda**,
  los 3–4 más chicos. El input acepta cualquier monto; tiene que ser mayor al total.
- **Crédito** → sólo se ofrece si la cuenta web está vinculada a un Cliente con crédito habilitado
  y el total entra en su disponible (`limite_credito − saldo`). Si no, no aparece.
- **Observación del pago** (texto libre, 200 caracteres), aparte de las notas del pedido.
- MESA_QR no cambia (paga en caja).

### 2.3 Servidor
- Migración aditiva en `pedidos_online`: `pago_modalidad` varchar(20), `pago_moneda_id` int,
  `vuelto_para` decimal(18,2), `pago_observacion` varchar(200). `metodo_pago` ya es varchar: nuevos
  valores TARJETA_POS, QR, PIX, TRANSFERENCIA, CREDITO (enum ampliado).
- Migración aditiva en `tienda_online_config`: `metodos_pago` (texto JSON con los habilitados).
- `crear-pedido-online` valida: método habilitado y coherente con la modalidad; moneda activa con
  cotización; `vuelto_para` > total convertido a esa moneda; crédito sólo con cliente vinculado,
  habilitado y con disponible; la observación en MAYÚSCULAS, recortada.
- Materialización: el pedido no se cobra solo (salvo uPay, como hoy); el **cajero ve** cómo va a
  pagar y cobra en el PdV como siempre. Crédito → el cobro a crédito existente (`cobrar-venta-credito`).

### 2.4 Lo que ve el local
- **Bandeja**: «Efectivo · paga con US$ 20 (≈ ₲ 120.000) · llevar vuelto ₲ 75.000», «Crédito · Juan
  Pérez», «QR al recibir», más la observación del pago.
- **Ticket de delivery**: las mismas líneas, para el repartidor (cuánto vuelto llevar y en qué moneda).
- **Panel de delivery del PdV**: el mismo resumen en la tarjeta del reparto.

### 2.5 Vinculación cuenta web ↔ Cliente (para crédito)
- Sin esto el crédito nunca aparece. Propuesta: en la bandeja (o en Clientes), «Vincular cliente»
  sobre la cuenta web del pedido, con permiso de clientes; sugerir por teléfono / documento.

## 3. Fases
1. Servidor: migraciones, enum, validaciones, `monedas.get`, config de métodos, vinculación de cuenta.
2. Tienda: selector de moneda + conversión, paso de pago, chips de vuelto.
3. Local: bandeja, ticket de delivery, panel de delivery, config de métodos.
4. Cierre: auditoría, `test:all`, `npm run check`, manual, docs.

## 4. Tests
- `test:pedidos-online-pago` (SQLite + Postgres): cada método por modalidad; método deshabilitado
  rechazado; vuelto ≤ total rechazado (en ₲ y en US$ con cotización ≠ 1); moneda sin cotización
  rechazada; crédito sin vínculo / sin crédito / sin disponible rechazado y con todo OK aceptado;
  observación en mayúsculas y recortada; el total cobrado no cambia por la moneda elegida.
- Función pura de chips de vuelto (`test:storefront-vuelto`): siempre > total, ordenados, sin
  repetidos, con billetes de cada moneda; total exacto a un billete → el siguiente.
- Conversión de moneda del menú: mismos números que el servidor para el total.
- Bandeja y ticket: el resumen del pago (texto) para cada caso.
- Verificación en Chrome (tienda a ancho de teléfono, bandeja, ticket de prueba).

## 5. Riesgos y fuera de alcance
- **QR / PIX / transferencia «online»** (pagar antes y que el local verifique): necesita comprobante y
  verificación manual (estado «pago a verificar»). Propuesta: en F8 esos métodos van «al recibir»
  (el repartidor muestra el QR / el cliente transfiere en el momento) y lo online queda en uPay.
- La cotización puede cambiar entre el pedido y el cobro: el vuelto se calcula al cobrar, el pedido
  sólo guarda «paga con X en moneda Y».
- Don Franco en canal alpha: todo nuevo detrás de la config (métodos habilitados); por defecto sólo
  efectivo, como hoy.

## 6. Decisiones del propietario (a preguntar después de la auditoría)
1. Qué es «QR»: ¿el QR del banco / billetera que el repartidor lleva, o QR de uPay?
2. Online además de tarjeta: ¿transferencia / PIX con comprobante ahora, o al recibir (propuesta)?
3. Vinculación para crédito: ¿manual desde la bandeja (propuesta), automática por teléfono/RUC, o ambas?
4. Moneda del menú: ¿sólo visualización (propuesta) o que el pedido quede en esa moneda?
5. Vuelto en efectivo en otra moneda: ¿el vuelto va en ₲ o en la misma moneda con que paga?

## 7. Auditoría del plan (2 agentes, 05/11) — hallazgos incorporados

**Técnica**
- ALTA · En el PdV `limite_credito = 0` es **sin tope** (`cobrar-venta-credito`: `limite > 0 && saldo > limite`).
  El «disponible = límite − saldo» del §2.2 está mal. → Helper único `disponibleCredito(cliente)`
  (exige `credito && activo`; tope sólo si `limite > 0`), usado por el PdV y por el pedido web.
- ALTA · La vinculación cuenta web → Cliente da crédito a quien controle la cuenta (OTP por WhatsApp):
  riesgo de fraude si se vincula por teléfono sin verificar; la búsqueda expone datos del cliente;
  `/api/rpc` es default-allow. → Sólo manual, con permiso de clientes, campos mínimos y registro de
  quién vinculó. Nunca automática.
- MEDIA · El crédito se chequea al pedir y se carga al cobrar (sin reserva): el chequeo web es un
  filtro de oferta; el PdV revalida y la bandeja avisa si ya no alcanza.
- MEDIA · Moneda: «extranjera → principal = × `compraLocal`» ya es la regla del repo
  (`moneda.utils.ts`, `conversion-moneda.ts`, cobro del PdV) — se usa esa, resuelta en el servidor
  (`monedas.get`), no reimplementada en la tienda. Decimales de `Moneda.decimales`, no fijos.
  Comparación de vuelto con tolerancia, sobre el total redondeado hacia arriba en esa moneda.
- MEDIA · Validaciones del pago después de calcular el total del servidor y antes de guardar; el
  reintento idempotente devuelve el original; uPay fuerza modalidad online e ignora vuelto; MESA_QR
  ignora todo lo nuevo.
- MEDIA · Ticket de delivery: el builder recibe `deliveryId`; el pedido se busca por
  `pedidos_online.delivery_id`. Sin pedido (delivery del PdV) no cambia nada. El pago declarado no
  suma a «ya pagado».
- Chips: `monedas_billetes` activos de la moneda (`valor` como string en PG); sin billetes → sólo el
  campo libre; total mayor al billete más grande → sumas; total igual a un billete → el siguiente.
- Migración con ms reales, driver-aware, `IF NOT EXISTS`, tipos explícitos; default «sólo efectivo»
  también en el código.

**Alcance y convenciones**
- ALTA · Crédito + vinculación es otro proyecto: separarlo a **F8b** (propuesta), con CREDITO oculto
  hasta entonces.
- ALTA · Reabre la decisión documentada «pago efectivo contra entrega» (`pedidos-online.md`,
  `todos-pendientes.md`): se dice explícitamente y se actualizan esos docs al cierre.
- ALTA · «Online» del propietario incluye QR/PIX/transferencia; el plan los pasaba a «al recibir»
  → decisión del propietario.
- Guardar la cotización usada en el pedido (ticket y auditoría).
- Storefront ya usa funciones en templates; lo nuevo (chips, conversión) va precalculado.
- Tests extra: límite 0, concurrencia de crédito, moneda desactivada entre menú y pedido, MESA_QR,
  pedidos viejos con columnas nuevas en NULL, reintento idempotente, uPay con campos de efectivo,
  cotización cargada sólo en sentido inverso, todo también en Postgres.
- Docs: handlers-index, enums-index, entities-index, dominio, backlog, manual.

## 8. Decisiones del propietario (05/11, tras la auditoría)
1. **Crédito y vinculación cuenta web ↔ Cliente → F8b**, aparte. En F8 el método CREDITO no existe.
2. **QR, PIX y transferencia se pagan al recibir / retirar.** Online queda sólo la tarjeta (uPay).
3. **Moneda del menú: sólo visual; por detrás todo es guaraní.** Y además: **el pago que elige el
   cliente se precarga en el módulo de delivery del PdV, sin finalizarlo.** Como agregar una línea
   en el cobro ya la guarda (`createPagoDetalle`), «precargar» = el diálogo de cobro del delivery se
   abre con forma de pago, moneda y monto («paga con») ya puestos en los campos; nada se guarda
   hasta que el cajero agrega la línea y finaliza, como siempre.
4. **El vuelto va en guaraníes**, aunque pague en otra moneda.

## 9. Alcance final de F8
- Servidor: migración (pago_modalidad, pago_moneda_id, vuelto_para, pago_cotizacion, pago_observacion
  en `pedidos_online`; metodos_pago en `tienda_online_config`), enum ampliado (TARJETA_POS, QR, PIX,
  TRANSFERENCIA), validaciones, `monedas.get`, config de métodos.
- Tienda: selector de moneda (visual), paso de pago, chips de vuelto (función pura).
- Local: resumen del pago en bandeja, ticket de delivery y panel de delivery; precarga del cobro;
  interruptores de métodos en «Config Tienda Online».
