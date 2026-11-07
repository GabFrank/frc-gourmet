/**
 * F8b fase 1 (docs/planes/PLAN-tienda-f8b-credito.md): vínculo manual cuenta web ↔ Cliente.
 *
 *  [1] permisos: ver exige CLIENTES_VER, vincular/desvincular CLIENTES_GESTIONAR
 *  [2] vincular: registra quién y cuándo; idempotente; una cuenta no pasa de un cliente a otro
 *      sin desvincular; un cliente no tiene dos cuentas (también por el índice único)
 *  [3] desvincular: exige motivo, deja historial y libera al cliente
 *  [4] el pedido de una cuenta vinculada guarda su cliente y la venta sale a su nombre;
 *      desvincular después no cambia el pedido; una cuenta sin vínculo no lleva cliente
 *  [5] la API pública no expone el id del Cliente interno
 *
 * Uso: npm run test:tienda-vinculacion   ·   … -- --pg (Postgres temporal)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { installHandlerRegistry, invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';

const PG = process.argv.includes('--pg');
const TAG = PG ? '[vinculacion-pg]' : '[vinculacion]';
let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function lanza(fn: () => Promise<any>): Promise<string> {
  try { await fn(); return ''; } catch (e: any) { return String(e?.message || e); }
}

async function abrirBase(): Promise<{ ds: DataSource; cerrar: () => Promise<void> } | null> {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!PG) {
    const dbFile = path.join(tmpDir, 'test-tienda-vinculacion.db');
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    const ds = new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
    await ds.initialize();
    return { ds, cerrar: async () => { await ds.destroy(); } };
  }
  const conn = {
    host: process.env['FRC_PG_HOST'] || 'localhost',
    port: process.env['FRC_PG_PORT'] ? Number(process.env['FRC_PG_PORT']) : 5432,
    username: process.env['FRC_PG_USERNAME'] || process.env['USER'] || 'postgres',
    password: process.env['FRC_PG_PASSWORD'] || undefined,
  };
  const nombre = `frc_gourmet_vinculotest_${process.pid}`;
  const admin = new DataSource({ type: 'postgres', ...conn, database: 'postgres' } as any);
  try { await admin.initialize(); } catch (e: any) {
    console.log(`${TAG} SALTEADO: no hay Postgres disponible (${String(e.message).split('\n')[0]}).`);
    return null;
  }
  await admin.query(`CREATE DATABASE "${nombre}"`);
  const ds = new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', ...conn, database: nombre } as any) as any), synchronize: false, migrationsRun: false });
  await ds.initialize();
  return { ds, cerrar: async () => { await ds.destroy(); await admin.query(`DROP DATABASE IF EXISTS "${nombre}"`); await admin.destroy(); } };
}

async function main() {
  const base = await abrirBase();
  if (!base) process.exit(0);
  const { ds, cerrar } = base!;
  await ds.runMigrations({ transaction: 'each' });
  console.log(`${TAG} Migraciones OK (${PG ? 'Postgres' : 'SQLite'}).`);

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const R = (e: any) => ds.getRepository(e);
  const save = (ent: any, data: any): Promise<any> => R(ent).save(R(ent).create(data as any) as any);
  const { Moneda } = E('financiero/moneda.entity');
  const { TipoPrecio } = E('financiero/tipo-precio.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Familia } = E('productos/familia.entity');
  const { Subfamilia } = E('productos/subfamilia.entity');
  const { Producto } = E('productos/producto.entity');
  const { Presentacion } = E('productos/presentacion.entity');
  const { PrecioVenta } = E('productos/precio-venta.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { Venta } = E('ventas/venta.entity');
  const { CuentaCliente } = E('pedidos-online/cuenta-cliente.entity');
  const { CuentaClienteVinculo } = E('pedidos-online/cuenta-cliente-vinculo.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');

  const gs = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 });
  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const subfamilia = await save(Subfamilia, { nombre: 'CLASICAS', activo: true, familia: await save(Familia, { nombre: 'HAMBURGUESAS', activo: true }) });
  const producto = await save(Producto, { nombre: 'HAMBURGUESA', tipo: 'RETAIL', activo: true, esVendible: true, disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia });
  const presentacion = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto });
  await save(PrecioVenta, { valor: 45000, principal: true, activo: true, moneda: gs, tipoPrecio, presentacion });
  const caja = await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), dispositivo: await save(Dispositivo, { nombre: 'CAJA1', activo: true }),
    conteoApertura: await save(Conteo, {}), activo: true,
  });
  await save(PdvConfig, { autoImprimirComanda: false });

  const cuenta = await save(CuentaCliente, { telefono: '595981111222', telefonoVerificado: true, nombre: 'CLIENTE UNO', activo: true });
  const otra = await save(CuentaCliente, { email: 'dos@example.com', emailVerificado: true, telefonoContacto: '595981333444', nombre: 'CLIENTE DOS', activo: true });
  const cliente = await save(Cliente, { persona: await save(Persona, { nombre: 'JUAN', apellido: 'PEREZ' }), ruc: '1234567-8', activo: true, credito: true, saldoActual: 0 });
  const cliente2 = await save(Cliente, { persona: await save(Persona, { nombre: 'ANA', apellido: 'GOMEZ' }), activo: true, saldoActual: 0 });
  const inactivo = await save(Cliente, { persona: await save(Persona, { nombre: 'BAJA' }), activo: false, saldoActual: 0 });

  const permiso = async (codigo: string) => save(Permission, { codigo, descripcion: codigo, activo: true });
  const pVer = await permiso('CLIENTES_VER');
  const pGest = await permiso('CLIENTES_GESTIONAR');
  const otros = [await permiso('PEDIDOS_ONLINE_VER'), await permiso('PEDIDOS_ONLINE_GESTIONAR'), await permiso('VENTAS_PDV')];
  const usuario = async (nick: string, perms: any[]) => {
    const u = await save(Usuario, { nickname: nick, password: 'x', activo: true });
    const rol = await save(Role, { descripcion: nick.toUpperCase(), activo: true });
    for (const p of perms) await save(RolePermission, { role: rol, permission: p });
    await save(UsuarioRole, { usuario: u, role: rol });
    return u;
  };
  const admin = await usuario('admin', [pVer, pGest, ...otros]);
  const lector = await usuario('lector', [pVer, ...otros]);
  const nadie = await usuario('nadie', otros);

  installHandlerRegistry();
  let actual: any = admin;
  const getUser = () => actual;
  const { registerVentasHandlers, materializarPedidoOnlineEnVenta } = require('../electron/handlers/ventas.handler');
  registerVentasHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online.handler').registerPedidosOnlineHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-pedidos.handler').registerPedidosOnlinePedidosHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-admin.handler').registerPedidosOnlineAdminHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-config.handler').registerPedidosOnlineConfigHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-auth.handler').registerPedidosOnlineAuthHandlers(ds, getUser);
  require('../electron/handlers/delivery.handler').registerDeliveryHandlers(ds, getUser);
  require('../electron/handlers/cuentas-tienda.handler').registerCuentasTiendaHandlers(ds, getUser);

  const como = async <T>(u: any, fn: () => Promise<T>): Promise<T> => { const prev = actual; actual = u; try { return await fn(); } finally { actual = prev; } };
  const vinc = (c: any, cli: any, motivo?: string) => invokeHandler('vincular-cuenta-tienda', c.id, cli.id, motivo) as Promise<any>;
  const desv = (c: any, motivo: string) => invokeHandler('desvincular-cuenta-tienda', c.id, motivo) as Promise<any>;
  const fila = async (c: any) => (await R(CuentaCliente).findOne({ where: { id: c.id }, relations: ['cliente', 'vinculadoPor'] })) as any;
  const historial = async (c: any) => (await invokeHandler('get-vinculos-cuenta-tienda', c.id) as any)?.data || [];

  // ═══════ [1] Permisos ═══════
  console.log('\n[1] Permisos');
  ok(/PERMISO REQUERIDO: CLIENTES_VER/.test(await lanza(() => como(nadie, () => invokeHandler('get-cuentas-tienda', {})))), '1: ver la lista sin CLIENTES_VER se rechaza');
  const listaLector: any = await como(lector, () => invokeHandler('get-cuentas-tienda', {}));
  ok(listaLector?.success === true && listaLector.total === 2, '1: con CLIENTES_VER se ve', listaLector?.total);
  ok(/PERMISO REQUERIDO: CLIENTES_GESTIONAR/.test(await lanza(() => como(lector, () => vinc(cuenta, cliente)))), '1: vincular sin CLIENTES_GESTIONAR se rechaza');
  ok(!(await fila(cuenta)).cliente, '1: y no se vinculó');
  ok(!JSON.stringify(listaLector.data).includes('passwordHash'), '1: la lista no trae datos del ingreso');

  // ═══════ [2] Vincular ═══════
  console.log('\n[2] Vincular');
  ok((await vinc(cuenta, inactivo))?.error === 'cliente_no_disponible', '2: un cliente inactivo no se vincula');
  const v1 = await vinc(cuenta, cliente, 'verificó la cédula en caja');
  let f = await fila(cuenta);
  ok(v1?.success === true && f.cliente?.id === cliente.id, '2: vinculada al cliente', v1);
  ok(f.vinculadoPor?.id === admin.id && !!f.vinculadoEn, '2: queda quién y cuándo', { por: f.vinculadoPor?.id, en: f.vinculadoEn });
  let h = await historial(cuenta);
  ok(h.length === 1 && h[0].accion === 'VINCULAR' && h[0].usuario === 'admin' && h[0].motivo === 'VERIFICÓ LA CÉDULA EN CAJA', '2: historial con usuario y nota en mayúsculas', h);
  ok((await vinc(cuenta, cliente))?.sinCambios === true && (await historial(cuenta)).length === 1, '2: repetir el mismo vínculo no duplica el historial');
  ok((await vinc(cuenta, cliente2))?.error === 'cuenta_ya_vinculada' && (await fila(cuenta)).cliente?.id === cliente.id,
    '2: pasar la cuenta a otro cliente exige desvincular primero');
  ok((await vinc(otra, cliente))?.error === 'cliente_ya_tiene_cuenta', '2: un cliente no tiene dos cuentas web');
  let choque = '';
  try { await R(CuentaCliente).update({ id: otra.id }, { cliente: { id: cliente.id } } as any); } catch (e: any) { choque = String(e?.message || e); }
  ok(!!choque && !(await fila(otra)).cliente, '2: el índice único lo impide aunque se saltee el handler', choque.slice(0, 80));
  const lista: any = await invokeHandler('get-cuentas-tienda', { vinculo: 'VINCULADAS' });
  ok(lista.total === 1 && lista.data[0].cliente?.nombre === 'JUAN PEREZ' && lista.data[0].vinculadoPor === 'admin', '2: filtro «vinculadas» con el nombre del cliente', lista.data);
  ok((await invokeHandler('get-cuentas-tienda', { vinculo: 'SIN_VINCULAR' }) as any).data?.[0]?.id === otra.id, '2: filtro «sin vincular»');
  ok((await invokeHandler('get-cuentas-tienda', { texto: '333444' }) as any).data?.map((x: any) => x.id).join() === String(otra.id), '2: busca por teléfono de contacto');
  ok((await invokeHandler('get-cuenta-tienda-de-cliente', cliente.id) as any)?.data?.id === cuenta.id, '2: la ficha del cliente encuentra su cuenta web');

  // ═══════ [4] Pedido y venta ═══════
  console.log('\n[4] Pedido y venta a nombre del cliente');
  const ctx = (c: any) => ({ customerId: c.id, clientIp: '10.0.0.5' } as any);
  const pedir = async (c: any): Promise<any> => {
    const r: any = await invokeHandlerWithContext('crear-pedido-online', ctx(c), {
      tipoPedido: 'PICKUP', items: [{ productoId: producto.id, presentacionId: presentacion.id, cantidad: 1 }],
    });
    if (!r?.success) throw new Error('no se pudo crear el pedido: ' + JSON.stringify(r));
    return R(PedidoOnline).findOne({ where: { numero: r.numero } });
  };
  /** Como al tocar ACEPTAR: pasa a ACEPTADO y se materializa (venta + retiro). */
  const aceptar = async (p: any) => {
    await R(PedidoOnline).update({ id: p.id }, { estado: 'ACEPTADO' } as any);
    return materializarPedidoOnlineEnVenta(ds, p.id, { cajaId: caja.id }, admin.id);
  };
  const p1: any = await pedir(cuenta);
  ok(p1.clienteId === cliente.id, '4: el pedido guarda el cliente de la cuenta vinculada', p1.clienteId);
  const mat = await aceptar(p1);
  const venta: any = await R(Venta).findOne({ where: { id: mat.ventaId }, relations: ['cliente'] });
  ok(venta?.cliente?.id === cliente.id, '4: la venta sale a nombre del cliente', venta?.cliente?.id);
  const p2: any = await pedir(otra);
  ok(p2.clienteId == null, '4: una cuenta sin vínculo no lleva cliente');
  const mat2 = await aceptar(p2);
  ok(!(await R(Venta).findOne({ where: { id: mat2.ventaId }, relations: ['cliente'] }) as any)?.cliente, '4: y su venta tampoco');

  // ═══════ [3] Desvincular ═══════
  console.log('\n[3] Desvincular');
  ok((await desv(cuenta, '  '))?.error === 'motivo_requerido' && (await fila(cuenta)).cliente?.id === cliente.id, '3: sin motivo no se desvincula');
  ok(/CLIENTES_GESTIONAR/.test(await lanza(() => como(lector, () => desv(cuenta, 'x')))), '3: sin permiso no se desvincula');
  const d1 = await desv(cuenta, 'la cuenta era del hijo');
  f = await fila(cuenta);
  ok(d1?.success === true && !f.cliente && !f.vinculadoPor && !f.vinculadoEn, '3: desvinculada, sin quién ni cuándo vigentes', d1);
  h = await historial(cuenta);
  ok(h.length === 2 && h[0].accion === 'DESVINCULAR' && h[0].motivo === 'LA CUENTA ERA DEL HIJO' && h[1].accion === 'VINCULAR', '3: el historial guarda las dos cosas', h);
  ok(((await R(PedidoOnline).findOne({ where: { id: p1.id } })) as any).clienteId === cliente.id, '3: el pedido ya hecho sigue a nombre del cliente');
  ok((await pedir(cuenta)).clienteId == null, '3: los pedidos nuevos ya no llevan cliente');
  ok((await vinc(otra, cliente))?.success === true, '3: el cliente liberado se puede vincular a otra cuenta');
  ok((await desv(cuenta, 'otra vez'))?.sinCambios === true && (await historial(cuenta)).length === 2, '3: desvincular una cuenta sin vínculo no ensucia el historial');
  ok((await R(CuentaClienteVinculo).count()) === 3, '3: tres registros en total');

  // ═══════ [5] API pública ═══════
  console.log('\n[5] API pública');
  const me: any = await invokeHandlerWithContext('pub-cliente-me', ctx(otra));
  ok(me?.success === true && !('clienteId' in (me.cuenta || {})) && !JSON.stringify(me).includes(String(cliente.ruc)),
    '5: «mi cuenta» no expone el cliente interno', me?.cuenta);

  await cerrar();
  console.log(`\n${TAG} RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
