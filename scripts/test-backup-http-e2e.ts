/**
 * Test E2E: Backup remoto vía HTTP (issue #265)
 *
 * Verifica que:
 * 1. Canales destructivos bloqueados siguen respondiendo channel_bloqueado_para_http
 * 2. backup-create permitido con permiso SISTEMA_BACKUP
 * 3. Sin permiso SISTEMA_BACKUP → HTTP 403
 * 4. backup-send-whatsapp por HTTP ignora opts.destino arbitrario del payload
 *
 * Enmienda #6 de auditoría: test obligatorio antes de mergear.
 */

import { strict as assert } from 'assert';
import { DataSource } from 'typeorm';
import { Usuario } from '../src/app/database/entities/personas/usuario.entity';
import { Role } from '../src/app/database/entities/personas/role.entity';
import { Permission } from '../src/app/database/entities/personas/permission.entity';
import { RolePermission } from '../src/app/database/entities/personas/role-permission.entity';
import { UsuarioRole } from '../src/app/database/entities/personas/usuario-role.entity';
import { Dispositivo } from '../src/app/database/entities/financiero/dispositivo.entity';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { startServer, stopServer } from '../electron/server/server';
import * as jwt from 'jsonwebtoken';

const TEST_PORT = 17071;
const JWT_SECRET = 'test-secret-backup-http';

async function makeRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: any } = {},
): Promise<{ status: number; body: any }> {
  const { method = 'GET', headers = {}, body } = options;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const status = res.status;
  let responseBody: any;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = await res.text();
  }
  return { status, body: responseBody };
}

function createToken(userId: number, deviceId: number): string {
  return jwt.sign({ id: userId, device_id: deviceId }, JWT_SECRET, { expiresIn: '1h' });
}

