# Dominio: Compras y Cuentas por Pagar

Workflow de compras a proveedores con pago unificado vía CPP (refactor 2026-05-05).

> **Vinculado:** existe un módulo de **Importación de facturas con OCR + IA** que crea Compras borrador (estado ABIERTO) a partir de fotos/PDFs vía GPT-4o vision, con sistema de aliases que aprende. Una vez creado el borrador desde OCR, el flujo de **finalización** (stock, costo, CPP) es el mismo que se describe acá. Documentación dedicada → [importacion-facturas-ocr.md](importacion-facturas-ocr.md).

## Estados de la compra

```
ABIERTO (borrador editable)
  ↓ finalizar
FINALIZADO (impacta stock + costo + caja)
  ↓ anular (con motivo)
CANCELADO
```

`ACTIVO` existe en el enum pero está deprecated.

## Entidades

### Proveedor

```typescript
{
  nombre, razon_social?, ruc?, telefono?, direccion?
  activo
  persona?: Persona      // vinculación opcional con entidad Persona
  compras: Compra[]
  proveedorProductos: ProveedorProducto[]
}
```

### ProveedorProducto (histórico de precios)

```typescript
{
  proveedor_id, producto_id (nullable para legacy data)
  ultimoCostoUnitario: decimal(14,2) nullable  // EN UNIDAD BASE del producto, NO en presentación
  ultimaCompraFecha: date nullable
  compra_id nullable                            // referencia a la última compra que actualizó
  activo
}
```

**Sin constraint UNIQUE** — la unicidad de (proveedor, producto) se valida en handler (`upsertProveedorProducto`) por compatibilidad con datos legacy (`producto_id` puede ser NULL).

**costo en UNIDAD BASE**: aunque se compre en cajas (presentación), el costo histórico se guarda dividido por `presentacion.cantidad`. Permite comparaciones entre compras con distintas presentaciones.

### Compra

```typescript
{
  estado: CompraEstado          // ABIERTO | ACTIVO (deprecated) | FINALIZADO | CANCELADO
  isRecepcionMercaderia         // flag para diferenciar OC de recepción (sin flujo aún)
  numeroNota?, tipoBoleta       // LEGAL | COMUN | OTRO | SIN_COMPROBANTE
  fechaCompra: date             // de la boleta del proveedor
  credito: boolean              // true → genera N cuotas, false → 1 cuota
  plazoDias?: int               // legacy, ahora cuotas mensuales
  total: decimal(14,2)          // suma subtotales detalles
  motivoAnulacion?: text
  proveedor: Proveedor
  moneda: Moneda                // una sola moneda por compra
  formaPagoCompra: FormaPagoCompra  // EFECTIVO | BANCO (enum acotado, NO la tabla FormasPago)
  cuentaBancaria?: CuentaBancaria   // requerido si BANCO + pagar inmediatamente
  compraCategoria?: CompraCategoria
  cuentaPorPagar?: CuentaPorPagar   // FK a CPP generada al finalizar
  detalles: CompraDetalle[]
  // Deprecated:
  pago?: Pago                   // legacy, ya no se setea
  formaPago?: FormasPago        // legacy, reemplazado por formaPagoCompra enum
}
```

### CompraDetalle

```typescript
{
  compra_id
  producto_id nullable       // permite null en legacy data
  presentacion_id nullable
  cantidad: decimal(10,3)    // unidades en la presentación (ej: 10 cajas)
  costoUnitarioPresentacion: decimal(14,2)  // costo por presentación (ej: $/caja)
  subtotal: decimal(14,2)    // cantidad × costoUnitario
  cantidadUnidadBase: decimal(10,3)  // cantidad × presentacionFactor (unidades en UB)
  activo
}
```

**Sin IVA separado**: `costoUnitarioPresentacion` es el valor que el usuario ingresa (con o sin IVA según política de entrada). No hay columnas de impuesto.

### CompraCategoria

Jerárquica (padre self-ref): "Mercadería", "Servicios", "Gastos Operativos". Permite filtrar listado y reportar.

