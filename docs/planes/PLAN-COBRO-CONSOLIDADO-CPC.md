# Plan: cobro consolidado de CPC (multi-cuota, multi-moneda, con descuento)

Estado: **v2 — auditado por 2 agentes (backend/datos y frontend/UX), correcciones aplicadas**. Listo para implementar.
Fecha: 2026-08-27.
Extiende: `docs/planes/PLAN-PAGO-CONSOLIDADO-CAJA-MAYOR.md`.

---

## 1. Problema

En *Caja Mayor → Movimientos*, el botón **Ingreso** abre un hub
(`registrar-ingreso-dialog`) con 5 tarjetas. Una es **Cobrar a Cliente**, que hoy
abre `cobrar-cpc-rapido-dialog` → `cobrar-cuota-dialog`:

- Se busca **una** CPC del cliente, se elige **una** cuota, y se cobra.
- Una sola fuente (caja mayor **o** banco), **una** moneda, **una** forma de pago.
- Si el cliente viene a saldar tres cuentas, son tres eventos separados, tres
  movimientos de caja y tres pasadas por el mismo diálogo.
- No hay forma de dar un descuento: el único camino es cobrar de menos y dejar la
  cuota PARCIAL para siempre, o cancelar la CPC entera a mano.

Del lado de los **egresos** el problema ya está resuelto: `pagar-obligaciones-dialog`
(wizard de dos pasos) + `registrar-pago-consolidado` saldan N obligaciones del mismo
concepto con M líneas de pago (multi-moneda × multi-forma × caja/banco), postean un
movimiento consolidado por grupo físico y se anulan como un solo evento.

Ese motor **no está atado a la dirección del dinero** más de lo necesario:

- El asiento de caja usa `actualizarSaldoCajaMayor(..., adapter.tipoMovimiento)`, que
  ya deriva el signo de `esIngreso(tipo)`.
