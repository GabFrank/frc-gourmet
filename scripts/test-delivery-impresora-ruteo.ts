/**
 * E2E — ruteo por dispositivo del ticket de delivery.
 *
 * BUG QUE CUBRE: el ticket de delivery salía **siempre** por la impresora
 * `isDefault`, ignorando `Dispositivo.printerTicket`. `printDeliveryTicketInternal`
 * aceptaba `opts.dispositivoId` y se lo pasaba a `getPrinterByRol`, pero ningún
 * caller de `delivery.handler.ts` lo resolvía (0 usos de `resolveRequestDeviceId`
 * en ese archivo), así que el paso 2 de la resolución —el guardado por
 * `if (opts.dispositivoId && esRolTicket)`— nunca se ejecutaba. En un local con
 * dos cajas, el pedido tomado en una se imprimía en la otra.
 *
 * CÓMO SE VERIFICA SIN IMPRESORA FÍSICA: las dos impresoras del test apuntan a
 * `127.0.0.1` en puertos donde no escucha nadie, así que el intento de imprimir
 * falla con ECONNREFUSED al instante y el resultado trae `errors[0].printerId`
 * — es decir, cuál eligió. Eso es exactamente lo que se quiere afirmar.
 *
 * Uso: npm run test:delivery-impresora
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { printDeliveryTicketInternal, printPagareCpcTicketInternal } from '../electron/handlers/documentos-tickets.handler';
import { installHandlerRegistry, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { registerDeliveryHandlers } from '../electron/handlers/delivery.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-delivery-impresora.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[delivery-impresora] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Printer } = require('../src/app/database/entities/printer.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Venta } = E('ventas/venta.entity');

  const save = async (entity: any, data: any) => await ds.getRepository(entity).save(
    ds.getRepository(entity).create(data),
  ) as any;

  // Dos impresoras: la "global" marcada isDefault y la de la caja 2. Ninguna
  // escucha en su puerto: el intento de imprimir falla al toque.
  const printerDefault: any = await save(Printer, {
    name: 'DEFAULT', type: 'epson', connectionType: 'network',
    address: '127.0.0.1', port: 9199, width: 48, isDefault: true,
  });
  const printerCaja2: any = await save(Printer, {
    name: 'CAJA 2', type: 'epson', connectionType: 'network',
    address: '127.0.0.1', port: 9198, width: 48, isDefault: false,
  });

  const caja2: any = await save(Dispositivo, {
    nombre: 'CAJA 2', activo: true, printerTicket: printerCaja2,
  });
  const cajaSinImpresora: any = await save(Dispositivo, { nombre: 'CAJA 3', activo: true });

  const zona: any = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 10000, activo: true });

  /** Crea un delivery con su venta. `dispositivo` = la caja que originó la venta. */
  async function crear(dispositivo?: any) {
    const delivery: any = await save(Delivery, {
      telefono: '0981000000', direccion: 'CALLE 1', estado: 'ABIERTO',
      modo: 'DELIVERY', precioDelivery: zona, fechaAbierto: new Date(),
    });
    await save(Venta, {
      total: 50000, estado: 'ABIERTA', delivery, costoDelivery: 10000,
      ...(dispositivo ? { dispositivo } : {}),
    });
    return delivery;
  }

  /** Devuelve el id de la impresora que eligió la resolución. */
  async function impresoraElegida(deliveryId: number, opts: any): Promise<number | undefined> {
    const res: any = await printDeliveryTicketInternal(ds, deliveryId, opts);
    // Falla siempre (nadie escucha), pero el error dice qué impresora se usó.
    return res?.errors?.[0]?.printerId ?? res?.printed?.[0]?.printerId;
  }

  console.log('\n[A] El dispositivo del request manda\n');
  {
    const delivery = await crear();
    ok(await impresoraElegida(delivery.id, { dispositivoId: caja2.id }) === printerCaja2.id,
      'A: con dispositivoId, imprime en la impresora de ESA caja (era el bug)');
    ok(await impresoraElegida(delivery.id, {}) === printerDefault.id,
      'A: sin dispositivo ni venta ligada, cae a la isDefault (comportamiento previo intacto)');
  }

  console.log('\n[B] Fallback al dispositivo de la venta\n');
  {
    const delivery = await crear(caja2);
    ok(await impresoraElegida(delivery.id, {}) === printerCaja2.id,
      'B: si el caller no lo pasa, se usa el dispositivo de la venta');
    ok(await impresoraElegida(delivery.id, { dispositivoId: cajaSinImpresora.id }) === printerDefault.id,
      'B: un dispositivo sin printerTicket sigue cayendo a la isDefault');
  }

  console.log('\n[C] Prioridades\n');
  {
    const delivery = await crear(caja2);
    ok(await impresoraElegida(delivery.id, { printerId: printerDefault.id, dispositivoId: caja2.id }) === printerDefault.id,
      'C: un printerId explícito le gana al dispositivo');
  }

  // ── [D] El handler IPC en sí ──────────────────────────────────────────────
  // Lo de arriba prueba la resolución; esto prueba que el handler le pase el
  // dispositivo, que es lo que faltaba: `delivery.handler.ts` no llamaba a
  // `resolveRequestDeviceId` en ningún lado. Se invoca igual que lo hace
  // `/api/rpc`, con el deviceId del request en el contexto.
  console.log('\n[D] delivery-imprimir-ticket resuelve el dispositivo del request\n');
  {
    installHandlerRegistry();
    // El permiso se chequea contra el usuario actual; sin usuario logueado el
    // handler corta antes de imprimir, así que se registra con un
    // `getCurrentUser` que devuelve un admin con todos los permisos.
    const { Usuario } = E('personas/usuario.entity');
    const { Persona } = E('personas/persona.entity');
    const { Permission } = E('personas/permission.entity');
    const { Role } = E('personas/role.entity');
    const { RolePermission } = E('personas/role-permission.entity');
    const { UsuarioRole } = E('personas/usuario-role.entity');

    const persona: any = await save(Persona, { nombre: 'ADMIN TEST' });
    const usuario: any = await save(Usuario, { nickname: 'admin-test', password: 'x', persona, activo: true });
    const rol: any = await save(Role, { descripcion: 'ADMIN TEST', activo: true });
    for (const codigo of ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']) {
      const permiso: any = await save(Permission, { codigo, descripcion: codigo, modulo: 'TEST', activo: true });
      await save(RolePermission, { role: rol, permission: permiso });
    }
    await save(UsuarioRole, { usuario, role: rol, activo: true });

    registerDeliveryHandlers(ds, () => usuario);

    const delivery = await crear();
    const res: any = await invokeHandlerWithContext(
      'delivery-imprimir-ticket', { deviceId: caja2.id }, delivery.id,
    );
    ok(res?.errors?.[0]?.printerId === printerCaja2.id,
      'D: el ticket sale por la impresora de la caja que lo pidió (el bug: salía por la isDefault)',
      res?.errors?.[0]);
  }

  // ── [E] El pagaré de venta a crédito ─────────────────────────────────────
  // MISMO BUG, OTRO CALLER. `cobrar-venta-credito` llamaba a
  // `printPagareCpcTicketInternal` sin dispositivo, y a diferencia de los otros
  // dos builders éste NO tenía fallback a `venta.dispositivo`: se iba derecho a
  // la `isDefault`. El pagaré de una venta cobrada en la terminal de delivery
  // salía por la impresora de la caja principal, y el repartidor se iba sin él.
  //
  // ⚠️ Lo que NO cubre este bloque: que `cobrar-venta-credito` resuelva el
  // dispositivo del request antes del `setImmediate`. La impresión ahí corre
  // desacoplada y su error se traga un `catch`, así que desde afuera no se puede
  // observar qué impresora eligió. Eso va al manual de pruebas. El fallback de
  // acá abajo es lo que igual salva el caso aunque un caller se olvide.
  console.log('\n[E] Pagaré CPC: ruteo por dispositivo\n');
  {
    const { CuentaPorCobrar } = E('financiero/cuenta-por-cobrar.entity');
    const { Cliente } = E('personas/cliente.entity');
    const { Persona } = E('personas/persona.entity');
    const { Moneda } = E('financiero/moneda.entity');

    const personaCli: any = await save(Persona, { nombre: 'CLIENTE PAGARE' });
    const cliente: any = await save(Cliente, { persona: personaCli, activo: true, credito: true });
    const moneda: any = await save(Moneda, {
      nombre: 'GUARANI', simbolo: 'Gs', denominacion: 'PYG', principal: true, activo: true, decimales: 0,
    });

    /** CPC ligada a una venta, con o sin dispositivo en esa venta. */
    async function crearCpc(dispositivo?: any) {
      const venta: any = await save(Venta, {
        total: 50000, estado: 'CONCLUIDA', ...(dispositivo ? { dispositivo } : {}),
      });
      return await save(CuentaPorCobrar, {
        cliente, tipo: 'CREDITO_VENTA', descripcion: 'TEST', montoTotal: 50000,
        montoCobrado: 0, moneda, fechaInicio: new Date(), cantidadCuotas: 1,
        estado: 'ACTIVO', ventaId: venta.id,
      });
    }

    async function impresoraPagare(cpcId: number, opts: any): Promise<number | undefined> {
      const res: any = await printPagareCpcTicketInternal(ds, cpcId, opts);
      return res?.errors?.[0]?.printerId ?? res?.printed?.[0]?.printerId;
    }

    const cpcConDisp = await crearCpc(caja2);
    ok(await impresoraPagare(cpcConDisp.id, {}) === printerCaja2.id,
      'E: sin opts, el pagaré cae al dispositivo de la venta (ERA EL BUG: iba a la isDefault)');
    ok(await impresoraPagare(cpcConDisp.id, { dispositivoId: cajaSinImpresora.id }) === printerDefault.id,
      'E: un dispositivo sin printerTicket sigue cayendo a la isDefault');
    ok(await impresoraPagare(cpcConDisp.id, { printerId: printerDefault.id }) === printerDefault.id,
      'E: un printerId explícito le gana al dispositivo de la venta');

    const cpcSinDisp = await crearCpc();
    ok(await impresoraPagare(cpcSinDisp.id, {}) === printerDefault.id,
      'E: venta sin dispositivo → isDefault (comportamiento previo intacto)');
    ok(await impresoraPagare(cpcSinDisp.id, { dispositivoId: caja2.id }) === printerCaja2.id,
      'E: el dispositivo del request manda sobre una venta que no lo tiene');

    // Borde: una CPC cuya venta no existe (dato viejo o borrado) no debe romper
    // la impresión — el pagaré tiene que salir igual, por la default.
    const cpcHuerfana: any = await save(CuentaPorCobrar, {
      cliente, tipo: 'CREDITO_VENTA', descripcion: 'HUERFANA', montoTotal: 1000,
      montoCobrado: 0, moneda, fechaInicio: new Date(), cantidadCuotas: 1,
      estado: 'ACTIVO', ventaId: 999999,
    });
    ok(await impresoraPagare(cpcHuerfana.id, {}) === printerDefault.id,
      'E: una CPC cuya venta no existe no rompe la impresión');
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} delivery-impresora: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
