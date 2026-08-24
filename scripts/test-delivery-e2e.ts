/**
 * E2E del módulo de Delivery del PdV.
 *
 * Cubre los cuatro hallazgos bloqueantes de docs/DIAGNOSTICO-DELIVERY.md:
 *
 *  A-1 · el costo del envío entra en el total a cobrar (antes se regalaba);
 *  A-2 · cancelar un delivery cobrado revierte el cobro, el stock y la CPC,
 *        todo en una transacción;
 *  A-4 · la máquina de estados vive en el backend y rechaza los saltos
 *        ilegales, incluso llamando al handler directo (que es lo que puede
 *        hacer cualquier cliente por `/api/rpc`, que es default-allow).
 *
 * Más el alta atómica (B-3), la lista con pendientes de otras cajas (B-4), la
 * sincronización del costo al cambiar de zona (B-7) y el guard nuevo de
 * `updateDelivery`.
 *
 * Uso: npm run test:delivery
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerDeliveryHandlers } from '../electron/handlers/delivery.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-delivery.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[delivery] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { StockMovimiento } = E('productos/stock-movimiento.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // Usuario con los permisos del cajero: opera el PdV, y ademas puede revertir
  // un cobro. El caso sin ese permiso se prueba con un segundo usuario.
  const cajero: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'CAJERO', activo: true });
  const permPdv: any = await save(Permission, { codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true });
  const permCancelar: any = await save(Permission, {
    codigo: 'VENTAS_DELIVERY_CANCELAR_COBRADO', descripcion: 'CANCELAR COBRADO', activo: true,
  });
  await save(RolePermission, { role: rol, permission: permPdv });
  await save(RolePermission, { role: rol, permission: permCancelar });
  await save(UsuarioRole, { usuario: cajero, role: rol });

  // Mozo: sólo VENTAS_PDV. No puede cancelar un delivery ya cobrado.
  const mozo: any = await save(Usuario, { nickname: 'mozo', password: 'x', activo: true });
  const rolMozo: any = await save(Role, { descripcion: 'MOZO', activo: true });
  await save(RolePermission, { role: rolMozo, permission: permPdv });
  await save(UsuarioRole, { usuario: mozo, role: rolMozo });

  let usuarioActual: any = cajero;

  // Datos base.
  await save(PdvConfig, { cantidad_mesas: 0 });
  const dispositivo: any = await save(Dispositivo, { nombre: 'CAJA-TEST', activo: true });
  const nuevaCaja = async () => await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), activo: true,
    dispositivo, conteoApertura: await save(Conteo, {}),
  });
  const caja1: any = await nuevaCaja();
  const caja2: any = await nuevaCaja();
  const zonaCerca: any = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 5000, activo: true });
  const zonaLejos: any = await save(PrecioDelivery, { descripcion: 'PERIFERIA', valor: 15000, activo: true });
  const personaRep: any = await save(Persona, { nombre: 'JUAN REPARTIDOR' });
  const cargo: any = await save(Cargo, { nombre: 'REPARTIDOR', activo: true });
  const repartidor: any = await save(Funcionario, {
    persona: personaRep, cargo, fechaIngreso: '2026-01-01', activo: true,
  });
  const moneda: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const formaPago: any = await save(FormasPago, { nombre: 'EFECTIVO', activo: true });

  registerVentasHandlers(ds, () => usuarioActual);
  registerDeliveryHandlers(ds, () => usuarioActual);

  const crearDelivery = async (over: any = {}) => await invokeHandler('delivery-crear', {
    cajaId: caja1.id,
    telefono: '0981123456',
    nombre: 'CLIENTE PRUEBA',
    direccion: 'AVDA SIEMPRE VIVA 742',
    precioDeliveryId: zonaCerca.id,
    ...over,
  });

  /** Agrega un ítem a la venta y devuelve su neto. */
  const agregarItem = async (ventaId: number, precio: number, cantidad = 1) => {
    await save(VentaItem, {
      venta: { id: ventaId }, cantidad, precioVentaUnitario: precio,
      estado: 'ACTIVO', precioAdicionales: 0, descuentoUnitario: 0, montoCubierto: 0,
      precioCostoUnitario: 0,
    });
    return precio * cantidad;
  };

  /** Marca la venta como cobrada, con su Pago y su línea de efectivo. */
  const cobrar = async (ventaId: number, monto: number) => {
    const pago: any = await save(Pago, {});
    await save(PagoDetalle, {
      pago, moneda, formaPago, valor: monto, tipo: 'PAGO', descripcion: 'EFECTIVO', activo: true,
    });
    await ds.getRepository(Venta).update({ id: ventaId } as any, {
      estado: 'CONCLUIDA', pago, fechaCierre: new Date(),
    } as any);
    return pago;
  };

  // ═══════ [A] Alta atómica ═══════
  console.log('\n[A] Alta: Delivery + Venta en una sola transacción');
  {
    const res: any = await crearDelivery();
    ok(!!res?.delivery?.id, 'A: crea el delivery', res?.delivery?.id);
    ok(!!res?.venta?.id, 'A: crea la venta en la misma llamada', res?.venta?.id);
    ok(res.delivery.estado === 'ABIERTO', 'A: nace ABIERTO', res.delivery.estado);
    // El costo del envío queda CONGELADO en la venta (A-1).
    ok(Number(res.venta.costoDelivery) === 5000, 'A: congela el costo del envío en la venta', res.venta.costoDelivery);
    ok(res.delivery.direccion === 'AVDA SIEMPRE VIVA 742', 'A: guarda la dirección en UPPERCASE', res.delivery.direccion);
  }
  {
    // Sin teléfono no hay alta, y sin dirección tampoco (config por defecto).
    let err = '';
    try { await crearDelivery({ telefono: '12' }); } catch (e: any) { err = e.message; }
    ok(/al menos 4 dígitos/.test(err), 'A: rechaza un teléfono corto', err);

    err = '';
    try { await crearDelivery({ direccion: '   ' }); } catch (e: any) { err = e.message; }
    ok(/dirección de entrega es obligatoria/.test(err), 'A: rechaza sin dirección', err);
  }

  // ═══════ [B] Máquina de estados (A-4) ═══════
  console.log('\n[B] Máquina de estados: las transiciones ilegales se rechazan');
  {
    const { delivery }: any = await crearDelivery();

    let err = '';
    try { await invokeHandler('delivery-cambiar-estado', delivery.id, 'ENTREGADO'); } catch (e: any) { err = e.message; }
    ok(/Transición no permitida: ABIERTO → ENTREGADO/.test(err), 'B: no se salta de ABIERTO a ENTREGADO', err);

    err = '';
    try { await invokeHandler('delivery-cambiar-estado', delivery.id, 'VOLANDO'); } catch (e: any) { err = e.message; }
    ok(/Estado de delivery inválido/.test(err), 'B: rechaza un estado inexistente', err);

    err = '';
    try { await invokeHandler('delivery-cambiar-estado', delivery.id, 'CANCELADO'); } catch (e: any) { err = e.message; }
    ok(/usá la acción CANCELAR/.test(err), 'B: cancelar no pasa por cambiar-estado', err);

    // Avance legal, con los timestamps puestos por el backend.
    const listo: any = await invokeHandler('delivery-cambiar-estado', delivery.id, 'PARA_ENTREGA');
    ok(listo.estado === 'PARA_ENTREGA', 'B: ABIERTO → PARA_ENTREGA', listo.estado);
    ok(!!listo.fechaParaEntrega, 'B: estampa fechaParaEntrega');

    // Enviar exige repartidor (config por defecto).
    err = '';
    try { await invokeHandler('delivery-cambiar-estado', delivery.id, 'EN_CAMINO'); } catch (e: any) { err = e.message; }
    ok(/Seleccioná el repartidor/.test(err), 'B: enviar sin repartidor se rechaza', err);

    const enCamino: any = await invokeHandler(
      'delivery-cambiar-estado', delivery.id, 'EN_CAMINO', { funcionarioId: repartidor.id },
    );
    ok(enCamino.estado === 'EN_CAMINO', 'B: PARA_ENTREGA → EN_CAMINO con repartidor', enCamino.estado);
    ok(enCamino.entregadoPorFuncionario?.id === repartidor.id, 'B: asigna el repartidor (B-2)');

    // Retroceder limpia los timestamps que quedan por delante.
    const atras: any = await invokeHandler('delivery-cambiar-estado', delivery.id, 'PARA_ENTREGA');
    ok(!atras.fechaEnCamino, 'B: al retroceder se limpia fechaEnCamino');
  }
  {
    // Entregar exige la venta cobrada.
    const { delivery, venta }: any = await crearDelivery();
    await agregarItem(venta.id, 20000);
    await invokeHandler('delivery-cambiar-estado', delivery.id, 'EN_CAMINO', { funcionarioId: repartidor.id });

    let err = '';
    try { await invokeHandler('delivery-cambiar-estado', delivery.id, 'ENTREGADO'); } catch (e: any) { err = e.message; }
    ok(/todavía no fue cobrada/.test(err), 'B: no se entrega una venta sin cobrar', err);

    await cobrar(venta.id, 25000);
    const entregado: any = await invokeHandler('delivery-cambiar-estado', delivery.id, 'ENTREGADO');
    ok(entregado.estado === 'ENTREGADO', 'B: con la venta cobrada sí se entrega', entregado.estado);
  }

  // ═══════ [C] El guard de updateDelivery ═══════
  console.log('\n[C] El CRUD genérico ya no puede tocar el estado');
  {
    const { delivery }: any = await crearDelivery();
    let err = '';
    try { await invokeHandler('updateDelivery', delivery.id, { estado: 'ENTREGADO' }); } catch (e: any) { err = e.message; }
    ok(/no puede modificar estado/.test(err), 'C: updateDelivery rechaza el cambio de estado', err);

    err = '';
    try { await invokeHandler('updateDelivery', delivery.id, { fechaEntregado: new Date() }); } catch (e: any) { err = e.message; }
    ok(/no puede modificar fechaEntregado/.test(err), 'C: tampoco los timestamps', err);

    err = '';
    try {
      await invokeHandler('updateDelivery', delivery.id, { precioDelivery: { id: zonaLejos.id } });
    } catch (e: any) { err = e.message; }
    ok(/no puede modificar precioDelivery/.test(err),
      'C: tampoco la zona (cambiarla tiene que resincronizar el costo de la venta)', err);

    err = '';
    try { await invokeHandler('createDelivery', { telefono: '0981000000' }); } catch (e: any) { err = e.message; }
    ok(/createDelivery está deprecado/.test(err),
      'C: createDelivery ya no puede crear un delivery sin venta', err);

    const actual = await ds.getRepository(Delivery).findOneBy({ id: delivery.id } as any);
    ok((actual as any).estado === 'ABIERTO', 'C: el delivery quedó intacto', (actual as any).estado);
  }
  {
    // El nombre se sincroniza en la venta aunque NO cambie la zona.
    const { delivery, venta }: any = await crearDelivery();
    await invokeHandler('delivery-actualizar-datos', delivery.id, {
      telefono: '0981123456', nombre: 'NOMBRE CORREGIDO', direccion: 'CALLE 1',
    });
    const v: any = await ds.getRepository(Venta).findOneBy({ id: venta.id } as any);
    ok(v.nombreCliente === 'NOMBRE CORREGIDO',
      'C: corregir sólo el nombre lo propaga a la venta', v.nombreCliente);
  }

  // ═══════ [D] Costo del envío en el cobro (A-1) ═══════
  console.log('\n[D] El envío entra en lo que hay que cobrar');
  {
    const { delivery, venta }: any = await crearDelivery({ precioDeliveryId: zonaLejos.id });
    await agregarItem(venta.id, 30000, 2); // 60.000 en ítems

    const estado: any = await invokeHandler('getEstadoCobroVenta', venta.id);
    ok(Number(estado.deudaItems) === 60000, 'D: la deuda por ítems es 60.000', estado.deudaItems);
    ok(Number(estado.costoDelivery) === 15000, 'D: el envío de PERIFERIA es 15.000', estado.costoDelivery);
    ok(Number(estado.deudaBruta) === 75000, 'D: la deuda total incluye el envío (antes eran 60.000)', estado.deudaBruta);
    ok(Number(estado.pendienteBruto) === 75000, 'D: y el pendiente también', estado.pendienteBruto);

    // Cambiar de zona resincroniza el costo de la venta (B-7).
    await invokeHandler('delivery-actualizar-datos', delivery.id, {
      telefono: '0981123456', nombre: 'CLIENTE PRUEBA', direccion: 'OTRA CALLE 100',
      precioDeliveryId: zonaCerca.id,
    });
    const estado2: any = await invokeHandler('getEstadoCobroVenta', venta.id);
    ok(Number(estado2.costoDelivery) === 5000, 'D: al cambiar de zona baja a 5.000', estado2.costoDelivery);
    ok(Number(estado2.deudaBruta) === 65000, 'D: y la deuda total lo sigue', estado2.deudaBruta);
  }
  {
    // Con la venta cerrada, la zona no se toca sin anular el cobro.
    const { delivery, venta }: any = await crearDelivery();
    await agregarItem(venta.id, 10000);
    await cobrar(venta.id, 15000);

    let err = '';
    try {
      await invokeHandler('delivery-actualizar-datos', delivery.id, {
        telefono: '0981123456', direccion: 'X 1', precioDeliveryId: zonaLejos.id,
      });
    } catch (e: any) { err = e.message; }
    ok(/no se puede cambiar la zona de entrega/.test(err), 'D: zona bloqueada con la venta cobrada', err);
  }

  // ═══════ [E] Cancelación transaccional (A-2) ═══════
  console.log('\n[E] Cancelar revierte el cobro, el stock y los ítems');
  {
    const { delivery, venta }: any = await crearDelivery();
    await agregarItem(venta.id, 40000);
    const pago: any = await cobrar(venta.id, 45000);
    // Movimiento de stock como el que genera el cobro.
    await save(StockMovimiento, {
      cantidad: 1, tipo: 'SALIDA', referencia: venta.id, tipoReferencia: 'VENTA',
      fecha: new Date(), activo: true,
    });

    // Sin el permiso extra, no se puede cancelar una venta ya cobrada.
    usuarioActual = mozo;
    let err = '';
    try { await invokeHandler('delivery-cancelar', delivery.id, 'cliente se arrepintio'); } catch (e: any) { err = e.message; }
    ok(/VENTAS_DELIVERY_CANCELAR_COBRADO/.test(err), 'E: sin permiso no se revierte un cobro', err);
    usuarioActual = cajero;

    // El motivo es obligatorio (A-3: antes se guardaba "SIN MOTIVO" siempre).
    err = '';
    try { await invokeHandler('delivery-cancelar', delivery.id, '   '); } catch (e: any) { err = e.message; }
    ok(/Indicá el motivo/.test(err), 'E: el motivo es obligatorio', err);

    const res: any = await invokeHandler('delivery-cancelar', delivery.id, 'cliente se arrepintio');
    ok(res.delivery.estado === 'CANCELADO', 'E: el delivery queda CANCELADO', res.delivery.estado);
    ok(res.delivery.motivoCancelacion === 'CLIENTE SE ARREPINTIO', 'E: guarda el motivo real, en UPPERCASE', res.delivery.motivoCancelacion);
    ok(!!res.delivery.fechaCancelacion, 'E: estampa la fecha de cancelación');

    const ventaFinal: any = await ds.getRepository(Venta).findOneBy({ id: venta.id } as any);
    ok(ventaFinal.estado === 'CANCELADA', 'E: la venta queda CANCELADA', ventaFinal.estado);

    const items = await ds.getRepository(VentaItem).find({ where: { venta: { id: venta.id } } as any });
    ok(items.every((i: any) => i.estado === 'CANCELADO'), 'E: los ítems se cancelan', items.map((i: any) => i.estado));

    const detalles = await ds.getRepository(PagoDetalle).find({ where: { pago: { id: pago.id } } as any });
    ok(detalles.every((d: any) => d.activo === false),
      'E: las líneas de pago se dan de baja (antes quedaban activas)', detalles.map((d: any) => d.activo));

    const movs = await ds.getRepository(StockMovimiento).find({
      where: { referencia: venta.id, tipoReferencia: 'VENTA' } as any,
    });
    ok(movs.every((m: any) => m.activo === false), 'E: el stock se revierte', movs.map((m: any) => m.activo));
  }
  {
    // Cancelar es terminal y es idempotente.
    const { delivery }: any = await crearDelivery();
    await invokeHandler('delivery-cancelar', delivery.id, 'prueba');
    const repetido: any = await invokeHandler('delivery-cancelar', delivery.id, 'prueba');
    ok(repetido.estado === 'CANCELADO' || repetido.delivery?.estado === 'CANCELADO',
      'E: cancelar dos veces no rompe (idempotente)');

    let err = '';
    try { await invokeHandler('delivery-cambiar-estado', delivery.id, 'ABIERTO'); } catch (e: any) { err = e.message; }
    ok(/cancelado es definitivo/.test(err), 'E: no se puede reabrir un cancelado (B-5)', err);
  }

  // ═══════ [F] La lista no pierde pendientes de otros turnos (B-4) ═══════
  console.log('\n[F] Lista del PdV');
  {
    // Un pendiente que nació en la caja 2.
    const { delivery: viejo }: any = await crearDelivery({ cajaId: caja2.id, telefono: '0982999888' });
    await invokeHandler('delivery-cambiar-estado', viejo.id, 'EN_CAMINO', { funcionarioId: repartidor.id });

    const lista: any = await invokeHandler('delivery-listar-pdv', caja1.id, { page: 1, pageSize: 100 });
    const encontrado = lista.data.find((d: any) => d.id === viejo.id);
    ok(!!encontrado, 'F: un EN_CAMINO de otra caja sigue visible (antes desaparecía)');
    ok(encontrado?.otraCaja === true, 'F: viene marcado como de otro turno', encontrado?.otraCaja);

    const soloCaja: any = await invokeHandler('delivery-listar-pdv', caja1.id, {
      page: 1, pageSize: 100, incluirOtrasCajas: false,
    });
    ok(!soloCaja.data.some((d: any) => d.id === viejo.id), 'F: con el filtro apagado, no aparece');

    const filtrada: any = await invokeHandler('delivery-listar-pdv', caja1.id, {
      page: 1, pageSize: 100, estado: 'CANCELADO',
    });
    ok(filtrada.data.every((d: any) => d.estado === 'CANCELADO'), 'F: el filtro por estado funciona');
  }

  // ═══════ [G] Repartidores ═══════
  console.log('\n[G] Repartidores');
  {
    const lista: any = await invokeHandler('delivery-listar-repartidores');
    ok(lista.some((r: any) => r.id === repartidor.id), 'G: lista el funcionario activo');
    ok(lista.find((r: any) => r.id === repartidor.id)?.nombre === 'JUAN REPARTIDOR', 'G: con su nombre');

    const egresado: any = await save(Funcionario, {
      persona: await save(Persona, { nombre: 'EX EMPLEADO' }),
      cargo, fechaIngreso: '2026-01-01', fechaEgreso: '2026-06-01', activo: true,
    });
    const lista2: any = await invokeHandler('delivery-listar-repartidores');
    ok(!lista2.some((r: any) => r.id === egresado.id), 'G: excluye a los egresados');
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} delivery: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