- La anulación del lado caja **ya** deriva la reversa de `esIngreso(original.tipoMovimiento)`,
  con un comentario que anticipa exactamente este caso ("el día que entre uno de
  sentido invertido … un AJUSTE_POSITIVO a fuego duplicaría plata al anular").

Lo que sí está a fuego en dirección egreso: **el tramo bancario** (`saldo - monto`,
`SALIDA_MANUAL` al pagar; `saldo + monto`, `AJUSTE_POSITIVO` al anular).

## 2. Qué se construye

Un **quinto concepto** del motor consolidado: `COBRO_CLIENTE`, cuyas obligaciones son
cuotas de `CuentaPorCobrar` y cuyo movimiento de caja es `INGRESO_COBRO_CLIENTE`.

1. El wizard existente se generaliza a "liquidar obligaciones" (cobros y pagos),
   cambiando etiquetas y validaciones según la dirección del concepto.
2. Se puede seleccionar **varias cuotas de un mismo cliente** y cobrarlas en un solo
   evento, con **N líneas** (multi-moneda × multi-forma × caja mayor/banco).
3. Se agrega una **línea de tipo `DESCUENTO`**: no mueve plata, pero cubre parte de la
   deuda, de modo que las cuotas quedan COBRADAS y el total cuadra.
4. La tarjeta **Cobrar a Cliente** del hub de Ingreso pasa a abrir este wizard.

### Decisiones cerradas con el usuario (2026-08-27)

| Decisión | Elegido |
|---|---|
| Alcance por evento | **Un solo cliente** (igual que "un pago de compras = un proveedor") |
| Descuento | **Línea de tipo `DESCUENTO`** (modelo de datos), aplicada desde un botón propio que reusa el `descuento-dialog` del PdV — no como una opción más del select *Fuente* |
| Control del descuento | **Permiso dedicado `CPC_DESCUENTO`** + **motivo obligatorio** + **tope % configurable** |
| Flujo viejo | **Se reemplaza en el hub**; `cobrar-cpc-rapido` / `cobrar-cuota-dialog` quedan en el código: los usan la PWA mobile, `cuenta-por-cobrar-detalle` y `cliente-detalle` |

### Decisiones de diseño (tomadas, no consultadas)

- **Se reutiliza `PagoConsolidado`, no se crea `CobroConsolidadoGenerico`.** Ya existe
  un `CobroConsolidado` en el repo, pero es **otra cosa**: el cobro por convenio, con
  una sola línea (una moneda, una forma) y detalle por cliente. Duplicar el motor de
  reparto/anulación para invertir un signo es peor que documentar que en
  `pagos_consolidados` "pago" significa *evento de liquidación*, y que la dirección la
  da el concepto.
- **La dirección se deriva de `esIngreso(adapter.tipoMovimiento)`** en el backend. No se
  agrega un campo `direccion` al adaptador: sería una segunda fuente de verdad que
  puede contradecir al `TipoMovimiento`. El frontend, que no puede importar
  `caja-mayor-utils`, lee `CONCEPTO_ES_INGRESO` del archivo de enums compartido, y un
  test unitario verifica que ambos coincidan para los 5 conceptos.
- **La línea `DESCUENTO` va siempre última en el reparto FIFO.** Así el efectivo imputa
  primero y el descuento cae sobre el remanente: si el usuario mira el detalle, la
  cuota que "se perdonó" es la última, no una del medio al azar.
  **El reordenamiento se hace reasignando la variable, no traduciendo índices.**
  `repartirFifo` devuelve `FilaReparto.lineaIdx` como posición *dentro del array que
  recibió*, y ese mismo índice se usa después para construir cada
  `PagoConsolidadoDetalle` (`pago-consolidado.handler.ts:292`) y para el desglose por
  fuente. Si el array reordenado y el array indexado después no son **la misma
  referencia**, el desglose "cuánto pagó / cuánto se le perdonó" sale silenciosamente
  mal — no explota, miente. Por eso el handler hace `lineas = ordenarLineasParaReparto(lineas)`
  **antes** de repartir y no vuelve a tocar el orden. Es seguro porque `grupos` está
  indexado por contenido (`claveGrupo(l)`), no por posición.
- **La línea `DESCUENTO` se denomina en la moneda de la deuda, con cotización 1.**
  Un descuento en otra moneda no significa nada: lo que se perdona es deuda.
- **El descuento NO genera movimiento físico** (ni de caja ni de banco). Se filtra antes
  de agrupar. Sí genera fila de `PagoConsolidadoDetalle` (con `fuente = DESCUENTO`,
  `caja_mayor_movimiento_id` y `movimiento_bancario_id` en null), que es lo que permite
  reconstruir "de esta cuota, X entró en efectivo y Z se descontó".
- **En la cuenta corriente del cliente el descuento es un `AJUSTE_NEGATIVO`, no un `PAGO`.**
  Los dos bajan el saldo, pero el estado de cuenta tiene que poder decir cuánto pagó el
  cliente y cuánto se le perdonó.
- **`cobrar-cpc-cuota` (el handler viejo) no se toca.** Lo consume la PWA mobile y el
  detalle de CPC. Sí se le agrega la guarda cruzada a `anular-cobro-cpc-cuota`, para que
  una cuota saldada por un evento consolidado no se pueda revertir por el camino viejo.

## 3. Modelo de datos

### 3.1 Enums (`pago-consolidado-enums.ts`) — sin migración

```ts
PagoConcepto.COBRO_CLIENTE = 'COBRO_CLIENTE'      // varchar(30), entra
PagoOrigenTipo.CPC_CUOTA   = 'CPC_CUOTA'          // varchar(30), entra
PagoConsolidadoFuente.DESCUENTO = 'DESCUENTO'     // varchar(20), entra
```

Tablas nuevas de conceptos:

| const | COBRO_CLIENTE | por qué |
|---|---|---|
| `CONCEPTO_ORIGEN` | `CPC_CUOTA` | |
| `CONCEPTO_PERMITE_PARCIAL` | `true` | cobrar a cuenta de una cuota es normal en CPC |
| `CONCEPTO_SELECCION_UNICA` | `false` | el punto de la feature |
| `CONCEPTO_BENEFICIARIO_UNICO` | `true` | un cobro = un cliente (decisión del usuario) |
| `CONCEPTO_PERMITE_DESCUENTO` (nuevo) | `true` (resto `false`) | sólo se perdona deuda de clientes |
| `CONCEPTO_ES_INGRESO` (nuevo) | `true` (resto `false`) | espejo de `esIngreso(tipoMovimiento)`, para el frontend |

`PagoConsolidadoDetalle` **no cambia**: la línea de descuento usa `moneda` = moneda de la
deuda, `cotizacion` = 1, y deja `formaPagoId` / `cajaMayorId` / `cuentaBancariaId` /
`cajaMayorMovimientoId` / `movimientoBancarioId` en null — todas ya nullable.

### 3.2 Migración (una sola, aditiva, driver-aware)

`<epoch-ms>-CobroConsolidadoCpc.ts`:

| Tabla | Columna | Tipo | Default | Para qué |
|---|---|---|---|---|
| `pagos_consolidados` | `monto_descuento` | `decimal(18,2)` | `0` | total perdonado en el evento (derivable de los detalles, pero se necesita en listados y reportes sin join) |
| `pagos_consolidados` | `motivo_descuento` | `varchar(255)` | null | motivo obligatorio cuando hay descuento |
| `movimientos_cliente` | `pago_consolidado_id` | `int` | null | ata los movimientos de cuenta corriente al evento, para revertirlos exacto e idempotente |
| `caja_mayor_configuraciones` | `descuento_cpc_max_porcentaje` | `decimal(5,2)` | null | tope de descuento (null = sin tope) |

`type` explícito en todas las columnas de entidad (pitfall del PR #234: SQLite tolera
`@Column({ nullable: true })` sobre `string | null`, Postgres rechaza al **validar
entidades**, antes de correr una migración).

Las cuatro son `ADD COLUMN` sobre tablas existentes, así que van con el patrón obligatorio
del repo: **`ALTER TABLE … ADD COLUMN IF NOT EXISTS` es inválido en SQLite**. Se consulta
el esquema (`queryRunner.getTable(tabla)` + `columns.find(...)`) antes de cada `ALTER`,
igual que `1787169888415-AddPagoConsolidado.ts:78-84`. Timestamp = epoch-ms real
(`date +%s%3N` en Linux), nunca un número redondeado.

### 3.3 Permiso nuevo

`CPC_DESCUENTO` — *"Aplicar descuentos al cobrar cuentas por cobrar"*, módulo
`FINANCIERO`, en `SEED_PERMISOS` (`permissions.handler.ts`).

**Deliberadamente NO se agrega a ningún rol plantilla** (`seed-system.ts`, GERENTE/CAJERO):
perdonar deuda es una decisión de dueño, no una capacidad por defecto de un cargo. Lo
asigna el ADMIN a mano. Además, los seeds de rol sólo corren al crear el rol: en una base
ya sembrada no retro-otorgan permisos nuevos, así que agregarlo a la plantilla no habría
alcanzado igual para las instalaciones existentes.

## 4. Backend

### 4.1 `pago-consolidado-adapters.ts` — adaptador `cobroClienteAdapter`

```
concepto        COBRO_CLIENTE
origenTipo      CPC_CUOTA
permiso         CPC_COBRAR
tipoMovimiento  INGRESO_COBRO_CLIENTE   → esIngreso() = true
```

- **`listarPendientes(ds, filtros)`** — `CuentaPorCobrarCuota` join `cuentas_por_cobrar`,
  `cliente`, `persona`, `moneda`. Filtra `cuota.estado IN (PENDIENTE, PARCIAL)` y
  `cpc.estado = ACTIVO`. `beneficiario` = razón social o nombre+apellido del cliente,
  `beneficiarioId` = `cliente.id`. `descripcion` = `CUOTA n/N — CPC #id` (+ `VENTA #x`
  si `ventaId`). `bloqueado` cuando falta moneda, cuando el saldo es ≤ 0, **o cuando la
  cuota está reservada por una liquidación de sueldo todavía no pagada** (ver abajo).
  Acepta filtros `clienteId` y `monedaId`. Orden: cliente, vencimiento, id.
- **`leerYBloquear(qr, id)`** — `findConLock` (FOR UPDATE sólo en Postgres, y en dos
  consultas por el bug del outer join). Rechaza COBRADO / CANCELADO, exige
  `cpc.estado = ACTIVO` y `cpc.moneda`. Devuelve saldo real, moneda, descripción y
  cliente.

  **Reserva por liquidación de sueldo (bloqueo obligatorio).** Un funcionario que también
  es cliente consume a crédito, y al **generar el borrador** de su liquidación el sistema
  reserva sus cuotas CPC del período: `liquidacion-sueldo.handler.ts:809-816` congela el
  saldo en un `LiquidacionItem` de tipo `CREDITO_CONSUMO` y setea `cuota.liquidacionId`.
  El monto queda congelado ahí. Si mientras tanto la cuota se cobra en efectivo, al pagar
  la liquidación se le vuelve a descontar del sueldo: **doble cobro**. `aplicarEstadoPagoLiquidacion`
  sólo saltea cuotas ya `COBRADO`/`CANCELADO`, no reconcilia montos.
  Regla: se bloquea la cuota si `liquidacionId != null` y esa liquidación está en
  `BORRADOR` o `APROBADA`. Si está `PAGADA` la reserva ya se consumió (el residual es
  deuda en efectivo legítima) y si está `ANULADA` el `liquidacionId` ya fue limpiado por
  la reversa — en ambos casos se permite. Mensaje: *"Reservada por la liquidación de
  sueldo #N — se cobra al pagar esa liquidación"*.

  **Locks: no alcanza con la cuota.** El motor ya lockea la fila de la obligación en
  orden de id (`pago-consolidado.handler.ts:117-121`), pero el cobro CPC hace
  read-modify-write sobre **dos agregados más**: `cpc.montoCobrado` y `cliente.saldoActual`.
  Dos eventos concurrentes sobre cuotas distintas del mismo cliente se pisarían el saldo
  (lost update) en modo server/Postgres. `leerYBloquear` toma lock pesimista también sobre
  `CuentaPorCobrar` y sobre `Cliente`, **en este orden total**: cuota → CPC → cliente. El
  cliente queda último y es común a todo el evento (beneficiario único), así que es un
  sumidero: no hay ciclo posible.
- **`aplicar(qr, id, monto, ctx, montoDescuento)`** — delega en un helper nuevo
  `aplicarCobroCpcCuota()` **extraído de `cuentas-por-cobrar.handler.ts`** (mismo patrón
  que `aplicarEstadoPagoCuota` del lado CPP), que:
  1. suma a `cuota.montoCobrado` y recalcula estado (`calcularEstadoCuota`), setea
     `fechaCobro` al llegar a COBRADO;
  2. suma a `cpc.montoCobrado` y pasa la CPC a `COBRADO` si todas las cuotas lo están;
  3. resta a `cliente.saldoActual`;
  4. crea `MovimientoCliente` `PAGO` por `monto - montoDescuento` (si > 0) y
     `AJUSTE_NEGATIVO` por `montoDescuento` (si > 0), ambos con `pagoConsolidadoId`.
- **`revertir(qr, id, monto, ctx, montoDescuento)`** — inverso exacto: resta lo cobrado,
  recalcula estados (CPC vuelve a `ACTIVO`), repone `cliente.saldoActual`, y marca
  `anulado = true` en los `MovimientoCliente` del evento para esa cuota.
  **Usa `find()`, no `findOne()`**: un cobro con descuento deja *dos* filas para la misma
  cuota (`PAGO` + `AJUSTE_NEGATIVO`). El patrón `findOne(..., order: id DESC)` que usa
  `anular-cobro-cpc-cuota` (`cuentas-por-cobrar.handler.ts:463`) revertiría una sola y
  dejaría el saldo del cliente mal por exactamente el monto del descuento. El filtro es
  `{ pagoConsolidadoId, cuentaPorCobrarCuotaId: origenId, anulado: false }`, y marcar
  todas las filas encontradas es lo que hace la reversa idempotente.
- **`columnaReferencia(id)`** → `{ cuentaPorCobrarCuotaId: id }` (la columna ya existe en
  `CajaMayorMovimiento` y la usa el cobro viejo).

La firma de `ConceptoAdapter.aplicar` / `revertir` gana un 5º parámetro opcional
`montoDescuento`; los 4 adaptadores existentes lo ignoran.

### 4.2 `pago-consolidado.util.ts` (compartido)

- `LineaDePago.fuente` pasa a `'CAJA_MAYOR' | 'CUENTA_BANCARIA' | 'DESCUENTO'`.
- `validarCobertura` deja de exigir caja/forma o cuenta cuando la fuente es `DESCUENTO`,
  y agrega: la línea de descuento debe estar en la moneda de la deuda con cotización 1.
- `validarCobertura` deriva la moneda de la deuda de `items[0].monedaId` (`validarSeleccion`
  ya garantiza que sea única); no cambia la firma.
- `ordenarLineasParaReparto(lineas): LineaDePago[]` — nuevo: devuelve **un array nuevo**
  con las líneas `DESCUENTO` al final y el resto en orden estable. **No** devuelve tabla
  de índices: el handler reasigna `lineas` con el resultado antes de repartir y usa esa
  misma referencia en todo lo que indexe por `lineaIdx` (ver decisión de diseño en §2).
- `imputadoPorItemPorFuente(filas, lineas, cantidadItems, decimales)` — nuevo: devuelve
  `{ total, descuento }[]` con una entrada por ítem **siempre** (ceros incluidos, nunca
  claves ausentes). `imputadoPorItem` se mantiene (lo usan los 4 conceptos viejos)
  implementado sobre el nuevo.
- `descripcionEvento` gana los plurales de `COBRO_CLIENTE` y el verbo correcto:
  `COBRO DE …` / `COBRO CONSOLIDADO DE N CUOTAS DE CLIENTE — <cliente>`.

### 4.3 `pago-consolidado.handler.ts`

`registrar-pago-consolidado`:

Orden exacto de la secuencia (importa: el tope del descuento se valida contra
`totalDeuda`, que hoy se calcula recién al armar la cabecera):
relectura con lock → `validarSeleccion` → **cómputo de `totalDeuda`** → validaciones del
descuento → resolución de cotizaciones → `validarCobertura` → cabecera → asientos.

1. `const esIngresoEvento = esIngreso(adapter.tipoMovimiento)`.
2. La validación de beneficiario único deja de estar hardcodeada a `COMPRA` y pasa a
   `CONCEPTO_BENEFICIARIO_UNICO[concepto]` (el mensaje sale de una tabla por concepto).
3. **Descuento** (sólo si el payload trae una línea `DESCUENTO`):
   - `CONCEPTO_PERMITE_DESCUENTO[concepto]` o error;
   - `ensurePermission(..., 'CPC_DESCUENTO')`;
   - `motivoDescuento` no vacío o error;
   - una sola línea de descuento por evento;
   - tope: `montoDescuento <= totalDeuda * (config.descuentoCpcMaxPorcentaje / 100)`,
     leyendo `CajaMayorConfiguracion` de `payload.cajaMayorContextoId` (el wizard siempre
     lo manda; si no hay config o el tope es null, no hay tope);
   - el descuento no puede cubrir el 100% de la deuda (eso es *cancelar* la CPC, que
     tiene su propio handler `cancelar-cuenta-por-cobrar` y su propio permiso).
4. Las líneas `DESCUENTO` **se excluyen** del armado de `grupos` (no hay movimiento
   físico que crear). Al construir el detalle, la línea de descuento se maneja con una
   rama explícita en vez del `grupos.get(claveGrupo(l))!` actual
   (`pago-consolidado.handler.ts:293`): hoy ese non-null assertion sobrevive de casualidad
   porque las dos ternarias que usan `g.movimientoId` chequean la fuente, y cualquier
   refactor de esas líneas lo convierte en un `TypeError` en producción.
5. Tramo bancario direccional: `cb.saldo ± g.monto` y
   `ENTRADA_MANUAL` / `SALIDA_MANUAL` según `esIngresoEvento`.
6. Cabecera: `montoDescuento` y `motivoDescuento` persistidos.
7. `adapter.aplicar(...)` recibe el desglose por ítem de
   `imputadoPorItemPorFuente`.

`anular-pago-consolidado`:

- Tramo caja: ya es direccional ✓.
- Tramo banco: `cb.saldo ∓ monto` y `AJUSTE_NEGATIVO` / `AJUSTE_POSITIVO` según la
  dirección del concepto del pago (se resuelve por `getAdapter(pago.concepto)`).
- Los detalles con `fuente = DESCUENTO` no tienen movimiento que revertir; sí cuentan
  para lo que se reabre en la obligación, y se pasan como `montoDescuento` a
  `adapter.revertir`.

`get-pago-consolidado-detalle`: agrega `montoDescuento`, `motivoDescuento` y `esIngreso`
al DTO, y la "línea" de descuento sale en `lineas` con `fuente: 'DESCUENTO'`.

### 4.4 Guarda cruzada

`anular-cobro-cpc-cuota` arranca con
`bloquearSiPagoConsolidado(dataSource, PagoOrigenTipo.CPC_CUOTA, cuotaId, 'La cuota #X')`:
si la cuota fue cobrada dentro de un evento consolidado activo, la reversa tiene que
deshacer el evento entero desde Caja Mayor.

## 5. Frontend

### 5.1 `pagar-obligaciones-dialog` → wizard de liquidación

Mismo componente, mismas dos etapas. Cambia:

- `TITULOS[COBRO_CLIENTE] = { titulo: 'Cobrar a cliente', nuevo: null, columnaItem: 'Cuota' }`.
- **Tabla `LABELS` por dirección**, análoga a `TITULOS`, no un puñado de ifs. El `.html`
  actual tiene texto fijo en dirección "pago" en **al menos 8 lugares**, y cambiar sólo
  algunos deja una pantalla "Cobrar a Cliente" que dice "Confirmar pago". Claves mínimas:
  `columnaMonto` ("Monto a pagar"/"Monto a cobrar"), `columnaBeneficiario`
  ("Beneficiario"/"Cliente"), `filtroBeneficiario`, `destinatario` ("Pagar a"/"Cobrar a"),
  `totalDeuda` ("Total a pagar"/"Total a cobrar"), `totalLineas` ("Total formas de
  pago"/"Total formas de cobro"), `bloqueItems` ("Se paga"/"Se cobra"), `bloqueLineas`,
  `confirmar` ("Confirmar pago"/"Confirmar cobro"), `pasoLineas` ("Formas de pago"/"Formas
  de cobro"). Todas precomputadas en `ngOnInit` — regla dura: nada de funciones ni getters
  en el template.
- **Permiso precomputado, no evaluado en el template.** `PermissionService.has()` es un
  método: llamarlo desde un `*ngIf` viola la regla dura #4 y además no es reactivo. El
  componente se suscribe a `permissionService.codigos$` (mismo patrón que
  `HasPermissionDirective`) y mantiene `puedeAplicarDescuento: boolean` como propiedad.
  El template lee sólo esa propiedad.
- **Descuento: botón propio, no una opción de *Fuente*.** El wizard enseña "una línea =
  de dónde entra la plata"; un descuento no es una fuente de fondos, y ponerlo en ese
  select le enseña al usuario una categoría falsa — además de convertir
  `completarFaltante()` en un botón de "perdonar todo lo que falta" de un clic.
  En su lugar: un botón **Aplicar descuento** en el paso 2 (visible sólo si
  `puedeAplicarDescuento`) que abre el **`DescuentoDialogComponent` que ya existe**
  (`src/app/shared/components/descuento-dialog/`, hoy usado por el PdV): radio
  porcentaje/monto, motivo obligatorio, y resumen vivo "Descuento: −X / Total: Y".
  Se lo extiende con dos entradas opcionales — `maxPorcentaje` (el tope configurado, que
  se muestra y se clampea en la UI, además de validarse en backend) y `decimales` — sin
  romper al PdV. Al aceptar, el componente crea o reemplaza **una** línea `DESCUENTO`
  interna (moneda de la deuda, cotización 1) que aparece en la tabla de líneas como
  "Descuento — <motivo>" con su acción de quitar.
- **Cambiar la selección después de aplicar un descuento lo descarta**, con aviso: el
  descuento se calculó sobre un total que ya no existe. Explícito y visible es mejor que
  un monto que sobrevive en silencio a un cambio de base.
- **Buscador de texto en el paso 1 para `COBRO_CLIENTE`.** El flujo viejo tenía
  autocomplete de cliente (`cobrar-cpc-rapido-dialog`); el wizard sólo tiene un
  `mat-select` con todos los beneficiarios, que con cientos de clientes a crédito es una
  regresión. Se agrega un input de filtro por texto (con botón "Filtrar", no live
  filtering) sobre nombre de cliente, activo sólo en este concepto.
- `confirmarSaldosNegativos` **no** corre en un cobro: entra plata, no sale.
- El payload suma `cajaMayorContextoId` y `motivoDescuento`.
- Resumen del paso 2: fila "Descuento" separada del total cobrado.
- El ícono de cada línea (`l.icono`) se precomputa en `actualizarLinea()` con las tres
  fuentes, en vez del ternario de dos ramas que hay hoy inline en el template.

### 5.2 `registrar-ingreso-dialog`

La tarjeta **Cobrar a Cliente** abre `PagarObligacionesDialogComponent` con
`{ concepto: COBRO_CLIENTE, cajaMayorId }` (mismo ancho que los pagos, 1000px), en vez de
`CobrarCpcRapidoDialogComponent`. Se actualiza la descripción de la tarjeta ("Cobrar una
o varias cuotas pendientes de un cliente, con descuento opcional").

### 5.3 `caja-mayor-detalle`

`registrarIngreso()` agrega `PagarObligacionesDialogComponent` a la lista de
`detectarYEscucharSubdialog`, para que al cerrarse refresque los movimientos.

### 5.4 `detalle-pago-consolidado-dialog`

- Etiqueta el evento como *Cobro* o *Pago* según `esIngreso`.
- La línea `DESCUENTO` se muestra como "Descuento" (sin caja ni cuenta) y el motivo
  aparece bajo la cabecera.
- Antes de anular un evento de ingreso, corre `confirmarSaldosNegativos` (revertir un
  cobro **debita** la caja).

### 5.5 `configurar-caja-mayor-dialog`

Campo nuevo *"Descuento máximo al cobrar CPC (%)"*, vacío = sin tope.

### 5.6 Otros puntos de entrada al cobro de CPC (fuera de alcance, documentados)

Tras el cambio conviven cuatro caminos de cobro de CPC. Sólo el primero cambia:

| Camino | Qué hace | Estado |
|---|---|---|
| Caja Mayor → Ingreso → Cobrar a Cliente | wizard nuevo, multi-cuota + descuento | **cambia** |
| `cuenta-por-cobrar-detalle` | `cobrar-cuota-dialog`, una cuota | sin cambios |
| `cliente-detalle` (`cliente-detalle.component.ts:382`) | `cobrar-cuota-dialog`, una cuota | sin cambios |
| PWA mobile | `cobrar-cpc-cuota` por `/api/rpc` | sin cambios |

Queda como ítem de backlog (no de este PR) ofrecer el wizard desde `cuenta-por-cobrar-detalle`
y `cliente-detalle` con `origenIdsPreseleccionados` — el diálogo ya soporta ese dato. Sin
eso, un cajero parado en la ficha del cliente no llega al cobro múltiple desde ahí.

### 5.7 Menú

Sin pantalla nueva navegable → `MENU_TREE` no cambia.

## 6. Tests

| Test | Qué cubre |
|---|---|
| `npm run test:pago-consolidado` (extendido) | `CONCEPTO_ES_INGRESO` == `esIngreso(tipoMovimiento)` para los 5 conceptos; `validarCobertura` con línea DESCUENTO (ok / moneda distinta / cotización ≠ 1); `ordenarLineasParaReparto` deja el descuento último; `imputadoPorItemPorFuente` reparte total y descuento con las dos invariantes exactas |
| `npm run test:cobro-cpc-consolidado` (**nuevo**, `scripts/test-cobro-cpc-consolidado-e2e.ts`) | E2E sobre SQLite temporal: cliente + CPC de 3 cuotas → cobro de 2 con efectivo PYG + USD + descuento → verifica estados de cuota/CPC, `cliente.saldoActual`, saldo de caja por (moneda×forma), `MovimientoCliente` PAGO y AJUSTE_NEGATIVO, cabecera `montoDescuento`; luego **anula** y verifica que todo vuelve al estado inicial; y que `anular-cobro-cpc-cuota` queda bloqueado mientras el evento está activo |
| `npm run test:permisos` | el permiso nuevo `CPC_DESCUENTO` está sembrado y el handler lo exige |
| `pagar-obligaciones-dialog.component.spec.ts` (**nuevo**) | precedente directo: `create-operacion-financiera-dialog.component.spec.ts` documenta que los bugs de este repo viven en el orden de `ngOnInit` y en el efecto de cambiar de tipo sobre los VALORES del form — que es exactamente lo que este cambio toca. Cubre: (a) payload de `COBRO_CLIENTE` (`items`/`lineas`/`cajaMayorContextoId`/`motivoDescuento`) y **regresión**: payload de COMPRA/GASTO/VALE/SALARIO sin cambios; (b) la línea DESCUENTO queda en moneda de la deuda con cotización 1 y sin caja/cuenta/forma; (c) `puedeAplicarDescuento=false` oculta el botón aunque el concepto lo permita; (d) cambiar la selección descarta el descuento; (e) las líneas llegan al payload en el orden que el handler espera |
| Batería completa (`test:*`) | no romper nada del motor consolidado ni de CPC |
| `npm run check` | AOT de producción |

Casos borde que el e2e debe cubrir explícitamente: cobrar una cuota reservada por una
liquidación en BORRADOR (debe fallar) y la misma cuota con la liquidación PAGADA (debe
permitirse); descuento del 100% (debe fallar); descuento por encima del tope (debe
fallar); anular un evento con descuento y verificar que **las dos** filas de
`MovimientoCliente` quedan revertidas.

## 7. Fases

1. **F1 — Enums, entidades, migración, permiso.** Enums nuevos + tablas de concepto,
   columnas nuevas en 3 entidades, migración driver-aware, `CPC_DESCUENTO` en el seed.
2. **F2 — Util compartido.** `DESCUENTO` en `LineaDePago`, `validarCobertura`,
   `ordenarLineasParaReparto`, `imputadoPorItemPorFuente`, `descripcionEvento`.
3. **F3 — Adaptador CPC + extracción de helpers de `cuentas-por-cobrar.handler.ts`** +
   guarda cruzada en `anular-cobro-cpc-cuota`.
4. **F4 — Handler consolidado direccional + descuento** (registrar / anular / detalle).
5. **F5 — Frontend**: wizard generalizado, hub de ingreso, detalle, configuración.
6. **F6 — Tests** (unit + e2e nuevo) y batería completa.
7. **F7 — AOT, documentación, manual de pruebas, skill.** Archivos concretos:
   `docs/testing/COBRO-CONSOLIDADO-CPC.md` (nuevo, manual de pruebas);
   `.claude/skills/frc-gourmet-expert/domains/financiero-cpp-cpc.md` (líneas ~160 y ~258
   afirman que el acceso rápido de cobro desde Caja Mayor es `cobrar-cpc-rapido-dialog`:
   deja de ser cierto);
   `.claude/skills/frc-gourmet-expert/domains/financiero-caja-mayor.md` (sección del motor
   de pago consolidado: 5º concepto, dirección, descuento);
   `.claude/skills/frc-gourmet-expert/reference/enums-index.md` (enums nuevos);
   `.claude/skills/frc-gourmet-expert/SKILL.md` §4 (snapshot de sesión).
   **Aviso al usuario:** el cambio toca `electron/handlers/*`, entidades y migración →
   requiere reiniciar la app, no alcanza con el hot reload.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Reordenar las líneas para el reparto desalinea los índices de `grupos`/`detalles` | `ordenarLineasParaReparto` devuelve el mapeo de índices; el handler lo aplica al construir los detalles, y el test unitario compara contra el reparto sin reordenar |
| Un descuento del 100% deja la cuota COBRADA sin que entre un guaraní | Rechazado en backend: para eso está `cancelar-cuenta-por-cobrar` |
| El tope se lee de la config de una caja que no participa del cobro (líneas 100% banco) | El wizard siempre manda `cajaMayorContextoId` (la caja desde la que se abrió); el tope es una regla operativa de esa caja |
| `cliente.saldoActual` desincronizado si se mezclan cobro viejo y consolidado | Ambos caminos lo mueven por el mismo delta; además existe `recalcular-saldo-cliente`. La guarda cruzada evita la doble reversa, que es el caso que sí corrompía |
| Postgres rechaza columnas de entidad sin `type` explícito | Todas las columnas nuevas declaran `type` (pitfall del PR #234) |
