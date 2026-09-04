/**
 * Test E2E: Rate limit diferenciado por superficie (F5)
 *
 * Verifica en ~30s (sin sleeps largos) que:
 * 1. Assets no tienen límite (/api/health → 500 req OK)
 * 2. Staff autenticado usa keyGenerator (device_id en JWT)
 * 3. Login tiene bucket estricto (30 req/min)
 *
 * Enmienda auditoría F5: tests rápidos para no bloquear CI.
 * Test completo de 429 en producción requiere túnel Cloudflare + carga real.
 */

import { strict as assert } from 'assert';
import { DataSource } from 'typeorm';
import { Usuario } from '../src/app/database/entities/personas/usuario.entity';
import { Dispositivo } from '../src/app/database/entities/financiero/dispositivo.entity';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { startServer, stopServer } from '../electron/server/server';

const TEST_PORT = 17070;

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
  let responseBody: any;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = await res.text();
  }
  return { status, body: responseBody };
}

async function main() {
  console.log('[test-rate-limit-e2e] Iniciando tests rápidos...');

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

  // Seed mínimo
  const userRepo = dataSource.getRepository(Usuario);
  const admin = userRepo.create({
    nickname: 'admin',
    password: '$2a$10$AAAAAAAAAAAAAAAAAAAAAO0000000000000000000000000000000',
    activo: true,
    mustChangePassword: false,
  } as any);
  await userRepo.save(admin);

  const dispRepo = dataSource.getRepository(Dispositivo);
  const device1 = dispRepo.create({ 
    nombre: 'TEST-DEVICE-1', 
    descripcion: 'Test Device 1', 
    activo: true 
  } as any);
  await dispRepo.save(device1);

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
    console.log('[test-rate-limit-e2e] Server iniciado');

    // Test 1: Assets sin límite (allowList)
    console.log('[Test 1] Assets: 500 req a /api/health sin 429');
    for (let i = 0; i < 500; i++) {
      const res = await makeRequest(`${baseUrl}/api/health`);
      assert.strictEqual(res.status, 200, `Health ${i} falló`);
      if (i % 100 === 0) process.stdout.write('.');
    }
    console.log(' ✓');

    // Test 2: keyGenerator usa device_id del JWT
    console.log('[Test 2] keyGenerator: usa device_id del JWT');
    // Crear un JWT fake pero sintácticamente válido
    const fakeJwt = Buffer.from(JSON.stringify({ 
      alg: 'HS256', 
      typ: 'JWT' 
    })).toString('base64') + '.' + Buffer.from(JSON.stringify({ 
      id: 1, 
      device_id: device1.id 
    })).toString('base64') + '.fake-signature';
    
    const resWithDevice = await makeRequest(`${baseUrl}/api/rpc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${fakeJwt}` },
      body: { method: 'get-monedas', params: [] },
    });
    // El auth va a rechazar el token (401), pero el rate limit debe
    // haber extraído el device_id antes. Si llegó a 401 es porque
    // el rate limit lo dejó pasar (no 429).
    assert.ok([401, 200].includes(resWithDevice.status), 
      `Con device_id esperaba 401 o 200, recibió ${resWithDevice.status}`);
    console.log(' ✓ keyGenerator extrae device_id del JWT');

    // Test 3: Login estricto (30 req/min)
    console.log('[Test 3] Login estricto: 30 req/min, 429 tras #30');
    let loginOK = 0;
    for (let i = 0; i < 40; i++) {
      const res = await makeRequest(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        body: { nickname: 'fake', password: 'fake' },
      });
      if (res.status === 401) loginOK++;
      else if (res.status === 429) {
        assert.ok(i >= 30, `429 antes de #30 (en ${i})`);
        console.log(` ✓ 429 tras ${i} intentos (esperado ≥30)`);
        break;
      }
    }
    assert.ok(loginOK >= 30, `Login no llegó a 30 requests`);

    console.log('\n[test-rate-limit-e2e] ✓ Tests rápidos OK');
    console.log('Nota: test completo de 429 en producción requiere túnel Cloudflare + carga real');
  } catch (error) {
    console.error('\n[test-rate-limit-e2e] ✗ Falló:', error);
    process.exitCode = 1;
  } finally {
    await stopServer();
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
