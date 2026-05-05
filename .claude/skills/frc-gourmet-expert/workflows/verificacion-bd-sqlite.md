# Verificación BD SQLite

Cómo leer la BD directamente para validar el resultado de operaciones UI sin depender del frontend.

## Ubicación del archivo

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/frc-gourmet/frc-gourmet.db` |
| Windows | `%APPDATA%\frc-gourmet\frc-gourmet.db` |
| Linux | `~/.config/frc-gourmet/frc-gourmet.db` |

## Backup antes de tocar

```bash
DB="$HOME/Library/Application Support/frc-gourmet/frc-gourmet.db"
cp "$DB" "$DB.bak-$(date +%Y%m%d-%H%M)"
```

**Hacer SIEMPRE** antes de:
- Modificar entidades (que dispararán `synchronize`).
- Ejecutar deletes manuales.
- Probar flujos destructivos (anulación de liquidación, recalcular saldos).

## Comandos SQLite básicos

```bash
DB="$HOME/Library/Application Support/frc-gourmet/frc-gourmet.db"

# Listar tablas
sqlite3 "$DB" ".tables"

# Schema de una tabla
sqlite3 "$DB" ".schema venta_items"

# Ver columnas con tipo
sqlite3 "$DB" "PRAGMA table_info(venta_items);"

# Indices
sqlite3 "$DB" ".indices venta_items"

# Modo expandido (para filas anchas)
sqlite3 -header -column "$DB" "SELECT * FROM productos LIMIT 5;"
sqlite3 "$DB" ".mode line" "SELECT * FROM productos WHERE id = 1;"
```

## Queries de verificación por dominio

### Productos

```bash
# Productos por tipo
sqlite3 -header -column "$DB" "
  SELECT tipo, COUNT(*) AS total
  FROM productos
  WHERE activo = 1
  GROUP BY tipo;
"

# Producto con todas sus presentaciones y precios
sqlite3 -header -column "$DB" "
  SELECT p.id, p.nombre, p.tipo, pres.nombre AS presentacion, pv.valor AS precio, m.simbolo AS moneda
  FROM productos p
  JOIN presentaciones pres ON pres.producto_id = p.id
  LEFT JOIN precios_venta pv ON pv.presentacion_id = pres.id AND pv.activo = 1
  LEFT JOIN monedas m ON m.id = pv.moneda_id
  WHERE p.id = 42;
"

# Recetas con costo y precio principal
sqlite3 -header -column "$DB" "
  SELECT r.id, r.nombre, r.costo_calculado, r.rendimiento, r.unidad_rendimiento
  FROM recetas r
  WHERE r.activo = 1
  ORDER BY r.id;
"

# Ingredientes de una receta
sqlite3 -header -column "$DB" "
  SELECT ri.id, p.nombre AS ingrediente, ri.cantidad, ri.unidad, ri.costo_unitario, ri.costo_total
  FROM receta_ingredientes ri
  JOIN productos p ON p.id = ri.ingrediente_id
  WHERE ri.receta_id = 5 AND ri.activo = 1;
"

# Variaciones (RecetaPresentacion) de un producto
sqlite3 -header -column "$DB" "
  SELECT rp.id, rp.nombre_generado, rp.sku, rp.costo_calculado, pres.nombre AS presentacion, s.nombre AS sabor
  FROM recetas_presentaciones rp
  JOIN presentaciones pres ON pres.id = rp.presentacion_id
  JOIN sabores s ON s.id = rp.sabor_id
  WHERE pres.producto_id = 100;
"
```

### Ventas / PdV

```bash
# Ventas abiertas en una caja
sqlite3 -header -column "$DB" "
  SELECT v.id, v.estado, m.numero AS mesa, v.created_at, COUNT(vi.id) AS items
  FROM ventas v
  LEFT JOIN pdv_mesas m ON m.id = v.mesa_id
  LEFT JOIN venta_items vi ON vi.venta_id = v.id AND vi.estado = 'ACTIVO'
  WHERE v.caja_id = 5 AND v.estado = 'ABIERTA'
  GROUP BY v.id;
"

# Items de una venta con personalización
sqlite3 -header -column "$DB" "
  SELECT vi.id, p.nombre, vi.cantidad, vi.precio_venta_unitario, vi.precio_adicionales,
         vi.descuento_unitario, vi.estado
  FROM venta_items vi
  JOIN productos p ON p.id = vi.producto_id
  WHERE vi.venta_id = 123
  ORDER BY vi.id;
"

