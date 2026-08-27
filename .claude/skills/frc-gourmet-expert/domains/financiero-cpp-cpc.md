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
  liquidacionId?: int                 // 2026-07: liquidación de sueldo que descuenta esta cuota (funcionario-cliente)
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

`anular-cobro-cpc-cuota` revierte el cobro (cuota/CPC/saldo cliente + contra-asiento de la fuente). Dialog: `cobrar-cuota-dialog/` (una cuota; lo abren `cuenta-por-cobrar-detalle`, `cliente-detalle` y la PWA mobile).

⚠️ `anular-cobro-cpc-cuota` arranca con `bloquearSiPagoConsolidado(..., CPC_CUOTA, ...)`: una cuota cobrada dentro de un **cobro consolidado** no se revierte por este camino, se anula el evento entero desde Caja Mayor.

⚠️ `cobrar-cpc-cuota` (el camino viejo) **no toma lock pesimista** sobre cuota/CPC/cliente. El cobro consolidado sí. Dos cobros simultáneos del mismo cliente por caminos distintos pueden pisarse `saldoActual` en modo server (se recupera con `recalcular-saldo-cliente`).

### Cobro consolidado desde Caja Mayor (2026-08)

El botón **Ingreso → Cobrar a Cliente** de Caja Mayor ya no abre un diálogo propio: abre el **wizard consolidado** (`pagar-obligaciones-dialog`) con `concepto = COBRO_CLIENTE`, que es el quinto concepto del motor de pago consolidado y el único de sentido **INGRESO**. Permite cobrar **varias cuotas de un mismo cliente** en un solo evento, con N líneas (multi-moneda × multi-forma × caja/banco) y un **descuento** opcional. Detalles → [financiero-caja-mayor.md](financiero-caja-mayor.md) y `docs/planes/PLAN-COBRO-CONSOLIDADO-CPC.md`.

Reglas propias del concepto:

- **Un cobro = un cliente** (`CONCEPTO_BENEFICIARIO_UNICO`), y admite **cobro parcial** de una cuota.
- **Cuota reservada por una liquidación de sueldo**: si `cuota.liquidacionId` apunta a una liquidación en `BORRADOR` o `APROBADA`, la cuota sale **bloqueada** y el backend la rechaza. La reserva se hace al *generar el borrador* y congela el monto, así que cobrarla en efectivo mientras tanto la cobraba dos veces (una por caja y otra descontada del sueldo). Con la liquidación `PAGADA` la reserva ya se consumió y el residual se cobra normal.
- **Locks** en orden total cuota → CPC → cliente: `cpc.montoCobrado` y `cliente.saldoActual` son read-modify-write sobre agregados compartidos.

### Cobro de CPC vía liquidación de sueldo (funcionario-cliente, 2026-07)

Si el cliente comparte `persona_id` con un funcionario, sus cuotas CPC que vencen en el mes se **descuentan de la liquidación de sueldo** (concepto `CREDITO_CONSUMO`, referenciaTipo `CPC_CUOTA`). Al pagar la liquidación se cobra la cuota atómicamente (cuota COBRADA/PARCIAL, baja `saldoActual`, `MovimientoCliente` PAGO) **sin** movimiento aparte de Caja Mayor (neteado en el EGRESO_SALARIO). Anular la liquidación revierte el cobro. La columna `cuentas_por_cobrar_cuotas.liquidacion_id` evita que una cuota se tome en dos borradores. Detalles → [rrhh-liquidaciones.md](rrhh-liquidaciones.md).

## Cobro Consolidado por Convenio

Cobra de una sola vez **toda la deuda cobrable de todos los clientes que comparten un `Convenio`** (agrupación empresa/entidad — ver [personas-clientes.md](personas-clientes.md) §Convenio). Pensado para que la empresa pague a fin de mes la cuenta de sus funcionarios/afiliados y luego descuente internamente.

### Entidades

