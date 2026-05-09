import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { createDataSource, getDataSourceOptions, DbConnectionOverride } from './database.config';

/**
 * Service to manage database operations with TypeORM.
 *
 * F1.5: synchronize eliminado. Toda nueva entity exige migration generada con
 * `npm run migration:generate`. Flujo de inicialización:
 *  1. Si SQLite y la BD existe + hay migraciones pendientes → backup pre-migrate.
 *  2. Inicializa DataSource y corre migraciones pendientes (transaction:each).
 *  3. Postgres: igual sin el step de file-copy backup (queda al usuario via pg_dump).
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private dataSource: DataSource | null = null;
  private lastPreMigrationBackup: string | null = null;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize(
    userDataPath: string,
    override?: DbConnectionOverride,
  ): Promise<DataSource> {
    if (this.dataSource) return this.dataSource;

    const isPostgres = override?.type === 'postgres';
    const baseOptions = getDataSourceOptions(userDataPath, override);
    const migrations = ((baseOptions as any).migrations || []) as Function[];
    const hasMigrations = migrations.length > 0;

    // Postgres: backup pre-migrate (file copy) no aplica. Usuario hace pg_dump.
    if (isPostgres) {
      console.log(`[DB] Backend: postgres @ ${override?.host}:${override?.port}/${override?.database}`);
      this.dataSource = await createDataSource(userDataPath, override);
      if (hasMigrations) await this.runPendingMigrations(this.dataSource);
      return this.dataSource;
    }

    // SQLite — backup pre-migrate si BD existe Y hay migraciones pendientes
    const dbPath = override?.sqlitePath && override.sqlitePath !== 'default'
      ? override.sqlitePath
      : path.join(userDataPath, 'frc-gourmet.db');
    const dbExists = fs.existsSync(dbPath);

    if (dbExists && hasMigrations) {
      // Solo backup si efectivamente hay pendientes — pero requiere init primero.
      // Aceptamos backup-no-necesario en algunos casos a cambio de simplicidad.
      this.lastPreMigrationBackup = this.preMigrationBackup(dbPath, userDataPath);
      console.log('[DB] Backup pre-migration:', this.lastPreMigrationBackup);
    }

    try {
      this.dataSource = await createDataSource(userDataPath, override);
      if (hasMigrations) await this.runPendingMigrations(this.dataSource);
      return this.dataSource;
    } catch (err) {
      console.error('[DB] Error al inicializar. Backup pre-migrate:', this.lastPreMigrationBackup, err);
      throw err;
    }
  }

  private async runPendingMigrations(ds: DataSource): Promise<void> {
    const pending = await ds.showMigrations();
    if (pending) {
      console.log('[DB] Aplicando migraciones pendientes...');
      await ds.runMigrations({ transaction: 'each' });
      console.log('[DB] Migraciones aplicadas OK.');
    } else {
      console.log('[DB] Sin migraciones pendientes.');
    }
  }

  public getDataSource(): DataSource {
    if (!this.dataSource) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  public async close(): Promise<void> {
    if (this.dataSource) {
      await this.dataSource.destroy();
      this.dataSource = null;
      console.log('Database connection closed');
    }
  }

  public getLastPreMigrationBackup(): string | null {
    return this.lastPreMigrationBackup;
  }

  /** Copia el archivo .db a userData/backups/...premigrate_<ts>.db antes de migrar. */
  private preMigrationBackup(dbPath: string, userDataPath: string): string {
    const backupDir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(backupDir, `frc-gourmet-backup_premigrate_${ts}.db`);
    fs.copyFileSync(dbPath, out);
    return out;
  }

}
