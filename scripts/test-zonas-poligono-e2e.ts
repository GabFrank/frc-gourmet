/**
 * E2E de las zonas de delivery dibujadas en el mapa.
 *
 * Lo que se verifica no es "el polígono se guarda" sino que **el servidor sea
 * quien decide el costo**. Antes el envío salía de un `zonaDeliveryId` que
 * mandaba el cliente; como el checkout nunca lo mandaba, el envío quedaba
 * siempre en 0, y si lo hubiera mandado habría podido elegir la zona barata.
 *
 * Cubre: resolución por punto, desempate determinístico entre zonas
 * superpuestas, agujeros, fuera de cobertura, y que la tarifa salga del precio
 * compartido con el delivery del PdV y no de una tabla paralela.
 *
 * Uso: npm run test:zonas-poligono
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler, installHandlerRegistry } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { puntoEnGeometria, resolverZonaPorPunto } from '../electron/utils/geo.utils';
import { registerPedidosOnlinePedidosHandlers } from '../electron/handlers/pedidos-online-pedidos.handler';
import { registerPedidosOnlineAdminHandlers } from '../electron/handlers/pedidos-online-admin.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Cuadrado GeoJSON, en orden [lng, lat]. */
const cuadrado = (lngMin: number, latMin: number, lngMax: number, latMax: number) => JSON.stringify({
  type: 'Polygon',
  coordinates: [[
    [lngMin, latMin], [lngMax, latMin], [lngMax, latMax], [lngMin, latMax], [lngMin, latMin],
  ]],
});

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-zonas-poligono.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[zonas] Migraciones OK.');

  // ── 1 · Geometría pura, sin BD ──────────────────────────────────────────
  console.log('\n[1] Point-in-polygon');
  const centro = cuadrado(-54.32, -24.07, -54.30, -24.05);
  ok(puntoEnGeometria(-24.06, -54.31, centro), 'un punto adentro cae adentro');
  ok(!puntoEnGeometria(-24.10, -54.31, centro), 'un punto al sur queda afuera');
  ok(!puntoEnGeometria(-24.06, -54.40, centro), 'un punto al oeste queda afuera');

  // El orden GeoJSON es [lng, lat]: invertirlo es el error clásico y tiene que
  // dar "afuera", no un falso positivo.
  ok(!puntoEnGeometria(-54.31, -24.06, centro), 'invertir lat/lng no da un falso positivo');

  const conAgujero = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [[-54.32, -24.07], [-54.30, -24.07], [-54.30, -24.05], [-54.32, -24.05], [-54.32, -24.07]],
      [[-54.315, -24.065], [-54.305, -24.065], [-54.305, -24.055], [-54.315, -24.055], [-54.315, -24.065]],
    ],
  });
  ok(!puntoEnGeometria(-24.06, -54.31, conAgujero), 'un punto en el agujero queda afuera');
  ok(puntoEnGeometria(-24.068, -54.318, conAgujero), 'un punto entre contorno y agujero queda adentro');

  ok(!puntoEnGeometria(-24.06, -54.31, 'no es json'), 'un polígono roto no explota, devuelve false');

  console.log('\n[2] Desempate entre zonas superpuestas');
  const zonas = [
    { id: 2, orden: 5, poligono: cuadrado(-54.33, -24.08, -54.29, -24.04) },
    { id: 1, orden: 1, poligono: cuadrado(-54.32, -24.07, -54.30, -24.05) },
  ];
  const elegida = resolverZonaPorPunto(-24.06, -54.31, zonas);
  ok(elegida?.id === 1, 'gana la de menor orden, no la primera de la lista', elegida?.id);
  const soloGrande = resolverZonaPorPunto(-24.075, -54.325, zonas);
  ok(soloGrande?.id === 2, 'un punto que sólo entra en la grande resuelve a la grande', soloGrande?.id);
  ok(resolverZonaPorPunto(-24.20, -54.31, zonas) === null, 'fuera de todas devuelve null');

  // ── 3 · Contra la BD, por la op pública ─────────────────────────────────
  console.log('\n[3] Cotización pública');
  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, data: any) => R(e).save(R(e).create(data));

  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { ZonaDelivery } = E('pedidos-online/zona-delivery.entity');

  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const codigo of ['VENTAS_PDV', 'PEDIDOS_ONLINE_CONFIGURAR']) {
    const permiso = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role, permission: permiso });
  }
  await save(UsuarioRole, { usuario: admin, role });

  installHandlerRegistry();
  registerPedidosOnlinePedidosHandlers(ds);
  registerPedidosOnlineAdminHandlers(ds, () => admin);

  // La tarifa vive en la tabla del PdV; la zona sólo la referencia.
  const precioCentro = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 15000, activo: true });
  await save(ZonaDelivery, {
    nombre: 'CENTRO', tarifa: 999, montoMinimo: 30000, activa: true, orden: 1,
    poligono: cuadrado(-54.32, -24.07, -54.30, -24.05), precioDelivery: precioCentro,
  });
  // Zona vieja, sin precio compartido: cae al fallback de `tarifa`.
  await save(ZonaDelivery, {
    nombre: 'PERIFERIA', tarifa: 25000, montoMinimo: 0, activa: true, orden: 9,
    poligono: cuadrado(-54.36, -24.11, -54.26, -24.01),
  });

  const q1: any = await invokeHandler('cotizar-envio-online', -24.06, -54.31);
  ok(q1?.cubierto === true, 'un punto del centro está cubierto', q1);
  ok(q1?.costoEnvio === 15000, 'la tarifa sale del precio compartido, no del campo tarifa', q1?.costoEnvio);
  ok(q1?.zona?.nombre === 'CENTRO', 'resuelve la zona correcta', q1?.zona);
  ok(q1?.montoMinimo === 30000, 'devuelve el monto mínimo de la zona', q1?.montoMinimo);

  const q2: any = await invokeHandler('cotizar-envio-online', -24.10, -54.34);
  ok(q2?.cubierto === true && q2?.costoEnvio === 25000,
     'una zona sin precio compartido usa tarifa como fallback', q2);

  const q3: any = await invokeHandler('cotizar-envio-online', -25.30, -57.60);
  ok(q3?.success === true && q3?.cubierto === false,
     'Asunción queda fuera de cobertura, y eso no es un error', q3);

  const q4: any = await invokeHandler('cotizar-envio-online', 'x' as any, -54.31);
  ok(q4?.success === false && q4?.error === 'coordenadas_invalidas', 'coordenadas basura se rechazan', q4);

  // ── 4 · Guardado del polígono desde la config ───────────────────────────
  console.log('\n[4] Guardar zonas desde la configuración');
  const malo: any = await invokeHandler('guardar-zona-delivery', {
    nombre: 'ROTA', tarifa: 1000, poligono: '{no es json',
  });
  ok(malo?.success === false && malo?.error === 'poligono_invalido',
     'un GeoJSON roto se rechaza al guardar (si no, la zona quedaría muda)', malo);

  const noArea: any = await invokeHandler('guardar-zona-delivery', {
    nombre: 'PUNTO', tarifa: 1000, poligono: JSON.stringify({ type: 'Point', coordinates: [-54.3, -24.0] }),
  });
  ok(noArea?.success === false, 'una geometría que no es de área se rechaza', noArea);

  const bien: any = await invokeHandler('guardar-zona-delivery', {
    nombre: 'nueva zona', tarifa: 5000, montoMinimo: 0, orden: 3,
    poligono: cuadrado(-54.40, -24.20, -54.38, -24.18),
  });
  ok(bien?.success === true, 'un polígono válido se guarda', bien?.error);
  ok(bien?.zona?.nombre === 'NUEVA ZONA', 'el nombre va en UPPERCASE', bien?.zona?.nombre);
  ok(!!bien?.zona?.poligono, 'la respuesta devuelve el polígono');

  const listado: any = await invokeHandler('get-zonas-delivery-admin');
  ok(Array.isArray(listado) && listado.every((z: any) => 'poligono' in z),
     'el listado incluye el polígono de cada zona');

  await ds.destroy();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
