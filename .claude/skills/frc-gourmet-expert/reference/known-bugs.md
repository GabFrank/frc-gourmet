# Bugs conocidos sin resolver

Snapshot **2026-06**. Verificar `git log` / el código antes de afirmar que algo sigue roto. La sección de **Seguridad** está mayormente resuelta (bcrypt, JWT en keytar, permisos en backend, must-change-password) — ver detalle abajo y [architecture/auth-permissions.md](../architecture/auth-permissions.md).

## Ventas / PdV

### ✅ RESUELTO — Se podían desactivar líneas de pago de otra caja, incluso cerrada (2026-08-27)

**Síntoma:** el arqueo de una caja ya cerrada cambiaba retroactivamente, después
de impreso el cierre y generado el retiro.

**Causa:** `registrarCobroParcial` tagueaba `PagoDetalle` filtrando **sólo por
id**, sin exigir que pertenecieran al pago de esa venta. Encadenado con
`anularCobroParcial` —que **no tiene ningún llamador en el frontend**, sólo la
plomería del repositorio— las ponía `activo = false`. Como el resumen de caja
filtra por `activo`, esa plata desaparecía del arqueo ajeno. Alcanzaba con
`VENTAS_PDV` + `VENTAS_COBRAR`, por `/api/rpc` directo.

**Resuelto:** se valida la pertenencia de **todas** las líneas antes de tocar
nada (`PAGO_DETALLE_AJENO`), y `anularCobroParcial` exige la venta ABIERTA.
Test: `npm run test:integridad-cobro`.

### ✅ RESUELTO — El gate de cobro era auto-derrotable con `updatePago` (2026-08-27)

`Pago.caja` es lo **único** que lee el gate de `createPagoDetalle`, y el merge de
`updatePago` la aceptaba: `updatePago(id, { caja: null })` desactivaba el gate
para todas las líneas siguientes, con una llamada de apariencia inocente. Lo
mismo con `updateVenta` (movía una venta CONCLUIDA con todo su cobro a otra caja)
y `update-caja` (una terminal se apropiaba de una caja ajena). **Resuelto**
descartando esas propiedades del merge en los tres handlers.

### ✅ RESUELTO — El cobro a crédito nunca creaba las acreditaciones (2026-08-27)

**Síntoma:** ninguno. La venta cerraba, la CPC se creaba bien, y la plata cobrada
con tarjeta o transferencia **no entraba al ledger bancario**: no se conciliaba,
no descontaba comisión, desaparecía del banco.

**Causa:** `AcreditacionPos` y `acreditarTransferenciaBancaria` estaban embebidas
en `finalizar()`, y el cobro a crédito cierra la venta por otro camino. En un
cobro mixto (300.000 con tarjeta + 200.000 a crédito) se perdían los 300.000.

**Resuelto:** extraído a `registrarAcreditaciones()`, llamado desde los dos
caminos. De paso, el bucle pasó a tener un `try` **por línea** (antes uno solo
envolvía el `for`, así que si fallaba la 2ª de 3 la 3ª ni se intentaba) y avisa
cuántas quedaron sin registrar.

### ✅ RESUELTO — Se acreditaba el monto sin su moneda (2026-08-27)

`create-acreditacion-pos` y `acreditar-transferencia-bancaria` recibían un monto
desnudo y lo sumaban al saldo de la cuenta, que tiene su propia moneda. Los
atajos F1/F2/F3 del diálogo de cobro cambian la moneda de la línea **sin** tocar
la máquina POS elegida, así que 40 dólares se acreditaban como **40 guaraníes**.
Sumado a que **F4–F7** asignaban la forma de pago sin llamar `onFormaPagoChange()`
(dejando la máquina POS de la forma anterior), la plata terminaba en otro banco.
**Resuelto**: los dos handlers reciben `monedaId` y rechazan si difiere,
**fallando abierto** cuando la cuenta no tiene moneda cargada.

### ✅ RESUELTO — El resumen de caja concatenaba strings en Postgres (2026-08-27)

`PagoDetalle.valor` es `decimal` y el driver de Postgres lo devuelve como
**string** (no hay `pg.types.setTypeParser(1700)` en el repo). Las 7
acumulaciones de `computeResumenCaja` y los 2 totales de conteo usaban `+=` sin
castear: dos pagos de 150.000 y 50.000 daban `"0150000.0050000.00"`, el esperado
salía `NaN`, y tanto el ticket de cierre como el semáforo de diferencia de caja
imprimían `NaN`. **Resuelto** con `Number()` en los 9 puntos.
Test: `npm run test:resumen-caja-numeros` (usa un `Proxy` sobre el `DataSource`
porque SQLite aplica NUMERIC affinity y por la base es imposible reproducirlo).

### ✅ RESUELTO — El cobro rápido (F2) daba NaN y regalaba el envío (2026-08-27)

Misma causa que el anterior, sin `Number()`, y encima el guard `if (total <= 0)`
**no atrapa `NaN`**, así que seguía y persistía un `PagoDetalle` con `valor: NaN`.
Además ignoraba `costoDelivery`, y F2 **sí es alcanzable sobre un delivery**
(editar ítems desde el diálogo deja el delivery como venta rápida): el envío se
regalaba. Es el mismo bug que la auditoría de delivery dio por cerrado,
sobreviviendo por otro camino.

### ✅ RESUELTO — El ticket afirmaba un saldo sin cotización, y escondía el vuelto (2026-08-27)

`montoAPrincipal` cuenta una divisa 1 a 1 con el guaraní cuando no encuentra
tasa. Un delivery de 500.000 con 60 USD adelantados y la cotización vencida
imprimía `SALDO A COBRAR 499.940` — el cliente pagaba dos veces. Con un adelanto
grande el saldo daba 0 y salía **`PAGADO — NO COBRAR`**, peor todavía. **Resuelto**
con el flag `sinCotizacion`, evaluado **antes** que el chequeo de saldo.

Y un sobrepago sin línea de VUELTO se aplastaba con `Math.max(0, …)`: el papel
decía `PAGADO` y el vuelto a devolver desaparecía. Hoy imprime
`VUELTO A ENTREGAR`.

### ✅ RESUELTO — Re-finalizar una venta ya cobrada duplicaba la acreditación (2026-08-27)

Un delivery EN_CAMINO con cobro anticipado abría el diálogo con las líneas
cargadas y saldo 0, así que FINALIZAR quedaba habilitado. `updateVenta` no frena
la transición CONCLUIDA→CONCLUIDA y `acreditar-transferencia-bancaria` **no es
idempotente**: se creaba una segunda `AcreditacionPos` y se sumaba de nuevo al
saldo bancario. **Resuelto** con un guard en `finalizar()` y deshabilitando el
botón PAGO sobre una venta ya cobrada.

### ✅ RESUELTO — El gate se hacía pasar por la terminal del servidor (2026-08-27)

Reemplaza a la limitación que este mismo archivo daba por "abierta y aceptable".
`resolveRequestDeviceId` heredaba el dispositivo del proceso servidor para
requests HTTP sin `device_id` (sólo el modo cliente lo manda). Producía **falso
bloqueo** en `/admin` y la PWA: el frontend calcula `currentDeviceId = null`,
habilita los botones, y el backend los rechaza. **Resuelto** con
`resolveGateDeviceId`, que resuelve `null` (indeterminado ⇒ no bloquea) y se usa
sólo para el gate, no para persistir `dispositivo_id`.

### El chip del PdV muestra saldo BRUTO y el ticket muestra dinero — ABIERTO

**Síntoma:** para el mismo delivery, la pantalla dice `Saldo 50.000` y el papel
`SALDO 45.000`.

**Causa:** son dos fuentes distintas. El chip sale de `getEstadoCobroVentaInternal`
→ `pendienteBruto`, que mide **cobertura por ítem en bruto** (pre-descuento
global, sin conversión de moneda, y con el envío contado como deuda que ningún
ítem puede cubrir). El ticket sale de `PagoDetalle`, que es **dinero**. Divergen
con descuento global, con cobro rápido F2 y con venta a crédito (que no imputan),
y con el envío siempre.

**La del ticket es la correcta** para "cuánta plata falta". `montoCubierto` es un
cache para bloquear la edición de ítems ya cobrados, no una respuesta de caja.
**Fix propuesto:** que `getEstadoCobroVentaInternal` devuelva también
`pendienteDinero` y que el PdV muestre ese.

### La cotización se busca sin dirección — ABIERTO

`tasaVsPrincipal` (ticket) acepta la fila `MonedaCambio` **en cualquier sentido**
y devuelve `compraLocal` crudo, mientras `moneda.utils.ts:getCotizacionBidireccional`
sí invierte. Con las dos filas cargadas, `.find()` toma la más reciente, que puede
ser la inversa: un `TOTAL USD` de 13,70 sale 729.927.007.

