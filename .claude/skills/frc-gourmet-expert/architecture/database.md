# Base de datos — TypeORM dual driver (SQLite / Postgres)

## Configuración

`src/app/database/database.config.ts` — `getDataSourceOptions(userDataPath, override?)`:

```typescript
const driverType: 'sqlite' | 'postgres' = override?.type === 'postgres' ? 'postgres' : 'sqlite';
const shared = {
  entities: getEntitiesList(),       // 157 clases (incl. base abstracta)
  synchronize: false,                 // ⚠️ toda nueva entity requiere migration
  logging: process.env['NODE_ENV'] === 'development',
  migrations: getMigrations(driverType),   // dual baseline: elige SQLite o Postgres
  migrationsRun: false,
  migrationsTableName: 'typeorm_migrations',
};

if (override?.type === 'postgres') return { type: 'postgres', host, port, database, username, password, schema, ssl, ...shared };
return { type: 'sqlite', database: dbPath, ...shared };
```

- **`synchronize: false`** — NO hay auto-DDL. Toda entity nueva exige migration registrada en `getMigrations()`.
- **`migrations/` tiene dual baseline:**
  - `1778378410416-Baseline.ts` → clase `Baseline1778378410416` (SQLite)
  - `1778380893207-BaselinePostgres.ts` → clase `BaselinePostgres1778380893207` (Postgres)
  - `getMigrations(driver)` devuelve la baseline del driver correcto + las migraciones incrementales (compartidas, deben ser portables a ambos drivers, ver patterns en [conventions/pitfalls-typeorm-electron.md](../conventions/pitfalls-typeorm-electron.md)).
- **Las migraciones corren al arranque** dentro de `DatabaseService.runMigrations` (tras backup pre-migrate).
- **Naming de migración nueva:** `<epoch-millis>-<Descripcion>.ts` con clase `Descripcion<epoch-millis>`. El timestamp debe ser **epoch-ms real** (`date +%s%3N`), nunca un número redondeado a mano. (Las migraciones incrementales ya existentes usan números redondeados — son legacy, no imitarlas.)

### SQLite default
- Path: `app.getPath('userData') + '/frc-gourmet.db'`. macOS: `~/Library/Application Support/frc-gourmet/`.
- La app CREA el archivo si no existe.

### Postgres
- **La app SÍ crea la BD + el rol/usuario** automáticamente. El handler `db-config-init-postgres` (en `electron/handlers/db-config.handler.ts`) se conecta con el superusuario a la DB `postgres` del sistema y corre `CREATE ROLE` + `CREATE DATABASE OWNER` + `GRANT ALL PRIVILEGES`. Idempotente: si ya existen, no falla; si el rol existe, actualiza la password. Las credenciales del superusuario NO se persisten — solo viven en RAM durante la llamada.
- **Único pre-requisito del operador:** instalar el servidor Postgres (installer GUI de EnterpriseDB en Windows, paquete nativo en Linux, o Docker). No hace falta tocar pgAdmin ni correr `CREATE DATABASE` manualmente.
- App-settings persisten en `userData/app-settings.json`. Password del rol target va a **keytar** (no al JSON). La del superusuario NO se guarda.
- Cambiar driver desde UI: *Sistema → Configuración BD* → completar superuser + target → botón **"Inicializar BD"** (crea rol+BD) → **"Probar conexión"** → **"Guardar"** → reinicio.
- Al primer arranque con Postgres y BD recién creada: corre `BaselinePostgres` + incrementales + seeds. Listo para login `admin/admin`.
- Setup completo en PC nueva → [../workflows/setup-pc-nueva.md](../workflows/setup-pc-nueva.md).

