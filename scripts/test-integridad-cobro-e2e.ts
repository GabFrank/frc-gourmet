/**
 * E2E: integridad de las líneas de pago de una venta.
 *
 * Fija los invariantes que impiden que, desde `/api/rpc`, se pueda mover o
 * borrar plata de la caja de otro:
 *
 *  - una ronda de cobro parcial sólo puede taguear líneas de SU propio pago,
 *  - una ronda sólo se anula mientras la venta sigue abierta,
 *  - una línea imputada a una ronda no se borra suelta,
 *  - `updatePago` no puede reasignar la caja (era lo único que leía el gate),
 *  - `updateVenta` no puede mover la venta de caja,
 *  - `update-caja` no puede reasignar el dispositivo dueño,
 *  - editar/borrar líneas de una venta pasa por el gate de terminal, sin flag.
 *
 * Uso: npm run test:integridad-cobro
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerComprasHandlers } from '../electron/handlers/compras.handler';
import { registerFinancieroHandlers } from '../electron/handlers/financiero.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function rechaza(codigo: string, nombre: string, fn: () => Promise<any>) {
  try { await fn(); ok(false, nombre, 'no lanzó'); }
  catch (e: any) { ok(String(e?.message || e).includes(codigo), nombre, String(e?.message || e)); }
}
async function permite(nombre: string, fn: () => Promise<any>): Promise<any> {
  try { const r = await fn(); ok(true, nombre); return r; }
  catch (e: any) { ok(false, nombre, String(e?.message || e)); return null; }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-integridad-cobro.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[integridad-cobro] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { Compra } = E('compras/compra.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { Producto } = E('productos/producto.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const user: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'CAJERO', activo: true });
  for (const codigo of ['VENTAS_PDV', 'VENTAS_COBRAR', 'COMPRAS_GESTIONAR', 'FINANCIERO_CAJA_OPERAR']) {
    const perm: any = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role: rol, permission: perm });
  }
  await save(UsuarioRole, { usuario: user, role: rol });

  const gs: any = await save(Moneda, {
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
  });
  const fp: any = await save(FormasPago, { nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true });
  const producto: any = await save(Producto, { nombre: 'PIZZA', tipo: 'RETAIL', activo: true });

  const term1: any = await save(Dispositivo, { nombre: 'TERMINAL 1', activo: true });
  const term2: any = await save(Dispositivo, { nombre: 'TERMINAL 2', activo: true });

  registerVentasHandlers(ds, () => user);
  registerComprasHandlers(ds, () => user);
  registerFinancieroHandlers(ds, () => user);

  const nuevaCaja = async (dispositivoId: number): Promise<any> => {
    const c: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
    return await save(Caja, {
      estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
      dispositivo: { id: dispositivoId }, conteoApertura: { id: c.id },
    });
  };
  /** Venta ABIERTA con un ítem, su Pago y una línea de cobro. */
  const nuevaVentaConPago = async (cajaId: number, monto: number) => {
    const venta: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaId } });
    const item: any = await save(VentaItem, {
      venta: { id: venta.id }, producto: { id: producto.id }, cantidad: 1,
      precioVentaUnitario: monto, precioCostoUnitario: 0, precioAdicionales: 0,
      descuentoUnitario: 0, estado: 'ACTIVO',
    });
    const pago: any = await save(Pago, { estado: 'ABIERTO', activo: true, caja: { id: cajaId } });
    await ds.getRepository(Venta).update(venta.id, { pago: { id: pago.id } } as any);
    const linea: any = await save(PagoDetalle, {
      valor: monto, descripcion: 'COBRO DE VENTA', tipo: 'PAGO',
      pago: { id: pago.id }, moneda: { id: gs.id }, formaPago: { id: fp.id }, activo: true,
    });
    return { venta, item, pago, linea };
  };
  const comoTerminal = (deviceId: number | null, canal: string, ...args: any[]) =>
    invokeHandlerWithContext(canal, deviceId == null ? undefined : { deviceId }, ...args);

  const caja1 = await nuevaCaja(term1.id);

  // ── 1. Una ronda no puede taguear líneas de otra venta ────────────────────
  console.log('\n[1] Cobro parcial: sólo líneas del propio pago');
  {
    const mia = await nuevaVentaConPago(caja1.id, 100000);
    const ajena = await nuevaVentaConPago(caja1.id, 80000);

    await rechaza('PAGO_DETALLE_AJENO', 'rechaza ids de líneas de otra venta',
      () => invokeHandler('registrarCobroParcial', mia.venta.id, {
        imputaciones: [{ ventaItemId: mia.item.id, brutoCubierto: 50000 }],
        pagoDetalleIds: [ajena.linea.id],
        cashTotalPrincipal: 50000, factorAplicado: 1,
      }));

    const sigueViva: any = await ds.getRepository(PagoDetalle).findOneBy({ id: ajena.linea.id });
    ok(sigueViva?.activo === true && sigueViva?.cobroParcialId == null,
      'la línea ajena quedó intacta', { activo: sigueViva?.activo, ronda: sigueViva?.cobroParcialId });

    await rechaza('PAGO_DETALLE_AJENO', 'rechaza también si mezcla una propia con una ajena',
      () => invokeHandler('registrarCobroParcial', mia.venta.id, {
        imputaciones: [{ ventaItemId: mia.item.id, brutoCubierto: 50000 }],
        pagoDetalleIds: [mia.linea.id, ajena.linea.id],
        cashTotalPrincipal: 50000, factorAplicado: 1,
      }));

    const ronda = await permite('acepta las líneas propias',
      () => invokeHandler('registrarCobroParcial', mia.venta.id, {
        imputaciones: [{ ventaItemId: mia.item.id, brutoCubierto: 50000 }],
        pagoDetalleIds: [mia.linea.id],
        cashTotalPrincipal: 50000, factorAplicado: 1,
      }));
    ok(!!ronda, 'la ronda se registró');

    // ── 2. La línea imputada no se borra suelta ────────────────────────────
    console.log('\n[2] Una línea imputada a una ronda no se borra suelta');
    await rechaza('PAGO_DETALLE_EN_COBRO_PARCIAL', 'deletePagoDetalle la rechaza',
      () => invokeHandler('deletePagoDetalle', mia.linea.id));
    const tras: any = await ds.getRepository(PagoDetalle).findOneBy({ id: mia.linea.id });
    ok(!!tras, 'la línea sigue existiendo');

    // ── 3. Anular una ronda exige venta abierta ────────────────────────────
    console.log('\n[3] Anular una ronda exige la venta abierta');
    await ds.getRepository(Venta).update(mia.venta.id, { estado: 'CONCLUIDA' } as any);
    const rondaId = (await ds.query(`SELECT id FROM cobros_parciales ORDER BY id DESC LIMIT 1`))?.[0]?.id;
    await rechaza('COBRO_PARCIAL_VENTA_NO_ABIERTA', 'no se anula sobre una venta ya cerrada',
      () => invokeHandler('anularCobroParcial', rondaId));
    const lineaTrasIntento: any = await ds.getRepository(PagoDetalle).findOneBy({ id: mia.linea.id });
    ok(lineaTrasIntento?.activo === true, 'la plata sigue en el arqueo');

    await ds.getRepository(Venta).update(mia.venta.id, { estado: 'ABIERTA' } as any);
    await permite('con la venta abierta sí se anula', () => invokeHandler('anularCobroParcial', rondaId));
  }

  // ── 4. La caja de un Pago no se reasigna ──────────────────────────────────
  console.log('\n[4] updatePago no puede mover el pago de caja');
  {
    const v = await nuevaVentaConPago(caja1.id, 50000);
    await permite('updatePago cambia el estado normalmente',
      () => invokeHandler('updatePago', v.pago.id, { estado: 'PAGADO' }));
    await invokeHandler('updatePago', v.pago.id, { caja: null });
    const pagoTras: any = await ds.getRepository(Pago).findOne({ where: { id: v.pago.id }, relations: ['caja'] });
    ok((pagoTras?.caja as any)?.id === caja1.id, 'la caja del pago no cambió', (pagoTras?.caja as any)?.id);
  }

  // ── 5. La caja de una Venta no se reasigna ────────────────────────────────
  console.log('\n[5] updateVenta no puede mover la venta de caja');
  {
    const caja2 = await nuevaCaja(term2.id);
    const v = await nuevaVentaConPago(caja1.id, 70000);
    await invokeHandler('updateVenta', v.venta.id, { caja: { id: caja2.id } });
    const tras: any = await ds.getRepository(Venta).findOne({ where: { id: v.venta.id }, relations: ['caja'] });
    ok((tras?.caja as any)?.id === caja1.id, 'la venta sigue en su caja original', (tras?.caja as any)?.id);
  }

  // ── 6. El dispositivo dueño de la caja no se reasigna ─────────────────────
  console.log('\n[6] update-caja no puede apropiarse de la caja');
  {
    const caja = await nuevaCaja(term1.id);
    await invokeHandler('update-caja', caja.id, { dispositivo: { id: term2.id } });
    const tras: any = await ds.getRepository(Caja).findOne({ where: { id: caja.id }, relations: ['dispositivo'] });
    ok((tras?.dispositivo as any)?.id === term1.id, 'la caja sigue siendo de su terminal', (tras?.dispositivo as any)?.id);
  }

  // ── 7. Editar/borrar líneas pasa por el gate, sin flag ────────────────────
  console.log('\n[7] Gate derivado en las mutaciones de líneas');
  {
    const v = await nuevaVentaConPago(caja1.id, 90000);
    // Terminal 2 no es la dueña de caja1 y los flags están en false (no hay
    // fila de PdvConfig, que es justamente el default).
    await rechaza('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO', 'una terminal ajena no edita la línea',
      () => comoTerminal(term2.id, 'updatePagoDetalle', v.linea.id, { valor: 1 }));
    await rechaza('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO', 'ni la borra',
      () => comoTerminal(term2.id, 'deletePagoDetalle', v.linea.id));
    await rechaza('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO', 'ni borra el pago entero',
      () => comoTerminal(term2.id, 'deletePago', v.pago.id));

    const intacta: any = await ds.getRepository(PagoDetalle).findOneBy({ id: v.linea.id });
    ok(Number(intacta?.valor) === 90000, 'el valor de la línea no cambió', intacta?.valor);

    await permite('la terminal dueña sí puede editarla',
      () => comoTerminal(term1.id, 'updatePagoDetalle', v.linea.id, { valor: 95000 }));
  }

  // ── 8. Los pagos de compra quedan fuera del gate ──────────────────────────
  console.log('\n[8] Compras: el gate no aplica');
  {
    const pagoCompra: any = await save(Pago, { estado: 'ABIERTO', activo: true, caja: { id: caja1.id } });
    await save(Compra, { pago: { id: pagoCompra.id }, activo: true, estado: 'ABIERTO' });
    const linea: any = await save(PagoDetalle, {
      valor: 30000, descripcion: 'PAGO COMPRA', tipo: 'PAGO',
      pago: { id: pagoCompra.id }, moneda: { id: gs.id }, formaPago: { id: fp.id }, activo: true,
    });
    await permite('una terminal ajena edita un pago de compra sin problema',
      () => comoTerminal(term2.id, 'updatePagoDetalle', linea.id, { valor: 31000 }));
  }

  // ── 9. Un Pago huérfano tampoco se gatea ──────────────────────────────────
  console.log('\n[9] Pago huérfano (ventana de creación en compras)');
  {
    const huerfano: any = await save(Pago, { estado: 'ABIERTO', activo: true, caja: { id: caja1.id } });
    const linea: any = await save(PagoDetalle, {
      valor: 10000, descripcion: 'X', tipo: 'PAGO',
      pago: { id: huerfano.id }, moneda: { id: gs.id }, formaPago: { id: fp.id }, activo: true,
    });
    await permite('sin venta que lo reclame, el gate no aplica',
      () => comoTerminal(term2.id, 'updatePagoDetalle', linea.id, { valor: 11000 }));
  }

  console.log(`\n[integridad-cobro] ${passed} OK, ${failed} fallidos`);
  await ds.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
