# Debug checklist

Cómo investigar bugs en cada zona del sistema. Por dónde empezar antes de ir al código.

## "La operación X no funciona"

1. **Reproducir** y capturar el mensaje exacto de error (consola Electron, snackBar, alert).
2. **DevTools del renderer** (`Ctrl+Shift+I` en dev, o `view.webContents.openDevTools()`): ver consola JS y Network (no aplica IPC, pero sí HTTP si hay).
3. **stderr de Electron main**: la terminal donde corre `npm start`. Los `console.error` de handlers viven ahí.
4. Identificar si es:
   - Frontend (componente, servicio Angular): inspeccionar en DevTools.
   - IPC (preload o handler): buscar el handler por nombre del canal (`ipcMain.handle('foo', ...)`) en `electron/handlers/`.
   - DB: leer la BD directamente con `sqlite3` o un cliente.

## DB: leer directamente

```bash
# macOS
DB="$HOME/Library/Application Support/frc-gourmet/frc-gourmet.db"
sqlite3 "$DB" ".tables"
sqlite3 "$DB" "SELECT * FROM ventas WHERE estado = 'ABIERTA';"
sqlite3 "$DB" "SELECT id, nombre, activo FROM productos LIMIT 20;"

# Ver schema de una tabla
sqlite3 "$DB" ".schema venta_items"
```

→ Más comandos: [verificacion-bd-sqlite.md](verificacion-bd-sqlite.md).

## Bug por dominio

### Productos / Recetas

- ¿`Producto.tipo` está bien? (RETAIL, RETAIL_INGREDIENTE, ELABORADO_SIN_VARIACION, ELABORADO_CON_VARIACION, COMBO).
- ¿Tiene presentaciones? `SELECT * FROM presentaciones WHERE producto_id = ?`.
- ¿Tiene precio venta activo? `SELECT * FROM precios_venta WHERE producto_id = ? AND activo = 1`.
- ¿Tiene receta? `SELECT * FROM recetas WHERE id = (SELECT receta_id FROM productos WHERE id = ?)`.
- Para ELABORADO_CON_VARIACION: `SELECT * FROM recetas_presentaciones WHERE presentacion_id IN (...)`. **Eager load** de `Receta` puede ser lento si hay muchas variaciones.
- Cálculo de costo: revisar `recetas.handler.ts:24-207` — el costo se cachea en `Receta.costoCalculado`. Si está en 0, no se recalculó. Trigger manual: ver handler.

### Ventas / PdV

- ¿Hay caja abierta? `SELECT * FROM cajas WHERE estado = 'ABIERTO'`.
- ¿La venta tiene items activos? `SELECT * FROM venta_items WHERE venta_id = ? AND estado = 'ACTIVO'`.
- VentaItem.estado: ACTIVO (cuenta), MODIFICADO (cuenta, hay versión nueva), CANCELADO (no cuenta).
- Para multi-sabor: `SELECT * FROM venta_item_sabores WHERE venta_item_id = ?`.
- Para personalizaciones: `venta_item_adicionales`, `venta_item_ingrediente_modificaciones`, `venta_item_observaciones`.
- ¿Mesa colgada en OCUPADO sin venta? `SELECT m.* FROM pdv_mesas m LEFT JOIN ventas v ON v.mesa_id = m.id AND v.estado = 'ABIERTA' WHERE m.estado = 'OCUPADO' AND v.id IS NULL` — fix manual: `UPDATE pdv_mesas SET estado='DISPONIBLE' WHERE id=?`.
- Stock no se descuenta: revisar `procesarStockVenta` en `ventas.handler.ts:1826`. Verifica `controlaStock=true` en producto. Para combos, recursión max depth 2. Para variaciones, busca `RecetaPresentacion` por presentación.

### Compras

- Estados: ABIERTO (borrador), FINALIZADO (procesado), CANCELADO (anulado), ACTIVO (deprecated).
- Al finalizar: `Compra.estado = FINALIZADO`, genera CPP (1 cuota contado, N crédito), genera `StockMovimiento` (si controlaStock), actualiza `PrecioCosto` (promedio ponderado), upsert `ProveedorProducto`.
- Costo promedio ponderado: `aplicarCostoPromedioPonderado()` en `compras.handler.ts:78-122`.
- Para bloqueo de "no se puede anular CPP con cuotas pagadas": chequear `cuentas_por_pagar_cuotas WHERE cpp_id = ? AND monto_pagado > 0`.
- "Compra anterior no aparece en pagar-compras-dialog": chequear que tenga CPP. Compras pre-refactor 2026-05-05 contado tienen `EGRESO_COMPRA` directo SIN CPP — aparecen como "ya pagadas".

### Caja Mayor

- ¿Saldo desincronizado? `recalcular-saldos` (handler) reconstruye desde `CajaMayorMovimiento`.
- Movimiento no aparece: chequear `referencia_anulacion_id` IS NULL y `incluirAnulaciones=false` (default oculta contras).
- "No puedo anular movimiento": revisar bloqueos en `anular-caja-mayor-movimiento` (caja-mayor.handler:296+):
  - `liquidacionSueldoId` → anular desde Liquidaciones de Sueldo
  - `cuentaPorPagarCuotaId` → anular desde CPP cuota
  - `valeId` → anular desde Vales
  - `liquidacionComisionId` → anular desde Comisiones
  - `cuentaPorCobrarCuotaId` → anular desde CPC
  - `cuentaPorPagarId` → anular CPP completo
  - `compraId` → anular desde compras
  - `tipoMovimiento === ANULACION` → no se puede anular una anulación
  - Ya tiene contra-movimiento previo → idempotencia