**Por qué sigue abierto:** el mismo criterio literal está en
`cobrar-venta-dialog` (`getExchangeRate`), `pdv.component` y `delivery-dialog`.
Arreglar sólo el ticket haría que imprima un número distinto del que el cajero ve
en pantalla — peor que el bug. **Fix propuesto:** normalizar en el **punto de
escritura** (`create-edit-moneda-cambio-dialog`: que `monedaDestino` sea siempre
la principal, o invertir al guardar) y después migrar los cuatro consumidores en
un solo movimiento. Ojo que el fixture de `test-ticket-delivery-pagos-e2e.ts`
carga la fila en el sentido contrario al de `moneda.utils.ts` y pasa **sólo**
porque la función es simétrica: hay que corregirlo junto con el resto.

### Otros descuadres de la misma familia — ABIERTOS (menores)

- `calculateTotals()` del PdV: sin `Number()` y sin `costoDelivery`, el footer
  muestra para un delivery un total menor que el que el cobro va a cobrar.
- `detalleTotal` del diálogo de delivery: no resta `descPago` ni suma `aumPago`
  (el mismo bug que se arregló en el ticket, vivo en el panel y en la grilla).
- `getVentasTotalByCaja` agrupa por moneda y el frontend se queda **sólo con la
  fila de la principal**: una caja con ventas en USD/BRL muestra un total
  subvaluado, sin ninguna señal.
- Falta de cotización: los dashboards la descartan (`|| 0`), los tickets y el
  diálogo la cuentan como PYG, `moneda.utils` devuelve `null`. Tres convenciones
  para el mismo faltante.
- `procesarStockVenta` y la ronda final de cobro son fire-and-forget con
  `console.error`: si fallan, nadie se entera. Necesitan reintento, no un parche.
- `deletePagoDetalle` sigue siendo hard delete (sin rastro de auditoría);
  convertirlo en soft-delete exige que `getPagoDetalles` filtre `activo`, si no
  el diálogo de compras mostraría líneas borradas.
- `delivery-cancelar` y `rechazar-pedido-online` revierten el cobro **sin
  chequear que la caja esté abierta** (misma clase que `anularCobroParcial`, otra
  superficie).
- `anularCobroParcial` no tiene llamador en la UI: una ronda registrada no se
  puede deshacer desde el PdV.

### ✅ RESUELTO — El gate de cobro por dispositivo se podía saltear de tres maneras (2026-08-27)

**Síntoma:** en una terminal unida a una caja abierta en otra, el botón COBRAR
estaba bloqueado, pero el cobro se completaba igual por otros caminos.

**Causa:** el gate existía en un solo punto (`createPago` con
`validarDispositivoCaja`) y tres caminos no pasaban por ahí:

1. **`openAjusteDialog`** (botón Descuento/Aumento, y **F9**) creaba el `Pago`
   **sin** el flag. Con el `Pago` creado por esa vía, todo lo demás pasaba.
2. **`cobroRapido` (F2)** no chequeaba nada ni mandaba el flag: cobraba completo
   y concluía la venta.
3. **`createPagoDetalle` no estaba gateado.** Si el `Pago` ya existía —cobro
   anticipado de un delivery, diálogo reabierto— la terminal ajena podía seguir
   agregando líneas de dinero.

Y dos caminos de finalización no tenían gate en absoluto:
**`cerrarVentasAbiertasMesa`** (concluye con `repo.save()` directo, sin pasar
por `updateVenta`) y **`cobrar-venta-credito`**.

**Resuelto** al hacer el cobro configurable: el gate vive ahora en
`electron/utils/terminal-caja.utils.ts` y se aplica en los cinco caminos.
`createPagoDetalle` resuelve la caja **server-side** desde el id del pago —
hacerlo desde el payload lo habría dejado en no-op, porque `getVenta` no carga
`pago.caja`. Test: `npm run test:terminal-caja`.

### ✅ RESUELTO — Los rechazos del cobro se tragaban en `console.error` (2026-08-27)

**Síntoma:** *"aprieto agregar y no pasa nada"*. El backend rechazaba con
`COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO` y el `catch` del diálogo sólo hacía
`console.error`. Sin devtools abiertas, el cajero no tenía forma de saber por
qué. **Resuelto**: los cinco `catch` traducen el código a un snackbar en
español.

### ✅ RESUELTO — El destino de acreditación (POS / banco) se perdía al recargar el cobro (2026-08-27)

**Síntoma:** ninguno visible. Al finalizar no se creaba la `AcreditacionPos` ni
se acreditaba la transferencia bancaria, en silencio — el bloque que las genera
corre en un `try/catch` no bloqueante.

**Causa:** `pagos_detalles` no tenía dónde guardar la máquina POS ni la cuenta
bancaria elegidas: el vínculo vivía **sólo en memoria** del diálogo de cobro (en
`DetalleRow`). Bastaba cerrar y reabrir el diálogo para que `loadExistingPago`
reconstruyera las filas desde la base y el destino desapareciera.

**Resuelto** con las columnas `maquina_pos_id` / `cuenta_bancaria_id`
(migración `PagoDetalleDestinoAcreditacion`). Era un bug preexistente; el cobro
repartido entre terminales lo convertía en el camino normal.

### ✅ RESUELTO — El ticket de delivery imprimía un total distinto al del comprobante (2026-08-27)

**Síntoma:** un delivery con descuento global (F9) salía impreso con un total
mayor en el ticket de reparto que en su propio comprobante de venta.

**Causa:** `printDeliveryTicketInternal` calculaba
`total = ítems − descuentoItems + envío`, ignorando los `PagoDetalle` de tipo
DESCUENTO/AUMENTO que `buildVentaTicketLines` sí aplica. Era cosmético hasta que
el ticket empezó a imprimir el saldo: sobre esa base, el repartidor cobraba un
descuento que el cajero ya había otorgado.

**Resuelto** alineando el cálculo. Test: `npm run test:ticket-delivery-pagos`,
bloque «Descuento de nivel pago».

### El gate por dispositivo no distingue una sesión web de la terminal del servidor — ABIERTO (menor)

**Síntoma:** una sesión web o de la PWA móvil contra un nodo `server` se ve
como "la terminal del servidor" a efectos del gate de cobro.

**Causa:** `resolveRequestDeviceId` cae al dispositivo local del proceso cuando
el request llega por HTTP **sin** `device_id` en el JWT. El modo cliente sí lo
manda (`auth-routes.ts`); el login web y el de la PWA, no.

**Por qué no se arregló:** resolverlo a `null` **afloja** el gate en vez de
apretarlo — un device indeterminado no bloquea, a propósito, para no romper las
instalaciones de un solo equipo. Apretarlo de verdad exigiría decidir qué pasa
con el cobro desde `/admin`, que hoy funciona. Hoy no tiene impacto real: la PWA
móvil **no cobra** (`mesa-detalle.page.ts` lo dice explícito). Revisar cuando el
mobile gane cobro.

### `createVentaItem` acepta el precio que le mande el cliente — ABIERTO

**Síntoma:** ninguno visible. El handler hace `repo.create(data)` y guarda el
`precioVentaUnitario` tal cual viene del renderer, sin contrastarlo contra el
catálogo. Como `/api/rpc` es **default-allow**, cualquier cliente con
`VENTAS_PDV` puede crear un ítem con el precio que quiera llamando al handler
directo. Comprobado el 2026-08-25: se creó un ítem de un producto de 25.000 a
**1 guaraní** y entró sin una sola queja.

**Por qué sigue abierto:** el PdV calcula el precio en el front (variaciones,
adicionales, promociones, tipo de precio por cliente) y lo manda ya resuelto.
Validarlo en el backend implica reimplementar ahí esa resolución, que es
exactamente lo que hace `resolveOpcion` en el flujo de pedidos online — o sea,
existe el modelo a seguir, pero es trabajo de verdad y toca el PdV entero.

Lo que **sí** se cerró en 2026-08-25 es el caso más grosero: un producto
`ELABORADO_CON_VARIACION` sin `recetaPresentacion` ahora se rechaza
(`validarVariacionDelItem`, en `createVentaItem` y `updateVentaItem`). Antes se
podía vender «1 PAPAS FRITAS» sin tamaño ni sabor, y ese ítem seguía a la
comanda de cocina y al ticket sin describir nada cocinable. Test en
`scripts/test-cobro-parcial-e2e.ts`, bloque «variación».

**Regla general que deja esto:** en este repo, *toda* validación que sólo vive
en un diálogo del PdV es evadible. El diálogo es ergonomía; el guard del
handler es la única frontera.

## Impresión

### Los tickets imprimían `?` por cualquier carácter fuera de CP437 — RESUELTO (2026-08-25)

**Síntoma:** un signo de pregunta en el papel donde iba un carácter. Sin error
en ningún log: el ticket sale, el handler devuelve `ok: true`.

**El caso que dolía:** todos los strings van en UPPERCASE y CP437 **no tiene
`Á`**, así que un cliente llamado «Ángel» se imprimía «?NGEL» en todos los
tickets. Venía de siempre; se descubrió recién cuando el `×` de un separador
nuevo tampoco salía.

**Resuelto** con `sanitizarParaTicket` en `ticket.utils.ts`, aplicado al
construir cada línea. Detalle y tabla de qué sobrevive en
[domains/tickets-impresos.md](../domains/tickets-impresos.md) → «El charset».

## Cocina / delivery

### El delivery nunca imprimía su comanda — RESUELTO (2026-08-25)

