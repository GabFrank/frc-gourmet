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
- **Naming de migración nueva:** `<epoch-millis>-<Descripcion>.ts` con clase `Descripcion<epoch-millis>`. El timestamp debe ser **epoch-ms real** (`date +%s%3N` en Linux; en macOS `python3 -c "import time;print(int(time.time()*1000))"`, porque `%3N` es GNU — ver [conventions/pitfalls-typeorm-electron.md](../conventions/pitfalls-typeorm-electron.md)), nunca un número redondeado a mano. (Las migraciones incrementales ya existentes usan números redondeados — son legacy, no imitarlas.)

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

### ⚠️ En SQLite, dos `dataSource.transaction()` intercalados son UNA transacción

Esto no es un detalle de performance, es una trampa de correctitud que se
descubrió **midiendo** (Fase 2 del guard de caja cerrada, 2026-09-28).

Con el driver `sqlite3` —el del modo standalone, o sea el default— TypeORM
mantiene **una sola conexión**. Dos `dataSource.transaction()` que se intercalan
terminan compartiendo la **misma transacción física**: el `ROLLBACK` de una
descarta también los `INSERT` de la otra. El caso real fue el doble click en
«ABRIR CAJA»: la segunda apertura reventaba contra el índice único, su rollback
se llevaba el INSERT de la ganadora, y quedaban **cero** cajas abiertas con el
mensaje «ya hay una caja abierta» — que además era falso.

Consecuencias prácticas, las dos:

1. **Serializar en memoria** lo que no puede intercalarse dentro del proceso:
   `withAperturaCajaLock(dispositivoId, fn)` (cola de promesas por clave, mismo
   patrón que `withMesaLock`). No reemplaza al control de base: entre dos procesos
   —dos Electron sobre el mismo archivo, dos nodos contra el mismo Postgres— el
   único control es el índice único.
2. **No agregar transacciones nuevas en SQLite sólo para tomar un lock que el
   driver ignora.** Para eso está **`enTransaccionSiPostgres(ds, fn)`**
   (`electron/utils/tx.utils.ts`):

```typescript
const guardado = await enTransaccionSiPostgres(dataSource, async (manager) => {
  await assertCajaAbierta(manager, cajaId, { lock: 'read' });
  return await manager.getRepository(GastoCaja).save(entity);
});
// el emit y los best-effort van ACÁ, después del commit
```

- **En Postgres abre transacción**, porque ahí cada una toma su propia conexión
  del pool y es lo **único** que hace efectivos los `FOR SHARE` / `FOR UPDATE`:
  `puedeBloquear()` exige una transacción activa, y fuera de una TypeORM lanza
  `PessimisticLockTransactionRequiredError`. Es lo que cierra el TOCTOU.
- **En SQLite corre el mismo cuerpo con el `manager` del `DataSource`**, sin
  transacción. No se pierde nada: el guard corre igual (sin un lock que el driver
  descartaba de todos modos) y el único escritor del proceso serializa de hecho.
- **Regla de uso:** el `fn` recibe el `manager` y **todo** lo que tenga que ser
  atómico va adentro; los emits SSE, los best-effort y lo que tarde (WhatsApp,
  impresión) van **afuera, después**. Pasarle el `DataSource` a un guard que
  corre dentro de una transacción lo convierte en un **no-op transaccional
  silencioso**.
- Hay también `enTransaccionActiva(manager)` para no anidar.

Lo usan hoy `update-caja`, los tres canales de gasto de caja,
`create-retiro-caja`, `createPago`, `createPagoDetalle` y
`cerrarVentasAbiertasMesa`. Los que ya abrían transacción propia antes de este
patrón (`createVenta`, `delivery-crear`, `transferir-venta-pdv`,
`registrarCobroParcial`) **no** se migraron: son los que definen el modo de falla
con el que hay que no intercalarse.

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

### Índices opcionales: el patrón del reintento en cada arranque

`src/app/database/indices-opcionales.ts` — `asegurarIndicesOpcionales(ds)`, que
`DatabaseService.initialize` llama **inmediatamente después de
`runPendingMigrations`**, en las dos ramas (sqlite y postgres).

Existe por un modo de falla que no es obvio. Un índice único que depende de que
los datos estén limpios no se puede garantizar desde una migración:

1. Si la migración **aborta** cuando encuentra duplicados, la instalación no
   arranca — las migraciones corren al inicio de la app. El repo ya tomó esta
   decisión antes; ver el comentario de
   `1787255528889-IndicesRucYReconciliarMesas` ("un UNIQUE fallaría y dejaría la
   app sin arrancar").
2. Si en cambio **loguea y hace `return`** —lo que hace
   `1790617935368-CajaUnicaAbiertaPorDispositivo`—, ⚠️ **TypeORM la marca como
   ejecutada igual**, porque el `up()` no lanzó. Y `runMigrations()` sólo corre
   las pendientes: aunque el operador después limpie los duplicados, **el índice
   no se crearía nunca más** y la instalación quedaría sin el control primario
   de su invariante, en silencio.

El reintento de arranque es lo que hace que "cerrá los duplicados" vuelva a ser
una instrucción que funciona: el mismo `CREATE UNIQUE INDEX IF NOT EXISTS`
corre en cada arranque, con el mismo pre-chequeo.

Reglas de la casa para todo lo que se agregue a ese archivo:

- **Nunca lanza.** Un `try/catch` que loguea. Arrancar la app no puede depender
  de un índice opcional.
- **Idempotente.** `IF NOT EXISTS` + pre-chequeo antes de cada intento.
- **Nunca toca filas de negocio.** Si los datos impiden el índice, se avisa con
  la lista concreta y la decisión queda en una persona.
- **SQL portable** entre SQLite y Postgres, o ramificado explícitamente.
- **Devuelve un resumen** (`{ cajaUnicaAbierta: 'ok' | 'duplicados' | 'error' }`)
  para que los tests puedan afirmar qué pasó; el arranque lo ignora.

⚠️ **Los índices parciales tratan los NULL como distintos** en los dos drivers,
así que el pre-chequeo tiene que filtrar la columna nulable o se vuelve en
contra: dos filas con `dispositivo_id IS NULL` **no** violan
`UQ_cajas_abierta_por_dispositivo`, pero un `GROUP BY` sin filtro las junta en un
grupo `null (2)` y bloquearía para siempre la creación del índice, con un log
que además le pide al operador cerrar cajas que no son el problema. De ahí el
`AND dispositivo_id IS NOT NULL` en `dispositivosConCajasDuplicadas()` y en la
migración.

⚠️ Una migración de este tipo **exporta su `name`** (p. ej.
`NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA`) para que el test que borra su fila de
`typeorm_migrations` y la vuelve a correr con duplicados sembrados no dependa de
un string duplicado: con el nombre hardcodeado en el test, cambiar el timestamp
dejaba el `DELETE` sin matchear y el bloque quedaba tautológico.

**Índices que hoy viven ahí:** `UQ_cajas_abierta_por_dispositivo` — una sola
caja `ABIERTO` por dispositivo. Detalle del invariante en
[../domains/financiero-caja-mayor.md](../domains/financiero-caja-mayor.md).

## Recalcular saldos de Caja Mayor

`recalcular-saldos` (`caja-mayor.handler.ts`) es el **safety net**: borra todos los `CajaMayorSaldo` y los reconstruye sumando todos los `CajaMayorMovimiento` activos. Útil cuando se sospecha desincronización (ej: tras un cambio manual en BD o un bug en una transacción no atómica).
