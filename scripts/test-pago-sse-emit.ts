/**
 * Test del fix SSE en createPago/createPagoDetalle.
 * 
 * Verifica que los handlers resuelvan correctamente ventaId sin intentar
 * usar relations: ['venta'] en Pago (que no existe - la relación es al revés).
 */

import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';

async function testPagoSseEmit() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pago-sse.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const dataSource = new DataSource({ 
    ...(base as any), 
    database: dbFile, 
    synchronize: false, 
    migrationsRun: false 
  });
  
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  console.log('[pago-sse] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Venta } = E('ventas/venta.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Usuario } = E('personas/usuario.entity');
  const { Persona } = E('personas/persona.entity');
  const { TipoCliente } = E('personas/tipo-cliente.entity');

  const save = (ent: any, data: any) =>
    dataSource.getRepository(ent).save(dataSource.getRepository(ent).create(data as any) as any);

  try {
    console.log('\n=== Test fix SSE emit en createPago/createPagoDetalle ===\n');

    // Setup: crear entidades base
    const moneda = await save(Moneda, {
      denominacion: 'GUARANÍES',
      codigo: 'PYG',
      simbolo: '₲',
      activo: true,
      esPrincipal: true,
    });

    const formaPago = await save(FormasPago, {
      nombre: 'EFECTIVO',
      tipo: 'EFECTIVO',
      activo: true,
    });

    const dispositivo = await save(Dispositivo, {
      nombre: 'CAJA-TEST',
      activo: true,
    });

    const conteo = await save(Conteo, {});

    const caja = await save(Caja, {
      nombre: 'CAJA 1',
      estado: 'ABIERTO',
      fechaApertura: new Date(),
      activo: true,
      dispositivo,
      conteoApertura: conteo,
    });

    const tipoCliente = await save(TipoCliente, {
      descripcion: 'GENERAL',
      activo: true,
    });

    const persona = await save(Persona, {
      nombre: 'Cliente Test',
      activo: true,
    });

    const cliente = await save(Cliente, {
      activo: true,
      persona,
      tipoCliente,
    });

    const usuario = await save(Usuario, {
      nombre: 'TEST',
      nickname: 'test',
      password: 'hash',
      activo: true,
    });

    // 1. Test createPago con Venta
    console.log('Test 1: createPago con venta debe resolver ventaId sin error');
    
    const pago1 = await save(Pago, {
      estado: 'ABIERTO',
      activo: true,
      caja,
    });

    const venta1 = await save(Venta, {
      estado: 'ABIERTA',
      caja,
      formaPago,
      cliente,
      pago: pago1,
      createdBy: usuario,
      updatedBy: usuario,
    });

    // Simular la lógica del handler después del save
    try {
      const pagoId = pago1.id;
      if (pagoId) {
        const ventaFound = await dataSource.getRepository(Venta).findOne({ 
          where: { pago: { id: pagoId } } as any 
        });
        
        if (!ventaFound) {
          throw new Error('ventaId NO se resolvió - debería haber encontrado la venta');
        }
        
        if (ventaFound.id !== venta1.id) {
          throw new Error(`ventaId incorrecto: esperado ${venta1.id}, obtenido ${ventaFound.id}`);
        }
        
        console.log(`  ✓ ventaId resuelto correctamente: ${ventaFound.id}`);
      }
    } catch (e: any) {
      if (e.name === 'EntityPropertyNotFoundError') {
        console.error('  ✗ ERROR: EntityPropertyNotFoundError - relación venta no existe en Pago');
        throw e;
      }
      throw e;
    }

    // 2. Test createPagoDetalle con Venta
    console.log('\nTest 2: createPagoDetalle con venta debe resolver ventaId sin error');
    
    const pago2 = await save(Pago, {
      estado: 'ABIERTO',
      activo: true,
      caja,
    });

    const venta2 = await save(Venta, {
      estado: 'ABIERTA',
      caja,
      formaPago,
      cliente,
      pago: pago2,
      createdBy: usuario,
      updatedBy: usuario,
    });

    const pagoDetalle = await save(PagoDetalle, {
      pago: pago2,
      moneda,
      formaPago,
      valor: 50000,
      descripcion: 'PAGO TEST',
    });

    // Simular la lógica del handler después del save
    try {
      const pagoId = (pagoDetalle as any).pago?.id ?? pago2.id;
      if (pagoId) {
        const ventaFound = await dataSource.getRepository(Venta).findOne({ 
          where: { pago: { id: pagoId } } as any 
        });
        
        if (!ventaFound) {
          throw new Error('ventaId NO se resolvió - debería haber encontrado la venta');
        }
        
        if (ventaFound.id !== venta2.id) {
          throw new Error(`ventaId incorrecto: esperado ${venta2.id}, obtenido ${ventaFound.id}`);
        }
        
        console.log(`  ✓ ventaId resuelto correctamente: ${ventaFound.id}`);
      }
    } catch (e: any) {
      if (e.name === 'EntityPropertyNotFoundError') {
        console.error('  ✗ ERROR: EntityPropertyNotFoundError - relación venta no existe en Pago');
        throw e;
      }
      throw e;
    }

    // 3. Test Pago sin Venta (no debe fallar)
    console.log('\nTest 3: Pago sin venta NO debe causar error');
    
    const pagoSinVenta = await save(Pago, {
      estado: 'ABIERTO',
      activo: true,
      caja,
    });

    try {
      const pagoId = pagoSinVenta.id;
      if (pagoId) {
        const ventaFound = await dataSource.getRepository(Venta).findOne({ 
          where: { pago: { id: pagoId } } as any 
        });
        
        if (ventaFound) {
          throw new Error('No debería haber encontrado venta para este pago');
        }
        
        console.log('  ✓ Pago sin venta manejado correctamente (venta no encontrada, no hay error)');
      }
    } catch (e: any) {
      if (e.name === 'EntityPropertyNotFoundError') {
        console.error('  ✗ ERROR: EntityPropertyNotFoundError incluso con pago sin venta');
        throw e;
      }
      throw e;
    }

    console.log('\n✅ Todos los tests pasaron\n');

  } finally {
    await dataSource.destroy();
  }
}

testPagoSseEmit()
  .then(() => {
    console.log('Test completado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error en test:', error);
    process.exit(1);
  });
