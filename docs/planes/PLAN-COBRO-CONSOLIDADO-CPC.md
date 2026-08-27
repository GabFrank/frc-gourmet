# Plan: cobro consolidado de CPC (multi-cuota, multi-moneda, con descuento)

Estado: **v1 — pendiente de auditoría**.
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
| Descuento | **Línea de tipo `DESCUENTO`** en el paso 2 (global del evento) |
| Control del descuento | **Permiso dedicado `CPC_DESCUENTO`** + **motivo obligatorio** + **tope % configurable** |
| Flujo viejo | **Se reemplaza en el hub**; `cobrar-cpc-rapido` / `cobrar-cuota-dialog` quedan en el código (los usa la PWA mobile y el detalle de CPC) |

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

### 3.3 Permiso nuevo

`CPC_DESCUENTO` — *"Aplicar descuentos al cobrar cuentas por cobrar"*, módulo
`FINANCIERO`, en `SEED_PERMISOS` (`permissions.handler.ts`).

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
  si `ventaId`). `bloqueado` cuando falta moneda o el saldo es ≤ 0. Acepta filtros
  `clienteId` y `monedaId`. Orden: cliente, vencimiento, id.
- **`leerYBloquear(qr, id)`** — `findConLock` (FOR UPDATE sólo en Postgres, y en dos
  consultas por el bug del outer join). Rechaza COBRADO / CANCELADO, exige
  `cpc.estado = ACTIVO` y `cpc.moneda`. Devuelve saldo real, moneda, descripción y
  cliente.
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
  `anulado = true` en los `MovimientoCliente` del evento para esa cuota (idempotente).
- **`columnaReferencia(id)`** → `{ cuentaPorCobrarCuotaId: id }` (la columna ya existe en
  `CajaMayorMovimiento` y la usa el cobro viejo).

La firma de `ConceptoAdapter.aplicar` / `revertir` gana un 5º parámetro opcional
`montoDescuento`; los 4 adaptadores existentes lo ignoran.

### 4.2 `pago-consolidado.util.ts` (compartido)

- `LineaDePago.fuente` pasa a `'CAJA_MAYOR' | 'CUENTA_BANCARIA' | 'DESCUENTO'`.
- `validarCobertura` deja de exigir caja/forma o cuenta cuando la fuente es `DESCUENTO`,
  y agrega: la línea de descuento debe estar en la moneda de la deuda con cotización 1.
- `ordenarLineasParaReparto(lineas)` — nuevo: devuelve las líneas con las de `DESCUENTO`
  al final, preservando el orden relativo del resto. Se usa **antes** de `repartirFifo`,
  y el handler mapea los índices resultantes de vuelta para no desalinear
  `grupos`/`detalles`.
- `imputadoPorItemPorFuente(filas, lineas, cantidadItems, decimales)` — nuevo: devuelve
  `{ total, descuento }[]` por ítem. `imputadoPorItem` se mantiene (lo usan los 4
  conceptos viejos) implementado sobre el nuevo.
- `descripcionEvento` gana los plurales de `COBRO_CLIENTE` y el verbo correcto:
  `COBRO DE …` / `COBRO CONSOLIDADO DE N CUOTAS DE CLIENTE — <cliente>`.

### 4.3 `pago-consolidado.handler.ts`

`registrar-pago-consolidado`:

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
   físico que crear).
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
- `esIngresoConcepto = CONCEPTO_ES_INGRESO[concepto]` gobierna las etiquetas
  precomputadas (regla del repo: nada de funciones ni getters en el template):
  "Monto a cobrar" / "Formas de cobro" / "Cobrar a <cliente>" / botón **Cobrar**.
- El filtro de beneficiario pasa a decir "Cliente" en este concepto.
- **Paso 2 — línea de descuento:** la fuente gana una tercera opción *Descuento*,
  visible sólo si `permiteDescuento && permisos.has('CPC_DESCUENTO')`. Al elegirla se
  ocultan caja/cuenta/forma/moneda (queda fija la de la deuda) y aparecen **monto** (con
  atajo por %) y **motivo** (requerido). Se admite una sola.
- `confirmarSaldosNegativos` **no** corre en un cobro: entra plata, no sale.
- El payload suma `cajaMayorContextoId` y `motivoDescuento`.
- Resumen del paso 2: fila "Descuento" separada del total cobrado.

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

### 5.6 Menú

Sin pantalla nueva navegable → `MENU_TREE` no cambia.

## 6. Tests

| Test | Qué cubre |
|---|---|
| `npm run test:pago-consolidado` (extendido) | `CONCEPTO_ES_INGRESO` == `esIngreso(tipoMovimiento)` para los 5 conceptos; `validarCobertura` con línea DESCUENTO (ok / moneda distinta / cotización ≠ 1); `ordenarLineasParaReparto` deja el descuento último; `imputadoPorItemPorFuente` reparte total y descuento con las dos invariantes exactas |
| `npm run test:cobro-cpc-consolidado` (**nuevo**, `scripts/test-cobro-cpc-consolidado-e2e.ts`) | E2E sobre SQLite temporal: cliente + CPC de 3 cuotas → cobro de 2 con efectivo PYG + USD + descuento → verifica estados de cuota/CPC, `cliente.saldoActual`, saldo de caja por (moneda×forma), `MovimientoCliente` PAGO y AJUSTE_NEGATIVO, cabecera `montoDescuento`; luego **anula** y verifica que todo vuelve al estado inicial; y que `anular-cobro-cpc-cuota` queda bloqueado mientras el evento está activo |
| `npm run test:permisos` | el permiso nuevo `CPC_DESCUENTO` está sembrado y el handler lo exige |
| Batería completa (`test:*`) | no romper nada del motor consolidado ni de CPC |
| `npm run check` | AOT de producción |

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
7. **F7 — AOT, documentación, manual de pruebas, skill.**

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Reordenar las líneas para el reparto desalinea los índices de `grupos`/`detalles` | `ordenarLineasParaReparto` devuelve el mapeo de índices; el handler lo aplica al construir los detalles, y el test unitario compara contra el reparto sin reordenar |
| Un descuento del 100% deja la cuota COBRADA sin que entre un guaraní | Rechazado en backend: para eso está `cancelar-cuenta-por-cobrar` |
| El tope se lee de la config de una caja que no participa del cobro (líneas 100% banco) | El wizard siempre manda `cajaMayorContextoId` (la caja desde la que se abrió); el tope es una regla operativa de esa caja |
| `cliente.saldoActual` desincronizado si se mezclan cobro viejo y consolidado | Ambos caminos lo mueven por el mismo delta; además existe `recalcular-saldo-cliente`. La guarda cruzada evita la doble reversa, que es el caso que sí corrompía |
| Postgres rechaza columnas de entidad sin `type` explícito | Todas las columnas nuevas declaran `type` (pitfall del PR #234) |
