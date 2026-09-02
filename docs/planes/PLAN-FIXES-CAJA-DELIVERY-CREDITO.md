# Plan: caja duplicada, pagaré en delivery y cliente en el cobro

Estado: propuesta, pendiente de auditoría (paso 5) y aprobación (paso 6).
Fecha: 2026-09-02. Rama: `claude/fixes-caja-delivery-credito`, base `develop @ dd0ca40`.

Seis defectos que salieron de un incidente real de producción (la PC delivery abrió
una segunda caja) más cuatro reportes del usuario sobre el flujo de delivery. Van en
un solo PR porque cuatro de los seis viven en el mismo diálogo.

**Sin migración.** Ninguno de los seis toca entidades ni columnas.

---

## Diagnóstico (verificado contra el código, no contra la skill)

### A. Se puede abrir una segunda caja sin que nadie avise

`create-caja` (`financiero.handler.ts:661`) valida **por dispositivo**:

```ts
if (data?.estado === ABIERTO && dispositivoId != null) {
  const yaAbierta = await repo.count({
    where: { dispositivo: { id: dispositivoId }, estado: ABIERTO },
  });
  if (yaAbierta > 0) throw new Error('Ya hay una caja abierta en esta terminal...');
}
```

Varias cajas abiertas a la vez son **legítimas por diseño** (dos cajeros, dos
cajones): `get-cajas-abiertas` las devuelve todas y existe `seleccionar-caja-dialog`
para elegir a cuál unirse. El problema no es que se pueda; es que se puede **por
accidente y en silencio**. Tres agujeros concretos:

| # | Dónde | Qué pasa |
|---|---|---|
| **A1** | `pdv.component.ts:322-327` | El `catch` de `getCajasAbiertas()` pone `cajasAbiertas = []` y sólo loguea. Cae al `else` y muestra *"Caja abierta no encontrada — No hay una caja abierta, ¿desea abrir una nueva?"*. **Con la caja abierta existiendo.** Un timeout en modo cliente alcanza para dispararlo. |
| **A2** | `list-cajas.component.ts:459` | `openCaja()` sólo mira si **ese usuario** tiene caja abierta. Si no, llama `openCreateCajaDialog()` sin `excludeDispositivoId`. |
| **A3** | `create-caja-dialog.component.ts:904` | `checkOpenCajas()` está colgado de `if (this.excludeDispositivoId)`. En el camino de A2 nunca corre: el desplegable de terminales **no filtra las ocupadas** ni avisa que ya hay una caja abierta en otra terminal. |

**Decisión del usuario:** avisar y pedir confirmación. No bloquear — se rompería el
escenario de dos cajeros.

### B. El pagaré de venta a crédito sale por la impresora equivocada

`cobrar-venta-credito` (`cuentas-por-cobrar.handler.ts:1035`) llama:

```ts
await printPagareCpcTicketInternal(dataSource, cpcSaved.id);   // sin dispositivoId
```

`getPrinterByRol` sólo llega a `Dispositivo.printerTicket` si recibe `dispositivoId`
(paso 2, `documentos-tickets.handler.ts:87`). Sin él cae al paso 4/5 y termina en la
impresora `isDefault` — la de la caja principal.

Es **exactamente la misma clase de bug** que ya está documentada como resuelta para
el ticket de delivery en `reference/known-bugs.md:370`, con el mismo agravante: la
llamada corre dentro de un `setImmediate`, donde no hay `_event` del cual resolver el
dispositivo. Este caller quedó afuera de aquel barrido.

Dos diferencias con el ticket de venta que empeoran el caso:

- `printVentaTicketInternal` cae a `venta.dispositivo?.id` si el caller se olvida
  (`:1067`). **`printPagareCpcTicketInternal` no tiene ese fallback**: usa
  `opts.dispositivoId` a secas.
- El handler IPC `print-pagare-cpc-ticket` (`:1352`) **sí** resuelve el dispositivo.
  O sea: reimprimir el pagaré a mano funciona; la auto-impresión al vender no.

### C. No se puede sacar el pagaré desde la terminal delivery

