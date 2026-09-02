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
- **Extracción para test**: la decisión ("¿hay otra caja abierta? ¿qué aviso muestro?")
  va a un util puro `src/app/shared/utils/caja-apertura.util.ts`, mismo criterio que
  `operacion-financiera-validacion.util.ts`.

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
- UI: botón **PAGARÉ** en el footer del `delivery-dialog`, habilitado cuando el
  delivery tiene cliente con `credito`. Abre un diálogo chico (cuotas, frecuencia,
  fecha de inicio, monto prellenado con el saldo) y manda a imprimir.
- **Riesgo asumido y documentado**: queda un pagaré firmado sin CPC si al final se
  cobra en efectivo. Es papel, no dato; el cajero lo descarta.

### F5 — Clientes sin teléfono en el delivery

- **D1**: `buscar-clientes-por-telefono` pasa a buscar por **teléfono, nombre,
  documento y RUC** (`LEFT JOIN` a persona en vez de `INNER JOIN`, que hoy también
  excluye al cliente sin persona). Se le deja el nombre del canal para no romper
  llamadores; se documenta el cambio de semántica.
- **D2**: `recalcular()` exige teléfono **sólo si no hay cliente seleccionado**. Con
  un cliente ya elegido, su identidad ya está resuelta y el teléfono es opcional.
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
| `test:buscar-clientes` | Un cliente **sin teléfono** aparece buscando por nombre y por documento; el que tiene teléfono sigue apareciendo por teléfono | **nueva** |
| `test:delivery`, `test:delivery-conversion`, `test:terminal-caja`, `test:ticket-delivery-pagos`, `test:pedidos-online`, `test:cobro-parcial` | Regresión de lo que se toca | existentes |
| `npm run test:all` | Batería completa (paso 9) | — |

Fuera de alcance de los ts-node: la UI de los diálogos. Por eso F1 extrae el util
puro en vez de dejar la decisión adentro del componente.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El join nuevo de `venta.cliente` (F3) choca con el alias `cliente` que ya usa `delivery.cliente` | Alias distintos + test que verifica que **los dos** vienen hidratados |
| Aflojar el buscador de clientes (F5) mete ruido en el autocomplete del delivery | Se mantiene el `take(15)` y el orden por nombre; el match exacto por teléfono que autoselecciona sigue siendo por teléfono |
| Un pagaré firmado sin CPC detrás (F4) | Decisión explícita del usuario. Referencia `VENTA #N` en el papel para reconciliar |
| `checkOpenCajas()` corriendo siempre (F1) agrega una consulta al abrir el diálogo | `getCajas()` ya se llamaba en el otro camino; es la misma consulta |
| Todo se verifica en SQLite | Ninguna fase toca entidades, migraciones, `decimal` ni fechas. El job de Postgres del CI es el gate igual |
| F6 se incluyó sobre un supuesto | La fase es independiente: se quita entera sin tocar las otras cinco |
