# Dominio: CPP / CPC y Movimientos de Cliente

Cuentas por Pagar (deudas del negocio) y Cuentas por Cobrar (créditos otorgados).

## Cuentas por Pagar (CPP)

### Tipos

```typescript
enum CuentaPorPagarTipo {
  COMPRA              // generada al finalizar Compra
  PRESTAMO            // préstamo bancario / a 3eros (deuda contra negocio)
  PRESTAMO_FUNCIONARIO // préstamo a empleado (deuda A FAVOR del negocio — invertida)
  OTRO
}
```

**⚠️ DIRECCIÓN INVERTIDA en PRESTAMO_FUNCIONARIO**: el negocio prestó dinero al empleado, así que es ingreso esperado para el negocio. Por eso usa enums INGRESO específicos:
- `EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO` al crear (negocio entrega plata).
- `INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO` al cobrar cuota directa (suma saldo).
- Cuotas via liquidación de sueldo: descuento implícito (no movimiento aparte).

### CuentaPorPagar

```typescript
{
  descripcion: string                  // "COMPRA #X — Proveedor"
  tipo: CuentaPorPagarTipo
  proveedor?: Proveedor                // si COMPRA
  funcionario?: Funcionario             // si PRESTAMO_FUNCIONARIO
  montoTotal, montoPagado: decimal(14,2)
  moneda: Moneda
  fechaInicio: date
  cantidadCuotas: int
  estado: CuentaPorPagarEstado          // ACTIVO | PAGADO | CANCELADO
  observacion?: text
  compra_id?: int                       // columna plana, sin FK ORM
  cuotas: CuentaPorPagarCuota[]
}
```

### CuentaPorPagarCuota

```typescript
{
  numero: int                           // 1..N
  fechaVencimiento: date
  monto, montoPagado: decimal(14,2)
  estado: CuotaEstado                   // PENDIENTE | PARCIAL | PAGADA | VENCIDA | CANCELADA
  fechaPago?: datetime
  observacion?
  cuentaPorPagar (CASCADE delete)
}
```

### Pago de cuota

Canal IPC `pagar-cpp-cuota` (cuentas-por-pagar.handler.ts:618), wrapper sobre el helper `aplicarPagoCpoCuota` (línea 88-193):

Flujo unificado, **bifurca por tipo y fuente**:

```
1. Validar cuota: existe, no PAGADA/CANCELADA, monto > 0, monto ≤ saldoPendiente
2. Cuota.montoPagado += monto
3. Calcular nuevo estado:
   - monto = saldoPendiente → PAGADA, fechaPago = now
   - monto < saldoPendiente → PARCIAL
4. CPP.montoPagado += monto. Si todas cuotas PAGADA → cpp.estado = PAGADO

5. SI fuente = CAJA_MAYOR:
   tipoMov = (cpp.tipo === COMPRA)        ? EGRESO_CUOTA_COMPRA
           : (cpp.tipo === PRESTAMO)      ? EGRESO_CUOTA_PRESTAMO
           : (cpp.tipo === PRESTAMO_FUNCIONARIO) ? INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO
           : EGRESO_OTRO
   - Crear CajaMayorMovimiento + cuentaPorPagarCuotaId
   - actualizarSaldoCajaMayor(qr, ..., tipoMov)

6. SI fuente = CUENTA_BANCARIA:
   - Restar de cuentaBancaria.saldo (o sumar si PRESTAMO_FUNCIONARIO)
```

### Lote: pagar-cuotas-compras-lote

`cuentas-por-pagar.handler.ts:643-698`. Itera N cuotas en una sola transacción. Usado por `pagar-compras-dialog`.

### Cancelar CPP

Canal `cancelar-cuenta-por-pagar` (línea 588): marca **solo** la CPP en estado=CANCELADO (no toca las cuotas). Para anular una cuota individual pendiente existe `cancelar-cpp-cuota` (línea 774), que la pone CANCELADA y descuenta su saldo no pagado.

