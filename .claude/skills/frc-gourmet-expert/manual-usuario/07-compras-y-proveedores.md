# Capítulo 7 — Compras y proveedores

Workflow de compras a proveedores. Borrador → Finalizar → Pago vía CPP.

> **Atajo:** podés cargar una compra desde la **foto/PDF de la factura** usando inteligencia artificial. Botón **Importar con IA** en el listado de compras. El sistema lee el documento, te muestra el borrador y vos solo confirmás. Detalles → [20-importacion-facturas-ia.md](20-importacion-facturas-ia.md).

## Pre-requisitos

- Productos con `esComprable=true` (capítulo 4).
- Monedas y tipos de cambio configurados.
- Cuentas bancarias (si pagás por transferencia).
- Categorías de compra (capítulo 2).

## 1. Crear proveedor

**Menu → Compras → Dashboard → Proveedores → "Nuevo proveedor"**.

- Nombre (UPPERCASE).
- Razón social.
- RUC.
- Teléfono, dirección.
- Persona (opcional, vincular a Persona si es socio o conocido).

## 2. Categorías de compra

**Menu → Compras → Dashboard → Categorías**.

Crear:
- "Mercadería" → padre.
  - "Bebidas" → hija.
  - "Productos secos".
  - "Frescos".
- "Servicios".
- "Insumos".

Permite filtrar y agrupar gastos por categoría.

## 3. Crear compra (borrador)

**Menu → Compras → Lista de Compras → "Nueva compra"**.

Se abre el editor en una pestaña.

### Cabecera

- **Proveedor** (obligatorio).
- **Moneda** (default principal).
- **Fecha de compra** (de la boleta).
- **Crédito** (toggle): si es a plazos.
- **Categoría** (opcional).
- **Número de nota** (factura del proveedor).
- **Tipo de boleta**: LEGAL / COMÚN / OTRO / SIN_COMPROBANTE.

### Detalles (items)

Click "+" → tabla editable con:
- Producto (autocomplete, modo `compra` → solo `esComprable=true`).
- Presentación (las que tenga el producto).
- Cantidad (en presentación, ej: 10 cajas).
- Costo unitario (de la presentación, ej: $/caja).

Sistema calcula:
- Subtotal = cantidad × costo.
- Cantidad en unidad base = cantidad × presentacion.cantidad.

### Panel productos proveedor (lateral)

Cuando elegís proveedor en la cabecera, este panel se llena con:
- Productos comprados anteriormente a ese proveedor.
- Último costo (en unidad base).
- Última fecha de compra.

**Click** en un producto → muestra histórico de compras a otros proveedores.
**Doble-click** → agrega a la tabla con costo sugerido.

### Guardar borrador

Click "Guardar borrador" → la compra queda en estado **ABIERTO**, editable.

Aparece en la lista de compras.

## 4. Editar borrador

Volver a la lista, click ⋮ → "Editar".

Mientras esté ABIERTO, podés:
- Agregar / quitar items.
- Cambiar cabecera.
- Modificar costos / cantidades.

## 5. Finalizar compra

Click "Finalizar" en el editor o en la lista (⋮).

Dialog `Finalizar compra`:

- **Forma de pago**: EFECTIVO / BANCO.
- **Cuenta bancaria** (si BANCO).
- **Cuotas** (si crédito): cantidad + fecha inicio.
- **Pagar ahora** (✅, solo si contado): si lo marcás, después de finalizar abre directo el dialog de pago.

Al confirmar **Finalizar**:

1. **Estado** → FINALIZADO.
2. **Stock**: por cada producto con `controlaStock=true`, genera `StockMovimiento.COMPRA`.
3. **Costo promedio ponderado** se calcula y se actualiza el `PrecioCosto` activo:
   - Si stock anterior = 0: nuevo costo = el de la compra.
   - Si hay stock previo: promedio entre stock anterior × costo anterior + cantidad nueva × costo nuevo.
4. **ProveedorProducto** se actualiza con `ultimoCostoUnitario` (en unidad base) y `ultimaCompraFecha`.
5. **Cuenta por pagar (CPP)**: SIEMPRE se genera.
   - Si contado: 1 cuota con vencimiento = fechaCompra.
   - Si crédito: N cuotas mensuales (montos divididos equitativamente, última absorbe diferencia de redondeo).

## 6. Pagar compra