`recomputeCobrarCredito` (`cobrar-venta-dialog.component.ts:1447`) arranca con:

```ts
if (!this.puedeFinalizar) { this.canCobrarCredito = false; ... return; }
```

En la terminal delivery `permitirFinalizarTerminalAjena` es `false` (default), así
que `puedeFinalizar` es `false` y el botón queda deshabilitado. El repartidor no
puede salir con el pagaré para que el cliente lo firme, que es el motivo del pedido.

**Decisión del usuario:** pagaré provisorio, CPC después. La terminal delivery
imprime el pagaré con los datos de la venta y las cuotas propuestas, **sin crear la
CPC ni concluir la venta**. Ningún gate se toca y no hay impacto contable desde una
terminal ajena.

### D. El buscador de clientes del delivery ignora a los que no tienen teléfono

Dos defectos encadenados:

- **D1** — `buscar-clientes-por-telefono` (`personas.handler.ts:863`) filtra
  `persona.telefono LIKE :telefono`. Un cliente sin teléfono **no puede aparecer
  nunca**, y es el único buscador que alimenta el autocomplete del diálogo.
- **D2** — Aunque se lo elija por el botón *Buscar cliente* (que sí lista todos),
  `recalcular()` (`crear-delivery-dialog.component.ts:206`) exige
  `telefono.replace(/\D/g,'').length >= telefonoMinDigitos` (default 4) para habilitar
  CONFIRMAR. **El delivery no se puede guardar** para un cliente sin teléfono.

Arreglar sólo D1 deja el flujo igual de roto: hay que hacer los dos.

### E. El cliente del delivery no llega a la pantalla de cobro

También dos defectos, y **son la causa de que el botón de crédito diga "Asigne un
cliente a la venta"** aunque el delivery tenga uno:

- **E1** — `getDeliveriesByCaja` (`ventas.handler.ts:789-796`) hidrata
  `delivery.cliente` y `cliente.persona`, pero **no `venta.cliente`**. El diálogo de
  cobro lee `this.data.venta?.cliente` (`cobrar-venta-dialog.component.ts:1457`) →
  `undefined`.
- **E2** — `deliveryActualizarDatos` (`delivery.handler.ts:430`) hace
  `if (payload?.clienteId) delivery.cliente = ...` pero al sincronizar la venta sólo
  copia `costoDelivery` y `nombreCliente` (`:437-450`). **El cliente asignado al
  editar un delivery nunca llega a `venta.cliente`.**

En el alta (`delivery-crear`, `:313`) sí se setea. Así que hoy: un delivery creado
con cliente lo tiene en la venta pero el diálogo no lo ve (E1); uno al que se le
asigna después no lo tiene ni en la base (E2).

### F. Con dos cajas abiertas, aceptar un pedido web dice "aceptado" y no crea nada

`materializarPedidoOnlineEnVenta` (`ventas.handler.ts:214`) tira
`caja_ambigua_especificar_cajaId` con más de una caja abierta.
`aceptar-pedido-online` lo captura y devuelve **`success: true`** con
`errorMaterializacion` seteado (`pedidos-online-admin.handler.ts:157-168`), y
`list-pedidos-online.component.ts:134` **sólo mira `success`** → muestra *"Pedido N
aceptado"* y no se creó la venta ni fue a cocina. La bandeja del diálogo de delivery
sí pasa `cajaId`, así que esa vía funciona.

> ⚠️ **Supuesto, no confirmado.** Se preguntó si F entraba en este PR y la respuesta
> se usó para reportar otro bug (E), así que la pregunta quedó sin contestar. Se
> incluye porque es consecuencia directa de A y hoy **pierde pedidos en silencio en
> producción**. Si el usuario prefiere sacarlo, la fase 6 se quita entera sin tocar
> las demás.

---

## Fases

### F1 — Caja: que la segunda no se abra por accidente

- **A1**: separar "falló la consulta" de "no hay ninguna". Si `getCajasAbiertas()`
  tira, mostrar el error real y **no** ofrecer abrir caja (cerrar la tab del PdV, que
  es lo que ya hace al descartar). El mensaje "No hay una caja abierta" queda sólo
  para el caso en que de verdad no hay.
