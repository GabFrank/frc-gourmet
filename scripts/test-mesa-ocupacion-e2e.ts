/**
 * E2E: la mesa se ocupa y se libera con permiso de MOZO.
 *
 * El bug que protege: `createVenta`/`createVentaItem` piden VENTAS_PDV, pero
 * marcar la mesa pasaba por `updatePdvMesa`, que pide VENTAS_PDV_CONFIGURAR —
 * permiso que en el seed sólo tiene GERENTE. A un mozo o cajero le fallaba en
 * silencio y la mesa quedaba sin marcar.
 *
 * Uso: npm run test:mesa-ocupacion
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
  const dbFile = path.join(tmpDir, 'test-mesa-ocupacion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[mesa-ocupacion] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Comanda } = E('ventas/comanda.entity');
  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // Usuario con SOLO VENTAS_PDV: es exactamente lo que tiene el rol MOZO.
  const mozo: any = await save(Usuario, { nickname: 'mozo', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'MOZO', activo: true });
  const permPdv: any = await save(Permission, { codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true });
  await save(RolePermission, { role: rol, permission: permPdv });
  await save(UsuarioRole, { usuario: mozo, role: rol });
  // El permiso de configuración existe pero NADIE se lo da al mozo.
  await save(Permission, { codigo: 'VENTAS_PDV_CONFIGURAR', descripcion: 'CONFIG', activo: true });

  registerVentasHandlers(ds, () => mozo);

  const nuevaMesa = async (numero: number) =>
    await save(PdvMesa, { numero, estado: 'DISPONIBLE', activo: true, reservado: false });
  const estadoDe = async (id: number) =>
    (await ds.getRepository(PdvMesa).findOneBy({ id } as any))!.estado;

  // ═══════ [A] El caso del bug ═══════
  console.log('\n[A] Un mozo abre una venta de mesa');
  {
    const mesa: any = await nuevaMesa(1);
    const venta: any = await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    ok(!!venta?.id, 'A: la venta se crea', venta?.id);
    ok(await estadoDe(mesa.id) === 'OCUPADO', 'A: la mesa queda OCUPADO (este es el bug que se arregla)', await estadoDe(mesa.id));
  }

  // ═══════ [B] El ABM sigue cerrado ═══════
  console.log('\n[B] El mozo no puede tocar la estructura');
  {
    const mesa: any = await nuevaMesa(2);
    let err = '';
    try { await invokeHandler('updatePdvMesa', mesa.id, { numero: 999 }); } catch (e: any) { err = e.message; }
    ok(/PERMISO REQUERIDO: VENTAS_PDV_CONFIGURAR/.test(err), 'B: updatePdvMesa sigue exigiendo el permiso de configuración', err);
    ok((await ds.getRepository(PdvMesa).findOneBy({ id: mesa.id } as any))!.numero === 2, 'B: la mesa no se renombró');
  }

  // ═══════ [C] Liberar ═══════
  console.log('\n[C] Liberar la mesa');
  {
    const mesa: any = await nuevaMesa(3);
    const venta: any = await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });

    // Con la venta todavía abierta, no se puede liberar.
    let err = '';
    try { await invokeHandler('set-pdv-mesa-estado', mesa.id, 'DISPONIBLE'); } catch (e: any) { err = e.message; }
    ok(/todavia tiene 1 venta/.test(err), 'C: no libera una mesa con venta abierta', err);
    ok(await estadoDe(mesa.id) === 'OCUPADO', 'C: sigue ocupada');

    // Cerrada la venta, sí.
    await ds.query(`UPDATE ventas SET estado = 'CONCLUIDA' WHERE id = ${venta.id}`);
    await invokeHandler('set-pdv-mesa-estado', mesa.id, 'DISPONIBLE');
    ok(await estadoDe(mesa.id) === 'DISPONIBLE', 'C: el mozo libera la mesa', await estadoDe(mesa.id));
  }

  // ═══════ [D] Comandas: la mesa no es asunto de createVenta ═══════
  console.log('\n[D] Venta de comanda con mesa vinculada');
  {
    const mesa: any = await nuevaMesa(4);
    const comanda: any = await save(Comanda, { codigo: 'C-4', numero: 4, estado: 'OCUPADO', activo: true, pdv_mesa: { id: mesa.id } });
    await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id }, comanda: { id: comanda.id } });
    // Ocupar la mesa física al vincular una comanda lo decide
    // PdvConfig.ocuparMesaAlVincularComanda (default false), vía abrirComanda.
    ok(await estadoDe(mesa.id) === 'DISPONIBLE',
      'D: createVenta NO ocupa la mesa si la venta cuelga de una comanda', await estadoDe(mesa.id));

    // Y esa mesa no se puede liberar mientras la comanda siga viva.
    let err = '';
    try { await invokeHandler('set-pdv-mesa-estado', mesa.id, 'DISPONIBLE'); } catch (e: any) { err = e.message; }
    ok(err === '', 'D: liberar una mesa ya disponible es no-op, no error', err);
  }

  // ═══════ [E] No degrada una mesa ajena ═══════
  console.log('\n[E] Mesa ya ocupada');
  {
    const mesa: any = await nuevaMesa(5);
    await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    ok(await estadoDe(mesa.id) === 'OCUPADO', 'E: una segunda venta no altera el estado', await estadoDe(mesa.id));
  }

  // ═══════ [F] Venta sin mesa ═══════
  console.log('\n[F] Venta de mostrador');
  {
    const venta: any = await invokeHandler('createVenta', { estado: 'ABIERTA' });
    ok(!!venta?.id, 'F: una venta sin mesa se crea igual', venta?.id);
  }

  // ═══════ [G] Estado inválido ═══════
  console.log('\n[G] Validación');
  {
    const mesa: any = await nuevaMesa(7);
    let err = '';
    try { await invokeHandler('set-pdv-mesa-estado', mesa.id, 'CUALQUIERA'); } catch (e: any) { err = e.message; }
    ok(/invalido/i.test(err), 'G: rechaza un estado que no existe', err);
  }

  // ═══════ [H] Una comanda encima NO bloquea liberar la mesa ═══════
  // Cambio de semantica 2026-08-22: el vinculo comanda->mesa es de UBICACION, no
  // de ocupacion. Una mesa sin cuenta propia con comandas encima queda
  // DISPONIBLE (verde) y el badge avisa que hay comandas sentadas ahi.
  //
  // Antes esto bloqueaba, y por eso cobrar la cuenta de una mesa con una comanda
  // encima tiraba error: la excepcion salia del bloque del cobro y la limpieza
  // de la pantalla nunca corria.
  console.log('\n[H] Mesa con comanda viva pero sin cuenta propia');
  {
    const mesa: any = await nuevaMesa(8);
    await ds.query(`UPDATE pdv_mesas SET estado = 'OCUPADO' WHERE id = ${mesa.id}`);
    await save(Comanda, { codigo: 'C-8', numero: 8, estado: 'OCUPADO', activo: true, pdv_mesa: { id: mesa.id } });
    let err = '';
    try { await invokeHandler('set-pdv-mesa-estado', mesa.id, 'DISPONIBLE'); } catch (e: any) { err = e.message; }
    ok(err === '', 'H: una comanda encima ya NO impide liberar la mesa', err);
    ok(await estadoDe(mesa.id) === 'DISPONIBLE', 'H: la mesa quedo disponible', await estadoDe(mesa.id));
  }

  // ═══════ [I] La cuenta PROPIA si bloquea ═══════
  console.log('\n[I] Mesa con cuenta propia');
  {
    const mesa: any = await nuevaMesa(9);
    await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    let err = '';
    try { await invokeHandler('set-pdv-mesa-estado', mesa.id, 'DISPONIBLE'); } catch (e: any) { err = e.message; }
    ok(/venta\(s\) abierta\(s\) propia/.test(err), 'I: la cuenta propia sigue impidiendo liberar', err);
  }

  // ═══════ [J] El estado que devuelven las consultas es DERIVADO ═══════
  console.log('\n[J] Estado derivado, no la columna cache');
  {
    const mesa: any = await nuevaMesa(10);
    // Columna mentirosa a proposito: OCUPADO sin ninguna cuenta.
    await ds.query(`UPDATE pdv_mesas SET estado = 'OCUPADO' WHERE id = ${mesa.id}`);
    const mesas: any[] = await invokeHandler('getPdvMesas');
    const encontrada = mesas.find((m: any) => m.id === mesa.id);
    ok(encontrada?.estado === 'DISPONIBLE',
      'J: la grilla deriva DISPONIBLE aunque la columna diga OCUPADO', encontrada?.estado);
    const detalle: any = await invokeHandler('getPdvMesa', mesa.id);
    ok(detalle?.estado === 'DISPONIBLE', 'J: el detalle tambien lo deriva', detalle?.estado);

    // Y con cuenta propia deriva OCUPADO aunque la columna diga lo contrario.
    await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    await ds.query(`UPDATE pdv_mesas SET estado = 'DISPONIBLE' WHERE id = ${mesa.id}`);
    const mesas2: any[] = await invokeHandler('getPdvMesas');
    ok(mesas2.find((m: any) => m.id === mesa.id)?.estado === 'OCUPADO',
      'J: con cuenta propia deriva OCUPADO aunque la columna diga DISPONIBLE');
  }

  // ═══════ [K] Abrir una comanda no ocupa su mesa ═══════
  console.log('\n[K] abrirComanda no toca la mesa');
  {
    const mesa: any = await nuevaMesa(11);
    const comanda: any = await save(Comanda, { codigo: 'C-11', numero: 11, estado: 'DISPONIBLE', activo: true });
    await invokeHandler('abrirComanda', comanda.id, { mesaId: mesa.id });
    ok(await estadoDe(mesa.id) === 'DISPONIBLE', 'K: la mesa sigue disponible', await estadoDe(mesa.id));
    const mesas: any[] = await invokeHandler('getPdvMesas');
    const m = mesas.find((x: any) => x.id === mesa.id);
    ok(m?.estado === 'DISPONIBLE', 'K: la grilla la muestra disponible');
    ok((m?.comandas || []).length === 1, 'K: pero el badge tiene 1 comanda', (m?.comandas || []).length);
  }

  // ═══════ [L] Cobrar/cancelar deja el CACHE al dia ═══════
  // Hallazgo de auditoria: la columna `pdv_mesas.estado` es un cache, y el
  // evento que mas veces la cambia — cerrar la cuenta — no la estaba
  // resincronizando. La grilla se veia bien porque deriva, pero cualquier lector
  // de la columna cruda (p.ej. el servicio de musica ambiental, que decide el
  // tempo por mesas ocupadas) sobre-contaba para siempre.
  console.log('\n[L] El cache sigue al cierre de la cuenta');
  {
    const mesa: any = await nuevaMesa(12);
    const venta: any = await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    ok(await estadoDe(mesa.id) === 'OCUPADO', 'L: al abrir la cuenta, la columna dice OCUPADO');

    await invokeHandler('updateVenta', venta.id, { estado: 'CONCLUIDA' });
    ok(await estadoDe(mesa.id) === 'DISPONIBLE',
      'L: al COBRAR, la columna vuelve a DISPONIBLE sola', await estadoDe(mesa.id));
  }
  {
    const mesa: any = await nuevaMesa(13);
    const venta: any = await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    await invokeHandler('updateVenta', venta.id, { estado: 'CANCELADA' });
    ok(await estadoDe(mesa.id) === 'DISPONIBLE',
      'L: al CANCELAR tambien', await estadoDe(mesa.id));
  }
  {
    // Y con una comanda encima: la comanda no sostiene la ocupacion.
    const mesa: any = await nuevaMesa(14);
    const venta: any = await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    await save(Comanda, { codigo: 'C-14', numero: 14, estado: 'OCUPADO', activo: true, pdv_mesa: { id: mesa.id } });
    await invokeHandler('updateVenta', venta.id, { estado: 'CONCLUIDA' });
    ok(await estadoDe(mesa.id) === 'DISPONIBLE',
      'L: una comanda encima no mantiene la mesa ocupada', await estadoDe(mesa.id));
  }
  {
    // cerrarVentasAbiertasMesa tambien.
    const mesa: any = await nuevaMesa(15);
    await invokeHandler('createVenta', { estado: 'ABIERTA', mesa: { id: mesa.id } });
    await invokeHandler('cerrarVentasAbiertasMesa', mesa.id, 'CONCLUIDA');
    ok(await estadoDe(mesa.id) === 'DISPONIBLE',
      'L: cerrarVentasAbiertasMesa deja el cache al dia', await estadoDe(mesa.id));
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} mesa-ocupacion: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
