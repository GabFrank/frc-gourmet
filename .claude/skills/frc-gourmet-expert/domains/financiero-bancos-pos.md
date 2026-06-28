# Dominio: Bancos, Cheques, POS

## Cuenta Bancaria

`CuentaBancaria`:

```typescript
{
  nombre, banco, numeroCuenta
  tipoCuenta: TipoCuentaBancaria        // CORRIENTE | AHORRO
  moneda: Moneda
  saldo: decimal(14,2)                  // disponible
  saldoReservado: decimal(14,2)         // comprometido (cheques diferidos emitidos)
  titular?, alias?
  activo: boolean (default true)
}
```

**Tres saldos visibles** en UI:
- `saldo`: actual disponible.
- `saldoReservado`: dinero comprometido (cheques diferidos emitidos pero no cobrados).
- `saldoFuturo`: `SUM(montoEsperado)` de `AcreditacionPos` con estado PENDIENTE para esa cuenta. Calculado on-the-fly por handler `get-cuenta-bancaria-resumen`.

**Actualización del saldo**:
- `EntradaVaria` destino banco: suma directa a `cuentaBancaria.saldo`.
- `OperacionFinanciera DEPOSITO_BANCARIO`: suma a destino.
- `OperacionFinanciera RETIRO_BANCARIO`: resta de origen.
- Cheque cobrado: resta de `cuentaBancaria.saldo` (handler `cobrar-cheque` en banking.handler.ts).
- AcreditacionPos auto-procesada: suma `montoEsperado` a `cuentaBancaria.saldo`.
- `acreditar-transferencia-bancaria`: suma instantánea al saldo (cobro con transferencia/PIX; sin comisión, no crea AcreditacionPos).

⚠️ **No usa `actualizarSaldoCajaMayor()`** — es directo al campo. Auditar manualmente si hay descuadres.

`saldoReservado`: incrementa al emitir cheque diferido (handler `emitir-cheque`), decrementa al cobrar o anular ese cheque diferido (con piso en 0).

## MovimientoBancario

Anotación manual de movimientos en cuenta bancaria (separado de Caja Mayor):

```typescript
{
  cuentaBancaria
  tipoMovimiento: ENTRADA_MANUAL | SALIDA_MANUAL | AJUSTE_POSITIVO | AJUSTE_NEGATIVO
  monto, fecha, numeroComprobante
  anulado: boolean
}
```

No se vincula a CajaMayorMovimiento → reconciliación manual con extracto bancario.

## Chequeras

`Chequera`:

```typescript
{
  cuentaBancaria
  numeroInicial, numeroFinal, siguienteNumero
  estado: ChequeraEstado     // ACTIVA | AGOTADA | ANULADA
}
```

Validación al emitir cheque: `siguienteNumero ≤ numeroFinal`. Si no, `estado=AGOTADA`.

## Cheques

`Cheque`:

```typescript
{
  chequera
  cuentaBancaria
  numeroCheque                 // de la chequera
  monto, moneda, beneficiario
  proveedor?: Proveedor
  fechaEmision: datetime
  fechaPago?: datetime         // si es diferido
  fechaCobro?: datetime
  estado: ChequeEstado          // EMITIDO | DIFERIDO | COBRADO | ANULADO
  esDiferido: boolean           // define el flujo (postfechado), NO se infiere de fechaPago
  cajaMayor?: CajaMayor
  formaPago?: FormasPago
  observacion?, motivoAnulacion?
}
```

> Estado de cheque se decide por el flag `esDiferido` del payload (NO por comparar `fechaPago`). Permiso requerido en los 3 handlers: `BANCOS_GESTIONAR`.

### Emitir cheque (`emitir-cheque`)

Transacción atómica:
1. Validar chequera ACTIVA.
2. Crear Cheque.
3. **Si NO diferido** (estado inicial EMITIDO): restar `cuentaBancaria.saldo -= monto`; si vienen `cajaMayorId`+`monedaId`+`formaPagoId`, crear `CajaMayorMovimiento` EGRESO_CHEQUE + `actualizarSaldoCajaMayor`; luego marcar el cheque como **COBRADO** con `fechaCobro = now` (el cheque a la vista se considera cobrado al emitirse).
4. **Si DIFERIDO**: incrementar `cuentaBancaria.saldoReservado += monto`. No toca `saldo` ni Caja Mayor hasta el cobro.
5. Avanzar `chequera.siguienteNumero` (si supera `numeroFinal`, chequera → AGOTADA).

### Cobrar cheque (`cobrar-cheque`) — para diferidos

1. Validar que no esté ya COBRADO/ANULADO.
2. Si era DIFERIDO: liberar `saldoReservado -= monto` (con piso en 0).
3. Restar `cuentaBancaria.saldo -= monto`.
4. Si el cheque tiene `cajaMayor`+`moneda`+`formaPago`: crear `CajaMayorMovimiento` EGRESO_CHEQUE + `actualizarSaldoCajaMayor`.
5. Cheque.estado → COBRADO, `fechaCobro = now`.

### Anular cheque (`anular-cheque`)

1. Bloquea si el cheque ya está COBRADO o ANULADO.
2. Si era DIFERIDO: liberar `saldoReservado -= monto` (piso en 0).
3. Cheque.estado → ANULADO, guarda `motivoAnulacion`.
   - **No** genera contra-movimiento en Caja Mayor (un cheque a la vista ya queda COBRADO al emitirse, así que no es anulable por esta vía).