### Forma de pago: dos conceptos diferentes

| Concepto | Tipo | Donde |
|---|---|---|
| `FormaPagoCompra` (enum) | EFECTIVO, BANCO | En `compras/forma-pago-compra.enum.ts`. Acotado para compras. |
| `FormasPago` (entidad) | Tabla con N filas (Efectivo, Tarjeta, PIX, etc.) | Catálogo general usado en ventas, caja mayor. |

`Compra.formaPagoCompra` (enum) reemplaza al legacy FK `Compra.formaPago` (que era `FormasPago`).

## Cuentas por Pagar (CPP)

`financiero/cuenta-por-pagar.entity.ts`:

```typescript
CuentaPorPagar {
  descripcion: string                // "COMPRA #X — Proveedor"
  tipo: CuentaPorPagarTipo           // COMPRA | PRESTAMO | PRESTAMO_FUNCIONARIO | OTRO
  proveedor?: Proveedor
  funcionario?: Funcionario           // si PRESTAMO_FUNCIONARIO
  montoTotal: decimal(14,2)
  montoPagado: decimal(14,2)
  moneda: Moneda
  fechaInicio: date                   // = fechaCompra para contado, fecha elegida para crédito
  cantidadCuotas: int                 // 1 (contado) o N (crédito)
  estado: CuentaPorPagarEstado        // ACTIVO | PAGADO | CANCELADO
  observacion?: text                  // "NOTA {numeroNota}"
  compra_id?: int                     // columna plana, sin FK constraint ORM
  cuotas: CuentaPorPagarCuota[]
}

CuentaPorPagarCuota {
  numero: int                         // 1, 2, ..., N
  fechaVencimiento: date
  monto: decimal(14,2)                // monto original
  montoPagado: decimal(14,2)
  estado: CuotaEstado                 // PENDIENTE | PARCIAL | PAGADA | VENCIDA | CANCELADA
  fechaPago?: datetime
  observacion?
  cuentaPorPagar: CuentaPorPagar (M:1)
}
```

## Refactor 2026-05-05: pago unificado

**Antes** del refactor:
- Contado: `EGRESO_COMPRA` directo en Caja Mayor. Sin CPP.
- Crédito: CPP + N cuotas. Pago vía dialog específico.

**Después** del refactor:
- **TODA compra finalizada genera CPP**:
  - Contado: 1 cuota con `fechaVencimiento = fechaCompra`.
  - Crédito: N cuotas mensuales (lógica existente).
- El pago vive como operación **posterior**, accesible desde Caja Mayor → Egreso → "Pagar compras".
- Si user marca `pagarAhora=true` (contado), `finalizar-compra` retorna `cuotaIdParaPagar` para abrir el dialog de pago inmediatamente.

**Datos legacy no migrados**: compras 1-6 pre-refactor con contado siguen sin CPP — aparecen como "ya pagadas" en lista. Enum `EGRESO_COMPRA` se mantiene en `caja-mayor-enums.ts` por compatibilidad.

## Flujo: finalizar-compra

`compras.handler.ts:527-663`. Transacción atómica:

```
1. Validar: estado=ABIERTO, tiene detalles, tiene proveedor
2. Para cada detalle:
   a. costoUB = costoUnitarioPresentacion / presentacionFactor (Presentacion.cantidad)
   b. Costo promedio ponderado vía helper `aplicarCostoPromedioPonderado(qr, ...)` (se calcula ANTES de persistir el StockMovimiento, sino el denominador queda inflado):
      - si stockAnterior <= 0 o sin costo previo: nuevoCosto = costoUB
      - sino: (stockAnterior × costoAnterior + cantidadAgregada × costoUB) / (stockAnterior + cantidadAgregada)
      - Desactiva PrecioCosto previo (activo=false)
      - Inserta nuevo PrecioCosto fuente=COMPRA, activo=true
   c. Si producto.controlaStock:
      - StockMovimiento (tipo=COMPRA, cantidad=cantidadUnidadBase, fecha=fechaCompra, referencia=compraId)
   d. upsertProveedorProducto (ultimoCostoUnitario en UB, ultimaCompraFecha)
3. Generar CuentaPorPagar:
   - tipo=COMPRA, montoTotal=total, fechaInicio
   - cantidadCuotas = credito ? N : 1
   - estado=ACTIVO, compra_id=this.id
4. Generar cuotas:
   - Contado: 1 cuota (vencimiento = fechaCompra, monto = total)
   - Crédito: N cuotas (vencimiento = fechaInicio + i meses, monto = total/N, última absorbe diferencia)
5. Compra.estado = FINALIZADO
6. Si pagarAhora=true (sólo contado): retornar cuotaIdParaPagar
```

