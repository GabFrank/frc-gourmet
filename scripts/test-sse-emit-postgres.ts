/**
 * Test E2E para verificar que los emits SSE funcionan correctamente en Postgres.
 * 
 * Prueba específica para el bug reportado en v1.21.0-alpha.159:
 * - createVenta emite SSE que falla en Postgres con placeholders `?`
 * - La transacción se aborta pero el handler devuelve success
 * - La venta no se persiste pero createVentaItem intenta insertar con venta_id inexistente
 * 
 * Este test verifica:
 * 1. createVenta persiste la venta incluso si hay un emit
 * 2. Los emits SSE funcionan en Postgres (no fallan con syntax error)
 * 3. El seq de la mesa se incrementa correctamente
 */

import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';

let dataSource: DataSource;
const isPostgres = process.env.FRC_DB_TYPE === 'postgres';

async function setupPostgres() {
  console.log('🔧 Setup: inicializando Postgres DataSource...');
  
  const pgHost = process.env.FRC_PG_HOST || 'localhost';
  const pgPort = parseInt(process.env.FRC_PG_PORT || '5432');
  const pgUser = process.env.FRC_PG_USER || 'postgres';
  const pgPassword = process.env.FRC_PG_PASSWORD || 'postgres';
  const pgDatabase = process.env.FRC_PG_DATABASE || 'frc_test_sse_emit';
  
  // Conectar al servidor para crear/dropear la BD
  const adminDs = new DataSource({
    type: 'postgres',
    host: pgHost,
    port: pgPort,
    username: pgUser,
    password: pgPassword,
    database: 'postgres',
  });
  
  await adminDs.initialize();
  
  try {
    await adminDs.query(`DROP DATABASE IF EXISTS ${pgDatabase}`);
    console.log(`✅ Database ${pgDatabase} dropped`);
  } catch (e) {
    console.log('  (DB no existía, ok)');
  }
  
  await adminDs.query(`CREATE DATABASE ${pgDatabase}`);
  console.log(`✅ Database ${pgDatabase} created`);
  await adminDs.destroy();
  
  // Conectar a la BD de test
  const tmpDir = path.resolve(__dirname, '../.tmp');
  const base = getDataSourceOptions(tmpDir);
  
  dataSource = new DataSource({
    ...(base as any),
    type: 'postgres',
    host: pgHost,
    port: pgPort,
    username: pgUser,
    password: pgPassword,
    database: pgDatabase,
    synchronize: false,
    migrationsRun: false,
  });
  
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  console.log('✅ Migraciones ejecutadas');
}

async function setupSqlite() {
  console.log('🔧 Setup: inicializando SQLite DataSource...');
  
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-sse-emit.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  
  const base = getDataSourceOptions(tmpDir);
  dataSource = new DataSource({ 
    ...(base as any), 
    database: dbFile, 
    synchronize: false, 
    migrationsRun: false 
  });
  
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  console.log('✅ DataSource inicializado + migraciones');
}

async function setup() {
  if (isPostgres) {
    await setupPostgres();
  } else {
    await setupSqlite();
  }
  
  // Seed mínimo
  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { Conteo } = E('financiero/conteo.entity');

  // Permisos + Role
  const perm = await dataSource.getRepository(Permission).save({ 
    codigo: 'VENTAS_PDV', 
    descripcion: 'PDV', 
    activo: true 
  });
  const role = await dataSource.getRepository(Role).save({ 
    descripcion: 'GERENTE', 
    activo: true 
  });
  await dataSource.getRepository(RolePermission).save({ role, permission: perm });

  // Usuario
  const usuario = await dataSource.getRepository(Usuario).save({
    nickname: 'test-sse',
    password: '$2b$10$test',
    activo: true,
  });
  await dataSource.getRepository(UsuarioRole).save({ usuario, role });

  // Moneda + Dispositivo
  const moneda = await dataSource.getRepository(Moneda).save({
    denominacion: 'PYG',
    simbolo: '₲',
    activo: true,
  });
  const dispositivo = await dataSource.getRepository(Dispositivo).save({
    nombre: 'TEST-DEVICE',
    activo: true,
  });

  // Conteo + Caja
  const conteoApertura = await dataSource.getRepository(Conteo).save({
    totalEsperado: 0,
    totalReal: 0,
    diferencia: 0,
  });
  const caja = await dataSource.getRepository(Caja).save({
    fechaApertura: new Date(),
    estado: 'ABIERTO',
    activo: true,
    dispositivo,
    conteoApertura,
  });

  // Mesa
  const mesa = await dataSource.getRepository(PdvMesa).save({
    numero: 1,
    estado: 'DISPONIBLE',
    activo: true,
    seq: 0,
  });

  console.log(`✅ Seed: usuario=${usuario.id}, caja=${caja.id}, mesa=${mesa.id}`);
  
  return { usuario, caja, mesa, moneda };
}

