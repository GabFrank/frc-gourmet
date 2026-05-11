import { app, ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { readAppSettings, updateAppSettings, DatabaseSettings } from '../utils/app-settings.utils';
import { getDbPassword, setDbPassword } from '../utils/db-password.utils';

export interface DbConfigDto {
  type: 'sqlite' | 'postgres';
  // sqlite
  path?: string; // 'default' o absoluto
  // postgres
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string; // solo en POST/test (input); en GET sale '***' o ''
  schema?: string;
  ssl?: boolean;
}

const PASSWORD_MASK = '***';

export function registerDbConfigHandlers() {
  ipcMain.handle('db-config-get', async (): Promise<DbConfigDto> => {
    const settings = readAppSettings(app.getPath('userData'));
    const db = settings.database;
    const passwordStored = await getDbPassword();
    return {
      type: db.type,
      path: db.path,
      host: db.host,
      port: db.port,
      database: db.database,
      username: db.username,
      password: passwordStored ? PASSWORD_MASK : '',
      schema: db.schema,
      ssl: db.ssl,
    };
  });

  ipcMain.handle('db-config-save', async (_e, payload: DbConfigDto) => {
    if (!payload || (payload.type !== 'sqlite' && payload.type !== 'postgres')) {
      return { success: false, message: 'Tipo de BD invalido.' };
    }
    const next: DatabaseSettings =
      payload.type === 'postgres'
        ? {
            type: 'postgres',
            host: payload.host || 'localhost',
            port: payload.port || 5432,
            database: payload.database || 'frc_gourmet',
            username: payload.username || 'postgres',
            schema: payload.schema || undefined,
            ssl: !!payload.ssl,
          }
        : {
            type: 'sqlite',
            path: payload.path || 'default',
          };

    updateAppSettings(app.getPath('userData'), (s) => ({
      ...s,
      database: next,
    }));

    // Solo persistir password si vino algo distinto al mask
    if (payload.type === 'postgres' && payload.password !== undefined && payload.password !== PASSWORD_MASK) {
      await setDbPassword(payload.password || '');
    }

    return { success: true };
  });

  ipcMain.handle('db-config-test-connection', async (_e, payload: DbConfigDto) => {
    let temp: DataSource | null = null;
    try {
      if (payload.type === 'postgres') {
        const passwordToUse =
          payload.password === PASSWORD_MASK || payload.password === undefined
            ? await getDbPassword()
            : payload.password || '';
        temp = new DataSource({
          type: 'postgres',
          host: payload.host || 'localhost',
          port: payload.port || 5432,
          database: payload.database || 'frc_gourmet',
          username: payload.username || 'postgres',
          password: passwordToUse,
          schema: payload.schema || undefined,
          ssl: payload.ssl ? { rejectUnauthorized: false } : undefined,
          entities: [],
          synchronize: false,
        });
      } else {
        const path = payload.path && payload.path !== 'default' ? payload.path : undefined;
        if (!path) {
          return { success: true, message: 'SQLite default OK (no se valida creacion del archivo).' };
        }
        temp = new DataSource({
          type: 'sqlite',
          database: path,
          entities: [],
          synchronize: false,
        });
      }
      await temp.initialize();
      const driver = temp.options.type;
      // Query trivial para validar conexion realmente abierta
      if (driver === 'postgres') {
        await temp.query('SELECT 1');
      } else {
        await temp.query('SELECT 1');
      }
      return { success: true, message: 'Conexion OK.' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, message: msg };
    } finally {
      if (temp && temp.isInitialized) {
        try {
          await temp.destroy();
        } catch {}
      }
    }
  });

  ipcMain.handle('db-config-restart-app', async () => {
    app.relaunch();
    app.exit(0);
    return { success: true };
  });
}
