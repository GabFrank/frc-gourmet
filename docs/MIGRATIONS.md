# Migraciones de schema

> **TL;DR:** F1.5 eliminó `synchronize:true` definitivamente. Toda nueva entity exige migración generada con `npm run migration:generate`. Sin migración no hay schema.

## Modelo

| Entorno | `synchronize` | Migraciones |
|---|---|---|
| Cualquiera (dev / packaged / postgres / sqlite) | **false** | corren al iniciar |

Tabla de tracking: **`typeorm_migrations`** (mismo nombre en SQLite y Postgres).

`DatabaseService.initialize()` aplica migrations pendientes con `transaction: 'each'`. Para SQLite, copia el `.db` a `<userData>/backups/...premigrate_<ts>.db` antes de migrar (no aplica a Postgres — usuario hace `pg_dump` externo).

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

## Baseline (regenerada en F1.4 sobre F1.5)

La baseline actual es `1778378410416-Baseline.ts` — contiene CREATE TABLE para todas las ~170 entities. Es **SQLite-flavor** (TypeORM emite SQL específico del driver al generar). Generada desde entities ya driver-agnósticas (sin `type: 'datetime'` explícito, decimals con precision en lugar de float).

Historial de regeneraciones:
- `Initial1778266131852` (deploy-infra, era synchronize)
- `Baseline1778357391461` (F1.5 — regeneró desde cero, eliminando synchronize)
- `Baseline1778378410416` (F1.4 — regeneró tras hacer entities driver-agnósticas)

> ⚠️ Si tu BD dev fue creada con synchronize antes de F1.5: **resetear** vía `Sistema → Backup → Reset BD` antes del primer arranque post-F1.5. La baseline va a fallar con "table already exists" sobre tablas que synchronize ya creó.
>
> Si tu BD dev arrancó con la baseline F1.5 (`Baseline1778357391461`): hacer un `UPDATE typeorm_migrations SET name='Baseline1778378410416', timestamp=1778378410416 WHERE name='Baseline1778357391461'` antes de arrancar, sino la nueva baseline va a fallar igual con "table already exists".

A partir de F1.4, **nunca más** regenerar baseline. Solo agregar migraciones incrementales encima.

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

**Estado actual:** la baseline `Baseline1778378410416` es SQLite-flavor (TypeORM emite SQL específico al driver target durante `migration:generate`). NO corre en Postgres tal cual: tiene `datetime`, `datetime('now')`, `boolean DEFAULT (0)`, `integer PRIMARY KEY AUTOINCREMENT` que no son válidos en Postgres.

Para soportar fresh installs de Postgres se necesita una baseline alternativa generada contra Postgres. Approaches posibles:
1. Generar `BaselinePostgres<ts>.ts` con `FRC_DB_PATH` apuntando a una BD Postgres docker-compose, y modificar `getMigrations()` en `database.config.ts` para devolver una u otra baseline según `options.type`.
2. Reescribir baseline a mano usando la Object API de TypeORM (`new Table({...})`, `queryRunner.createTable()`) que TypeORM traduce per-driver. Más mantenible si hay pocas entities, inmanejable con ~170.

Las **entities** ya son driver-agnósticas desde F1.4 (sin `type: 'datetime'` explícito, decimals con precision en lugar de float). Migraciones incrementales generadas a futuro pueden producir SQL portable si se generan contra el driver target.

Sin embargo:
- SQL específico de SQLite (ej. `datetime('now')`) puede romper.
- Tipos: el generator usa types portable cuando puede, pero validar la migración manualmente si la app va a Postgres.
- F1.4 (entities Postgres-compat) está pendiente — todavía no garantizamos paridad.

## Qué NO hacer

- Modificar una migración ya merged → generar otra que la corrija.
- DROP/RENAME en una sola migración sin estrategia de 2 versiones.
- Subir migraciones que dependan de datos que pueden no existir (validar con `IF EXISTS`).
- Saltarse el backup pre-migration (siempre debe correr en SQLite).
- Volver a habilitar `synchronize:true` aunque sea "solo en dev".
