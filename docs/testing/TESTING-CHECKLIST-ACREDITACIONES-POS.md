# Checklist manual — Acreditaciones POS por medio de pago (issue #320)

Automático: `npm run test:acreditaciones-pos-calculo` (91 boletas reales), `test:acreditaciones-pos-migracion` y `test:acreditaciones-pos-e2e` (SQLite; Postgres con `ACRED_PG=<base>`).

## Máquina POS (Bancos → Máquinas POS → Editar)
- [ ] Sin reglas: cobrar con tarjeta da el mismo esperado y fecha que antes (% y minutos de la máquina).
- [ ] «Valores observados: BANCARD» → Cargar: crea Crédito (activa, verificada) y Débito (apagada, «Sin verificar»). Cargar de nuevo no duplica.
- [ ] El ejemplo de cada regla se actualiza al cambiar valores; guardar valida rangos y no deja dos reglas del mismo medio.
- [ ] Toggle «Sumar al banco solo al vencer el plazo» se guarda.

## Cobro
- [ ] Con forma de pago con máquina POS aparece «Medio» (Crédito por defecto). Efectivo no lo muestra.
- [ ] La línea muestra «MÁQUINA · MEDIO». Reabrir el diálogo conserva el medio.
- [ ] Finalizar y facturar: ticket y factura salen igual; arqueo de caja sin cambios.
- [ ] La acreditación tiene medio, desglose y fecha esperada en días hábiles (Bancard crédito: 56.000 → 53.083, +2 hábiles).
- [ ] Cobro mixto (efectivo + tarjeta) y QR.

## Conciliación (Bancos → Acreditaciones POS)
- [ ] Con auto-acreditar apagado, lo vencido figura «VENCIDA SIN CONCILIAR» y no suma al saldo.
- [ ] «Conciliar crédito»: cuenta, fecha y monto del extracto → sugiere las del día; cambiar la selección recalcula la diferencia; conciliar suma el crédito al saldo.
- [ ] El mismo crédito no se puede conciliar dos veces.
- [ ] «Conciliaciones y resumen» → Deshacer: resta el crédito y las ventas vuelven a pendientes.
- [ ] Resumen del mes: comisiones, IVA y retenciones por máquina y medio, rotulado informativo.