- `CobroConsolidado` (`entities/financiero/cobro-consolidado.entity.ts`): cabecera — `convenio`, `fecha`, `montoTotal`, `cantidadClientes`, `fuente` (`CAJA_MAYOR`|`CUENTA_BANCARIA`), `cajaMayorId`/`monedaId`/`formaPagoId`/`cuentaBancariaId`, `observacion`, `estado` (`ACTIVO`). Enums en `cobro-consolidado-enums.ts`.
- `CobroConsolidadoDetalle`: una fila por cliente cobrado — `cliente`, `montoCobrado`, `saldoAnterior`. Base de los recibos.
- Migración: `1779500000000-AddConveniosCobroConsolidado.ts`.

### Handler (`electron/handlers/convenios.handler.ts`)

- `get-cobro-consolidado-preview(convenioId)` → `computeCobroPreview`: por cada cliente del convenio suma sus cuotas cobrables (`getCuotasCobrablesCliente`: cuotas `PENDIENTE`/`PARCIAL` de CPC `ACTIVO`, venc. ASC). Devuelve `{ convenio, clientes:[{ id, nombre, documento, cantidadCompras, deuda }], total, cantidadConDeuda }`, ordenado por deuda desc. **`cantidadCompras` = cantidad de CPC distintas con deuda pendiente** (operaciones a crédito / compras del cliente), NO cantidad de cuotas — cada venta a crédito genera una `CuentaPorCobrar`.
- `export-cobro-consolidado-preview-pdf(convenioId)` → PDF "REPORTE DE COBRO CONSOLIDADO" con columnas **CLIENTE · DOCUMENTO · COMPRAS · DEUDA** + total (pdfmake, `pdfTablaMontos`).
- `registrar-cobro-consolidado(payload)` (**`ensurePermission` `CPC_COBRAR`**, transaccional): por cada cliente con deuda liquida sus cuotas cobrables en bruto (cuota→`COBRADO`/`PARCIAL`, actualiza cada CPC y la marca `COBRADO` si se saldó), genera el ingreso (Caja Mayor: 1 `CajaMayorMovimiento INGRESO_COBRO_CLIENTE` por cliente + `actualizarSaldoCajaMayor`; Cuenta bancaria: **1 solo crédito por el total** al final + `registrarMovimientoBancario ENTRADA_MANUAL`), baja `cliente.saldoActual`, crea `MovimientoCliente PAGO` y un `CobroConsolidadoDetalle` por cliente. Acepta `clienteIds` opcional para cobrar solo un subconjunto. Falla si ningún cliente tiene deuda cobrable.
- `export-recibo-cobro-consolidado-pdf(cobroConsolidadoId)` → PDF con un recibo compacto por cliente (3 por hoja A4, líneas de corte punteadas). Se descarga automáticamente al registrar.
- `get-cobros-consolidados(filtros?)` / `get-cobro-consolidado(id)`: historial (filtra por `convenioId`/`estado`).

### Acceso (UI)

Dos entradas, **ambas abren la tab `CobroConsolidadoComponent`** (`pages/personas/convenios/cobro-consolidado/`) con `{ convenioId }`:
1. **Personas → Convenios** → menú ⋮ de la fila → **"Cobro consolidado"** (`list-convenios.component`).
2. **Cuentas por Cobrar** (lista, `financiero/caja-mayor/cuentas-por-cobrar/list-cuentas-por-cobrar`) → botón de header **"Cobro consolidado"** con menú de convenios activos (gated `*appHasPermission="'CLIENTES_VER'"`).

La tab muestra: resumen (total + clientes con deuda), form de cobro (Caja Mayor / Cuenta bancaria), tabla "Deuda por cliente" (Cliente · Documento · **Compras** · Deuda) e historial de cobros con descarga de recibos. **No es una hoja del `MENU_TREE`** — se accede siempre desde un convenio.

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

(El cobro CPC desde Caja Mayor ya existe y es multi-cuota: wizard `pagar-obligaciones-dialog` con `concepto = COBRO_CLIENTE`. Pendiente: ofrecerlo también desde `cuenta-por-cobrar-detalle` y `cliente-detalle` con `origenIdsPreseleccionados`, que hoy siguen cobrando de a una cuota.)