- Configuración por caja: `caja_mayor_configuracion` con M2M a `formas_pago` y `cuentas_bancarias`. Default: si no hay config, mostrar todas las FPs y ninguna cuenta bancaria.

### CPP / CPC

- Tipos CPP: COMPRA, PRESTAMO, PRESTAMO_FUNCIONARIO (a favor), OTRO.
- PRESTAMO_FUNCIONARIO genera **EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO** al crear, **INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO** al cobrar cuota directa. Cuotas via liquidación de sueldo: descuento implícito (no movimiento aparte).
- Estado cuota: PENDIENTE, PARCIAL, PAGADA, VENCIDA, CANCELADA.

### RRHH

- Vale ciclo: SOLICITADO (sin caja) → CONFIRMADO (genera EGRESO_VALE) → DESCONTADO (al pagar liquidación) → ANULADO (contra-mov).
- Liquidación sueldo BORRADOR: items auto regenerables (preserva manuales). Estados: BORRADOR → APROBADA → PAGADA. ANULADA revierte vales/cuotas/comisiones/aguinaldos atómicamente + contra-mov caja mayor.
- Asistencia + tardanza: si `diff(horaEntrada, turno.horaEntrada) > tolerancia`, estado=TARDANZA. Si no justificada y `PENALIZACION_AUTO_TARDANZA=true`, genera Penalizacion auto con `montoFijo + montoPorMin × minutos`.
- Comisión: motor evalúa `VentaItem JOIN Venta` con `vendedor_id = funcionario.usuario_id`. Si `usuario_id IS NULL` en Funcionario → no hay comisiones para esa persona.

### Personas / Auth

- Login falla: chequear que Usuario.activo=true, password coincide en texto plano (sí, **literal**).
- "No tiene permisos": `SELECT codigo FROM permissions WHERE id IN (SELECT permission_id FROM role_permissions WHERE role_id IN (SELECT role_id FROM usuario_roles WHERE usuario_id = ?))`.
- Sesión inválida: `LoginSession.is_active=false` significa logout.

## Errores comunes

| Síntoma | Causa probable | Fix |
|---|---|---|
| "Error invoking remote method 'foo'" | Handler tira excepción | Buscar `console.error('Error foo:', ...)` en stderr Electron |
| Handler nuevo no funciona | No registrado en main.ts | Agregar `registerXxxHandlers(...)` |
| Tabla no existe | Entidad no en `database.config.ts` | Agregar al array `entities`, reiniciar app |
| `NOT NULL constraint failed` al `synchronize` | Columna nueva NOT NULL sin default en tabla con datos | Hacerla nullable o agregarle `default: 0` |
| Cambio de tipo de columna falla | TypeORM no migra cambios incompatibles | Backup + delete tabla + reiniciar (recreará vacía con nuevo schema) — ⚠️ pierde datos |
| `Cannot read properties of undefined (reading 'databaseName')` en QB | snake_case en `.where()` o `.orderBy()` con QueryBuilder | Cambiar a property names camelCase: `c.fechaCompra` no `c.fecha_compra` |
| Nueva columna NULL después de update | TypeORM ignora `undefined` | Usar `(entity as any).campo = null` |
| Fecha guardada un día antes | `new Date('YYYY-MM-DD')` en zona UTC-3 | Helper `parseLocalDate` (ver pitfalls) |
| Saldo Caja Mayor desfasado | Movimiento creado fuera de transacción | `recalcular-saldos` |
| Mesa colgada OCUPADO | Venta canceló sin liberar mesa | `UPDATE pdv_mesas SET estado='DISPONIBLE' WHERE id=?` (manual fix) |

## Logs útiles

Habilitar logs SQL TypeORM:
```bash
NODE_ENV=development npm start
```

Loguea cada query SQL en stderr Electron — útil para verificar que el handler genera la query esperada.

`console.log` con emojis es común en handlers (ej `recetas.handler.ts`):
```typescript
console.log(`🔄 Calculando costo de receta ID: ${recetaId}`);
console.log(`💵 Costo total calculado: ${costoTotal}`);
```

Útil para seguir flujos complejos. **No los borres si encontrás uno** — son intencionales.

## Cuando todo lo demás falla

1. **Backup de BD**: copiar `frc-gourmet.db` a `frc-gourmet.db.bak-debug-YYYYMMDD-HHMM` antes de cualquier delete.
2. **Restart limpio**: cerrar Electron, `npm run electron:serve-tsc`, `npm start` (lo corre el usuario).
3. **Última opción**: borrar `frc-gourmet.db` → la app crea una nueva vacía. Sólo si hay backup y el usuario lo aprobó.

## Trampas conocidas no obvias

- **Handlers de RecetaPresentacion están en `recetas.handler.ts`**, no en `receta-presentacion.handler.ts` (existe pero NUNCA se registra). (`project_atajos_sistema`)
- **`get-cuentas-por-pagar` filtra contado por defecto** vía `excluirContadoCompras=true`. Toggle UI permite verlas. (`project_compras_pago_unificado`)
- **`getPdvConfig()` retorna array** con un solo elemento (legacy). Usar `result[0]`.
- **Imágenes de producto deshabilitadas** parcialmente (handler comentado en `images.handler.ts:31-121`). Sólo perfiles activos.
- **Migración auto** `UPDATE ventas SET vendedor_id = created_by` corre en cada arranque. Idempotente.
- **`scheduler` de acreditaciones POS** corre cada 5 min en main process — `startAcreditacionesScheduler(dataSource, 5)`. Si está dormido (laptop suspendido), procesa el backlog al despertar.
