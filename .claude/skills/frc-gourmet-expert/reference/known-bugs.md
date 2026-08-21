# Bugs conocidos sin resolver

Snapshot **2026-06**. Verificar `git log` / el código antes de afirmar que algo sigue roto. La sección de **Seguridad** está mayormente resuelta (bcrypt, JWT en keytar, permisos en backend, must-change-password) — ver detalle abajo y [architecture/auth-permissions.md](../architecture/auth-permissions.md).

## RRHH / Financiero

### Operación Financiera: campos requeridos que la UI no poblaba — RESUELTO (2026-08)

**Síntoma:** en la PWA, *Gestión de Caja Mayor → Operaciones financieras*, el
**cambio de divisa nunca se podía guardar**: "Completá los campos requeridos" sin
ningún campo marcado en rojo. Y después de alternar entre tipos de operación,
otros tipos también quedaban trabados.

**Causas (5, de la misma familia):**
1. `formaPagoDestinoId` es requerido en `CAMBIO_DIVISA` (el handler lo usa para el
   movimiento de INGRESO y `actualizarSaldo`; la columna es `nullable: false`),
   pero la PWA lo seteaba sólo si había select de **caja destino**. En un cambio
   de divisa el ingreso vuelve a la MISMA caja ⇒ no hay tal select ⇒ `null`.
   La pregunta correcta es "¿este lado mueve caja mayor?" (`LADOS_CAJA_MAYOR`),
   no "¿se muestra un select de caja?" (`CAJAS_EN_UI`).
2. Al cambiar de tipo se limpiaban las monedas pero se re-derivaban sólo desde
   `cuentaBancaria*Id.valueChanges`; con el select de cuenta sobreviviendo al
   cambio (RETIRO↔TRANSF. BANCARIA, DEPOSITO↔TRANSF. BANCARIA) la moneda quedaba
   `null` e **irrecuperable** — reelegir la misma opción en un `mat-select` no
   emite `valueChanges`.
3. Con las monedas nulas, `recalcularMontoDestino()` perdía el flag `principal` y
   multiplicaba en vez de dividir ⇒ monto convertido incorrecto.
4. Escritorio: `applyValidators()` cambiaba validadores pero nunca los VALORES ⇒
   relaciones bogus persistidas (la cuenta de un depósito adjunta a un cambio de
   divisa).
5. El mensaje era genérico y no nombraba nada, justo cuando el campo culpable no
   se renderiza.

**Fix:** la fuente única `operacion-financiera-validacion.util.ts` ahora declara
`LADOS_CAJA_MAYOR`/`CAJAS_EN_UI`/`CUENTAS_EN_UI`/`COTIZACION_EN_UI` y el invariante
`fuenteDelCampo()`; ambas superficies derivan de ahí su visibilidad y su
auto-completado, y `camposFaltantes()`/`validarCoherencia()` dan mensajes
concretos. El test `npm run test:operacion-financiera` pasó de auditar sólo las
monedas (20 asserts, pasaba **con el bug presente**) a auditar todos los campos
requeridos (122). Detalles → [../domains/financiero-caja-mayor.md](../domains/financiero-caja-mayor.md).

### `test:pedidos-online` — 1 assert rojo en develop (pendiente)

`✗ pedido.crear sin token → 401` falla en `develop` limpio (70 passed, 1 failed),
sin relación con caja mayor. Verificado en worktree sobre `origin/develop` el
2026-08-21. Si vas a tocar pedidos online, arrancá sabiendo que ese assert ya
está rojo.

### Liquidaciones mezclan monedas (multimoneda) — pendiente

**Síntoma:** en el cálculo de liquidación de sueldo y final, un vale/cuota en USD/BRL se netea/suma contra haberes en PYG como si fuera la misma moneda (ej. un vale de 100 USD "cancela" 100 Gs de haberes).

**Causa de raíz:** `LiquidacionItem` y `LiquidacionFinalItem` **no tienen columna de moneda** — al copiar un vale/cuota a un item se pierde su identidad de moneda, y `recalcularTotales` suma `Number(monto)` crudo. Ningún handler de liquidación importa `MonedaCambio`.