> Excepción: al anular una compra FINALIZADA, `anular-compra` (compras.handler.ts) sí marca la CPP CANCELADO **y** sus cuotas PENDIENTE → CANCELADA en bloque.

### Crear préstamo a funcionario

Si `tipo=PRESTAMO_FUNCIONARIO` y se especifica `cajaMayorId/monedaId/formaPagoId`:
- Genera `EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO` + descuenta saldo.
- Genera N cuotas mensuales.

### UI

`src/app/pages/financiero/caja-mayor/cuentas-por-pagar/`:
- `list-cuentas-por-pagar/` — paginada con filtros.
- `create-edit-cuenta-por-pagar-dialog/` — para crear préstamos.
- `cuenta-por-pagar-detalle/` — detalle de una CPP con sus cuotas.
- `pagar-cuota-dialog/` — pago individual con prop `direccion: 'PAGAR' | 'COBRAR'`. Cambia título, labels, botón. Si COBRAR (PRESTAMO_FUNCIONARIO) no valida saldo negativo.

`pagar-compras-dialog/` (en caja-mayor) — pago multi-cuota lote.

**Lista CPP general**: muestra:
- Icono ↓verde para INGRESO (a favor) / ↑rojo para EGRESO (en contra).
- Tooltip explicativo.
- Columna "Beneficiario / Origen" con etiqueta de rol (Funcionario/Proveedor/Acreedor).

**Lista préstamos funcionarios**: dice "Cobrar cuota", "Cobrado", "Saldo a cobrar" (terminología invertida vs CPP normal).

## Cuentas por Cobrar (CPC)

```typescript
enum CuentaPorCobrarTipo {
  CREDITO_VENTA        // crédito otorgado en venta
  PRESTAMO_CLIENTE     // préstamo directo al cliente
  OTRO
}
```

```typescript
CuentaPorCobrar {
  cliente: Cliente
  tipo: CuentaPorCobrarTipo
  descripcion?
  montoTotal, montoCobrado: decimal(18,2)  // PRECISIÓN MAYOR que CPP
  cantidadCuotas: int
  fechaInicio: date
  moneda
  estado: CuentaPorCobrarEstado     // ACTIVO | COBRADO | CANCELADO
  ventaId?: int                      // si origen es Venta
  fechaCancelacion?, motivoCancelacion?
  cuotas: CuentaPorCobrarCuota[]
}

CuentaPorCobrarCuota {
  numero, fechaVencimiento
  monto, montoCobrado: decimal(18,2)
  estado: CuentaPorCobrarCuotaEstado  // PENDIENTE | PARCIAL | COBRADO | CANCELADO
  fechaCobro?: datetime
}
```

### Cobrar cuota

`cobrar-cpc-cuota` (permiso `CPC_COBRAR`):
1. Cuota.montoCobrado += monto. Estado vía `calcularEstadoCuota` (COBRADO si completa).
2. CPC.montoCobrado += monto. Si todas las cuotas cobradas → CPC.estado = COBRADO.
3. Por fuente:
   - `CAJA_MAYOR`: crear `CajaMayorMovimiento` INGRESO_COBRO_CLIENTE (con `cuentaPorCobrarCuotaId`) + `actualizarSaldoCajaMayor`.
   - `CUENTA_BANCARIA`: acredita `cuentaBancaria.saldo` (monto en moneda de la cuenta, vía `montoCuentaBancaria`/`cotizacion` si difiere), **sin** movimiento de Caja Mayor.
4. `cliente.saldoActual` -= monto (el cobro reduce la deuda).
5. Crear `MovimientoCliente` tipo PAGO (guarda `cajaMayorMovimientoId` o `cuentaBancariaId`/`montoCuentaBancaria` según la fuente).

