# Bugs conocidos sin resolver

Snapshot **2026-06**. Verificar `git log` / el código antes de afirmar que algo sigue roto. La sección de **Seguridad** está mayormente resuelta (bcrypt, JWT en keytar, permisos en backend, must-change-password) — ver detalle abajo y [architecture/auth-permissions.md](../architecture/auth-permissions.md).

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

## Backend / Datos

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

### Mesas colgadas en OCUPADO

**Síntoma:** una mesa muestra estado=OCUPADO en el PdV pero no hay venta abierta vinculada.

**Causa:** posible race condition o bug en flujo de cancelación que no liberó la mesa.

**Fix manual:** ver [workflows/verificacion-bd-sqlite.md](../workflows/verificacion-bd-sqlite.md) para query.

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

### Renderer puede setCurrentUser (parcialmente cubierto)
`setCurrentUser` IPC sigue existiendo. P0-1 mitiga porque cada handler revalida permisos contra el usuario actual (si un atacante intenta spoofear, los permisos del rol spoofeado tienen que coincidir). Pero un usuario autenticado con rol bajo podría "ascenderse" si conoce el id de un admin. **Fix pendiente:** validar contra token JWT en cada `setCurrentUser` o eliminar el handler y derivar del login.

## Performance

### Eager + cascade en RecetaPresentacion

`RecetaPresentacion → Receta` con `eager: true`. Cargar 100 RecetaPresentacion → 100 queries adicionales.

**Mitigación**: hot paths que listan muchas variaciones podrían hacer query manual con `relations: ['receta']` en lugar de cargar todo.

### `getPdvMesasActivas()` cada 1 segundo

PdV refresca el estado de las mesas cada 1 segundo. Con 50 mesas, son ~50 queries/seg.

**Mitigación**: al timer no le hace daño en local, pero en futuro multi-cliente requeriría WebSocket.

## Bugs en docs/testing/ERRORES-PDV.md

→ Archivo con registro de errores históricos del PdV. Mayoría resueltos, pero algunos pueden seguir pendientes. Chequear antes de "redescubrir" un bug.

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
