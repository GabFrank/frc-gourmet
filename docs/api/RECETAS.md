# Recetas de la API (flujos frecuentes)

Complementa [README.md](README.md) (protocolo y reglas) y [CATALOGO-RPC.md](CATALOGO-RPC.md) (todos los métodos). Los ids de los ejemplos son **ilustrativos**: leerlos siempre antes (dependen de cada instalación; p. ej. la Caja Mayor principal no siempre es la id 1).

## Cuentas bancarias

| Método | params | Devuelve |
|---|---|---|
| `get-cuentas-bancarias` | `[]` | Todas (también inactivas): `id, nombre, banco, numeroCuenta, tipoCuenta, titular, alias, saldo, saldoReservado, activo, moneda`. |
| `get-cuenta-bancaria-resumen` | `[id]` | `{…, saldo, saldoReservado, saldoFuturo}` (saldoFuturo = acreditaciones POS pendientes). |
| `get-movimientos-cuenta-bancaria` | `[cuentaId, {fechaDesde?, fechaHasta?, tipo?, esIngreso?, page?, pageSize?}]` | Siempre `{items,total}`. Junta manuales, cheques, operaciones financieras, entradas varias, gastos, vales y cobros (`origen`). |

- `create-movimiento-bancario [{cuentaBancariaId, tipoMovimiento, monto>0, fecha?, observacion?, numeroComprobante?}]` 🔒 BANCOS_GESTIONAR. **Solo `ENTRADA_MANUAL` y `AJUSTE_POSITIVO` suman; cualquier otro tipo (incluso vacío) RESTA.** Mueve una sola cuenta: no sirve para transferir.
- `acreditar-transferencia-bancaria [{cuentaBancariaId, monto, monedaId?, numeroComprobante?}]`: transferencia/PIX recibida de un cobro.
- Cuentas de terceros (sin saldo): `get-cuentas-bancarias-destino-by-persona [{personaId, incluirInactivas?}]`, `create-cuenta-bancaria-destino [{personaId, banco, numeroCuenta, monedaId, alias?, tipoCuenta?, observacion?}]`.

## Operaciones financieras (transferencias, depósitos, retiros, cambio)

¿Qué uso para una «transferencia»?
- Banco → banco propio: `TRANSFERENCIA_BANCARIA`. Caja mayor → banco: `DEPOSITO_BANCARIO`. Banco → caja mayor: `RETIRO_BANCARIO`. Caja mayor → caja mayor: `TRANSFERENCIA_ENTRE_CAJAS`. Cambio de moneda: `CAMBIO_DIVISA`.
- **Pago a un tercero** no es operación financiera: es un gasto (`create-gasto`), una compra (`crear-compra-simplificada`) o el pago de una cuota / pago consolidado.
- **Cobro recibido**: `acreditar-transferencia-bancaria` (venta) o `create-entrada-varia` con `destinoTipo:"CUENTA_BANCARIA"`.

`create-operacion-financiera [data]` 🔒 CAJA_MAYOR_OPERAR. Vínculos como **ids sueltos**. Comunes: `tipoOperacion, descripcion, fecha?, cotizacion?, numeroComprobante?, observacion?, operacionFinancieraCategoriaId?`. Solo TRANSFERENCIA_BANCARIA valida campos; en los otros, si falta algo sale error de base o saldo NaN. No controla saldo.

| tipoOperacion | Obligatorios |
|---|---|
| `TRANSFERENCIA_BANCARIA` | `cuentaBancariaOrigenId ≠ cuentaBancariaDestinoId, montoOrigen, montoDestino` (+ `monedaOrigenId, monedaDestinoId`) |
| `DEPOSITO_BANCARIO` | `cajaMayorOrigenId, monedaOrigenId, formaPagoOrigenId, montoOrigen, cuentaBancariaDestinoId, montoDestino` |
| `RETIRO_BANCARIO` | `cuentaBancariaOrigenId, montoOrigen, cajaMayorDestinoId, monedaDestinoId, formaPagoDestinoId, montoDestino` |
| `TRANSFERENCIA_ENTRE_CAJAS` | `cajaMayorOrigenId, monedaOrigenId, formaPagoOrigenId, montoOrigen, cajaMayorDestinoId, monedaDestinoId, formaPagoDestinoId, montoDestino` |
| `CAMBIO_DIVISA` | `cajaMayorOrigenId, monedaOrigenId, formaPagoOrigenId, montoOrigen, monedaDestinoId, formaPagoDestinoId, montoDestino, cotizacion` |