# Sabores de una pizza
sqlite3 "$DB" "
  SELECT vis.id, rp.nombre_generado AS variacion, vis.proporcion, vis.precio_referencia
  FROM venta_item_sabores vis
  JOIN recetas_presentaciones rp ON rp.id = vis.receta_presentacion_id
  WHERE vis.venta_item_id = 456;
"

# Mesas colgadas (estado=OCUPADO sin venta abierta)
sqlite3 -header -column "$DB" "
  SELECT m.id, m.numero, m.estado
  FROM pdv_mesas m
  LEFT JOIN ventas v ON v.mesa_id = m.id AND v.estado = 'ABIERTA'
  WHERE m.estado = 'OCUPADO' AND v.id IS NULL;
"

# Stock movimientos de una venta
sqlite3 -header -column "$DB" "
  SELECT sm.id, p.nombre, sm.cantidad, sm.tipo, sm.tipo_referencia, sm.fecha, sm.activo
  FROM stock_movimientos sm
  JOIN productos p ON p.id = sm.producto_id
  WHERE sm.tipo_referencia = 'VENTA' AND sm.referencia = 123;
"

# Stock actual de un producto (suma movimientos activos)
sqlite3 "$DB" "
  SELECT
    SUM(CASE WHEN tipo IN ('COMPRA','AJUSTE_POSITIVO','PRODUCCION_ENTRADA') THEN cantidad
             WHEN tipo IN ('VENTA','AJUSTE_NEGATIVO','PRODUCCION_SALIDA','DESCARTE') THEN -cantidad
             ELSE 0 END) AS stock_actual
  FROM stock_movimientos
  WHERE producto_id = 42 AND activo = 1;
"
```

### Compras

```bash
# Compras con estado de pago
sqlite3 -header -column "$DB" "
  SELECT c.id, c.numero_nota, c.estado, c.total, c.credito, prov.nombre AS proveedor,
         cpp.estado AS cpp_estado, cpp.monto_pagado
  FROM compras c
  LEFT JOIN proveedores prov ON prov.id = c.proveedor_id
  LEFT JOIN cuentas_por_pagar cpp ON cpp.compra_id = c.id
  WHERE c.activo = 1
  ORDER BY c.id DESC LIMIT 20;
"

# Cuotas pendientes de una compra
sqlite3 -header -column "$DB" "
  SELECT cu.numero, cu.fecha_vencimiento, cu.monto, cu.monto_pagado, cu.estado
  FROM cuentas_por_pagar_cuotas cu
  WHERE cu.cuenta_por_pagar_id = (SELECT id FROM cuentas_por_pagar WHERE compra_id = 5);
"
```

### Caja Mayor

```bash
# Saldo actual por moneda y forma de pago
sqlite3 -header -column "$DB" "
  SELECT cm.nombre AS caja, m.simbolo AS moneda, fp.nombre AS forma_pago, sa.saldo
  FROM caja_mayor_saldos sa
  JOIN cajas_mayor cm ON cm.id = sa.caja_mayor_id
  JOIN monedas m ON m.id = sa.moneda_id
  JOIN formas_pago fp ON fp.id = sa.forma_pago_id
  WHERE cm.estado = 'ABIERTA';
"

# Movimientos de hoy
sqlite3 -header -column "$DB" "
  SELECT mov.id, mov.tipo_movimiento, m.simbolo, fp.nombre AS fp, mov.monto, mov.fecha,
         CASE WHEN mov.referencia_anulacion_id IS NOT NULL THEN 'ANULACION' ELSE '' END AS flag
  FROM caja_mayor_movimientos mov
  JOIN monedas m ON m.id = mov.moneda_id
  JOIN formas_pago fp ON fp.id = mov.forma_pago_id
  WHERE date(mov.fecha) = date('now', 'localtime')
  ORDER BY mov.fecha DESC;
"

# Movimientos huérfanos (FK rota) — debug
sqlite3 -header -column "$DB" "
  SELECT id, tipo_movimiento, compra_id, vale_id, liquidacion_sueldo_id
  FROM caja_mayor_movimientos
  WHERE compra_id IS NOT NULL
    AND compra_id NOT IN (SELECT id FROM compras);
"
```

### RRHH

```bash
# Funcionarios activos con cargo
sqlite3 -header -column "$DB" "
  SELECT f.id, p.nombre || ' ' || COALESCE(p.apellido, '') AS funcionario,
         c.nombre AS cargo, f.salario_base, f.activo
  FROM funcionarios f
  JOIN personas p ON p.id = f.persona_id
  JOIN cargos c ON c.id = f.cargo_id
  WHERE f.activo = 1
  ORDER BY p.nombre;
"

