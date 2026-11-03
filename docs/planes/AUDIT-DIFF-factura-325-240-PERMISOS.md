# Auditoría del diff #325/#240 — eje Seguridad y permisos

Diff: `git diff origin/develop...HEAD`. Archivos clave: `electron/handlers/facturacion.handler.ts`, `electron/utils/factura-venta.utils.ts`.
Contexto: `/api/rpc` es default-allow; `get-factura-propuesta-venta` y `create-factura` no están en `BLOCKED_CHANNELS` (correcto: los usa el cajero por HTTP).

## Resumen
- `ensurePermission(FACTURACION_EMITIR)` es la primera sentencia dentro del `try` en ambos handlers (l.309 y l.322): OK.
- El control #240 sólo cubre lo que mira (venta, renglones, total). Quedan 3 bypass ALTA/MEDIA que `facturaRepo.create(factura)` / `itemRepo.create({...it})` dejan pasar porque pasan el payload entero a la entidad.

## Hallazgos introducidos por este diff

### [MEDIA] M1 - Modo "resumido" permite elegir IVA y descripción libres
`factura-venta.utils.ts:273` (`resumido`) y l.321-327. Con 1 solo renglón sin `ventaItem`, no se valida ni descripción, ni `ivaTipo`, ni `descuento`; sólo que `total` neto == total de la venta (±1 Gs).
Explotación: un cajero manda un renglón `{descripcion:'X', cantidad:1, precioUnitario: total, ivaTipo: 0}` -> la factura sale totalmente exenta (IVA 0) con total correcto. Evasión de IVA / comprobante que no dice lo que se vendió. También puede elegir `descuento` arbitrario con un precio mayor.
Propuesta: en resumido exigir `ivaTipo` 10 y `descuento == 0` (o, mejor, recalcular gravada/IVA en el servidor desde `propuesta` y descartar los renglones del payload: guardar `propuesta.lineas` y no lo que llega).

### [MEDIA] M2 - Oráculo de información de ventas ajenas vía mensajes de error
`factura-venta.utils.ts:286, 299, 325`; `facturacion.handler.ts:381`. `ventaId` lo elige el cliente y no hay scoping por caja/usuario/sucursal. Mensajes:
- `La factura (X) no coincide con la venta (₲ T)`: enviando `items:[]` para cualquier `ventaId` devuelve el total de esa venta.
- `«desc» no coincide con la venta: se cobró N × precio (IVA)`: descripción/cantidad/precio de un ítem si se adivina su `ventaItemId` (ids secuenciales).
- `El ítem N no pertenece a la venta V`: existencia de ítems.
- `La venta ya tiene la factura <numeroCompleto>`: número de factura de la venta.
Impacto bajo (mismo dato ya sale por `get-factura`/`get-facturas` sin permiso, ver P1), pero son rutas nuevas de lectura. Propuesta: mensajes sin cifras de la venta en el camino de error del servidor (log interno con detalle, al cajero "no coincide con la venta, recargá la propuesta"); el diálogo ya tiene la propuesta para mostrar la diferencia.

### [BAJA] B1 - `get-factura-propuesta-venta` lee cualquier venta
`facturacion.handler.ts:307-319`. Devuelve sólo `FacturaPropuesta` (descripciones, cantidad, precio neto, IVA, `productoId`, `ventaItemId`, delivery, recargo/descuento del cobro, totales). NO expone costos, recetas, datos de Persona/Cliente ni entidades hidratadas: bien. Exige `FACTURACION_EMITIR` (cajero y admin), más estricto que los demás canales de lectura de ventas (que no piden permiso, ver P1). Sin filtro por venta/caja/estado: cualquier EMITIR enumera ids y ve todas las ventas (incl. de otras cajas/días, ya facturadas, canceladas). Riesgo bajo por coherencia con el resto; si se quiere cerrar: rechazar ventas ya facturadas/canceladas y registrar. `Number(ventaId)` con NaN produce "La venta NaN no existe" (inofensivo). Mensaje de "no existe" es oráculo de existencia de ids (trivial).

### [BAJA] B2 - Cola global `withFacturaLock` sin timeout (DoS autenticado)
`factura-venta.utils.ts:341`, uso en `facturacion.handler.ts:350`. La cola es por proceso, la sección crítica incluye `FOR UPDATE` (Postgres, sin `lock_timeout`/`statement_timeout`), N consultas de validación y un `save` por renglón. Un payload con decenas de miles de renglones (no hay tope en `items`) o `FOR UPDATE` bloqueado por otra sesión larga (cobro en curso sobre la venta) deja a todas las emisiones esperando. No hay payload que cuelgue indefinidamente (sin loops ni awaits externos; `release` está en `finally`; una excepción no rompe la cadena), así que es "lentitud" y no deadlock. Requiere usuario con `FACTURACION_EMITIR`. Propuesta: tope de renglones (p.ej. 200) antes de tomar el lock, y en Postgres `SET LOCAL lock_timeout = '5s'` dentro de la transacción. Además, el orden de locks venta -> timbrado_detalle debería verificarse contra otros handlers que toquen ambos (riesgo de deadlock, no encontré caso).