## Flujo: anular-compra

`compras.handler.ts:666-783`:

**Si estaba ABIERTO**: solo `Compra.estado = CANCELADO`. Sin reversiones.

**Si estaba FINALIZADO**:
1. **Validar**: `cuentas_por_pagar_cuotas WHERE cpp.compra_id = ? AND monto_pagado > 0` debe estar vacío. Si hay cuotas pagadas → error "anula primero los pagos".
2. **CPP**: estado → CANCELADO. Cuotas PENDIENTE → CANCELADA.
3. **Caja Mayor**: buscar `CajaMayorMovimiento.compraId = this.id` y crear contra-movimiento ANULACION restituyendo saldo.
4. **Stock**: por cada detalle con `controlaStock=true`, crear `StockMovimiento.AJUSTE_NEGATIVO` para revertir el ingreso.
5. **PrecioCosto NO se revierte automáticamente** — el nuevo PrecioCosto activo queda. Si se quiere ajustar manualmente, intervención humana.

## Flujo: pagar-compras-dialog

Componente: `src/app/pages/financiero/caja-mayor/pagar-compras-dialog/`.

1. Carga inicial: canal IPC `get-cuotas-pendientes-compras` (cuentas-por-pagar.handler.ts:701-771).
   - Filtra: cpp.tipo=COMPRA, estado IN (PENDIENTE, PARCIAL), cpp.estado=ACTIVO.
   - Enriquece: cppId, compraId, compraNumeroNota, compraFechaCompra, compraCredito, proveedorId, proveedorNombre, moneda, saldoPendiente.
   - Orden: proveedor ASC, fechaVencimiento ASC.
2. UI: tabla con checkboxes, filtro proveedor, "marcar todo", monto editable por cuota, sticky subtotal.
3. Selector fuente: `CAJA_MAYOR | CUENTA_BANCARIA`.
   - Si CAJA_MAYOR: caja mayor abierta + moneda + forma pago (movimentaCaja=true).
   - Si CUENTA_BANCARIA: cuenta bancaria.
4. Defaults sensatos: si solo 1 caja abierta, preselecciona; preselecciona moneda principal y forma de pago "EFECTIVO" o la primera con `movimentaCaja=true`.
5. Confirmar → canal IPC `pagar-cuotas-compras-lote` (payload: `{ pagos: [{cuotaId, monto, observacion?}], fuente, cajaMayorId?, monedaId?, formaPagoId?, cuentaBancariaId? }`).

### Handler: pagar-cuotas-compras-lote

`cuentas-por-pagar.handler.ts:643-698`. Itera cuotas y llama `aplicarPagoCpoCuota()` (línea 88-193) **en una sola transacción**.

`aplicarPagoCpoCuota()`:
- Valida cuota existe, no PAGADA/CANCELADA, monto > 0, monto ≤ saldo + 0.005 (tolerancia decimal).
- Cuota.montoPagado += monto. Recalcula estado:
  - Si monto == saldo: estado = PAGADA, fechaPago = now.
  - Si parcial: estado = PARCIAL.
- CPP.montoPagado += monto. Si todas cuotas PAGADA: cpp.estado = PAGADO.
- Si fuente=CAJA_MAYOR:
  - Crear `CajaMayorMovimiento` con `cuentaPorPagarCuotaId` y tipo según `cpp.tipo`: `EGRESO_CUOTA_COMPRA` (COMPRA/OTRO), `EGRESO_CUOTA_PRESTAMO` (PRESTAMO), o `INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO` (PRESTAMO_FUNCIONARIO).
  - Descuenta saldo vía `descontarSaldoCajaMayor` (o `sumarSaldoCajaMayor` si PRESTAMO_FUNCIONARIO, que es ingreso).
