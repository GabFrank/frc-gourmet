# Dominio: Financiero — Caja Mayor

**Caja Mayor ≠ Caja (PdV)**.
- **Caja (PdV)**: hardware-bound, maneja efectivo físico, apertura/cierre diario.
- **Caja Mayor**: agregador financiero virtual. Ledger contable centralizado de TODOS los movimientos del negocio.

Caja Mayor consolida ingresos (retiros de cajas PdV, entradas varias, cobros) y egresos (gastos, compras, salarios, transferencias). Permite ver liquidez total por moneda × forma de pago.

## Entidades

### CajaMayor

```typescript
{
  nombre: string                  // ej: "Caja Mayor Sucursal Centro"
  descripcion?: text
  estado: ABIERTA | CERRADA
  fechaApertura, fechaCierre?
  responsable: Usuario
  saldos: CajaMayorSaldo[]
  movimientos: CajaMayorMovimiento[]
}
```

### CajaMayorMovimiento

Registro **inmutable** de cada movimiento. NUNCA se borra — se anula con contra-movimiento.

```typescript
{
  cajaMayor_id (sin FK constraint para flexibilidad)
  tipoMovimiento: TipoMovimiento  // 23 valores (ver abajo)
  moneda_id, formaPago_id          // QUÉ se movió y CÓMO se pagó
  monto: decimal(10,2)
  fecha: datetime
  responsable: Usuario
  observacion?: text

  // Relaciones ManyToOne a origen (todas opcionales, createForeignKeyConstraints:false):
  gasto, retiroCaja, conteo        // @ManyToOne SIN constraint de FK real
                                   // (conteo: para EGRESO_CAJA_INICIAL, el efectivo
                                   //  sembrado a una apertura de caja)
  // Columnas planas int sin relación ORM:
  compraCuotaId, operacionFinancieraId, entradaVariaId,
  cuentaPorPagarCuotaId, cuentaPorPagarId, chequeId,
  acreditacionPosId, valeId, liquidacionSueldoId,
  liquidacionComisionId, cuentaPorCobrarCuotaId, compraId
  referenciaAnulacion?: CajaMayorMovimiento  // self-ref (este es contra-mov de aquel)
}
```

### Columna "Observación" de la tabla de movimientos (se COMPONE al leer)

La tabla de movimientos (`caja-mayor-detalle`) muestra una observación **legible
compuesta en el handler** `get-movimientos-caja-mayor-consolidados`
(`caja-mayor.handler.ts`), NO el campo `observacion` crudo. Se compone al leer
(no al crear) para que los movimientos viejos y nuevos se vean igual. Batch-load
por id de las entidades origen (que en su mayoría son columnas int sin relación):

| Tipo | Formato | Fuente |
|---|---|---|
| Gasto | `Gasto #<id>: (<categoria>) <desc>` | relación `gasto` + `gastoCategoria` |
| Entrada varia | `Entrada #<id>: (<categoria>) <desc>. <obs>` | lookup `EntradaVaria` by `entradaVariaId` |
| Op. financiera | `<tipoOp> #<id>: (<categoria>) <desc>. <obs>` | lookup `OperacionFinanciera` by `operacionFinancieraId` |
| Retiro / Cierre | `RETIRO/CIERRE CAJA #<id> <fechaApertura>` | relación `retiroCaja` → `caja.fechaApertura` |
| Pago compra | `Pago compra #<id> <proveedor>` | lookup `Compra` by `compraId` |
| Otros / ajustes / anulaciones | el `observacion` crudo (fallback) | — |

- Formateo defensivo: sin `()`, `: ` ni `. ` colgando cuando falta categoría/desc/obs.
- La fila lleva **`observacionRaw`** además de `observacion` (compuesta); el
  diálogo de edición usa `observacionRaw` para no denormalizar el texto compuesto.
- Orden de columnas: `fuente · fecha · responsable · tipo · observacion · detalle · acciones`.

### CajaMayorSaldo

Snapshot del saldo por (caja, moneda, formaPago):

```typescript
{
  cajaMayor, moneda, formaPago     // unique tupla (validado en handler)
  saldo: decimal(10,2)
}
```

**Sin trigger SQL**: actualización manual en transacción vía `actualizarSaldoCajaMayor()` (`caja-mayor-utils.ts`).

### CajaMayorConfiguracion

Configuración por caja mayor:

```typescript
{
  cajaMayor: CajaMayor (1:1)
  formasPagoVisibles: FormasPago[] (M:M, tabla `caja_mayor_config_formas_pago`)
  cuentasBancariasVisibles: CuentaBancaria[] (M:M, tabla `caja_mayor_config_cuentas_bancarias`)
  cuentasBancariasOrden?: string   // array JSON de ids: ORDEN de las cuentas en el sidebar (drag & drop)
  mostrarCuentasPorPagar: boolean (default false)
  mostrarCuentasPorCobrar: boolean (default false)
}
```

**Default tolerante**: si no existe config para una caja, mostrar TODAS las FPs y NINGUNA cuenta bancaria. **Además**: una lista `formasPagoVisibles` **vacía** se trata como "sin filtro" (mostrar todas las FPs de efectivo) — nunca deja el sidebar de efectivo vacío. Aplica en desktop (`caja-mayor-detalle`) y mobile.

**Orden de cuentas bancarias (drag & drop)**: `cuentasBancariasOrden` guarda un array JSON de ids en el orden elegido en el diálogo. La M:M `cuentasBancariasVisibles` define QUÉ cuentas se muestran; esta columna define el ORDEN. El sidebar (desktop + mobile) ordena las cards por ese array; los ids ausentes caen al final por id ascendente. Migración `AddCuentasBancariasOrdenCajaMayorConfig`.

**Diálogo `configurar-caja-mayor-dialog`** (2026-07): la sección "Formas de pago a mostrar" **fue eliminada** (en caja mayor solo circula EFECTIVO, así que filtrar por FP era inútil). El diálogo ya no manda `formaPagoIds`; el handler `save-caja-mayor-configuracion` trata `formaPagoIds === undefined` como "no tocar" (preserva la M:M existente, no la vacía). La lista de cuentas bancarias es **reordenable con drag & drop** (Angular CDK `cdkDropList`/`cdkDragHandle`), y ese orden se persiste en `cuentasBancariasOrden`.

