# Auditoría del diff #325/#240 — eje paridad de driver SQLite/Postgres

Diff: `git diff origin/develop...HEAD`. Sólo lectura; no se ejecutaron tests.
Leyenda: [R] regresión introducida por el diff, [P] preexistente.

## Resumen
No hay hallazgos ALTA. 2 MEDIA, 3 BAJA. Los puntos pedidos sin riesgo están justificados al final.

## Hallazgos

### M1 [R-parcial] En Postgres el lock de la venta NO excluye al cobro: la validación puede quedar vieja
`electron/handlers/facturacion.handler.ts:361-366` toma FOR UPDATE de `ventas`, pero los escritores que cambian el total
(`registrarCobroParcial`, `ventas.handler.ts:4756-4775`, y los cambios de ítems/pago) NO bloquean la fila de `ventas`
(grep de `setLock`/`lock:` en `electron/`: sólo `venta-reversa.utils.ts:104` y `delivery.handler.ts:523` bloquean `ventas`).
Escenario (PG, READ COMMITTED): create-factura valida la propuesta (lee `pagos_detalles`, `venta_items`), un cobro
agrega un DESCUENTO/AUMENTO y commitea, la factura commitea con el total viejo. El lock sólo protege contra OTRA factura
y contra `venta-reversa`/delivery, no contra cobro/edición de ítems.
En SQLite el mismo hueco existe (ver M2). Propuesta: documentar que el lock es contra doble emisión y no contra edición
concurrente; o bien `SELECT ... FOR SHARE` de la venta en los handlers de cobro (cambio mayor, fuera de este fix).
Severidad MEDIA (ventana corta; el cajero ve la venta cerrándose).

### M2 [R-amplificada, base P] SQLite: `withFacturaLock` sólo serializa contra otras facturas
`facturacion.handler.ts:350`. TypeORM 0.3.21 + sqlite3 = una conexión/queryRunner (AbstractSqliteQueryRunner mantiene
`transactionDepth` compartido, líneas 69-115: transacción anidada -> SAVEPOINT; commit/rollback manipulan el contador común).
`dataSource.transaction()` de create-factura puede intercalarse con `createVenta` (`ventas.handler.ts:1100`),
`registrarCobroParcial` (queryRunner, 4756) o `transferir-venta-pdv` (3054), que NO pasan por este candado: se comparte la
transacción física, y un ROLLBACK de una (p. ej. `FacturaInvalidaError`) puede descartar o liberar savepoints de la otra
(el riesgo que describe `tx.utils.ts`). Ya pasaba en develop (create-factura usaba `dataSource.transaction` sin candado),
pero el diff agranda la superficie: (a) agrega ~6 awaits de lectura dentro de la transacción (validación), (b) agrega rutas de
rechazo frecuentes (`throw` -> rollback) que antes eran raras.
Propuesta (BAJO costo, coherente con el repo): en SQLite no abrir transacción explícita (`enTransaccionSiPostgres`), o hacer
la validación y el cálculo FUERA de la transacción y abrir ésta sólo para numerar+insertar; el rechazo ocurre entonces sin
rollback. Con `withFacturaLock` ya no hay otro escritor de facturas, así que la atomicidad la da el candado.
Alternativa: que cobro/createVenta tomen también un candado de proceso común. MEDIA.

### B1 [P] `facturas.venta_id` no tiene índice único parcial
`migrations/1782519234187-AddFacturacion.ts:132` crea `idx_facturas_venta` NO único. La unicidad "una EMITIDA por venta"
descansa sólo en lock + chequeo (`facturacion.handler.ts:376`). Con dos procesos sobre el mismo SQLite o dos nodos sin
PG la garantía no existe; en PG el FOR UPDATE de la venta la cubre. Propuesta: índice único parcial
`WHERE estado='EMITIDA' AND venta_id IS NOT NULL` (ambos drivers lo soportan) en migración aparte. BAJA.

