# Base de datos — TypeORM + SQLite

## Configuración

`src/app/database/database.config.ts:181-347`:

```typescript
{
  type: 'sqlite',
  database: path.join(userDataPath, 'frc-gourmet.db'),
  entities: [ /* ~170 clases listadas */ ],
  synchronize: true,        // ⚠️ DEV: auto-altera tablas al cambiar entidades
  logging: process.env['NODE_ENV'] === 'development',
  migrations: [],
}
```

- **Sin migraciones** — `synchronize: true` aplica diffs automáticamente. En prod esto sería un foot-gun, pero el proyecto trabaja sólo en local con un único usuario.
- **Backup obligatorio** antes de cambiar entidades. Ubicación del .db: `~/Library/Application Support/frc-gourmet/frc-gourmet.db` (macOS).

## Singleton DataSource

`src/app/database/database.service.ts`:

```typescript
DatabaseService.getInstance().initialize(userDataPath)
  .then(dataSource => { /* registrar handlers */ });
```

Cierre limpio en `app.on('window-all-closed')`: `dbService.close()` → `dataSource.destroy()`.

## BaseModel (común a TODAS las entidades)

`src/app/database/entities/base.entity.ts`:

```typescript
export abstract class BaseModel extends BaseEntity {
  @PrimaryGeneratedColumn() id!: number;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'created_by' }) createdBy?: any;
  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'updated_by' }) updatedBy?: any;
}
```

Convenciones:
- IDs auto-incrementales (`int`).
- Timestamps en columnas snake_case (`created_at`, `updated_at`).
- `createdBy`/`updatedBy` son FK a `Usuario` — populadas via `setEntityUserTracking()`.
- Strings que se guardan UPPERCASE (regla del proyecto, no de la BD).

## Helper user tracking

`electron/utils/entity.utils.ts`:

```typescript
async function setEntityUserTracking(
  dataSource: DataSource,
  entity: any,
  usuarioId: number | undefined,
  isUpdate: boolean
)
```

- Si `isUpdate=false` → asigna `createdBy = usuario`. Siempre asigna `updatedBy = usuario`.
- Si `usuarioId` es undefined: warning, continúa sin trackeo (compatible con seeders/migration).
- Llamar en cada handler **antes de `repo.save()`**.

## Soft delete vs Hard delete

**Política mixta** (no unificada — TODO F-4):

- **Soft delete** (`activo = false`): Persona, Usuario, Role, Cliente, TipoPrecio, FormasPago, Producto, Familia/Subfamilia, Cargo, Funcionario, Turno, etc.
- **Hard delete con checks**: Moneda, Dispositivo, Compra (anular en lugar de borrar), Venta (cancelar).
- **CASCADE FK**: VentaItem (al borrar Venta), CompraDetalle (al borrar Compra), Sub-componentes de receta (RecetaIngrediente, etc.).

Antes de eliminar, los handlers chequean dependencias y devuelven `{ success: false, message: 'No se puede eliminar...' }` si hay referencias activas.

## Transacciones atómicas

Operaciones que tocan múltiples entidades (creación de Compra que actualiza stock + costo + ProveedorProducto + CPP) usan **QueryRunner**:

```typescript
const queryRunner = dataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();
try {
  // ... múltiples ops con queryRunner.manager
  await queryRunner.commitTransaction();
} catch (e) {
  await queryRunner.rollbackTransaction();
  throw e;
} finally {
  await queryRunner.release();
}
```

**Casos clave que usan transacción:**
- `finalizar-compra` (compras.handler) — stock + costo promedio ponderado + ProveedorProducto + CPP + cuotas + estado.
- `confirmar-vale`, `pagar-cpp-cuota`, `pagar-liquidacion` (RRHH) — entidad origen + CajaMayorMovimiento + actualizarSaldoCajaMayor.
- `anular-liquidacion-sueldo` — revierte vales + cuotas + aguinaldos + comisiones + contra-mov caja mayor.
- `set-role-permissions` — delete + insert atómico.

**Helper crítico:** `actualizarSaldoCajaMayor(qr, cajaMayorId, monedaId, formaPagoId, monto, tipoMovimiento)` en `electron/handlers/caja-mayor-utils.ts`. Único punto de actualización de `CajaMayorSaldo`. Llamarlo siempre dentro de la misma transacción que crea el `CajaMayorMovimiento`.