## TipoMovimiento (23 valores)

`src/app/database/entities/financiero/caja-mayor-enums.ts` (enum `TipoMovimiento`, líneas 6-30): 9 ingresos + 13 egresos + 1 administrativo.

### Ingresos (9)

| Tipo | Origen |
|---|---|
| INGRESO_RETIRO_CAJA | Ingresar retiro de caja PdV (origen MANUAL) |
| INGRESO_CIERRE_CAJA | Ingresar retiro generado por el cierre de una caja PdV (`RetiroCajaOrigen.CIERRE`); ver `ingresar-retiro-caja` |
| INGRESO_ENTRADA_VARIA | Entrada varia destino CAJA_MAYOR |
| INGRESO_OPERACION_FINANCIERA | Lado destino de operación financiera |
| INGRESO_RETIRO_BANCO | Retiro de cuenta bancaria → caja mayor |
| INGRESO_COBRO_CLIENTE | Cobro de CPC |
| INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO | Cobro directo de cuota préstamo a funcionario |
| TRANSFERENCIA_ENTRADA | Lado destino de transferencia entre cajas |
| AJUSTE_POSITIVO | Manual o contra-mov de anulación de egreso |

### Egresos (13)

| Tipo | Origen |
|---|---|
| EGRESO_GASTO | Crear gasto |
| EGRESO_COMPRA | Pago directo de compra contado (legacy pre-refactor 2026-05-05) |
| EGRESO_CUOTA_COMPRA | Pago de cuota CPP tipo COMPRA |
| EGRESO_CUOTA_PRESTAMO | Pago de cuota CPP tipo PRESTAMO |
| EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO | Crear préstamo a funcionario |
| EGRESO_VALE | Confirmar vale RRHH |
| EGRESO_SALARIO | Pagar liquidación de sueldo o final |
| EGRESO_CHEQUE | Emitir cheque |
| EGRESO_OPERACION_FINANCIERA | Lado origen de operación financiera |
| EGRESO_DEPOSITO_BANCO | Depósito bancario (caja mayor → cuenta bancaria) |
| EGRESO_CAJA_INICIAL | Efectivo retirado de caja mayor para sembrar la apertura de una caja PdV; ver `egreso-caja-inicial` (genera un movimiento por moneda y reutiliza el `Conteo` como apertura) |
| TRANSFERENCIA_SALIDA | Lado origen de transferencia entre cajas |
| AJUSTE_NEGATIVO | Manual o contra-mov de anulación de ingreso |

### Administrativo (1)

| Tipo | Origen |
|---|---|
| ANULACION | Marcador para movimientos generados al anular otros (`referenciaAnulacion` apunta al original) |

## Helper crítico: actualizarSaldoCajaMayor

`electron/handlers/caja-mayor-utils.ts` (todo el archivo, ~51 líneas). Tanto `esIngreso` como `actualizarSaldoCajaMayor` viven acá; el handler los importa como `actualizarSaldo` (alias) y `esIngreso`:

```typescript
async function actualizarSaldoCajaMayor(
  queryRunner: QueryRunner,
  cajaMayorId: number,
  monedaId: number,
  formaPagoId: number,
  monto: number,
  tipo: TipoMovimiento
): Promise<void> {
  // 1. Find or create CajaMayorSaldo (cajaMayorId, monedaId, formaPagoId)
  // 2. delta = esIngreso(tipo) ? monto : -monto
  // 3. saldo.saldo += delta
  // 4. queryRunner.manager.save(saldo)
}

function esIngreso(tipo: TipoMovimiento): boolean {
  return [INGRESO_*, TRANSFERENCIA_ENTRADA, AJUSTE_POSITIVO].includes(tipo);
}
```

**Reglas**:
- **Siempre llamar dentro de una transacción** (`queryRunner.manager`).
- **Mismo helper para todos los módulos** — no reimplementar.
- Si se agrega tipo nuevo, actualizar `esIngreso()` en `caja-mayor-utils.ts` (NO en `caja-mayor-enums.ts`, que solo define el enum).

**Recalcular saldos** (safety net): handler `recalcular-saldos` (`caja-mayor.handler.ts`) borra todos los `CajaMayorSaldo` y los reconstruye sumando movimientos activos (resta los anulados vía `esIngreso`).

## Anulación de movimiento

`anular-caja-mayor-movimiento` (`caja-mayor.handler.ts`, permiso `CAJA_MAYOR_OPERAR`):

### Bloqueos automáticos

Si el movimiento tiene una columna de trazabilidad a otro módulo, bloquea con mensaje claro (debe anularse desde el módulo origen):

| Columna | Mensaje |
|---|---|
| `liquidacionSueldoId` | "Anular desde Liquidaciones de Sueldo" |
| `cuentaPorPagarCuotaId` | "Anular desde Cuentas por Pagar (cuota)" |
| `valeId` | "Anular desde Vales" |
| `liquidacionComisionId` | "Anular desde Comisiones" |
| `cuentaPorCobrarCuotaId` | "Anular desde Cuentas por Cobrar" |
| `cuentaPorPagarId` | "Anular CPP completo" |
| `compraId` | "Anular desde módulo Compras" |
| `tipoMovimiento === ANULACION` | "No se puede anular un movimiento de tipo ANULACION" |
| Ya tiene contra-movimiento | "ya fue anulado previamente" (idempotencia) |

### Caso especial: operación financiera

Si el movimiento tiene `operacionFinancieraId`, NO se bloquea ni se crea un contra-mov simple: delega en `anularOperacionFinancieraTx`, que anula la operación **completa** (ambos lados + saldo bancario si aplica), dentro de la misma transacción.

### Si pasa los bloqueos

Transacción atómica:
1. Cargar movimiento original.
2. Crear `CajaMayorMovimiento` nuevo:
   - `tipoMovimiento = ANULACION`
   - `referenciaAnulacion = original`
   - `observacion = "ANULACION: {motivo}"`
