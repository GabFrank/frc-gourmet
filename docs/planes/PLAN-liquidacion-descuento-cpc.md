# PLAN — Liquidación de sueldo: descuento automático de consumos a crédito (CPC) y cierre de lo descontado a mano

Fecha: 17/11/2026 · Autor: CEO FRC Gourmet · Pedido: propietario (17/11 16:59, «Arreglar el sistema y además cerrar los consumos ya descontados»).
Objetivo de entrega: en producción (alpha) antes de la liquidación de diciembre 2026 (≈ 1/12).

## 1. Problema (verificado en código develop `8c1e3045` y en producción)

`generar-liquidacion-borrador`, paso 11 (`electron/handlers/liquidacion-sueldo.handler.ts:789-822`):
- Toma cuotas CPC con `fechaVencimiento BETWEEN fechaInicio AND fechaFin` del período. En Don Franco cada consumo es una CPC de 1 cuota que vence el mismo día; RRHH genera la liquidación del mes N con período N (pagada a inicios de N+1) o con el período ya corrido, así que los consumos del mes anterior **nunca caen** en el rango → el sistema no descuenta nada.
- Usa `findOne` sobre Cliente por persona: si la persona tiene más de una ficha de cliente, solo toma la primera.
- Consecuencia: en sep, oct y nov 2026 (liquidaciones 11 a 36) RRHH cargó a mano descuentos («convenio», etc.) que cubren esos consumos, pero las CPC siguen ABIERTAS → el saldo de deudores (CPC) está inflado ~₲ 11,5 M y en diciembre, con el arreglo, se descontarían **otra vez**.
- Paso 6 (cuotas de préstamo, CPP_CUOTA) tiene el mismo `BETWEEN`: una cuota vencida y no descontada queda olvidada.
- `agregar-item-liquidacion` permite cargar CREDITO_CONSUMO a mano sin vínculo a la cuota (así se generó el desfasaje).

## 2. Cambios

### 2.1 Paso 11 (CPC) — `liquidacion-sueldo.handler.ts`
- `clienteRepo.find` (todas las fichas de la persona), no `findOne`.
- Cuotas `PENDIENTE|PARCIAL` con `fechaVencimiento <= fechaFin` (sin piso), CPC `ACTIVO`, y `(liquidacion_id IS NULL OR liquidacion_id = :lid)` (guard ya existente: no toma las reservadas por otra liquidación).
- Excluir cuotas ya referenciadas por un ítem **manual** CPC_CUOTA de esta liquidación (ver 2.3) para no duplicar.
- Orden por `fechaVencimiento, id` (ítems legibles).

### 2.2 Paso 6 (préstamos)
- `fechaVencimiento <= fechaFin`.
- CPP cuota no tiene `liquidacion_id`: guard por NOT EXISTS de un `liquidacion_item` con `referencia_tipo='CPP_CUOTA' AND referencia_id = c.id` en otra liquidación `BORRADOR|APROBADA` (una PAGADA ya dejó la cuota PAGADA). Sin migración.

### 2.3 `agregar-item-liquidacion`
- Si el concepto es CREDITO_CONSUMO y no viene `cpcCuotaIds` → error claro: «Los consumos a crédito se agregan eligiendo las cuotas abiertas (no a mano)», para no repetir el problema.
- Nuevo `data.cpcCuotaIds: number[]`: valida que cada cuota sea de un cliente de la misma persona del funcionario, esté PENDIENTE/PARCIAL, CPC ACTIVO y libre (`liquidacion_id` null o esta). Crea un ítem DESCUENTO por cuota (`manual:true`, `referenciaTipo:'CPC_CUOTA'`, `referenciaId`, saldo de la cuota) y enlaza `cuota.liquidacionId`. Al pagar, `aplicarEstadoPagoLiquidacion` ya cobra los CPC_CUOTA (manuales o no) → sin cambios ahí.
- Regenerar borrador: el desenlace C-04 libera todas las cuotas de esta liquidación; después re-enlazar las de ítems manuales CPC_CUOTA que siguen.
- `eliminar-item-liquidacion`: si el ítem es CPC_CUOTA, liberar `cuota.liquidacionId`.
- Lectura nueva `get-cpc-cuotas-abiertas-funcionario [funcionarioId, liquidacionId?]` (permiso RRHH_LIQUIDACION_VER o el que use get-liquidacion-sueldo) para el selector.
- UI: en el detalle de la liquidación, botón «Agregar consumos a crédito» → diálogo con las cuotas abiertas (fecha, descripción, saldo, casillas) que llama a `agregar-item-liquidacion` con `cpcCuotaIds`. Concepto CREDITO_CONSUMO sale del selector de ítem manual libre.

