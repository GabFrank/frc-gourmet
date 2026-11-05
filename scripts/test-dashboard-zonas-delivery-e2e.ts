/**
 * E2E del dashboard de Zonas de Delivery (tienda online F7): `get-dashboard-zonas-delivery`.
 *
 * Cuenta los dos tipos de delivery por zona —el de la tienda (zona del pedido) y el
 * del PdV por teléfono (tarifa del PdV → la zona que la tiene)— sobre ventas
 * CONCLUIDAS del período, con la jornada comercial. Fixture con trampas:
 *
 *  [A] atribución: web por zona del pedido; teléfono por tarifa; web sin zona
 *      (convertida) por tarifa; tarifa sin zona; tarifa compartida (dato viejo);
 *      zona eliminada; sin tarifa
 *  [B] una venta con DOS filas en pedidos_online no duplica la plata ni el envío
 *  [C] pago mixto en dos monedas (cotización ≠ 1)
 *  [D] quedan fuera: retiro, venta abierta, cancelada, mesa con 2 pedidos, otra jornada
 *  [E] Σ filas = KPIs, y los KPIs = `kpisDelivery` de Reportes (pedidos, plata, envío)
 *  [F] puntos del mapa: sólo web cobrados con coordenadas, redondeados, sin datos personales,
 *      un punto por venta
 *  [G] permisos: VENTAS_PDV lee; sin él, no; editar sigue con CONFIGURAR
 *  [H] una tarifa del PdV por zona: vincular una tarifa ya usada se rechaza
 *
 * Uso:
 *   npm run test:dashboard-zonas            (SQLite temporal)
 *   npm run test:dashboard-zonas-pg         (Postgres local: base temporal que se crea y se borra;
 *                                            FRC_PG_HOST/PORT/USERNAME/PASSWORD; sin Postgres, se saltea)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';

const PG = process.argv.includes('--pg');
const TAG = PG ? '[zonas-pg]' : '[zonas]';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function abrirBase(): Promise<{ ds: DataSource; cerrar: () => Promise<void> } | null> {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!PG) {
    const dbFile = path.join(tmpDir, 'test-dashboard-zonas.db');
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
  const nombre = `frc_gourmet_zonastest_${process.pid}`;
  const admin = new DataSource({ type: 'postgres', ...conn, database: 'postgres' } as any);
  try { await admin.initialize(); } catch (e: any) {
    console.log(`${TAG} SALTEADO: no hay Postgres disponible (${String(e.message).split('\n')[0]}).`);
    return null;
  }
  await admin.query(`CREATE DATABASE "${nombre}"`);
  const ds = new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', ...conn, database: nombre } as any) as any), synchronize: false, migrationsRun: false });
  await ds.initialize();
  return {
    ds,
    cerrar: async () => {
      await ds.destroy();
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}"`);
      await admin.destroy();
    },
  };
}

async function main() {
  const base = await abrirBase();
  if (!base) process.exit(0);
  const { ds, cerrar } = base!;
  await ds.runMigrations({ transaction: 'each' });
  console.log(`${TAG} Migraciones OK (${PG ? 'Postgres' : 'SQLite'}).`);

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Venta } = E('ventas/venta.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaCambio } = E('financiero/moneda-cambio.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { ZonaDelivery } = E('pedidos-online/zona-delivery.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');

  const save = (ent: any, data: any): Promise<any> => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // Usuarios: cajero (VENTAS_PDV), encargado (+ CONFIGURAR), sin permisos.
  const permiso = async (codigo: string) => save(Permission, { codigo, descripcion: codigo, activo: true });
  const pPdv = await permiso('VENTAS_PDV');
  const pConf = await permiso('PEDIDOS_ONLINE_CONFIGURAR');
  const usuario = async (nick: string, perms: any[]) => {
    const u = await save(Usuario, { nickname: nick, password: 'x', activo: true });
    if (perms.length) {
      const r = await save(Role, { descripcion: `ROL ${nick}`, activo: true });
      for (const p of perms) await save(RolePermission, { role: r, permission: p });
      await save(UsuarioRole, { usuario: u, role: r });
    }
    return u;
  };
  const cajero = await usuario('cajero', [pPdv]);
  const encargado = await usuario('encargado', [pPdv, pConf]);
  const nadie = await usuario('nadie', []);
  let actual: any = encargado;

  // Jornada desde las 07:00: lo de antes cuenta en la jornada anterior.
  await save(PdvConfig, { cantidad_mesas: 0, inicioJornadaHora: 7 });
  const caja = await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), activo: true,
    dispositivo: await save(Dispositivo, { nombre: 'CAJA-ZONAS', activo: true }), conteoApertura: await save(Conteo, {}),
  });
  const gs = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const usd = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'US$', principal: false, activo: true });
  await save(MonedaCambio, { monedaOrigen: usd, monedaDestino: gs, compraOficial: 7000, ventaOficial: 7100, compraLocal: 7000, ventaLocal: 7100, activo: true });
  const efectivo = await save(FormasPago, { nombre: 'EFECTIVO', activo: true });

  // Tarifas del PdV y zonas de la tienda.
  const tarifa = (d: string, v: number) => save(PrecioDelivery, { descripcion: d, valor: v, activo: true });
  const T1 = await tarifa('CORTA DISTANCIA', 7000);
  const T2 = await tarifa('MEDIA DISTANCIA', 10000);
  const T3 = await tarifa('LARGA DISTANCIA', 18000); // sin zona
  const T4 = await tarifa('MUY LARGA DISTANCIA', 24000); // compartida por D y E (dato viejo)
  const poli = JSON.stringify({ type: 'Polygon', coordinates: [[[-54.31, -24.06], [-54.30, -24.06], [-54.30, -24.05], [-54.31, -24.06]]] });
  const zona = (nombre: string, orden: number, t: any, dibujada = true) =>
    save(ZonaDelivery, { nombre, tarifa: 0, montoMinimo: 0, activa: true, orden, poligono: dibujada ? poli : null, precioDelivery: t });
  const A = await zona('CENTRO', 1, T1);
  const B = await zona('NORTE', 2, T2);
  const C = await zona('SUR', 3, null, false);
  const D = await zona('KM 5', 4, T4);
  const Ez = await zona('KM 7', 5, T4);

  const { registerPedidosOnlineAdminHandlers } = require('../electron/handlers/pedidos-online-admin.handler');
  registerPedidosOnlineAdminHandlers(ds, () => actual);
  const { rangoToFechas } = require('../electron/utils/dashboard-rangos.util');
  const jornadaHoy = rangoToFechas('today', new Date(), 7);

  // ─── Ventas ───
  let seq = 0;
  const venta = async (o: {
    canal: 'WEB' | 'LOCAL'; tarifa?: any; modo?: 'DELIVERY' | 'RETIRO'; estado?: string; costo?: number;
    pagos?: [any, number][]; pedidos?: { zona?: number | null; lat?: number; lng?: number; tipo?: string }[];
    fecha?: Date; mesa?: boolean;
  }) => {
    let delivery: any = null;
    if (!o.mesa) {
      delivery = await save(Delivery, {
        estado: 'ENTREGADO', modo: o.modo || 'DELIVERY', fechaAbierto: new Date(), precioDelivery: o.tarifa || null,
      });
    }
    let pago: any = null;
    if (o.pagos?.length) {
      pago = await save(Pago, {});
      for (const [mon, valor] of o.pagos) {
        await save(PagoDetalle, { pago, moneda: mon, formaPago: efectivo, valor, tipo: 'PAGO', descripcion: 'EFECTIVO', activo: true });
      }
    }
    const v = await save(Venta, {
      estado: o.estado || 'CONCLUIDA', caja, delivery, pago, canalOrigen: o.canal,
      costoDelivery: o.costo ?? 0, mesa: o.mesa ? await save(PdvMesa, { numero: 900 + seq, estado: 'OCUPADO', activo: true, reservado: false }) : null,
    });
    if (o.fecha) await ds.getRepository(Venta).update({ id: v.id }, { createdAt: o.fecha } as any);
    for (const p of o.pedidos || []) {
      await save(PedidoOnline, {
        numero: `PO-Z${String(++seq).padStart(3, '0')}`, tipoPedido: p.tipo || (o.modo === 'RETIRO' ? 'PICKUP' : 'DELIVERY'),
        canalOrigen: 'WEB', metodoPago: 'EFECTIVO', estado: 'ENTREGADO', subtotal: 0, costoEnvio: 0, total: 0,
        ventaId: v.id, deliveryId: delivery?.id, zonaDelivery: p.zona != null ? { id: p.zona } : null,
        latitud: p.lat, longitud: p.lng, nombreCliente: 'CLIENTE SECRETO', telefonoCliente: '0981000000',
        direccionEntrega: 'CALLE PRIVADA 123',
      });
    }
    return v;
  };
  const enJornada = new Date(jornadaHoy.desde.getTime() + 30 * 60_000);
  // 1 · web en CENTRO
  await venta({ canal: 'WEB', tarifa: T1, costo: 10000, pagos: [[gs, 50000]], pedidos: [{ zona: A.id, lat: -24.05612345, lng: -54.30612345 }], fecha: enJornada });
  // 2 · web en NORTE con DOS filas en pedidos_online y pago mixto (30.000 + 10 US$ × 7.000)
  await venta({ canal: 'WEB', tarifa: T2, costo: 15000, pagos: [[gs, 30000], [usd, 10]],
    pedidos: [{ zona: B.id, lat: -24.0501, lng: -54.3001 }, { zona: B.id, lat: -24.0502, lng: -54.3002 }], fecha: enJornada });
  // 3 · teléfono CORTA → CENTRO; 4 · teléfono MEDIA → NORTE
  await venta({ canal: 'LOCAL', tarifa: T1, costo: 7000, pagos: [[gs, 40000]], fecha: enJornada });
  await venta({ canal: 'LOCAL', tarifa: T2, costo: 10000, pagos: [[gs, 60000]], fecha: enJornada });
  // 5 · teléfono LARGA (sin zona) · 6 · MUY LARGA (compartida) · 7 · sin tarifa
  await venta({ canal: 'LOCAL', tarifa: T3, costo: 18000, pagos: [[gs, 70000]], fecha: enJornada });
  await venta({ canal: 'LOCAL', tarifa: T4, costo: 24000, pagos: [[gs, 80000]], fecha: enJornada });
  await venta({ canal: 'LOCAL', costo: 0, pagos: [[gs, 20000]], fecha: enJornada });
  // 8 · web convertida (pedido sin zona, tarifa MEDIA en el delivery) → NORTE
  await venta({ canal: 'WEB', tarifa: T2, costo: 10000, pagos: [[gs, 45000]], pedidos: [{ zona: null, lat: -24.051, lng: -54.301 }], fecha: enJornada });
  // 9 · web en una zona que ya no existe
  await venta({ canal: 'WEB', tarifa: null, costo: 5000, pagos: [[gs, 25000]], pedidos: [{ zona: 99999, lat: -24.052, lng: -54.302 }], fecha: enJornada });
  // Fuera: retiro web, abierta, cancelada, mesa con 2 pedidos, otra jornada
  await venta({ canal: 'WEB', modo: 'RETIRO', pagos: [[gs, 33000]], pedidos: [{ zona: A.id, lat: -24.05, lng: -54.30 }], fecha: enJornada });
  await venta({ canal: 'WEB', tarifa: T1, estado: 'ABIERTA', costo: 7000, pagos: [[gs, 99000]], pedidos: [{ zona: A.id, lat: -24.05, lng: -54.30 }], fecha: enJornada });
  await venta({ canal: 'LOCAL', tarifa: T1, estado: 'CANCELADA', costo: 7000, pagos: [[gs, 99000]], fecha: enJornada });
  await venta({ canal: 'WEB', mesa: true, pagos: [[gs, 11000]], pedidos: [{ zona: null, tipo: 'MESA_QR' }, { zona: null, tipo: 'MESA_QR' }], fecha: enJornada });
  // Media hora ANTES de que arranque la jornada de hoy: es de ayer (entra en 7 días, no en hoy).
  await venta({ canal: 'LOCAL', tarifa: T1, costo: 7000, pagos: [[gs, 30000]], fecha: new Date(jornadaHoy.desde.getTime() - 30 * 60_000) });

  // ═══════ [A]–[D] Atribución ═══════
  console.log('\n[A] Atribución por zona (hoy)');
  const hoy: any = await invokeHandler('get-dashboard-zonas-delivery', { rango: 'today' });
  const f = (nombre: string) => hoy.filas.find((x: any) => x.nombre === nombre);
  const centro = f('CENTRO'), norte = f('NORTE'), sur = f('SUR');
  ok(centro && centro.tienda.envios === 1 && centro.tienda.facturacion === 50000 && centro.telefono.envios === 1 && centro.telefono.facturacion === 40000,
    'A: CENTRO = 1 web (50.000) + 1 teléfono por su tarifa (40.000)', centro);
  ok(centro.envioRecaudado === 17000, 'A: CENTRO cobra de envío 10.000 + 7.000', centro.envioRecaudado);
  ok(norte && norte.tienda.envios === 2 && norte.telefono.envios === 1,
    'A: NORTE = 2 web (una convertida sin zona, por su tarifa) + 1 teléfono', norte);
  ok(sur && sur.envios === 0 && sur.facturacion === 0, 'A: una zona sin envíos aparece en cero', sur);
  ok(f('LARGA DISTANCIA · sin zona')?.telefono.envios === 1, 'A: tarifa sin zona → fila propia', hoy.filas.map((x: any) => x.nombre));
  ok(f('MUY LARGA DISTANCIA · varias zonas')?.telefono.envios === 1 && f('KM 5').envios === 0 && f('KM 7').envios === 0,
    'A: tarifa compartida por dos zonas → fila «varias zonas», no se adivina', [f('KM 5'), f('KM 7')]);
  ok(f('Zona eliminada')?.tienda.envios === 1, 'A: pedido de una zona eliminada → «Zona eliminada»');
  ok(f('Sin zona')?.telefono.envios === 1, 'A: teléfono sin tarifa → «Sin zona»');

  console.log('\n[B] Una venta con dos filas en pedidos_online');
  ok(norte.tienda.facturacion === 100000 + 45000, 'B: la plata de la venta con 2 pedidos no se duplica (100.000 + 45.000)', norte.tienda.facturacion);
  ok(norte.envioRecaudado === 15000 + 10000 + 10000, 'B: ni su envío', norte.envioRecaudado);

  console.log('\n[C] Pago mixto');
  ok(norte.tienda.facturacion === 145000, 'C: 30.000 Gs + 10 US$ × 7.000 = 100.000', norte.tienda.facturacion);

  console.log('\n[D] Lo que no cuenta');
  ok(hoy.kpis.envios === 9, 'D: 9 envíos hoy (sin retiro, abierta, cancelada, mesa ni la de ayer)', hoy.kpis.envios);
  const semana: any = await invokeHandler('get-dashboard-zonas-delivery', { rango: 'week' });
  ok(semana.kpis.envios === 10 && semana.filas.find((x: any) => x.nombre === 'CENTRO').telefono.envios === 2,
    'D: la venta de 30 min antes de la jornada cuenta en la semana, no en hoy', semana.kpis.envios);

  // ═══════ [E] Invariantes ═══════
  console.log('\n[E] Σ filas = KPIs = Reportes');
  const suma = (k: string) => hoy.filas.reduce((s: number, x: any) => s + x[k], 0);
  ok(suma('envios') === hoy.kpis.envios && suma('facturacion') === hoy.kpis.facturacion && suma('envioRecaudado') === hoy.kpis.envioRecaudado,
    'E: la suma de las filas da los KPIs', [suma('envios'), hoy.kpis]);
  ok(hoy.kpis.enviosTienda + hoy.kpis.enviosTelefono === hoy.kpis.envios, 'E: tienda + teléfono = total');
  const { kpisDelivery, filtroDeRango } = require('../electron/handlers/reportes-delivery.helper');
  const { getCotizacionMap } = require('../electron/handlers/dashboard-ventas.handler');
  const ctx = { monPrincipal: gs.id, cotMap: await getCotizacionMap(ds, gs.id), isPg: PG };
  const rep = await kpisDelivery(ds, ctx, filtroDeRango(ds, { desde: new Date(hoy.desde), hasta: new Date(hoy.hasta) }));
  ok(rep.envios === hoy.kpis.envios && rep.facturacionDelivery === hoy.kpis.facturacion && rep.ingresoEnvios === hoy.kpis.envioRecaudado,
    'E: mismos envíos, facturación y envío que Reportes (kpisDelivery)', [rep, hoy.kpis]);
  ok(hoy.kpis.zonasActivas === 5 && hoy.kpis.zonasSinDibujar === 1 && hoy.kpis.zonasSinTarifa === 1 && hoy.kpis.tarifasCompartidas === 1,
    'E: alertas de zonas (sin dibujar, sin tarifa, tarifa compartida)', hoy.kpis);
  ok(hoy.kpis.enviosSinAsignar === 4, 'E: 4 envíos no asignables a una zona', hoy.kpis.enviosSinAsignar);

  // ═══════ [F] Puntos ═══════
  console.log('\n[F] Puntos del mapa');
  ok(hoy.puntos.length === 4, 'F: un punto por venta web cobrada con coordenadas (no retiro, abierta ni mesa)', hoy.puntos);
  ok(hoy.puntos.every((p: any) => Object.keys(p).sort().join() === 'lat,lng,zonaId'), 'F: sólo lat, lng y zona: nada que identifique al cliente', hoy.puntos[0]);
  ok(hoy.puntos.some((p: any) => p.lat === -24.056 && p.lng === -54.306), 'F: coordenadas redondeadas a 3 decimales', hoy.puntos);
  ok(!JSON.stringify(hoy).includes('CLIENTE SECRETO') && !JSON.stringify(hoy).includes('0981000000') && !JSON.stringify(hoy).includes('CALLE PRIVADA'),
    'F: la respuesta no trae nombre, teléfono ni dirección');

  // ═══════ [G] Permisos ═══════
  console.log('\n[G] Permisos');
  actual = cajero;
  const comoCajero: any = await invokeHandler('get-dashboard-zonas-delivery', { rango: 'today' });
  ok(comoCajero.kpis.envios === 9 && comoCajero.puedeConfigurar === false, 'G: con VENTAS_PDV se ve el dashboard, sin acciones de edición');
  let err = '';
  try { await invokeHandler('guardar-zona-delivery', { id: C.id, nombre: 'SUR', precioDeliveryId: T3.id }); } catch (e: any) { err = e.message; }
  ok(/PEDIDOS_ONLINE_CONFIGURAR/.test(err), 'G: editar una zona sigue pidiendo PEDIDOS_ONLINE_CONFIGURAR', err);
  actual = nadie;
  err = '';
  try { await invokeHandler('get-dashboard-zonas-delivery', { rango: 'today' }); } catch (e: any) { err = e.message; }
  ok(/VENTAS_PDV/.test(err), 'G: sin VENTAS_PDV no se ve', err);
  actual = encargado;
  ok(hoy.puedeConfigurar === true, 'G: con CONFIGURAR la pantalla ofrece editar');

  // ═══════ [H] Una tarifa por zona ═══════
  console.log('\n[H] Una tarifa del PdV por zona');
  const usada: any = await invokeHandler('guardar-zona-delivery', { id: C.id, nombre: 'SUR', precioDeliveryId: T1.id });
  ok(usada?.success === false && usada?.error === 'tarifa_en_uso' && usada?.zona === 'CENTRO', 'H: la tarifa de CENTRO no se puede vincular a SUR', usada);
  const libre: any = await invokeHandler('guardar-zona-delivery', { id: C.id, nombre: 'SUR', precioDeliveryId: T3.id });
  ok(libre?.success === true && libre?.zona?.precioDeliveryId === T3.id, 'H: una tarifa libre sí', libre);
  const misma: any = await invokeHandler('guardar-zona-delivery', { id: A.id, nombre: 'CENTRO', precioDeliveryId: T1.id });
  ok(misma?.success === true, 'H: volver a guardar una zona con su propia tarifa no choca consigo misma', misma);
  const tras: any = await invokeHandler('get-dashboard-zonas-delivery', { rango: 'today' });
  ok(tras.filas.find((x: any) => x.nombre === 'SUR').telefono.envios === 1 && !tras.filas.some((x: any) => x.nombre === 'LARGA DISTANCIA · sin zona'),
    'H: al vincular la tarifa, sus deliverys por teléfono pasan a la zona', tras.filas.map((x: any) => `${x.nombre}:${x.envios}`));
  ok(Ez.id > 0 && D.id > 0, 'H: (fixture) las dos zonas de la tarifa compartida existen');

  await cerrar();
  console.log(`\n${TAG} RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
