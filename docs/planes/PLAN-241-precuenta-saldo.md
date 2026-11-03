# PLAN #241 — Pre-cuenta tras cobro parcial: mostrar PAGADO y SALDO

## Problema
`buildVentaTicketLines` (`electron/handlers/documentos-tickets.handler.ts`) imprime el TOTAL del pedido y
no resta lo ya cobrado en rondas de cobro parcial por ítems (`VentaItem.montoCubierto`). Mesa de 200.000
con 100.000 ya pagados → la pre-cuenta para los que faltan dice 200.000. El PdV sí muestra
`cobroPagado`/`cobroSaldo` (de `getEstadoCobroVentaInternal`).

## Decisión (opción B de la issue)
Solo en la **pre-cuenta** (no delivery) y solo si ya hay dinero registrado en el `Pago` de la venta
(ver Cálculo), agregar bajo el TOTAL (y antes de los totales en otras monedas):

```
PAGADO            Gs. X
SALDO             Gs. Y   (negrita)
```

- El TOTAL y las líneas de ítems **no cambian** (conciliación con factura intacta; descarta D).
- Venta sin cobros parciales → ticket idéntico al actual.
- Comprobante final (no pre-cuenta) → sin cambio (al finalizar el saldo es 0).
- Sin marcar ítems (opción C descartada: alarga el ticket).

## Cálculo (revisado tras la auditoría)
La primera versión escalaba el pendiente bruto (`montoCubierto`) por `total/deudaBruta`. Los dos
auditores la objetaron (media): da mal con un descuento global aplicado DESPUÉS de una ronda
(ventas-pdv.md: mesa 20.000, A paga 10.000, después −20 % → saldo real 6.000, la fórmula daba 8.000),
con pagos sueltos sin ronda y con sobrepago. Versión final, en **dinero**, igual que el cobro:
- `PAGADO = Σ PAGO − Σ VUELTO` activos del `Pago` de la venta, en moneda principal
  (`obtenerPagosRegistrados`, el mismo helper del ticket de delivery).
- `SALDO = max(0, TOTAL − PAGADO)`.
- Se imprime solo si `PAGADO > 0.5`. Con pagos en otra moneda sin cotización → «VERIFICAR SALDO EN CAJA»
  (mismo criterio que delivery: sin tasa la divisa cuenta 1 a 1).
- Con bloque, los totales en otras monedas pasan a `SALDO <MONEDA>` (auditoría: quien paga lo que falta
  en divisa necesita el saldo).
- Delivery queda fuera: ya imprime PAGOS REGISTRADOS y su propio saldo.
- Ronda anulada: `anularCobroParcial` hace soft-delete de sus líneas → el bloque desaparece.

## Tests
`scripts/test-ticket-venta-e2e.ts` (`test:ticket-venta`, 84/84): sin pagos, Pago sin líneas, ronda con
vuelto y línea anulada, descuento global posterior, 32 columnas, comprobante sin bloque, sobrepago,
SALDO <MONEDA>, residuo de redondeo en divisa (tolerancia = unidad mínima, como el cobro), divisa sin
cotización → VERIFICAR SALDO EN CAJA, ronda anulada → ticket idéntico al de sin pagos.

## Prueba real
Copia de Don Franco (sandbox PG): abrir venta, registrar cobro parcial por ítems (`registrarCobroParcial`),
armar la pre-cuenta y verificar PAGADO/SALDO; anular la ronda y verificar que desaparece. Copia restaurada
al estado previo (venta de prueba anulada / borrada).

## Riesgo
Bajo: solo agrega 2 líneas en la pre-cuenta cuando hay cobro parcial. No toca cobro, factura ni totales.
