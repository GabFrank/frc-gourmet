# Migraciones de schema

> **TL;DR:** F1.5 eliminó `synchronize:true` definitivamente. Toda nueva entity exige migración generada con `npm run migration:generate`. Sin migración no hay schema.

## Modelo

| Entorno | `synchronize` | Migraciones |
|---|---|---|
| Cualquiera (dev / packaged / postgres / sqlite) | **false** | corren al iniciar |

Tabla de tracking: **`typeorm_migrations`** (mismo nombre en SQLite y Postgres).

`DatabaseService.initialize()` aplica migrations pendientes con `transaction: 'each'`. Para SQLite, copia el `.db` a `<userData>/backups/...premigrate_<ts>.db` antes de migrar (no aplica a Postgres — usuario hace `pg_dump` externo).

## Naming y timestamp (regla)

Nombre de archivo: **`<epoch-millis>-<Descripcion>.ts`**, con la clase `Descripcion<epoch-millis>` (ej. `1782606189440-AddNotificaciones.ts` → `class AddNotificaciones1782606189440`).

- **El timestamp DEBE ser el epoch en milisegundos real** (precisión de ms), no un número redondeado a mano.
  - `npm run migration:generate` / `migration:create` ya lo asignan solos (usan `Date.now()`). **No lo edites a un número redondo.**
  - Si escribís la migración a mano, generá el valor con:
    ```bash
    date +%s%3N
    ```
- **Por qué:** varias migraciones viejas usan timestamps redondeados espaciados de a `1e8` (`...100000000`, `...500000000`). Eso hace que dos ramas no mergeadas elijan el "siguiente número redondo" y **colisionen** al integrar. Un epoch-ms real es único y, al ser mayor que cualquier redondeado previo, **ordena correctamente** al final. **No imites los timestamps redondeados.**
- Registrá la clase en `getMigrations()` de `database.config.ts` (la usan tanto el runtime como el CLI vía `getDataSourceOptions`).

## Flujo developer

1. Modificar entity (agregar columna, índice, tabla, etc.).
2. Generar migración:
   ```bash
   npm run migration:generate -- src/app/database/migrations/AgregarCampoXEnY
   ```
   El CLI compara la BD temporal (`.tmp/cli-frc-gourmet.db`) con tus entities y produce el SQL diff. Si la BD temp no existe se crea vacía y la migración generada va a contener CREATE TABLE para todo (no es lo que querés a menos que sea baseline).

   Para diff incremental contra la BD que ya tiene migrations aplicadas:
   ```bash
   # 1. Asegurar BD temp con migrations al día
   rm -f .tmp/cli-frc-gourmet.db
   npm run migration:run

   # 2. Generar diff
   npm run migration:generate -- src/app/database/migrations/AgregarCampoXEnY
   ```
3. Revisar el SQL generado. **Reglas:**
   - Migración aditiva (no DROP, no RENAME directo).
   - Para renombrar: agregar nueva → backfill → mantener vieja una versión → DROP en versión siguiente.
   - Idempotente cuando se pueda (`IF NOT EXISTS`).
4. Importar la migración en `database.config.ts:getMigrations()`:
   ```ts
   import { AgregarCampoXEnY1730000000000 } from './migrations/1730000000000-AgregarCampoXEnY';
   function getMigrations(): Function[] {
     return [Baseline1778357391461, AgregarCampoXEnY1730000000000];
   }
   ```
5. Probar en dev: `npm start`. La migración corre al arranque, log `[DB] Aplicando migraciones pendientes...`.
6. Commit con `feat(db): agregar campo X en Y` o `fix(db): ...`.

## Backup automático pre-migration (SQLite)

Antes de aplicar migraciones, `DatabaseService` copia el `.db` a:

```
<userData>/backups/frc-gourmet-backup_premigrate_<ISO-timestamp>.db
```

Si falla la migración, el archivo queda intacto. Restaurable desde Sistema → Backups.

> Postgres no tiene este step. Hacé `pg_dump` antes de un upgrade que aplique migrations en prod.

## Baselines (dual driver — F1.4)

Dos baselines coexisten porque `migration:generate` produce SQL específico al driver target. `getMigrations()` en `database.config.ts` elige cuál cargar según el driver activo:

| Archivo | Driver | Notas |
|---|---|---|
| `1778378410416-Baseline.ts` | SQLite | `INTEGER PRIMARY KEY AUTOINCREMENT`, `datetime`, `datetime('now')`, CHECK constraints para enums |
| `1778380893207-BaselinePostgres.ts` | Postgres | `SERIAL`, `TIMESTAMP`, `now()`, `boolean true/false`, `text` para columnas enum (sin CHECK — validación a nivel app) |

Las **entities** son driver-agnósticas (sin `type: 'datetime'` explícito, decimals con precision en lugar de float). Migraciones incrementales post-baseline pueden ser portables si se generan contra cada driver y se mergean (o se escriben con guard `if (queryRunner.connection.options.type === 'postgres')`).

