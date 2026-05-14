import { app, ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { readAppSettings, updateAppSettings, DatabaseSettings } from '../utils/app-settings.utils';
import { getDbPassword, setDbPassword } from '../utils/db-password.utils';
import { ensurePermission } from '../utils/auth.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

/**
 * P0-1: helper para handlers de sistema que pueden invocarse tanto en
 * setup inicial (sin sesion, sin BD operativa) como en re-config con admin
 * logueado. Si hay un currentUser, exigir el permiso; si no hay, permitir
 * (bootstrap mode).
 */
async function ensurePermissionIfLoggedIn(
  dataSource: DataSource | undefined,
  getCurrentUser: (() => Usuario | null) | undefined,
  codigo: string,
): Promise<void> {
  if (!dataSource || !getCurrentUser) return;
  if (getCurrentUser() == null) return; // bootstrap: setup inicial sin sesion
  await ensurePermission(dataSource, getCurrentUser, codigo);
}

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

export function registerDbConfigHandlers(
  dataSource?: DataSource,
  getCurrentUser?: () => Usuario | null,
) {
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
    await ensurePermissionIfLoggedIn(dataSource, getCurrentUser, 'SISTEMA_BD_CONFIGURAR');
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
    await ensurePermissionIfLoggedIn(dataSource, getCurrentUser, 'SISTEMA_BD_CONFIGURAR');
    app.relaunch();
    app.exit(0);
    return { success: true };
  });

  /**
   * Inicializa una instancia Postgres: conecta como superuser a la DB `postgres`
   * del sistema y crea (si no existen) el rol target y la base de datos target.
   * Idempotente: si ya existen, no falla. Las credenciales de superuser NO se
   * persisten — solo viven en RAM durante esta llamada.
   */
  ipcMain.handle('db-config-init-postgres', async (
    _e,
    payload: {
      host: string;
      port: number;
      ssl?: boolean;
      // Superuser (no se guarda)
      superuserUsername: string;
      superuserPassword: string;
      // Target a crear (sí se usa luego en db-config-save)
      targetUsername: string;
      targetPassword: string;
      targetDatabase: string;
    },
  ) => {
    await ensurePermissionIfLoggedIn(dataSource, getCurrentUser, 'SISTEMA_BD_CONFIGURAR');
    if (!payload || !payload.host || !payload.port) {
      return { success: false, message: 'Host y puerto son requeridos.' };
    }
    if (!payload.superuserUsername) {
      return { success: false, message: 'Usuario superuser es requerido.' };
    }
    // Password puede ser vacia (pg_hba.conf en trust/peer no requiere password).
    if (!payload.targetUsername || !payload.targetPassword || !payload.targetDatabase) {
      return { success: false, message: 'Usuario, password y nombre de base de datos a crear son requeridos.' };
    }

    // Validacion basica de identificadores Postgres (sin necesidad de quoting complejo)
    const safeIdent = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (!safeIdent.test(payload.targetUsername)) {
      return { success: false, message: 'Nombre de usuario invalido (solo letras, numeros, underscore; debe iniciar con letra).' };
    }
    if (!safeIdent.test(payload.targetDatabase)) {
      return { success: false, message: 'Nombre de base de datos invalido (solo letras, numeros, underscore; debe iniciar con letra).' };
    }

    // Password contains apostrophe? Escape it for Postgres SQL literal
    const sqlEscape = (s: string) => s.replace(/'/g, "''");

    let temp: DataSource | null = null;
    try {
      temp = new DataSource({
        type: 'postgres',
        host: payload.host,
        port: payload.port,
        database: 'postgres', // DB del sistema, siempre existe
        username: payload.superuserUsername,
        password: payload.superuserPassword,
        ssl: payload.ssl ? { rejectUnauthorized: false } : undefined,
        entities: [],
        synchronize: false,
      });
      await temp.initialize();

      const created: string[] = [];
      const skipped: string[] = [];

      // 1. Crear/actualizar rol target
      const roleRows: Array<{ exists: boolean }> = await temp.query(
        `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists`,
        [payload.targetUsername],
      );
      const roleExists = roleRows[0]?.exists === true;
      if (!roleExists) {
        await temp.query(
          `CREATE ROLE "${payload.targetUsername}" WITH LOGIN PASSWORD '${sqlEscape(payload.targetPassword)}'`,
        );
        created.push(`usuario ${payload.targetUsername}`);
      } else {
        // Actualizar password si el usuario ya existia (asumimos que el operador
        // quiere reusar el rol con la nueva password tipeada).
        await temp.query(
          `ALTER ROLE "${payload.targetUsername}" WITH LOGIN PASSWORD '${sqlEscape(payload.targetPassword)}'`,
        );
        skipped.push(`usuario ${payload.targetUsername} (ya existia; password actualizada)`);
      }

      // 2. Crear base de datos target (NO se puede hacer dentro de tx — TypeORM lo permite porque cada query() es autocommit)
      const dbRows: Array<{ exists: boolean }> = await temp.query(
        `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists`,
        [payload.targetDatabase],
      );
      const dbExists = dbRows[0]?.exists === true;
      if (!dbExists) {
        await temp.query(
          `CREATE DATABASE "${payload.targetDatabase}" OWNER "${payload.targetUsername}" ENCODING 'UTF8' TEMPLATE template0`,
        );
        created.push(`base de datos ${payload.targetDatabase}`);
      } else {
        skipped.push(`base de datos ${payload.targetDatabase} (ya existia)`);
      }

      // 3. Asegurar privilegios
      await temp.query(
        `GRANT ALL PRIVILEGES ON DATABASE "${payload.targetDatabase}" TO "${payload.targetUsername}"`,
      );

      const parts: string[] = [];
      if (created.length > 0) parts.push(`Creado: ${created.join(', ')}.`);
      if (skipped.length > 0) parts.push(`Ya existia: ${skipped.join(', ')}.`);
      parts.push('Privilegios asignados.');

      return { success: true, message: parts.join(' ') };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, message: `Error inicializando Postgres: ${msg}` };
    } finally {
      if (temp && temp.isInitialized) {
        try { await temp.destroy(); } catch {}
      }
    }
  });
}
