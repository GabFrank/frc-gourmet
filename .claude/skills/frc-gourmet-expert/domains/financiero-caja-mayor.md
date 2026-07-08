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
  mostrarCuentasPorPagar: boolean (default false)
  mostrarCuentasPorCobrar: boolean (default false)
}
```

**Default tolerante**: si no existe config para una caja, mostrar TODAS las FPs y NINGUNA cuenta bancaria.

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

`create-gasto` (`caja-mayor.handler.ts`). El estado del gasto queda en `PAGADO`. Bifurca por `destinoTipo`:

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
  tipoOperacion: TipoOperacionFinanciera     // CAMBIO_DIVISA | DEPOSITO_BANCARIO | RETIRO_BANCARIO | TRANSFERENCIA_ENTRE_CAJAS
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

### 4 tipos + flujos

| Tipo | Flujo |
|---|---|
| **CAMBIO_DIVISA** | Egreso de origen + Ingreso de destino (misma caja mayor, distintas monedas). Cotización aplicada. |
| **DEPOSITO_BANCARIO** | Egreso caja mayor (EGRESO_DEPOSITO_BANCO) + suma a `cuentaBancariaDestino.saldo`. |
| **RETIRO_BANCARIO** | Resta de `cuentaBancariaOrigen.saldo` + Ingreso caja mayor (INGRESO_RETIRO_BANCO). |
| **TRANSFERENCIA_ENTRE_CAJAS** | Egreso `cajaMayorOrigen` (TRANSFERENCIA_SALIDA) + Ingreso `cajaMayorDestino` (TRANSFERENCIA_ENTRADA). |

`diferenciaDestinoTipo`:
- GASTO → crea registro `Gasto`.
- VALE → crea `Vale` RRHH.
- IGNORAR → solo registra en observación.

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
- `registrar-egreso-dialog/` — gasto, compra, vale (card "Registrar Vale" → handler atómico `crear-vale-confirmado` en `vales.handler.ts`), etc.
- `edit-movimiento-dialog/` — editar/anular movimiento.
- `configurar-caja-mayor-dialog/` — qué FPs y cuentas mostrar (M:M).
- `pagar-compras-dialog/` — pago multi-cuota CPP.
- `egreso-caja-inicial-dialog/` — sembrar efectivo a la apertura de una caja PdV (EGRESO_CAJA_INICIAL).
- `abrir-caja-desde-conteo-dialog/` — abrir caja reutilizando el conteo del egreso inicial.
- Sub-carpetas: `gastos/`, `entradas-varias/`, `retiros/`, `operaciones-financieras/`, `bancos/`, `cheques/`, `pos/`, `cuentas-por-pagar/`, `cuentas-por-cobrar/`.

## Handler

`electron/handlers/caja-mayor.handler.ts` (~2530 líneas) — el más grande del proyecto. Cubre (orden aproximado):
- CRUD CajaMayor (`get-cajas-mayor`, `get-caja-mayor`, `create/update-caja-mayor`, `cerrar-caja-mayor`)
- Saldos (`get-caja-mayor-saldos`, `recalcular-saldos`)
- Movimientos: `get-caja-mayor-movimientos` (con `incluirAnulaciones`), `get-movimientos-caja-mayor-consolidados`, `create-caja-mayor-movimiento`, `anular-caja-mayor-movimiento` (bloqueos), `edit-caja-mayor-movimiento`
- Gastos + GastoCategoria (`create-gasto`, `anular-gasto`, `edit-gasto`, `get-gastos`, `get-gastos-programados`)
- Retiros (`create-retiro-caja`, `ingresar-retiro-caja`, `generar-retiro-cierre-caja`)
- Caja inicial / apertura (`egreso-caja-inicial`, `abrir-caja-desde-conteo`)
- Entradas Varias + categorías (`create-entrada-varia`, `anular-entrada-varia`)
- Operaciones Financieras + categorías (`create-operacion-financiera`, `anular-operacion-financiera`)
- Configuración (`get-caja-mayor-configuracion`, set config)
- Resúmenes CPP/CPC y bancarios (`get-caja-mayor-cpp-resumen`, `get-caja-mayor-cpc-resumen`, `get-cuenta-bancaria-resumen`, `get-cuentas-bancarias-resumenes`)

`electron/handlers/caja-mayor-utils.ts` (~51 líneas):
- `esIngreso(tipo): boolean`
- `actualizarSaldoCajaMayor(qr, cajaMayorId, monedaId, formaPagoId, monto, tipo): Promise<void>`

→ Banking en handler aparte: [financiero-bancos-pos.md](financiero-bancos-pos.md).
