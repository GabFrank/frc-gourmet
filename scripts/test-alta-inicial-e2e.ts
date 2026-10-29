/**
 * E2E de los arreglos encontrados al relevar la instalación y carga inicial
 * (runbook docs/runbooks/RUNBOOK-INSTALACION-Y-CARGA-INICIAL.md).
 *
 *  #329 · `updateVenta` no deja concluir una venta sin `Pago`.
 *  #330 · una venta que ya no está ABIERTA no cambia de canal.
 *  #336 · `requiereComanda` se guarda en create/update-producto.
 *  #337 · `change-password` por /api/rpc usa el usuario del JWT, no el de la
 *         consola del servidor.
 *  #339 · el seed crea el tipo de cliente CONVENIADO y el alta de funcionario
 *         con cliente conveniado (default de la UI) funciona en una base nueva.
 *
 * No cubre #340 (Caja Mayor numeric(18,2)): SQLite no fija precisión, sólo se
 * ve en Postgres (job "Migration run" del CI). #338 es de UI (manual).
 *
 * Uso: npm run test:alta-inicial
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { withRequestUser } from '../electron/utils/auth.utils';
import { hashPassword, verifyPassword } from '../electron/utils/password.utils';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { seedSystemData } from '../electron/utils/seed-system';
import { seedInitialData } from '../electron/utils/seed-data';
import { seedPermissions } from '../electron/handlers/permissions.handler';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerProductosHandlers } from '../electron/handlers/productos.handler';
import { registerPersonasHandlers } from '../electron/handlers/personas.handler';
import { registerRrhhFuncionariosHandlers } from '../electron/handlers/rrhh-funcionarios.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function rechaza(patron: RegExp, nombre: string, fn: () => Promise<any>) {
  try { await fn(); ok(false, nombre, 'no lanzó'); }
  catch (e: any) { ok(patron.test(String(e?.message || e)), nombre, String(e?.message || e)); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-alta-inicial.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[alta-inicial] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Persona } = E('personas/persona.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { TipoCliente } = E('personas/tipo-cliente.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Venta } = E('ventas/venta.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Pago } = E('compras/pago.entity');
  const { Producto } = E('productos/producto.entity');
  const { Subfamilia } = E('productos/subfamilia.entity');
  const { Cargo } = E('rrhh/cargo.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // ═══════ [#339] Seed: CONVENIADO ═══════
  console.log('\n[#339] Seed del tipo de cliente CONVENIADO');
  {
    // Misma secuencia que el arranque real (main.ts).
    await seedInitialData(ds);
    await seedPermissions(ds);
    await seedSystemData(ds);
    const tipos: any[] = await ds.getRepository(TipoCliente).find();
    const desc = tipos.map(t => t.descripcion);
    ok(desc.includes('CONSUMIDOR FINAL'), '#339: una base nueva tiene CONSUMIDOR FINAL', desc);
    ok(desc.includes('CONVENIADO'), '#339: y CONVENIADO', desc);
    ok(tipos.find(t => t.descripcion === 'CONVENIADO')?.credito === true, '#339: CONVENIADO con crédito');

    // Idempotente, y llega a instalaciones existentes sin duplicar.
    await ds.getRepository(TipoCliente).delete({ descripcion: 'CONVENIADO' } as any);
    await seedSystemData(ds);
    await seedSystemData(ds);
    const conv = await ds.getRepository(TipoCliente).count({ where: { descripcion: 'CONVENIADO' } as any });
    ok(conv === 1, '#339: una base existente sin CONVENIADO lo recibe, una sola vez', conv);
    const cf = await ds.getRepository(TipoCliente).count({ where: { descripcion: 'CONSUMIDOR FINAL' } as any });
    ok(cf === 1, '#339: CONSUMIDOR FINAL no se duplica', cf);
  }

  // Admin del seed (todos los permisos) con la contraseña ya cambiada.
  const admin: any = await ds.getRepository(Usuario).findOne({ where: { nickname: 'admin' } as any });
  await ds.getRepository(Usuario).update(admin.id, { mustChangePassword: false } as any);
  admin.mustChangePassword = false;
  let consola: any = admin;           // usuario logueado en la consola del servidor
  registerVentasHandlers(ds, () => consola);
  registerProductosHandlers(ds, () => consola);
  registerPersonasHandlers(ds, () => consola);
  registerRrhhFuncionariosHandlers(ds, () => consola);

  // ═══════ [#339] Alta de funcionario con cliente conveniado ═══════
  console.log('\n[#339] Alta de funcionario con "crear cliente conveniado"');
  {
    const persona: any = await save(Persona, { nombre: 'JUAN', apellido: 'PEREZ', documento: '1234567', tipoDocumento: 'CI', tipoPersona: 'FISICA', activo: true });
    const cargo: any = await ds.getRepository(Cargo).findOne({ where: { nombre: 'CAJERO' } as any });
    const gs: any = await ds.getRepository(Moneda).findOne({ where: { principal: true } as any });
    const r: any = await invokeHandler('create-funcionario', {
      personaId: persona.id, cargoId: cargo.id, monedaSalarioId: gs.id, salarioBase: 2800000,
      fechaIngreso: '2026-11-01', crearClienteConveniado: true,
    });
    const funcId = r?.id ?? r?.funcionario?.id;
    ok(!!funcId, '#339: el alta con crearClienteConveniado=true funciona en una base nueva', r);
    const cli: any = await ds.getRepository(Cliente).findOne({ where: { persona: { id: persona.id } } as any, relations: ['tipo_cliente'] });
    ok(cli?.tipo_cliente?.descripcion === 'CONVENIADO', '#339: y crea el cliente CONVENIADO', cli?.tipo_cliente);
  }

  // ═══════ [#336] requiereComanda ═══════
  console.log('\n[#336] requiereComanda se guarda');
  {
    const sub: any = await ds.getRepository(Subfamilia).findOne({ where: {} });
    const p: any = await invokeHandler('create-producto', {
      nombre: 'ENTRADA', tipo: 'RETAIL', unidadBase: 'UNIDAD', subfamiliaId: sub.id, requiereComanda: false,
    });
    const pid = p?.id;
    let leido: any = await ds.getRepository(Producto).findOneBy({ id: pid });
    ok(leido?.requiereComanda === false, '#336: create-producto guarda requiereComanda=false', leido?.requiereComanda);
    await invokeHandler('update-producto', pid, { requiereComanda: true });
    leido = await ds.getRepository(Producto).findOneBy({ id: pid });
    ok(leido?.requiereComanda === true, '#336: update-producto lo vuelve a true', leido?.requiereComanda);
    await invokeHandler('update-producto', pid, { requiereComanda: false });
    leido = await ds.getRepository(Producto).findOneBy({ id: pid });
    ok(leido?.requiereComanda === false, '#336: update-producto lo apaga', leido?.requiereComanda);
    await invokeHandler('update-producto', pid, { nombre: 'ENTRADA VIP' });
    leido = await ds.getRepository(Producto).findOneBy({ id: pid });
    ok(leido?.requiereComanda === false, '#336: un update sin el campo no lo toca', leido?.requiereComanda);
    const p2: any = await invokeHandler('create-producto', { nombre: 'GASEOSA', tipo: 'RETAIL', unidadBase: 'UNIDAD', subfamiliaId: sub.id });
    ok((await ds.getRepository(Producto).findOneBy({ id: p2.id }) as any)?.requiereComanda === true,
       '#336: sin el campo, el default sigue siendo true');
  }

  // ═══════ [#337] change-password con el usuario del request ═══════
  console.log('\n[#337] change-password por /api/rpc');
  {
    const persona: any = await save(Persona, { nombre: 'MARIA', tipoDocumento: 'CI', tipoPersona: 'FISICA', activo: true });
    const maria: any = await save(Usuario, {
      nickname: 'MARIA', password: await hashPassword('temporal1'), persona, activo: true, mustChangePassword: true,
    });
    const payload = { usuarioId: maria.id, currentPassword: 'temporal1', newPassword: 'nueva123' };

    // La consola del servidor tiene al admin logueado; MARIA llega por HTTP.
    consola = admin;
    const r: any = await withRequestUser(maria, () => invokeHandler('change-password', payload));
    ok(r?.success === true, '#337: MARIA cambia SU contraseña por HTTP aunque la consola tenga otro usuario', r);
    const leida: any = await ds.getRepository(Usuario).createQueryBuilder('u')
      .addSelect('u.password').where('u.id = :id', { id: maria.id }).getOne();
    ok(await verifyPassword('nueva123', leida.password), '#337: la contraseña nueva quedó guardada');
    ok(leida.mustChangePassword === false, '#337: y baja mustChangePassword');

    // Sigue sin poder cambiar la de OTRO.
    const r2: any = await withRequestUser(maria, () => invokeHandler('change-password', {
      usuarioId: admin.id, currentPassword: 'x', newPassword: 'otraotra',
    }));
    ok(r2?.success === false && /NO AUTORIZADO/.test(r2?.message), '#337: no puede cambiar la de otro usuario', r2);

    // Sin contexto HTTP (IPC local) sigue usando la consola.
    consola = maria;
    const r3: any = await invokeHandler('change-password', { usuarioId: maria.id, currentPassword: 'nueva123', newPassword: 'otra4567' });
    ok(r3?.success === true, '#337: por IPC local sigue usando el usuario de la consola', r3);
    consola = admin;
  }

  // ═══════ [#329] / [#330] updateVenta ═══════
  console.log('\n[#329] Concluir exige Pago · [#330] el canal se congela al salir de ABIERTA');
  {
    const disp: any = await ds.getRepository(Dispositivo).findOne({ where: {} });
    const conteo: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
    const caja: any = await save(Caja, {
      estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
      conteoApertura: { id: conteo.id }, dispositivo: { id: disp.id },
    });
    const nueva = () => save(Venta, { estado: 'ABIERTA', caja: { id: caja.id } });

    const v1: any = await nueva();
    await rechaza(/VENTA_SIN_PAGO/, '#329: concluir sin Pago se rechaza',
      () => invokeHandler('updateVenta', v1.id, { estado: 'CONCLUIDA' }));
    ok((await ds.getRepository(Venta).findOneBy({ id: v1.id }) as any).estado === 'ABIERTA', '#329: la venta sigue ABIERTA');

    const pago: any = await save(Pago, { estado: 'ABIERTO', activo: true, caja: { id: caja.id } });
    await invokeHandler('updateVenta', v1.id, { estado: 'CONCLUIDA', pago: { id: pago.id } });
    ok((await ds.getRepository(Venta).findOneBy({ id: v1.id }) as any).estado === 'CONCLUIDA', '#329: con Pago en el payload concluye');

    // Pago adoptado antes (el diálogo vincula el pago y concluye después).
    const v2: any = await nueva();
    const pago2: any = await save(Pago, { estado: 'ABIERTO', activo: true, caja: { id: caja.id } });
    await invokeHandler('updateVenta', v2.id, { pago: { id: pago2.id } });
    await invokeHandler('updateVenta', v2.id, { estado: 'CONCLUIDA' });
    ok((await ds.getRepository(Venta).findOneBy({ id: v2.id }) as any).estado === 'CONCLUIDA', '#329: con el Pago ya adoptado concluye');

    // Rehabilitar (CANCELADA → CONCLUIDA) no pasa por esta regla.
    const v3: any = await nueva();
    await ds.getRepository(Venta).update(v3.id, { estado: 'CANCELADA' } as any);
    await invokeHandler('updateVenta', v3.id, { estado: 'CONCLUIDA' });
    ok((await ds.getRepository(Venta).findOneBy({ id: v3.id }) as any).estado === 'CONCLUIDA', '#329: rehabilitar no exige Pago nuevo');

    // #330: una venta concluida no cambia de canal.
    const mesa: any = await save(PdvMesa, { numero: 9, estado: 'DISPONIBLE', activo: true, reservado: false });
    await invokeHandler('updateVenta', v1.id, { mesa: { id: mesa.id }, canalOrigen: 'WEB', nombreCliente: 'PEDRO' });
    const tras: any = await ds.getRepository(Venta).findOne({ where: { id: v1.id }, relations: ['mesa'] });
    ok(!tras.mesa, '#330: no se le puede poner mesa a una venta concluida', tras.mesa);
    ok(tras.canalOrigen === 'LOCAL', '#330: ni cambiarle el canal', tras.canalOrigen);
    ok(tras.nombreCliente === 'PEDRO', '#330: el resto del payload sí se aplica');

    // En una venta ABIERTA sigue funcionando (la usa el PdV).
    const v4: any = await nueva();
    await invokeHandler('updateVenta', v4.id, { mesa: { id: mesa.id } });
    const abierta: any = await ds.getRepository(Venta).findOne({ where: { id: v4.id }, relations: ['mesa'] });
    ok(abierta.mesa?.id === mesa.id, '#330: en una venta ABIERTA se sigue pudiendo asignar mesa', abierta.mesa);
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} alta-inicial: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