### B2 [P/R] El `setTypeParser(1700)` es global y sólo se registra en `main.ts:116`, dentro de `buildDbOverride`
No hay otro lugar (grep: sólo `main.ts`; los comentarios en `resumen-caja.utils.ts:129`, `delivery.handler.ts:159`
confirman que el repo asume strings). Cualquier camino que cree el DataSource sin pasar por ahí (scripts, `db-config.handler.ts`
test/cambio de conexión) devuelve decimales como string. El diff es robusto: todo `decimal` pasa por `Number()`:
`factura-venta.utils.ts:101,111,119,127,192-193,293-294,308-309,315`, y `precioUnitarioNetoItem` (`venta-total.utils.ts`).
Residuos: `calcularTotalesFactura` (`src/app/shared/utils/factura-totales.util.ts`) debe castear `cantidad`/`precioUnitario`
del payload (llegan por JSON, números) — verificado en la lectura de `armarFacturaDesdeVenta` que le pasa números ya
casteados. `descripcionItem` no suma. OK. Sugerencia: test del worker PG sin parser (el script de PG tampoco lo registra, así
que ya cubre el caso string). BAJA / informativa.

### B3 [R] Lock de timbrado: relectura sin lock y sin `Number` del `numeroActual`
`facturacion.handler.ts:408-426`: tras el FOR UPDATE de `td`, `detalleRepo.findOne` relee la fila (misma transacción, OK).
`numeroActual`, `rangoDesde/Hasta` son `int` (entidad `timbrado-detalle.entity.ts:37`) -> number en ambos drivers; pero
`manual` se castea con `Number`, bien. Sin riesgo real salvo que una migración cambie el tipo a bigint (PG devolvería string
y `Math.max(string, n)` coerciona bien, `padStart` también). BAJA, sólo anotación.

## Puntos pedidos sin riesgo

- **where sobre relaciones y enums**: `venta: { id }`, `ventaItem: { id: In(...) }`, `pago: { id }` y `estado: EstadoVentaItem.ACTIVO`
  / `EstadoFactura.EMITIDA` son columnas FK (`venta_id`, ...) y `varchar` con valores string en ambos drivers. TypeORM genera el
  mismo SQL salvo el casting de parámetros ($1 vs ?). El patrón `venta: { id }` ya se usa en develop (`ventas.handler.ts:3181`).
  `activo: true` y `principal: true` se parametrizan: SQLite 1 / PG boolean. Sin riesgo.
- **FOR UPDATE e issue #258**: `createQueryBuilder('v').setLock(...).where(...).getOne()` sin `leftJoin` explícito. Búsqueda de
  `eager: true` en `src/app/database/entities`: sólo `receta-presentacion.entity.ts:32`, ni `Venta` ni `TimbradoDetalle` son
  eager, así que no hay LEFT JOIN implícito (y los `QueryBuilder` no cargan eager de todos modos). Las relaciones se cargan
  después (`relations: ['timbrado']`), con la fila ya bloqueada. Mismo patrón que `findConLock` (`pago-consolidado-adapters.ts:132`).
  En SQLite el bloque `if (esPostgres)` evita `setLock`, que sqlite no soporta. OK.
- **Orden de locks**: create-factura toma venta -> timbrado. Ningún otro handler bloquea `timbrado_detalles` (`numeroActual` se
  escribe sólo en `facturacion.handler.ts` y `factura-venta.utils.ts`, ésta sólo lo menciona en un comentario). Los que bloquean
  `ventas` (`venta-reversa.utils.ts:104`, `delivery.handler.ts:523`) no toman timbrado ni facturas. Dos facturas de ventas distintas
  con el mismo timbrado: ambas toman venta propia y luego el mismo timbrado en el mismo orden -> espera, no deadlock. Sin deadlock posible.
  Nota: `anular-factura` (línea 496) no es transaccional ni bloquea; no participa de ciclos.
- **Texto vs fechas/estado/venta_id**: nada se compara como texto. `venta_id` es integer, `estado` es igualdad de string constante,
  `fecha`/`fechaAnulacion` sólo se escriben (`new Date()`), no se filtran en este diff.