**Síntoma:** un ítem de delivery aparecía en la pantalla de cocina (KDS) pero el
papel no salía nunca. `printComandaInternal` devolvía `ok: true`, sin errores,
sin nada en los logs.

**Causa:** el predicado de "va a cocina" está escrito en **tres** lugares y sólo
se movieron dos. `crearComandaItemsSiCorresponde` y `autoPrintComandaIfNeeded`
ya aceptaban delivery y pedidos web; `printComandaInternal` seguía exigiendo
mesa o comanda y cortaba por su early return. Detalle y tabla de los tres gates
en [domains/cocina-impresion.md](../domains/cocina-impresion.md).

**Cómo no repetirlo:** los tres cargan `relations: ['mesa','comanda','delivery']`.
Si una relación no se carga, el gate lee `undefined` y volvés al mismo bug mudo.
Tests en `scripts/test-ticket-venta-e2e.ts`, bloque «gate cocina».

### Un pedido rechazado podía resucitar — RESUELTO (2026-08-25)

**Síntoma (teórico, encontrado en auditoría, no reportado en producción):** con
dos operadores, rechazar un pedido justo mientras se materializaba dejaba el
pedido en `EN_PREPARACION` con venta viva y comanda impresa, pese al rechazo.

**Causa:** `aceptar-pedido-online` marca `ACEPTADO` sin lock y materializa
después; el `save` final de la materialización usaba el objeto `pedido` cargado
al abrir su transacción y pisaba el `RECHAZADO` comiteado en el medio. Se cerró
releyendo el estado dentro de la transacción antes de escribir. Detalle en
[domains/pedidos-online.md](../domains/pedidos-online.md) → «Concurrencia».

## Fechas / períodos

### Filtro por rango de fechas devolvía CERO en SQLite — RESUELTO (2026-08-24)

**Síntoma:** en modo standalone (SQLite), cualquier consulta acotada a "hoy"
devolvía cero filas. No lanzaba error — devolvía un total vacío, que se lee como
"no hubo ventas".

**Causa:** TypeORM escribe `created_at` con el literal `datetime('now')` →
`YYYY-MM-DD HH:MM:SS`, UTC y **sin `T` ni `Z`**. Los handlers arman los límites
del rango con `Date.toISOString()` → `2026-08-24T03:00:00.000Z`. SQLite compara
esa columna como **texto**, y el espacio (`0x20`) ordena **antes** que la `T`
(`0x54`):

```
'2026-08-24 09:40:12' >= '2026-08-24T03:00:00.000Z'   →  FALSO
```

En Postgres no pasaba: ahí la columna es `timestamp` de verdad y el driver
castea el ISO. Por eso sobrevivió — producción corre Postgres.

**Por qué no lo agarró ningún test:** los tests sellaban `created_at` en ISO, el
mismo formato ficticio que usaban los límites. Coincidían **entre sí** y pasaban
mientras la app devolvía cero. Un test que miente en las dos puntas no prueba nada.

**Fix:** `dbQuery` normaliza los parámetros ISO-Z al formato del driver cuando el
driver es SQLite — el **límite**, no la columna, para no perder el índice. Punto
único, cubre los 65 call sites. **Si escribís una consulta de fechas con
`ds.query()` directo, no tenés esa red.** `test:kpis-filtros` ancla que el formato
sembrado siga siendo el que escribe BaseModel.

### Rangos `custom` de los reportes corrían un día — RESUELTO (2026-08-24)

`new Date('2026-07-15')` es **UTC-medianoche**: en Paraguay (UTC-3/-4) eso cae el
14 a la noche, así que todo rango `custom` arrancaba y terminaba un día antes. Se
parsea con `parseFechaLocal()` (`shared/utils/dashboard-rangos.util.ts`), que
interpreta `YYYY-MM-DD` como fecha local y deja los ISO con hora al parser nativo.

## RRHH / Financiero

### Operación Financiera: campos requeridos que la UI no poblaba — RESUELTO (2026-08)

**Síntoma:** en la PWA, *Gestión de Caja Mayor → Operaciones financieras*, el
**cambio de divisa nunca se podía guardar**: "Completá los campos requeridos" sin
ningún campo marcado en rojo. Y después de alternar entre tipos de operación,
otros tipos también quedaban trabados.

**Causas (5, de la misma familia):**
1. `formaPagoDestinoId` es requerido en `CAMBIO_DIVISA` (el handler lo usa para el
   movimiento de INGRESO y `actualizarSaldo`; la columna es `nullable: false`),
   pero la PWA lo seteaba sólo si había select de **caja destino**. En un cambio
   de divisa el ingreso vuelve a la MISMA caja ⇒ no hay tal select ⇒ `null`.
   La pregunta correcta es "¿este lado mueve caja mayor?" (`LADOS_CAJA_MAYOR`),
   no "¿se muestra un select de caja?" (`CAJAS_EN_UI`).
2. Al cambiar de tipo se limpiaban las monedas pero se re-derivaban sólo desde
   `cuentaBancaria*Id.valueChanges`; con el select de cuenta sobreviviendo al
   cambio (RETIRO↔TRANSF. BANCARIA, DEPOSITO↔TRANSF. BANCARIA) la moneda quedaba
   `null` e **irrecuperable** — reelegir la misma opción en un `mat-select` no
   emite `valueChanges`.
3. Con las monedas nulas, `recalcularMontoDestino()` perdía el flag `principal` y
   multiplicaba en vez de dividir ⇒ monto convertido incorrecto.
4. Escritorio: `applyValidators()` cambiaba validadores pero nunca los VALORES ⇒
   relaciones bogus persistidas (la cuenta de un depósito adjunta a un cambio de
   divisa).
5. El mensaje era genérico y no nombraba nada, justo cuando el campo culpable no
   se renderiza.

**Fix:** la fuente única `operacion-financiera-validacion.util.ts` ahora declara
`LADOS_CAJA_MAYOR`/`CAJAS_EN_UI`/`CUENTAS_EN_UI`/`COTIZACION_EN_UI` y el invariante
`fuenteDelCampo()`; ambas superficies derivan de ahí su visibilidad y su
auto-completado, y `camposFaltantes()`/`validarCoherencia()` dan mensajes
concretos. El test `npm run test:operacion-financiera` pasó de auditar sólo las
monedas (20 asserts, pasaba **con el bug presente**) a auditar todos los campos
requeridos (122). Detalles → [../domains/financiero-caja-mayor.md](../domains/financiero-caja-mayor.md).

### `npm test` (unit tests del desktop) no corre: import circular — pendiente

**Síntoma:** `ng test` del proyecto desktop aborta con
`Uncaught ReferenceError: Cannot access 'TabsService' before initialization`
(desde `list-monedas.component.ts`), y ningún spec del desktop llega a ejecutarse.

**Estado (2026-08):** antes fallaba todavía antes, con
`Cannot find module 'karma-coverage'` — el target `test` de `angular.json` no
declaraba `karmaConfig` y el builder por defecto exige ese plugin, que no está en
`devDependencies`. Eso **ya se arregló**: hay un `karma.conf.js` en la raíz
(espejo del de `projects/mobile`) y el target lo usa, así que los specs del
desktop se pueden correr de a uno:

```bash
npm run test:operacion-financiera-dialog   # ng test --include='**/<spec>.ts'
```

Lo que queda es el **ciclo de imports** (`TabsService` → `HomeComponent` → … →
`TabsService`), que revienta al cargar todo el bundle de tests junto. Arreglarlo
requiere romper el ciclo (probablemente con `forwardRef` o moviendo el registro de
componentes de tab fuera del service). Mientras tanto, correr specs de a uno.

### `test:pedidos-online` — 1 assert rojo en develop (pendiente)

`✗ pedido.crear sin token → 401` falla en `develop` limpio (70 passed, 1 failed),
sin relación con caja mayor. Verificado en worktree sobre `origin/develop` el
2026-08-21. Si vas a tocar pedidos online, arrancá sabiendo que ese assert ya
está rojo.

### Liquidaciones mezclan monedas (multimoneda) — pendiente

**Síntoma:** en el cálculo de liquidación de sueldo y final, un vale/cuota en USD/BRL se netea/suma contra haberes en PYG como si fuera la misma moneda (ej. un vale de 100 USD "cancela" 100 Gs de haberes).

**Causa de raíz:** `LiquidacionItem` y `LiquidacionFinalItem` **no tienen columna de moneda** — al copiar un vale/cuota a un item se pierde su identidad de moneda, y `recalcularTotales` suma `Number(monto)` crudo. Ningún handler de liquidación importa `MonedaCambio`.