### [BAJA] B3 - `id` numérico/array en `venta.id`
`facturacion.handler.ts:346`. `Number(factura.venta.id ?? factura.ventaId) || null`: si `venta.id` es `[5]` o `"5 "`, `Number` da 5 (se valida contra la venta 5) pero `facturaRepo.create(factura)` conserva el valor crudo para el FK. Con valores no numéricos (`"abc"`, `0`) `ventaId` queda `null` y se salta toda la validación, aunque luego el FK falle (SQLite con FK ON / Postgres rechazan), por lo que no es explotable hoy; es frágil. Propuesta: tras validar, forzar `f.venta = { id: ventaId }` y `delete f.ventaId`; rechazar si `factura.venta.id` y `factura.ventaId` difieren o si hay venta declarada pero no numérica.

### [BAJA] B4 - Descripción/producto de renglones vinculados no se validan
`factura-venta.utils.ts:282-301`. Para renglones con `ventaItem` se chequea cantidad, precio, IVA, pero `descripcion`, `producto`, `unidadMedida`, `descuento` (de línea) se guardan tal cual (`itemRepo.create({...it})`, l.437). El comprobante puede decir otro producto con el mismo monto. Propuesta: sobrescribir `descripcion` y `producto` con los de la propuesta.

## Bypass del control #240 (checklist pedido)

| Vector | Resultado |
|---|---|
| `factura.ventaId` vs `factura.venta.id` | `venta.id` gana (`??`). `ventaId` no es columna; `create()` lo ignora. Si difieren se valida la de `venta.id`, que es la que se guarda: consistente. Ver B3 para casos no numéricos. |
| `factura.venta` objeto con otros campos | `Venta` no tiene cascade desde `Factura`, no se actualiza la venta. OK. |
| `items[].ventaItemId` vs `ventaItem.id` | `ventaItem.id ?? ventaItemId` se valida; la entidad sólo usa `ventaItem` -> si ambos vienen, se valida `ventaItem.id`, que es el que se guarda. OK. Con `ventaItem.id` no numérico y `ventaItemId` válido: se valida el segundo pero se guarda el crudo (FK falla). Sin impacto práctico. |
| Omitir la venta (`venta`/`ventaId` ausentes) | **Sin ningún control**: factura libre con sólo totales recalculados desde los renglones. Es un uso legítimo (factura sin venta) pero hace que #240 sea opt-in: un cajero deshonesto no declara la venta. Ver A1. |
| `items[].factura` | Se pisa con `factura: saved` (después del spread). OK. |
| `items[].id` | **ALTA (A2)**, ver abajo. |
| `factura.id` | **ALTA (A2)**. |
| `factura.estado` / `motivoAnulacion` / `fechaAnulacion` | **ALTA (A3)**. |
| `numeroFactura`/`numeroCompleto`/`timbradoDetalle` a mano | Con `timbradoDetalleId`/`timbradoDetalle.id` se pisan (l.416-426). Sin detalle, se guardan tal cual: numeración arbitraria/repetida (A4). |
| `numeroManual` fuera de rango | Rechazado por el chequeo de rango (l.419). Repetido: **no hay unicidad** (ni índice en migración `AddFacturacion`, ni consulta). No entero (1.5): pasa, ensucia `numeroActual` (2.5). Ver A4. |
| `anular-factura` + reemisión | Flujo permitido: la `otra` EMITIDA ya no existe, se reemite consumiendo número nuevo; correcto. `anular-factura` exige `FACTURACION_ANULAR`, pero ver A3 (EMITIR puede evitarlo). |

## Hallazgos PREEXISTENTES (el diff no los introduce pero #240 no los cierra)

### [ALTA] A2 - `factura.id` / `items[].id` en el payload: UPDATE de comprobantes existentes
`facturacion.handler.ts:392` (`facturaRepo.create(factura)`) y `:437` (`itemRepo.create({...it})`). `create()` conserva `id`; `save()` hace UPDATE si existe. Un usuario con sólo `FACTURACION_EMITIR` puede mandar `factura.id = <factura ajena>` y reescribir venta, totales, cliente y estado de una factura ya emitida (la validación sólo mira el payload contra la venta del payload, no contra la factura que está pisando; el chequeo `otra` sólo ve EMITIDAs de *esa* venta). Con `items[].id` mueve/pisa FacturaItem de otras facturas (`factura: saved` reasigna el renglón). Se consumió además un número de timbrado nuevo.
Propuesta (tras `create()`): `delete factura.id`, y para cada renglón `delete it.id`, `delete it.createdAt/updatedAt/createdBy/updatedBy`; mejor construir la entidad con una lista blanca de campos (`pick`).

