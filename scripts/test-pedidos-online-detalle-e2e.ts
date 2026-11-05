/**
 * E2E del detalle del pedido (tienda F9): lo que el cliente puede hacer con su pedido.
 *
 *  [A] acciones según el estado (las decide el servidor)
 *  [B] dueño: otra cuenta recibe el mismo «no encontrado» (sin filtrar que existe)
 *  [C] solicitar cancelación: una sola vez; cuenta en el contador de la bandeja; filtro
 *  [D] el local rechaza la solicitud: respuesta visible, no se puede volver a pedir
 *  [E] el local aprueba: CANCELADO con el motivo del cliente; aprobar dos veces no hace nada
 *  [F] aprobar con la venta ya armada: la venta se revierte (mismo camino que el rechazo)
 *  [G] modificar: sólo RECIBIDO sin venta ni cobro online ni solicitud pendiente
 *  [H] materialización contra un pedido que el cliente ya canceló: no arma la venta
 *  [I] topes por cuenta para las acciones
 *  [J] snapshot para «Repetir» (receta y producto) y teléfono del local
 *
 * Uso: npm run test:pedidos-online-detalle   ·   npm run test:pedidos-online-detalle-pg (Postgres temporal)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';

const PG = process.argv.includes('--pg');
const TAG = PG ? '[detalle-pg]' : '[detalle]';
let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function abrirBase(): Promise<{ ds: DataSource; cerrar: () => Promise<void> } | null> {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!PG) {
    const dbFile = path.join(tmpDir, 'test-pedidos-online-detalle.db');
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
  const nombre = `frc_gourmet_detalletest_${process.pid}`;
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
  const save = (ent: any, data: any): Promise<any> => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);
  const { Moneda } = E('financiero/moneda.entity');
  const { TipoPrecio } = E('financiero/tipo-precio.entity');
  const { Familia } = E('productos/familia.entity');
  const { Subfamilia } = E('productos/subfamilia.entity');
  const { Producto } = E('productos/producto.entity');
  const { Presentacion } = E('productos/presentacion.entity');
  const { PrecioVenta } = E('productos/precio-venta.entity');
  const { CuentaCliente } = E('pedidos-online/cuenta-cliente.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { PedidoOnlineItem } = E('pedidos-online/pedido-online-item.entity');
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Venta } = E('ventas/venta.entity');

  const gs = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 });
  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const subfamilia = await save(Subfamilia, { nombre: 'CLASICAS', activo: true, familia: await save(Familia, { nombre: 'HAMBURGUESAS', activo: true }) });
  const producto = await save(Producto, { nombre: 'HAMBURGUESA', tipo: 'RETAIL', activo: true, esVendible: true, disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia });
  const presentacion = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto });
  await save(PrecioVenta, { valor: 45000, principal: true, activo: true, moneda: gs, tipoPrecio, presentacion });
  const cuenta = await save(CuentaCliente, { telefono: '0981111222', telefonoVerificado: true, nombre: 'CLIENTE UNO', activo: true });
  const otra = await save(CuentaCliente, { telefono: '0981333444', telefonoVerificado: true, nombre: 'CLIENTE DOS', activo: true });

  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const rol = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const codigo of ['PEDIDOS_ONLINE_CONFIGURAR', 'PEDIDOS_ONLINE_VER', 'PEDIDOS_ONLINE_GESTIONAR', 'VENTAS_PDV']) {
    await save(RolePermission, { role: rol, permission: await save(Permission, { codigo, descripcion: codigo, activo: true }) });
  }
  await save(UsuarioRole, { usuario: admin, role: rol });

  const getUser = () => admin;
  require('../electron/handlers/pedidos-online.handler').registerPedidosOnlineHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-pedidos.handler').registerPedidosOnlinePedidosHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-admin.handler').registerPedidosOnlineAdminHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-config.handler').registerPedidosOnlineConfigHandlers(ds, getUser);
  const { reiniciarLimitesTienda, ACCIONES_POR_CUENTA_HORA } = require('../electron/utils/tienda-limites');

  const ctx = (c: any = cuenta) => ({ customerId: c.id, clientIp: '10.0.0.5' } as any);
  const pedir = async (): Promise<string> => {
    const r: any = await invokeHandlerWithContext('crear-pedido-online', ctx(), {
      tipoPedido: 'PICKUP', items: [{ productoId: producto.id, presentacionId: presentacion.id, cantidad: 2 }],
    });
    if (!r?.success) throw new Error('no se pudo crear el pedido: ' + JSON.stringify(r));
    return r.numero;
  };
  const ver = (numero: string, c: any = cuenta) => invokeHandlerWithContext('get-pedido-online-estado', ctx(c), numero);
  const solicitar = (numero: string, motivo?: any, c: any = cuenta) => invokeHandlerWithContext('solicitar-cancelacion-pedido-online', ctx(c), numero, motivo);
  const modificar = (numero: string, c: any = cuenta) => invokeHandlerWithContext('modificar-pedido-online', ctx(c), numero);
  const fila = (numero: string): Promise<any> => ds.getRepository(PedidoOnline).findOne({ where: { numero } });
  const pendientes = async () => (await invokeHandler('contar-pedidos-online-pendientes') as any);

  // ═══════ [A] Acciones según el estado ═══════
  console.log('\n[A] Acciones según el estado');
  const n1 = await pedir();
  const v1: any = await ver(n1);
  ok(v1?.pedido?.acciones?.modificar === true && v1.pedido.acciones.solicitarCancelacion === true && v1.pedido.acciones.repetir === true,
    'A: esperando confirmación → modificar y pedir cancelación', v1?.pedido?.acciones);
  await ds.getRepository(PedidoOnline).update({ numero: n1 }, { estado: 'EN_PREPARACION' } as any);
  const v1b: any = await ver(n1);
  ok(v1b?.pedido?.acciones?.modificar === false && v1b.pedido.acciones.solicitarCancelacion === true,
    'A: en preparación → ya no se modifica, sí se pide cancelar', v1b?.pedido?.acciones);
  await ds.getRepository(PedidoOnline).update({ numero: n1 }, { estado: 'ENTREGADO' } as any);
  const v1c: any = await ver(n1);
  ok(v1c?.pedido?.acciones?.modificar === false && v1c.pedido.acciones.solicitarCancelacion === false && v1c.pedido.acciones.repetir === true,
    'A: entregado → sólo repetir y compartir', v1c?.pedido?.acciones);
  const { accionesPedido, limpiarMotivo } = require('../electron/utils/pedido-acciones.utils');
  ok(accionesPedido({ estado: 'EN_PREPARACION', mesaId: 3, ventaId: 9 }).solicitarCancelacion === false,
    'A: mesa con el pedido ya en la cuenta → se pide al mozo, no desde la tienda');
  ok(accionesPedido({ estado: 'RECIBIDO', estadoPago: 'PAGADO' }).modificar === false && accionesPedido({ estado: 'RECIBIDO', estadoPago: 'PENDIENTE' }).modificar === false,
    'A: con cobro online hecho o en curso no se modifica');
  ok(accionesPedido({ estado: 'RECIBIDO', tipoPedido: 'MESA_QR' }).modificar === false, 'A: un pedido de mesa no se modifica desde la tienda');
  ok(limpiarMotivo('  me\u0000 equivoqué\u001b ') === 'ME  EQUIVOQUÉ' && limpiarMotivo('   ') === null && limpiarMotivo('x'.repeat(300)).length === 200,
    'A: motivo sin caracteres de control, en MAYÚSCULAS, hasta 200', limpiarMotivo('  me\u0000 equivoqué\u001b '));

  // ═══════ [B] Dueño ═══════
  console.log('\n[B] Sólo el dueño');
  const n2 = await pedir();
  const ajeno: any = await ver(n2, otra);
  const ajenoSol: any = await solicitar(n2, 'x', otra);
  const ajenoMod: any = await modificar(n2, otra);
  const inexist: any = await solicitar('NO-EXISTE');
  ok(ajeno?.error === 'pedido_no_encontrado' && ajenoSol?.error === 'pedido_no_encontrado' && ajenoMod?.error === 'pedido_no_encontrado'
    && inexist?.error === 'pedido_no_encontrado', 'B: otra cuenta recibe el mismo error que un número inexistente', [ajeno?.error, ajenoSol?.error, ajenoMod?.error]);
  ok((await fila(n2))?.cancelacionSolicitadaEn == null && (await fila(n2))?.estado === 'RECIBIDO', 'B: y el pedido ajeno no cambia');
  const sinSesion: any = await invokeHandlerWithContext('solicitar-cancelacion-pedido-online', {} as any, n2, 'x');
  ok(sinSesion?.success === false, 'B: sin sesión no se puede', sinSesion);

  // ═══════ [C] Solicitar cancelación ═══════
  console.log('\n[C] Solicitar cancelación');
  const antes = await pendientes();
  const s1: any = await solicitar(n2, 'me equivoqué de dirección');
  const f2: any = await fila(n2);
  ok(s1?.success === true && !!f2.cancelacionSolicitadaEn && f2.cancelacionMotivo === 'ME EQUIVOQUÉ DE DIRECCIÓN' && f2.estado === 'RECIBIDO',
    'C: queda la solicitud con el motivo; el pedido sigue igual', { s1: s1?.error, motivo: f2?.cancelacionMotivo, estado: f2?.estado });
  ok(s1?.pedido?.acciones?.solicitarCancelacion === false && s1.pedido.acciones.modificar === false,
    'C: con la solicitud en manos del local, no hay más botones de cancelar/modificar', s1?.pedido?.acciones);
  const s1b: any = await solicitar(n2, 'otra vez');
  ok(s1b?.success === false && s1b?.error === 'cancelacion_no_disponible' && (await fila(n2)).cancelacionMotivo === 'ME EQUIVOQUÉ DE DIRECCIÓN',
    'C: una segunda solicitud no pisa la primera', s1b);
  const desp = await pendientes();
  ok(desp.pendientes === antes.pendientes && desp.cancelaciones === 1,
    'C: un RECIBIDO que pide cancelar cuenta una vez (no dos) y se informa aparte', [antes, desp]);
  const filtro: any[] = await invokeHandler('get-pedidos-online-admin', { cancelacionPendiente: true }) as any;
  ok(filtro.length === 1 && filtro[0].numero === n2 && filtro[0].cancelacionMotivo === 'ME EQUIVOQUÉ DE DIRECCIÓN',
    'C: el filtro «Piden cancelar» de la bandeja la muestra', filtro.map((p) => p.numero));
  const modPend: any = await modificar(n2);
  ok(modPend?.success === false && (await fila(n2)).estado === 'RECIBIDO', 'C: con la solicitud pendiente no se puede modificar', modPend);

  // ═══════ [D] El local rechaza la solicitud ═══════
  console.log('\n[D] El local dice que no');
  const rr: any = await invokeHandler('resolver-cancelacion-pedido-online', (await fila(n2)).id, false, 'ya está en el horno');
  const f2d: any = await fila(n2);
  ok(rr?.success === true && f2d.cancelacionSolicitadaEn == null && f2d.cancelacionRespuesta === 'YA ESTÁ EN EL HORNO' && f2d.estado === 'RECIBIDO',
    'D: se guarda la respuesta y el pedido sigue', { rr: rr?.error, resp: f2d?.cancelacionRespuesta, estado: f2d?.estado });
  const vD: any = await ver(n2);
  ok(vD?.pedido?.cancelacionRespuesta === 'YA ESTÁ EN EL HORNO' && vD.pedido.acciones.solicitarCancelacion === false,
    'D: el cliente ve la respuesta y no puede volver a pedirlo', vD?.pedido?.acciones);
  ok((await solicitar(n2, 'por favor'))?.error === 'cancelacion_no_disponible', 'D: insistir no crea otra solicitud');
  ok((await pendientes()).cancelaciones === 0, 'D: ya no cuenta como pendiente');
  ok(vD?.pedido?.acciones?.modificar === false && (await modificar(n2))?.success === false && (await fila(n2)).estado === 'RECIBIDO',
    'D: tras el «no» del local tampoco se puede «modificar» (sería cancelarlo igual)');
  const rr2: any = await invokeHandler('resolver-cancelacion-pedido-online', f2d.id, true);
  ok(rr2?.success === false && rr2?.error === 'sin_solicitud' && (await fila(n2)).estado === 'RECIBIDO', 'D: sin solicitud no se aprueba nada', rr2);

  // ═══════ [E] El local aprueba ═══════
  console.log('\n[E] El local aprueba');
  const n3 = await pedir();
  await solicitar(n3, 'cambié de idea');
  const id3 = (await fila(n3)).id;
  const ap: any = await invokeHandler('resolver-cancelacion-pedido-online', id3, true);
  const f3: any = await fila(n3);
  ok(ap?.success === true && f3.estado === 'CANCELADO' && f3.motivoRechazo === 'CAMBIÉ DE IDEA' && f3.cancelacionRespuesta === 'APROBADA',
    'E: CANCELADO (lo pidió el cliente) con su motivo', { ap: ap?.error, estado: f3?.estado, motivo: f3?.motivoRechazo });
  const ap2: any = await invokeHandler('resolver-cancelacion-pedido-online', id3, true);
  ok(ap2?.success === false && (await fila(n3)).estado === 'CANCELADO', 'E: aprobar dos veces no hace nada', ap2);
  const vE: any = await ver(n3);
  ok(vE?.pedido?.acciones?.solicitarCancelacion === false && vE.pedido.acciones.modificar === false && vE.pedido.acciones.repetir === true,
    'E: cancelado → sólo repetir', vE?.pedido?.acciones);

  // ═══════ [F] Aprobar con la venta ya armada ═══════
  console.log('\n[F] Aprobar con venta');
  const n4 = await pedir();
  const venta = await save(Venta, { estado: 'ABIERTA', canalOrigen: 'WEB' });
  await ds.getRepository(PedidoOnline).update({ numero: n4 }, { estado: 'EN_PREPARACION', ventaId: venta.id } as any);
  await solicitar(n4, 'tarda mucho');
  const apF: any = await invokeHandler('resolver-cancelacion-pedido-online', (await fila(n4)).id, true);
  const vF: any = await ds.getRepository(Venta).findOne({ where: { id: venta.id } });
  ok(apF?.success === true && (await fila(n4)).estado === 'CANCELADO' && vF?.estado === 'CANCELADA',
    'F: la venta se revierte junto con el pedido (como en el rechazo)', { apF: apF?.error, venta: vF?.estado });

  // Solicitud sin responder y el pedido sale: se cierra sola, no queda «esperando respuesta».
  const nS = await pedir();
  const ventaS = await save(Venta, { estado: 'ABIERTA', canalOrigen: 'WEB' });
  await ds.getRepository(PedidoOnline).update({ numero: nS }, { estado: 'EN_PREPARACION', ventaId: ventaS.id } as any);
  const cuentaAntesS = (await pendientes()).pendientes;
  await solicitar(nS, 'apuro');
  ok((await pendientes()).pendientes === cuentaAntesS + 1, 'F: un pedido en preparación que pide cancelar suma al contador');
  const idS = (await fila(nS)).id;
  const aL: any = await invokeHandler('avanzar-estado-pedido-online', idS, 'LISTO');
  ok(aL?.success === true && !!(await fila(nS)).cancelacionSolicitadaEn, 'F: pasar a LISTO no cierra la solicitud (todavía se puede cancelar)', aL);
  const aE: any = await invokeHandler('avanzar-estado-pedido-online', idS, 'ENTREGADO');
  const fS: any = await fila(nS);
  ok(aE?.success === true && fS.cancelacionSolicitadaEn == null && fS.cancelacionRespuesta === 'EL PEDIDO YA HABÍA SALIDO' && (await pendientes()).cancelaciones === 0,
    'F: al salir/entregarse, la solicitud se cierra con una respuesta para el cliente', { aE: aE?.error, s: fS?.cancelacionSolicitadaEn, r: fS?.cancelacionRespuesta });
  const { cierreSolicitudAlSalir } = require('../electron/utils/pedido-acciones.utils');
  ok(JSON.stringify(cierreSolicitudAlSalir({ cancelacionSolicitadaEn: new Date() }, 'EN_CAMINO')).includes('YA HAB')
    && Object.keys(cierreSolicitudAlSalir({ cancelacionSolicitadaEn: new Date() }, 'CANCELADO')).length === 0
    && Object.keys(cierreSolicitudAlSalir({}, 'ENTREGADO')).length === 0, 'F: la misma regla sirve para la sincronización con el delivery');

  // ═══════ [G] Modificar ═══════
  console.log('\n[G] Modificar');
  const n5 = await pedir();
  const m5: any = await modificar(n5);
  const f5: any = await fila(n5);
  ok(m5?.success === true && f5.estado === 'CANCELADO' && f5.motivoRechazo === 'MODIFICADO POR EL CLIENTE',
    'G: esperando confirmación → se cancela al instante', { m5: m5?.error, estado: f5?.estado });
  ok(Array.isArray(m5?.pedido?.items) && m5.pedido.items.length === 1 && m5.pedido.items[0].productoId === producto.id,
    'G: devuelve los productos para volver a armarlos en el carrito', m5?.pedido?.items);
  ok((await modificar(n5))?.success === false, 'G: modificar un cancelado no hace nada');
  const n6 = await pedir();
  await ds.getRepository(PedidoOnline).update({ numero: n6 }, { estado: 'ACEPTADO' } as any);
  ok((await modificar(n6))?.error === 'modificar_no_disponible' && (await fila(n6)).estado === 'ACEPTADO', 'G: aceptado por el local → ya no se modifica');
  const n7 = await pedir();
  await ds.getRepository(PedidoOnline).update({ numero: n7 }, { estadoPago: 'PENDIENTE' } as any);
  ok((await modificar(n7))?.success === false && (await fila(n7)).estado === 'RECIBIDO', 'G: con el pago con tarjeta en curso no se modifica');
  const n8 = await pedir();
  const venta8 = await save(Venta, { estado: 'ABIERTA', canalOrigen: 'WEB' });
  await ds.getRepository(PedidoOnline).update({ numero: n8 }, { ventaId: venta8.id } as any);
  ok((await modificar(n8))?.success === false && (await fila(n8)).estado === 'RECIBIDO', 'G: con venta armada (mesa/auto-aceptado) no se modifica');

  // ═══════ [H] Materializar un pedido ya cancelado ═══════
  console.log('\n[H] Carrera con la materialización');
  const R = (n: string) => ds.getRepository(n);
  const disp: any = await R('Dispositivo').save(R('Dispositivo').create({ nombre: 'TERMINAL F9', activo: true } as any));
  const conteo: any = await R('Conteo').save(R('Conteo').create({ activo: true, tipo: 'APERTURA', fecha: new Date() } as any));
  const caja: any = await R('Caja').save(R('Caja').create({ estado: 'ABIERTO', activo: true, fechaApertura: new Date(), conteoApertura: { id: conteo.id }, dispositivo: { id: disp.id } } as any));
  const { materializarPedidoOnlineEnVenta } = require('../electron/handlers/ventas.handler');
  const ventasAntes = await ds.getRepository(Venta).count();
  let errH: any = null;
  try { await materializarPedidoOnlineEnVenta(ds, f5.id, { cajaId: caja.id }); } catch (e: any) { errH = e?.message; }
  ok(!!errH && (await fila(n5)).ventaId == null && (await fila(n5)).estado === 'CANCELADO' && (await ds.getRepository(Venta).count()) === ventasAntes,
    'H: un pedido cancelado por el cliente no se materializa ni deja una venta suelta', errH);
  // Aceptado y materializado normal sigue funcionando.
  const n9 = await pedir();
  await ds.getRepository(PedidoOnline).update({ numero: n9 }, { estado: 'ACEPTADO' } as any);
  let mat9: any = null;
  try { mat9 = await materializarPedidoOnlineEnVenta(ds, (await fila(n9)).id, { cajaId: caja.id }); } catch (e: any) { mat9 = { error: e?.message }; }
  const f9: any = await fila(n9);
  ok(!!mat9?.ventaId && f9.ventaId === mat9.ventaId && f9.estado === 'EN_PREPARACION', 'H: un aceptado se materializa igual que antes', mat9);

  // ═══════ [I] Topes ═══════
  console.log('\n[I] Topes');
  reiniciarLimitesTienda();
  const n10 = await pedir();
  let corte = -1;
  for (let i = 0; i < ACCIONES_POR_CUENTA_HORA + 2; i++) {
    const r: any = await solicitar(n10, 'x');
    if (r?.error === 'demasiadas_solicitudes') { corte = i; break; }
  }
  ok(corte === ACCIONES_POR_CUENTA_HORA, `I: la acción ${ACCIONES_POR_CUENTA_HORA + 1} de la hora se corta`, corte);
  const otraCuenta: any = await ver(n10);
  ok(otraCuenta?.success === true, 'I: leer el pedido no se corta');
  reiniciarLimitesTienda();

  // ═══════ [J] Snapshot para «Repetir» y teléfono del local ═══════
  console.log('\n[J] Repetir y contacto');
  const it9: any = await ds.getRepository(PedidoOnlineItem).findOne({ where: { pedido: { id: f9.id } } as any });
  const snap = JSON.parse(it9?.personalizacion || '{}');
  ok(snap?.opcion && 'recetaId' in snap.opcion && snap.opcion.tipo === 'PRESENTACION', 'J: el snapshot guarda tipo y receta de la opción', snap?.opcion);
  const vJ: any = await ver(n9);
  ok(vJ?.pedido?.items?.[0]?.productoId === producto.id && vJ.pedido.items[0].presentacionId === presentacion.id && vJ.pedido.items[0].cantidad === 2,
    'J: el detalle trae producto y presentación de cada ítem', vJ?.pedido?.items?.[0]);
  const telMal: any = await invokeHandler('update-tienda-online-config', { telefonoContacto: '<script>' });
  ok(telMal?.success === false && telMal?.error === 'telefono_contacto_invalido', 'J: teléfono del local con basura se rechaza', telMal);
  await invokeHandler('update-tienda-online-config', { telefonoContacto: '0981 123 456' });
  const pub: any = await invokeHandler('get-tienda-online-config-public');
  ok(pub?.telefonoContacto === '0981 123 456', 'J: la tienda recibe el teléfono del local', pub?.telefonoContacto);
  await invokeHandler('update-tienda-online-config', { telefonoContacto: '' });
  ok((await invokeHandler('get-tienda-online-config-public') as any)?.telefonoContacto === null, 'J: vacío = sin teléfono');

  await cerrar();
  console.log(`\n${TAG} RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
