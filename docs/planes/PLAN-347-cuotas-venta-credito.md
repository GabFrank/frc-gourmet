# PLAN #347 — Anular venta a crédito cancela también las cuotas de su CPC

## Problema
Al cancelar una venta a crédito, la CPC pasa a CANCELADO pero sus cuotas quedan
PENDIENTE (igual que `cancelar-cuenta-por-cobrar` antes de #346). Tras #346 los
resúmenes filtran `cpc.estado = ACTIVO`, pero cualquier consulta que filtre solo
por `cuota.estado` las volvería a sumar.

Sitios que pasan una CPC a CANCELADO (grep `CuentaPorCobrarEstado.CANCELADO`):
1. `electron/handlers/cuentas-por-cobrar.handler.ts` — `cancelar-cuenta-por-cobrar` (ya cancelaba cuotas, #346).
2. `electron/handlers/ventas.handler.ts` — `updateVenta` → CANCELADA (A-01).
3. `electron/utils/venta-reversa.utils.ts` — `cancelarVentaCompletaEnTx` (rechazo de pedido online / reversa completa).

## Cambio
- Helper `electron/utils/cpc-cuotas.utils.ts::cancelarCuotasAbiertasDeCpc(manager, cpcId)`:
  UPDATE de cuotas PENDIENTE/PARCIAL → CANCELADO de esa CPC, con el manager de la transacción.
- Se llama en los 3 sitios, dentro de la misma transacción que cancela la CPC.
  En los 3 ya se valida `montoCobrado = 0` antes, así que no hay cuotas con cobros
  (PARCIAL queda incluido por consistencia con #346; COBRADO nunca se toca).
- Sin migración ni arreglo retroactivo: las CPC ya canceladas con cuotas PENDIENTE
  quedan como están (los filtros de #346 ya las excluyen).

## Pruebas
- `test:cpc-cancelada-cuotas` sección [E]: el helper cancela solo cuotas abiertas de esa
  CPC (COBRADO intacta, otra CPC intacta) + guardia estática: en cada archivo, cada
  `estado = CuentaPorCobrarEstado.CANCELADO` tiene su `await cancelarCuotasAbiertasDeCpc(`.
- Prueba real en clon de la copia de Don Franco (PG): `updateVenta` CANCELADA de una venta
  a crédito y `cancelarVentaCompletaEnTx` de otra → CPC y cuotas CANCELADO, saldo del cliente revertido.
- check, test:all (línea base 9 suites), CI 4/4.

## Riesgo
Bajo: un UPDATE adicional en una transacción existente; si falla, la cancelación entera
hace rollback (comportamiento correcto). No cambia pantallas.