# Vales pendientes de un funcionario
sqlite3 -header -column "$DB" "
  SELECT v.id, v.fecha, v.monto, v.estado, v.es_adelanto
  FROM vales v
  WHERE v.funcionario_id = 5 AND v.estado IN ('SOLICITADO', 'CONFIRMADO');
"

# Liquidaciones del mes
sqlite3 -header -column "$DB" "
  SELECT l.id, p.nombre AS funcionario, l.periodo, l.total_haberes, l.total_descuentos, l.total_neto, l.estado
  FROM liquidaciones_sueldo l
  JOIN funcionarios f ON f.id = l.funcionario_id
  JOIN personas p ON p.id = f.persona_id
  WHERE l.periodo = '2026-04'
  ORDER BY p.nombre;
"

# Asistencias con tardanza del mes
sqlite3 -header -column "$DB" "
  SELECT a.fecha, p.nombre AS funcionario, a.estado, a.minutos_tardanza, a.justificada
  FROM asistencias a
  JOIN funcionarios f ON f.id = a.funcionario_id
  JOIN personas p ON p.id = f.persona_id
  WHERE a.estado = 'TARDANZA' AND a.fecha LIKE '2026-04-%'
  ORDER BY a.fecha DESC;
"

# Penalizaciones auto-generadas no anuladas
sqlite3 "$DB" "
  SELECT COUNT(*) AS total
  FROM penalizaciones
  WHERE auto_generada = 1 AND anulada = 0;
"
```

### Personas / Auth

```bash
# Sesiones activas
sqlite3 -header -column "$DB" "
  SELECT s.id, u.nickname, s.login_time, s.last_activity_time, s.browser, s.os
  FROM login_sessions s
  JOIN usuarios u ON u.id = s.usuario_id
  WHERE s.is_active = 1
  ORDER BY s.login_time DESC;
"

# Permisos efectivos de un usuario
sqlite3 "$DB" "
  SELECT DISTINCT pe.codigo, pe.modulo
  FROM usuarios u
  JOIN usuario_roles ur ON ur.usuario_id = u.id
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN permissions pe ON pe.id = rp.permission_id
  WHERE u.id = 1
  ORDER BY pe.modulo, pe.codigo;
"
```

## Updates manuales (con cuidado)

Ejemplos de "fix manual" que a veces son necesarios. Hacer **backup** antes.

```bash
DB="$HOME/Library/Application Support/frc-gourmet/frc-gourmet.db"

# Liberar mesa colgada en OCUPADO sin venta abierta
sqlite3 "$DB" "
  UPDATE pdv_mesas SET estado = 'DISPONIBLE'
  WHERE estado = 'OCUPADO'
    AND id NOT IN (SELECT mesa_id FROM ventas WHERE estado = 'ABIERTA' AND mesa_id IS NOT NULL);
"

# Reactivar usuario admin
sqlite3 "$DB" "UPDATE usuarios SET activo = 1 WHERE nickname = 'admin';"

# Recalcular saldos: usar el handler `recalcular-saldos` desde la UI o crear un wrapper
```

⚠️ Nunca hacer `UPDATE` o `DELETE` mientras la app está abierta — el proceso Electron tiene la BD lockeada. Cerrar primero.

## Schema dump

```bash
# Schema completo
sqlite3 "$DB" ".schema" > schema-current.sql

# Solo de un dominio
sqlite3 "$DB" ".schema" | grep -A 20 "CREATE TABLE compras"
```

## Migración manual de columna

Si `synchronize` no aplica un cambio (raro, pero pasa con tipos incompatibles):

```bash
# 1. Backup
cp "$DB" "$DB.bak-$(date +%Y%m%d)"

# 2. Cerrar Electron

# 3. Aplicar manualmente
sqlite3 "$DB" "ALTER TABLE compras ADD COLUMN motivo_anulacion TEXT;"

# 4. Reabrir Electron — synchronize verá la columna y no la tocará
```

Para cambios incompatibles (cambio de tipo, drop de NOT NULL), SQLite obliga a recrear la tabla. Usar el handler de TypeORM `synchronize` (con backup) o:

```sql
BEGIN TRANSACTION;
CREATE TABLE compras_new ( ... nuevo schema ... );
INSERT INTO compras_new SELECT ... FROM compras;
DROP TABLE compras;
ALTER TABLE compras_new RENAME TO compras;
COMMIT;
```

## Cliente GUI

Si preferís UI: **DB Browser for SQLite** (`brew install --cask db-browser-for-sqlite`) abre el `.db` y permite editar tablas + ejecutar SQL. Cuidado con concurrencia — cerrar Electron primero.