```json
{"method":"create-operacion-financiera","params":[{"tipoOperacion":"TRANSFERENCIA_BANCARIA","descripcion":"itau a continental","fecha":"2026-10-06T10:00:00","cuentaBancariaOrigenId":2,"monedaOrigenId":1,"montoOrigen":3000000,"cuentaBancariaDestinoId":4,"monedaDestinoId":1,"montoDestino":3000000}]}
```
Lecturas: `get-operaciones-financieras [{tipoOperacion?, fechaDesde?, fechaHasta?, cajaMayorId?, anulado?, page?, pageSize?}]`. Anular: `anular-operacion-financiera [id, motivo]` (D).

## Gastos

- `get-gastos [{fechaDesde?, fechaHasta?, gastoCategoriaId?, estado?, cajaMayorId?}]`: array **sin paginar** (usar siempre `fechaDesde`). `get-gasto [id]` trae `detalles`.
- `get-gasto-categorias []`: árbol; los hijos aparecen también como filas propias con su `padre` (no contar dos veces).

`create-gasto [data]` 🔒 CAJA_MAYOR_OPERAR. Siempre: `gastoCategoria:{id}`, `descripcion`, **`fecha` (sin default)**, **`cajaMayor:{id}` (aunque pague el banco)**; opcionales `proveedor:{id}, numeroComprobante, tipoBoleta (LEGAL/COMUN/OTRO/SIN_COMPROBANTE)`. Modos:
1. Desde Caja Mayor (default): `detalles:[{monedaId, formaPagoId, monto}]`.
2. Débito bancario editable: `fuente:"CUENTA_BANCARIA", cuentaBancariaId, detalles:[…]` (+ `montoCuentaBancaria, cotizacion` si la cuenta es de otra moneda).
3. Débito bancario simple: `destinoTipo:"CUENTA_BANCARIA", cuentaBancariaId, monedaId, monto` (no editable después).
4. Diferido: `diferido:true, monedaId, monto`, sin detalles → queda PENDIENTE para pago consolidado.

```json
{"method":"create-gasto","params":[{"gastoCategoria":{"id":3},"descripcion":"ALQUILER OCTUBRE","fecha":"2026-10-06T10:00:00","cajaMayor":{"id":2},"proveedor":{"id":12},"numeroComprobante":"001-001-0001234","tipoBoleta":"LEGAL","fuente":"CUENTA_BANCARIA","cuentaBancariaId":2,"detalles":[{"monedaId":1,"formaPagoId":4,"monto":5000000}]}]}
```
`edit-gasto [id, data]` (no con modo 3). `anular-gasto [id, motivo]` (D): **no controla si ya estaba anulado**.

Gastos de la caja del PdV (efectivo del cajón): `get-gastos-caja [cajaId, incluirAnulados?]`, `create-gasto-caja [{cajaId, monto, descripcion, gastoCategoriaId?, monedaId?, formaPagoId?, fecha?}]` (caja ABIERTA), `anular-gasto-caja [gastoId, motivo?]`.

## Compras y proveedores

- `getProveedores []` (camelCase), `getProveedor [id]`. `createProveedor [{nombre, razon_social?, ruc?, telefono?, direccion?}]`, `updateProveedor [id, data]`.
- `get-compras-paginado [{page (desde 1), pageSize (máx 200), proveedorId?, estado?, compraCategoriaId?, credito?, fechaDesde?, fechaHasta?, search?}]` → `{items,total,page,pageSize}` con `estadoPago, cuotasPagadas, cuotasTotal, montoPagado`.
- `getFormasPago []`, `get-compra-categorias []`, `getUltimoCostoProducto [{productoId, proveedorId?}]`, `get-cuotas-pendientes-compras [{proveedorId?, monedaId?, fechaVencHasta?}]`, `get-cuentas-por-pagar [filtros?]`.

