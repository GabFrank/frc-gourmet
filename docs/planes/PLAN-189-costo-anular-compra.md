# PLAN #189 — Revertir el costo promedio al anular una compra

**Decisión del propietario (14/11/2026, opción A):** al anular una compra finalizada,
- si es la **última** compra que movió el costo del producto → el costo vuelve **exacto** al que tenía antes;
- si hubo compras (u otros cambios de costo por compra) **después** → el costo se **recalcula desde cero** con las compras vigentes (no anuladas).

## Hoy
`anular-compra` (electron/handlers/compras.handler.ts) revierte stock, caja y CPP, pero no el costo: el producto queda con el
`precio_costo` activo que dejó la compra anulada (nota A-03 en el código). Ese costo alimenta CMV, recetas y la clasificación de compras.

## Cambio

### 1. Snapshot al finalizar (migración aditiva PG + SQLite)
`compras_detalles` suma dos columnas nullable, sin FK física:
- `precio_costo_id`: el `precio_costo` que creó esta línea al finalizar.
- `precio_costo_previo_id`: el `precio_costo` que estaba activo justo antes (null si no había).

`aplicarCostoPromedioPonderado` devuelve `{ previoId, nuevoId }` y `finalizar-compra` los guarda en la línea.
Migración idempotente (`addCol` como en ClasificacionItemsCompra). Sin backfill: las compras viejas no tienen snapshot.

### 2. Al anular (`anular-compra`, dentro de la misma transacción, después de revertir el stock)
Por cada producto de la compra (agrupando líneas del mismo producto, recorridas en orden inverso de id):
- **Exacto:** si el `precio_costo` activo del producto es el `precio_costo_id` de la última línea de esa compra para ese producto
  (nadie movió el costo después) → se desactiva el/los `precio_costo` creados por la compra y se reactiva
  `precio_costo_previo_id` de la primera línea (si era null, el producto queda sin costo activo, como estaba antes).
- **Costo manual o de receta posterior:** si el activo NO es de fuente COMPRA (lo cargó alguien a mano o una receta) → no se toca; se
  devuelve un aviso. Un costo cargado a mano después pesa más que el recálculo.
- **Recalcular desde cero:** en cualquier otro caso (hubo compras posteriores, o la compra es vieja sin snapshot) → se reproduce el
  promedio ponderado con las compras vigentes del producto:
  - Productos que controlan stock: se recorren sus `stock_movimiento` en orden de id, **excluyendo** los de compras anuladas
    (el COMPRA original y su AJUSTE «ANULACION COMPRA #n»), incluida la que se está anulando. Stock arranca en 0 y costo en null;
    cada movimiento COMPRA de una compra vigente aplica la misma fórmula que `aplicarCostoPromedioPonderado`
    (stock ≤ 0 o costo null → costo de la compra; si no, ponderado) con el costo en unidad base de su línea; los demás movimientos
    suman/restan stock con la misma tabla de signos que `getStockActualUnidadBase`.
  - Productos sin control de stock: el costo es el de la última línea vigente (orden fecha de compra, id), igual que hoy da la fórmula con stock 0.
  - Resultado con valor → se desactiva el activo y se crea un `precio_costo` nuevo (fuente COMPRA, fecha hoy, moneda de la última compra vigente).
  - Sin compras vigentes → se reactiva el `precio_costo_previo_id` si hay snapshot; si no, el producto queda sin costo activo
    (se desactiva el que dejó la compra) y se avisa.
- Redondeo a 2 decimales, igual que hoy.

`anular-compra` devuelve además `costos: [{ productoId, modo: 'EXACTO'|'RECALCULADO'|'SIN_CAMBIO', costoAnterior, costoNuevo, aviso? }]`
(los clientes actuales solo miran `success`). Lógica en `electron/utils/costo-compra.utils.ts` (pura + acceso a BD), testeable.

### Fuera de alcance
- Sin arreglos retroactivos: las compras ya anuladas no se tocan.
- Ventas/recetas: el costo de recetas se calcula al vuelo desde el costo del producto; no se recalcula nada guardado.
- Varias monedas: la fórmula actual tampoco convierte; se mantiene igual.

## Pruebas
- `test:costo-anular-compra` (nuevo, SQLite y PG con `COSTO_PG=<base>`): última compra → costo exacto (incluido «sin costo previo»);
  compra con posterior → recalculado igual al de reproducir solo las vigentes; dos líneas del mismo producto; producto sin control
  de stock; costo manual posterior → sin cambio + aviso; compra vieja sin snapshot → recalculado; migración idempotente.
  Controles: en develop las aserciones de costo fallan.
- Suites de compras existentes (`test:clasificacion-compras` y las de compras), `tsc`, `test:all --jobs 3` (no sumar fallas).
- Prueba real en el clon de Don Franco (Postgres): finalizar y anular la última compra de un producto → costo exacto; finalizar dos,
  anular la primera → recalculado; stock vuelve. No toca cobro ni factura.

## Auditoría del plan (15/11/2026, 2 agentes): APROBADO C/OBS — aplicadas en la implementación
- **Costos MANUAL/AJUSTE_RECETA intermedios (alta, A y B):** el recálculo intercala los `precio_costo` no-COMPRA del producto con los movimientos por `created_at`; cada uno fija el costo acumulado (ancla del inventario inicial valuado a mano).
- **Varios activos a la vez (alta):** «el activo» = el de mayor id (como `getCostoActivoActual`); EXACTO y RECALCULADO desactivan todos y dejan uno; SIN_CAMBIO apaga los `precio_costo` que creó la compra anulada.
- **Orden de las líneas (alta, A):** `finalizar-compra` recorre los detalles por id; EXACTO usa la línea con mayor `precio_costo_id` y el previo de la de menor.
- **Anulaciones (media):** se excluyen en pareja el COMPRA y su AJUSTE_NEGATIVO «ANULACION COMPRA #n» (referencia = compra). Una compra cancelada con el `deleteCompra` viejo no tiene ajuste: su stock sigue contando, sin aportar costo.
- **Previo de una compra anulada:** no se reactiva un `precio_costo` que creó una compra anulada (anulaciones encadenadas); el producto queda sin costo de compra, con aviso.
- **Concurrencia PG (media, A):** `SELECT … FROM producto … FOR UPDATE` en finalizar y anular, en orden de id.
- **Fecha del recalculado (baja, B):** la de la última compra vigente. **Monedas distintas (baja):** aviso.
- **Migración (baja, A):** filtra `table_schema = current_schema()`.
- **Recetas (baja, B):** `costo_calculado` de recetas se guarda y no se recalcula (igual que hoy al finalizar una compra).
- **Fuera de alcance, documentado:** el recálculo usa el estado actual de los movimientos (si se desactivó una venta, cuenta como si no hubiera existido); un stock reproducido ≤ 0 reinicia el costo con la compra siguiente (misma fórmula de hoy); un producto que cambió `controlaStock` pierde las compras sin movimiento en el recálculo; editar a mano un `precio_costo` de compra y después anular en EXACTO lo pisa; `updateCompraDetalle` (legacy) puede editar líneas finalizadas.