`anular-cobro-cpc-cuota` revierte el cobro (cuota/CPC/saldo cliente + contra-asiento de la fuente). Dialogs: `cobrar-cuota-dialog/` (individual) y `cobrar-cpc-rapido-dialog/` (acceso rápido desde Caja Mayor).

## MovimientoCliente

Tracking paralelo a Caja Mayor para auditar interacciones con un cliente:

```typescript
{
  cliente
  tipo: MovimientoClienteTipo         // CARGO | PAGO | AJUSTE_POSITIVO | AJUSTE_NEGATIVO
  monto, fecha
  ventaId?: int
  cuentaPorCobrarId?, cuentaPorCobrarCuotaId?
  cajaMayorMovimientoId?              // vínculo bidireccional con CajaMayor
  registradoPor?: Usuario
}
```

`Cliente.saldoActual` se actualiza con cada movimiento (en transacción).

## Direccion de flujo: snapshot

`project_cpp_direccion_flujo.md`:

| Tipo | Dirección | Movimientos típicos |
|---|---|---|
| **CPP COMPRA** | En contra (negocio paga) | EGRESO_CUOTA_COMPRA |
| **CPP PRESTAMO** | En contra (negocio paga) | EGRESO_CUOTA_PRESTAMO |
| **CPP PRESTAMO_FUNCIONARIO** | A FAVOR (negocio cobra) | EGRESO_DESEMBOLSO al crear, INGRESO_COBRO_CUOTA al cobrar directo |
| **CPP OTRO** | En contra | depende |
| **CPC** | A FAVOR (cliente paga al negocio) | INGRESO_COBRO_CLIENTE |

## Resúmenes para sidebar de Caja Mayor

`get-caja-mayor-cpp-resumen()` (caja-mayor.handler.ts:2306):

Devuelve `[{ monedaId, monedaSimbolo, monedaDenominacion, esteMes, mesQueViene, total, vencidas }]`. Agrupa cuotas CPP `PENDIENTE/PARCIAL` por moneda.

Buckets:
- `esteMes`: vencen ≤ fin mes actual.
- `mesQueViene`: vencen entre próximo día y fin mes siguiente.
- `total`: SUM(saldoPendiente).
- `vencidas`: SUM(saldoPendiente) con fechaVencimiento < hoy. **Se SUMA al total** (no es disjunto).

`get-caja-mayor-cpc-resumen()` análogo, sobre `CuentaPorCobrarCuota` (col `monto_cobrado`).

UI: cards en sidebar de `caja-mayor-detalle`. Click → abre lista CPP/CPC en tab.

## Anular liquidación de sueldo: revertir cuotas CPP

`anular-liquidacion-sueldo` (liquidacion-sueldo.handler.ts) revierte items por `referenciaTipo`:
- VALE → DESCONTADO → CONFIRMADO, `liquidacion_id = null`.
- **CPP_CUOTA** → resta de monto_pagado de cuota+CPP, vuelve a PENDIENTE/PARCIAL, `fecha_pago = null`. CPP de PAGADO → ACTIVO.
- AGUINALDO → PAGADO → APROBADO.
- LIQUIDACION_COMISION → INTEGRADA → APROBADA.
- Crea contra-movimiento `AJUSTE_POSITIVO` en Caja Mayor.

→ Detalle en [rrhh-liquidaciones.md](rrhh-liquidaciones.md).

## Backfill histórico (caso real, 2026-05-03)

Para CPP #2 "PRESTAMO DE PRUEBA" (ID 2): se agregó movimiento `EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO` retroactivo de 600.000 con observación "BACKFILL: ..." y se descontaron del saldo PYG/EFECTIVO. CPP #1 "PRESTAMO bancario" no se tocó (sus cambios no aplican).

## Pendientes

- Detalle CPP con link inverso a Compra origen.
- Tasa de interés en CPP PRESTAMO (cálculo simple/compuesto).

(El cobro CPC de acceso rápido ya existe: `cobrar-cpc-rapido-dialog/`.)