- **A2/A3**: `checkOpenCajas()` deja de depender de `excludeDispositivoId` y corre
  siempre. Las terminales con caja abierta salen del desplegable.
- **Aviso**: cuando hay al menos una caja abierta en otra terminal, el diálogo de
  apertura muestra un banner con terminal, quién la abrió y hace cuánto, y CONFIRMAR
  pide confirmación explícita.
- **Backend**: `create-caja` devuelve el aviso también del lado servidor —
  informativo, no bloqueante, para que la PWA lo tenga sin duplicar la regla.
- ⚠️ **`checkOpenCajas()` cambia de fuente: `get-cajas-abiertas`, no `get-cajas`.**
  Hoy usa `get-cajas` (`create-caja-dialog.component.ts:1581`), que el propio repo
  documenta como anti-patrón al lado de su definición (`financiero.handler.ts:578-581`):
  sin `WHERE`, sin `LIMIT`, con 6 relaciones eager incluidos los dos conteos
  completos — "en un local con dos años de operación son miles de filas con sus
  conteos". Hacerlo correr siempre sobre esa consulta metería la query cara en el
  camino más frecuente. `get-cajas-abiertas` (`:880-892`) ya filtra por estado y no
  trae los conteos: es exactamente lo que hace falta.
- **UI del banner**: color de la paleta de estados (regla dura §3 #6) — **amarillo**,
  que es una advertencia, no un error. Variables de tema, nada hardcodeado (#5).
- **UI de la confirmación**: segundo paso dentro del propio `create-caja-dialog`
  (estado del formulario), **no** `confirm()` nativo ni alert custom (#8). Si en algún
  momento hiciera falta un diálogo aparte, va `ConfirmationDialogComponent`.
- **Extracción para test**: la decisión ("¿hay otra caja abierta? ¿qué aviso muestro?")
  va a un util puro `src/app/shared/utils/caja-apertura.util.ts`. Precedente de utils
  puros en esa carpeta: `forma-pago-efectivo.util.ts`, `mesa-estado.util.ts`.

### F2 — El pagaré sale por la impresora de la terminal

- `printPagareCpcTicketInternal` cae a `venta.dispositivo?.id` cuando el caller no
  pasa `dispositivoId`, igual que `printVentaTicketInternal` y
  `printDeliveryTicketInternal`. Requiere resolver la venta desde `cpc.ventaId`.
- `cobrar-venta-credito` resuelve `resolveRequestDeviceId(_event)` **antes** del
  `setImmediate` y se lo pasa a las dos impresiones (ticket y pagaré). Adentro del
  `setImmediate` no hay `_event`: es la trampa que documenta `known-bugs.md:370`.

### F3 — El cliente del delivery llega a la venta

- **E1**: `getDeliveriesByCaja` suma `venta.cliente` + `cliente.persona` al
  QueryBuilder. ⚠️ Con alias distintos de los del delivery (`ventaCliente` /
  `ventaClientePersona`), que si no chocan.
- **E2**: `deliveryActualizarDatos` propaga `clienteId` a `venta.cliente` dentro de la
  misma transacción, junto al `nombreCliente` que ya sincroniza.
- Esto solo ya hace que el diálogo de cobro muestre el cliente y que el botón de
  crédito deje de decir "Asigne un cliente".

### F4 — Pagaré provisorio desde la terminal delivery

- Extraer `buildPagareLines(...)` de `printPagareCpcTicketInternal` (misma jugada que
  `buildDeliveryTicketLines`), parametrizado por origen: CPC existente o venta +
  cuotas propuestas.
- Handler nuevo `print-pagare-provisorio-venta` — permiso
  `['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']`, el mismo que
  `print-pagare-cpc-ticket`. Resuelve el dispositivo del request. **No escribe nada**:
  ni CPC, ni cuotas, ni saldo del cliente.
- El papel referencia `VENTA #N` en vez de `CPC N#`, para que el cajero pueda
  reconciliarlo al finalizar. El texto legal y el bloque de firma no cambian: el
  cliente firma un pagaré, no un borrador.
- ⚠️ **Los montos por cuota se recalculan server-side**, con la misma fórmula que
  `cobrar-venta-credito` (`cuentas-por-cobrar.handler.ts:984-986`):
  `montoCuota = +(montoTotal / cantidadCuotas).toFixed(2)` y la última absorbe el
  resto. Imprimir lo que mande el front deja un pagaré firmado con números que no
  coinciden con la CPC que después crea el cajero — que es peor que no tener pagaré.
- ⚠️ **`Number()` sobre todo lo que venga de una columna `decimal`.** Sin
  `pg.types.setTypeParser(1700)` en el repo, en Postgres llegan como **string** y se
  concatenan en vez de sumarse. El propio repo lo documenta al lado de
  `resolverCostoDelivery` (`delivery.handler.ts:144-147`) y lo aplica sin excepción en
  `cuentas-por-cobrar.handler.ts:868,1013`. Aplica a `montoTotal`, al saldo del
  cliente y a los montos por cuota.
- El `ensurePermission` va en el **wrapper IPC**, no en el builder: las funciones
  `printXxxInternal` nunca lo llaman, por diseño (`documentos-tickets.handler.ts:14-21`).
- UI: botón **PAGARÉ** en el footer del `delivery-dialog`, habilitado cuando el
  delivery tiene cliente con `credito`. Abre `pagare-provisorio-dialog` (cuotas,
  frecuencia, fecha de inicio, monto prellenado con el saldo) y manda a imprimir.
  Archivos `.ts`/`.html`/`.scss` separados, sufijo `-dialog`, en
  `src/app/shared/components/pagare-provisorio-dialog/`.
- **Riesgo asumido y documentado**: queda un pagaré firmado sin CPC si al final se
  cobra en efectivo. Es papel, no dato; el cajero lo descarta.

### F5 — Clientes sin teléfono en el delivery

- **D1**: `buscar-clientes-por-telefono` pasa a buscar por **teléfono, nombre,
  documento y RUC** (`LEFT JOIN` a persona en vez de `INNER JOIN`, que hoy también
  excluye al cliente sin persona). Se le deja el nombre del canal para no romper
  llamadores; se documenta el cambio de semántica.
  ⚠️ **La comparación va envuelta en `UPPER()`** (o el input a `.toUpperCase()`).
  `LIKE` es case-sensitive en Postgres y no en SQLite: sin eso, buscar "juan"
  encuentra "JUAN PEREZ" en desarrollo y **nada** en producción. El repo ya usa ese
  patrón por portabilidad (`cuentas-por-cobrar.handler.ts:884`).
- **D2**: `recalcular()` exige teléfono **sólo si no hay cliente seleccionado**. Con
  un cliente ya elegido, su identidad ya está resuelta y el teléfono es opcional.
- **D3 — el gate que faltaba.** `delivery-crear` valida el teléfono **de nuevo y de
  forma incondicional** (`delivery.handler.ts:272-276`), sin mirar si vino
  `clienteId`. Arreglar sólo D1+D2 habilita el botón CONFIRMAR y **el alta explota
  igual**, un paso más tarde y como toast. El backend tiene que saltear el mínimo
  cuando hay `clienteId`, con el mismo criterio que D2. `deliveryActualizarDatos` no
  tiene este gate, así que el síntoma es exclusivo del alta — justo el caso de D.
- **D4** — `seleccionarCliente()` (`crear-delivery-dialog.component.ts:260`) hace
  `this.telefono = cliente.persona?.telefono || this.telefono`: si el cliente elegido
  no tiene teléfono **no limpia el campo** y queda lo que el cajero venía tecleando,
  que con D1 ahora puede ser un nombre. Eso se guarda como teléfono del delivery y se
  muestra en la lista y en el detalle. Es preexistente, pero D1 lo vuelve fácil de
  gatillar y esta fase es exactamente sobre clientes sin teléfono.
- ⚠️ Verificar que `crearClienteRapido` no rompa con teléfono vacío: hoy es el
  camino de alta cuando no se encontró cliente.

### F6 — Pedido web con dos cajas abiertas *(sujeto a confirmación, ver supuesto)*

- `list-pedidos-online` manda la caja. Si hay una sola abierta, esa; si hay varias,
  abre `seleccionar-caja-dialog` antes de aceptar.
- El componente deja de tragarse `errorMaterializacion`: si vino, el snackbar dice
  que el pedido se aceptó **pero no se creó la venta**, con el motivo.

---

## Tests

Todos los tests de regresión de un bug se verifican **revirtiendo el fix**: si siguen
en verde sin el arreglo, no prueban nada (paso 7 del ciclo).

| Suite | Qué cubre | Estado |
|---|---|---|
| `test:caja-apertura` | Util puro de F1: hay otra caja abierta → aviso con terminal y usuario; no hay → sin aviso; error de consulta ≠ lista vacía | **nueva** |
| `test:delivery-impresora` | Que `cobrar-venta-credito` resuelva el dispositivo para el pagaré **y** para el ticket; que `printPagareCpcTicketInternal` caiga a `venta.dispositivo` | extender |
| `test:pagare-provisorio` | Builder puro: incluye las cuotas propuestas y el bloque de firma; referencia `VENTA #N`; **no crea CPC ni mueve el saldo del cliente** (assert sobre la base después de imprimir) | **nueva** |
| `test:delivery-cliente` | `getDeliveriesByCaja` hidrata `venta.cliente`; `deliveryActualizarDatos` propaga el cliente a la venta; los alias del join no pisan a `delivery.cliente` | **nueva** |
| `test:buscar-clientes` | Un cliente **sin teléfono** aparece buscando por nombre y por documento; el que tiene teléfono sigue apareciendo por teléfono; **la búsqueda es case-insensitive** (minúsculas encuentran el dato en UPPERCASE) | **nueva** |
| `test:delivery-sin-telefono` | `delivery-crear` **acepta** el alta sin teléfono cuando viene `clienteId`, y **sigue rechazándola** sin cliente. Es el gate D3, que ningún otro test toca | **nueva** |
| `test:pagare-provisorio` (cont.) | Los montos por cuota los calcula el servidor y **coinciden con los que después produce `cobrar-venta-credito`** para los mismos parámetros — el assert compara las dos salidas, no un número escrito a mano | — |
| `test:delivery`, `test:delivery-conversion`, `test:terminal-caja`, `test:ticket-delivery-pagos`, `test:pedidos-online`, `test:cobro-parcial` | Regresión de lo que se toca | existentes |
| `npm run test:all` | Batería completa (paso 9) | — |

Fuera de alcance de los ts-node: la UI de los diálogos. Por eso F1 extrae el util
puro en vez de dejar la decisión adentro del componente. **D4 y el banner de F1
quedan sin cobertura automatizada** y van al manual de pruebas de `docs/testing/`.

⚠️ **El CI no corre ninguna suite `test:*`** — verificado en `.github/workflows/ci.yml`:
sólo `tsc --noEmit`, `ng lint`, `build:prod` y `migration:run`. El paso 9
(`npm run test:all`, local, SQLite) es la única red que existe para la batería, y el
job de Postgres cubre **esquema, no comportamiento**. Por eso el `UPPER()` de D1 se
verifica leyendo el SQL generado, no confiando en que algo lo agarre en CI.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El join nuevo de `venta.cliente` (F3) choca con el alias `cliente` que ya usa `delivery.cliente` | Alias distintos + test que verifica que **los dos** vienen hidratados |
| Aflojar el buscador de clientes (F5) mete ruido en el autocomplete del delivery | Se mantiene el `take(15)` y el orden por nombre; el match exacto por teléfono que autoselecciona sigue siendo por teléfono |
| Un pagaré firmado sin CPC detrás (F4) | Decisión explícita del usuario. Referencia `VENTA #N` en el papel para reconciliar |
| `checkOpenCajas()` corriendo siempre (F1) agrega una consulta al camino más frecuente | **No es gratis**: hoy `get-cajas` sólo se llama cuando el usuario ya tenía una caja abierta. Por eso la fase cambia la fuente a `get-cajas-abiertas`, que está filtrada y sin conteos |
| Búsqueda de clientes case-sensitive en Postgres (F5/D1) | `UPPER()` en la comparación. No lo cubre el CI: no corre suites `test:*` |
| Montos `decimal` concatenados como string en Postgres (F4) | `Number()` en todo lo que salga de una columna `decimal`, patrón ya documentado en `delivery.handler.ts:144-147` |
| El pagaré firmado no coincide con la CPC que se cree después (F4) | Los montos por cuota se recalculan server-side con la fórmula de `cobrar-venta-credito`, y el test compara las dos salidas |
| Todo se verifica en SQLite | Ninguna fase toca entidades ni migraciones, así que el job de Postgres del CI (que valida **esquema**) no aplica. Lo que sí es driver-sensible —el `LIKE` de D1 y los `decimal` de F4— tiene su fila propia arriba y **no hay gate automático**: se verifica leyendo el SQL y el código |
| F6 se incluyó sobre un supuesto | La fase es independiente: se quita entera sin tocar las otras cinco |

---

## Documentación a actualizar (regla dura §3 #24)

| Doc | Qué entra |
|---|---|
| `reference/known-bugs.md` | **B** como resuelto, junto a la entrada hermana del ticket de delivery (`:364`) — es el mismo patrón y este caller quedó afuera de aquel barrido. **F** (caja ambigua) y **D3/D4** como resueltos |
| `domains/ventas-pdv.md` | Que varias cajas abiertas son legítimas y cuál es el invariante real (una por terminal); el aviso nuevo al abrir; el pagaré provisorio y por qué no crea CPC |
| `domains/financiero-caja-mayor.md` | Sólo si el aviso de apertura toca algo de su territorio; verificar al cerrar |
| `domains/personas-clientes.md` | Que el buscador del delivery ya no es "por teléfono" y qué campos cubre |
| `reference/handlers-index.md` | `print-pagare-provisorio-venta` |
| `docs/testing/TESTING-CHECKLIST-CAJA-DELIVERY-CREDITO.md` | Manual nuevo. Incluye los casos sin cobertura automatizada: D4, el banner de F1, y el caso que habría detectado cada bug que encuentre el paso 8 |
| `workflows/todos-pendientes.md` | Deuda nueva que aparezca. Anotar que `aceptarPedidoOnline` sigue stub en `repository-http.service.ts:1093`, así que F6 no alcanza al modo `client` (preexistente, no lo introduce este PR) |
| `SKILL.md` §4 | Entrada de sesión |

## Auditoría del plan (paso 5)

Dos agentes, ejes separados, sin verse entre sí. **No se contradijeron**, así que no
hay nada que arbitrar.

**Alcance y convenciones** — 7 hallazgos, ninguno bloqueante: faltaba la sección de
documentación de acá arriba, el diálogo de F4 no tenía nombre, y dos detalles de UI
sin cerrar (color del banner, mecanismo de la confirmación). Confirmó que "sin
migración" es correcto verificando que `Venta.cliente`, `Cliente.credito` y
`Cliente.limite_credito` ya existen. Corrigió una cita mía: el precedente de util
puro que yo citaba vive en `pages/`, no en `shared/utils/`.

**Correctitud y riesgo** — 4 ALTA, todas verificadas contra el código y todas
incorporadas:

1. **F5 no arreglaba lo que decía arreglar** — el tercer gate de `delivery-crear`
   (D3). El fix habría habilitado el botón y dejado el alta explotando igual.
2. **La tabla de riesgos afirmaba en falso** que `getCajas()` ya se llamaba en el
   camino común. No: hoy sólo corre cuando el usuario ya tenía una caja abierta, y es
   la consulta que el propio repo marca como anti-patrón.
3. **La tabla de riesgos afirmaba en falso** que el CI cubre Postgres. Verificado en
   `ci.yml`: no corre ninguna suite `test:*`. De ahí salió el `UPPER()` de D1.
4. **F4 sin `Number()`** sobre los `decimal` concatenaría en Postgres.

Más dos MEDIA que también entraron: los montos por cuota recalculados server-side, y
el teléfono basura que deja `seleccionarCliente()` (D4).