3. Tipo contrario para revertir saldo (si era INGRESO → AJUSTE_NEGATIVO; si era EGRESO → AJUSTE_POSITIVO).
4. `actualizarSaldoCajaMayor(qr, ..., tipoContrario)` revierte el saldo.

### UX en lista

`get-caja-mayor-movimientos` acepta `incluirAnulaciones` (default false):
- **Default**: oculta contra-movimientos. Filas originales anuladas se muestran con texto/monto **tachado** + chip rojo `🚫 ANULADO` (en columna observación) + tooltip con motivo, responsable, fecha.
- **Toggle ON**: muestra contra-movimientos con chip naranja `↩ ANULACION DE #X`.

## Caja Mayor Detalle (UI)

`src/app/pages/financiero/caja-mayor/caja-mayor-detalle/`. Layout 2 columnas:
- **Main (izq)**: tabla movimientos con search, filter por tipo, paginate, decoración de anulaciones.
- **Sidebar (der, 280px)**: cards compactos:
  - Por moneda × forma de pago: card de saldo.
  - Por cuenta bancaria visible: card con saldo + reservado + futuro.
  - Por moneda: card CPP `{esteMes, mesQueViene, total, vencidas}`.
  - Por moneda: card CPC análogo.
- Click en card cuenta bancaria → tab `MovimientosCuentaBancariaDialogComponent` (componente híbrido tab/dialog).
- Click en card CPP/CPC → tab lista filtrada.
- Header: botón refresh + "Configurar" (icono tune) → `configurar-caja-mayor-dialog` (qué FPs y cuentas mostrar).

Responsive: < 1100px colapsa a una columna.

## Gastos

`Gasto` + `GastoCategoria` + `GastoDetalle`:

```typescript
Gasto {
  gastoCategoria: GastoCategoria       // árbol jerárquico
  descripcion, monto: decimal(10,2)
  moneda?, formaPago?
  estado: GastoEstado                  // PENDIENTE | PAGADO | PROGRAMADO | CANCELADO
  esRecurrente, esFijo: boolean
  frecuencia?: GastoFrecuencia         // DIARIO | SEMANAL | QUINCENAL | MENSUAL | BIMESTRAL | TRIMESTRAL | SEMESTRAL | ANUAL
  proximoVencimiento?: date
  proveedor?: Proveedor
  numeroComprobante, tipoBoleta
  cajaMayor: CajaMayor                  // de qué caja se registró (siempre seteada)
  detalles: GastoDetalle[]              // multi-moneda/formaPago

  // Destino del egreso:
  destinoTipo: GastoDestinoTipo         // CAJA_MAYOR (default) | CUENTA_BANCARIA
  cuentaBancaria?, cuentaBancariaId?    // si destino = CUENTA_BANCARIA
  montoCuentaBancaria?: decimal(18,2)   // monto debitado en la moneda de la cuenta
  cotizacion?: decimal(18,6)            // si la moneda del gasto difiere de la cuenta
}

GastoDetalle {
  gasto (CASCADE)
  moneda, formaPago
  monto: decimal(10,2)
  observacion?
}
```

### Crear gasto (transacción atómica)

`create-gasto` (`caja-mayor.handler.ts`). Bifurca por `diferido` y luego por `destinoTipo`:

**Rama DIFERIDA (`diferido: true`, la que usa el desktop desde 2026-08):** el gasto
nace `PENDIENTE`, con `monedaId`/`monto` **directos** (no derivados de `detalles[]`),
y **no asienta nada**. Se paga después con el pago consolidado.

> El contrato **no cambió** para quien manda datos de pago: la app mobile llama a
> este mismo canal con `detalles[]` y forma de pago esperando asiento inmediato, y
> no tiene pantalla de pago diferido. Por eso la rama nueva es **opt-in**.

Con datos de pago (sin `diferido`), el estado queda en `PAGADO` y bifurca por `destinoTipo`:

**Rama CAJA_MAYOR (default):**
1. Crear Gasto (monto = suma de detalles).
2. Para cada `GastoDetalle`:
   a. Crear detalle.
   b. Crear `CajaMayorMovimiento` tipo EGRESO_GASTO con `gasto` apuntando.
   c. `actualizarSaldoCajaMayor(qr, ..., EGRESO_GASTO)`.
3. Commit. → Genera N movimientos si hay N detalles (multi-moneda en mismo gasto).

**Rama CUENTA_BANCARIA:** crea el Gasto con `cuentaBancaria` seteada y debita directo `cuentaBancaria.saldo -= monto`. **NO genera movimientos de Caja Mayor.**

> Nota: el payload también acepta un flag legacy `fuente === 'CUENTA_BANCARIA'` que, dentro de la rama CAJA_MAYOR, además debita la cuenta por el total (`montoCuentaBancaria`/`cotizacion`). El camino canónico es `destinoTipo`.

### Anular gasto

`anular-gasto`: por cada detalle, crear contra-mov AJUSTE_POSITIVO. Estado del Gasto → CANCELADO. (Para gastos con destino CUENTA_BANCARIA, la reversión es sobre el saldo de la cuenta.)

## Pago consolidado de obligaciones (2026-08)

**Todo pago de una obligación se hace desde Caja Mayor**, en un único wizard, y ya
no dentro del diálogo de alta de cada cosa. Un evento salda N obligaciones del
mismo concepto cobrando con M líneas de pago.

### Por qué existe

El asiento "si CAJA_MAYOR {mov + saldo} si no {debitar banco + mov bancario}"
estaba escrito **cinco** veces (`create-gasto`, `crear-vale-confirmado`,
`confirmar-vale`, `pagar-liquidacion-sueldo`, `aplicarPagoCpoCuota`), cada una con
su propia UI de "elegir fuente". Y no se podían pagar 3 gastos con un solo egreso:
eran 3 movimientos sueltos.

### Entidades

- **`PagoConsolidado`** (`pagos_consolidados`): cabecera — `concepto`
  (`COMPRA|GASTO|VALE|LIQUIDACION_SUELDO`), `descripcion` compuesta,
  `monedaDeuda`, `montoTotal`, `cantidadItems`, `estado` (`ACTIVO|ANULADO`).
