/**
 * E2E: transferencia de cuentas del PdV entre mesas y comandas.
 *
 * Cubre las 8 celdas de la matriz (mesa/comanda como origen y destino, completa
 * y por items) mas las reglas de dinero: nunca se mueve un item ya cobrado, y no
 * se fusionan dos cuentas abiertas cuando el origen tiene cobros parciales.
 *
 * Uso: npm run test:transferencia-pdv
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-transferencia-pdv.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[transferencia-pdv] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Comanda } = E('ventas/comanda.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { Venta } = E('ventas/venta.entity');
  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // El mozo solo tiene VENTAS_PDV: es el perfil mas restringido que debe poder
  // transferir una mesa. Si el handler pidiera un permiso de configuracion, todo
  // este test falla — que es exactamente el bug que arreglamos en las mesas.
  const mozo: any = await save(Usuario, { nickname: 'mozo', password: 'x', activo: true });
  const rolMozo: any = await save(Role, { descripcion: 'MOZO', activo: true });
  const permPdv: any = await save(Permission, { codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true });
  await save(RolePermission, { role: rolMozo, permission: permPdv });
  await save(UsuarioRole, { usuario: mozo, role: rolMozo });
  const sinPermiso: any = await save(Usuario, { nickname: 'curioso', password: 'x', activo: true });

  let usuarioActual: any = mozo;
  registerVentasHandlers(ds, () => usuarioActual);

  let seqMesa = 0, seqComanda = 0;
  const nuevaMesa = async (): Promise<any> =>
    await save(PdvMesa, { numero: ++seqMesa, estado: 'DISPONIBLE', activo: true, reservado: false });
  const nuevaComanda = async (mesaId?: number): Promise<any> => {
    const n = ++seqComanda;
    return await save(Comanda, {
      codigo: `C-${n}`, numero: n, estado: 'DISPONIBLE', activo: true,
      ...(mesaId ? { pdv_mesa: { id: mesaId } } : {}),
    });
  };
  const abrirVentaMesa = async (mesaId: number): Promise<any> =>
    await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesaId } });
  const abrirVentaComanda = async (comandaId: number, mesaId?: number): Promise<any> => {
    await ds.query(`UPDATE comandas SET estado = 'OCUPADO' WHERE id = ${comandaId}`);
    return await invokeHandler('createVenta', {
      estado: 'ABIERTA', comanda: { id: comandaId }, ...(mesaId ? { mesa: { id: mesaId } } : {}),
    });
  };
  const agregarItem = async (ventaId: number, precio = 10000): Promise<any> =>
    await save(VentaItem, {
      venta: { id: ventaId }, cantidad: 1, precioCostoUnitario: 0,
      precioVentaUnitario: precio, estado: 'ACTIVO', montoCubierto: 0,
    });
  const ventaDelItem = async (itemId: number): Promise<number> =>
    (await ds.query(`SELECT venta_id AS v FROM venta_items WHERE id = ${itemId}`))[0].v;
  const estadoMesa = async (id: number) => (await ds.getRepository(PdvMesa).findOneBy({ id } as any))!.estado;
  const estadoComanda = async (id: number) => (await ds.getRepository(Comanda).findOneBy({ id } as any))!.estado;
  const estadoVenta = async (id: number) => (await ds.getRepository(Venta).findOneBy({ id } as any))!.estado;
  const activosDe = async (ventaId: number): Promise<number> =>
    (await ds.query(`SELECT COUNT(*) AS c FROM venta_items WHERE venta_id = ${ventaId} AND estado = 'ACTIVO'`))[0].c;
  const transferir = (payload: any) => invokeHandler('transferir-venta-pdv', payload);

  // ═══════ [1] mesa completa → mesa libre ═══════
  console.log('\n[1] Mesa completa a una mesa libre (re-apunte)');
  {
    const origen = await nuevaMesa(); const destino = await nuevaMesa();
    const venta = await abrirVentaMesa(origen.id);
    const item = await agregarItem(venta.id);
    const r: any = await transferir({
      origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
    });
    ok(r.reapunte === true, '1: es re-apunte, no fusion', r);
    ok(r.ventaDestinoId === venta.id, '1: la venta es la misma, cambio de mesa', r.ventaDestinoId);
    ok(await ventaDelItem(item.id) === venta.id, '1: el item viajo con su venta');
    ok(await estadoMesa(origen.id) === 'DISPONIBLE', '1: la mesa origen quedo libre', await estadoMesa(origen.id));
    ok(await estadoMesa(destino.id) === 'OCUPADO', '1: la mesa destino quedo ocupada', await estadoMesa(destino.id));
    ok(await estadoVenta(venta.id) === 'ABIERTA', '1: la venta sigue abierta');
  }

  // ═══════ [2] mesa completa → mesa con venta abierta ═══════
  console.log('\n[2] Mesa completa a una mesa que ya tiene cuenta (fusion)');
  {
    const origen = await nuevaMesa(); const destino = await nuevaMesa();
    const vOrigen = await abrirVentaMesa(origen.id);
    const vDestino = await abrirVentaMesa(destino.id);
    const item = await agregarItem(vOrigen.id);
    await agregarItem(vDestino.id);
    const r: any = await transferir({
      origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
    });
    ok(r.reapunte === false, '2: es fusion', r);
    ok(r.ventaDestinoId === vDestino.id, '2: los items van a la cuenta que ya existia');
    ok(await ventaDelItem(item.id) === vDestino.id, '2: el item cambio de venta');
    ok(await activosDe(vDestino.id) === 2, '2: la cuenta destino junta los dos items', await activosDe(vDestino.id));
    ok(await estadoVenta(vOrigen.id) === 'CANCELADA', '2: la venta origen se cancela');
    ok(await estadoMesa(origen.id) === 'DISPONIBLE', '2: la mesa origen quedo libre');
  }

  // ═══════ [3] mesa ítems → mesa ═══════
  console.log('\n[3] Solo algunos items de mesa a mesa');
  {
    const origen = await nuevaMesa(); const destino = await nuevaMesa();
    const vOrigen = await abrirVentaMesa(origen.id);
    const mover = await agregarItem(vOrigen.id);
    const queda = await agregarItem(vOrigen.id);
    const r: any = await transferir({
      origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
      alcance: 'ITEMS', itemIds: [mover.id],
    });
    ok(r.itemsMovidos === 1, '3: movio un solo item', r.itemsMovidos);
    ok(await ventaDelItem(mover.id) === r.ventaDestinoId, '3: el item seleccionado se movio');
    ok(await ventaDelItem(queda.id) === vOrigen.id, '3: el otro se quedo');
    ok(await estadoVenta(vOrigen.id) === 'ABIERTA', '3: la cuenta origen sigue viva');
    ok(await estadoMesa(origen.id) === 'OCUPADO', '3: la mesa origen sigue ocupada');
    ok(await estadoMesa(destino.id) === 'OCUPADO', '3: la mesa destino se ocupo');
  }

  // ═══════ [4] mesa ítems → comanda libre ═══════
  console.log('\n[4] Items de mesa a una comanda libre (lo que faltaba)');
  {
    const origen = await nuevaMesa(); const comanda = await nuevaComanda();
    const vOrigen = await abrirVentaMesa(origen.id);
    const mover = await agregarItem(vOrigen.id);
    await agregarItem(vOrigen.id);
    const r: any = await transferir({
      origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'COMANDA', id: comanda.id },
      alcance: 'ITEMS', itemIds: [mover.id],
    });
    ok(await estadoComanda(comanda.id) === 'OCUPADO', '4: la comanda se abrio sola', await estadoComanda(comanda.id));
    const cm = (await ds.query(`SELECT pdv_mesa_id AS m FROM comandas WHERE id = ${comanda.id}`))[0].m;
    ok(Number(cm) === Number(origen.id), '4: la comanda quedo vinculada a la mesa de origen', cm);
    ok(await ventaDelItem(mover.id) === r.ventaDestinoId, '4: el item esta en la cuenta de la comanda');
    ok(await estadoMesa(origen.id) === 'OCUPADO', '4: la mesa sigue ocupada, todavia le quedan items');
  }

  // ═══════ [5] comanda completa → mesa libre ═══════
  console.log('\n[5] Comanda completa a una mesa libre');
  {
    const comanda = await nuevaComanda(); const destino = await nuevaMesa();
    const venta = await abrirVentaComanda(comanda.id);
    const item = await agregarItem(venta.id);
    const r: any = await transferir({
      origen: { tipo: 'COMANDA', id: comanda.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
    });
    ok(r.reapunte === true, '5: re-apunte');
    ok(await ventaDelItem(item.id) === venta.id, '5: el item viajo con la venta');
    const cid = (await ds.query(`SELECT comanda_id AS c FROM ventas WHERE id = ${venta.id}`))[0].c;
    ok(cid === null, '5: la venta ya no cuelga de la comanda', cid);
    ok(await estadoComanda(comanda.id) === 'DISPONIBLE', '5: la comanda quedo libre');
    ok(await estadoMesa(destino.id) === 'OCUPADO', '5: la mesa destino se ocupo');
  }

  // ═══════ [6] comanda completa → comanda libre ═══════
  console.log('\n[6] Comanda completa a otra comanda libre');
  {
    const mesa = await nuevaMesa();
    const origen = await nuevaComanda(mesa.id); const destino = await nuevaComanda();
    const venta = await abrirVentaComanda(origen.id, mesa.id);
    const item = await agregarItem(venta.id);
    await transferir({
      origen: { tipo: 'COMANDA', id: origen.id }, destino: { tipo: 'COMANDA', id: destino.id }, alcance: 'COMPLETA',
    });
    ok(await estadoComanda(origen.id) === 'DISPONIBLE', '6: la comanda origen quedo libre');
    ok(await estadoComanda(destino.id) === 'OCUPADO', '6: la comanda destino se abrio');
    const cid = (await ds.query(`SELECT comanda_id AS c FROM ventas WHERE id = ${venta.id}`))[0].c;
    ok(Number(cid) === Number(destino.id), '6: la venta cuelga de la comanda destino', cid);
    ok(await ventaDelItem(item.id) === venta.id, '6: el item viajo con la venta');
  }

  // ═══════ [7] comanda ítems → comanda ocupada ═══════
  console.log('\n[7] Dividir una comanda en dos');
  {
    const origen = await nuevaComanda(); const destino = await nuevaComanda();
    const vOrigen = await abrirVentaComanda(origen.id);
    const vDestino = await abrirVentaComanda(destino.id);
    const mover = await agregarItem(vOrigen.id);
    const queda = await agregarItem(vOrigen.id);
    const r: any = await transferir({
      origen: { tipo: 'COMANDA', id: origen.id }, destino: { tipo: 'COMANDA', id: destino.id },
      alcance: 'ITEMS', itemIds: [mover.id],
    });
    ok(r.ventaDestinoId === vDestino.id, '7: fue a la cuenta que ya tenia la comanda destino');
    ok(await ventaDelItem(mover.id) === vDestino.id, '7: el item se movio');
    ok(await ventaDelItem(queda.id) === vOrigen.id, '7: el otro se quedo');
    ok(await estadoComanda(origen.id) === 'OCUPADO', '7: la comanda origen sigue ocupada');
  }

  // ═══════ [8] comanda ítems → mesa, vaciando el origen ═══════
  console.log('\n[8] Todos los items de una comanda a una mesa');
  {
    const origen = await nuevaComanda(); const destino = await nuevaMesa();
    const vOrigen = await abrirVentaComanda(origen.id);
    const a = await agregarItem(vOrigen.id); const b = await agregarItem(vOrigen.id);
    const r: any = await transferir({
      origen: { tipo: 'COMANDA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
      alcance: 'ITEMS', itemIds: [a.id, b.id],
    });
    ok(r.itemsMovidos === 2, '8: movio los dos items');
    ok(r.origenCerrado === true, '8: la cuenta origen se cerro al quedar vacia', r);
    ok(await estadoVenta(vOrigen.id) === 'CANCELADA', '8: la venta origen quedo cancelada');
    ok(await estadoComanda(origen.id) === 'DISPONIBLE', '8: la comanda se libero sola');
    ok(await estadoMesa(destino.id) === 'OCUPADO', '8: la mesa destino se ocupo');
  }

  // ═══════ [8b] COMPLETA a comanda: la cuenta SE VA de la mesa ═══════
  // Cambio de semantica 2026-08-22. Antes la comanda destino heredaba la mesa de
  // origen siempre, tambien en COMPLETA: la mesa quedaba OCUPADO, sin cuenta
  // propia y sin forma de atenderla ni liberarla.
  console.log('\n[8b] Mesa completa a una comanda libre');
  {
    const mesa = await nuevaMesa(); const comanda = await nuevaComanda();
    const venta = await abrirVentaMesa(mesa.id);
    await agregarItem(venta.id);

    await transferir({
      origen: { tipo: 'MESA', id: mesa.id }, destino: { tipo: 'COMANDA', id: comanda.id }, alcance: 'COMPLETA',
    });

    const cm = (await ds.query(`SELECT pdv_mesa_id AS m FROM comandas WHERE id = ${comanda.id}`))[0].m;
    ok(cm === null, '8b: la comanda NO hereda la mesa en una transferencia completa', cm);
    ok(await estadoComanda(comanda.id) === 'OCUPADO', '8b: la comanda se abrio igual');
    ok(await estadoMesa(mesa.id) === 'DISPONIBLE', '8b: la mesa origen quedo libre', await estadoMesa(mesa.id));
    const vm = (await ds.query(`SELECT mesa_id AS m FROM ventas WHERE id = ${venta.id}`))[0].m;
    ok(vm === null, '8b: la venta tampoco conserva la mesa', vm);
  }

  // ═══════ [8c] ITEMS a comanda: es dividir la cuenta EN la mesa ═══════
  console.log('\n[8c] Solo items de mesa a una comanda libre');
  {
    const mesa = await nuevaMesa(); const comanda = await nuevaComanda();
    const venta = await abrirVentaMesa(mesa.id);
    const mover = await agregarItem(venta.id);
    await agregarItem(venta.id);

    await transferir({
      origen: { tipo: 'MESA', id: mesa.id }, destino: { tipo: 'COMANDA', id: comanda.id },
      alcance: 'ITEMS', itemIds: [mover.id],
    });

    const cm = (await ds.query(`SELECT pdv_mesa_id AS m FROM comandas WHERE id = ${comanda.id}`))[0].m;
    ok(Number(cm) === Number(mesa.id), '8c: la comanda SI hereda la mesa cuando es por items', cm);
    ok(await estadoMesa(mesa.id) === 'OCUPADO', '8c: la mesa sigue ocupada, le queda su cuenta');
  }

  // ═══════ [8d] Una comanda encima no mantiene ocupada a la mesa ═══════
  console.log('\n[8d] La mesa se libera aunque le quede una comanda');
  {
    const mesa = await nuevaMesa(); const comanda = await nuevaComanda(mesa.id);
    await abrirVentaComanda(comanda.id, mesa.id);
    const ventaMesa = await abrirVentaMesa(mesa.id);
    const item = await agregarItem(ventaMesa.id);
    const destino = await nuevaMesa();

    ok(await estadoMesa(mesa.id) === 'OCUPADO', '8d: arranca ocupada por su cuenta propia');
    await transferir({
      origen: { tipo: 'MESA', id: mesa.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
    });
    ok(await estadoMesa(mesa.id) === 'DISPONIBLE',
      '8d: al irse su cuenta queda libre, aunque la comanda siga sentada ahi', await estadoMesa(mesa.id));
    ok(await estadoComanda(comanda.id) === 'OCUPADO', '8d: la comanda no se toco');
    ok(await ventaDelItem(item.id) === ventaMesa.id, '8d: el item viajo con su venta');
  }

  // ═══════ [9] no se mueve un item ya cobrado ═══════
  console.log('\n[9] Items con cobro parcial');
  {
    const origen = await nuevaMesa(); const destino = await nuevaMesa();
    const vOrigen = await abrirVentaMesa(origen.id);
    const cobrado = await agregarItem(vOrigen.id);
    await ds.query(`UPDATE venta_items SET monto_cubierto = 10000 WHERE id = ${cobrado.id}`);
    let err = '';
    try {
      await transferir({
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
        alcance: 'ITEMS', itemIds: [cobrado.id],
      });
    } catch (e: any) { err = e.message; }
    ok(/cobro parcial/i.test(err), '9: rechaza mover un item ya cobrado', err);
    ok(await ventaDelItem(cobrado.id) === vOrigen.id, '9: el item no se movio');
    ok(await estadoMesa(destino.id) === 'DISPONIBLE', '9: la mesa destino no se ocupo por un intento fallido');
  }

  // ═══════ [10] no se fusionan dos cuentas si el origen tiene cobros ═══════
  console.log('\n[10] Fusion con cobros parciales en el origen');
  {
    const origen = await nuevaMesa(); const destino = await nuevaMesa();
    const vOrigen = await abrirVentaMesa(origen.id);
    const vDestino = await abrirVentaMesa(destino.id);
    const item = await agregarItem(vOrigen.id);
    await agregarItem(vDestino.id);
    await ds.query(
      `INSERT INTO cobros_parciales (venta_id, fecha, factor_aplicado, cash_total, activo)`
      + ` VALUES (${vOrigen.id}, '2026-08-21 12:00:00', 1, 5000, 1)`,
    );
    let err = '';
    try {
      await transferir({
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
      });
    } catch (e: any) { err = e.message; }
    ok(/cobros parciales/i.test(err), '10: rechaza unir dos cuentas cuando el origen tiene cobros', err);
    ok(await ventaDelItem(item.id) === vOrigen.id, '10: no se movio nada');
    ok(await estadoVenta(vOrigen.id) === 'ABIERTA', '10: la venta origen sigue abierta');

    // Pero a un destino LIBRE si se puede: la venta entera se re-apunta y los
    // cobros viajan con ella sin fusionarse con nada.
    const libre = await nuevaMesa();
    const r: any = await transferir({
      origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: libre.id }, alcance: 'COMPLETA',
    });
    ok(r.reapunte === true, '10: a una mesa libre si transfiere, con cobros y todo');
  }

  // ═══════ [10b] la venta con cuenta por cobrar viva no se transfiere ═══════
  console.log('\n[10b] Venta con cuenta por cobrar vinculada');
  {
    const origen = await nuevaMesa(); const destino = await nuevaMesa();
    const venta = await abrirVentaMesa(origen.id);
    await agregarItem(venta.id);
    // El flujo normal concluye la venta al crear la CPC, pero
    // `create-cuenta-por-cobrar` deja vincularla a mano a una venta abierta. Por
    // ahi, cancelar la venta aca se saltearia la reversion de saldo de updateVenta.
    const { Cliente } = E('personas/cliente.entity');
    const { Moneda } = E('financiero/moneda.entity');
    const cliente: any = await save(Cliente, { activo: true });
    const moneda: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'PYG', principal: true, activo: true });
    await ds.query(
      `INSERT INTO cuentas_por_cobrar (cliente_id, moneda_id, monto_total, monto_cobrado, cantidad_cuotas, fecha_inicio, estado, venta_id)`
      + ` VALUES (${cliente.id}, ${moneda.id}, 10000, 0, 1, '2026-08-21', 'ACTIVO', ${venta.id})`,
    );
    let err = '';
    try {
      await transferir({
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
      });
    } catch (e: any) { err = e.message; }
    ok(/cuenta por cobrar/i.test(err), '10b: rechaza transferir una venta con CPC viva', err);
    ok(await estadoVenta(venta.id) === 'ABIERTA', '10b: la venta origen no se cancelo');
  }

  // ═══════ [10c] cerrar una comanda limpia de verdad su mesa ═══════
  console.log('\n[10c] cerrarComanda limpia el FK de la mesa');
  {
    const mesa = await nuevaMesa(); const comanda = await nuevaComanda(mesa.id);
    await abrirVentaComanda(comanda.id, mesa.id);
    await invokeHandler('cerrarComanda', comanda.id);
    // TypeORM NO emite UPDATE para propiedades puestas en `undefined`. El handler
    // viejo limpiaba `pdv_mesa` asi, y el FK quedaba con la mesa vieja: al
    // reabrirse la comanda por transferencia, esa mesa stale viajaba a la venta.
    const fk = (await ds.query(`SELECT pdv_mesa_id AS m, sector_id AS s FROM comandas WHERE id = ${comanda.id}`))[0];
    ok(fk.m === null, '10c: pdv_mesa_id quedo en NULL, no con la mesa vieja', fk.m);
    ok(fk.s === null, '10c: sector_id quedo en NULL', fk.s);
    ok(await estadoComanda(comanda.id) === 'DISPONIBLE', '10c: la comanda quedo disponible');
  }

  // ═══════ [11] validaciones de payload ═══════
  console.log('\n[11] Validaciones');
  {
    const mesa = await nuevaMesa();
    await abrirVentaMesa(mesa.id);
    const casos: Array<[any, RegExp, string]> = [
      [{ origen: { tipo: 'MESA', id: mesa.id }, destino: { tipo: 'MESA', id: mesa.id }, alcance: 'COMPLETA' },
        /el mismo/i, '11: rechaza origen igual a destino'],
      [{ origen: { tipo: 'MESA', id: mesa.id }, destino: { tipo: 'MESA', id: 99999 }, alcance: 'COMPLETA' },
        /no disponible/i, '11: rechaza una mesa destino inexistente'],
      [{ origen: { tipo: 'MESA', id: mesa.id }, destino: { tipo: 'MESA', id: 99999 }, alcance: 'ITEMS', itemIds: [] },
        /no se seleccionaron/i, '11: rechaza ITEMS sin items'],
      [{ origen: { tipo: 'MESA', id: mesa.id }, destino: { tipo: 'MESA', id: 99999 }, alcance: 'LO_QUE_SEA' },
        /alcance/i, '11: rechaza un alcance que no existe'],
    ];
    for (const [payload, re, nombre] of casos) {
      let err = '';
      try { await transferir(payload); } catch (e: any) { err = e.message; }
      ok(re.test(err), nombre, err);
    }

    // Una mesa sin venta abierta no es origen valido.
    const vacia = await nuevaMesa();
    let err = '';
    try {
      await transferir({ origen: { tipo: 'MESA', id: vacia.id }, destino: { tipo: 'MESA', id: mesa.id }, alcance: 'COMPLETA' });
    } catch (e: any) { err = e.message; }
    ok(/no tiene una venta abierta/i.test(err), '11: rechaza un origen sin cuenta', err);
  }

  // ═══════ [12] permisos ═══════
  console.log('\n[12] Permisos');
  {
    const origen = await nuevaMesa(); const destino = await nuevaMesa();
    const venta = await abrirVentaMesa(origen.id);
    await agregarItem(venta.id);
    usuarioActual = sinPermiso;
    let err = '';
    try {
      await transferir({ origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA' });
    } catch (e: any) { err = e.message; }
    ok(/PERMISO REQUERIDO: VENTAS_PDV/.test(err), '12: sin VENTAS_PDV no se transfiere', err);
    usuarioActual = mozo;
    const r: any = await transferir({
      origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
    });
    ok(!!r?.ventaDestinoId, '12: el mozo, con solo VENTAS_PDV, si transfiere', r);
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} transferencia-pdv: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