**Estado (2026-07):** la **capa de resumen/agregación** ya está arreglada (PR #198): `get-funcionario-resumen-financiero` y `dashboard-rrhh.totalNominaMes` convierten a PYG con `electron/utils/moneda.utils.ts` (`convertirAPrincipal`). El **cálculo interno de liquidación** sigue pendiente — requiere **migración** (agregar moneda + cotización a los items) + **decisión de política**: (a) convertir con la cotización al crear el item, o (b) bloquear/avisar si hay items en otra moneda que la liquidación. No se tocó porque afecta plata que se paga. Ver [../domains/rrhh-liquidaciones.md](../domains/rrhh-liquidaciones.md).

## Productos / Recetas

### Vínculo Producto↔Receta roto — RESUELTO (2026-08)

**Síntoma:** en el tab Recetas del alta de producto, "Buscar Receta" siempre daba error al asignar una receta existente (sólo funcionaba "Crear Receta"), y al desvincular una receta ésta seguía vinculada al reabrir el producto.

**Causa:** tres bugs encadenados sobre un 1:1 con **dos owning sides** (`producto.receta_id` y `receta.producto_id`, ambos UNIQUE), gemelos del mismo commit de 2026-03:
1. `update-receta` asignaba `productoId`, propiedad que `Receta` nunca declaró → no-op silencioso.
2. `update-producto` desvinculaba con `producto.receta = undefined`; TypeORM no emite UPDATE para `undefined` → `producto.receta_id` quedaba ocupado para siempre.
3. El buscador filtraba por `receta.producto` (columna deprecada, siempre NULL) → ofrecía recetas ya ocupadas, y asignarlas explotaba con `UNIQUE constraint failed: producto.receta_id`.

**Fix:** `producto.receta_id` como única fuente de verdad; `receta.producto_id` documentada como deprecada con virtual `productoVinculado` en su lugar; handlers atómicos `vincular-receta-a-producto` / `desvincular-receta-de-producto` y `get-recetas-asignables` (filtra las 4 FKs de dueño en SQL). Arrastró además: `ventas.handler` (atajos de PdV sin precio para pizzas), `calcular-costo-receta` (PrecioCosto sin producto), `delete-receta-for-adicional` (mismo bug del `undefined`), `gestion-recetas` (recetas de variación secuestrando `producto.receta_id`) y dos pantallas de la PWA mobile. Test: `npm run test:receta-vinculo`. Detalles → [../domains/recetas-sabores-variaciones.md](../domains/recetas-sabores-variaciones.md).

### Datos ya vinculados por error — pendiente (saneamiento)

**Síntoma:** bases anteriores al fix de arriba pueden tener `producto.receta_id` apuntando a la receta de una **variación** o de un **adicional** (el buscador nunca filtró nada). Efecto colateral: `delete-sabor` / `delete-receta` fallan con `FOREIGN KEY constraint failed` sin explicar por qué.

**Detección** (no automatizada todavía):
```sql
SELECT p.id, p.nombre, rp.id FROM producto p JOIN receta_presentacion rp ON rp.receta_id = p.receta_id;
SELECT p.id, p.nombre, a.id  FROM producto p JOIN adicional a           ON a.receta_id  = p.receta_id;
SELECT COUNT(*) FROM receta WHERE producto_id IS NOT NULL;  -- debe dar 0 siempre
```

**Por qué no hay migración automática:** desvincular a ciegas dejaría productos elaborados sin receta y rompería el descuento de stock. Requiere un handler de diagnóstico + decisión del usuario, al estilo de `reparar-recetas-compartidas`.

### `update-producto` ignora `requiereComanda` — pendiente

**Síntoma:** el campo se manda desde `gestionar-producto.service.ts` y desde `producto-edit.page.ts` (mobile) pero `update-producto` no lo procesa: se descarta en silencio y el campo es inedi­table.

**Causa:** falta el `if (productoData.requiereComanda !== undefined)` en el handler. La columna existe (migración `1779100000000-AddRequiereComandaToProducto`).

## Frontend / UI

### `findPrecioCosto()` retorna 0 hardcodeado

**Síntoma:** en algunas vistas de productos, el costo aparece como 0 aunque en BD haya un PrecioCosto válido.

**Causa:** `findPrecioCosto()` en algún componente está hardcodeado para retornar 0 (TODO comentado en código).

**Ubicación:** mencionado en `docs/guia-funcionamiento-punto-de-venta.md:719`. Probablemente en componentes de productos o cálculos en venta.

### Categorías PdV — click no agrega al carrito

**Síntoma:** los items de categoría se muestran en el PdV pero hacer click no agrega productos al carrito.

**Causa:** flujo no implementado. UI muestra los `PdvCategoriaItem` pero falta el binding al `addProduct()`.

**Workaround:** usar el sistema de **Atajos** (tab "ATAJOS" en PdV) o el buscador de productos.

### `marcar-asistencia-masiva-dialog` layout roto

**Síntoma:** el grid de la asistencia masiva tiene columnas que se desbordan, obligan a scroll horizontal. La columna "Turno" aparece más allá del área visible.

**Causa:** layout no responsive.

**Fix pendiente:** rediseñar usando `mat-table` o grid responsive con columnas (Funcionario, Estado, Entrada, Salida, Turno) y permitir cambio de tamaño del dialog.

### Mat-chip standalone fuera de chip-listbox

**Síntoma:** `<mat-chip>` suelto se renderiza con layout block/flex propio que no respeta `inline-flex`. Aparece pegado al borde derecho del cell o cubriendo ancho completo.

**Solución:** usar `<span class="chip-xxx">` con estilo manual. → [conventions/ui-patterns.md](../conventions/ui-patterns.md).

### Budget CSS

**Síntoma:** warning al compilar — varios `.scss` exceden el límite de 10 KB configurado en `angular.json`.

**Impact:** no afecta funcionalidad. Solo warning.

**Fix:** subir el budget a 15-20 KB en `angular.json`, o partir SCSS grandes en sub-archivos.

### ✅ RESUELTO — Elaborados con variación mostraban precio `0` en las listas (2026-08-18)

**Síntoma:** en el buscador del PdV, en el grid de atajos y en la búsqueda /
atajos de la PWA, una pizza o una milanesa con variación aparecía con precio
`0`, aunque sus variaciones tuvieran precio cargado.

**Causa:** `search-productos-by-nombre` resolvía el precio con
`innerJoin pv.receta … receta.productoVariacion`, y `getPdvAtajoItemProductos`
con el 1:1 legacy `receta.producto_id`. Desde el refactor de julio el precio de
una variación cuelga de **`PrecioVenta.receta_presentacion_id`**, así que ninguna
de las dos consultas devolvía filas.

**Fix:** helper único `electron/utils/variacion-precio.utils.ts`
(`getRangosPrecioVariacion`, batch + fallback legacy); ambos handlers devuelven
`variacionResumen` con el rango y `principalPrecio` pasa a ser la variación más
barata. Las listas muestran `desde – hasta`.

**Gotcha:** un producto con variación **no tiene un precio**; cualquier vista
nueva que necesite mostrarlo debe usar ese helper, nunca `pv.receta_id`.
→ [../domains/recetas-sabores-variaciones.md](../domains/recetas-sabores-variaciones.md).

### ✅ RESUELTO — Ingrediente opcional sin nombre en el PdV (2026-08-17)

**Síntoma:** en el diálogo de personalización, el chip de un ingrediente
OPCIONAL salía vacío (sólo el tilde), y el chip del detalle del ítem decía `SIN`
sin el nombre. La comanda impresa, en cambio, decía `SIN ACEITUNAS`.

**Causa:** `RecetaIngrediente.ingrediente` es nullable — el ingrediente puede
estar cargado sólo con `descripcion`. La comanda y el KDS ya hacían
`ingrediente?.nombre || recetaIngrediente?.descripcion`; al frontend le faltaba
en 6 lugares (2 chips del diálogo, texto de ingredientes fijos, 2 chips del PdV,
mobile — que además mostraba el literal `"ingrediente"`).

**Gotcha:** cualquier vista nueva que muestre ingredientes necesita ese fallback.
→ [../domains/recetas-sabores-variaciones.md](../domains/recetas-sabores-variaciones.md).

### ✅ RESUELTO — La nota libre del ítem se duplicaba o se perdía (2026-08-17)

**Síntoma:** marcando una observación del catálogo (ej. `BUSCAR`) **y**
escribiendo una nota libre, el ítem mostraba dos chips `BUSCAR` y la nota no
aparecía; la comanda imprimía `>> BUSCAR` dos veces. Escribiendo **sólo** la
nota, no se guardaba nada.

**Causa:** `venta_item_observaciones.observacion_id` es NOT NULL. Los tres sitios
del PdV que persistían observaciones colgaban la nota de `observacionIds[0]`
(duplicando esa observación) o mandaban `observacion: null` (violaba el NOT NULL
y el error moría en el `catch`). Encima el render priorizaba
`observacion.descripcion` sobre `observacionLibre`, y la comanda leía
`o.descripcion` — campo que no existe en la entidad — así que la nota nunca se
imprimía.

**Fix:** sentinel `NOTA DEL CLIENTE` resuelto en el backend
(`electron/utils/observacion-libre.utils.ts`), una sola fila por nota, y
`observacionLibre` primero al renderizar. Test: `npm run test:observacion-libre`.
Detalle y reglas → [../domains/ventas-pdv.md](../domains/ventas-pdv.md).

## Backend / Datos

### ✅ RESUELTO — El ticket/pre-cuenta imprimía y cobraba los ítems cancelados (2026-08-17)

**Síntoma:** se cancelaba un ítem en el PdV (quedaba tachado, el cobro lo descontaba
bien) pero al imprimir la pre-cuenta el ítem seguía apareciendo, y el **TOTAL impreso
salía inflado**: el mozo le mostraba al cliente más de lo que debía pagar.

**Causa:** `printVentaTicketInternal` cargaba los `VentaItem` sin filtrar por estado, y
esa misma lista alimentaba las líneas **y** los totales. Como `Venta.total` nunca se
persiste (ver el bug de abajo), el TOTAL impreso sale siempre del cálculo local
`bruto - descItems - descPago + aumPago` → el cancelado lo inflaba **en los dos
documentos**: pre-cuenta y comprobante post-cobro.

**Fix:** filtro `estado: EstadoVentaItem.ACTIVO` en `buildVentaTicketLines` (extraída de
`printVentaTicketInternal` para poder testear el contenido sin impresora). El ticket
también detalla ahora los adicionales activos. Test: `npm run test:ticket-venta`.

**Gotcha para el futuro:** cualquier lugar nuevo que arme una vista de los ítems de una
venta arranca filtrando `estado = ACTIVO` — es lo que hacen comanda, cobro, stock,
comisiones, reportes y factura legal. Un `find` sin filtro es el bug.

### `Venta.total` nunca se persiste → comisiones META_VENTA_LOCAL y "Top 5 Vendedores" siempre en 0

**Descubierto** auditando el ticket de venta (2026-08-17). **Pendiente** → issue
[#239](https://github.com/GabFrank/frc-gourmet/issues/239). No se arregló ahí para no
mezclar dominios.

**Hecho de base:** la columna `ventas.total` (`Venta.total`, nullable) **no se escribe en
ningún flujo del repo**. Al cobrar, `cobrar-venta-dialog` hace
`updateVenta({ estado, formaPago, pago, fechaCierre })` sin `total`; la venta a crédito
tampoco lo setea. A diferencia de `Compra.total` o `PedidoOnline.total`, que sí se
persisten. Quien necesite el total de una venta tiene que sumar sus `VentaItem` activos.

**Consecuencias detectadas:**

- `comisiones.handler.ts` — `totalMontoVentaLocal` se acumula desde `v.total as "ventaTotal"`,
  así que queda 0. La regla `TipoReglaComision.META_VENTA_LOCAL` compara
  `totalMontoVentaLocal >= metaMontoLocal`: con una meta > 0 **nunca paga**, en silencio.
- `dashboard-rrhh.handler.ts` — `SELECT v.vendedor_id, SUM(v.total) as totalVendido … GROUP BY
  v.vendedor_id` para el widget "Top 5 Vendedores": todos los montos salen 0.

**Fix posible (a decidir):** o se empieza a persistir `Venta.total` al concluir la venta
(y hay que decidir si es bruto o neto de ajustes del pago), o esos dos consumidores pasan
a sumar `VentaItem` activos como hacen los reportes (`reportes-ventas.helper.ts`). La
segunda opción no necesita migración ni backfill de las ventas históricas.

### `create-factura` no revalida que los ítems facturados sean ACTIVO de la venta

**Descubierto** auditando el ticket de venta (2026-08-17). **Pendiente** → issue
[#240](https://github.com/GabFrank/frc-gourmet/issues/240).

**Síntoma:** ninguno hoy. El único emisor (`cobrar-venta-dialog` → `FacturarDialogComponent`)
manda `items: activeItems`, ya filtrados.

**Riesgo:** `create-factura` (`facturacion.handler.ts`) persiste los `FacturaItem` tal como
vienen en el payload — no valida que el ítem exista, que pertenezca a esa venta, que su
estado sea `ACTIVO`, ni que el total cuadre con la suma de los ítems. Como **`/api/rpc` es
default-allow** (regla #22), cualquier cliente con JWT válido puede emitir un comprobante
**legal** con un ítem cancelado o un total arbitrario. Revisar también que tenga
`ensurePermission` — la facturación quedó sin permisos dedicados.

### Pre-cuenta tras cobro parcial muestra el total, no el saldo

**Pendiente, necesita decisión de producto** → issue
[#241](https://github.com/GabFrank/frc-gourmet/issues/241).

`buildVentaTicketLines` no resta `VentaItem.montoCubierto`, así que si una mesa pagó parte
con cobro parcial por ítems y se reimprime la pre-cuenta, el papel muestra el total del
pedido y no lo que falta. Los importes son correctos (una pre-cuenta es el detalle del
pedido) y el PdV sí muestra el saldo en pantalla; la opción sugerida es imprimir un bloque
`PAGADO`/`SALDO` **sólo** cuando hay rondas activas. El comprobante final no tiene el
problema: `canFinalizar` exige saldo ≤ 0.

### CajaMayorMovimiento huérfano

**Síntoma:** movimiento con FK plana (`compraId`, `valeId`, etc.) apuntando a entidad inexistente.

**Causa:** las FKs son **columnas planas sin constraint ORM** — borrar la entidad referenciada no nulea.

**Mitigación actual:** entidades raíz (Compra, Vale, Liquidacion) NO se borran físicamente — se anulan o cancelan. El movimiento queda con FK pero la entidad sigue existiendo.

**Detección:**
```sql
SELECT id, compra_id FROM caja_mayor_movimientos
WHERE compra_id IS NOT NULL
  AND compra_id NOT IN (SELECT id FROM compras);
```

### Mesas colgadas en OCUPADO — RESUELTO (2026-08)

**Síntoma:** una mesa muestra estado=OCUPADO en el PdV pero no hay venta abierta vinculada.
Y su reverso: una mesa con consumo que **no** se marca como ocupada.

**Causa real (no era una race condition):** marcar y liberar mesas pasaba por
`updatePdvMesa`, que exige `VENTAS_PDV_CONFIGURAR` — permiso que en el seed tiene
**sólo GERENTE**. A un MOZO y también a un CAJERO le fallaba con FORBIDDEN, el
frontend se lo tragaba en un `console.error`, y quedaba el estado equivocado. Sólo
un gerente o el admin no lo sufrían, que es con quien se solía probar.

**Fix:** `createVenta` marca la mesa en su propia transacción y el handler
operativo `set-pdv-mesa-estado` (permiso `VENTAS_PDV`) la ocupa y libera; el
frontend avisa si falla. La migración `IndicesRucYReconciliarMesas` libera las
mesas que ya habían quedado colgadas. Detalle → [domains/ventas-pdv.md](../domains/ventas-pdv.md).

**Segunda causa, encontrada probando en el navegador (2026-08-21):** la cadena
mesa → comanda **sobre esa misma mesa** → otra mesa. Transferirle la cuenta de una
mesa a una comanda vinculada a ella deja la mesa ocupada, que es correcto — la
gente sigue sentada. Pero al mudar después esa comanda a otra mesa, `cerrarComanda`
sólo intentaba liberar la mesa si `PdvConfig.ocuparMesaAlVincularComanda` estaba en
**true**, y el default es **false**. La mesa quedaba OCUPADO sin venta ni comanda.
Ahora se intenta siempre; el chequeo de trabajo vivo (otra comanda OCUPADO o venta
de mesa ABIERTA) ya estaba y sigue protegiendo el caso contrario. Cubierto por los
casos 8b y 8c de `npm run test:transferencia-pdv`.

⚠️ Ninguna de las dos causas se ve probando como admin: la primera porque el admin
tiene todos los permisos, la segunda porque hay que encadenar dos transferencias.

### Stock no se descuenta en algunos casos

**Síntoma:** vendiste un producto y el stock no bajó.

**Causas posibles:**
- `producto.controlaStock = false` (intencional o accidental).
- `procesarStockVenta` falló y no reintentó (es fire-and-forget).
- Combo con depth > 2 (límite de recursión).
- Variación: no encontró RecetaPresentacion para la (presentación, sabor) específica.

**Re-procesar:** existe handler `procesarStockVenta(ventaId)` que es idempotente — si ya procesó y los movimientos están activos, no hace nada. Si hubo error y los movimientos están desactivados, re-procesa.

### Saldos Caja Mayor descuadrados

**Síntoma:** la suma de movimientos no coincide con el saldo guardado.

**Causa:** algún flujo creó un movimiento sin pasar por `actualizarSaldoCajaMayor()` (raro, pero posible si se inserta manualmente o se hace bypass).

**Fix:** handler `recalcular-saldos` (`caja-mayor.handler.ts`) reconstruye desde 0.

### Migración auto en cada arranque

```sql
UPDATE ventas SET vendedor_id = created_by
WHERE vendedor_id IS NULL AND created_by IS NOT NULL;
```

Corre en `main.ts` cada arranque (en el `then` de `DataSource.initialize`). Es **idempotente** — la próxima vez no actualiza nada. Pero si por algún motivo `vendedor_id` se nulea manualmente, se rellenará automáticamente al reiniciar.

## Seguridad ⚠️

Esta sección quedó **mayormente obsoleta** tras los sweeps F0 y P0. Revisar el commit history antes de afirmar que algo de acá sigue roto.

### ✅ RESUELTO — Passwords en texto plano (F0, PR #14)
Hash con bcrypt en `electron/utils/password.utils.ts`. `hashPassword()`/`verifyPassword()` usados en auth handler + seed admin + cambio de password.

### ✅ RESUELTO — JWT secret hardcoded (F0, PR #14)
JWT secret se persiste en **keytar** (no en código ni env). Se genera al primer arranque si no existe. Usado por Fastify JWT plugin en el server modo F3.

### ✅ RESUELTO — Validación de permisos solo en frontend (P0-1, PR #22)
`checkPermission()`/`ensurePermission()` en `electron/utils/auth.utils.ts` se invoca al inicio de los handlers IPC que mutan datos sensibles (~178 handlers cubiertos al 2026-05-13). Cache de permisos por usuario con TTL 30s. El renderer ya no es frontera real — el backend valida.

### ✅ RESUELTO — Admin `admin/admin` post-instalación (P0-3, PR #22)
Columna `must_change_password` en `Usuario`. Seed marca el admin default. Dialog bloqueante `force-change-password-dialog` post-login obliga a cambiar antes de cargar el dashboard.

### ✅ RESUELTO — `must_change_password` solo en frontend (M-07, 2026-07-15)
`auth.utils.ts` `checkPermission` rechaza (FORBIDDEN) si el usuario tiene `mustChangePassword=true`; `change-password` es self-service (no pasa por checkPermission). El flag se refleja en memoria al cambiar. Antes el gate era solo el dialog del frontend.

### ✅ RESUELTO — Hash de password expuesto al renderer (M-08, 2026-07-15)
`auth.handler.ts` (login/restoreSession/getCurrentUser) serializa el usuario **sin** `usuario.password`.

### Renderer puede setCurrentUser (mitigado en HTTP)
`setCurrentUser` IPC sigue existiendo. P0-1 mitiga porque cada handler revalida permisos contra el usuario actual. Además, en 2026-07-15 el canal **`set-current-user` entró en `BLOCKED_CHANNELS`** de `/api/rpc` (no invocable por HTTP). El canal IPC local sigue existiendo. **Fix pendiente (menor):** eliminar el handler y derivar del login/JWT.

### Batch de auditoría 2026-07-15 (`docs/HALLAZGOS-AUDITORIA-DESKTOP.md`)

~20 bugs clasificados C (crítico) / M (medio) / A (alto) **cerrados** en la sesión del 2026-07-15. No re-descubrir. Resumen:

| ID | Bug | Estado |
|---|---|---|
| C-01 | doble conteo en el ledger bancario | FIXED (dedup por token `#<id>` en `movimientos-bancarios.ts`) |
| C-02 | stock no descontaba por sabor en pizza multi-sabor | FIXED (`processElaboradoConVariacion` recorre `VentaItemSabor`) |
| C-03 | handlers de precio/stock sin permiso | FIXED (`PRODUCTOS_GESTIONAR` / `STOCK_MOVIMIENTO_REGISTRAR`) |
| C-04 | doble descuento de vale/venta-vacación entre periodos | FIXED (guard `liquidacion_id IS NULL OR = esta`) |
| C-05 | `/api/rpc` default-allow | **PARCIAL** (BLOCKED_CHANNELS 3→~30; default-deny estructural pendiente) |
| A-01 | cancelar venta a crédito no revertía CPC | FIXED (revierte CPC + saldo cliente, atómico) |
| A-02 | costo de receta ignoraba rendimiento | FIXED (`costoUnitario = costoTotal / rendimiento`) |
| A-03 | anular compra no revertía stock | FIXED parcial (guard de stock; costo promedio NO se revierte, follow-up) |
| A-04/M-06 | comisión de equipo duplicada / reparto ≠ 100% | FIXED (idempotente + valida 100%) |
| A-05 | `cpp.montoPagado` sobre-sumaba | FIXED (recomputa desde las cuotas) |
| M-01 | `anular-cobro-cpc` no idempotente | FIXED (col `movimientos_cliente.anulado` + migración) |
| M-02 | carreras de saldo caja mayor | **PARCIAL** (`FOR UPDATE` solo Postgres; falta lock de `CuentaBancaria`/`Cliente`) |
| M-04 | TOCTOU en `procesarStockVenta` | FIXED (mutex en memoria por `ventaId`) |
| M-05 | 23 handlers RRHH sin permiso | FIXED |
| M-07/M-08 | must-change-password / hash al renderer | FIXED (ver arriba) |

**Aún abiertos/parciales:** C-05 (default-deny estructural), M-02 (locks de cuenta bancaria/cliente), A-03 (revertir costo promedio al anular compra), y el bug multimoneda de liquidaciones (sección RRHH arriba).

## Performance

### Eager + cascade en RecetaPresentacion

`RecetaPresentacion → Receta` con `eager: true`. Cargar 100 RecetaPresentacion → 100 queries adicionales.

**Mitigación**: hot paths que listan muchas variaciones podrían hacer query manual con `relations: ['receta']` en lugar de cargar todo.

### `getPdvMesasActivas()` cada 1 segundo

PdV refresca el estado de las mesas cada 1 segundo. Con 50 mesas, son ~50 queries/seg.

**Mitigación**: al timer no le hace daño en local, pero en futuro multi-cliente requeriría WebSocket.

## Bugs en docs/testing/ERRORES-PDV.md

→ Archivo con registro de errores históricos del PdV. Mayoría resueltos, pero algunos pueden seguir pendientes. Chequear antes de "redescubrir" un bug.

## ✅ RESUELTO — La transferencia completa de una mesa a una comanda dejaba la mesa colgada (2026-08-22)

**Síntoma reportado:** al transferir una mesa completa a una comanda, los ítems se movían pero **la comanda quedaba vinculada a la mesa de origen**. La mesa quedaba OCUPADO, sin cuenta propia y sin forma de atenderla ni de liberarla — al tocarla no mostraba nada, porque todas las consultas filtran `comanda_id IS NULL`.

**Causa:** el call site que abre la comanda destino pasaba la mesa del origen **sin mirar el alcance**. Para una transferencia por ítems vincular es correcto (dividir la cuenta en la misma mesa); para una completa es lo contrario de lo que se pidió: la cuenta *se va* de la mesa.

Perseguir esto destapó que el modelo mesa↔comanda entero estaba mal definido. Ver [domains/ventas-pdv.md](../domains/ventas-pdv.md) § *El modelo mesa ↔ comanda* — es lectura obligatoria antes de tocar nada de mesas.

⚠️ **Dato huérfano preexistente:** las comandas que ya quedaron mal vinculadas por este bug conservan una ubicación falsa. No se pueden distinguir de una vinculación legítima, así que **no se corrigen automáticamente** — hay que moverlas a mano desde el PdV (EDITAR en la comanda).

## ✅ RESUELTOS junto con el modelo mesa↔comanda (2026-08-22)

Salieron de auditar el propio arreglo. Todos comparten la raíz: `pdv_mesas.estado` era un flag manual y nadie tenía la lista completa de quién lo escribía.

- **Cobrar una mesa con una comanda encima rompía la pantalla.** `setPdvMesaEstado(DISPONIBLE)` se negaba si había comandas vivas; la excepción salía del bloque del cobro y **la limpieza de la UI nunca corría**. La venta quedaba cobrada y el PdV seguía mostrando los ítems. Ahora sólo la cuenta propia bloquea.
- **El cache no seguía al cobro.** Cerrar una venta dejaba la columna en OCUPADO para siempre. La grilla se veía bien porque deriva, pero los lectores de la columna cruda sobre-contaban — entre ellos `musica-salon.service`, que decide el tempo de la música ambiental por mesas ocupadas.
- **`moverComanda` no actualizaba nada.** Con el flag viejo en ON dejaba la mesa origen ocupada y la destino libre. Y `venta.mesa_id` quedaba apuntando a la mesa vieja para siempre: invisible en el PdV, equivocado en cualquier reporte que agrupe por mesa.
- **`db-migrations-bootstrap` reaplicaba el criterio viejo en cada arranque**, y su subconsulta ni siquiera filtraba `comanda_id IS NULL`: la cuenta de una comanda contaba como cuenta de la mesa. Una migración de una sola vez no habría alcanzado.
- **La PWA tenía su propia transferencia**, no atómica, sin candados, salteándose las validaciones de cobro parcial y de cuenta por cobrar viva. Ahora usa el mismo canal transaccional que el desktop.
- **El mensaje de error del backend llegaba crudo** a la pantalla (`HTTP 429: {"statusCode":...}`). Los dos shims HTTP desenvuelven el JSON.

## ✅ RESUELTOS — 2026-08-22

### El botón COBRAR del PdV desapareció para todos, admin incluido — RESUELTO

Al gatear COBRAR y COBRO RÁPIDO con `*appHasPermission="'VENTAS_COBRAR'"` no se agregó `HasPermissionDirective` a los `imports` de `PdvComponent`, que es standalone. Sin la directiva, el `<ng-template>` que genera el desazucarado no lo instancia nadie: **el botón no se renderiza para ningún usuario**.

⚠️ **Se diagnostica mal**: parece un problema de permisos y no lo es. No hay error de AOT, ni de consola, ni test que falle — y como el resto del PdV no tiene gates, es el único botón que se nota faltar.

`PdvComponent` era el único de los 59 componentes standalone con gates que no importaba la directiva. Cubierto por `npm run test:gating-ui`.

### `registrar-pago-consolidado` fallaba en Postgres (issue #258) — RESUELTO

`FOR UPDATE no puede ser aplicado al lado nulable de un outer join`. El helper `findConLock` de `pago-consolidado-adapters.ts` pedía `lock` y `relations` en la misma consulta; TypeORM resuelve las relaciones con LEFT JOIN y Postgres rechaza el `FOR UPDATE`.

⚠️ **Invisible en desarrollo**: SQLite ignora los locks, así que el pago consolidado se probó entero sin encontrarlo. El CI corre Postgres **sólo para las migraciones**, no para la lógica de los handlers — por eso tampoco lo atajó. Salió recién en el local del cliente, con el pago a medio registrar.

Fix: dos consultas, el lock sobre la fila desnuda y las relaciones aparte. Detalle → [conventions/pitfalls-typeorm-electron.md](../conventions/pitfalls-typeorm-electron.md). Cubierto por `npm run test:locks-pg`, que corre contra un Postgres real (se saltea si no hay) y además barre el backend buscando la forma prohibida.

## ✅ RESUELTOS — Reportados por el usuario y corregidos (2026-08-21)

Los cuatro tenían la misma raíz: **el permiso equivocado por proximidad**, o su gemelo en el transporte. Ninguno se veía probando como ADMIN.

### El cajero no podía agregar una línea de cobro — RESUELTO

`createPago`/`createPagoDetalle` pedían `COMPRAS_GESTIONAR`. `Pago`/`PagoDetalle` están marcadas `@deprecated` para compras pero son el libro de pagos de las **ventas**; el guard quedó en el dominio viejo. Igual `create-acreditacion-pos` y `acreditar-transferencia-bancaria` con `BANCOS_GESTIONAR`: tampoco podía cobrar con tarjeta ni transferencia.

Fix: permiso nuevo `VENTAS_COBRAR`. Los handlers aceptan `[VENTAS_COBRAR, COMPRAS_GESTIONAR]` (o `BANCOS_GESTIONAR`), **pero sobre un registro que ya existe se resuelve el dominio primero**: un `Pago` colgado de una `Compra` sigue exigiendo `COMPRAS_GESTIONAR`. Sin eso, quien sólo tiene `VENTAS_COBRAR` podía editar y borrar el historial de pagos a proveedores pasando un id cualquiera.

### El cajero no podía abrir ni cerrar su caja — RESUELTO

Abrir una caja son tres llamadas (`create-conteo`, `create-conteo-detalle`, `create-caja`) y las tres pedían `FINANCIERO_CAJA_GESTIONAR`. Fix: `FINANCIERO_CAJA_OPERAR`. Detalle → [architecture/auth-permissions.md](../architecture/auth-permissions.md).

### El cambio de contraseña fallaba en la PWA — RESUELTO

Preload empaqueta sus parámetros posicionales en un objeto antes de invocar el canal (`invoke('change-password', { usuarioId, ... })`), pero el shim HTTP manda `params: [...args]` tal cual: el handler recibía `usuarioId` suelto como payload y devolvía `PAYLOAD INVALIDO`.

⚠️ **Había 9 métodos más con la misma forma**, todos rotos sobre HTTP y funcionando en Electron — la combinación más difícil de diagnosticar: `saveProfileImage`, `deleteFile`, `readFileBase64`, `openFileWithSystem`, `openBase64File` y las tres del upload por QR. Fix: `API_ARG_SHAPE` generado del propio preload → [architecture/mobile-pwa.md](../architecture/mobile-pwa.md). Cubierto por `npm run test:api-map`.

De paso, los campos de contraseña ganaron botón de ojo (SVG inline: el icon font de Google no carga en LAN sin internet).

### Caja Mayor le figuraba a cualquier cajero en el home de la PWA — RESUELTO

Gateaba con `FINANCIERO_CAJA_VER`, que es el permiso de la caja del **turno**, no de Caja Mayor. Pasa a `CAJA_MAYOR_OPERAR`, el mismo que exige la ruta destino. Su gemelo en el desktop tenía el mismo error: las hojas Gastos / Entradas Varias / Operaciones Financieras / Retiros de `MENU_TREE` también gateaban con `FINANCIERO_CAJA_VER`.

### `ConfirmationDialogComponent` ignoraba `confirmText`/`cancelText` — RESUELTO

Rotulaba todo "No" / "Sí" pese a que los llamadores mandan esos campos desde siempre: **~65 confirmaciones de la app** mostraban etiquetas genéricas. Peor, cancelar cerraba con `undefined` en vez de `false`, así que cualquier llamador que distinga las tres ramas (confirmar / rechazar / descartar) tenía la del medio muerta — le pasaba al "SOLO ITEMS" del PdV.

## Gotchas de handlers / arquitectura (auditoría 2026-07)

Aprendidos en la auditoría de bugs de julio 2026 (rama `claude/desktop-forma-pago-efectivo`, PR #181). Ver `docs/HALLAZGOS-AUDITORIA-DESKTOP.md` para la lista completa de bugs clasificados por severidad.

- **Los handlers NO quedan como listeners de `ipcMain`.** `electron/utils/handler-registry.ts` hace **monkey-patch de `ipcMain.handle`** y guarda cada canal en un registro propio. Por eso `ipcMain.listeners('canal')` devuelve `[]`. Llamar `ipcMain.listeners('canal')[0]?.(...)` es un **no-op silencioso** (patrón que dejó a `generar-liquidaciones-comision-mes` sin hacer nada). Para invocar otro handler desde dentro de un handler, **usar `invokeHandler(canal, ...args)`** de `../utils/handler-registry`.
- **`/api/rpc` es default-allow.** En `mode=server` expone **todos** los handlers con sólo un JWT válido; `BLOCKED_CHANNELS` (`electron/server/rpc-router.ts`) bloquea sólo canales de infraestructura — **ampliado de 3 a ~30 canales** en 2026-07-15 (C-05: backups, db-config, app-mode, auto-update, `set-notif-secret`, `ia-config-set`, seeds, `set-current-user`, `remote-tunnel-*`, etc.). Pero para los ~830 handlers de negocio sigue siendo default-allow (el default-deny estructural sigue pendiente). La capa de transporte **no** protege nada: cada handler sensible debe traer su propio `ensurePermission(dataSource, getCurrentUser, 'CODIGO')`. No asumir que estar detrás de `/api/rpc` = protegido.
- **El payload de `/api/auth/login` es una lista blanca a mano** (`electron/server/auth-routes.ts`), no el `Usuario` completo: sólo `id`, `nickname`, `persona` y `mustChangePassword`. Cualquier bandera que el frontend necesite del usuario hay que **agregarla explícitamente ahí**, o los clientes HTTP (PWA mobile, web `/admin`, desktop `mode=client`) la ven como `undefined` mientras el backend opera con el valor real de la BD (el `rpc-router` hace `findOne` del usuario del JWT). Así se coló el bug de agosto 2026: sin `mustChangePassword` en el payload, un usuario con contraseña temporal entraba sin que nadie lo forzara a cambiarla y después **todo** handler con `ensurePermission` le devolvía FORBIDDEN.
- **Payload de cuenta bancaria va anidado**: los handlers esperan `{ cuentaBancaria: { id } }`, **no** un `cuentaBancariaId` plano (lo descartan al desestructurar). (Ojo: esto es lo contrario de `create-presentacion`/`create-codigo-barra`, que sí toleran ambas formas — no generalizar.)
- **Anulaciones deben ser multi-detalle.** Documentos como gasto/retiro generan **N** movimientos de caja mayor. Anular debe recorrer **todos** con `find(...)` + contra-balancear cada uno (`actualizarSaldo`), nunca `findOne(...)` (dejaba movimientos sin revertir).
- **Regla fuente Caja Mayor ⇒ EFECTIVO.** En todo formulario con selector de fuente de pago: si la fuente es Caja Mayor, la forma de pago debe ser EFECTIVO (filtrar `formasPago` a las que contienen `"EFECTIVO"`). Si la fuente es una cuenta bancaria, **no** se pide forma de pago (siempre es transferencia; la moneda la define el banco).
- **Regla dura que sólo caza el AOT (`npm run check`), no el dev build**: strings UPPERCASE, sin funciones/getters en templates, sin colores hardcodeados, filtros con botón explícito (sin filtrado en vivo). Correr `npm run check` antes de pushear.
- **`--omit=optional` en CI excluye `@thiagoelg/node-printer` (bug de impresión resuelto 2026-07).** `release.yml` usa `npm ci --omit=optional` para saltear `canvas` (cairo), pero eso también saca la única `optionalDependency` que la app SÍ necesita: el driver del spooler del SO. Resultado: la app instalada en Windows tiraba `Cannot find module '@thiagoelg/node-printer'` al imprimir por conexión `system`. Fix en el job `build` (solo Windows): `npm install --no-save @thiagoelg/node-printer@0.6.2` tras el `npm ci` (el `--no-save` no re-instala canvas). Regla: **cualquier `optionalDependency` que sea requisito real de runtime necesita re-inclusión explícita si el install de CI usa `--omit=optional`.**

### Música ambiental — hallazgos de la primera prueba real (2026-08-11)

- **Textarea aplastado en TODA la app.** `styles.scss` fija `.mat-mdc-form-field-appearance-outline .mat-mdc-form-field-flex { height: 40px !important }` para compactar inputs de una línea. Con un `<textarea>` deja el marco en 40px y el contenido se desborda por arriba y por abajo. **Afecta al menos 6 pantallas** (recetas, funcionarios, comisiones, …), no sólo a música. Ganarle por especificidad es frágil (con dos `!important` gana el selector más específico, y el global tiene 3 clases); en música se resolvió sacando el textarea del `mat-form-field`. **La corrección global sigue pendiente** y hay que hacerla revisando formulario por formulario.
- **Endpoints de Spotify que cambiaron y rompieron cosas** (4 en una sesión): `/playlists/{id}/tracks` → `/items`; contenido de playlists ajenas ya no se devuelve (403 en Dev Mode); `POST /users/{id}/playlists` **deprecado** → `POST /me/playlists`; `search` limitado a 10 resultados. Ante cualquier 403/404 de Spotify, **verificar la doc actual antes de asumir un problema de permisos**.
- **Comparar horas como texto rompe la medianoche.** `'17:00' < '00:00'` es falso porque `'1' > '0'`. Un bloque 17:00–00:00 daba duración negativa (playlist de 30 min en vez de 7 h) y **nunca resultaba vigente** (el turno noche no sonaba). Siempre convertir a minutos y tratar `'00:00'` de cierre como 24×60.
- **Los vetos por género no se pueden delegar al LLM.** Aun pidiéndole el género real y declarando incorrecta la respuesta que disfrace un veto, siguió etiquetando *"J Balvin: latin pop"* (reggaetón), *"Marcelo D2: MPB"* (rap). El filtro se apoya ahora en `/artists/{id}` de Spotify, que publica los géneros reales. **Regla general: si un filtro de negocio depende de una etiqueta que genera el modelo, el modelo la va a acomodar.**
- **Comparación de géneros en una sola dirección.** Con inclusión bidireccional, un veto de `FUNK BRASILEIRO` descartaba el funk americano (soul/groove). El género del tema debe contener al veto, no al revés.
- **El LLM no cubre los 7 días aunque se le pida.** Devolvió 3 días, y después 7 pero con viernes y sábado sólo con el bloque de la noche (local sin música de 09:00 a 17:00). Los huecos se completan por código replicando el día equivalente; el domingo **nunca** se inventa (puede ser que el local no abra).

## Trampas que parecen bugs pero no son

- **`getPdvConfig` retorna array** con un solo elemento (legacy). Usar `result[0]`.
- **Imágenes:** `images.handler.ts` solo maneja imágenes de perfil (legacy compat). Las imágenes de producto y demás archivos usan el `files.handler.ts` genérico (`save-file`/`delete-file`).
- **Compras pre-refactor 2026-05-05 contado** sin CPP — aparecen como "ya pagadas". Es **intencional**, no se migran.
- **`get-presentaciones-by-producto` devuelve `{ data, total, page, pageSize }`** — NO `{ items }`. Si ves un componente leyendo `res.items` está roto. Causó un bug en el módulo OCR (presentaciones siempre vacías).
- **`create-presentacion` y `create-codigo-barra`** aceptan tanto `productoId`/`presentacionId` planos como `producto: { id }` / `presentacion: { id }` (estilo TypeORM relations). Tolerancia explícita desde 2026-05-06.
- **Productos creados desde import OCR** llegan con `subfamilia=null` y `registroCompleto=false` — chip "Parcial" en list-productos. No es bug, completar después desde gestionar-producto.
- **Patrón mat-select con item dinámicamente creado**: si `[ngModel]` apunta a un id que aún no está en `<mat-option>`, mat-select emite `null` por race con DOM. **Fix correcto**: prepender al array de opciones primero, `setTimeout(0)` antes de setear el valor. Implementado en `revisar-factura.component.ts:abrirCrearProducto`.
- **Lista CPP filtra contado por defecto** — toggle UI activa.
- **Handlers de RecetaPresentacion en `recetas.handler.ts`**, NO en `receta-presentacion.handler.ts` (existe pero NO se registra).
- **Bono auto-generado por tardanza** no se recalcula si cambian los valores de config — solo aplica al siguiente registro de asistencia.
- **`porcentajeAprovechamiento` en RecetaIngrediente NO afecta costo** (intencional, ver `recetas.handler.ts`). Solo se almacena para uso futuro.


## Anotados durante el pago consolidado (2026-08)

- **M-02 (carreras de saldo caja mayor) — avanza, no cierra.** Se eliminó la copia
  sin lock de `descontarSaldoCajaMayor`/`sumarSaldoCajaMayor` que vivía en
  `cuentas-por-pagar.handler.ts`: ahora todo pasa por `actualizarSaldoCajaMayor`,
  que sí toma `pessimistic_write` en Postgres. **Sigue faltando** el lock sobre
  `CuentaBancaria.saldo` y `Cliente.saldoActual`. El pago consolidado además
  lockea la fila de la obligación (gasto/vale/cuota/liquidación) antes de pagarla,
  cosa que los flujos viejos no hacen.

- **`Gasto.monto` suma monedas distintas sin convertir.** `create-gasto` calcula
  el total como `detalles.reduce((s, d) => s + d.monto)` — si el usuario carga
  detalles en Gs y en USD, el monto guardado es una suma sin sentido. Preexistente;
  el alta **diferida** lo evita (manda moneda y monto directos), pero la rama con
  pago sigue igual.

- **Gastos `PROGRAMADO` se cuentan en el reporte de Finanzas.** `gastosRango` /
  `gastosPorCategoria` filtran por estado, y `PROGRAMADO` (gasto recurrente futuro,
  no pagado) entra igual. Se excluyó `PENDIENTE` al introducirlo, pero `PROGRAMADO`
  quedó como estaba para no cambiar números existentes.

- **Dos convenciones de dirección de cotización conviven.**
  `moneda.utils.getCotizacionCompraLocal` usa `origen → destino` con las filas
  `extranjera → PYG` que carga el diálogo; `financiero.handler.ts`
  (`get-moneda-cambio-by-moneda-principal`, `get-valor-en-moneda-principal`) usa la
  convención **inversa**. No se cruzan hoy, pero es una trampa. El pago consolidado
  usa `getCotizacionBidireccional`, que prueba las dos direcciones.

## Delivery del PdV — cerrado 2026-08-24 (queda un resto)

El módulo se auditó entero antes de su primer uso real
(`docs/DIAGNOSTICO-DELIVERY.md`, 26 hallazgos). Los cuatro bloqueantes y la
mayoría de los mayores están cerrados. **Lo que quedó abierto:**

- **`Delivery.cobroAnticipado` sigue siendo decorativo.** Se guarda y se edita,
  pero ningún flujo lo lee: no fuerza el cobro al crear, no altera el orden de
  estados y no sale en el ticket.
- **Cancelar una venta COBRADA desde Últimas Ventas sigue sin revertir el
  cobro.** El delivery ya lo hace (`delivery-cancelar` →
  `cancelarVentaCompletaEnTx`), pero `ultimas-ventas-dialog.cancelarVenta()`
  sigue haciendo `updateVenta({estado:CANCELADA})` + `revertirStockVenta` sin
  tocar `PagoDetalle` ni las rondas de `CobroParcial`. El util
  `electron/utils/venta-reversa.utils.ts` está listo para reusarse ahí.
- **`deletePrecioDelivery` es hard-delete** (`repo.remove`) aunque la entidad
  tenga `activo`. Debería ser baja lógica.
- **No hay `pg.types.setTypeParser(1700, parseFloat)` en el repo.** Todos los
  `decimal` llegan como **string** en modo Postgres. **Verificado empíricamente
  contra un Postgres 16 con el esquema real** (2026-08-24):

  ```
  PrecioDelivery.valor        = "5000.00"    string
  VentaItem.precioVentaUnitario = "150000.00"  string
  VentaItem.cantidad          = "2.000"      string
  10000 + valor               = "100005000.00"   ← concatena
  ```

  Se compensa con `Number()` caso por caso, pero **es una mina activa**: el
  subtotal del diálogo de cobro daba **NaN** para cualquier ítem con adicionales
  en modo servidor (`(precioVentaUnitario + precioAdicionales) * cantidad` con
  los tres como string), y se descubrió recién al auditar el delivery.

  ⚠️ **Al tocar cualquier cálculo de montos, envolver TODOS los términos en
  `Number()`** — no sólo el que uno agrega. Y al revisar código viejo que suma
  `decimal`, asumir que está roto en Postgres hasta probar lo contrario.

  Arreglarlo de raíz (`setTypeParser` global) es un cambio de una línea con
  impacto en toda la app: hay que auditar qué código depende hoy de recibir
  strings antes de hacerlo. **Candidato fuerte para un trabajo propio.**

  ⚠️ **`pessimistic_write` + `relations` no se puede en Postgres**: el `findOne`
  con relaciones genera un LEFT JOIN y `FOR UPDATE` no se puede aplicar sobre el
  lado nullable de un outer join. Tomar el lock en una consulta aparte, sin
  relaciones (ver `venta-reversa.utils.ts`).