async function teardown() {
  if (dataSource?.isInitialized) {
    const dbName = isPostgres ? (dataSource.options as any).database : null;
    await dataSource.destroy();
    console.log('✅ DataSource cerrado');
    
    if (isPostgres && dbName) {
      const pgHost = process.env.FRC_PG_HOST || 'localhost';
      const pgPort = parseInt(process.env.FRC_PG_PORT || '5432');
      const pgUser = process.env.FRC_PG_USER || 'postgres';
      const pgPassword = process.env.FRC_PG_PASSWORD || 'postgres';
      
      const adminDs = new DataSource({
        type: 'postgres',
        host: pgHost,
        port: pgPort,
        username: pgUser,
        password: pgPassword,
        database: 'postgres',
      });
      
      await adminDs.initialize();
      await adminDs.query(`DROP DATABASE IF EXISTS ${dbName}`);
      console.log(`✅ Database ${dbName} dropped`);
      await adminDs.destroy();
    }
  }
}

/**
 * Test 1: createVenta persiste incluso con emit SSE
 */
async function testCreateVentaPersiste() {
  console.log('\n📋 TEST 1: createVenta persiste la venta (con emit SSE)');
  
  const { caja, mesa, moneda } = await setup();
  
  const { Venta } = await import('../src/app/database/entities/ventas/venta.entity');
  const { PdvMesa } = await import('../src/app/database/entities/ventas/pdv-mesa.entity');
  
  // Leer seq inicial de la mesa
  const mesaAntes = await dataSource.getRepository(PdvMesa).findOneBy({ id: mesa.id });
  const seqAntes = mesaAntes?.seq ?? 0;
  console.log(`  → Mesa ${mesa.id} seq antes: ${seqAntes}`);
  
  // Simular createVenta con emisión SSE (igual que el handler real)
  let ventaId: number | null = null;
  
  try {
    await dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Venta);
      const venta = repo.create({
        estado: 'ABIERTA',
        caja: { id: caja.id },
        mesa: { id: mesa.id },
        moneda: { id: moneda.id },
      });
      
      const saved = await repo.save(venta);
      ventaId = saved.id;
      console.log(`  → Venta creada: id=${ventaId}`);
      
      // Ocupar mesa
      const mesaRepo = manager.getRepository(PdvMesa);
      const mesaEntity = await mesaRepo.findOneBy({ id: mesa.id });
      if (mesaEntity) {
        mesaEntity.estado = 'OCUPADO';
        await mesaRepo.save(mesaEntity);
      }
      
      // Emitir SSE (este era el punto de fallo en alpha.159)
      try {
        const { emitMesaCambio } = await import('../electron/utils/mesa-emit.utils');
        await emitMesaCambio(manager, mesa.id);
        console.log(`  ✅ emitMesaCambio ejecutado sin error`);
      } catch (e) {
        console.warn(`  ⚠️ emitMesaCambio falló (pero la tx debe continuar):`, e);
        // En el bug original, este catch no era suficiente en Postgres
        // porque el error de sintaxis SQL abortaba la transacción completa
      }
    });
  } catch (e) {
    console.error(`  ❌ Transacción falló:`, e);
    throw e;
  }
  
  // Verificar que la venta se persistió
  if (!ventaId) {
    throw new Error('❌ ventaId es null, la venta no se creó');
  }
  
  const ventaPersistida = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['mesa'],
  });
  
  if (!ventaPersistida) {
    throw new Error(`❌ Venta ${ventaId} NO se persistió en la BD`);
  }
  
  console.log(`  ✅ Venta ${ventaId} se persistió correctamente`);
  
  // Verificar que la mesa se ocupó
  if ((ventaPersistida as any).mesa?.id !== mesa.id) {
    throw new Error(`❌ Venta.mesa no está correcta`);
  }
  console.log(`  ✅ Venta.mesa relación correcta`);
  
  const mesaDespues = await dataSource.getRepository(PdvMesa).findOneBy({ id: mesa.id });
  if (mesaDespues?.estado !== 'OCUPADO') {
    throw new Error(`❌ Mesa NO se ocupó: ${mesaDespues?.estado}`);
  }
  console.log(`  ✅ Mesa se ocupó correctamente`);
  
  // Verificar que seq se incrementó
  const seqDespues = mesaDespues?.seq ?? 0;
  console.log(`  → Mesa ${mesa.id} seq después: ${seqDespues}`);
  
  if (seqDespues <= seqAntes) {
    throw new Error(`❌ seq NO se incrementó: ${seqAntes} -> ${seqDespues}`);
  }
  console.log(`  ✅ seq se incrementó: ${seqAntes} -> ${seqDespues}`);
  
  console.log('  ✅ TEST 1 PASS');
}