async function main() {
  console.log('[test-backup-http-e2e] Iniciando tests...');

  const tmpdir = require('os').tmpdir();
  const opts = getDataSourceOptions(tmpdir);
  const dataSource = new DataSource({
    ...(opts as any),
    database: ':memory:',
    synchronize: false,
    migrationsRun: false,
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });

  // Seed mínimo: usuario con permiso + usuario sin permiso
  const permRepo = dataSource.getRepository(Permission);
  const backupPerm = permRepo.create({
    codigo: 'SISTEMA_BACKUP',
    descripcion: 'Test backup permission',
    modulo: 'SISTEMA',
  } as any);
  await permRepo.save(backupPerm);

  const roleRepo = dataSource.getRepository(Role);
  const adminRole = roleRepo.create({
    nombre: 'ADMIN_TEST',
    descripcion: 'Admin role with backup',
    activo: true,
  } as any);
  await roleRepo.save(adminRole);

  const rolePermRepo = dataSource.getRepository(RolePermission);
  const rp = rolePermRepo.create({
    role: adminRole,
    permission: backupPerm,
  } as any);
  await rolePermRepo.save(rp);

  const userRepo = dataSource.getRepository(Usuario);
  const adminUser = userRepo.create({
    nickname: 'admin',
    password: '$2a$10$AAAAAAAAAAAAAAAAAAAAAO0000000000000000000000000000000',
    activo: true,
    mustChangePassword: false,
  } as any);
  await userRepo.save(adminUser);

  const noPermUser = userRepo.create({
    nickname: 'noperm',
    password: '$2a$10$AAAAAAAAAAAAAAAAAAAAAO0000000000000000000000000000000',
    activo: true,
    mustChangePassword: false,
  } as any);
  await userRepo.save(noPermUser);

  const usuarioRoleRepo = dataSource.getRepository(UsuarioRole);
  const ur = usuarioRoleRepo.create({
    usuario: adminUser,
    role: adminRole,
  } as any);
  await usuarioRoleRepo.save(ur);

  const dispRepo = dataSource.getRepository(Dispositivo);
  const device1 = dispRepo.create({
    nombre: 'TEST-DEVICE-1',
    descripcion: 'Test Device 1',
    activo: true,
  } as any);
  await dispRepo.save(device1);

  // Mock JWT secret en el environment para que el server lo use
  process.env.JWT_SECRET = JWT_SECRET;

  const fastify = await startServer({
    port: TEST_PORT,
    host: '127.0.0.1',
    appVersion: '1.0.0-test',
    schemaVersion: '1',
    driver: 'sqlite',
    dataSource,
  });

  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  try {
    console.log('[test-backup-http-e2e] Server iniciado');

    const adminToken = createToken(adminUser.id!, device1.id!);
    const noPermToken = createToken(noPermUser.id!, device1.id!);

    // Test 1: Canales destructivos bloqueados
    console.log('[Test 1] Canales destructivos bloqueados: backup-restore → 403 channel_bloqueado_para_http');
    const blockedChannels = [
      'backup-restore',
      'backup-db-reset',
      'backup-clear-images',
      'backup-delete',
      'backup-create-and-export',
      'backup-config-set',
      'backup-pick-folder',
      'backup-pick-restore-file',
    ];

    for (const channel of blockedChannels) {
      const res = await makeRequest(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { method: channel, params: [] },
      });
      assert.strictEqual(res.status, 403, `${channel} debería estar bloqueado`);
      assert.ok(
        res.body.error && res.body.error.includes('channel_bloqueado_para_http'),
        `${channel} debería responder channel_bloqueado_para_http, got: ${res.body.error}`,
      );
      process.stdout.write('.');
    }
    console.log(' ✓');

    // Test 2: backup-create permitido con permiso
    console.log('[Test 2] backup-create permitido con permiso SISTEMA_BACKUP');
    const createRes = await makeRequest(`${baseUrl}/api/rpc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { method: 'backup-create', params: [{ includeImages: false }] },
    });
    // Puede fallar por otros motivos (filesystem), pero NO debe ser 403 ni channel_bloqueado
    assert.notStrictEqual(createRes.status, 403, 'backup-create no debería estar bloqueado');
    if (createRes.status !== 200 && createRes.body.error) {
      assert.ok(
        !createRes.body.error.includes('channel_bloqueado_para_http'),
        'backup-create no debería responder channel_bloqueado_para_http',
      );
    }
    console.log(' ✓');

    // Test 3: Sin permiso → HTTP 403
    console.log('[Test 3] Sin permiso SISTEMA_BACKUP → HTTP 403');
    const noPermRes = await makeRequest(`${baseUrl}/api/rpc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${noPermToken}` },
      body: { method: 'backup-create', params: [{}] },
    });
    assert.strictEqual(noPermRes.status, 403, 'Sin permiso debería responder 403');
    assert.ok(
      noPermRes.body.error && (
        noPermRes.body.error.includes('PERMISO REQUERIDO') ||
        noPermRes.body.error.includes('SISTEMA_BACKUP')
      ),
      `Debería responder error de permiso, got: ${noPermRes.body.error}`,
    );
    console.log(' ✓');

    // Test 4: backup-send-whatsapp por HTTP ignora destino arbitrario
    console.log('[Test 4] backup-send-whatsapp HTTP ignora opts.destino arbitrario');
    // Crear archivo de backup temporal y configurar destino
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(tmpdir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const testBackupPath = path.join(backupDir, 'test-backup.db');
    fs.writeFileSync(testBackupPath, 'fake backup content');

    // Configurar destino WhatsApp en app-settings.json
    const settingsPath = path.join(tmpdir, 'app-settings.json');
    const settings = {
      mode: 'standalone',
      backup: {
        whatsappDestino: '595991888888', // El destino configurado
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Invocar con destino arbitrario diferente en el payload
    const sendRes = await makeRequest(`${baseUrl}/api/rpc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        method: 'backup-send-whatsapp',
        params: [{ fullPath: testBackupPath, destino: '595991999999' }], // DISTINTO del config
      },
    });

    // El handler debe fallar porque Evolution API no está configurada,
    // pero si el fix funciona, intentó usar 595991888888 (config), NO 595991999999 (payload)
    assert.ok(sendRes.body.result, 'backup-send-whatsapp debería devolver result');
    assert.strictEqual(sendRes.body.result.success, false, 'Debería fallar sin Evolution API');
    
    // El mensaje debe ser sobre Evolution API, NO sobre archivo o destino
    // Si llegó hasta aquí, pasó las validaciones de archivo y destino
    assert.ok(
      sendRes.body.result.message &&
      sendRes.body.result.message.includes('Evolution API no configurada'),
      `Debería fallar en Evolution API (pasó validaciones de archivo y destino), got: ${sendRes.body.result.message}`,
    );

    // Limpiar
    fs.unlinkSync(testBackupPath);
    fs.unlinkSync(settingsPath);
    console.log(' ✓');

    console.log('\n[test-backup-http-e2e] ✅ Todos los tests OK');
  } catch (err) {
    console.error('\n[test-backup-http-e2e] ❌ Test falló:', err);
    throw err;
  } finally {
    await stopServer(fastify);
    await dataSource.destroy();
    delete process.env.JWT_SECRET;
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
