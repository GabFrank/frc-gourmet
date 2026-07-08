/**
 * E2E smoke de PEDIDOS ONLINE — ejecuta el código real (no solo compila).
 *
 * Arranca un Fastify con los handlers reales contra una BD SQLite temporal
 * (migraciones incluidas) y ejerce el flujo público + la bandeja admin:
 *   menu.get → auth.otp.request → auth.otp.verify → pedido.crear (pickup/delivery)
 *   → pedido.mis → [admin] listar/aceptar/avanzar.
 *
 * Uso:
 *   npx ts-node --project tsconfig.typeorm.json scripts/test-pedidos-online-e2e.ts
 *   (o: npm run test:pedidos-online)
 */
import 'reflect-metadata';
import './_electron-mock'; // DEBE ir antes de cualquier import que use electron
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerAuthPlugin } from '../electron/server/auth-middleware';
import { registerPublicRoutes } from '../electron/server/public-routes';
import { registerPedidosOnlineHandlers } from '../electron/handlers/pedidos-online.handler';
import { registerPedidosOnlineAuthHandlers } from '../electron/handlers/pedidos-online-auth.handler';
import { registerPedidosOnlinePedidosHandlers } from '../electron/handlers/pedidos-online-pedidos.handler';
import { registerPedidosOnlineAdminHandlers } from '../electron/handlers/pedidos-online-admin.handler';

const PORT = 7099;
const BASE = `http://localhost:${PORT}`;