### Si marcaste "Pagar ahora" al finalizar

Se abre directo el dialog `pagar-compras-dialog` con la cuota generada.

### Si no, ir manualmente

**Menu → Financiero → Caja Mayor → (botón "Pagar compras")** o desde dialog Egresos.

`pagar-compras-dialog`:

1. **Lista de cuotas pendientes** (todas las CPP de tipo COMPRA, estado PENDIENTE/PARCIAL).
2. **Filtro por proveedor** (dropdown dinámico).
3. **"Marcar todo"** / "Desmarcar todo".
4. Por fila: monto a pagar (default = saldo pendiente).
5. **Fuente**: CAJA_MAYOR (con caja, moneda, forma de pago) o CUENTA_BANCARIA.
6. **Sticky subtotal** abajo.

Click "Pagar":

- Crea `CajaMayorMovimiento` por cada cuota seleccionada (`EGRESO_CUOTA_COMPRA`).
- Actualiza saldo de Caja Mayor o Cuenta Bancaria.
- Estados de cuota: PARCIAL si pago parcial, PAGADA si total.
- Si todas cuotas PAGADAS → CPP estado=PAGADO.

## 7. Anular compra

Click ⋮ → "Anular".

Pide motivo.

- **Si era ABIERTO**: solo marca como CANCELADO (sin reversiones).
- **Si era FINALIZADO**:
  - Bloquea si hay cuotas con `monto_pagado > 0` → "Anula primero los pagos".
  - Si no hay pagos:
    - CPP → CANCELADO. Cuotas → CANCELADA.
    - Crea contra-movimiento ANULACION en Caja Mayor (revierte saldo si ya se había pagado).
    - StockMovimiento → AJUSTE_NEGATIVO para revertir el ingreso.

⚠️ **El PrecioCosto NO se revierte automáticamente** — ajustar manualmente si es necesario.

## 8. Lista de compras

**Menu → Compras → Lista de Compras**.

Columnas:
- ID, fecha, proveedor, categoría, número nota, total, **estado de pago** (PAGADO/PARCIAL/PENDIENTE), estado.

Filtros:
- Proveedor.
- Estado.
- Crédito (Solo contado / Solo crédito / Todos). **Default: Solo contado**.
- Rango de fechas.
- Búsqueda en nota + nombre proveedor.

Acciones (⋮):
- Editar (si ABIERTO).
- Ver detalle (FINALIZADO).
- Finalizar (ABIERTO).
- Anular (FINALIZADO).

## 9. Histórico por proveedor

**Menu → Compras → Proveedores → click en proveedor → Detalle**.

Muestra:
- Datos del proveedor.
- Compras realizadas (lista filtrable).
- Productos comprados (último costo + fecha) — TODO mostrar.

## 10. Errores comunes

### "Producto no aparece en el buscador de compras"

- Verificá `esComprable=true` en el producto.
- El buscador del PdV usa `esVendible=true`, el de compras usa `esComprable=true` — son flags diferentes.

### "No puedo finalizar — total = 0"

- Verificá que cada detalle tenga costo unitario > 0.
- Revisar que tenga al menos un detalle.

### "Anular compra dice 'Hay cuotas pagadas'"

- Las cuotas con pagos no permiten anular la compra. Hay que:
  1. Revertir cada pago (cancelar movimiento de pago).
  2. Después de eso, anular la compra.

### "Compra anterior no aparece en pagar-compras-dialog"

- Si era contado pre-refactor 2026-05-05, **no tiene CPP** (movimiento directo). Aparece como "PAGADA" en la lista de compras pero no en el dialog de pago.

## 11. Cuotas vs cuotas

| Concepto | Entidad | Uso |
|---|---|---|
| Cuotas de la compra | `CompraCuota` | DEPRECATED. Ya no se usa. |
| Cuotas a pagar | `CuentaPorPagarCuota` | Las cuotas reales generadas al finalizar |

Toda compra finalizada genera CPP + cuotas — no toques `CompraCuota`.

## 12. Reportes (TODO)

- Compras por categoría / proveedor / producto.
- Exports PDF / Excel.
- Alertas de stock mínimo al finalizar compra.

→ Pendientes en [workflows/todos-pendientes.md](../../workflows/todos-pendientes.md).

---

**Próximo capítulo →** [08 — Caja Mayor: gastos, retiros, entradas](08-caja-mayor-financiero.md)
