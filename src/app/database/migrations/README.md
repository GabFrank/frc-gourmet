# Migraciones TypeORM

Esta carpeta contiene migraciones de schema versionadas. Reemplaza el modo `synchronize: true` para builds productivas.

## Modelo

| Entorno | `synchronize` | Migraciones |
|---|---|---|
| Dev (no empaquetado) | **true** | No corren — sync hace todo |
| Prod (empaquetado) | **false** | Corren al iniciar, después de backup |
| Primer arranque prod (BD inexistente) | **true** (bootstrap) | Marcadas como aplicadas |

Tabla de tracking: `typeorm_migrations` (no `migrations` para evitar colisiones con cualquier entidad legacy).

## Cómo agregar una migración

1. Hacer el cambio en la entity (`src/app/database/entities/.../foo.entity.ts`).
2. **No** correr la app aún (en dev synchronize la aplicaría sin migración).
3. Generar el archivo:
   ```bash
   npm run migration:generate -- src/app/database/migrations/AgregarCampoFooEnBar
   ```
   TypeORM compara entities vs `.tmp/cli-frc-gourmet.db` y escribe SQL.
4. Revisar el archivo generado. **Toda migración debe ser aditiva** (no DROP, no RENAME) salvo estrategia de 2 versiones.
5. Importar la migración en `database.config.ts` → `getMigrations()`.
6. Probar: `npm run migration:run` en una BD limpia, verificar resultado.
7. Commit con mensaje `feat(db):` o `fix(db):` según corresponda.

## Reglas de oro

- **Aditivas**. Agregar columna nullable; backfill en migración separada; volver NOT NULL en versión siguiente.
- **Idempotentes** cuando sea posible (`IF NOT EXISTS`).
- **No tocar** una migración ya merged. Generar otra que la corrija.
- **Probar en BD vacía y BD con datos** antes de mergear.
- **Backup automático** corre antes de toda migración (ver `DatabaseService.initialize`).

## CLI

```bash
# Generar nueva migración desde diff entities-vs-DB
npm run migration:generate -- src/app/database/migrations/MiCambio

# Crear migración vacía (escribir SQL a mano)
npm run migration:create -- src/app/database/migrations/Backfill

# Ejecutar pendientes
npm run migration:run

# Revertir la última (cuidado: SQLite tiene limitaciones de DDL)
npm run migration:revert

# Listar estado
npm run migration:show
```

Apuntar el CLI a la BD real de Electron:
```bash
FRC_DB_PATH="/Users/$USER/Library/Application Support/frc-gourmet/frc-gourmet.db" npm run migration:show
```

## Generar baseline (primera vez)

Antes del primer release v1.x.0:

```bash
rm -rf .tmp/cli-frc-gourmet.db
npm run migration:generate -- src/app/database/migrations/Initial
```

Se crea `<timestamp>-Initial.ts` con todas las CREATE TABLE. Importarla en `database.config.ts`. A partir de acá, cada cambio de schema = nueva migración.
