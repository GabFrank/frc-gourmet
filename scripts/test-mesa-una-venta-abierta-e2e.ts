/**
 * E2E: invariante "máximo 1 venta ABIERTA (comanda IS NULL) por mesaId".
 *
 * El bug que protege: Alpha Don Franco 2026-09-10/11 noche, mesa 4 tuvo 3 ventas
 * concurrentes (3738/3739/3771). Al cobrar la 3739, `cerrarVentasAbiertasMesa`
 * marcó la 3771 como CONCLUIDA sin pago (montoCubierto = 0, pérdida 254k Gs).
 *
 * Este test verifica:
 * P0-1: `createVenta` rechaza la 2ª venta ABIERTA de la misma mesa.
 * P0-2: `cerrarVentasAbiertasMesa` rechaza cerrar si hay >1 ABIERTA.
 * P0-3: `updateVenta`→CONCLUIDA rechaza si hay hermanas ABIERTAS.
 * P0-4: `createVenta` rechaza `mesa_id` suelto sin relación.
 * P0-5: `materializarPedidoOnlineEnVenta` rechaza si la mesa ya tiene ABIERTA.
 *
 * Uso: npm run test:mesa-una-venta-abierta
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerPedidosOnlineHandlers } from '../electron/handlers/pedidos-online.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-mesa-una-venta-abierta.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[mesa-una-venta-abierta] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Venta } = E('ventas/venta.entity');
  const { PedidoOnline } = E('ventas/pedido-online.entity');
  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // Usuario con VENTAS_PDV (mozo/cajero estándar)
  const cajero: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'CAJERO', activo: true });
  const permPdv: any = await save(Permission, { codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true });
  await save(RolePermission, { role: rol, permission: permPdv });
  await save(UsuarioRole, { usuario: cajero, role: rol });

  registerVentasHandlers(ds, () => cajero);
  registerPedidosOnlineHandlers(ds, () => cajero);

  const caja: any = await save(Caja, { estado: 'ABIERTO', montoApertura: 0 });
  const nuevaMesa = async (numero: number) =>
    await save(PdvMesa, { numero, estado: 'DISPONIBLE', activo: true, reservado: false });

  // ═══════ [P0-1] createVenta rechaza 2ª ABIERTA de la misma mesa ═══════
  console.log('\n[P0-1] createVenta: invariante 1 venta ABIERTA por mesa');
  {
    const mesa: any = await nuevaMesa(1);
    const venta1: any = await invokeHandler('createVenta', {
      estado: 'ABIERTA',
      caja: { id: caja.id },
      mesa: { id: mesa.id }
    });
    ok(!!venta1?.id, 'P0-1a: 1ª venta de mesa se crea OK', venta1?.id);

    let err = '';
    try {
      await invokeHandler('createVenta', {
        estado: 'ABIERTA',
        caja: { id: caja.id },
        mesa: { id: mesa.id }
      });
    } catch (e: any) { err = e.message; }
    ok(/MESA_YA_TIENE_VENTA_ABIERTA/.test(err), 'P0-1b: 2ª venta ABIERTA se rechaza', err);

    // Verificar que solo hay 1 venta ABIERTA en la mesa
    const ventasAbiertas = await ds.getRepository(Venta).count({
      where: { mesa: { id: mesa.id }, estado: 'ABIERTA', comanda: null } as any
    });
    ok(ventasAbiertas === 1, 'P0-1c: solo hay 1 venta ABIERTA en la mesa', ventasAbiertas);
  }

  // ═══════ [P0-2] cerrarVentasAbiertasMesa rechaza si hay >1 ABIERTA ═══════
  console.log('\n[P0-2] cerrarVentasAbiertasMesa: rechaza con múltiples ABIERTAS');
  {
    const mesa: any = await nuevaMesa(2);
    // Crear 2 ventas ABIERTAS directamente en DB (simular datos legacy)
    const v1: any = await save(Venta, {
      estado: 'ABIERTA',
      caja: { id: caja.id },
      mesa: { id: mesa.id },
      comanda: null
    });
    const v2: any = await save(Venta, {
      estado: 'ABIERTA',
      caja: { id: caja.id },
      mesa: { id: mesa.id },
      comanda: null
    });

    let errConcluida = '';
    try {
      await invokeHandler('cerrarVentasAbiertasMesa', mesa.id, 'CONCLUIDA', { validarDispositivoCaja: false });
    } catch (e: any) { errConcluida = e.message; }
    ok(/MESA_TIENE_OTRAS_VENTAS_ABIERTAS/.test(errConcluida), 'P0-2a: rechaza CONCLUIR con >1 ABIERTA', errConcluida);

    let errCancelada = '';
    try {
      await invokeHandler('cerrarVentasAbiertasMesa', mesa.id, 'CANCELADA', { validarDispositivoCaja: false });
    } catch (e: any) { errCancelada = e.message; }
    ok(/MESA_TIENE_OTRAS_VENTAS_ABIERTAS/.test(errCancelada), 'P0-2b: rechaza CANCELAR con >1 ABIERTA', errCancelada);

    // Verificar que ambas ventas siguen ABIERTAS (no se cerraron silenciosamente)
    const [estado1, estado2] = await Promise.all([
      ds.getRepository(Venta).findOneBy({ id: v1.id } as any),
      ds.getRepository(Venta).findOneBy({ id: v2.id } as any)
    ]);
    ok(estado1!.estado === 'ABIERTA' && estado2!.estado === 'ABIERTA', 'P0-2c: ambas ventas siguen ABIERTAS', { v1: estado1!.estado, v2: estado2!.estado });
  }

  // ═══════ [P0-3] updateVenta→CONCLUIDA rechaza con hermanas ABIERTAS ═══════
  console.log('\n[P0-3] updateVenta: rechaza CONCLUIR con hermanas ABIERTAS');
  {
    const mesa: any = await nuevaMesa(3);
    // Crear 2 ventas ABIERTAS directamente en DB
    const v1: any = await save(Venta, {
      estado: 'ABIERTA',
      caja: { id: caja.id },
      mesa: { id: mesa.id },
      comanda: null
    });
    const v2: any = await save(Venta, {
      estado: 'ABIERTA',
      caja: { id: caja.id },
      mesa: { id: mesa.id },
      comanda: null
    });

    let err = '';
    try {
      await invokeHandler('updateVenta', v1.id, { estado: 'CONCLUIDA' });
    } catch (e: any) { err = e.message; }
    ok(/MESA_TIENE_OTRAS_VENTAS_ABIERTAS/.test(err), 'P0-3a: updateVenta rechaza CONCLUIR v1', err);

    // Verificar que v1 NO se contaminó (sigue ABIERTA)
    const v1Despues: any = await ds.getRepository(Venta).findOneBy({ id: v1.id } as any);
    ok(v1Despues!.estado === 'ABIERTA', 'P0-3b: v1 NO se contaminó (sigue ABIERTA)', v1Despues!.estado);
  }

  // ═══════ [P0-4] createVenta rechaza mesa_id suelto ═══════
  console.log('\n[P0-4] createVenta: rechaza mesa_id suelto sin relación');
  {
    const mesa: any = await nuevaMesa(4);
    let err = '';
    try {
      await invokeHandler('createVenta', {
        estado: 'ABIERTA',
        caja: { id: caja.id },
        mesa_id: mesa.id  // Forma plana (evasión)
      });
    } catch (e: any) { err = e.message; }
    ok(/VENTA_MESA_DEBE_SER_RELACION/.test(err), 'P0-4: rechaza mesa_id suelto', err);
  }

  // ═══════ [P0-5] materializarPedidoOnlineEnVenta rechaza si mesa tiene ABIERTA ═══════
  console.log('\n[P0-5] pedido online: rechaza crear venta si mesa tiene ABIERTA');
  {
    const mesa: any = await nuevaMesa(5);
    // 1ª venta ABIERTA de mesa (sin pedido)
    await save(Venta, {
      estado: 'ABIERTA',
      caja: { id: caja.id },
      mesa: { id: mesa.id },
      comanda: null
    });

    // Pedido online de mesa (QR_MESA)
    const pedido: any = await save(PedidoOnline, {
      tipo: 'MESA',
      mesaId: mesa.id,
      estado: 'PENDIENTE',
      total: 10000
    });

    let err = '';
    try {
      await invokeHandler('materializar-pedido-online-en-venta', pedido.id, { cajaId: caja.id });
    } catch (e: any) { err = e.message; }
    ok(/MESA_YA_TIENE_VENTA_ABIERTA/.test(err), 'P0-5: pedido online rechaza crear venta', err);

    // Verificar que pedido NO se materializó
    const pedidoDespues: any = await ds.getRepository(PedidoOnline).findOneBy({ id: pedido.id } as any);
    ok(!pedidoDespues!.ventaId, 'P0-5b: pedido NO se materializó', pedidoDespues!.ventaId);
  }

  // ═══════ [REVERSIÓN] Tests deben FALLAR sin el fix ═══════
  console.log('\n[REVERSIÓN] Comentar guards → tests fallan (para verificar efectividad)');
  {
    // Este bloque es documentación: si revertís el fix (comentás los guards),
    // los tests de arriba deben FALLAR. Caso de uso:
    //   1. Comentar assertNoVentaAbiertaEnMesa en createVenta
    //   2. npm run test:mesa-una-venta-abierta
    //   3. Debe fallar P0-1b (2ª venta NO se rechaza)
    //   4. Descomentar el guard
    //   5. npm run test:mesa-una-venta-abierta
    //   6. Debe pasar P0-1b
    ok(true, 'REVERSIÓN: instrucciones en el código', 'Comentar guards → tests rojos');
  }

  await ds.destroy();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✓ ${passed}   ✗ ${failed}   Total: ${passed + failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1); });
