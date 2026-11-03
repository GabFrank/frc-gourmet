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
import { registerPedidosOnlineConfigHandlers } from '../electron/handlers/pedidos-online-config.handler';

const PORT = 7099;
const BASE = `http://localhost:${PORT}`;

// --- mini framework de asserts ---
let dsM5: DataSource | null = null;
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

  // Producto ELABORADO_SIN_VARIACION (precio via receta) + 1 adicional
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const { Adicional } = require('../src/app/database/entities/productos/adicional.entity');
  const { RecetaAdicionalVinculacion } = require('../src/app/database/entities/productos/receta-adicional-vinculacion.entity');
  const receta = await dataSource.getRepository(Receta).save(
    dataSource.getRepository(Receta).create({ nombre: 'RECETA LOMITO', activo: true } as any),
  );
  const elaborado = await dataSource.getRepository(Producto).save(
    dataSource.getRepository(Producto).create({
      nombre: 'LOMITO ARABE', tipo: 'ELABORADO_SIN_VARIACION', activo: true, esVendible: true,
      disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia, receta,
    } as any),
  );
  await dataSource.getRepository(PrecioVenta).save(
    dataSource.getRepository(PrecioVenta).create({ valor: 40000, principal: true, activo: true, moneda, tipoPrecio, receta } as any),
  );
  const adicional = await dataSource.getRepository(Adicional).save(
    dataSource.getRepository(Adicional).create({ nombre: 'EXTRA QUESO', precio: 5000, activo: true } as any),
  );
  await dataSource.getRepository(RecetaAdicionalVinculacion).save(
    dataSource.getRepository(RecetaAdicionalVinculacion).create({ receta, adicional, precioAdicional: 7000, activo: true } as any),
  );

  // Producto ELABORADO_CON_VARIACION (PIZZA): 2 tamaños × 2 sabores.
  const { Sabor } = require('../src/app/database/entities/productos/sabor.entity');
  const { RecetaPresentacion } = require('../src/app/database/entities/productos/receta-presentacion.entity');
  const { PdvConfig } = require('../src/app/database/entities/ventas/pdv-config.entity');
  const pizza = await dataSource.getRepository(Producto).save(
    dataSource.getRepository(Producto).create({
      nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true,
      disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia,
    } as any),
  );
  const presGrande = await dataSource.getRepository(Presentacion).save(
    dataSource.getRepository(Presentacion).create({ nombre: 'GRANDE', cantidad: 3, principal: true, producto: pizza } as any),
  );
  const presMediana = await dataSource.getRepository(Presentacion).save(
    dataSource.getRepository(Presentacion).create({ nombre: 'MEDIANA', cantidad: 2, principal: false, producto: pizza } as any),
  );
  const saborCalabresa = await dataSource.getRepository(Sabor).save(
    dataSource.getRepository(Sabor).create({ nombre: 'CALABRESA', categoria: 'PIZZA', activo: true, producto: pizza } as any),
  );
  const saborBacon = await dataSource.getRepository(Sabor).save(
    dataSource.getRepository(Sabor).create({ nombre: 'BACON', categoria: 'PIZZA', activo: true, producto: pizza } as any),
  );
  const saborMussarela = await dataSource.getRepository(Sabor).save(
    dataSource.getRepository(Sabor).create({ nombre: 'MUSSARELA', categoria: 'PIZZA', activo: true, producto: pizza } as any),
  );
  // Una receta base por sabor (productoVariacion = la pizza).
  const recCalabresa = await dataSource.getRepository(Receta).save(
    dataSource.getRepository(Receta).create({ nombre: 'RECETA CALABRESA', activo: true, productoVariacion: pizza } as any),
  );
  const recBacon = await dataSource.getRepository(Receta).save(
    dataSource.getRepository(Receta).create({ nombre: 'RECETA BACON', activo: true, productoVariacion: pizza } as any),
  );
  const recMussarela = await dataSource.getRepository(Receta).save(
    dataSource.getRepository(Receta).create({ nombre: 'RECETA MUSSARELA', activo: true, productoVariacion: pizza } as any),
  );
  // Matriz (sabor × tamaño) → RecetaPresentacion + PrecioVenta.
  //   CALABRESA: GRANDE 60000 / MEDIANA 45000
  //   BACON:     GRANDE 70000 / MEDIANA 50000
  //   MUSSARELA: GRANDE 65000 / MEDIANA 48000
  const matriz: any[] = [
    { receta: recCalabresa, sabor: saborCalabresa, presentacion: presGrande, precio: 60000 },
    { receta: recCalabresa, sabor: saborCalabresa, presentacion: presMediana, precio: 45000 },
    { receta: recBacon, sabor: saborBacon, presentacion: presGrande, precio: 70000 },
    { receta: recBacon, sabor: saborBacon, presentacion: presMediana, precio: 50000 },
    { receta: recMussarela, sabor: saborMussarela, presentacion: presGrande, precio: 65000 },
    { receta: recMussarela, sabor: saborMussarela, presentacion: presMediana, precio: 48000 },
  ];
  for (const m of matriz) {
    const rp = await dataSource.getRepository(RecetaPresentacion).save(
      dataSource.getRepository(RecetaPresentacion).create({
        nombre_generado: `PIZZA ${m.presentacion.nombre} ${m.sabor.nombre}`,
        receta: m.receta, sabor: m.sabor, presentacion: m.presentacion, activo: true,
      } as any),
    );
    await dataSource.getRepository(PrecioVenta).save(
      dataSource.getRepository(PrecioVenta).create({ valor: m.precio, principal: true, activo: true, moneda, tipoPrecio, recetaPresentacion: rp } as any),
    );
  }
  // Config de pizza del PdV: hasta 2 sabores, estrategia MAYOR_PRECIO.
  await dataSource.getRepository(PdvConfig).save(
    dataSource.getRepository(PdvConfig).create({ cantidad_mesas: 0, pizzaMaxSabores: 2, pizzaEstrategiaPrecio: 'MAYOR_PRECIO' } as any),
  );

  const zona = await dataSource.getRepository(ZonaDelivery).save(
    dataSource.getRepository(ZonaDelivery).create({ nombre: 'CENTRO', tarifa: 15000, montoMinimo: 50000, activa: true } as any),
  );

  // Admin con permiso VENTAS_PDV (para la bandeja admin)
  const admin = await dataSource.getRepository(Usuario).save(
    dataSource.getRepository(Usuario).create({ nickname: 'admin', password: await hashPassword('admin'), activo: true } as any),
  );
  const role = await dataSource.getRepository(Role).save(
    dataSource.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any),
  );
  // El módulo dejó de usar `VENTAS_PDV` para todo: la gestión y la configuración
  // de la tienda tienen permisos propios.
  for (const codigo of ['VENTAS_PDV', 'PEDIDOS_ONLINE_VER', 'PEDIDOS_ONLINE_GESTIONAR', 'PEDIDOS_ONLINE_CONFIGURAR']) {
    const permiso = await dataSource.getRepository(Permission).save(
      dataSource.getRepository(Permission).create({ codigo, descripcion: codigo, activo: true } as any),
    );
    await dataSource.getRepository(RolePermission).save(
      dataSource.getRepository(RolePermission).create({ role, permission: permiso } as any),
    );
  }
  await dataSource.getRepository(UsuarioRole).save(
    dataSource.getRepository(UsuarioRole).create({ usuario: admin, role } as any),
  );

  return {
    admin, producto, presentacion, zona, elaborado, receta, adicional,
    pizza, presGrande, presMediana, saborCalabresa, saborBacon, saborMussarela,
  };
}

