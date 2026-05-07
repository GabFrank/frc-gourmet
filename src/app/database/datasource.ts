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
 * El CLI necesita un path absoluto a la BD. Por defecto usa una BD local en
 * `./.tmp/cli-frc-gourmet.db` para no tocar la BD real del usuario.
 * Para apuntar a la BD real (riesgoso), exportar:
 *   FRC_DB_PATH=/Users/<vos>/Library/Application\ Support/frc-gourmet/frc-gourmet.db
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource, DataSourceOptions } from 'typeorm';
import { getDataSourceOptions } from './database.config';

const cliDbPath = process.env['FRC_DB_PATH'];
const tmpDir = path.resolve(__dirname, '../../../.tmp');
if (!cliDbPath && !fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const userDataPath = cliDbPath ? path.dirname(cliDbPath) : tmpDir;
const dbFile = cliDbPath ? path.basename(cliDbPath) : 'cli-frc-gourmet.db';

const baseOptions = getDataSourceOptions(userDataPath) as DataSourceOptions & { database: string };

export const AppDataSource = new DataSource({
  ...baseOptions,
  database: path.join(userDataPath, dbFile),
  // En CLI nunca queremos synchronize automático: queremos ver el diff vs migraciones.
  synchronize: false,
  migrationsRun: false,
  logging: ['error', 'warn', 'migration'],
});

export default AppDataSource;