Historial de regeneraciones:
- `Initial1778266131852` (deploy-infra, era synchronize)
- `Baseline1778357391461` (F1.5 — regeneró desde cero, eliminando synchronize)
- `Baseline1778378410416` (F1.4 — entities driver-agnósticas, baseline SQLite)
- `BaselinePostgres1778380893207` (F1.4 — baseline Postgres correspondiente)

> ⚠️ Si tu BD dev fue creada con synchronize antes de F1.5: **resetear** vía `Sistema → Backup → Reset BD` antes del primer arranque post-F1.5. La baseline va a fallar con "table already exists" sobre tablas que synchronize ya creó.
>
> Si tu BD dev arrancó con la baseline F1.5 (`Baseline1778357391461`): hacer un `UPDATE typeorm_migrations SET name='Baseline1778378410416', timestamp=1778378410416 WHERE name='Baseline1778357391461'` antes de arrancar, sino la nueva baseline va a fallar igual con "table already exists".

A partir de F1.4, **nunca más** regenerar baseline. Solo agregar migraciones incrementales encima.

### Generar baseline Postgres (referencia)

Si en el futuro hay que regenerar la baseline Postgres, los pasos son:

```bash
# 1. Crear BD Postgres vacía
createdb frc_gourmet_baseline_pg

# 2. Generar baseline contra ella (env vars del datasource CLI)
FRC_DB_TYPE=postgres FRC_PG_DATABASE=frc_gourmet_baseline_pg FRC_PG_USERNAME=$USER \
  TS_NODE_PROJECT=tsconfig.typeorm.json \
  npm run migration:generate -- src/app/database/migrations/BaselinePostgres

# 3. Validar corriéndola
FRC_DB_TYPE=postgres FRC_PG_DATABASE=frc_gourmet_baseline_pg FRC_PG_USERNAME=$USER \
  TS_NODE_PROJECT=tsconfig.typeorm.json \
  npm run migration:run

# 4. Cleanup
dropdb frc_gourmet_baseline_pg
```

## CLI rápido

```bash
npm run migration:show       # listar pendientes/aplicadas
npm run migration:run        # aplicar pendientes
npm run migration:revert     # revertir la última (cuidado en SQLite)
npm run migration:create -- src/app/database/migrations/MigracionVacia   # vacía para SQL a mano
```

Apuntar el CLI a la BD real (riesgoso, hacelo solo para inspección):

```bash
FRC_DB_PATH="/Users/$USER/Library/Application Support/frc-gourmet/frc-gourmet.db" npm run migration:show
```

## Limitaciones SQLite

- `ALTER TABLE DROP COLUMN` desde SQLite 3.35 (incluido en sqlite3 npm 5.1+).
- `ALTER TABLE RENAME COLUMN` desde 3.25.
- Para cambios complejos (alterar tipo, multiples drops), TypeORM usa el patrón "create new table, copy data, drop old, rename" — reescribe la tabla completa y puede ser lento con datos.
- Probá siempre en una copia de la BD real antes de mergear.

## Postgres

**Estado actual (post-F1.4):** Postgres soportado fresh install. `getMigrations()` elige `BaselinePostgres1778380893207` cuando el driver es postgres, y `Baseline1778378410416` cuando es sqlite. Validado con `migration:run` contra una Postgres vacía → 150 tablas creadas, FKs correctos.

Migraciones incrementales (post-baseline) deben ser portables. Dos approaches:

1. **Driver-aware migration** — escribir SQL distinto según `queryRunner.connection.options.type`:
    ```ts
    public async up(queryRunner: QueryRunner): Promise<void> {
      const isPg = queryRunner.connection.options.type === 'postgres';
      await queryRunner.query(isPg
        ? `ALTER TABLE foo ADD COLUMN bar TIMESTAMP`
        : `ALTER TABLE foo ADD COLUMN bar datetime`
      );
    }
    ```
2. **Object API de TypeORM** — usar `Table`, `TableColumn`, `queryRunner.addColumn()` que TypeORM traduce per-driver. Más mantenible para cambios chicos.

Limitaciones conocidas:
- Postgres baseline usa `text` (sin CHECK) para columnas enum — la validación queda en TypeScript app-side. SQLite baseline usa `varchar CHECK(... IN (...))` que sí valida en BD.
- SQL específico de SQLite (ej. `datetime('now')`) puede romper.
- Tipos: el generator usa types portable cuando puede, pero validar la migración manualmente si la app va a Postgres.
- F1.4 (entities Postgres-compat) está pendiente — todavía no garantizamos paridad.

## Qué NO hacer

- Modificar una migración ya merged → generar otra que la corrija.
- DROP/RENAME en una sola migración sin estrategia de 2 versiones.
- Subir migraciones que dependan de datos que pueden no existir (validar con `IF EXISTS`).
- Saltarse el backup pre-migration (siempre debe correr en SQLite).
- Volver a habilitar `synchronize:true` aunque sea "solo en dev".