async function main() {
  const cuentasRepoM5 = () => dsM5!.getRepository('CuentaCliente');
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pedidos-online.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const dataSource = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await dataSource.initialize();
  dsM5 = dataSource;
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
  registerPedidosOnlineConfigHandlers(dataSource, getCurrentUser);

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
  ok(menu.status === 200 && menu.result?.total === 3, 'menu.get devuelve 3 productos online (RETAIL + elaborado + pizza)', menu.result?.total);
  ok(nombres.includes('HAMBURGUESA COMPLETA'), 'menu incluye el producto RETAIL online');
  ok(nombres.includes('LOMITO ARABE'), 'menu incluye el ELABORADO_SIN_VARIACION (precio via receta)');
  ok(!nombres.includes('PRODUCTO OCULTO'), 'menu NO incluye el producto no-online');
  const pRetail = (menu.result?.productos || []).find((x: any) => x.nombre === 'HAMBURGUESA COMPLETA');
  const pElab = (menu.result?.productos || []).find((x: any) => x.nombre === 'LOMITO ARABE');
  ok(pRetail?.opciones?.[0]?.precio === 25000, 'RETAIL: precio de opción correcto', pRetail?.opciones?.[0]?.precio);
  ok(pElab?.opciones?.[0]?.precio === 40000, 'ELABORADO: precio de opción (receta) correcto', pElab?.opciones?.[0]?.precio);
  ok(pElab?.adicionales?.[0]?.precio === 7000, 'ELABORADO: adicional con precio de vinculación', pElab?.adicionales?.[0]?.precio);

  // PIZZA (ELABORADO_CON_VARIACION): estructura sabor × tamaño.
  const pPizza = (menu.result?.productos || []).find((x: any) => x.nombre === 'PIZZA');
  ok(pPizza?.esPizza === true, 'PIZZA: marcada esPizza');
  ok(Array.isArray(pPizza?.tamanos) && pPizza.tamanos.length === 2, 'PIZZA: 2 tamaños', pPizza?.tamanos?.length);
  ok(pPizza?.tamanos?.[0]?.nombre === 'MEDIANA', 'PIZZA: tamaños ordenados chico→grande (MEDIANA primero)', pPizza?.tamanos?.[0]?.nombre);
  ok(Array.isArray(pPizza?.sabores) && pPizza.sabores.length === 3, 'PIZZA: 3 sabores', pPizza?.sabores?.length);
  const sCal = (pPizza?.sabores || []).find((s: any) => s.nombre === 'CALABRESA');
  ok(sCal?.precios?.length === 2, 'PIZZA: sabor CALABRESA con 2 precios (por tamaño)', sCal?.precios?.length);
  ok(sCal?.precioDesde === 45000, 'PIZZA: precioDesde de CALABRESA = 45000 (mediana)', sCal?.precioDesde);
  ok(pPizza?.precioDesde === 45000, 'PIZZA: precioDesde global = 45000', pPizza?.precioDesde);
  ok(pPizza?.pizzaConfig?.maxSabores === 2 && pPizza?.pizzaConfig?.estrategia === 'MAYOR_PRECIO', 'PIZZA: pizzaConfig (max 2, MAYOR_PRECIO)', pPizza?.pizzaConfig);

  // A3: sin zonas dibujadas no hay delivery (antes salía con envío gratis).
  const cfgZonas = await pub('tienda.config', []);
  ok(cfgZonas.result?.permiteDelivery === false, 'A3: sin zonas con polígono tienda.config.permiteDelivery=false', cfgZonas.result?.permiteDelivery);
  const cotSin = await pub('envio.cotizar', [-25.3, -57.6]);
  ok(cotSin.result?.cubierto === false && cotSin.result?.sinZonasDefinidas === true, 'A3: envio.cotizar sin zonas → no cubierto', cotSin.result);

  // 2a. Sin WhatsApp configurado y sin FRC_OTP_DEV: no hay login por código ni fuga del código
  //     (PLAN-tienda-online C1: antes devolvía devCodigo a cualquiera).
  const tel = '0981123456';
  delete process.env['FRC_OTP_DEV'];
  const cfgSinOtp = await pub('tienda.config', []);
  ok(cfgSinOtp.result?.otpWhatsappDisponible === false, 'C1: tienda.config otpWhatsappDisponible=false sin canal', cfgSinOtp.result?.otpWhatsappDisponible);
  const otpSin = await pub('auth.otp.request', [tel]);
  ok(otpSin.result?.success === false && otpSin.result?.error === 'otp_no_disponible', 'C1: otp.request sin canal → otp_no_disponible', otpSin.result);
  ok(!JSON.stringify(otpSin).includes('devCodigo') && !otpCapturado, 'C1: no devuelve ni loguea código sin canal');

  // 2. OTP request (fallback de desarrollo explícito)
  process.env['FRC_OTP_DEV'] = '1';
  const cfgDev = await pub('tienda.config', []);
  ok(cfgDev.result?.otpWhatsappDisponible === true, 'tienda.config otpWhatsappDisponible=true con FRC_OTP_DEV=1');
  const otpReq = await pub('auth.otp.request', [tel]);
  ok(otpReq.result?.success === true, 'auth.otp.request success');
  ok(otpReq.result?.provider === 'dev-log', 'OTP en modo dev-log (sin credenciales)');
  ok(!!otpCapturado, 'código OTP capturado del log', otpCapturado);

  // Tope global diario de OTP (anti gasto en plantillas de WhatsApp).
  const notifMod = require('../electron/services/notificacion.service');
  const dispatchOrig = notifMod.dispatchEvento;
  const avisos: any[] = [];
  notifMod.dispatchEvento = async (codigo: string, payload: any) => { avisos.push({ codigo, ...payload }); return []; };
  process.env['FRC_OTP_MAX_GLOBAL_DIA'] = '1';
  const otpTope = await pub('auth.otp.request', ['0981999888']);
  ok(otpTope.result?.error === 'otp_no_disponible', 'tope global diario de OTP corta el envío', otpTope.result);
  ok(avisos.some((a) => a.codigo === 'TIENDA_OTP_TOPE' && /^tope-/.test(a.dedupeKey)), 'tope global: avisa al staff (TIENDA_OTP_TOPE)', avisos);
  // Tope 2 con 1 código ya pedido: el siguiente llega al 80 %. Se pide para el mismo
  // teléfono, así el código capturado sigue sirviendo para el verify de abajo.
  process.env['FRC_OTP_MAX_GLOBAL_DIA'] = '2';
  avisos.length = 0;
  await pub('auth.otp.request', [tel]);
  ok(avisos.some((a) => a.codigo === 'TIENDA_OTP_TOPE' && /^80-/.test(a.dedupeKey)), 'al pasar el 80 % del tope avisa una vez por día', avisos);
  notifMod.dispatchEvento = dispatchOrig;
  delete process.env['FRC_OTP_MAX_GLOBAL_DIA'];

  // 3. OTP verify
  const otpVer = await pub('auth.otp.verify', [tel, otpCapturado]);
  ok(otpVer.result?.success === true && !!otpVer.result?.accessToken, 'auth.otp.verify emite accessToken');
  ok(!!otpVer.result?.refreshToken, 'auth.otp.verify emite refreshToken');
  const token = otpVer.result?.accessToken;
  const refreshTok = otpVer.result?.refreshToken;

  // 3b. verify con código incorrecto
  const otpBad = await pub('auth.otp.verify', [tel, '000000']);
  ok(otpBad.result?.success === false, 'OTP incorrecto/usado es rechazado');

  // 4. me
  const me = await pub('auth.me', [], token);
  ok(me.result?.success === true && me.result?.cuenta?.telefono === '0981123456', 'auth.me devuelve la cuenta');

  // 4b. F2 (M5): cuenta sin nombre → el pedido exige nombre (antes quedaba sin nombre en la bandeja).
  const sinNombre = await pub('pedido.crear', [{ tipoPedido: 'PICKUP', items: [{ productoId: 1, cantidad: 1 }] }], token);
  ok(sinNombre.result?.error === 'falta_nombre', 'M5: cuenta sin nombre → falta_nombre', sinNombre.result);
  await pub('auth.perfil.update', [{ nombre: 'Cliente Otp' }], token);

  // 5. pedido.crear sin token → rechazado
  //
  // NO es un 401 de transporte, y esperarlo era el bug del test: `pedido.crear`
  // está registrado con `optionalAuth` a propósito, para que MESA_QR admita
  // invitados (el cliente sentado se identifica sólo con su nombre). La ruta
  // pública deja pasar la request sin token y es el handler el que decide según
  // el canal. Exigir un 401 acá sólo se podría cumplir rompiendo MESA_QR, que ya
  // está en producción. Lo que sí tiene que pasar es que PICKUP/DELIVERY sin
  // cuenta se rechacen con un error de negocio.
  const sinAuth = await pub('pedido.crear', [{ tipoPedido: 'PICKUP', items: [] }]);
  ok(sinAuth.status === 200, 'pedido.crear sin token no da 401 (optionalAuth por MESA_QR)', sinAuth.status);
  ok(sinAuth.result?.success === false, 'pero el pedido se rechaza', sinAuth.result);
  ok(sinAuth.result?.error === 'no_autenticado' || sinAuth.result?.error === 'pedido_sin_items',
     'con un error de negocio explícito', sinAuth.result?.error);

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
    latitud: -24.06, longitud: -54.31,
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }],
  }], token);
  ok(delivBajo.result?.error === 'monto_minimo_no_alcanzado', 'DELIVERY bajo mínimo → error', delivBajo.result?.error);

  // A3: DELIVERY sin zona dibujada ni zona elegida → rechazado (antes envío 0).
  const delivSinZona = await pub('pedido.crear', [{
    tipoPedido: 'DELIVERY', direccionEntrega: 'Calle 1', latitud: -24.06, longitud: -54.31,
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 3 }],
  }], token);
  ok(delivSinZona.result?.error === 'delivery_no_disponible', 'A3: DELIVERY sin zonas → delivery_no_disponible', delivSinZona.result);

  // A2: validaciones de entrada.
  const base = { tipoPedido: 'PICKUP', items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }] };
  const upay = await pub('pedido.crear', [{ ...base, metodoPago: 'UPAY' }], token);
  ok(upay.result?.error === 'metodo_pago_no_disponible', 'A2: metodoPago UPAY sin cobro online → rechazado', upay.result);
  const tipoMal = await pub('pedido.crear', [{ ...base, tipoPedido: 'XX' }], token);
  ok(tipoMal.result?.error === 'tipo_pedido_invalido', 'A2: tipoPedido inválido → rechazado', tipoMal.result);
  const cantMal = await pub('pedido.crear', [{ ...base, items: [{ ...base.items[0], cantidad: 51 }] }], token);
  ok(cantMal.result?.error === 'cantidad_excedida', 'A2: cantidad > 50 → rechazado', cantMal.result);
  const muchos = await pub('pedido.crear', [{ ...base, items: Array.from({ length: 41 }, () => base.items[0]) }], token);
  ok(muchos.result?.error === 'demasiados_items', 'A2: más de 40 ítems → rechazado', muchos.result);

  // 8. DELIVERY válido (3×25000=75000 ≥ 50000) + envío 15000
  const deliv = await pub('pedido.crear', [{
    tipoPedido: 'DELIVERY', zonaDeliveryId: seeded.zona.id, direccionEntrega: 'Calle 1',
    latitud: -24.06, longitud: -54.31,
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 3 }],
  }], token);
  ok(deliv.result?.success === true, 'DELIVERY válido success', deliv.result);
  ok(deliv.result?.costoEnvio === 15000, 'costo de envío aplicado');
  ok(deliv.result?.total === 90000, 'total DELIVERY = 75000 + 15000', deliv.result?.total);

  // 8b. ELABORADO con adicional: precio del adicional lo pone el SERVER (7000),
  // aunque el cliente solo manda el id → total = 40000 + 7000 = 47000.
  const pedElab = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.elaborado.id, opcion: { tipo: 'RECETA' }, cantidad: 1, adicionalIds: [seeded.adicional.id] }],
  }], token);
  ok(pedElab.result?.success === true && pedElab.result?.total === 47000, 'ELABORADO + adicional: total server-side = 47000', pedElab.result?.total);

  // 9. mis pedidos
  const mis = await pub('pedido.mis', [], token);
  ok(mis.result?.success === true && mis.result?.pedidos?.length === 3, 'pedido.mis devuelve 3 pedidos', mis.result?.pedidos?.length);

  console.log('\n[e2e] === BANDEJA ADMIN ===');
  // 10. listar (invocación directa del handler admin, getCurrentUser = admin con permiso)
  const lista: any = await invokeHandlerWithContext('get-pedidos-online-admin', undefined, { estado: 'RECIBIDO' });
  ok(Array.isArray(lista) && lista.length === 3, 'admin ve 3 pedidos RECIBIDO', lista?.length);

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

  // 14. rechazar el segundo y el tercero
  const segundo: any = lista[1];
  const rech = await invokeHandlerWithContext('rechazar-pedido-online', undefined, segundo.id, 'sin stock');
  ok(rech?.success === true && rech?.pedido?.estado === 'RECHAZADO', 'rechazar → RECHAZADO');
  await invokeHandlerWithContext('rechazar-pedido-online', undefined, lista[2].id, 'sin stock');

  // 14b. F2 (M7): sin caja abierta el aceptar NO crea venta y devuelve el motivo para el operador.
  ok(!acep?.ventaId && /no_hay_caja_abierta|caja/.test(String(acep?.errorMaterializacion || '')),
    'aceptar sin caja abierta: no crea venta y devuelve errorMaterializacion', { ventaId: acep?.ventaId, err: acep?.errorMaterializacion });
  // 14c. F2 (M6): el cliente ve el motivo del rechazo y la personalización en «Mis pedidos».
  const misRech = await pub('pedido.mis', [], token);
  const pRech = (misRech.result?.pedidos || []).find((p: any) => p.numero === segundo.numero);
  ok(pRech?.estado === 'RECHAZADO' && !!pRech?.motivoRechazo, 'mis pedidos: el rechazado trae motivoRechazo', pRech?.motivoRechazo);
  ok((misRech.result?.pedidos || []).every((p: any) => (p.items || []).every((it: any) => 'personalizacion' in it)),
    'mis pedidos: cada línea trae su personalización', null);
  ok((misRech.result?.pedidos || []).every((p: any) => p.seguimientoTokenHash === undefined),
    'mis pedidos: nunca expone el hash de seguimiento', null);
  // 14d. F2: el server ignora el precio que manda el cliente y cobra el de la carta.
  const falso = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP', idempotencyKey: 'f2-precio-falso-0001',
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1, precioUnitario: 1, precio: 1, subtotal: 1 }],
    subtotal: 1, total: 1,
  }], token);
  ok(falso.result?.success === true && Number(falso.result?.total) > 1, 'precio falso del cliente se ignora: total = precio de la carta', falso.result);
  await invokeHandlerWithContext('rechazar-pedido-online', undefined, falso.result?.pedidoId, 'prueba');
  // 14e. F2 (M5): el nombre que manda el checkout queda en la cuenta y en el pedido.
  const sinNom: any = await cuentasRepoM5().save(cuentasRepoM5().create({ telefono: '0981777666', telefonoVerificado: true, activo: true }));
  const conNom: any = await invokeHandlerWithContext('crear-pedido-online', { customerId: sinNom.id }, {
    tipoPedido: 'PICKUP', nombreCliente: 'Rosa Paz', items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }],
  });
  const cuentaM5: any = await cuentasRepoM5().findOne({ where: { id: sinNom.id } });
  const pedM5: any = await dataSource.getRepository('PedidoOnline').findOne({ where: { numero: conNom?.numero } });
  ok(conNom?.success === true && cuentaM5?.nombre === 'ROSA PAZ' && pedM5?.nombreCliente === 'ROSA PAZ',
    'M5: el nombre del checkout queda en la cuenta y en el pedido', [conNom, cuentaM5?.nombre, pedM5?.nombreCliente]);
  await invokeHandlerWithContext('rechazar-pedido-online', undefined, conNom?.pedidoId, 'prueba');

  // 15. pendientes (primero=LISTO ya no cuenta, segundo/tercero rechazados) = 0
  const pend = await invokeHandlerWithContext('contar-pedidos-online-pendientes', undefined);
  ok(pend?.pendientes === 0, 'contar pendientes = 0 (ya no hay RECIBIDO/ACEPTADO)', pend?.pendientes);

  console.log('\n[e2e] === CONFIG DE TIENDA + REFRESH TOKEN ===');
  // 16. config pública (default: abierta, ambos tipos)
  const cfgPub = await pub('tienda.config');
  ok(cfgPub.result?.abiertaAhora === true, 'tienda.config: abierta por default');
  ok(cfgPub.result?.permitePickup === true && cfgPub.result?.permiteDelivery === false, 'pickup por default; delivery apagado mientras no haya zona dibujada (A3)', cfgPub.result);

  // 17. refresh token: rota y emite nuevo access
  const ref1 = await pub('auth.refresh', [refreshTok]);
  ok(ref1.result?.success === true && !!ref1.result?.accessToken && !!ref1.result?.refreshToken, 'auth.refresh emite nuevo access+refresh');
  // el refresh viejo ya no sirve (rotación)
  const refOld = await pub('auth.refresh', [refreshTok]);
  ok(refOld.result?.success === false, 'refresh viejo invalidado tras rotar');
  const token2 = ref1.result?.accessToken;
  const me2 = await pub('auth.me', [], token2);
  ok(me2.result?.success === true, 'access token nuevo funciona en auth.me');

  // 18. aceptación automática: el pedido entra ACEPTADO
  await invokeHandlerWithContext('update-tienda-online-config', undefined, { aceptacionAutomatica: true });
  const pedAuto = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }],
  }], token2);
  ok(pedAuto.result?.success === true && pedAuto.result?.estado === 'ACEPTADO', 'aceptación automática → pedido ACEPTADO', pedAuto.result?.estado);
  await invokeHandlerWithContext('update-tienda-online-config', undefined, { aceptacionAutomatica: false });

  // 19. pickup deshabilitado → rechazo
  await invokeHandlerWithContext('update-tienda-online-config', undefined, { permitePickup: false });
  const pedNoPickup = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }],
  }], token2);
  ok(pedNoPickup.result?.error === 'pickup_no_disponible', 'pickup deshabilitado → error', pedNoPickup.result?.error);
  await invokeHandlerWithContext('update-tienda-online-config', undefined, { permitePickup: true });

  // 20. tienda inactiva → cerrada
  await invokeHandlerWithContext('update-tienda-online-config', undefined, { activa: false });
  const pedCerrada = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }],
  }], token2);
  ok(pedCerrada.result?.error === 'tienda_cerrada', 'tienda inactiva → tienda_cerrada', pedCerrada.result?.error);
  await invokeHandlerWithContext('update-tienda-online-config', undefined, { activa: true });

  console.log('\n[e2e] === AUTH: REGISTRO EMAIL + GOOGLE ===');
  // 21. registro por email+password (cuenta sin teléfono → migración nullable OK)
  const reg = await pub('auth.registrar', [{ email: 'Cliente@Mail.com', password: 'secreto123', nombre: 'juan' }]);
  ok(reg.result?.success === true && !!reg.result?.accessToken, 'auth.registrar crea cuenta por email + token');
  ok(reg.result?.cuenta?.email === 'cliente@mail.com', 'email normalizado a minúsculas', reg.result?.cuenta?.email);
  ok(reg.result?.cuenta?.nombre === 'JUAN', 'nombre en UPPERCASE', reg.result?.cuenta?.nombre);
  // 22. email duplicado
  const regDup = await pub('auth.registrar', [{ email: 'cliente@mail.com', password: 'otraclave1' }]);
  ok(regDup.result?.error === 'email_en_uso', 'registro con email duplicado → email_en_uso');
  // 23. password corto
  const regShort = await pub('auth.registrar', [{ email: 'otro@mail.com', password: '123' }]);
  ok(regShort.result?.error === 'password_corto', 'password corto rechazado');
  // 24. login con el email registrado
  const logEmail = await pub('auth.login', ['cliente@mail.com', 'secreto123']);
  ok(logEmail.result?.success === true && !!logEmail.result?.accessToken, 'login por email + password funciona');
  // 25. Google sin credenciales
  const g = await pub('auth.google', ['fake-token']);
  ok(g.result?.error === 'google_no_configurado', 'auth.google sin GOOGLE_CLIENT_ID → no_configurado');

  console.log('\n[e2e] === F3: CREDENCIALES DE INGRESO DESDE LA APP ===');
  // Validaciones: no se guardan valores con formato inválido.
  const vPhone: any = await invokeHandlerWithContext('update-tienda-online-config', undefined, { whatsappPhoneNumberId: '12ab' });
  ok(vPhone?.error === 'whatsapp_phone_id_invalido', 'F3: Phone Number ID con letras → rechazado', vPhone);
  const vGoogle: any = await invokeHandlerWithContext('update-tienda-online-config', undefined, { googleClientId: 'cualquier-cosa' });
  ok(vGoogle?.error === 'google_client_id_invalido', 'F3: Client ID de Google inválido → rechazado', vGoogle);
  const vPlant: any = await invokeHandlerWithContext('update-tienda-online-config', undefined, { whatsappPlantilla: 'Código Ingreso' });
  ok(vPlant?.error === 'whatsapp_plantilla_invalida', 'F3: plantilla con espacios → rechazada', vPlant);

  // Google desde la pantalla: tienda.config lo publica y auth.google deja de dar no_configurado.
  const GID = '1234-abc.apps.googleusercontent.com';
  const gSave: any = await invokeHandlerWithContext('update-tienda-online-config', undefined, {
    googleClientId: GID, whatsappPhoneNumberId: '109876543210', whatsappPlantilla: 'codigo_ingreso', whatsappIdioma: 'es',
  });
  ok(gSave?.success === true && gSave?.config?.ingreso?.googleConfigurado === true, 'F3: Client ID de Google guardado', gSave?.config?.ingreso);
  const cfgG = await pub('tienda.config', []);
  ok(cfgG.result?.googleClientId === GID, 'F3: tienda.config publica el Client ID de la pantalla', cfgG.result?.googleClientId);
  const fetchOrig = (globalThis as any).fetch;
  const llamadas: Array<{ url: string; body: any }> = [];
  (globalThis as any).fetch = async (url: any, init?: any) => {
    // Solo se simulan Google y Meta; el RPC local de la tienda pasa al fetch real.
    if (!/googleapis\.com|graph\.facebook\.com/.test(String(url))) return fetchOrig(url, init);
    llamadas.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('graph.facebook.com')) return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
    return { ok: false, status: 400, text: async () => '{}', json: async () => ({}) };
  };
  try {
    const g2 = await pub('auth.google', ['fake-token']);
    ok(g2.result?.error === 'google_token_invalido', 'F3: auth.google usa el Client ID de la pantalla (ya no no_configurado)', g2.result);

    // WhatsApp: Phone Number ID cargado pero sin token → sin configurar, y la prueba no manda nada.
    const tokenEnv = process.env['WHATSAPP_CLOUD_TOKEN'];
    delete process.env['WHATSAPP_CLOUD_TOKEN'];
    const est: any = await invokeHandlerWithContext('get-tienda-online-config', undefined);
    const tieneTokenGuardado = !!est?.ingreso?.whatsappTokenGuardado;
    if (!tieneTokenGuardado) {
      ok(est?.ingreso?.whatsappConfigurado === false, 'F3: sin token, WhatsApp figura sin configurar', est?.ingreso);
      const pSin: any = await invokeHandlerWithContext('probar-tienda-whatsapp', undefined, { telefono: '595981123456' });
      ok(pSin?.error === 'whatsapp_no_configurado' && !llamadas.some((l) => l.url.includes('graph.facebook.com')), 'F3: probar envío sin token → no manda nada', pSin);
    }
    // Token por pantalla: nunca vuelve en la respuesta; sin almacén seguro se rechaza (no texto plano).
    const SECRETO = 'EAAG-token-secreto-de-prueba';
    const tSave: any = await invokeHandlerWithContext('update-tienda-online-config', undefined, { whatsappToken: SECRETO });
    ok(!JSON.stringify(tSave).includes(SECRETO), 'F3: el token no vuelve en la respuesta de guardar');
    ok(
      tSave?.success === true || tSave?.error === 'almacen_seguro_no_disponible' || tSave?.error === 'token_no_guardado',
      'F3: token guardado en almacén seguro o rechazado (nunca en la BD)', tSave?.error,
    );
    const filaCfg: any[] = await dataSource.query(`SELECT * FROM tienda_online_config`);
    ok(!JSON.stringify(filaCfg).includes(SECRETO), 'F3: el token no está en la tabla tienda_online_config');
    const estT: any = await invokeHandlerWithContext('get-tienda-online-config', undefined);
    ok(!JSON.stringify(estT).includes(SECRETO), 'F3: get-tienda-online-config no devuelve el token');

    // Con token (entorno) + datos de la pantalla: el envío usa el Phone Number ID y la plantilla cargados.
    process.env['WHATSAPP_CLOUD_TOKEN'] = 'token-entorno';
    await invokeHandlerWithContext('update-tienda-online-config', undefined, {});
    const pTelMal: any = await invokeHandlerWithContext('probar-tienda-whatsapp', undefined, { telefono: '12' });
    ok(pTelMal?.error === 'telefono_invalido', 'F3: probar envío con teléfono inválido → rechazado', pTelMal);
    llamadas.length = 0;
    const pOk: any = await invokeHandlerWithContext('probar-tienda-whatsapp', undefined, { telefono: '+595 981 123456' });
    const envio = llamadas.find((l) => l.url.includes('graph.facebook.com'));
    ok(pOk?.success === true, 'F3: probar envío con credenciales → ok', pOk);
    ok(!!envio && envio.url.includes('/109876543210/messages'), 'F3: el envío usa el Phone Number ID de la pantalla', envio?.url);
    ok(envio?.body?.template?.name === 'codigo_ingreso' && envio?.body?.to === '595981123456', 'F3: plantilla y teléfono normalizado', envio?.body?.template?.name);
    ok(envio?.body?.template?.components?.some((c: any) => c.type === 'button' && c.sub_type === 'url'), 'F3: lleva el botón «Copiar código» (plantilla de autenticación)');
    const pRep: any = await invokeHandlerWithContext('probar-tienda-whatsapp', undefined, { telefono: '595981123456' });
    ok(pRep?.error === 'demasiadas_pruebas', 'F3: segunda prueba al mismo teléfono en menos de 1 minuto → frenada', pRep);

    // Solo variables de entorno (sin plantilla en pantalla): el envío real no lleva el botón,
    // así las plantillas existentes sin botón siguen funcionando.
    await invokeHandlerWithContext('update-tienda-online-config', undefined, { whatsappPlantilla: '' });
    llamadas.length = 0;
    const pEnv: any = await invokeHandlerWithContext('probar-tienda-whatsapp', undefined, { telefono: '595982000111' });
    const envioEnv = llamadas.find((l) => l.url.includes('graph.facebook.com'));
    ok(pEnv?.success === true && !envioEnv?.body?.template?.components?.some((c: any) => c.type === 'button'), 'F3: sin plantilla en pantalla no se manda el botón', envioEnv?.body?.template);

    // Vaciar los campos vuelve a las variables de entorno.
    await invokeHandlerWithContext('update-tienda-online-config', undefined, {
      googleClientId: '', whatsappPhoneNumberId: '', whatsappPlantilla: '', whatsappIdioma: '', whatsappTokenBorrar: true,
    });
    const cfgVacio = await pub('tienda.config', []);
    ok(cfgVacio.result?.googleClientId === (process.env['GOOGLE_CLIENT_ID'] || null), 'F3: sin valores de pantalla rige el entorno', cfgVacio.result?.googleClientId);
    if (tokenEnv === undefined) delete process.env['WHATSAPP_CLOUD_TOKEN'];
    else process.env['WHATSAPP_CLOUD_TOKEN'] = tokenEnv;
    await invokeHandlerWithContext('update-tienda-online-config', undefined, {});
  } finally {
    (globalThis as any).fetch = fetchOrig;
  }

  console.log('\n[e2e] === ZONAS DELIVERY (ADMIN CRUD) + UBICACIÓN ===');
  // 26. listar zonas (ya hay 1 del seed)
  const zonasIni: any = await invokeHandlerWithContext('get-zonas-delivery-admin', undefined);
  ok(Array.isArray(zonasIni) && zonasIni.length === 1, 'admin ve 1 zona inicial', zonasIni?.length);

  // 27. crear una zona nueva
  const nuevaZona: any = await invokeHandlerWithContext('guardar-zona-delivery', undefined, {
    nombre: 'villa morra', tarifa: 20000, montoMinimo: 60000, activa: true, orden: 2,
  });
  ok(nuevaZona?.success === true && !!nuevaZona?.zona?.id, 'guardar-zona-delivery crea zona');
  ok(nuevaZona?.zona?.nombre === 'VILLA MORRA', 'nombre de zona en UPPERCASE', nuevaZona?.zona?.nombre);
  ok(nuevaZona?.zona?.tarifa === 20000, 'tarifa persistida', nuevaZona?.zona?.tarifa);

  // 28. editar la zona creada
  const editZona: any = await invokeHandlerWithContext('guardar-zona-delivery', undefined, {
    id: nuevaZona.zona.id, nombre: 'villa morra norte', tarifa: 22000, montoMinimo: 60000, activa: false, orden: 2,
  });
  ok(editZona?.success === true && editZona?.zona?.nombre === 'VILLA MORRA NORTE' && editZona?.zona?.activa === false,
    'guardar-zona-delivery edita zona existente');

  // 29. nombre requerido
  const zonaSinNombre: any = await invokeHandlerWithContext('guardar-zona-delivery', undefined, { nombre: '   ', tarifa: 1000 });
  ok(zonaSinNombre?.success === false && zonaSinNombre?.error === 'nombre_requerido', 'zona sin nombre → nombre_requerido');

  // 30. la zona pública (activa) NO incluye la inactiva
  const zonasPub = await pub('zonas.get');
  const zonasPubList = zonasPub.result || zonasPub;
  const nombresPub = (Array.isArray(zonasPubList) ? zonasPubList : []).map((z: any) => z.nombre);
  ok(nombresPub.includes('CENTRO') && !nombresPub.includes('VILLA MORRA NORTE'),
    'zonas.get público sólo devuelve zonas activas', nombresPub);

  // 31. eliminar la zona creada → vuelve a quedar 1
  const del: any = await invokeHandlerWithContext('eliminar-zona-delivery', undefined, nuevaZona.zona.id);
  ok(del?.success === true, 'eliminar-zona-delivery ok');
  const zonasFin: any = await invokeHandlerWithContext('get-zonas-delivery-admin', undefined);
  ok(Array.isArray(zonasFin) && zonasFin.length === 1, 'tras eliminar queda 1 zona', zonasFin?.length);

  // 32. pedido DELIVERY con ubicación (lat/lng) → persiste y la ve el admin
  const deliGeo = await pub('pedido.crear', [{
    tipoPedido: 'DELIVERY', zonaDeliveryId: seeded.zona.id, direccionEntrega: 'Av. España 123',
    latitud: -24.06, longitud: -54.31,
    latitud: -25.2891, longitud: -57.6109,
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 3 }],
  }], token2);
  ok(deliGeo.result?.success === true, 'pedido DELIVERY con ubicación creado', deliGeo.result?.error);
  const listaGeo: any = await invokeHandlerWithContext('get-pedidos-online-admin', undefined, {});
  const pedGeo: any = (listaGeo || []).find((p: any) => p.numero === deliGeo.result?.numero);
  ok(!!pedGeo && Math.abs((pedGeo.latitud ?? 0) - (-25.2891)) < 1e-4 && Math.abs((pedGeo.longitud ?? 0) - (-57.6109)) < 1e-4,
    'admin ve la ubicación (lat/lng) del pedido', { lat: pedGeo?.latitud, lng: pedGeo?.longitud });

  console.log('\n[e2e] === PIZZA: PEDIDO (tamaño + sabor + mitad y mitad) ===');
  // 33. pizza de 1 sabor: CALABRESA GRANDE → 60000
  const pzUno = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.pizza.id, opcion: { tipo: 'PIZZA', presentacionId: seeded.presGrande.id, saborIds: [seeded.saborCalabresa.id] }, cantidad: 1 }],
  }], token2);
  ok(pzUno.result?.success === true && pzUno.result?.total === 60000, 'PIZZA 1 sabor (CALABRESA GRANDE) = 60000', pzUno.result?.total ?? pzUno.result?.error);

  // 34. mitad y mitad: CALABRESA + BACON GRANDE → MAYOR_PRECIO = max(60000,70000) = 70000
  const pzMitad = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.pizza.id, opcion: { tipo: 'PIZZA', presentacionId: seeded.presGrande.id, saborIds: [seeded.saborCalabresa.id, seeded.saborBacon.id] }, cantidad: 1 }],
  }], token2);
  ok(pzMitad.result?.success === true && pzMitad.result?.total === 70000, 'PIZZA mitad CALABRESA+BACON GRANDE = 70000 (MAYOR_PRECIO)', pzMitad.result?.total ?? pzMitad.result?.error);

  // 35. tamaño MEDIANA de 1 sabor: BACON MEDIANA → 50000
  const pzMed = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.pizza.id, opcion: { tipo: 'PIZZA', presentacionId: seeded.presMediana.id, saborIds: [seeded.saborBacon.id] }, cantidad: 1 }],
  }], token2);
  ok(pzMed.result?.success === true && pzMed.result?.total === 50000, 'PIZZA BACON MEDIANA = 50000', pzMed.result?.total ?? pzMed.result?.error);

  // 36. exceder maxSabores (3 sabores con max 2) → error
  const pzMax = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.pizza.id, opcion: { tipo: 'PIZZA', presentacionId: seeded.presGrande.id, saborIds: [seeded.saborCalabresa.id, seeded.saborBacon.id, seeded.saborMussarela.id] }, cantidad: 1 }],
  }], token2);
  ok(String(pzMax.result?.error || '').startsWith('demasiados_sabores'), 'PIZZA con 3 sabores (>max) → demasiados_sabores', pzMax.result?.error);

  // 37. combinación inexistente (sabor válido, tamaño no cotizado) → error server-side.
  //     Usamos un presentacionId ajeno (el de la hamburguesa) que no pertenece a la pizza.
  const pzBad = await pub('pedido.crear', [{
    tipoPedido: 'PICKUP',
    items: [{ productoId: seeded.pizza.id, opcion: { tipo: 'PIZZA', presentacionId: seeded.presentacion.id, saborIds: [seeded.saborCalabresa.id] }, cantidad: 1 }],
  }], token2);
  ok(String(pzBad.result?.error || '').startsWith('sabor_o_tamano_invalido'), 'PIZZA con tamaño no cotizado → sabor_o_tamano_invalido', pzBad.result?.error);

  // 38. el desglose de sabores queda en el snapshot del item (para la bandeja).
  const misPz: any = await invokeHandlerWithContext('get-pedidos-online-admin', undefined, {});
  const pedMitad: any = (misPz || []).find((p: any) => p.numero === pzMitad.result?.numero);
  const itMitad = pedMitad?.items?.[0];
  ok(itMitad?.personalizacion?.sabores?.length === 2 && Math.abs(itMitad.personalizacion.sabores[0].proporcion - 0.5) < 1e-6,
    'PIZZA mitad: snapshot con 2 sabores y proporción 0.5', itMitad?.personalizacion?.sabores);

  // 39. idempotencia (PLAN-tienda-online A2.4): mismo uuid del mismo dueño → mismo pedido.
  const idemBody = (key: string) => [{
    tipoPedido: 'PICKUP', idempotencyKey: key,
    items: [{ productoId: seeded.producto.id, presentacionId: seeded.presentacion.id, cantidad: 1 }],
  }];
  const idemKey = 'a1b2c3d4-0000-4000-8000-00000000abcd';
  const idem1 = await pub('pedido.crear', idemBody(idemKey), token2);
  const idem2 = await pub('pedido.crear', idemBody(idemKey), token2);
  ok(idem1.result?.success === true && idem2.result?.numero === idem1.result?.numero && idem2.result?.repetido === true,
    'idempotencia: reintento con la misma clave devuelve el mismo pedido', [idem1.result?.numero, idem2.result]);
  const idem3 = await pub('pedido.crear', idemBody('a1b2c3d4-0000-4000-8000-00000000abce'), token2);
  ok(idem3.result?.success === true && idem3.result?.numero !== idem1.result?.numero, 'idempotencia: clave nueva crea otro pedido', idem3.result);
  const cuentasRepo = dataSource.getRepository('CuentaCliente');
  const otra: any = await cuentasRepo.save(cuentasRepo.create({ telefono: '0981999888', telefonoVerificado: true, nombre: 'OTRA CUENTA', activo: true }));
  const idemOtra: any = await invokeHandlerWithContext('crear-pedido-online', { customerId: otra.id }, idemBody(idemKey)[0]);
  ok(idemOtra?.success === true && idemOtra?.numero !== idem1.result?.numero && !idemOtra?.repetido,
    'idempotencia: la misma clave de otra cuenta no devuelve el pedido ajeno', idemOtra);
  const nIdem = await dataSource.getRepository('PedidoOnline').count({ where: { idempotencyKey: idemKey } });
  ok(nIdem === 2, 'idempotencia: un pedido por dueño con esa clave (2 dueños → 2)', nIdem);
  const idemBasura = await pub('pedido.crear', idemBody("x'; drop"), token2);
  ok(idemBasura.result?.success === true && !idemBasura.result?.repetido, 'idempotencia: clave inválida se ignora (pedido normal)', idemBasura.result);

  // 40. A1: fuerza bruta en login (5 fallos cuenta+IP → bloqueada aunque la clave sea buena).
  for (let i = 0; i < 5; i++) await pub('auth.login', ['cliente@mail.com', 'mala-clave']);
  const logBloq = await pub('auth.login', ['cliente@mail.com', 'secreto123']);
  ok(logBloq.result?.error === 'demasiados_intentos', 'login: 5 fallos seguidos → demasiados_intentos', logBloq.result);
  const { reiniciarLimitesTienda } = await import('../electron/utils/tienda-limites');
  reiniciarLimitesTienda();
  // 41. A1: cambio de contraseña revoca las demás sesiones (refresh tokens).
  const s1 = await pub('auth.login', ['cliente@mail.com', 'secreto123']);
  const s2 = await pub('auth.login', ['cliente@mail.com', 'secreto123']);
  const cambio = await pub('auth.perfil.update', [{ password: 'nueva-clave-9', passwordActual: 'secreto123' }], s2.result?.accessToken);
  ok(cambio.result?.success === true, 'cambio de contraseña OK', cambio.result);
  const ref1Viejo = await pub('auth.refresh', [s1.result?.refreshToken]);
  ok(ref1Viejo.result?.success !== true, 'cambio de contraseña: la otra sesión ya no refresca', ref1Viejo.result);
  // 42. A1: cuenta dada de baja no ve pedidos con token vigente.
  const sBaja = await pub('auth.login', ['cliente@mail.com', 'nueva-clave-9']);
  await dataSource.getRepository('CuentaCliente').update({ email: 'cliente@mail.com' }, { activo: false });
  const misBaja = await pub('pedido.mis', [], sBaja.result?.accessToken);
  ok(misBaja.result?.success !== true && misBaja.result?.error === 'cuenta_invalida', 'cuenta inactiva: pedido.mis rechazado', misBaja.result);
  await dataSource.getRepository('CuentaCliente').update({ email: 'cliente@mail.com' }, { activo: true });

  console.log = origLog;
  await fastify.close();
  await dataSource.destroy();

  console.log(`\n[e2e] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[e2e] FATAL:', e); process.exit(1); });