### 2.4 Método nuevo `cobrar-cpc-por-liquidacion` (cierre de lo ya descontado a mano)
`params: [{ liquidacionId, itemId, cuotas: [{ cuotaId, monto? }], observacion? }]`
- Permiso: RRHH_LIQUIDACION_PAGAR (el mismo que paga la liquidación). Transacción única.
- Valida: liquidación `PAGADA`; `itemId` es un ítem **manual DESCUENTO sin referencia** de esa liquidación (el «convenio» cargado a mano); cada cuota es de un cliente de la persona del funcionario, PENDIENTE/PARCIAL, CPC ACTIVO, sin `liquidacion_id` de otra liquidación; `monto` (default = saldo de la cuota) `> 0` y `<=` saldo.
- **Tope:** suma de lo cobrado contra ese ítem (movimientos ya registrados con ese `liquidacion_item_id`) + lo nuevo `<=` monto del ítem. Si se pasa → error con el disponible.
- Efecto por cuota (misma lógica que el cobro al pagar la liquidación, extraída a una función común): `montoCobrado`, estado COBRADO/PARCIAL, `fechaCobro`, `cpc.montoCobrado`/estado, `saldoActual` del cliente, `MovimientoCliente PAGO` con observación `LIQUIDACION <periodo> #<id> - DESCUENTO MANUAL ITEM #<itemId> - COBRO CUOTA #n`. **No mueve Caja Mayor** (el dinero ya quedó neteado en el EGRESO_SALARIO de esa liquidación).
- Enlace: COBRADO → `cuota.liquidacionId = liq.id`. PARCIAL → `liquidacionId` queda null para que el resto lo tome la próxima liquidación (diferencias como Fermina sep+oct).
- Migración: columna nullable `liquidacion_item_id int` en `movimiento_cliente` (+ índice). Se setea también en los cobros normales al pagar una liquidación (trazabilidad).
- Devuelve `{ liquidacionId, itemId, cobrado, disponibleItem, cuotas:[{cuotaId, estado, montoCobrado}] }`.
- **Anular** una liquidación PAGADA: además de los CPC_CUOTA, revertir los movimientos con `liquidacion_item_id` de sus ítems (cuota, CPC, saldo cliente, borrar el movimiento).
- Agregar el método a la lista de lecturas/escrituras de la API web y a la página `gourmet-api-guia`.

## 3. Orden de operación en producción (riesgo de doble descuento)
1. Merge → alpha → Don Franco actualizada.
2. El Gerente cierra con `cobrar-cpc-por-liquidacion` (con aprobación) los consumos ya descontados a mano de sep–nov, liquidación por liquidación, según el PDF ya cruzado. Backup JSON antes.
3. Recién ahí RRHH genera las liquidaciones de diciembre. El borrador ahora muestra cada consumo abierto: si apareciera algo ya descontado, RRHH lo elimina del borrador antes de aprobar.
Se avisa al Gerente/RRHH de este orden con el método publicado.

## 4. Pruebas
- Unitarias/integración (jest, Postgres de la estación) nuevas en `liquidacion-sueldo`:
  - paso 11 toma cuotas vencidas antes del período, de 2 fichas de cliente, y no toma las reservadas por otra liquidación ni las COBRADO/CANCELADO;
  - regenerar borrador no duplica ni fuga cuotas (incluye ítem manual CPC_CUOTA);
  - paso 6 toma cuota vencida de un mes anterior y no la que está en otro BORRADOR;
  - agregar-item: rechaza CREDITO_CONSUMO libre; con cpcCuotaIds crea y enlaza; eliminar libera;
  - pagar liquidación cobra ítems manuales CPC_CUOTA;
  - cobrar-cpc-por-liquidacion: rechaza si no PAGADA, ítem con referencia, cuota de otra persona, tope excedido; parcial deja PARCIAL sin enlace; total deja COBRADO enlazado; saldo cliente baja; no crea movimiento de Caja Mayor; anular revierte.
- Copia de Don Franco (`donfranco_copia`, estación): generar borrador de 2026-12 de 2 funcionarios con consumos (antes y después de cerrar con el método 5) y comparar contra el cruce del Gerente; cerrar con el método 5 los de Fermina sep+oct y verificar saldo CPC.
- UI (modo oscuro, copia local): diálogo de consumos a crédito en el detalle de liquidación, capturas al propietario.
- No toca cobro de ventas, factura ni punto de venta: no aplica la prueba de cobrar/facturar. Sí toca pago de liquidación (EGRESO_SALARIO): se prueba pagar una liquidación con ítems CPC en la copia y verificar que el movimiento de Caja Mayor sea el neto.
- Gates: build, check, suites tocadas en desarrollo; test:all una vez al final (sin sumar fallas a la línea base).

## 5. Riesgos
- Doble descuento en diciembre si no se cierra antes lo de sep–nov → orden del punto 3 + revisión del borrador.
- Borradores de diciembre más largos (todas las cuotas abiertas viejas) → esperado; es la deuda real.
- Cobro por método 5 contra el ítem equivocado → tope por ítem, validación de persona, aprobación del propietario en cada carga y reversa por anulación.
- Migración aditiva (columna nullable) → sin riesgo de datos.

## 6. Vuelta atrás
- Revertir el PR (squash) en develop → nueva alpha. La columna nueva queda sin uso (inofensiva); la migración tiene `down`.
- Un cobro por método 5 mal hecho no se puede deshacer anulando la liquidación (ya está pagada y anularla revierte el sueldo). Se agrega reversa puntual: `revertir-cobro-cpc-por-liquidacion [{ movimientoClienteId }]` (mismo permiso), que deshace un movimiento creado por el método 5.

## 7. Rama y entrega
`fix/liquidacion-descuento-cpc` desde develop. PR «fix(liquidacion): descontar consumos a crédito vencidos y cerrar los descontados a mano». CI verde, OK del propietario, squash-merge.
Estimado: implementación + pruebas 2 noches; PR listo para OK ~20/11; en producción ~21/11 (antes de diciembre con margen).
