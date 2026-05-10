/**
 * DataSource standalone para herramientas de TypeORM CLI.
 *
 * Uso:
 *   npm run migration:generate -- src/app/database/migrations/AddCampoFoo
 *   npm run migration:run
 *   npm run migration:revert
 *
 * Este archivo NO se usa en runtime (la app usa database.config.ts vía DatabaseService).
 *
 * Por defecto apunta a SQLite local en `./.tmp/cli-frc-gourmet.db`.
 *
 * Variables de entorno soportadas:
 *
 *   FRC_DB_PATH=/path/a/algun.db          → SQLite custom path
 *   FRC_DB_TYPE=postgres                  → switch a Postgres
 *   FRC_PG_HOST=localhost (default)
 *   FRC_PG_PORT=5432 (default)
 *   FRC_PG_DATABASE=frc_gourmet_baseline_pg
 *   FRC_PG_USERNAME=postgres (default)
 *   FRC_PG_PASSWORD=...
 *
 * Ejemplo Postgres (para generar BaselinePostgres):
 *   FRC_DB_TYPE=postgres FRC_PG_DATABASE=frc_gourmet_baseline_pg \
 *     npm run migration:generate -- src/app/database/migrations/BaselinePostgres
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource, DataSourceOptions } from 'typeorm';
import { getDataSourceOptions, DbConnectionOverride } from './database.config';

const dbType = process.env['FRC_DB_TYPE'] === 'postgres' ? 'postgres' : 'sqlite';

let AppDataSource: DataSource;

if (dbType === 'postgres') {
  const override: DbConnectionOverride = {
    type: 'postgres',
    host: process.env['FRC_PG_HOST'] || 'localhost',
    port: process.env['FRC_PG_PORT'] ? Number(process.env['FRC_PG_PORT']) : 5432,
    database: process.env['FRC_PG_DATABASE'] || 'frc_gourmet',
    username: process.env['FRC_PG_USERNAME'] || process.env['USER'] || 'postgres',
    password: process.env['FRC_PG_PASSWORD'] || '',
  };
  const baseOptions = getDataSourceOptions('', override);
  AppDataSource = new DataSource({
    ...(baseOptions as any),
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn', 'migration'] as ('error' | 'warn' | 'migration')[],
  } as DataSourceOptions);
} else {
  // SQLite
  const cliDbPath = process.env['FRC_DB_PATH'];
  const tmpDir = path.resolve(__dirname, '../../../.tmp');
  if (!cliDbPath && !fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const userDataPath = cliDbPath ? path.dirname(cliDbPath) : tmpDir;
  const dbFile = cliDbPath ? path.basename(cliDbPath) : 'cli-frc-gourmet.db';

  const baseOptions = getDataSourceOptions(userDataPath);

  AppDataSource = new DataSource({
    ...(baseOptions as any),
    database: path.join(userDataPath, dbFile),
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn', 'migration'] as ('error' | 'warn' | 'migration')[],
  } as DataSourceOptions);
}

export default AppDataSource;
