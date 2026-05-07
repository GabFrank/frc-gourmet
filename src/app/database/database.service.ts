import { DataSource, MigrationInterface } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { createDataSource, getDataSourceOptions, isPackagedApp } from './database.config';

/**
 * Service to manage database operations with TypeORM.
 *
 * Flujo de inicialización:
 *  1. Detecta si la app está empaquetada y si la BD ya existe en userData.
 *  2. Si BD existe + hay migraciones pendientes → backup automático antes de migrar.
 *  3. Inicializa DataSource. En dev usa synchronize. En prod corre migrations.
 *  4. En primer arranque empaquetado (BD no existe) hace synchronize una vez y
 *     marca todas las migraciones como aplicadas para futuros arranques.
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

  public async initialize(userDataPath: string): Promise<DataSource> {
    if (this.dataSource) return this.dataSource;

    const dbPath = path.join(userDataPath, 'frc-gourmet.db');
    const dbExists = fs.existsSync(dbPath);
    const packaged = isPackagedApp();
    const baseOptions = getDataSourceOptions(userDataPath);
    const migrations = ((baseOptions as any).migrations || []) as Function[];
    const hasMigrations = migrations.length > 0;

    // Caso 1: app empaquetada + BD nueva → bootstrap con synchronize, luego marcar migrations como aplicadas.
    if (packaged && !dbExists) {
      console.log('[DB] Bootstrap inicial: BD no existe, creando schema con synchronize.');
      const bootstrap = new DataSource({ ...(baseOptions as any), synchronize: true, migrationsRun: false });
      await bootstrap.initialize();
      if (hasMigrations) {
        await this.markAllMigrationsAsApplied(bootstrap, migrations);
      }
      await bootstrap.destroy();
      this.dataSource = await createDataSource(userDataPath);
      console.log('[DB] Bootstrap completo.');
      return this.dataSource;
    }

    // Caso 2: app empaquetada + BD existente + migraciones definidas → backup + migrate.
    if (packaged && dbExists && hasMigrations) {
      this.lastPreMigrationBackup = this.preMigrationBackup(userDataPath);
      console.log('[DB] Backup pre-migration:', this.lastPreMigrationBackup);
      try {
        this.dataSource = await createDataSource(userDataPath);
        const pending = await this.dataSource.showMigrations();
        if (pending) {
          console.log('[DB] Aplicando migraciones pendientes...');
          await this.dataSource.runMigrations({ transaction: 'each' });
          console.log('[DB] Migraciones aplicadas OK.');
        } else {
          console.log('[DB] Sin migraciones pendientes.');
        }
        return this.dataSource;
      } catch (err) {
        console.error('[DB] Error al migrar. Backup pre-migrate disponible:', this.lastPreMigrationBackup, err);
        throw err;
      }
    }

    // Caso 3: dev (no empaquetado) → synchronize hace su trabajo.
    this.dataSource = await createDataSource(userDataPath);
    return this.dataSource;
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

  /** Copia frc-gourmet.db a userData/backups/...premigrate_<ts>.db antes de migrar. */
  private preMigrationBackup(userDataPath: string): string {
    const dbPath = path.join(userDataPath, 'frc-gourmet.db');
    const backupDir = path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(backupDir, `frc-gourmet-backup_premigrate_${ts}.db`);
    fs.copyFileSync(dbPath, out);
    return out;
  }

  /** Inserta todas las migraciones en la tabla de tracking sin ejecutarlas. */
  private async markAllMigrationsAsApplied(ds: DataSource, migrations: Function[]): Promise<void> {
    const tableName = (ds.options as any).migrationsTableName || 'typeorm_migrations';
    const queryRunner = ds.createQueryRunner();
    try {
      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS "${tableName}" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" BIGINT NOT NULL, "name" VARCHAR NOT NULL)`,
      );
      for (const MigrationCtor of migrations) {
        const name = (MigrationCtor as any).name || (new (MigrationCtor as any)() as MigrationInterface).constructor.name;
        const m = name.match(/(\d{10,})/);
        const timestamp = m ? Number(m[1]) : Date.now();
        await queryRunner.query(`INSERT INTO "${tableName}" ("timestamp", "name") VALUES (?, ?)`, [timestamp, name]);
      }
    } finally {
      await queryRunner.release();
    }
  }
}
