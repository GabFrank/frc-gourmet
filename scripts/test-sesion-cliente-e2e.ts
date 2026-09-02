/**
 * E2E: sesión persistente del modo cliente.
 *
 * Cubre las dos mitades del arreglo de la "sesión zombi":
 *
 *  A) El **almacén local** del refresh token (`client-refresh-token.utils.ts`):
 *     keytar con fallback a archivo 0600. Se ejercita el fallback, que es el
 *     camino real en una PC de reparto sin keyring.
 *
 *  B) El **ciclo del servidor** que la rehidratación necesita: emitir → rotar →
 *     revocar. Si la rotación no revocara el token viejo, o si un token
 *     revocado siguiera sirviendo, persistirlo en disco sería peligroso.
 *
 * Uso: npm run test:sesion-cliente
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import {
  issueRefreshToken, findValidRefreshToken, rotateRefreshToken,
  revokeRefreshToken, revokeAllForUser,
} from '../electron/utils/refresh-token.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // ── A. Almacén local ──────────────────────────────────────────────────────
  //
  // `_electron-mock` apunta `app.getPath()` a `.tmp`, así que el fallback de
  // archivo escribe ahí. keytar puede o no estar disponible en el runner; el
  // helper cae al archivo solo, que es justamente lo que hay que probar.
  console.log('\n[A] Almacén del refresh token (fallback de archivo)');
  {
    const store = require('../electron/utils/client-refresh-token.utils');
    const fallback = path.join(tmpDir, 'client-refresh-token.local');
    if (fs.existsSync(fallback)) fs.unlinkSync(fallback);

    await store.clearClientRefreshToken();
    ok((await store.readClientRefreshToken()) === null, 'sin token guardado devuelve null');

    await store.writeClientRefreshToken('token-de-prueba-abc');
    const leido = await store.readClientRefreshToken();
    ok(leido === 'token-de-prueba-abc', 'lo que se guarda es lo que se lee', leido);

    // El permiso importa: es una credencial de 30 días en el disco de un local.
    if (fs.existsSync(fallback)) {
      const modo = fs.statSync(fallback).mode & 0o777;
      ok(modo === 0o600, 'el archivo de fallback queda en 0600', modo.toString(8));
    } else {
      // keytar disponible en este runner: no hay archivo, y eso también es correcto.
      ok(true, 'keytar disponible: no se escribió archivo de fallback');
    }

    await store.writeClientRefreshToken('token-rotado-def');
    ok((await store.readClientRefreshToken()) === 'token-rotado-def', 'sobrescribir reemplaza el anterior');

    await store.clearClientRefreshToken();
    ok((await store.readClientRefreshToken()) === null, 'clear borra el token');
    ok(!fs.existsSync(fallback), 'y no deja el archivo atrás');

    // `write(null)` es el camino que usa el logout.
    await store.writeClientRefreshToken('temporal');
    await store.writeClientRefreshToken(null);
    ok((await store.readClientRefreshToken()) === null, 'write(null) equivale a clear');
  }

  // ── B. Ciclo del servidor ────────────────────────────────────────────────
  console.log('\n[B] Emitir → rotar → revocar');
  const dbFile = path.join(tmpDir, 'test-sesion-cliente.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const usuario: any = await ds.getRepository(Usuario).save(
    ds.getRepository(Usuario).create({ nickname: 'cajero', password: 'x', activo: true } as any),
  );

  const emitido = await issueRefreshToken(ds, usuario);
  ok(!!emitido.token, 'se emite un token en claro');

  // El plain NUNCA se guarda: en la base va sólo el hash.
  const filas: any[] = await ds.query('SELECT token_hash FROM refresh_tokens');
  ok(filas.length === 1 && filas[0].token_hash !== emitido.token,
    'en la base va el hash, no el token en claro');

  // 30 días de vida: es lo que hace que "recordar sesión" sirva de algo.
  const dias = Math.round((emitido.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000));
  ok(dias === 30, 'vence a los 30 días', dias);

  ok(!!(await findValidRefreshToken(ds, emitido.token)), 'el token recién emitido es válido');

  const rotado = await rotateRefreshToken(ds, emitido.token, usuario);
  ok(!!rotado?.token && rotado.token !== emitido.token, 'la rotación devuelve un token distinto');
  ok(!(await findValidRefreshToken(ds, emitido.token)),
    'el token viejo deja de valer apenas se rota');
  ok(!!(await findValidRefreshToken(ds, rotado!.token)), 'el nuevo vale');

  // Es exactamente por esto que el preload persiste el token DESPUÉS de rotar:
  // guardar el viejo dejaría al próximo arranque intentando con uno muerto.

  ok(await revokeRefreshToken(ds, rotado!.token), 'el logout revoca del lado servidor');
  ok(!(await findValidRefreshToken(ds, rotado!.token)), 'y el token revocado ya no vale');

  const a = await issueRefreshToken(ds, usuario);
  const b = await issueRefreshToken(ds, usuario);
  const revocados = await revokeAllForUser(ds, usuario.id);
  ok(revocados >= 2, 'revokeAllForUser revoca todas las sesiones vivas', revocados);
  ok(!(await findValidRefreshToken(ds, a.token)) && !(await findValidRefreshToken(ds, b.token)),
    'ninguna de las dos sobrevive');

  console.log(`\n[sesion-cliente] ${passed} OK, ${failed} fallidos`);
  await ds.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