Escrituras 🔒 COMPRAS_GESTIONAR:
- **Compra rápida sin ítems** (no mueve stock): `crear-compra-simplificada [{proveedorId, monedaId, total, fechaCompra?, numeroNota?, tipoBoleta?, compraCategoriaId?, credito?, cantidadCuotas?, pagarAhora?, fuente:"CAJA_MAYOR"|"CUENTA_BANCARIA", cajaMayorId+formaPagoId | cuentaBancariaId}]`.
- **Compra con ítems** (mueve stock y costo): `create-compra-borrador [{monedaId, proveedorId, numeroNota?, tipoBoleta?, fechaCompra?, credito?, plazoDias?, detalles:[{productoId, presentacionId?, cantidad, costoUnitarioPresentacion}]}]` → `update-compra-borrador [id, data]` → `finalizar-compra [id, {formaPagoCompra?, cuentaBancariaId?, cantidadCuotas?, fechaCreditoInicio?}]`. Finalizar no paga: crea la cuenta por pagar con cuotas.
- Pagar: `pagar-cpp-cuota [{cuotaId, monto, fuente, cajaMayorId+monedaId+formaPagoId | cuentaBancariaId}]`, `pagar-cuotas-compras-lote`, `pagar-cpp-cuota-mixto`.
- `anular-compra [id, motivo]` (D): falla si el stock ya se consumió o hay cuotas pagadas.
- **No usar** `createCompra`, `updateCompra`, `createCompraDetalle`, `pagar-compra-cuota`: flujo viejo (sin detalles, sin stock, sin cuenta por pagar).

## Pago consolidado

- `get-obligaciones-pendientes [concepto, {beneficiarioId?, monedaId?}]` — conceptos COMPRA, GASTO, VALE, LIQUIDACION_SUELDO, COBRO_CLIENTE.
- `registrar-pago-consolidado [{concepto, items:[{origenId, monto}], lineas:[{fuente:"CAJA_MAYOR"|"CUENTA_BANCARIA", monedaId, formaPagoId?, cajaMayorId?, cuentaBancariaId?, monto, cotizacion?}], observacion?}]`. Permiso según concepto.
- `anular-pago-consolidado [pagoId, motivo?]` (D).

## Cajas del PdV, Caja Mayor y monedas

- `get-cajas-abiertas []` (quién abrió: `createdBy`; no hay `responsable`). `get-cajas-selector [{desde?, hasta?, limite?}]` (preferir a `get-cajas`, que trae todo el histórico).
- Totales de una caja: `getResumenCaja [cajaId]` → `caja, conteoApertura, ventasPorFormaPago, esperadoPorMoneda, diferenciaPorMoneda, gastos, egresos, retiros, delivery`. Liviano: `getVentasTotalByCaja [cajaId]`. **No existe `get-resumen-caja`.**
- Delicados (no tocar sin OK): `create-caja`, `update-caja` (cerrar: solo quien la abrió y sin ventas abiertas), `finalizar-ajuste-caja`, `delete-caja`.
- Caja Mayor: `get-cajas-mayor []` (con `saldos`), `get-caja-mayor-saldos [id]`, `get-caja-mayor-movimientos [id, {fechaDesde?, fechaHasta?, tipoMovimiento?, page?, pageSize?}]`, `get-retiros-caja`, `ingresar-retiro-caja [retiroId, cajaMayorId]`, `create-entrada-varia [{destinoTipo, cajaMayorId|cuentaBancariaId, monedaId, formaPagoId, monto, entradaVariaCategoriaId, descripcion, fecha?}]`.
- Resúmenes: `get-caja-mayor-cpp-resumen []`, `get-caja-mayor-cpc-resumen []`, `get-dashboard-caja-mayor-kpis ['month']`, `get-dashboard-financiero-kpis []`.
- Monedas: `get-monedas []` (activas), `getMonedas []` (todas), `getMonedaPrincipal []`, `get-monedas-cambio []`, `get-valor-en-moneda-principal [monedaId, valor]`, `get-cotizacion-mercado []`.

## Nombres equivocados que circularon (NO existen)

| Incorrecto | Correcto |
|---|---|
| getCuentasBancarias | `get-cuentas-bancarias` |
| getOperacionesFinancieras / createOperacionFinanciera | `get-operaciones-financieras` / `create-operacion-financiera` |
| getGastos / createGasto | `get-gastos` / `create-gasto` |
| getCajasMayor / getCajaMayor | `get-cajas-mayor` / `get-caja-mayor` |
| getCategoriasGasto / get-categorias-gasto | `get-gasto-categorias` |
| get-proveedores | `getProveedores` |
| get-compras | `get-compras-paginado` |
| get-formas-pago | `getFormasPago` |
| get-resumen-caja | `getResumenCaja` |
| getCajasAbiertas | `get-cajas-abiertas` |
