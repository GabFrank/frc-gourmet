# Bugs conocidos sin resolver

Snapshot **2026-05-05**. Verificar `git log` antes de afirmar que algo sigue roto.

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

**Fix:** handler `recalcular-saldos` (caja-mayor.handler.ts:121) reconstruye desde 0.

### Migración auto en cada arranque

```sql
UPDATE ventas SET vendedor_id = created_by
WHERE vendedor_id IS NULL AND created_by IS NOT NULL;
```

Corre en `main.ts:125` cada arranque. Es **idempotente** — la próxima vez no actualiza nada. Pero si por algún motivo `vendedor_id` se nulea manualmente, se rellenará automáticamente al reiniciar.

## Seguridad ⚠️

### Passwords en texto plano

**Donde:** `auth.handler.ts:35` (`password === usuario.password`).

**Riesgo:** alto en producción. Aceptable solo en local single-user.

**Fix pendiente:** bcrypt o argon2.

### JWT secret hardcoded

**Donde:** `auth.handler.ts:9` (`JWT_SECRET = 'frc-gourmet-secret-key'`).

**Fix pendiente:** mover a env var.

### Validación de permisos solo en frontend

**Riesgo:** un usuario malicioso con DevTools puede invocar `window.api.deleteFuncionario(id)` saltándose el `*ngIf="permService.has('CODIGO')"` del componente.

**Fix pendiente:** middleware de permisos en cada handler sensible.

### Renderer puede setCurrentUser

**Donde:** `auth.handler.ts:159+` (`setCurrentUser` IPC).

**Riesgo:** spoofing. Hay `console.warn` señalando el riesgo, pero el handler no rechaza.

**Fix pendiente:** validar token JWT en cada `setCurrentUser` o eliminar el handler IPC y derivar del login.

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
- **Imágenes de producto** parcialmente desactivadas (handler comentado en `images.handler.ts:31-121`).
- **Compras pre-refactor 2026-05-05 contado** sin CPP — aparecen como "ya pagadas". Es **intencional**, no se migran.
- **Lista CPP filtra contado por defecto** — toggle UI activa.
- **Handlers de RecetaPresentacion en `recetas.handler.ts`**, NO en `receta-presentacion.handler.ts` (existe pero NO se registra).
- **Bono auto-generado por tardanza** no se recalcula si cambian los valores de config — solo aplica al siguiente registro de asistencia.
- **`porcentajeAprovechamiento` en RecetaIngrediente NO afecta costo** (intencional, línea 137-138 del handler). Solo se almacena para uso futuro.
