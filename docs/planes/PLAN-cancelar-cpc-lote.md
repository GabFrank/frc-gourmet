# PLAN — `cancelar-cpc-lote`: cancelar CPC en lote, sin cobrar

Pedido: propietario, 17/11/2026 (panel, vía Gerente Don Franco). Cerrar sin cobrar
(sin mover caja ni banco) todas las CPC ACTIVAS de socios (clientes 8, 52, 6, 9) y de
funcionarios de la Bodega a los que ya se les descontó allá (16, 25, 57, 31, 42, 13):
~276 CPC. Hoy solo existe `cancelar-cuenta-por-cobrar`, de a una CPC por llamada:
276 escrituras con aprobación cada una no es operable.

## Qué se cambia

1. `electron/handlers/cuentas-por-cobrar.handler.ts`
   - Se extrae la lógica de `cancelar-cuenta-por-cobrar` a una función interna
     `cancelarCpcEnTx(manager, dataSource, cpc, motivo, usuario)`: estado CANCELADO,
     fechaCancelacion, motivoCancelacion, cuotas abiertas → CANCELADO
     (`cancelarCuotasAbiertasDeCpc`, #322/#347), `saldoActual` del cliente −montoTotal
     (`ajustarSaldoCliente`, atómico) y `MovimientoCliente` AJUSTE_NEGATIVO. El handler
     viejo pasa a usarla: mismo comportamiento, mismo resultado `{success:true}`.
   - Handler nuevo `cancelar-cpc-lote`, permiso `CPC_CANCELAR`.
     Params: `[{ clienteIds?: number[], ids?: number[], motivo: string, simular?: boolean }]`.
     - `motivo` obligatorio (no vacío). Al menos uno de `clienteIds` / `ids` no vacío.
       Tope 2000 CPC por llamada (si hay más, error y no se toca nada).
     - Solo procesa CPC `ACTIVO` (soloActivas fijo). Las de `ids` que no estén ACTIVO
       o tengan `montoCobrado > 0` van a `saltadas` con su razón (`NO_ACTIVA`,
       `CON_COBROS`, `NO_EXISTE`). Nunca se cancela una con cobros.
     - Todo en UNA transacción: si falla una, no queda ninguna cancelada.
     - `simular:true`: corre exactamente el mismo código dentro de la transacción y al
       final hace rollback. Devuelve lo mismo que la real, con `simulado:true`.
     - No toca caja, caja mayor, banco ni ventas.
     - Devuelve `{ simulado, cantidadCanceladas, canceladas:[{id, clienteId, cliente,
       monedaId, monto, descripcion, fechaInicio}], saltadas:[{id, clienteId, monto,
       razon}], totalPorMoneda:[{monedaId, total, cantidad}], porCliente:[{clienteId,
       cliente, cantidad, total}] }`.
2. `preload.ts`: `cancelarCpcLote(payload)` + regenerar `api-channel-map.generated.ts`
   (web y mobile) con `node scripts/generate-mobile-api-map.js`.
3. Test `scripts/test-cpc-lote-e2e.ts` + `test:cpc-lote` en package.json.
4. Página `gourmet-api-guia`: sección del método nuevo (al publicar).

Sin migración, sin cambios de UI, sin cambios de esquema.

## Cómo se prueba

- `test:cpc-lote` (SQLite, migraciones reales): por cliente y por ids; simular no escribe
  nada (estados, cuotas, saldo, movimientos iguales); real: CPC y cuotas CANCELADO,
  saldo baja lo justo, 1 AJUSTE_NEGATIVO por CPC; salta con cobros / no activas /
  inexistentes; no toca CPC de otros clientes; motivo vacío y sin filtros → error;
  sin permiso → error; rollback total si falla a mitad; guardia estática de #347 sigue OK.
- `test:cpc-cancelada-cuotas` (regresión del handler individual).
- Copia de Don Franco (Postgres local `donfranco_copia`): simular con los 10 clientes y
  comparar contra un SELECT directo; después real sobre la copia y verificar con SQL que
  saldos y cuotas cierran. La copia es del 24/10, así que los números no serán los de hoy.
- `npm run check` y `test:all` (no sumar fallas a la línea base).
- No toca cobro, factura ni PdV: no aplica la prueba de cobrar y facturar.

## Riesgos

- Cancelar de más: mitigado con filtro explícito por cliente/ids, `simular` antes de
  aplicar (el Gerente lo muestra al propietario), solo ACTIVO y sin cobros.
- Transacción larga con 276 CPC: unas pocas centenas de UPDATE/INSERT, segundos. Tope 2000.
- Concurrencia: si alguien cobra una cuota mientras corre, el UPDATE de la CPC exige
  `estado = ACTIVO AND monto_cobrado = 0`; si no afecta fila, va a saltadas.
- Refactor del handler individual: cubierto por el test de regresión existente.

## Cómo se vuelve atrás

- Código: revert del squash-merge en develop (genera otra alpha).
- Datos: backup JSON de las CPC/cuotas/saldos antes de aplicar en producción (lo guarda
  el Gerente con la simulación). Cada cancelación deja su AJUSTE_NEGATIVO con
  `cuentaPorCobrarId` y el motivo, así que es rastreable; reactivar sería manual por SQL.