**Estado (2026-07):** la **capa de resumen/agregación** ya está arreglada (PR #198): `get-funcionario-resumen-financiero` y `dashboard-rrhh.totalNominaMes` convierten a PYG con `electron/utils/moneda.utils.ts` (`convertirAPrincipal`). El **cálculo interno de liquidación** sigue pendiente — requiere **migración** (agregar moneda + cotización a los items) + **decisión de política**: (a) convertir con la cotización al crear el item, o (b) bloquear/avisar si hay items en otra moneda que la liquidación. No se tocó porque afecta plata que se paga. Ver [../domains/rrhh-liquidaciones.md](../domains/rrhh-liquidaciones.md).

## Productos / Recetas

### Vínculo Producto↔Receta roto — RESUELTO (2026-08)

**Síntoma:** en el tab Recetas del alta de producto, "Buscar Receta" siempre daba error al asignar una receta existente (sólo funcionaba "Crear Receta"), y al desvincular una receta ésta seguía vinculada al reabrir el producto.

**Causa:** tres bugs encadenados sobre un 1:1 con **dos owning sides** (`producto.receta_id` y `receta.producto_id`, ambos UNIQUE), gemelos del mismo commit de 2026-03:
1. `update-receta` asignaba `productoId`, propiedad que `Receta` nunca declaró → no-op silencioso.
2. `update-producto` desvinculaba con `producto.receta = undefined`; TypeORM no emite UPDATE para `undefined` → `producto.receta_id` quedaba ocupado para siempre.
3. El buscador filtraba por `receta.producto` (columna deprecada, siempre NULL) → ofrecía recetas ya ocupadas, y asignarlas explotaba con `UNIQUE constraint failed: producto.receta_id`.

**Fix:** `producto.receta_id` como única fuente de verdad; `receta.producto_id` documentada como deprecada con virtual `productoVinculado` en su lugar; handlers atómicos `vincular-receta-a-producto` / `desvincular-receta-de-producto` y `get-recetas-asignables` (filtra las 4 FKs de dueño en SQL). Arrastró además: `ventas.handler` (atajos de PdV sin precio para pizzas), `calcular-costo-receta` (PrecioCosto sin producto), `delete-receta-for-adicional` (mismo bug del `undefined`), `gestion-recetas` (recetas de variación secuestrando `producto.receta_id`) y dos pantallas de la PWA mobile. Test: `npm run test:receta-vinculo`. Detalles → [../domains/recetas-sabores-variaciones.md](../domains/recetas-sabores-variaciones.md).

### Datos ya vinculados por error — pendiente (saneamiento)

**Síntoma:** bases anteriores al fix de arriba pueden tener `producto.receta_id` apuntando a la receta de una **variación** o de un **adicional** (el buscador nunca filtró nada). Efecto colateral: `delete-sabor` / `delete-receta` fallan con `FOREIGN KEY constraint failed` sin explicar por qué.

**Detección** (no automatizada todavía):
```sql
SELECT p.id, p.nombre, rp.id FROM producto p JOIN receta_presentacion rp ON rp.receta_id = p.receta_id;
SELECT p.id, p.nombre, a.id  FROM producto p JOIN adicional a           ON a.receta_id  = p.receta_id;
SELECT COUNT(*) FROM receta WHERE producto_id IS NOT NULL;  -- debe dar 0 siempre
```

**Por qué no hay migración automática:** desvincular a ciegas dejaría productos elaborados sin receta y rompería el descuento de stock. Requiere un handler de diagnóstico + decisión del usuario, al estilo de `reparar-recetas-compartidas`.

### `update-producto` ignora `requiereComanda` — pendiente

**Síntoma:** el campo se manda desde `gestionar-producto.service.ts` y desde `producto-edit.page.ts` (mobile) pero `update-producto` no lo procesa: se descarta en silencio y el campo es inedi­table.

**Causa:** falta el `if (productoData.requiereComanda !== undefined)` en el handler. La columna existe (migración `1779100000000-AddRequiereComandaToProducto`).

## Frontend / UI

### `findPrecioCosto()` retorna 0 hardcodeado

**Síntoma:** en algunas vistas de productos, el costo aparece como 0 aunque en BD haya un PrecioCosto válido.

**Causa:** `findPrecioCosto()` en algún componente está hardcodeado para retornar 0 (TODO comentado en código).

**Ubicación:** mencionado en `docs/guia-funcionamiento-punto-de-venta.md:719`. Probablemente en componentes de productos o cálculos en venta.

### Categorías PdV — click no agrega al carrito

**Síntoma:** los items de categoría se muestran en el PdV pero hacer click no agrega productos al carrito.

**Causa:** flujo no implementado. UI muestra los `PdvCategoriaItem` pero falta el binding al `addProduct()`.

**Workaround:** usar el sistema de **Atajos** (tab "ATAJOS" en PdV) o el buscador de productos.

### `marcar-asistencia-masiva-dialog` layout roto

**Síntoma:** el grid de la asistencia masiva tiene columnas que se desbordan, obligan a scroll horizontal. La columna "Turno" aparece más allá del área visible.

**Causa:** layout no responsive.

**Fix pendiente:** rediseñar usando `mat-table` o grid responsive con columnas (Funcionario, Estado, Entrada, Salida, Turno) y permitir cambio de tamaño del dialog.

### Mat-chip standalone fuera de chip-listbox

**Síntoma:** `<mat-chip>` suelto se renderiza con layout block/flex propio que no respeta `inline-flex`. Aparece pegado al borde derecho del cell o cubriendo ancho completo.

**Solución:** usar `<span class="chip-xxx">` con estilo manual. → [conventions/ui-patterns.md](../conventions/ui-patterns.md).

### Budget CSS

**Síntoma:** warning al compilar — varios `.scss` exceden el límite de 10 KB configurado en `angular.json`.

**Impact:** no afecta funcionalidad. Solo warning.

**Fix:** subir el budget a 15-20 KB en `angular.json`, o partir SCSS grandes en sub-archivos.

### ✅ RESUELTO — Elaborados con variación mostraban precio `0` en las listas (2026-08-18)

**Síntoma:** en el buscador del PdV, en el grid de atajos y en la búsqueda /
atajos de la PWA, una pizza o una milanesa con variación aparecía con precio
`0`, aunque sus variaciones tuvieran precio cargado.

**Causa:** `search-productos-by-nombre` resolvía el precio con
`innerJoin pv.receta … receta.productoVariacion`, y `getPdvAtajoItemProductos`
con el 1:1 legacy `receta.producto_id`. Desde el refactor de julio el precio de
una variación cuelga de **`PrecioVenta.receta_presentacion_id`**, así que ninguna
de las dos consultas devolvía filas.

**Fix:** helper único `electron/utils/variacion-precio.utils.ts`
(`getRangosPrecioVariacion`, batch + fallback legacy); ambos handlers devuelven
`variacionResumen` con el rango y `principalPrecio` pasa a ser la variación más
barata. Las listas muestran `desde – hasta`.

**Gotcha:** un producto con variación **no tiene un precio**; cualquier vista
nueva que necesite mostrarlo debe usar ese helper, nunca `pv.receta_id`.
→ [../domains/recetas-sabores-variaciones.md](../domains/recetas-sabores-variaciones.md).

### ✅ RESUELTO — Ingrediente opcional sin nombre en el PdV (2026-08-17)

**Síntoma:** en el diálogo de personalización, el chip de un ingrediente
OPCIONAL salía vacío (sólo el tilde), y el chip del detalle del ítem decía `SIN`
sin el nombre. La comanda impresa, en cambio, decía `SIN ACEITUNAS`.

**Causa:** `RecetaIngrediente.ingrediente` es nullable — el ingrediente puede
estar cargado sólo con `descripcion`. La comanda y el KDS ya hacían
`ingrediente?.nombre || recetaIngrediente?.descripcion`; al frontend le faltaba
en 6 lugares (2 chips del diálogo, texto de ingredientes fijos, 2 chips del PdV,
mobile — que además mostraba el literal `"ingrediente"`).

**Gotcha:** cualquier vista nueva que muestre ingredientes necesita ese fallback.
→ [../domains/recetas-sabores-variaciones.md](../domains/recetas-sabores-variaciones.md).

### ✅ RESUELTO — La nota libre del ítem se duplicaba o se perdía (2026-08-17)

**Síntoma:** marcando una observación del catálogo (ej. `BUSCAR`) **y**
escribiendo una nota libre, el ítem mostraba dos chips `BUSCAR` y la nota no
aparecía; la comanda imprimía `>> BUSCAR` dos veces. Escribiendo **sólo** la
nota, no se guardaba nada.

**Causa:** `venta_item_observaciones.observacion_id` es NOT NULL. Los tres sitios
del PdV que persistían observaciones colgaban la nota de `observacionIds[0]`
(duplicando esa observación) o mandaban `observacion: null` (violaba el NOT NULL
y el error moría en el `catch`). Encima el render priorizaba
`observacion.descripcion` sobre `observacionLibre`, y la comanda leía
`o.descripcion` — campo que no existe en la entidad — así que la nota nunca se
imprimía.

**Fix:** sentinel `NOTA DEL CLIENTE` resuelto en el backend
(`electron/utils/observacion-libre.utils.ts`), una sola fila por nota, y
`observacionLibre` primero al renderizar. Test: `npm run test:observacion-libre`.
Detalle y reglas → [../domains/ventas-pdv.md](../domains/ventas-pdv.md).

## Backend / Datos

### ✅ RESUELTO — El ticket/pre-cuenta imprimía y cobraba los ítems cancelados (2026-08-17)

**Síntoma:** se cancelaba un ítem en el PdV (quedaba tachado, el cobro lo descontaba
bien) pero al imprimir la pre-cuenta el ítem seguía apareciendo, y el **TOTAL impreso
salía inflado**: el mozo le mostraba al cliente más de lo que debía pagar.

**Causa:** `printVentaTicketInternal` cargaba los `VentaItem` sin filtrar por estado, y
esa misma lista alimentaba las líneas **y** los totales. Como `Venta.total` nunca se
persiste (ver el bug de abajo), el TOTAL impreso sale siempre del cálculo local
`bruto - descItems - descPago + aumPago` → el cancelado lo inflaba **en los dos
documentos**: pre-cuenta y comprobante post-cobro.

**Fix:** filtro `estado: EstadoVentaItem.ACTIVO` en `buildVentaTicketLines` (extraída de
`printVentaTicketInternal` para poder testear el contenido sin impresora). El ticket
también detalla ahora los adicionales activos. Test: `npm run test:ticket-venta`.

**Gotcha para el futuro:** cualquier lugar nuevo que arme una vista de los ítems de una
venta arranca filtrando `estado = ACTIVO` — es lo que hacen comanda, cobro, stock,
comisiones, reportes y factura legal. Un `find` sin filtro es el bug.

### `Venta.total` nunca se persiste → comisiones META_VENTA_LOCAL y "Top 5 Vendedores" siempre en 0

**Descubierto** auditando el ticket de venta (2026-08-17). **Pendiente** → issue
[#239](https://github.com/GabFrank/frc-gourmet/issues/239). No se arregló ahí para no
mezclar dominios.

**Hecho de base:** la columna `ventas.total` (`Venta.total`, nullable) **no se escribe en
ningún flujo del repo**. Al cobrar, `cobrar-venta-dialog` hace
`updateVenta({ estado, formaPago, pago, fechaCierre })` sin `total`; la venta a crédito
tampoco lo setea. A diferencia de `Compra.total` o `PedidoOnline.total`, que sí se
persisten. Quien necesite el total de una venta tiene que sumar sus `VentaItem` activos.

**Consecuencias detectadas:**

- `comisiones.handler.ts` — `totalMontoVentaLocal` se acumula desde `v.total as "ventaTotal"`,
  así que queda 0. La regla `TipoReglaComision.META_VENTA_LOCAL` compara
  `totalMontoVentaLocal >= metaMontoLocal`: con una meta > 0 **nunca paga**, en silencio.
- `dashboard-rrhh.handler.ts` — `SELECT v.vendedor_id, SUM(v.total) as totalVendido … GROUP BY
  v.vendedor_id` para el widget "Top 5 Vendedores": todos los montos salen 0.

**Fix posible (a decidir):** o se empieza a persistir `Venta.total` al concluir la venta
(y hay que decidir si es bruto o neto de ajustes del pago), o esos dos consumidores pasan
a sumar `VentaItem` activos como hacen los reportes (`reportes-ventas.helper.ts`). La
segunda opción no necesita migración ni backfill de las ventas históricas.

### `create-factura` no revalida que los ítems facturados sean ACTIVO de la venta

**Descubierto** auditando el ticket de venta (2026-08-17). **Pendiente** → issue
[#240](https://github.com/GabFrank/frc-gourmet/issues/240).

**Síntoma:** ninguno hoy. El único emisor (`cobrar-venta-dialog` → `FacturarDialogComponent`)
manda `items: activeItems`, ya filtrados.

**Riesgo:** `create-factura` (`facturacion.handler.ts`) persiste los `FacturaItem` tal como
vienen en el payload — no valida que el ítem exista, que pertenezca a esa venta, que su
estado sea `ACTIVO`, ni que el total cuadre con la suma de los ítems. Como **`/api/rpc` es
default-allow** (regla #22), cualquier cliente con JWT válido puede emitir un comprobante
**legal** con un ítem cancelado o un total arbitrario. Revisar también que tenga
`ensurePermission` — la facturación quedó sin permisos dedicados.

### Pre-cuenta tras cobro parcial muestra el total, no el saldo

**Pendiente, necesita decisión de producto** → issue
[#241](https://github.com/GabFrank/frc-gourmet/issues/241).

`buildVentaTicketLines` no resta `VentaItem.montoCubierto`, así que si una mesa pagó parte
con cobro parcial por ítems y se reimprime la pre-cuenta, el papel muestra el total del
pedido y no lo que falta. Los importes son correctos (una pre-cuenta es el detalle del
pedido) y el PdV sí muestra el saldo en pantalla; la opción sugerida es imprimir un bloque
`PAGADO`/`SALDO` **sólo** cuando hay rondas activas. El comprobante final no tiene el
problema: `canFinalizar` exige saldo ≤ 0.

### CajaMayorMovimiento huérfano

**Síntoma:** movimiento con FK plana (`compraId`, `valeId`, etc.) apuntando a entidad inexistente.

**Causa:** las FKs son **columnas planas sin constraint ORM** — borrar la entidad referenciada no nulea.

**Mitigación actual:** entidades raíz (Compra, Vale, Liquidacion) NO se borran físicamente — se anulan o cancelan. El movimiento queda con FK pero la entidad sigue existiendo.

**Detección:**
```sql
SELECT id, compra_id FROM caja_mayor_movimientos
WHERE compra_id IS NOT NULL
  AND compra_id NOT IN (SELECT id FROM compras);
```

### Mesas colgadas en OCUPADO — RESUELTO (2026-08)

**Síntoma:** una mesa muestra estado=OCUPADO en el PdV pero no hay venta abierta vinculada.
Y su reverso: una mesa con consumo que **no** se marca como ocupada.

**Causa real (no era una race condition):** marcar y liberar mesas pasaba por
`updatePdvMesa`, que exige `VENTAS_PDV_CONFIGURAR` — permiso que en el seed tiene
**sólo GERENTE**. A un MOZO y también a un CAJERO le fallaba con FORBIDDEN, el
frontend se lo tragaba en un `console.error`, y quedaba el estado equivocado. Sólo
un gerente o el admin no lo sufrían, que es con quien se solía probar.

**Fix:** `createVenta` marca la mesa en su propia transacción y el handler
operativo `set-pdv-mesa-estado` (permiso `VENTAS_PDV`) la ocupa y libera; el
frontend avisa si falla. La migración `IndicesRucYReconciliarMesas` libera las
mesas que ya habían quedado colgadas. Detalle → [domains/ventas-pdv.md](../domains/ventas-pdv.md).

**Segunda causa, encontrada probando en el navegador (2026-08-21):** la cadena
mesa → comanda **sobre esa misma mesa** → otra mesa. Transferirle la cuenta de una
mesa a una comanda vinculada a ella deja la mesa ocupada, que es correcto — la
gente sigue sentada. Pero al mudar después esa comanda a otra mesa, `cerrarComanda`
sólo intentaba liberar la mesa si `PdvConfig.ocuparMesaAlVincularComanda` estaba en
**true**, y el default es **false**. La mesa quedaba OCUPADO sin venta ni comanda.
Ahora se intenta siempre; el chequeo de trabajo vivo (otra comanda OCUPADO o venta
de mesa ABIERTA) ya estaba y sigue protegiendo el caso contrario. Cubierto por los
casos 8b y 8c de `npm run test:transferencia-pdv`.

⚠️ Ninguna de las dos causas se ve probando como admin: la primera porque el admin
tiene todos los permisos, la segunda porque hay que encadenar dos transferencias.

### Stock no se descuenta en algunos casos

**Síntoma:** vendiste un producto y el stock no bajó.

**Causas posibles:**
- `producto.controlaStock = false` (intencional o accidental).
- `procesarStockVenta` falló y no reintentó (es fire-and-forget).
- Combo con depth > 2 (límite de recursión).
- Variación: no encontró RecetaPresentacion para la (presentación, sabor) específica.

**Re-procesar:** existe handler `procesarStockVenta(ventaId)` que es idempotente — si ya procesó y los movimientos están activos, no hace nada. Si hubo error y los movimientos están desactivados, re-procesa.

### Saldos Caja Mayor descuadrados

**Síntoma:** la suma de movimientos no coincide con el saldo guardado.

**Causa:** algún flujo creó un movimiento sin pasar por `actualizarSaldoCajaMayor()` (raro, pero posible si se inserta manualmente o se hace bypass).

**Fix:** handler `recalcular-saldos` (`caja-mayor.handler.ts`) reconstruye desde 0.

### Migración auto en cada arranque

```sql
UPDATE ventas SET vendedor_id = created_by
WHERE vendedor_id IS NULL AND created_by IS NOT NULL;
```

Corre en `main.ts` cada arranque (en el `then` de `DataSource.initialize`). Es **idempotente** — la próxima vez no actualiza nada. Pero si por algún motivo `vendedor_id` se nulea manualmente, se rellenará automáticamente al reiniciar.

## Seguridad ⚠️

Esta sección quedó **mayormente obsoleta** tras los sweeps F0 y P0. Revisar el commit history antes de afirmar que algo de acá sigue roto.

### ✅ RESUELTO — Passwords en texto plano (F0, PR #14)
Hash con bcrypt en `electron/utils/password.utils.ts`. `hashPassword()`/`verifyPassword()` usados en auth handler + seed admin + cambio de password.

### ✅ RESUELTO — JWT secret hardcoded (F0, PR #14)
JWT secret se persiste en **keytar** (no en código ni env). Se genera al primer arranque si no existe. Usado por Fastify JWT plugin en el server modo F3.

### ✅ RESUELTO — Validación de permisos solo en frontend (P0-1, PR #22)
`checkPermission()`/`ensurePermission()` en `electron/utils/auth.utils.ts` se invoca al inicio de los handlers IPC que mutan datos sensibles (~178 handlers cubiertos al 2026-05-13). Cache de permisos por usuario con TTL 30s. El renderer ya no es frontera real — el backend valida.

### ✅ RESUELTO — Admin `admin/admin` post-instalación (P0-3, PR #22)
Columna `must_change_password` en `Usuario`. Seed marca el admin default. Dialog bloqueante `force-change-password-dialog` post-login obliga a cambiar antes de cargar el dashboard.

### ✅ RESUELTO — `must_change_password` solo en frontend (M-07, 2026-07-15)
`auth.utils.ts` `checkPermission` rechaza (FORBIDDEN) si el usuario tiene `mustChangePassword=true`; `change-password` es self-service (no pasa por checkPermission). El flag se refleja en memoria al cambiar. Antes el gate era solo el dialog del frontend.

### ✅ RESUELTO — Hash de password expuesto al renderer (M-08, 2026-07-15)
`auth.handler.ts` (login/restoreSession/getCurrentUser) serializa el usuario **sin** `usuario.password`.

### Renderer puede setCurrentUser (mitigado en HTTP)
`setCurrentUser` IPC sigue existiendo. P0-1 mitiga porque cada handler revalida permisos contra el usuario actual. Además, en 2026-07-15 el canal **`set-current-user` entró en `BLOCKED_CHANNELS`** de `/api/rpc` (no invocable por HTTP). El canal IPC local sigue existiendo. **Fix pendiente (menor):** eliminar el handler y derivar del login/JWT.

### Batch de auditoría 2026-07-15 (`docs/HALLAZGOS-AUDITORIA-DESKTOP.md`)

~20 bugs clasificados C (crítico) / M (medio) / A (alto) **cerrados** en la sesión del 2026-07-15. No re-descubrir. Resumen:

| ID | Bug | Estado |
|---|---|---|
| C-01 | doble conteo en el ledger bancario | FIXED (dedup por token `#<id>` en `movimientos-bancarios.ts`) |
| C-02 | stock no descontaba por sabor en pizza multi-sabor | FIXED (`processElaboradoConVariacion` recorre `VentaItemSabor`) |
| C-03 | handlers de precio/stock sin permiso | FIXED (`PRODUCTOS_GESTIONAR` / `STOCK_MOVIMIENTO_REGISTRAR`) |
| C-04 | doble descuento de vale/venta-vacación entre periodos | FIXED (guard `liquidacion_id IS NULL OR = esta`) |
| C-05 | `/api/rpc` default-allow | **PARCIAL** (BLOCKED_CHANNELS 3→~30; default-deny estructural pendiente) |
| A-01 | cancelar venta a crédito no revertía CPC | FIXED (revierte CPC + saldo cliente, atómico) |
| A-02 | costo de receta ignoraba rendimiento | FIXED (`costoUnitario = costoTotal / rendimiento`) |
| A-03 | anular compra no revertía stock | FIXED parcial (guard de stock; costo promedio NO se revierte, follow-up) |
| A-04/M-06 | comisión de equipo duplicada / reparto ≠ 100% | FIXED (idempotente + valida 100%) |
| A-05 | `cpp.montoPagado` sobre-sumaba | FIXED (recomputa desde las cuotas) |
| M-01 | `anular-cobro-cpc` no idempotente | FIXED (col `movimientos_cliente.anulado` + migración) |
| M-02 | carreras de saldo caja mayor | **PARCIAL** (`FOR UPDATE` solo Postgres; falta lock de `CuentaBancaria`/`Cliente`) |
| M-04 | TOCTOU en `procesarStockVenta` | FIXED (mutex en memoria por `ventaId`) |
| M-05 | 23 handlers RRHH sin permiso | FIXED |
| M-07/M-08 | must-change-password / hash al renderer | FIXED (ver arriba) |

**Aún abiertos/parciales:** C-05 (default-deny estructural), M-02 (locks de cuenta bancaria/cliente), A-03 (revertir costo promedio al anular compra), y el bug multimoneda de liquidaciones (sección RRHH arriba).

## Performance

### Eager + cascade en RecetaPresentacion

`RecetaPresentacion → Receta` con `eager: true`. Cargar 100 RecetaPresentacion → 100 queries adicionales.

**Mitigación**: hot paths que listan muchas variaciones podrían hacer query manual con `relations: ['receta']` en lugar de cargar todo.

### `getPdvMesasActivas()` cada 1 segundo

PdV refresca el estado de las mesas cada 1 segundo. Con 50 mesas, son ~50 queries/seg.

**Mitigación**: al timer no le hace daño en local, pero en futuro multi-cliente requeriría WebSocket.

## Bugs en docs/testing/ERRORES-PDV.md

→ Archivo con registro de errores históricos del PdV. Mayoría resueltos, pero algunos pueden seguir pendientes. Chequear antes de "redescubrir" un bug.

## ✅ RESUELTOS — Reportados por el usuario y corregidos (2026-08-21)

Los cuatro tenían la misma raíz: **el permiso equivocado por proximidad**, o su gemelo en el transporte. Ninguno se veía probando como ADMIN.

### El cajero no podía agregar una línea de cobro — RESUELTO

`createPago`/`createPagoDetalle` pedían `COMPRAS_GESTIONAR`. `Pago`/`PagoDetalle` están marcadas `@deprecated` para compras pero son el libro de pagos de las **ventas**; el guard quedó en el dominio viejo. Igual `create-acreditacion-pos` y `acreditar-transferencia-bancaria` con `BANCOS_GESTIONAR`: tampoco podía cobrar con tarjeta ni transferencia.

Fix: permiso nuevo `VENTAS_COBRAR`. Los handlers aceptan `[VENTAS_COBRAR, COMPRAS_GESTIONAR]` (o `BANCOS_GESTIONAR`), **pero sobre un registro que ya existe se resuelve el dominio primero**: un `Pago` colgado de una `Compra` sigue exigiendo `COMPRAS_GESTIONAR`. Sin eso, quien sólo tiene `VENTAS_COBRAR` podía editar y borrar el historial de pagos a proveedores pasando un id cualquiera.

### El cajero no podía abrir ni cerrar su caja — RESUELTO

Abrir una caja son tres llamadas (`create-conteo`, `create-conteo-detalle`, `create-caja`) y las tres pedían `FINANCIERO_CAJA_GESTIONAR`. Fix: `FINANCIERO_CAJA_OPERAR`. Detalle → [architecture/auth-permissions.md](../architecture/auth-permissions.md).

### El cambio de contraseña fallaba en la PWA — RESUELTO

Preload empaqueta sus parámetros posicionales en un objeto antes de invocar el canal (`invoke('change-password', { usuarioId, ... })`), pero el shim HTTP manda `params: [...args]` tal cual: el handler recibía `usuarioId` suelto como payload y devolvía `PAYLOAD INVALIDO`.

⚠️ **Había 9 métodos más con la misma forma**, todos rotos sobre HTTP y funcionando en Electron — la combinación más difícil de diagnosticar: `saveProfileImage`, `deleteFile`, `readFileBase64`, `openFileWithSystem`, `openBase64File` y las tres del upload por QR. Fix: `API_ARG_SHAPE` generado del propio preload → [architecture/mobile-pwa.md](../architecture/mobile-pwa.md). Cubierto por `npm run test:api-map`.

De paso, los campos de contraseña ganaron botón de ojo (SVG inline: el icon font de Google no carga en LAN sin internet).

### Caja Mayor le figuraba a cualquier cajero en el home de la PWA — RESUELTO

Gateaba con `FINANCIERO_CAJA_VER`, que es el permiso de la caja del **turno**, no de Caja Mayor. Pasa a `CAJA_MAYOR_OPERAR`, el mismo que exige la ruta destino. Su gemelo en el desktop tenía el mismo error: las hojas Gastos / Entradas Varias / Operaciones Financieras / Retiros de `MENU_TREE` también gateaban con `FINANCIERO_CAJA_VER`.

### `ConfirmationDialogComponent` ignoraba `confirmText`/`cancelText` — RESUELTO

Rotulaba todo "No" / "Sí" pese a que los llamadores mandan esos campos desde siempre: **~65 confirmaciones de la app** mostraban etiquetas genéricas. Peor, cancelar cerraba con `undefined` en vez de `false`, así que cualquier llamador que distinga las tres ramas (confirmar / rechazar / descartar) tenía la del medio muerta — le pasaba al "SOLO ITEMS" del PdV.

## Gotchas de handlers / arquitectura (auditoría 2026-07)

Aprendidos en la auditoría de bugs de julio 2026 (rama `claude/desktop-forma-pago-efectivo`, PR #181). Ver `docs/HALLAZGOS-AUDITORIA-DESKTOP.md` para la lista completa de bugs clasificados por severidad.

- **Los handlers NO quedan como listeners de `ipcMain`.** `electron/utils/handler-registry.ts` hace **monkey-patch de `ipcMain.handle`** y guarda cada canal en un registro propio. Por eso `ipcMain.listeners('canal')` devuelve `[]`. Llamar `ipcMain.listeners('canal')[0]?.(...)` es un **no-op silencioso** (patrón que dejó a `generar-liquidaciones-comision-mes` sin hacer nada). Para invocar otro handler desde dentro de un handler, **usar `invokeHandler(canal, ...args)`** de `../utils/handler-registry`.
- **`/api/rpc` es default-allow.** En `mode=server` expone **todos** los handlers con sólo un JWT válido; `BLOCKED_CHANNELS` (`electron/server/rpc-router.ts`) bloquea sólo canales de infraestructura — **ampliado de 3 a ~30 canales** en 2026-07-15 (C-05: backups, db-config, app-mode, auto-update, `set-notif-secret`, `ia-config-set`, seeds, `set-current-user`, `remote-tunnel-*`, etc.). Pero para los ~830 handlers de negocio sigue siendo default-allow (el default-deny estructural sigue pendiente). La capa de transporte **no** protege nada: cada handler sensible debe traer su propio `ensurePermission(dataSource, getCurrentUser, 'CODIGO')`. No asumir que estar detrás de `/api/rpc` = protegido.
- **El payload de `/api/auth/login` es una lista blanca a mano** (`electron/server/auth-routes.ts`), no el `Usuario` completo: sólo `id`, `nickname`, `persona` y `mustChangePassword`. Cualquier bandera que el frontend necesite del usuario hay que **agregarla explícitamente ahí**, o los clientes HTTP (PWA mobile, web `/admin`, desktop `mode=client`) la ven como `undefined` mientras el backend opera con el valor real de la BD (el `rpc-router` hace `findOne` del usuario del JWT). Así se coló el bug de agosto 2026: sin `mustChangePassword` en el payload, un usuario con contraseña temporal entraba sin que nadie lo forzara a cambiarla y después **todo** handler con `ensurePermission` le devolvía FORBIDDEN.
- **Payload de cuenta bancaria va anidado**: los handlers esperan `{ cuentaBancaria: { id } }`, **no** un `cuentaBancariaId` plano (lo descartan al desestructurar). (Ojo: esto es lo contrario de `create-presentacion`/`create-codigo-barra`, que sí toleran ambas formas — no generalizar.)
- **Anulaciones deben ser multi-detalle.** Documentos como gasto/retiro generan **N** movimientos de caja mayor. Anular debe recorrer **todos** con `find(...)` + contra-balancear cada uno (`actualizarSaldo`), nunca `findOne(...)` (dejaba movimientos sin revertir).
- **Regla fuente Caja Mayor ⇒ EFECTIVO.** En todo formulario con selector de fuente de pago: si la fuente es Caja Mayor, la forma de pago debe ser EFECTIVO (filtrar `formasPago` a las que contienen `"EFECTIVO"`). Si la fuente es una cuenta bancaria, **no** se pide forma de pago (siempre es transferencia; la moneda la define el banco).
- **Regla dura que sólo caza el AOT (`npm run check`), no el dev build**: strings UPPERCASE, sin funciones/getters en templates, sin colores hardcodeados, filtros con botón explícito (sin filtrado en vivo). Correr `npm run check` antes de pushear.
- **`--omit=optional` en CI excluye `@thiagoelg/node-printer` (bug de impresión resuelto 2026-07).** `release.yml` usa `npm ci --omit=optional` para saltear `canvas` (cairo), pero eso también saca la única `optionalDependency` que la app SÍ necesita: el driver del spooler del SO. Resultado: la app instalada en Windows tiraba `Cannot find module '@thiagoelg/node-printer'` al imprimir por conexión `system`. Fix en el job `build` (solo Windows): `npm install --no-save @thiagoelg/node-printer@0.6.2` tras el `npm ci` (el `--no-save` no re-instala canvas). Regla: **cualquier `optionalDependency` que sea requisito real de runtime necesita re-inclusión explícita si el install de CI usa `--omit=optional`.**

### Música ambiental — hallazgos de la primera prueba real (2026-08-11)

- **Textarea aplastado en TODA la app.** `styles.scss` fija `.mat-mdc-form-field-appearance-outline .mat-mdc-form-field-flex { height: 40px !important }` para compactar inputs de una línea. Con un `<textarea>` deja el marco en 40px y el contenido se desborda por arriba y por abajo. **Afecta al menos 6 pantallas** (recetas, funcionarios, comisiones, …), no sólo a música. Ganarle por especificidad es frágil (con dos `!important` gana el selector más específico, y el global tiene 3 clases); en música se resolvió sacando el textarea del `mat-form-field`. **La corrección global sigue pendiente** y hay que hacerla revisando formulario por formulario.
- **Endpoints de Spotify que cambiaron y rompieron cosas** (4 en una sesión): `/playlists/{id}/tracks` → `/items`; contenido de playlists ajenas ya no se devuelve (403 en Dev Mode); `POST /users/{id}/playlists` **deprecado** → `POST /me/playlists`; `search` limitado a 10 resultados. Ante cualquier 403/404 de Spotify, **verificar la doc actual antes de asumir un problema de permisos**.
- **Comparar horas como texto rompe la medianoche.** `'17:00' < '00:00'` es falso porque `'1' > '0'`. Un bloque 17:00–00:00 daba duración negativa (playlist de 30 min en vez de 7 h) y **nunca resultaba vigente** (el turno noche no sonaba). Siempre convertir a minutos y tratar `'00:00'` de cierre como 24×60.
- **Los vetos por género no se pueden delegar al LLM.** Aun pidiéndole el género real y declarando incorrecta la respuesta que disfrace un veto, siguió etiquetando *"J Balvin: latin pop"* (reggaetón), *"Marcelo D2: MPB"* (rap). El filtro se apoya ahora en `/artists/{id}` de Spotify, que publica los géneros reales. **Regla general: si un filtro de negocio depende de una etiqueta que genera el modelo, el modelo la va a acomodar.**
- **Comparación de géneros en una sola dirección.** Con inclusión bidireccional, un veto de `FUNK BRASILEIRO` descartaba el funk americano (soul/groove). El género del tema debe contener al veto, no al revés.
- **El LLM no cubre los 7 días aunque se le pida.** Devolvió 3 días, y después 7 pero con viernes y sábado sólo con el bloque de la noche (local sin música de 09:00 a 17:00). Los huecos se completan por código replicando el día equivalente; el domingo **nunca** se inventa (puede ser que el local no abra).

## Trampas que parecen bugs pero no son

- **`getPdvConfig` retorna array** con un solo elemento (legacy). Usar `result[0]`.
- **Imágenes:** `images.handler.ts` solo maneja imágenes de perfil (legacy compat). Las imágenes de producto y demás archivos usan el `files.handler.ts` genérico (`save-file`/`delete-file`).
- **Compras pre-refactor 2026-05-05 contado** sin CPP — aparecen como "ya pagadas". Es **intencional**, no se migran.
- **`get-presentaciones-by-producto` devuelve `{ data, total, page, pageSize }`** — NO `{ items }`. Si ves un componente leyendo `res.items` está roto. Causó un bug en el módulo OCR (presentaciones siempre vacías).
- **`create-presentacion` y `create-codigo-barra`** aceptan tanto `productoId`/`presentacionId` planos como `producto: { id }` / `presentacion: { id }` (estilo TypeORM relations). Tolerancia explícita desde 2026-05-06.
- **Productos creados desde import OCR** llegan con `subfamilia=null` y `registroCompleto=false` — chip "Parcial" en list-productos. No es bug, completar después desde gestionar-producto.
- **Patrón mat-select con item dinámicamente creado**: si `[ngModel]` apunta a un id que aún no está en `<mat-option>`, mat-select emite `null` por race con DOM. **Fix correcto**: prepender al array de opciones primero, `setTimeout(0)` antes de setear el valor. Implementado en `revisar-factura.component.ts:abrirCrearProducto`.
- **Lista CPP filtra contado por defecto** — toggle UI activa.
- **Handlers de RecetaPresentacion en `recetas.handler.ts`**, NO en `receta-presentacion.handler.ts` (existe pero NO se registra).
- **Bono auto-generado por tardanza** no se recalcula si cambian los valores de config — solo aplica al siguiente registro de asistencia.
- **`porcentajeAprovechamiento` en RecetaIngrediente NO afecta costo** (intencional, ver `recetas.handler.ts`). Solo se almacena para uso futuro.


## Anotados durante el pago consolidado (2026-08)

- **M-02 (carreras de saldo caja mayor) — avanza, no cierra.** Se eliminó la copia
  sin lock de `descontarSaldoCajaMayor`/`sumarSaldoCajaMayor` que vivía en
  `cuentas-por-pagar.handler.ts`: ahora todo pasa por `actualizarSaldoCajaMayor`,
  que sí toma `pessimistic_write` en Postgres. **Sigue faltando** el lock sobre
  `CuentaBancaria.saldo` y `Cliente.saldoActual`. El pago consolidado además
  lockea la fila de la obligación (gasto/vale/cuota/liquidación) antes de pagarla,
  cosa que los flujos viejos no hacen.

- **`Gasto.monto` suma monedas distintas sin convertir.** `create-gasto` calcula
  el total como `detalles.reduce((s, d) => s + d.monto)` — si el usuario carga
  detalles en Gs y en USD, el monto guardado es una suma sin sentido. Preexistente;
  el alta **diferida** lo evita (manda moneda y monto directos), pero la rama con
  pago sigue igual.

- **Gastos `PROGRAMADO` se cuentan en el reporte de Finanzas.** `gastosRango` /
  `gastosPorCategoria` filtran por estado, y `PROGRAMADO` (gasto recurrente futuro,
  no pagado) entra igual. Se excluyó `PENDIENTE` al introducirlo, pero `PROGRAMADO`
  quedó como estaba para no cambiar números existentes.

- **Dos convenciones de dirección de cotización conviven.**
  `moneda.utils.getCotizacionCompraLocal` usa `origen → destino` con las filas
  `extranjera → PYG` que carga el diálogo; `financiero.handler.ts`
  (`get-moneda-cambio-by-moneda-principal`, `get-valor-en-moneda-principal`) usa la
  convención **inversa**. No se cruzan hoy, pero es una trampa. El pago consolidado
  usa `getCotizacionBidireccional`, que prueba las dos direcciones.