## Mapa de dominios y cantidades

| Dominio | Entidades | Handler principal |
|---|---|---|
| **personas** | 9 (Persona, Usuario, Role, UsuarioRole, Permission, RolePermission, Cliente, TipoCliente, LoginSession) | personas.handler, auth.handler, permissions.handler |
| **personalizacion** | 1 (DashboardShortcut) | dashboard-shortcuts.handler |
| **productos** | ~30 (Familia, Subfamilia, Producto, Presentacion, Receta, Sabor, Combo, Promocion, Producción, etc.) | productos.handler, recetas.handler, sabores.handler, receta-presentacion.handler |
| **ventas** | 22 (Venta, VentaItem, VentaItemSabor, Comanda, Mesa, Sector, Reserva, Delivery, PdvAtajo*, PdvCategoria*, etc.) | ventas.handler |
| **compras** | 10 (Proveedor, ProveedorProducto, Compra, CompraDetalle, CompraCategoria, FormasPago, Pago/PagoDetalle [legacy]) | compras.handler |
| **financiero** | ~30 (Moneda, Caja, Conteo, CajaMayor, CajaMayorMovimiento, CajaMayorSaldo, Gasto, RetiroCaja, EntradaVaria, OperacionFinanciera, CuentaBancaria, MaquinaPos, AcreditacionPos, MovimientoBancario, Chequera, Cheque, CuentaPorPagar, CuentaPorCobrar, MovimientoCliente, etc.) | financiero, caja-mayor, banking, cuentas-por-pagar, cuentas-por-cobrar, movimientos-cliente |
| **rrhh** | ~40 (Funcionario, Cargo, HistoricoCargo, HistoricoSalario, Turno, Asistencia, Penalizacion, Feriado, HoraExtra, Vale, MotivoVale, Aguinaldo, Bono, Vacacion, VacacionPeriodo, LiquidacionSueldo/Item/Concepto, LiquidacionFinal/Item, ReglaComision*, EquipoComision*, FuncionarioReglaComision, NotificacionRrhh, ConfiguracionRrhh, FuncionarioDocumento) | ~13 handlers RRHH |
| **auth** | 1 (LoginSession) | auth.handler |
| **printer** | 1 (Printer) | printers.handler |

→ Índice completo en [reference/entities-index.md](../reference/entities-index.md).

## Convenciones de naming

- **Tabla**: snake_case (`venta_items`, `caja_mayor_movimientos`).
- **Columna**: snake_case (`created_at`, `subfamilia_id`).
- **Entity class**: PascalCase, archivo en kebab-case (`venta-item.entity.ts` exporta `VentaItem`).
- **FK columns**: `<entidad>_id` (`producto_id`, `caja_mayor_id`). Sin constraint formal en algunas (compraId, ventaId) para permitir `null` en datos legacy.
- **Booleanos**: prefijo `es*` o `is*` (`esIngrediente`, `isVenta`), o nombre plano (`activo`, `principal`).
- **Decimal**: `decimal(10, 2)` para montos PYG, `decimal(10, 3)` para cantidades, `decimal(14, 2)` para CPP/CPC, `decimal(18, 2)` para saldos cliente, `decimal(10, 4)` para tasas.

## Indices y unique constraints

Hay índices puntuales (no exhaustivo):
- `Permission.codigo` UNIQUE.
- `Receta.categoria` INDEX.
- `RecetaPresentacion (presentacion, sabor)` UNIQUE COMPOSITE.
- `Asistencia (funcionario, fecha)` INDEX.
- `Vacacion (funcionario, anioServicio)` INDEX.
- `Feriado.fecha` UNIQUE.
- `LiquidacionSueldo (funcionario, periodo)` INDEX.
- `NotificacionRrhh.claveDedupe` UNIQUE (para deduplicar notifs auto-generadas).

`CajaMayorSaldo` documenta unicidad lógica `(cajaMayor, moneda, formaPago)` pero **no tiene constraint formal** — la unicidad se valida en handler.

## Recalcular saldos de Caja Mayor

`recalcular-saldos` (caja-mayor.handler.ts:121) es el **safety net**: borra todos los `CajaMayorSaldo` y los reconstruye sumando todos los `CajaMayorMovimiento` activos. Útil cuando se sospecha desincronización (ej: tras un cambio manual en BD o un bug en una transacción no atómica).
