# Dominio: Bancos, Cheques, POS

## Cuenta Bancaria

`CuentaBancaria`:

```typescript
{
  nombre, banco, numeroCuenta
  tipoCuenta: TipoCuentaBancaria        // CORRIENTE | AHORRO
  moneda: Moneda
  saldo: decimal(14,2)                  // disponible
  saldoReservado: decimal(14,2)         // comprometido (cheques emitidos)
  titular?, alias?
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
- Cheque cobrado: suma a `cuentaBancaria.saldo` (banking.handler.ts:931+).
- AcreditacionPos auto-procesada: suma `montoEsperado` a `cuentaBancaria.saldo`.

⚠️ **No usa `actualizarSaldoCajaMayor()`** — es directo al campo. Auditar manualmente si hay descuadres.

`saldoReservado`: incrementa al emitir cheque diferido (banking.handler:~890), decrementa al cobrar/anular.

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
  esDiferido: boolean           // postfechado
  cajaMayor?: CajaMayor
  formaPago?: FormasPago
}
```

### Emitir cheque (banking.handler.ts:841)

Transacción atómica:
1. Validar chequera ACTIVA + numero válido.
2. Crear Cheque (estado=EMITIDO o DIFERIDO según fechaPago).
3. Si NO diferido: crear `CajaMayorMovimiento` EGRESO_CHEQUE + `actualizarSaldoCajaMayor`.
4. Si DIFERIDO: incrementar `cuentaBancaria.saldoReservado += monto`. Caja Mayor no se afecta hasta el cobro.
5. Avanzar `chequera.siguienteNumero`.

### Cobrar cheque (banking.handler.ts:931)

1. Cheque.estado → COBRADO.
2. Cheque.fechaCobro = now.
3. Restar de `cuentaBancaria.saldo`.
4. Si era DIFERIDO: restar de `saldoReservado` (lo libera, ya descontado del saldo real).

### Anular cheque (banking.handler.ts:993)

1. Cheque.estado → ANULADO.
2. Si EMITIDO: contra-mov AJUSTE_POSITIVO en caja mayor.
3. Si DIFERIDO: liberar `saldoReservado`.

## Máquinas POS

`MaquinaPos`:

```typescript
{
  nombre, proveedor?
  cuentaBancaria: CuentaBancaria       // donde se acreditan ventas
  porcentajeComision: decimal(5,2)     // 2.50%
  minutosAcreditacion: int             // 1440 (24h), 4320 (3 días), etc.
}
```

## AcreditacionPos

Cada venta con tarjeta crea una AcreditacionPos PENDIENTE. Tras `minutosAcreditacion` se acredita automáticamente.

```typescript
{
  maquinaPos
  cuentaBancaria
  montoOriginal: decimal               // venta bruta
  montoComision: decimal               // descuento operador
  montoEsperado = montoOriginal - montoComision
  montoAcreditado?: decimal            // lo que realmente llegó
  fechaTransaccion
  fechaEsperadaAcreditacion            // = fechaTransaccion + minutosAcreditacion
  fechaAcreditacionReal?
  estado: AcreditacionPosEstado        // PENDIENTE | ACREDITADO_AUTO | VERIFICADO | CON_DIFERENCIA
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

`verificar-acreditacion-pos`: usuario compara con extracto bancario. Si difiere:
- Actualizar `montoAcreditado` real.
- Estado → VERIFICADO o CON_DIFERENCIA.

## Configuración por Caja Mayor: cuentas visibles

`CajaMayorConfiguracion.cuentasBancariasVisibles` (M:M) define qué cuentas aparecen como cards en `caja-mayor-detalle`.

Click en card de cuenta bancaria → abre `MovimientosCuentaBancariaDialogComponent` como **TAB** (componente híbrido). ID estable `cb-mov-{id}` evita duplicados.

## Páginas

`src/app/pages/financiero/caja-mayor/`:

- `bancos/`: list-cuentas-bancarias, create-edit-cuenta-bancaria, list-movimientos.
- `cheques/`: list-chequeras, create-chequera, list-cheques, emitir-cheque, cobrar-cheque, anular-cheque.
- `pos/`: list-maquinas-pos, create-edit-maquina-pos, list-acreditaciones-pos, verificar-acreditacion-dialog.

## Handler banking.handler.ts (1032 líneas)

Cubre:
- CuentaBancaria CRUD (105-186)
- MaquinaPos CRUD (187-265)
- AcreditacionPos (266-461): get, create, procesar-auto, verificar, acreditar-transferencia
- MovimientoBancario (463-686)
- Acreditaciones pendientes (687-705)
- Chequera CRUD (706-787)
- Cheque (788-1032): get, emitir, cobrar, anular
