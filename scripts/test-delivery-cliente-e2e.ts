/**
 * E2E — el cliente del delivery tiene que llegar a la VENTA.
 *
 * DOS BUGS, misma consecuencia visible: el diálogo de cobro no mostraba el
 * cliente y el botón "Cobrar a crédito" decía "Asigne un cliente a la venta"
 * aunque el delivery tuviera uno cargado. El diálogo lee `venta.cliente`.
 *
 *  1. `getDeliveriesByCaja` hidrataba `delivery.cliente` (+ su persona) pero NO
 *     `venta.cliente`, así que llegaba `undefined` aunque estuviera en la base.
 *  2. `deliveryActualizarDatos` copiaba a la venta el `costoDelivery` y el
 *     `nombreCliente`, pero NO el cliente: asignarle un cliente a un delivery
 *     YA CREADO no llegaba nunca a `venta.cliente`. Ése es el peor de los dos,
 *     porque el dato quedaba mal en la base, no sólo en la pantalla.
 *
 * El alta (`delivery-crear`) sí lo seteaba desde siempre — por eso el síntoma
 * dependía de si el cliente se había puesto al crear o al editar.
 *
 * Uso: npm run test:delivery-cliente
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { installHandlerRegistry, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { registerDeliveryHandlers } from '../electron/handlers/delivery.handler';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-delivery-cliente.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[delivery-cliente] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');

  const save = async (entity: any, data: any) => await ds.getRepository(entity).save(
    ds.getRepository(entity).create(data),
  ) as any;

  // Usuario admin con los permisos que piden los handlers.
  const personaAdmin: any = await save(Persona, { nombre: 'ADMIN TEST' });
  const usuario: any = await save(Usuario, { nickname: 'admin-test', password: 'x', persona: personaAdmin, activo: true });
  const rol: any = await save(Role, { descripcion: 'ADMIN TEST', activo: true });
  for (const codigo of ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']) {
    const permiso: any = await save(Permission, { codigo, descripcion: codigo, modulo: 'TEST', activo: true });
    await save(RolePermission, { role: rol, permission: permiso });
  }
  await save(UsuarioRole, { usuario, role: rol, activo: true });

  // `cajas.dispositivo_id` es NOT NULL: la caja siempre pertenece a una terminal.
  const terminal: any = await save(Dispositivo, { nombre: 'CAJA TEST', activo: true, isCaja: true });
  // `conteo_apertura_id` también es NOT NULL: no hay caja sin conteo de apertura.
  const conteoApertura: any = await save(Conteo, {
    activo: true, tipo: 'APERTURA', fecha: new Date(), observaciones: 'TEST',
  });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), activo: true,
    dispositivo: terminal, conteoApertura,
  });
  const zona: any = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 10000, activo: true });

  const personaAna: any = await save(Persona, { nombre: 'ANA GOMEZ', telefono: '0981111111' });
  const ana: any = await save(Cliente, { persona: personaAna, activo: true, credito: true });
  const personaBeto: any = await save(Persona, { nombre: 'BETO SILVA' });
  const beto: any = await save(Cliente, { persona: personaBeto, activo: true, credito: true });

  installHandlerRegistry();
  registerDeliveryHandlers(ds, () => usuario);
  registerVentasHandlers(ds, () => usuario);

  const crear = (payload: any) => invokeHandlerWithContext('delivery-crear', {}, {
    cajaId: caja.id, telefono: '0981000000', direccion: 'CALLE 1',
    precioDeliveryId: zona.id, ...payload,
  });
  const listar = () => invokeHandlerWithContext('getDeliveriesByCaja', {}, caja.id, {});

  // ── [A] El bug 1: la lista no traía venta.cliente ────────────────────────
  console.log('\n[A] getDeliveriesByCaja hidrata venta.cliente\n');
  {
    const res: any = await crear({ clienteId: ana.id, nombre: 'ANA GOMEZ' });
    const lista: any = await listar();
    // Cada fila ES el delivery (spread) con un sub-objeto `venta` de proyección
    // explícita. Ese detalle importa: hidratar la relación en el QueryBuilder no
    // alcanza si el mapper no la incluye — fue el tercer bug de esta fase.
    const fila = (lista?.data || lista)?.find?.((d: any) => d?.id === res.delivery.id);
    ok(!!fila, 'A: el delivery aparece en la lista', Object.keys(lista || {}));
    ok(fila?.venta?.cliente?.id === ana.id,
      'A: `venta.cliente` llega al frontend (ERA EL BUG: la proyección lo descartaba)',
      fila?.venta?.cliente);
    ok(fila?.venta?.cliente?.persona?.nombre === 'ANA GOMEZ',
      'A: y con su persona, que es lo que muestra el diálogo', fila?.venta?.cliente?.persona);
    ok(fila?.cliente?.id === ana.id,
      'A: el cliente del DELIVERY sigue viniendo — los alias nuevos no lo pisaron',
      fila?.cliente);
  }

  // ── [B] El bug 2: editar no propagaba el cliente ─────────────────────────
  console.log('\n[B] deliveryActualizarDatos propaga el cliente a la venta\n');
  {
    // Alta SIN cliente, que es como llega un pedido telefónico anónimo.
    const res: any = await crear({ nombre: 'SIN CLIENTE' });
    const ventaAntes: any = await ds.getRepository(Venta).findOne({
      where: { delivery: { id: res.delivery.id } }, relations: ['cliente'],
    });
    ok(!ventaAntes?.cliente, 'B: la venta arranca sin cliente', ventaAntes?.cliente);

    await invokeHandlerWithContext('delivery-actualizar-datos', {}, res.delivery.id, {
      clienteId: beto.id, nombre: 'BETO SILVA', telefono: '0981000000', direccion: 'CALLE 1',
    });

    const ventaDespues: any = await ds.getRepository(Venta).findOne({
      where: { delivery: { id: res.delivery.id } }, relations: ['cliente'],
    });
    ok(ventaDespues?.cliente?.id === beto.id,
      'B: asignar el cliente al editar LLEGA a la venta (ERA EL BUG: quedaba null para siempre)',
      ventaDespues?.cliente);
    ok(ventaDespues?.nombreCliente === 'BETO SILVA',
      'B: el nombre se sigue sincronizando como antes', ventaDespues?.nombreCliente);
  }

  // ── [C] No reescribir de más ─────────────────────────────────────────────
  console.log('\n[C] Editar sin tocar el cliente no lo cambia\n');
  {
    const res: any = await crear({ clienteId: ana.id, nombre: 'ANA GOMEZ' });
    await invokeHandlerWithContext('delivery-actualizar-datos', {}, res.delivery.id, {
      nombre: 'ANA GOMEZ', telefono: '0981000000', direccion: 'OTRA CALLE', observacion: 'TOCAR TIMBRE',
    });
    const venta: any = await ds.getRepository(Venta).findOne({
      where: { delivery: { id: res.delivery.id } }, relations: ['cliente'],
    });
    ok(venta?.cliente?.id === ana.id,
      'C: editar sin mandar clienteId no borra el cliente que ya tenía', venta?.cliente);
  }

  // ── [D] Paginación con los joins nuevos ──────────────────────────────────
  // La query ya combinaba `leftJoinAndSelect('venta.items')` (@OneToMany) con
  // skip/take. Los joins de [A] son to-one y no pueden multiplicar filas, pero
  // el punto de este bloque es dejarlo fijado: si alguien convierte alguno en
  // to-many, el conteo se rompe acá y no en producción.
  console.log('\n[D] Los joins nuevos no rompen la paginación\n');
  {
    const antes: any = await listar();
    const totalAntes = antes?.total ?? (antes?.data || antes)?.length;

    const res: any = await crear({ clienteId: ana.id, nombre: 'MULTI ITEM' });
    const ventaMulti: any = await ds.getRepository(Venta).findOne({
      where: { delivery: { id: res.delivery.id } },
    });
    for (let i = 0; i < 3; i++) {
      await save(VentaItem, {
        venta: ventaMulti, cantidad: 1, precioVentaUnitario: 1000,
        precioCostoUnitario: 500, estado: 'ACTIVO',
      });
    }

    const despues: any = await listar();
    const totalDespues = despues?.total ?? (despues?.data || despues)?.length;
    ok(totalDespues === totalAntes + 1,
      'D: una venta con 3 ítems suma 1 al total, no 3 (el join @OneToMany no infla el conteo)',
      { totalAntes, totalDespues });

    const filas = (despues?.data || despues) as any[];
    const repetidas = filas.filter((d: any) => d?.id === res.delivery.id).length;
    ok(repetidas === 1, 'D: y aparece una sola vez en la lista', repetidas);
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} delivery-cliente: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