- Si fuente=CUENTA_BANCARIA: resta `cuentaBancaria.saldo` (suma si PRESTAMO_FUNCIONARIO).

## Filtros default en lista

**Lista CPP general** (`get-cuentas-por-pagar`): acepta `excluirContadoCompras: boolean` (default `false` → lista todo).
- Con `true`: `LEFT JOIN compras ... WHERE (cpp.compra_id IS NULL OR compra.credito = true OR cpp.estado = 'ACTIVO')` — oculta **solo** las compras al contado YA pagadas/canceladas (tickets diarios liquidados). Las contado **pendientes** (estado ACTIVO) son deuda real y siguen apareciendo, igual que las a crédito y las CPP sin compra (préstamos, etc.).
- Otros filtros del handler: `estado`, `tipo`, `proveedorId`, `funcionarioId`, `soloPrestamosFuncionario`, `excluirPrestamosFuncionario`, paginación (`page`/`pageSize`).

**Lista compras**: `creditoOptions` con default "Solo contado" (false). Toggle "Todos" o "Solo crédito".

`list-compras` agrega columna `estadoPago` (PAGADO/PARCIAL/PENDIENTE) calculada en handler:
- Sin CPP (legacy contado): PAGADO si FINALIZADO.
- Con CPP: contar cuotas pagadas vs total.

## Panel productos proveedor (UI)

`src/app/pages/compras/create-edit-compra/panel-productos-proveedor/`.

Cuando user elige proveedor en la cabecera de la compra, este panel a la derecha muestra histórico de productos comprados a ese proveedor:
- Tabla paginada con: nombre, ultimoCosto en UB, último-presentacion-nombre.
- Búsqueda debounced por nombre.
- Click → emite `productoFocus` → carga panel histórico (últimas compras del producto).
- Doble-click o "Seleccionar" → emite `productoSelected` → agrega a tabla de detalles con costo sugerido.

## Validaciones clave

- Cantidad ≥ 0.001 (3 decimales).
- Costo unitario ≥ 0 (puede ser 0 para donaciones).
- Producto requerido en cada detalle.
- Presentación opcional (si null, factor=1, cantidadUB = cantidad).
- Proveedor + Moneda requeridos en cabecera.
- En `finalizar-compra`: estado=ABIERTO, tiene detalles, todo válido.
- En `anular-compra`: estado != CANCELADO, si FINALIZADO sin cuotas pagadas.

## Cards CPP/CPC en sidebar de Caja Mayor

`caja-mayor-detalle.component` con sidebar derecha de cards compactos:
- Por cada moneda: card CPP con `{esteMes, mesQueViene, total, vencidas}`.
- Card CPC análogo (sobre `CuentaPorCobrarCuota` con `monto_cobrado`).
- Click en card abre lista CPP/CPC en tab.

Configurable vía `caja-mayor-configuracion`:
- `mostrarCuentasPorPagar` (boolean, default false)
- `mostrarCuentasPorCobrar` (boolean, default false)
- M:N con `FormasPago` y `CuentaBancaria` (qué cards mostrar)

→ Detalles caja mayor: [financiero-caja-mayor.md](financiero-caja-mayor.md).

## Pendientes

- Recepción de mercadería (flag `isRecepcionMercaderia` existe sin flujo).
- Devoluciones a proveedor (parciales).
- Importación CSV/Excel.
- Reportes con exports.
- Alertas stock mínimo al finalizar.
- Tipo de cambio histórico (snapshot).
- Sugerencia de compras desde POS (productos con stock bajo).
- Multi-receta proveedor (primario / alternativo).
- Comparador de precios entre proveedores.
- Workflow de aprobación (compras > X requieren autorización).

→ [workflows/todos-pendientes.md](../workflows/todos-pendientes.md) sección Compras.