### [ALTA] A3 - `factura.estado = 'ANULADA'` / `motivoAnulacion` desde EMITIR
Mismo punto. Se puede emitir ya ANULADA (se salta `FACTURACION_ANULAR`), o con A2 anular una factura ajena sin el permiso de anulación. Propuesta: forzar `f.estado = EMITIDA; f.motivoAnulacion = null; f.fechaAnulacion = null` en create.

### [MEDIA] A4 - Numeración
`facturacion.handler.ts:417-426`. (a) `numeroManual` repetido: dos facturas con el mismo `numeroCompleto` (no hay UNIQUE ni verificación). (b) `numeroManual` no entero (1.5) corrompe `numeroActual`. (c) `numeroManual = rangoHasta` salta todo el rango (`Math.max`): agota el timbrado con una sola llamada. (d) Sin `timbradoDetalleId`, `numeroFactura`/`numeroCompleto` libres. (e) No se verifica vigencia/activo del timbrado ni que el `cdc` sea propio. Propuesta: `Number.isInteger`, existencia previa de `(timbradoDetalle, numeroFactura)` dentro del lock, sólo permitir `numeroManual` para `PRE_IMPRESO`, borrar `numeroFactura/numeroCompleto/cdc` del payload cuando no hay detalle (o rechazar), y restringir saltos (p.ej. manual <= numeroActual + margen).

### [MEDIA] A1 - #240 es opt-in
Ver tabla: sin `venta` en el payload no hay control. Si el requisito es "una factura de la caja no puede diferir de la venta" para el rol cajero, hace falta un permiso separado para facturas libres (p.ej. `FACTURACION_EMITIR_LIBRE`) o exigir `ventaId` salvo ese permiso.

### [BAJA] P1 - Lecturas de facturas/ventas sin permiso
`get-factura` (l.265, con `relations ... 'venta'`) y `get-facturas` (l.244) no piden permiso: cualquier usuario autenticado por HTTP lee facturas y la venta hidratada. Los canales `get-*` de ventas en general siguen esa convención (permiso sólo en mutaciones). El canal nuevo es más restrictivo que ellos. Propuesta aparte: `FACTURACION_VER`.

### [BAJA] P2 - Resolución de cliente fuera de la transacción
l.325-343: crea/actualiza `Cliente` por RUC antes de validar la factura; una factura rechazada por #240 igual deja un cliente creado. Efecto menor (datos), pero es escritura previa a la validación. Propuesta: validar venta/total antes de resolver cliente, o aceptarlo documentado.

## Puntos revisados sin riesgo
- Fuga en errores: los errores de `ensurePermission` salen antes de tocar datos. `FacturaInvalidaError` no incluye datos de otra venta salvo lo listado en M2.
- Atomicidad: locks `FOR UPDATE` sin relaciones (Postgres) y `withFacturaLock` (SQLite, una conexión); `validar` corre antes de consumir número (rechazo no quema número). `release` en `finally`.
- Los montos del payload (`gravada*`, `iva*`, `total`, `descuento`, `items[].total`) se pisan en el servidor (l.390-402, 437): no se puede forzar un total.
- Bundle de producción: `package.json` `build.files` es lista blanca (`dist`, `main.js`, `preload.js`, `electron/**/*.js`, `src/app/database/**/*.js`, `src/app/shared/**/*.js`, `node_modules`). `scripts/` no está incluido y `tsconfig.electron.json` sólo compila `main.ts`/`preload.ts` (+imports), así que `scripts/_factura-pg-worker.ts` no entra al bundle. `src/app/shared/utils/factura-totales.util.js` sí entra (hace falta: lo importa el handler). Riesgo: ninguno.
- `BLOCKED_CHANNELS`: los dos canales deben quedar permitidos; no se agregó nada que deba bloquearse.

## Prioridad sugerida
1. A2+A3 (sanear `id`, `estado`, `motivoAnulacion` y campos de auditoría en factura e items) - cambio mínimo y de alto valor.
2. M1 (resumido) y B4 (descripción/producto desde la propuesta; en la práctica guardar `propuesta.lineas`).
3. A4 (numeración) y B2 (tope de renglones + `lock_timeout`).
4. M2/B1/B3 y A1 según política.