**⚠️ Gotcha del bundle:** `pg` (driver Node.js) debe estar en `dependencies` (NO en `optionalDependencies`). El workflow de release usa `npm ci --omit=optional` para evitar compilar `canvas` transitivo de `pdfjs-dist`; si `pg` está en optional, queda fuera del bundle del `.exe` y la app empaquetada tira `"postgres package has not been found"` al intentar conectar. Fix histórico: PR #24 / v1.1.1. Más detalle → [../conventions/pitfalls-typeorm-electron.md](../conventions/pitfalls-typeorm-electron.md).

### Postgres compat (gotchas frecuentes)
- Helper `dbQuery(qr, sqlLite, sqlPg)` cuando el SQL difiere.
- Postgres: booleans = `= true/false` (no `= 1`), LIKE → `UPPER(...) LIKE UPPER(...)`, evitar `sqlite_master` / `PRAGMA`.
- Memoria: `feedback_postgres_compat_patterns.md`.

## Singleton DataSource

`src/app/database/database.service.ts`:

```typescript
DatabaseService.getInstance().initialize(userDataPath)
  .then(dataSource => { /* registrar handlers */ });
```

`initialize` lee `app-settings.json` para decidir driver, hace backup pre-migrate, corre migrations, y emite `dataSource` listo para que `main.ts` registre handlers + dispare seeds.

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

Conteo por carpeta de `src/app/database/entities/` (157 archivos `*.entity.ts` en total, incluye `base.entity.ts` abstracto):

| Carpeta | Entidades | Handlers principales |
|---|---:|---|
| **personas** | 9 (Persona, Usuario, Role, UsuarioRole, Permission, RolePermission, Cliente, TipoCliente, ...) | personas, auth, permissions |
| **auth** | 2 (LoginSession + refresh/sesión) | auth |
| **personalizacion** | 2 (DashboardShortcut, ...) | dashboard-shortcuts |
| **productos** | 33 (Familia, Subfamilia, Producto, Presentacion, Receta, Sabor, Combo, Promocion, Produccion, etc.) | productos, recetas, sabores, receta-presentacion |
| **ventas** | 24 (Venta, VentaItem, VentaItemSabor, Comanda, PdvMesa, Sector, Reserva, Delivery, PdvAtajo*, PdvConfig, etc.) | ventas, kds |
| **compras** | 12 (Proveedor, ProveedorProducto, Compra, CompraDetalle, CompraCategoria, FormasPago, DocumentoCompraImportado, OcrAlias*, ...) | compras, cuentas-por-pagar, factura-import |
| **financiero** | 35 (Moneda, Caja, Conteo, CajaMayor*, Gasto, RetiroCaja, EntradaVaria, OperacionFinanciera, CuentaBancaria, MaquinaPos, AcreditacionPos, Chequera, Cheque, CuentaPorPagar/Cobrar*, MovimientoCliente, Convenio*, etc.) | financiero, caja-mayor, banking, cuentas-por-pagar, cuentas-por-cobrar, movimientos-cliente, convenios |
| **rrhh** | 34 (Funcionario, Cargo, Turno, Asistencia, Penalizacion, Feriado, HoraExtra, Vale, Aguinaldo, Bono, Vacacion*, LiquidacionSueldo*, LiquidacionFinal*, ReglaComision*, EquipoComision*, NotificacionRrhh, ConfiguracionRrhh, ...) | ~14 handlers RRHH + comisiones |
| **ia** | 2 (config OCR/IA) | factura-import |
| **sistema / shared** | 2 (documentos, adjuntos polimórficos, etc.) | documentos-tickets, adjuntos, empresa |
| **(top-level)** | Printer + base.entity (abstracta) | printers |

→ Índice completo y exacto en [reference/entities-index.md](../reference/entities-index.md).

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

`recalcular-saldos` (`caja-mayor.handler.ts`) es el **safety net**: borra todos los `CajaMayorSaldo` y los reconstruye sumando todos los `CajaMayorMovimiento` activos. Útil cuando se sospecha desincronización (ej: tras un cambio manual en BD o un bug en una transacción no atómica).