## Máquinas POS

`MaquinaPos`:

```typescript
{
  nombre
  proveedor?: string                   // nombre del operador (texto libre)
  cuentaBancaria: CuentaBancaria       // donde se acreditan ventas
  porcentajeComision: decimal(5,2)     // 2.50%
  minutosAcreditacion: int             // 1440 (24h), 4320 (3 días), etc.
  activo: boolean (default true)
}
```

## AcreditacionPos

Cobro de venta con máquina POS → se crea una AcreditacionPos PENDIENTE. Tras `minutosAcreditacion` se acredita automáticamente.

> El disparo ocurre en `cobrar-venta-dialog.component.ts` (handler `create-acreditacion-pos` vía `RepositoryService.createAcreditacionPos`), una por cada detalle de pago que use una máquina POS. La llamada es **no-blocking** (si falla, loguea y no aborta el cobro). NO está cableado dentro de `ventas.handler.ts`.

```typescript
{
  maquinaPos
  cuentaBancaria
  montoOriginal: decimal               // venta bruta
  montoComision: decimal(14,2)         // descuento operador (default 0)
  montoEsperado: decimal(14,2)         // almacenado; al crear = montoOriginal - montoComision
  montoAcreditado?: decimal            // lo que realmente llegó
  fechaTransaccion
  fechaEsperadaAcreditacion            // = fechaTransaccion + minutosAcreditacion
  fechaAcreditacionReal?
  estado: AcreditacionPosEstado        // PENDIENTE | ACREDITADO_AUTO | VERIFICADO | CON_DIFERENCIA
  diferencia?: decimal                 // montoAcreditado - montoEsperado (al verificar)
  verificadoPor?: Usuario, fechaVerificacion?
  ventaId?: int                        // sin FK constraint
}
```

### Scheduler automático

`startAcreditacionesScheduler(dataSource, 5)` corre en main process **cada 5 minutos**:

```typescript
async procesarAcreditacionesPendientes() {
  // SELECT * FROM acreditaciones_pos WHERE estado='PENDIENTE' AND fechaEsperadaAcreditacion <= NOW()
  for (const acred of pendientes) {
    cuentaBancaria.saldo += acred.montoEsperado;
    acred.montoAcreditado = acred.montoEsperado;  // asume sin diferencia
    acred.fechaAcreditacionReal = now;
    acred.estado = ACREDITADO_AUTO;
    save();
  }
}
```

### Verificación manual

`verificar-acreditacion-pos(id, montoAcreditado)` (permiso `BANCOS_GESTIONAR`): usuario compara con el extracto bancario. Transacción:
- `diferencia = montoAcreditado - montoEsperado`.
- Ajuste de saldo:
  - Si ya estaba ACREDITADO_AUTO (ya se sumó `montoEsperado`): ajusta `saldo += diferencia`.
  - Si aún PENDIENTE: suma `saldo += montoAcreditado` (el monto real).
- Guarda `montoAcreditado`, `diferencia`, `verificadoPor`, `fechaVerificacion`.
- Estado → VERIFICADO si `diferencia === 0`, sino CON_DIFERENCIA.

## Configuración por Caja Mayor: cuentas visibles

`CajaMayorConfiguracion.cuentasBancariasVisibles` (M:M) define qué cuentas aparecen como cards en `caja-mayor-detalle`.

Click en card de cuenta bancaria → abre `MovimientosCuentaBancariaDialogComponent` como **TAB** (componente híbrido). ID estable `cb-mov-{id}` evita duplicados.

## Páginas

`src/app/pages/financiero/caja-mayor/`:

- `bancos/`: `list-cuentas-bancarias`, `create-edit-cuenta-bancaria`, `crear-movimiento-bancario-dialog`, `movimientos-cuenta-bancaria-dialog` (tab/dialog híbrido).
- `cheques/`: `list-chequeras`, `create-edit-chequera`, `list-cheques`, `emitir-cheque`. (Cobrar/anular se disparan desde la lista de cheques vía sus handlers, sin componentes dialog dedicados.)
- `pos/`: `list-maquinas-pos`, `create-edit-maquina-pos`, y `acreditaciones/` con `list-acreditaciones-pos` + `verificar-acreditacion-dialog`.

## Handler banking.handler.ts (~916 líneas)

Cubre (handlers, sin números de línea fijos):
- CuentaBancaria CRUD (`get/create/update/delete-cuenta-bancaria`)
- MaquinaPos CRUD (`get/create/update/delete-maquina-pos`)
- AcreditacionPos: `get-acreditaciones-pos`, `get-acreditacion-pos`, `create-acreditacion-pos`, `procesar-acreditaciones-auto`, `verificar-acreditacion-pos`, `acreditar-transferencia-bancaria`, `get-acreditaciones-pendientes`
- MovimientoBancario: `get-movimientos-cuenta-bancaria`, `create-movimiento-bancario`
- Chequera CRUD (`get/create/update/delete-chequera`)
- Cheque: `get-cheques`, `get-cheque`, `emitir-cheque`, `cobrar-cheque`, `anular-cheque`

Además exporta (fuera de `ipcMain.handle`) `procesarAcreditacionesPendientes(dataSource)` y `startAcreditacionesScheduler(dataSource, 5)`, usados por el scheduler del main process.