- **`PagoConsolidadoDetalle`** (`pagos_consolidados_detalles`): **una fila por
  (obligación × línea de pago)** — producto cartesiano. Es lo que permite
  responder a la vez *cuánto recibió cada obligación* (`SUM(montoImputado)
  GROUP BY origenId`) y *de dónde salió cada guaraní* (`SUM(montoOrigen)` por
  línea). Guarda `cotizacion` y `montoImputado` del momento del pago, para que la
  anulación sea determinística.
- **`cajas_mayor_movimientos.pago_consolidado_id`**: ancla del movimiento al evento.
- Migración `AddPagoConsolidado` (aditiva; el `ADD COLUMN` usa `getTable`, no
  `IF NOT EXISTS`, que es inválido en SQLite).

### Reglas de negocio

| Regla | Por qué |
|---|---|
| **Un evento = un concepto** | El movimiento conserva el `TipoMovimiento` real (`EGRESO_GASTO`, `EGRESO_VALE`, `EGRESO_SALARIO`, `EGRESO_CUOTA_COMPRA`, `INGRESO_COBRO_CLIENTE`), así los reportes por tipo siguen cuadrando |
| **Una sola moneda de deuda** por evento | Para que "total a pagar/cobrar" sea un número |
| **Un solo beneficiario** en compras y en cobros | Un pago = un proveedor; un cobro = un cliente (`CONCEPTO_BENEFICIARIO_UNICO`) |
| **Sólo las cuotas admiten pago/cobro parcial** | Compras y cobro a cliente sí; un gasto/vale/liquidación va entero |
| **Una liquidación por vez** | Su neteo tiene que quedar atado a un evento propio |
| Fuentes: `CAJA_MAYOR`, `CUENTA_BANCARIA` y `DESCUENTO` | Cheque sigue por `emitir-cheque`. `DESCUENTO` sólo en el cobro a cliente |

### Los 5 conceptos y la dirección del dinero (2026-08)

`PagoConcepto` tiene 5 valores. Cuatro son **egresos**; `COBRO_CLIENTE` es el
único **ingreso**: sus obligaciones son cuotas de `CuentaPorCobrar` y su
movimiento es `INGRESO_COBRO_CLIENTE`.

En `pagos_consolidados`, "pago" significa **evento de liquidación de deuda**; la
dirección la da el concepto, no la tabla. El motor casi no necesitó cambios: el
asiento de caja ya derivaba el signo de `esIngreso(tipoMovimiento)` y la
anulación del lado caja también. Lo que estaba a fuego en dirección egreso era
**el tramo bancario**, que ahora acredita/debita según la dirección.

⚠️ **`CONCEPTO_ES_INGRESO` es un espejo de `esIngreso(adapter.tipoMovimiento)`.**
Existe aparte porque el renderer no puede importar `electron/caja-mayor-utils`.
Si se agrega un concepto, las dos tienen que coincidir —
`scripts/test-pago-consolidado.ts` lo verifica para los 5.

### Descuento (sólo en el cobro a cliente)

Una línea de `fuente: 'DESCUENTO'` **condona deuda sin mover plata**: cubre parte
del total para que la cuota quede saldada, pero no genera movimiento de caja ni
de banco. Sí genera fila de `PagoConsolidadoDetalle`, que es lo que permite
responder después "de esta cuota, cuánto entró y cuánto se perdonó".

- Va **siempre última en el reparto FIFO** (`ordenarLineasParaReparto`): el
  efectivo imputa primero y lo condonado cae sobre el remanente.
- Va en la **moneda de la deuda con cotización 1**: perdonar deuda en otra moneda
  no significa nada.
- En la cuenta corriente del cliente se registra como **`AJUSTE_NEGATIVO`**, no
  como `PAGO`: los dos bajan la deuda, pero el estado de cuenta tiene que poder
  decir cuánto pagó y cuánto se le perdonó.
- Controles: permiso **`CPC_DESCUENTO`** (no está en ningún rol plantilla — lo
  asigna el ADMIN), **motivo obligatorio**, **nunca el 100%** (para eso está
  `cancelar-cuenta-por-cobrar`), y **tope %** por caja
  (`CajaMayorConfiguracion.descuentoCpcMaxPorcentaje`, null = sin tope).