/**
 * Test 2: Emits SSE funcionan directamente en Postgres
 */
async function testEmitsSseFuncionan() {
  console.log('\n📋 TEST 2: Emits SSE funcionan en Postgres (sin syntax error)');
  
  const { mesa } = await setup();
  
  const { PdvMesa } = await import('../src/app/database/entities/ventas/pdv-mesa.entity');
  const { emitMesaCambio } = await import('../electron/utils/mesa-emit.utils');
  
  const mesaAntes = await dataSource.getRepository(PdvMesa).findOneBy({ id: mesa.id });
  const seqAntes = mesaAntes?.seq ?? 0;
  
  // Ejecutar emit directamente
  try {
    await emitMesaCambio(dataSource, mesa.id);
    console.log(`  ✅ emitMesaCambio ejecutado sin error`);
  } catch (e: any) {
    if (e.message?.includes('syntax error') || e.message?.includes('?')) {
      throw new Error(`❌ emitMesaCambio tiene syntax error (placeholders SQLite): ${e.message}`);
    }
    throw e;
  }
  
  // Verificar que seq se incrementó
  const mesaDespues = await dataSource.getRepository(PdvMesa).findOneBy({ id: mesa.id });
  const seqDespues = mesaDespues?.seq ?? 0;
  
  if (seqDespues !== seqAntes + 1) {
    throw new Error(`❌ seq no se incrementó correctamente: ${seqAntes} -> ${seqDespues}`);
  }
  console.log(`  ✅ seq incrementado: ${seqAntes} -> ${seqDespues}`);
  
  console.log('  ✅ TEST 2 PASS');
}

/**
 * Test 3: Comanda emit también funciona
 */
async function testEmitComandaFunciona() {
  console.log('\n📋 TEST 3: emitComandaCambio funciona en Postgres');
  
  const { caja, moneda } = await setup();
  
  const { Comanda } = await import('../src/app/database/entities/ventas/comanda.entity');
  const { emitComandaCambio } = await import('../electron/utils/mesa-emit.utils');
  
  // Crear comanda
  const comanda = await dataSource.getRepository(Comanda).save({
    codigo: 'TEST-001',
    estado: 'DISPONIBLE',
    caja: { id: caja.id },
    activo: true,
    seq: 0,
  });
  
  console.log(`  → Comanda creada: id=${comanda.id}, seq=${comanda.seq}`);
  
  // Emitir cambio
  try {
    await emitComandaCambio(dataSource, comanda.id);
    console.log(`  ✅ emitComandaCambio ejecutado sin error`);
  } catch (e: any) {
    if (e.message?.includes('syntax error') || e.message?.includes('?')) {
      throw new Error(`❌ emitComandaCambio tiene syntax error: ${e.message}`);
    }
    throw e;
  }
  
  // Verificar seq
  const comandaDespues = await dataSource.getRepository(Comanda).findOneBy({ id: comanda.id });
  if (comandaDespues?.seq !== 1) {
    throw new Error(`❌ seq incorrecto: ${comandaDespues?.seq} (esperado 1)`);
  }
  console.log(`  ✅ seq incrementado: 0 -> ${comandaDespues.seq}`);
  
  console.log('  ✅ TEST 3 PASS');
}

/**
 * Main
 */
async function main() {
  const driver = isPostgres ? 'Postgres' : 'SQLite';
  console.log(`🚀 Test E2E SSE Emit (${driver})\n`);
  
  if (!isPostgres) {
    console.log('⚠️  Para probar en Postgres, ejecutar con:');
    console.log('   FRC_DB_TYPE=postgres FRC_PG_DATABASE=frc_test_sse_emit npm run test:sse-emit-postgres\n');
  }
  
  try {
    await testCreateVentaPersiste();
    await teardown();
    
    await testEmitsSseFuncionan();
    await teardown();
    
    await testEmitComandaFunciona();
    await teardown();
    
    console.log(`\n✅ TODOS LOS TESTS PASARON (${driver})\n`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FALLÓ:', error);
    process.exit(1);
  } finally {
    await teardown();
  }
}

main();
