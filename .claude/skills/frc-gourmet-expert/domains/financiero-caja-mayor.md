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
| **Un pago = un concepto** | El movimiento conserva el `TipoMovimiento` real (`EGRESO_GASTO`, `EGRESO_VALE`, `EGRESO_SALARIO`, `EGRESO_CUOTA_COMPRA`), así los reportes por tipo siguen cuadrando |
| **Una sola moneda de deuda** por evento | Para que "total a pagar" sea un número |
| **Un solo proveedor** en compras | Igual que la referencia de frc-comercial |
| **Sólo compras admite pago parcial** | Un gasto/vale/liquidación se paga entero |
| **Una liquidación por vez** | Su neteo tiene que quedar atado a un evento propio |
| Fuentes: `CAJA_MAYOR` y `CUENTA_BANCARIA` | Cheque sigue por `emitir-cheque` |

### Handler y adaptadores

`electron/handlers/pago-consolidado.handler.ts` — 4 canales
(`get-obligaciones-pendientes`, `registrar-pago-consolidado`,
`get-pago-consolidado-detalle`, `anular-pago-consolidado`). **Permiso por
concepto**: `COMPRAS_GESTIONAR` / `CAJA_MAYOR_OPERAR` / `RRHH_VALE_CONFIRMAR` /
`RRHH_LIQUIDACION_PAGAR`, también en los `get-*` (el listado de liquidaciones
expone la nómina).

`pago-consolidado-adapters.ts` — un adaptador por concepto con `listarPendientes`,
`leerYBloquear`, `aplicar`, `revertir` y `columnaReferencia`. **Ninguno toca
caja**: el asiento vive sólo en el handler.

Orden del `registrar`, todo en una transacción:
1. Releer cada obligación **con lock pesimista** (Postgres) y validar contra el
   saldo real — nunca contra el que mandó el cliente.
2. Resolver cotizaciones faltantes (bidireccional); si no hay, error.
3. Validar que las líneas cubran la deuda (tolerancia por moneda).
4. Crear la cabecera.
5. **Un asiento por grupo** `(fuente, caja|cuenta, moneda, formaPago)`.
6. Reparto FIFO → filas de detalle.
7. `aplicar` de cada adaptador con lo **realmente imputado**.

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
unidades mínimas enteras. Test: `npm run test:pago-consolidado` (64 asserts).

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

Los bloqueos **se liberan** al anular el evento.

### UI

- `pagar-obligaciones-dialog/` — wizard de 3 pasos (seleccionar / formas de pago /
  revisar), híbrido tab-dialog, parametrizado por `concepto`.
- `detalle-pago-consolidado-dialog/` — qué obligaciones cubrió y con qué líneas;
  desde ahí se anula. Se abre desde el menú ⋮ del movimiento.
- `registrar-egreso-dialog` — tarjetas nuevas **Pagar Gastos**, **Pagar Vales**,
  **Pagar Salarios**; **Pagar Compras** ahora abre el genérico.
- `pagar-compras-dialog/` **fue eliminado**.

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

**Diálogo `create-operacion-financiera-dialog` (form único con validators por tipo).** En DEPOSITO/RETIRO la moneda **se hereda de la cuenta bancaria** (no se elige en la UI). Reglas de campos requeridos por tipo en `operacion-financiera-validacion.util.ts` (fuente única para validador + test). **Fix 2026-07 (PR #199):** el botón "Registrar" quedaba deshabilitado en Retiro/Depósito porque solo se seteaba UNA de las dos monedas (la requerida del otro lado quedaba `null`). Ahora al elegir la cuenta bancaria se setean **ambas** monedas (origen y destino) — misma divisa a los dos lados en efectivo. Test: `npm run test:operacion-financiera`.

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
- `registrar-ingreso-dialog/` — entrada varia o retiro caja.
- `registrar-egreso-dialog/` — hub de EGRESOS (10 tarjetas desde 2026-08). Lanza sub-diálogos: `CreateEditGastoDialogComponent` (gasto), `CreateEditValeDialogComponent` (card "Registrar Vale" → handler atómico `crear-vale-confirmado` en `vales.handler.ts`), `CrearCompraSimplificadaDialogComponent` (compra simplificada), `PagarComprasDialogComponent` (pago multi-cuota CPP), `EmitirChequeDialogComponent` (emitir cheque), `CreateOperacionFinancieraDialogComponent`. Además crea mov directo (`create-caja-mayor-movimiento`) / movimiento bancario.
- `edit-movimiento-dialog/` — editar/anular movimiento.
- `configurar-caja-mayor-dialog/` — qué FPs y cuentas mostrar (M:M).
- `pagar-obligaciones-dialog/` — **wizard único de pago** (compras/gastos/vales/salarios).
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