- **Redondeo del tope**: tanto el frontend (`descuento-dialog.component.ts`) como
  el backend (`pago-consolidado.handler.ts`) usan `redondear(totalDeuda * topePct / 100, decimalesMoneda)`
  de `shared/utils/pago-consolidado.util.ts`. El tope se valida sobre valores ya
  redondeados a la unidad mínima de la moneda (0 decimales para PYG, 2 para USD).
  No usar `Math.floor` ni dejar sin redondear: genera incoherencias frontend/backend
  (#272).

⚠️ El tope **no puede depender de un campo omitible**: `cajaMayorContextoId` es
obligatorio cuando hay descuento y tiene que existir, y el tope aplicado es el
**más restrictivo** entre el del contexto y el de cada caja por la que realmente
entra plata. Con un `if (cajaCtxId)` alcanzaba con no mandarlo para quedar sin
límite, y `/api/rpc` es default-allow.

### Handler y adaptadores

`electron/handlers/pago-consolidado.handler.ts` — 4 canales
(`get-obligaciones-pendientes`, `registrar-pago-consolidado`,
`get-pago-consolidado-detalle`, `anular-pago-consolidado`). **Permiso por
concepto**: `COMPRAS_GESTIONAR` / `CAJA_MAYOR_OPERAR` / `RRHH_VALE_CONFIRMAR` /
`RRHH_LIQUIDACION_PAGAR` / `CPC_COBRAR`, también en los `get-*` (el listado de
liquidaciones expone la nómina). El descuento suma `CPC_DESCUENTO` aparte.

`pago-consolidado-adapters.ts` — un adaptador por concepto con `listarPendientes`,
`leerYBloquear`, `aplicar`, `revertir` y `columnaReferencia`. **Ninguno toca
caja**: el asiento vive sólo en el handler.

Orden del `registrar`, todo en una transacción:
1. Releer cada obligación **con lock pesimista** (Postgres) y validar contra el
   saldo real — nunca contra el que mandó el cliente. El adaptador de cobro
   lockea en orden total **cuota → CPC → cliente**: `cpc.montoCobrado` y
   `cliente.saldoActual` son read-modify-write sobre agregados compartidos.
   `validarSeleccion` además rechaza la misma obligación **repetida** en `items`.
2. Validar el descuento (permiso, motivo, 100%, tope) — antes de las cotizaciones.
3. Resolver cotizaciones faltantes (bidireccional); si no hay, error.
4. Validar que las líneas cubran la deuda (tolerancia por moneda).
5. Crear la cabecera.
6. **Un asiento por grupo** `(fuente, caja|cuenta, moneda, formaPago)`. Las
   líneas `DESCUENTO` se excluyen: no hay movimiento que crear.
7. Reordenar las líneas (descuento último) y repartir FIFO → filas de detalle.
8. `aplicar` de cada adaptador con lo **realmente imputado**, y cuánto de eso
   fue descuento.

⚠️ El reordenamiento se hace **reasignando la variable**
(`lineas = ordenarLineasParaReparto(lineas)`) antes de repartir. `FilaReparto.lineaIdx`
es una posición dentro del array que recibió `repartirFifo`, y se usa después
para construir el detalle y el desglose por fuente: repartir sobre un array e
indexar sobre otro no rompe nada visible, **miente** sobre cuánto pagó el cliente
y cuánto se le perdonó. `grupos` está indexado por contenido (`claveGrupo`), así
que reordenar no lo afecta.

> Si el evento cubre **una sola** obligación, el movimiento además setea la
> columna de referencia clásica (`gasto`, `valeId`, `cuentaPorPagarCuotaId`,
> `liquidacionSueldoId`), porque `get-movimientos-caja-mayor-consolidados` filtra
> por proveedor vía `gasto.proveedor_id` y compone la observación rica con
> `m.gasto`.

### Aritmética: `shared/utils/pago-consolidado.util.ts`

TS puro (re-exportado en `electron/utils/`), lo comparten handler y componente.
`repartirFifo` garantiza **por construcción**, no por tolerancia:

1. lo imputado a cada obligación suma exactamente su monto;
2. lo que sale por cada línea suma exactamente lo que el usuario escribió.

El residuo entre "líneas convertidas" y "obligaciones" se absorbe **antes** de
repartir, ajustando la capacidad de la última línea. Sin eso, pagar 99,99 USD con
una línea de 250.000 Gs deja una obligación PARCIAL por un centavo. Trabaja en
unidades mínimas enteras. Tests: `npm run test:pago-consolidado` (90 asserts) y
`npm run test:cobro-cpc-consolidado` (63, E2E del concepto de ingreso).

### Anulación

`anular-pago-consolidado` revierte **el evento entero**: contra-movimiento
`AJUSTE_POSITIVO` por cada movimiento distinto (un `Set`: un movimiento cubre
varias filas), acredita las cuentas bancarias, y llama al `revertir` de cada
adaptador.

⚠️ **Bloqueos cruzados** — sin esto la misma plata vuelve dos veces:

| Handler | Bloqueo |
|---|---|
| `anular-caja-mayor-movimiento` | si el movimiento tiene `pagoConsolidadoId`. **El chequeo va ANTES** que las ramas por columna de referencia (con 1 item también las setea, y la rama del vale revierte directo en vez de bloquear) |
| `anular-vale` | primera sentencia. Un vale pagado por el evento tiene `movimientoId` en **null**: sin el bloqueo quedaría ANULADO sin devolver un guaraní |
| `anular-gasto` | ídem |
| `anular-liquidacion-sueldo` | ídem: su reversa de caja va por `liq.movimientoId`, que queda null |
| `anular-cobro-cpc-cuota` | ídem, con `PagoOrigenTipo.CPC_CUOTA` |

Los bloqueos **se liberan** al anular el evento.

### UI

- `pagar-obligaciones-dialog/` — wizard de 3 pasos (seleccionar / formas de pago /
  revisar), híbrido tab-dialog, parametrizado por `concepto`. Sirve **pagos y
  cobros**: las etiquetas salen de una tabla `ETIQUETAS` por dirección
  (`Monto a cobrar`, `Confirmar cobro`, …), no de ifs sueltos.
  El **descuento va en un botón propio** que abre el `descuento-dialog` del PdV
  (% o monto + motivo + resumen, extendido con tope): no es una opción del select
  *Fuente*, porque condonar deuda no es una fuente de fondos y ahí "Completar"
  se volvería un botón de perdonar todo de un clic. Cambiar la selección
  **descarta el descuento** con aviso: se calculó sobre un total que ya no existe.
  El permiso se precomputa suscribiéndose a `codigos$`, nunca se llama desde el
  template. En un cobro no corre `confirmarSaldosNegativos` (entra plata); sí
  corre al **anular** uno, desde el diálogo de detalle.
- `detalle-pago-consolidado-dialog/` — qué obligaciones cubrió y con qué líneas;
  desde ahí se anula. Se abre desde el menú ⋮ del movimiento.
- `registrar-egreso-dialog` — tarjetas nuevas **Pagar Gastos**, **Pagar Vales**,
  **Pagar Salarios**; **Pagar Compras** ahora abre el genérico.
- `registrar-ingreso-dialog` — la tarjeta **Cobrar a Cliente** abre el mismo
  wizard con `concepto = COBRO_CLIENTE`.
- `pagar-compras-dialog/` y `cobrar-cpc-rapido-dialog/` **fueron eliminados**.

Ninguno necesita hoja en `MENU_TREE`: son diálogos contextuales.

Tests: `npm run test:pago-consolidado` (aritmética) y
`npm run test:pago-consolidado-e2e` (42 asserts sobre SQLite: multi-moneda,
parcial, banco, bloqueos, anulación, cotización invertida).
Manual: `docs/testing/TESTING-CHECKLIST-PAGO-CONSOLIDADO.md`.

## Retiros de Caja

`RetiroCaja` + `RetiroCajaDetalle`:

```typescript
RetiroCaja {
  caja: Caja (PdV)
  cajaMayor?: CajaMayor                // null hasta ingresar
  estado: FLOTANTE | VINCULADO_PENDIENTE | INGRESADO
  fechaRetiro: datetime
  fechaIngreso?: datetime
  responsableRetiro: Usuario
  responsableIngreso?: Usuario
  detalles: RetiroCajaDetalle[]
}

RetiroCajaDetalle {
  retiroCaja (CASCADE)
  moneda, formaPago
  monto: decimal(10,2)
}
```

**Flujo**:
1. Cajero retira efectivo de caja PdV → `create-retiro-caja` (estado FLOTANTE).
2. Más tarde, responsable Caja Mayor → `ingresar-retiro-caja(retiroId, cajaMayorId)`:
   - Asigna `cajaMayor_id`.
   - Para cada detalle: crear `CajaMayorMovimiento` INGRESO_RETIRO_CAJA + `actualizarSaldo`.
   - Estado → INGRESADO.

## Entradas Varias

`EntradaVaria` + `EntradaVariaCategoria`:

```typescript
EntradaVaria {
  entradaVariaCategoria
  descripcion, monto: decimal(14,2)
  moneda, formaPago
  fecha: datetime
  cajaMayor?: CajaMayor                // destino A
  cuentaBancaria?: CuentaBancaria      // destino B
  numeroComprobante?, observacion?
  anulado: boolean
}
```

**Destino dual**:
- Si `cajaMayor` set → INGRESO_ENTRADA_VARIA en caja mayor.
- Si `cuentaBancaria` set → suma directa a `cuentaBancaria.saldo` (no toca caja mayor).

Nunca ambas a la vez.

## Operaciones Financieras

`OperacionFinanciera`:

```typescript
{
  tipoOperacion: TipoOperacionFinanciera     // CAMBIO_DIVISA | DEPOSITO_BANCARIO | RETIRO_BANCARIO | TRANSFERENCIA_ENTRE_CAJAS | TRANSFERENCIA_BANCARIA
  operacionFinancieraCategoria?
  // Origen
  cajaMayorOrigen?, monedaOrigen?, formaPagoOrigen?, montoOrigen?, cuentaBancariaOrigen?
  // Destino
  cajaMayorDestino?, monedaDestino?, formaPagoDestino?, montoDestino?, cuentaBancariaDestino?

  cotizacion?: decimal                       // CAMBIO_DIVISA
  numeroComprobante?, comprobanteUrl?        // DEPOSITO/RETIRO_BANCARIO
  diferencia: decimal default 0              // redondeo/comisión no registrada
  diferenciaDestinoTipo?: GASTO | VALE | IGNORAR
  diferenciaObservacion?
  anulado: boolean
}
```

### 5 tipos + flujos

| Tipo | Flujo |
|---|---|
| **CAMBIO_DIVISA** | Egreso de origen + Ingreso de destino (misma caja mayor, distintas monedas). Cotización aplicada. |
| **DEPOSITO_BANCARIO** | Egreso caja mayor (EGRESO_DEPOSITO_BANCO) + suma a `cuentaBancariaDestino.saldo`. |
| **RETIRO_BANCARIO** | Resta de `cuentaBancariaOrigen.saldo` + Ingreso caja mayor (INGRESO_RETIRO_BANCO). |
| **TRANSFERENCIA_ENTRE_CAJAS** | Egreso `cajaMayorOrigen` (TRANSFERENCIA_SALIDA) + Ingreso `cajaMayorDestino` (TRANSFERENCIA_ENTRADA). |
| **TRANSFERENCIA_BANCARIA** | Banco → banco. Resta `cuentaBancariaOrigen.saldo` (MovimientoBancario SALIDA_MANUAL) + suma `cuentaBancariaDestino.saldo` (ENTRADA_MANUAL). **NO toca Caja Mayor.** Puede ser entre monedas distintas (`montoDestino` = `montoOrigen` × cotización, resuelto en la UI). |

`diferenciaDestinoTipo`:
- GASTO → crea registro `Gasto`.
- VALE → crea `Vale` RRHH.
- IGNORAR → solo registra en observación.

> **TRANSFERENCIA_BANCARIA (transferencia interna banco→banco, 2026-07):** transferencia entre dos cuentas bancarias, opcionalmente de monedas distintas (con cotización). Reutiliza `OperacionFinanciera` (los campos `cuentaBancariaOrigen`/`Destino` + `cotizacion` ya existían). Solo mueve saldo bancario — no genera `CajaMayorMovimiento`, así que el **bloque de diferencia se omite** (no hay caja donde imputarla; guardado con `if (cajaMayorDiferenciaId && ...)`). Anulación: revierte AMBAS cuentas (AJUSTE_POSITIVO en origen, AJUSTE_NEGATIVO en destino). Guardas: origen ≠ destino, ambas cuentas deben existir. Permiso `CAJA_MAYOR_OPERAR` (reusa el handler `create-operacion-financiera`). ⚠️ **SQLite tenía un CHECK** en `tipo_operacion` que rechazaba valores nuevos: la migración `DropCheckTipoOperacionFinanciera` recrea la tabla soltando ese CHECK (Postgres ya era `varchar` libre). Tests: `npm run test:transferencia-bancaria` (flujo + saldos + anulación), `npm run test:operacion-financiera` (validador). En el diálogo la moneda de cada lado se hereda de su cuenta (no se pisan entre sí, a diferencia de depósito/retiro); la cotización solo aparece cuando las monedas difieren.

### Validación de campos por tipo (fuente única)

**Dos superficies, una sola regla:** el diálogo de escritorio
`create-operacion-financiera-dialog` y la pantalla PWA
`operacion-financiera-nuevo.page.ts` derivan TODO de
`operacion-financiera-validacion.util.ts` (re-exportado por `@frc/shared-core`
para el mobile). Estructuras:

| Constante | Responde |
|---|---|
| `CAMPOS_REQUERIDOS[tipo]` | qué controles llevan `Validators.required` |
| `LADOS_CAJA_MAYOR[tipo]` | **qué lado MUEVE caja mayor** ⇒ su forma de pago es EFECTIVO fija |
| `CAJAS_EN_UI[tipo]` | qué selects de caja mayor se muestran |
| `CUENTAS_EN_UI[tipo]` | qué selects de cuenta bancaria se muestran |
| `MONEDAS_EN_UI[tipo]` | qué monedas elige el usuario (el resto se heredan de la cuenta) |
| `COTIZACION_EN_UI[tipo]` | `SIEMPRE` / `SI_MONEDAS_DISTINTAS` / `NUNCA` |
| `fuenteDelCampo(tipo, campo)` | **el invariante**: `UI`, `CUENTA_BANCARIA`, `EFECTIVO` o `null` |
| `camposFaltantes()` / `validarCoherencia()` / `etiquetaDe()` | mensajes concretos al guardar |

⚠️ **`LADOS_CAJA_MAYOR` NO es `CAJAS_EN_UI`.** En `CAMBIO_DIVISA` los DOS lados
mueven caja mayor (egreso en una moneda + ingreso en otra) pero es la MISMA caja,
así que la UI muestra **un solo select** (el de origen). Confundirlos es el bug
de abajo.

**Invariante que hay que respetar siempre:** todo campo requerido debe tener una
fuente que lo pueble. Si `fuenteDelCampo()` devuelve `null` para un campo
requerido, el formulario queda inválido para siempre y el botón "Registrar" no se
habilita nunca — **sin ningún campo marcado en rojo**, porque el control ni se
renderiza para ese tipo. `npm run test:operacion-financiera` (122 asserts)
recorre el invariante campo por campo y tipo por tipo; falla si se rompe.

**Fixes históricos (no repetir):**
- **PR #199 (2026-07):** "Registrar" deshabilitado en Retiro/Depósito porque al
  elegir la cuenta bancaria se seteaba UNA sola moneda y la requerida del otro
  lado quedaba `null`. → `monedasDesdeCuentaBancaria()` setea **ambas**.
- **2026-08 (PWA):** `CAMBIO_DIVISA` era **imposible de guardar** en la PWA:
  `formaPagoDestinoId` es requerido (el handler lo usa para el movimiento de
  INGRESO y para `actualizarSaldo`; la columna es `nullable: false`) pero la
  pantalla lo seteaba sólo si había select de caja destino. → usar
  `LADOS_CAJA_MAYOR`, no la visibilidad del select.
- **2026-08 (ambas):** al cambiar de tipo se limpiaban las monedas pero sólo se
  re-derivaban desde `cuentaBancaria*Id.valueChanges`. Si el select de cuenta
  sobrevivía al cambio (RETIRO↔TRANSF. BANCARIA comparten cuenta origen;
  DEPOSITO↔TRANSF. BANCARIA comparten cuenta destino) la moneda quedaba `null` y
  era **irrecuperable**: reelegir la misma opción en un `mat-select` **no emite
  `valueChanges`** (Material sólo propaga si cambió la selección). → resincronizar
  las monedas heredadas después de cambiar de tipo.
- **2026-08 (escritorio):** `applyValidators()` cambiaba validadores pero nunca
  los VALORES, así que la cuenta bancaria de un depósito seguía en `form.value`
  al pasar a un cambio de divisa y el handler la persistía como relación bogus.
  → `limpiarCamposDelTipo()`.
- **2026-08 (PWA):** el bloque *Diferencia* se mostraba en `TRANSFERENCIA_BANCARIA`,
  donde el backend lo descarta en silencio (`cajaMayorDiferenciaId` es null porque
  no hay caja). → se oculta y se neutraliza al cambiar de tipo.

**Forma de pago de los tramos de caja:** siempre EFECTIVO. La regla vive en
`src/app/shared/utils/forma-pago-efectivo.util.ts` (fuente única desktop + PWA,
exportada por `@frc/shared-core`):

- `formasPagoDeCaja(formas)` — pool: activas que **mueven caja** (fallback: todas
  las activas si ninguna declara el flag).
- `formasPagoEfectivoDeCaja(formas)` — las **ofrecibles en un select**: del pool,
  las de nombre EFECTIVO. `movimentaCaja` solo no alcanza (deja pasar formas que
  no son efectivo) y el nombre solo tampoco (ignora `activo`). Nunca devuelve
  vacío si hay alguna usable.
- `formaPagoEfectivo(formas)` — la que se preselecciona / usa la PWA.

Si no hay ninguna, ambas superficies muestran un aviso en vez de dejar el
formulario muerto.

⚠️ **La regla se cumple en todas las pantallas, pero cinco la reimplementan a
mano.** `create-edit-gasto-dialog`, `create-edit-entrada-varia-dialog`,
`pagar-cuota-dialog` (CPP), `edit-movimiento-dialog` y `create-retiro-caja-dialog`
filtran con un `.filter(f => f.nombre.includes('EFECTIVO'))` inline en vez de
llamar al util. El select sale bien, pero **ignoran `activo` y `movimentaCaja`** y
pueden quedar vacíos sin avisar. Migrarlos a `formasPagoEfectivoDeCaja()` está en
el backlog. (`create-operacion-financiera-dialog` ya usa el util; los desaparecidos
`pagar-compras-dialog` y `confirmar-vale-dialog` se fueron con el pago
consolidado.)

Manual de pruebas: [`docs/testing/TESTING-CHECKLIST-OPERACIONES-FINANCIERAS.md`](../../../../docs/testing/TESTING-CHECKLIST-OPERACIONES-FINANCIERAS.md).

## Cuentas Por Pagar / Cobrar

→ Detalle separado: [financiero-cpp-cpc.md](financiero-cpp-cpc.md).

## Bancos / POS / Cheques

→ Detalle separado: [financiero-bancos-pos.md](financiero-bancos-pos.md).

## Páginas Angular

`src/app/pages/financiero/caja-mayor/`:
- `dashboard/` — KPIs.
- `list-cajas-mayor/` — listar abiertas/cerradas.
- `create-edit-caja-mayor/` — CRUD.
- `caja-mayor-detalle/` — vista operativa.
- `registrar-ingreso-dialog/` — hub de INGRESOS: retiro de caja, entrada varia, operación financiera, **cobrar a cliente** (abre el wizard consolidado) y ajuste de saldo.
- `registrar-egreso-dialog/` — hub de EGRESOS, en **grid** de tarjetas. Lanza: `CreateEditGastoDialogComponent` (alta diferida, gasto PENDIENTE), `CrearCompraSimplificadaDialogComponent` (sin pago), `CreateEditValeDialogComponent` (alta, vale SOLICITADO), `PagarObligacionesDialogComponent` (los 4 conceptos de pago; el 5º, el cobro, se abre desde el hub de ingresos), `EmitirChequeDialogComponent`, `CreateOperacionFinancieraDialogComponent`, `EgresoCajaInicialDialogComponent`, y el ajuste de saldo resuelto en el propio diálogo.
- `edit-movimiento-dialog/` — editar/anular movimiento.
- `configurar-caja-mayor-dialog/` — qué FPs y cuentas mostrar (M:M) + tope de descuento al cobrar CPC.
- `pagar-obligaciones-dialog/` — **wizard único de pago y cobro** (compras/gastos/vales/salarios/cobro a cliente).
- `detalle-pago-consolidado-dialog/` — desglose de un pago consolidado.
- `egreso-caja-inicial-dialog/` — sembrar efectivo a la apertura de una caja PdV (EGRESO_CAJA_INICIAL).
- `abrir-caja-desde-conteo-dialog/` — abrir caja reutilizando el conteo del egreso inicial.
- Sub-carpetas: `gastos/`, `entradas-varias/`, `retiros/`, `operaciones-financieras/`, `bancos/`, `cheques/`, `pos/`, `cuentas-por-pagar/`, `cuentas-por-cobrar/`.

## Handler

`electron/handlers/caja-mayor.handler.ts` (~2870 líneas, ~130 KB) — el más grande del proyecto. **53 canales.** Cubre (orden aproximado):
- CRUD CajaMayor (`get-cajas-mayor`, `get-caja-mayor`, `create/update-caja-mayor` → `FINANCIERO_CAJA_GESTIONAR`, `cerrar-caja-mayor`)
- Saldos (`get-caja-mayor-saldos`, `recalcular-saldos`)
- Movimientos: `get-caja-mayor-movimientos` (con `incluirAnulaciones`) — pero la pantalla `caja-mayor-detalle` consume `get-movimientos-caja-mayor-consolidados` (el que compone la observación legible); `create-caja-mayor-movimiento`, `anular-caja-mayor-movimiento` (bloqueos), `edit-caja-mayor-movimiento` (todos `CAJA_MAYOR_OPERAR`)
- Gastos + GastoCategoria (`create-gasto`, `anular-gasto`, `edit-gasto`, `get-gastos`, `get-gasto`, `get-gastos-programados`, y categorías `get-gasto-categoria(s)`, `create/update/delete-gasto-categoria`)
- Retiros (`create-retiro-caja`, `ingresar-retiro-caja`, `generar-retiro-cierre-caja`, `get-retiros-caja`, `get-retiro-caja`)
- Caja inicial / apertura (`egreso-caja-inicial`, `abrir-caja-desde-conteo` → `FINANCIERO_CAJA_GESTIONAR`)
- Entradas Varias + categorías (`create-entrada-varia`, `anular-entrada-varia`, `get-entradas-varias`, `get-entrada-varia`, y `get/create/update/delete-entrada-varia-categoria`)
- Operaciones Financieras + categorías (`create-operacion-financiera`, `anular-operacion-financiera`, `get-operaciones-financieras`, `get-operacion-financiera`, y `get/create/update/delete-operacion-financiera-categoria`)
- Configuración (`get-caja-mayor-configuracion`, `save-caja-mayor-configuracion`) — **sin `ensurePermission`** (get/save de config no exigen permiso)
- Resúmenes CPP/CPC y bancarios (`get-caja-mayor-cpp-resumen`, `get-caja-mayor-cpc-resumen`, `get-cuenta-bancaria-resumen` singular, `get-cuentas-bancarias-resumenes` batch)

> Los canales de **lectura** (`get-*`) de caja mayor en general **NO** verifican permiso; el gate está en los canales de escritura.

`electron/handlers/caja-mayor-utils.ts` (~51 líneas):
- `esIngreso(tipo): boolean`
- `actualizarSaldoCajaMayor(qr, cajaMayorId, monedaId, formaPagoId, monto, tipo): Promise<void>`

### Handlers relacionados (fuera de `caja-mayor.handler.ts`)

- **`dashboard-caja-mayor.handler.ts`** — `get-dashboard-caja-mayor-kpis` (consumido por `dashboard/caja-mayor-dashboard.component.ts`). El dashboard también usa `dashboard-shortcuts.handler.ts` (`get/create/update/delete-dashboard-shortcut`) para accesos directos.
- **`gastos-caja.handler.ts`** — `create-gasto-caja`, `get-gastos-caja`, `anular-gasto-caja` (permisos `VENTAS_PDV` / `FINANCIERO_CAJA_VER`). ⚠️ **Distinto de los gastos de caja mayor**: opera sobre el efectivo de una **caja PdV**, NO sobre la caja mayor. No confundir con `create-gasto`.
- **`banking.handler.ts`** (29 canales, permiso `BANCOS_GESTIONAR`), **`cuentas-por-pagar.handler.ts`** (17, `COMPRAS_GESTIONAR`), **`cuentas-por-cobrar.handler.ts`** (11, `CPC_GESTIONAR`/`CPC_COBRAR`/`CPC_CANCELAR`) — bancos/cheques/POS y CPP/CPC. Se consumen desde el detalle de caja mayor y sus sub-carpetas.

**Permisos del dominio (9 códigos):** `FINANCIERO_CAJA_GESTIONAR`, `CAJA_MAYOR_OPERAR`, `BANCOS_GESTIONAR`, `COMPRAS_GESTIONAR`, `CPC_GESTIONAR`, `CPC_COBRAR`, `CPC_CANCELAR`, `VENTAS_PDV`, `FINANCIERO_CAJA_VER`.

→ Banking en handler aparte: [financiero-bancos-pos.md](financiero-bancos-pos.md).