// --- mini framework de asserts ---
let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function pub(op: string, params: any[] = [], token?: string): Promise<any> {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/pub/rpc`, { method: 'POST', headers, body: JSON.stringify({ op, params }) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...(json as any) };
}

async function seed(dataSource: DataSource): Promise<any> {
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
  const { TipoPrecio } = require('../src/app/database/entities/financiero/tipo-precio.entity');
  const { Familia } = require('../src/app/database/entities/productos/familia.entity');
  const { Subfamilia } = require('../src/app/database/entities/productos/subfamilia.entity');
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const { PrecioVenta } = require('../src/app/database/entities/productos/precio-venta.entity');
  const { ZonaDelivery } = require('../src/app/database/entities/pedidos-online/zona-delivery.entity');
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');
  const { hashPassword } = require('../electron/utils/password.utils');

  const moneda = await dataSource.getRepository(Moneda).save(
    dataSource.getRepository(Moneda).create({ denominacion: 'GUARANI', simbolo: 'Gs', principal: true } as any),
  );
  const tipoPrecio = await dataSource.getRepository(TipoPrecio).save(
    dataSource.getRepository(TipoPrecio).create({ descripcion: 'NORMAL', activo: true } as any),
  );
  const familia = await dataSource.getRepository(Familia).save(
    dataSource.getRepository(Familia).create({ nombre: 'HAMBURGUESAS', activo: true } as any),
  );
  const subfamilia = await dataSource.getRepository(Subfamilia).save(
    dataSource.getRepository(Subfamilia).create({ nombre: 'CLASICAS', activo: true, familia } as any),
  );
  const producto = await dataSource.getRepository(Producto).save(
    dataSource.getRepository(Producto).create({
      nombre: 'HAMBURGUESA COMPLETA', tipo: 'RETAIL', activo: true, esVendible: true,
      disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia,
    } as any),
  );
  const presentacion = await dataSource.getRepository(Presentacion).save(
    dataSource.getRepository(Presentacion).create({ nombre: 'UNIDAD', cantidad: 1, principal: true, producto } as any),
  );
  await dataSource.getRepository(PrecioVenta).save(
    dataSource.getRepository(PrecioVenta).create({
      valor: 25000, principal: true, activo: true, moneda, tipoPrecio, presentacion,
    } as any),
  );
  // Producto NO disponible online (no debe aparecer en el menú)
  const prodOff = await dataSource.getRepository(Producto).save(
    dataSource.getRepository(Producto).create({
      nombre: 'PRODUCTO OCULTO', tipo: 'RETAIL', activo: true, esVendible: true,
      disponibleOnline: false, pausadoOnline: false, iva: 10, subfamilia,
    } as any),
  );
  const presOff = await dataSource.getRepository(Presentacion).save(
    dataSource.getRepository(Presentacion).create({ nombre: 'UNIDAD', cantidad: 1, principal: true, producto: prodOff } as any),
  );
  await dataSource.getRepository(PrecioVenta).save(
    dataSource.getRepository(PrecioVenta).create({ valor: 9999, principal: true, activo: true, moneda, tipoPrecio, presentacion: presOff } as any),
  );

  const zona = await dataSource.getRepository(ZonaDelivery).save(
    dataSource.getRepository(ZonaDelivery).create({ nombre: 'CENTRO', tarifa: 15000, montoMinimo: 50000, activa: true } as any),
  );

  // Admin con permiso VENTAS_PDV (para la bandeja admin)
  const admin = await dataSource.getRepository(Usuario).save(
    dataSource.getRepository(Usuario).create({ nickname: 'admin', password: await hashPassword('admin'), activo: true } as any),
  );
  const perm = await dataSource.getRepository(Permission).save(
    dataSource.getRepository(Permission).create({ codigo: 'VENTAS_PDV', descripcion: 'PdV', activo: true } as any),
  );
  const role = await dataSource.getRepository(Role).save(
    dataSource.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any),
  );
  await dataSource.getRepository(RolePermission).save(
    dataSource.getRepository(RolePermission).create({ role, permission: perm } as any),
  );
  await dataSource.getRepository(UsuarioRole).save(
    dataSource.getRepository(UsuarioRole).create({ usuario: admin, role } as any),
  );

  return { admin, producto, presentacion, zona };
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pedidos-online.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const dataSource = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  console.log('[e2e] Migraciones OK.');

  const seeded = await seed(dataSource);
  console.log('[e2e] Seed OK.');

  // getCurrentUser para handlers admin
  let currentUser: any = seeded.admin;
  const getCurrentUser = () => currentUser;
  registerPedidosOnlineHandlers(dataSource, getCurrentUser);
  registerPedidosOnlineAuthHandlers(dataSource, getCurrentUser);
  registerPedidosOnlinePedidosHandlers(dataSource, getCurrentUser);
  registerPedidosOnlineAdminHandlers(dataSource, getCurrentUser);

  const fastify = Fastify({ logger: false });
  await fastify.register(cors, { origin: true });
  await fastify.register(rateLimit, { max: 10000, timeWindow: '1 minute' });
  await registerAuthPlugin(fastify);
  registerPublicRoutes(fastify);
  await fastify.listen({ port: PORT, host: '127.0.0.1' });

  // Captura del OTP dev-log
  let otpCapturado: string | null = null;
  const origLog = console.log;
  console.log = (...args: any[]) => {
    const line = args.join(' ');
    const m = /Código para \d+: (\d{6})/.exec(line);
    if (m) otpCapturado = m[1];
    origLog(...args);
  };

  console.log('\n[e2e] === FLUJO PÚBLICO ===');

  // 1. Menú
  const menu = await pub('menu.get');
  const nombres = (menu.result?.productos || []).map((p: any) => p.nombre);
  ok(menu.status === 200 && menu.result?.total === 1, 'menu.get devuelve 1 producto disponible online', menu.result?.total);
  ok(nombres.includes('HAMBURGUESA COMPLETA'), 'menu incluye el producto online');
  ok(!nombres.includes('PRODUCTO OCULTO'), 'menu NO incluye el producto no-online');
  ok(menu.result?.productos?.[0]?.presentaciones?.[0]?.precio === 25000, 'precio publicado correcto', menu.result?.productos?.[0]?.presentaciones?.[0]?.precio);

  // 2. OTP request
  const tel = '0981123456';
  const otpReq = await pub('auth.otp.request', [tel]);
  ok(otpReq.result?.success === true, 'auth.otp.request success');
  ok(otpReq.result?.provider === 'dev-log', 'OTP en modo dev-log (sin credenciales)');
  ok(!!otpCapturado, 'código OTP capturado del log', otpCapturado);

  // 3. OTP verify
  const otpVer = await pub('auth.otp.verify', [tel, otpCapturado]);
  ok(otpVer.result?.success === true && !!otpVer.result?.accessToken, 'auth.otp.verify emite accessToken');
  const token = otpVer.result?.accessToken;

  // 3b. verify con código incorrecto
  const otpBad = await pub('auth.otp.verify', [tel, '000000']);
  ok(otpBad.result?.success === false, 'OTP incorrecto/usado es rechazado');

  // 4. me
  const me = await pub('auth.me', [], token);
  ok(me.result?.success === true && me.result?.cuenta?.telefono === '0981123456', 'auth.me devuelve la cuenta');

  // 5. pedido.crear sin token → rechazado
  const sinAuth = await pub('pedido.crear', [{ tipoPedido: 'PICKUP', items: [] }]);
  ok(sinAuth.status === 401, 'pedido.crear sin token → 401');

  // 6. pedido.crear PICKUP
  const pickup = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 2 }],
    metodoPago: 'EFECTIVO',
  }], token);
  ok(pickup.result?.success === true, 'pedido.crear PICKUP success', pickup.result);
  ok(pickup.result?.total === 50000, 'total PICKUP = 2×25000', pickup.result?.total);
  ok(pickup.result?.costoEnvio === 0, 'PICKUP sin costo de envío');
  const numeroPedido = pickup.result?.numero;

  // 7. DELIVERY bajo mínimo
  const delivBajo = await pub('pedido.crear', [{
    tipoPedido: 'DELIVERY', zonaDeliveryId: seeded.zona.id, direccionEntrega: 'Calle 1',
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }],
  }], token);
  ok(delivBajo.result?.error === 'monto_minimo_no_alcanzado', 'DELIVERY bajo mínimo → error', delivBajo.result?.error);

  // 8. DELIVERY válido (3×25000=75000 ≥ 50000) + envío 15000
  const deliv = await pub('pedido.crear', [{
    tipoPedido: 'DELIVERY', zonaDeliveryId: seeded.zona.id, direccionEntrega: 'Calle 1',
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 3 }],
  }], token);
  ok(deliv.result?.success === true, 'DELIVERY válido success', deliv.result);
  ok(deliv.result?.costoEnvio === 15000, 'costo de envío aplicado');
  ok(deliv.result?.total === 90000, 'total DELIVERY = 75000 + 15000', deliv.result?.total);

  // 9. mis pedidos
  const mis = await pub('pedido.mis', [], token);
  ok(mis.result?.success === true && mis.result?.pedidos?.length === 2, 'pedido.mis devuelve 2 pedidos', mis.result?.pedidos?.length);

  console.log('\n[e2e] === BANDEJA ADMIN ===');
  // 10. listar (invocación directa del handler admin, getCurrentUser = admin con permiso)
  const lista: any = await invokeHandlerWithContext('get-pedidos-online-admin', undefined, { estado: 'RECIBIDO' });
  ok(Array.isArray(lista) && lista.length === 2, 'admin ve 2 pedidos RECIBIDO', lista?.length);

  const primero: any = lista[0];
  // 11. aceptar
  const acep = await invokeHandlerWithContext('aceptar-pedido-online', undefined, primero.id);
  ok(acep?.success === true && acep?.pedido?.estado === 'ACEPTADO', 'aceptar → ACEPTADO');

  // 12. transición inválida (ACEPTADO → LISTO no permitido directo)
  const trInv = await invokeHandlerWithContext('avanzar-estado-pedido-online', undefined, primero.id, 'LISTO');
  ok(trInv?.success === false && trInv?.error === 'transicion_invalida', 'transición inválida rechazada');

  // 13. avanzar correcto: ACEPTADO → EN_PREPARACION → LISTO
  const prep = await invokeHandlerWithContext('avanzar-estado-pedido-online', undefined, primero.id, 'EN_PREPARACION');
  ok(prep?.success === true, 'ACEPTADO → EN_PREPARACION');
  const listo = await invokeHandlerWithContext('avanzar-estado-pedido-online', undefined, primero.id, 'LISTO');
  ok(listo?.success === true && listo?.pedido?.fechaListo, 'EN_PREPARACION → LISTO (con fechaListo)');

  // 14. rechazar el segundo
  const segundo: any = lista[1];
  const rech = await invokeHandlerWithContext('rechazar-pedido-online', undefined, segundo.id, 'sin stock');
  ok(rech?.success === true && rech?.pedido?.estado === 'RECHAZADO', 'rechazar → RECHAZADO');

  // 15. pendientes
  const pend = await invokeHandlerWithContext('contar-pedidos-online-pendientes', undefined);
  ok(pend?.pendientes === 0, 'contar pendientes = 0 (ya no hay RECIBIDO)', pend?.pendientes);

  console.log = origLog;
  await fastify.close();
  await dataSource.destroy();

  console.log(`\n[e2e] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[e2e] FATAL:', e); process.exit(1); });
