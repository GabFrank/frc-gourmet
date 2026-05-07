# Migraciones de schema

> **TL;DR:** En dev `synchronize: true` (TypeORM ajusta tablas solo). En prod la app usa migraciones versionadas + backup automático antes de cada migración.

## Modelo

| Entorno | `synchronize` | Migraciones |
|---|---|---|
| Dev local (`npm start`) | true | no corren |
| App empaquetada (.dmg / .exe / .AppImage) | false | corren al iniciar |
| Primer arranque empaquetado, BD inexistente | true (bootstrap) | marcadas como aplicadas |

Detección: `app.isPackaged` (de Electron) o `NODE_ENV=production`. Ver `database.config.ts:isPackagedApp()`.

Tabla de tracking en SQLite: **`typeorm_migrations`**.

## Flujo developer

1. Modificar entity (agregar columna, índice, tabla, etc.).
2. **No** correr la app aún (synchronize la aplicaría sin migración).
3. Generar migración:
   ```bash
   npm run migration:generate -- src/app/database/migrations/AgregarCampoXEnY
   ```
4. Revisar el SQL generado. **Reglas:**
   - Migración aditiva (no DROP, no RENAME directo).
   - Para renombrar: agregar nueva → backfill → mantener vieja una versión → DROP en versión siguiente.
   - Idempotente cuando se pueda (`IF NOT EXISTS`).
5. Importar la migración en `database.config.ts:getMigrations()`:
   ```ts
   import { AgregarCampoXEnY1730000000000 } from './migrations/1730000000000-AgregarCampoXEnY';
   function getMigrations(): Function[] {
     return [AgregarCampoXEnY1730000000000];
   }
   ```
6. Probar en dev: `npm start`. En dev synchronize ya aplicó el cambio, la migración no corre. Para probar la migración, simular prod:
   ```bash
   ELECTRON_IS_PACKAGED=1 npm run electron:local
   ```
7. Commit con `feat(db): agregar campo X en Y` o `fix(db): ...`.

## Backup automático pre-migration

Antes de aplicar migraciones pendientes en prod, `DatabaseService.initialize()` copia `frc-gourmet.db` a:

```
<userData>/backups/frc-gourmet-backup_premigrate_<ISO-timestamp>.db
```

Si falla la migración, el archivo queda intacto y es restaurable manualmente desde Sistema → Backups.

## Generar baseline (primer release)

Antes del primer `1.0.0` que llegue a otros usuarios:

```bash
rm -rf .tmp/cli-frc-gourmet.db
npm run migration:generate -- src/app/database/migrations/Initial
```

El archivo `<timestamp>-Initial.ts` contiene todas las CREATE TABLE actuales. Importarlo en `database.config.ts`. A partir de acá nunca más volver a generar baseline.

> ⚠️ Para usuarios EXISTENTES que ya tienen BD creada con synchronize, la baseline se marca como aplicada automáticamente en el primer arranque post-actualización (no se reaplica). Ver lógica en `DatabaseService.markAllMigrationsAsApplied()`.

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

- `ALTER TABLE DROP COLUMN` solo desde SQLite 3.35 (incluido en sqlite3 npm 5.1+).
- `ALTER TABLE RENAME COLUMN` desde 3.25.
- Para cambios complejos (alterar tipo, multiples drops), TypeORM usa el patrón "create new table, copy data, drop old, rename" — esto reescribe la tabla completa y puede ser lento con datos.
- Probá siempre en una copia de la BD real antes de mergear.

## Qué NO hacer

- Modificar una migración ya merged → genera otra que la corrija.
- DROP/RENAME en una sola migración sin estrategia de 2 versiones.
- Subir migraciones que dependan de datos que pueden no existir (validar con `IF EXISTS`).
- Saltarse el backup pre-migration (siempre debe correr).
