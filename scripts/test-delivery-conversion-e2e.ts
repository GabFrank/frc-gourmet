/**
 * E2E de la conversión de modo de un pedido: DELIVERY ⇄ RETIRO.
 *
 * Lo que se prueba no es "cambia una columna". El modo decide **si existen** la
 * dirección, el costo de envío y el repartidor, así que convertir mueve el
 * total de la venta, desasigna a una persona, cambia la tabla de transiciones
 * que rige el pedido y sincroniza el pedido de la tienda que el cliente está
 * mirando. Cada uno de esos efectos tiene su caso acá.
 *
 * Y tres invariantes que la conversión pone en riesgo, y que son la razón por
 * la que este archivo existe aparte de `test-delivery-e2e.ts`:
 *
 *  · el candado del repartidor sólo dispara EN la transición hacia EN_CAMINO,
 *    así que convertir un pedido que YA está ahí es la última oportunidad de
 *    exigirlo;
 *  · `actualizar-datos`, `cancelar` y `asignar-repartidor` guardaban la
 *    entidad entera leída antes de su transacción — con `modo` mutable eso
 *    revierte una conversión concurrente en silencio;
 *  · la venta tiene que estar ABIERTA: convertir cambia lo que se cobra.
 *
 * Uso: npm run test:delivery-conversion
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerDeliveryHandlers, transicionesDe } from '../electron/handlers/delivery.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-delivery-conversion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[conversion] Migraciones OK.');

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
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const cajero: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'CAJERO', activo: true });
  const permPdv: any = await save(Permission, { codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true });
  await save(RolePermission, { role: rol, permission: permPdv });
  await save(UsuarioRole, { usuario: cajero, role: rol });

  // Sin VENTAS_PDV: convertir es una mutación y `/api/rpc` es default-allow, así
  // que el guard del handler es la única frontera real.
  const mirón: any = await save(Usuario, { nickname: 'miron', password: 'x', activo: true });
  const rolMirón: any = await save(Role, { descripcion: 'SOLO LECTURA', activo: true });
  await save(UsuarioRole, { usuario: mirón, role: rolMirón });

  let usuarioActual: any = cajero;

  await save(PdvConfig, { cantidad_mesas: 0 });
  const dispositivo: any = await save(Dispositivo, { nombre: 'CAJA-TEST', activo: true });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), activo: true,
    dispositivo, conteoApertura: await save(Conteo, {}),
  });
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

  const setConfig = async (patch: any) =>
    await ds.getRepository(PdvConfig).update({}, patch);

  const crearDelivery = async (over: any = {}) => await invokeHandler('delivery-crear', {
    cajaId: caja.id,
    telefono: '0981123456',
    nombre: 'CLIENTE PRUEBA',
    direccion: 'AVDA SIEMPRE VIVA 742',
    precioDeliveryId: zonaCerca.id,
    ...over,
  });

  const convertir = (id: number, payload: any) => invokeHandler('delivery-convertir-modo', id, payload);

  const agregarItem = async (ventaId: number, precio: number, cantidad = 1) => {
    await save(VentaItem, {
      venta: { id: ventaId }, cantidad, precioVentaUnitario: precio,
      estado: 'ACTIVO', precioAdicionales: 0, descuentoUnitario: 0, montoCubierto: 0,
      precioCostoUnitario: 0,
    });
    return precio * cantidad;
  };

  const leerDelivery = (id: number) => ds.getRepository(Delivery).findOne({
    where: { id }, relations: ['precioDelivery', 'entregadoPorFuncionario'],
  }) as any;
  const leerVenta = (deliveryId: number) => ds.getRepository(Venta).findOne({
    where: { delivery: { id: deliveryId } },
  }) as any;

  const err = async (fn: () => Promise<any>): Promise<string> => {
    try { await fn(); return ''; } catch (e: any) { return e?.message ?? String(e); }
  };

  // ═══════ [A] DELIVERY → RETIRO ═══════
  console.log('\n[A] De reparto a retiro: se va todo lo que depende de que alguien lo lleve');
  {
    const res: any = await crearDelivery();
    await invokeHandler('delivery-asignar-repartidor', res.delivery.id, repartidor.id);

    const conv: any = await convertir(res.delivery.id, { modo: 'RETIRO' });
    ok(conv?.delivery?.modo === 'RETIRO', 'A: el pedido queda en modo RETIRO', conv?.delivery?.modo);
    ok(conv?.modoAnterior === 'DELIVERY', 'A: informa el modo del que venía', conv?.modoAnterior);
    ok(conv?.repartidorDesasignado === 'JUAN REPARTIDOR',
      'A: informa a quién se desasignó', conv?.repartidorDesasignado);

    const d = await leerDelivery(res.delivery.id);
    ok(d.direccion === null, 'A: la dirección se BORRA de verdad (null, no undefined)', d.direccion);
    ok(d.precioDelivery === null, 'A: la zona de entrega se borra', d.precioDelivery);
    ok(d.entregadoPorFuncionario === null, 'A: el repartidor se desasigna', d.entregadoPorFuncionario);

    const v = await leerVenta(res.delivery.id);
    ok(Number(v.costoDelivery) === 0, 'A: la venta deja de cobrar el envío', v.costoDelivery);
  }

  // ═══════ [B] RETIRO → DELIVERY ═══════
  console.log('\n[B] De retiro a reparto: aparecen dirección, zona y envío');
  {
    const res: any = await crearDelivery({ modo: 'RETIRO', direccion: '', nombre: 'MARIA' });
    ok(Number(res.venta.costoDelivery) === 0, 'B: nace sin envío', res.venta.costoDelivery);

    const conv: any = await convertir(res.delivery.id, {
      modo: 'DELIVERY', direccion: 'calle falsa 123', precioDeliveryId: zonaLejos.id,
    });
    ok(conv?.delivery?.modo === 'DELIVERY', 'B: el pedido queda en modo DELIVERY', conv?.delivery?.modo);

    const d = await leerDelivery(res.delivery.id);
    ok(d.direccion === 'CALLE FALSA 123', 'B: guarda la dirección en UPPERCASE', d.direccion);
    ok(d.precioDelivery?.id === zonaLejos.id, 'B: asigna la zona elegida', d.precioDelivery?.id);

    const v = await leerVenta(res.delivery.id);
    ok(Number(v.costoDelivery) === 15000, 'B: congela el envío de la zona en la venta', v.costoDelivery);
  }
  {
    // Sin dirección y con el candado activo, no se convierte.
    await setConfig({ deliveryRequiereDireccion: true });
    const res: any = await crearDelivery({ modo: 'RETIRO', direccion: '', nombre: 'PEDRO' });
    const e = await err(() => convertir(res.delivery.id, { modo: 'DELIVERY', precioDeliveryId: zonaCerca.id }));
    ok(/dirección de entrega es obligatoria/.test(e), 'B: rechaza convertir a delivery sin dirección', e);

    // El mismo candado NO aplica al editar un retiro: no hay dirección que
    // exigirle a un pedido que nadie lleva a ningún lado.
    const e2 = await err(() => invokeHandler('delivery-actualizar-datos', res.delivery.id, {
      nombre: 'PEDRO', telefono: '0981123456', observacion: 'SIN CEBOLLA',
    }));
    ok(e2 === '', 'B: editar los datos de un RETIRO no exige dirección', e2);
    await setConfig({ deliveryRequiereDireccion: false });
  }
  {
    // → RETIRO sin nombre en ningún lado: el nombre reemplaza a la dirección
    // como lo que identifica la bolsa en el mostrador.
    const res: any = await crearDelivery({ nombre: '' });
    const e = await err(() => convertir(res.delivery.id, { modo: 'RETIRO' }));
    ok(/nombre del cliente es obligatorio/.test(e), 'B: → RETIRO sin nombre se rechaza', e);

    const conv: any = await convertir(res.delivery.id, { modo: 'RETIRO', nombre: 'ana lopez' });
    ok(conv?.delivery?.nombre === 'ANA LOPEZ', 'B: el nombre del payload se guarda en UPPERCASE', conv?.delivery?.nombre);
    const v = await leerVenta(res.delivery.id);
    ok(v.nombreCliente === 'ANA LOPEZ', 'B: y se sincroniza en la venta', v.nombreCliente);
  }

  // ═══════ [C] Guardas de estado y de cobro ═══════
  console.log('\n[C] Cuándo NO se convierte');
  {
    // Venta CONCLUIDA: convertir cambiaría lo que ya se cobró.
    const res: any = await crearDelivery();
    const pago: any = await save(Pago, {});
    await save(PagoDetalle, {
      pago, moneda, formaPago, valor: 50000, tipo: 'PAGO', descripcion: 'EFECTIVO', activo: true,
    });
    await ds.getRepository(Venta).update({ id: res.venta.id } as any, {
      estado: 'CONCLUIDA', pago, fechaCierre: new Date(),
    } as any);

    const e = await err(() => convertir(res.delivery.id, { modo: 'RETIRO' }));
    ok(/ya está CONCLUIDA/.test(e), 'C: con la venta cobrada se rechaza', e);
    ok(/Anulá el cobro/.test(e), 'C: y el mensaje dice qué hacer', e);
  }
  {
    // ENTREGADO y CANCELADO son terminales.
    const res: any = await crearDelivery();
    await invokeHandler('delivery-cancelar', res.delivery.id, 'cliente se arrepintió');
    const e = await err(() => convertir(res.delivery.id, { modo: 'RETIRO' }));
    ok(/CANCELADO ya no se puede convertir/.test(e), 'C: un cancelado no se convierte', e);

    // Y el chequeo de terminal va ANTES que la idempotencia: convertir "al
    // mismo modo" un cancelado tiene que fallar igual, no devolver éxito.
    const e2 = await err(() => convertir(res.delivery.id, { modo: 'DELIVERY' }));
    ok(/CANCELADO ya no se puede convertir/.test(e2),
      'C: convertir al MISMO modo un cancelado también se rechaza', e2);
  }
  {
    // Idempotencia sobre un pedido vivo: mismo modo, sin cambios.
    const res: any = await crearDelivery();
    const conv: any = await convertir(res.delivery.id, { modo: 'DELIVERY' });
    ok(conv?.sinCambios === true, 'C: convertir al mismo modo es un no-op', conv?.sinCambios);
    const v = await leerVenta(res.delivery.id);
    ok(Number(v.costoDelivery) === 5000, 'C: y no toca el envío ya congelado', v.costoDelivery);
  }
  {
    const e = await err(() => convertir(1, { modo: 'TAKEAWAY' }));
    ok(/Modo de pedido inválido/.test(e), 'C: un modo inexistente se rechaza', e);
  }
  {
    // Permiso: `/api/rpc` es default-allow, el guard del handler es la frontera.
    const res: any = await crearDelivery();
    usuarioActual = mirón;
    const e = await err(() => convertir(res.delivery.id, { modo: 'RETIRO' }));
    ok(/permiso|FORBIDDEN|denegad/i.test(e), 'C: sin VENTAS_PDV se rechaza', e);
    usuarioActual = cajero;
  }

  // ═══════ [D] El candado del repartidor ═══════
  console.log('\n[D] El hueco del candado del repartidor');
  {
    await setConfig({ deliveryRequiereRepartidor: true, deliveryRepartidorEtapa: 'EN_CAMINO' });

    // Un retiro que ya salió (sólo se llega ahí convirtiendo un reparto).
    const res: any = await crearDelivery();
    await invokeHandler('delivery-cambiar-estado', res.delivery.id, 'PARA_ENTREGA');
    await invokeHandler('delivery-cambiar-estado', res.delivery.id, 'EN_CAMINO', { funcionarioId: repartidor.id });
    await convertir(res.delivery.id, { modo: 'RETIRO' });

    const d = await leerDelivery(res.delivery.id);
    ok(d.estado === 'EN_CAMINO', 'D: convertir NO retrocede el estado', d.estado);
    ok(d.entregadoPorFuncionario === null, 'D: pero sí desasigna al repartidor', d.entregadoPorFuncionario);

    // Volver a DELIVERY estando EN_CAMINO: esa transición ya no se vuelve a
    // atravesar, así que es la última vez que se puede exigir el repartidor.
    const e = await err(() => convertir(res.delivery.id, {
      modo: 'DELIVERY', direccion: 'calle falsa 123', precioDeliveryId: zonaCerca.id,
    }));
    ok(/elegí el repartidor/.test(e), 'D: → DELIVERY estando EN_CAMINO exige el repartidor', e);

    const conv: any = await convertir(res.delivery.id, {
      modo: 'DELIVERY', direccion: 'calle falsa 123', precioDeliveryId: zonaCerca.id,
      funcionarioId: repartidor.id,
    });
    ok(conv?.delivery?.modo === 'DELIVERY', 'D: con el repartidor sí convierte', conv?.delivery?.modo);
    const d2 = await leerDelivery(res.delivery.id);
    ok(d2.entregadoPorFuncionario?.id === repartidor.id, 'D: y lo deja asignado', d2.entregadoPorFuncionario?.id);
  }
  {
    // Desde ABIERTO el candado NO se pide: el pedido todavía tiene que
    // atravesar EN_CAMINO, que es donde dispara.
    const res: any = await crearDelivery({ modo: 'RETIRO', direccion: '', nombre: 'LUIS' });
    const conv: any = await convertir(res.delivery.id, {
      modo: 'DELIVERY', direccion: 'calle falsa 123', precioDeliveryId: zonaCerca.id,
    });
    ok(conv?.delivery?.modo === 'DELIVERY', 'D: desde ABIERTO no hace falta repartidor', conv?.delivery?.modo);

    const e = await err(() => invokeHandler('delivery-cambiar-estado', res.delivery.id, 'EN_CAMINO'));
    ok(/Seleccioná el repartidor/.test(e), 'D: y el candado sigue vivo al enviarlo', e);
    await setConfig({ deliveryRequiereRepartidor: false });
  }
  {
    // Un retiro no tiene repartidor: asignarlo sería registrar a alguien que
    // no participa. El front lo esconde; el backend lo valida.
    const res: any = await crearDelivery({ modo: 'RETIRO', direccion: '', nombre: 'SOFIA' });
    const e = await err(() => invokeHandler('delivery-asignar-repartidor', res.delivery.id, repartidor.id));
    ok(/no tiene repartidor/.test(e), 'D: no se le asigna repartidor a un retiro', e);
  }

  // ═══════ [E] La tabla de transiciones cambia con el modo ═══════
  console.log('\n[E] Convertir cambia qué transiciones son legales');
  {
    ok(!transicionesDe('RETIRO')['ABIERTO'].includes('EN_CAMINO' as any),
      'E: un retiro no ofrece EN_CAMINO desde ABIERTO');
    ok(transicionesDe('DELIVERY')['ABIERTO'].includes('EN_CAMINO' as any),
      'E: un delivery sí');
    // Un retiro sólo llega a EN_CAMINO por conversión. Sin la vuelta a
    // PARA_ENTREGA no había forma de reflejar que el repartidor dio la vuelta.
    ok(transicionesDe('RETIRO')['EN_CAMINO'].includes('PARA_ENTREGA' as any),
      'E: un retiro EN_CAMINO puede volver a PARA_ENTREGA');

    const res: any = await crearDelivery();
    await convertir(res.delivery.id, { modo: 'RETIRO' });
    const e = await err(() => invokeHandler('delivery-cambiar-estado', res.delivery.id, 'EN_CAMINO'));
    ok(/Transición no permitida/.test(e), 'E: el backend rechaza EN_CAMINO sobre el retiro convertido', e);
  }

  // ═══════ [F] El pedido de la tienda se sincroniza ═══════
  console.log('\n[F] Pedidos que entraron por la tienda online');
  {
    const res: any = await crearDelivery();
    const pedido: any = await save(PedidoOnline, {
      numero: 'W-001', tipoPedido: 'DELIVERY', estado: 'ACEPTADO', canalOrigen: 'WEB',
      metodoPago: 'EFECTIVO', subtotal: 80000, costoEnvio: 5000, total: 85000,
      nombreCliente: 'CLIENTE PRUEBA', telefonoCliente: '0981123456',
      direccionEntrega: 'AVDA SIEMPRE VIVA 742', referenciaDireccion: 'PORTON VERDE',
      ventaId: res.venta.id, deliveryId: res.delivery.id,
    });

    await convertir(res.delivery.id, { modo: 'RETIRO' });
    const p1: any = await ds.getRepository(PedidoOnline).findOne({ where: { id: pedido.id } });
    ok(p1.tipoPedido === 'PICKUP', 'F: el pedido web pasa a PICKUP', p1.tipoPedido);
    ok(Number(p1.costoEnvio) === 0, 'F: sin costo de envío', p1.costoEnvio);
    ok(Number(p1.total) === 80000, 'F: el total baja al subtotal', p1.total);
    ok(p1.direccionEntrega === null, 'F: se limpia la dirección de entrega', p1.direccionEntrega);
    ok(p1.referenciaDireccion === null, 'F: y la referencia', p1.referenciaDireccion);

    await convertir(res.delivery.id, {
      modo: 'DELIVERY', direccion: 'otra calle 456', precioDeliveryId: zonaLejos.id,
    });
    const p2: any = await ds.getRepository(PedidoOnline).findOne({ where: { id: pedido.id } });
    ok(p2.tipoPedido === 'DELIVERY', 'F: y vuelve a DELIVERY', p2.tipoPedido);
    ok(Number(p2.costoEnvio) === 15000, 'F: con el envío de la zona nueva', p2.costoEnvio);
    ok(Number(p2.total) === 95000, 'F: y el total actualizado', p2.total);
    ok(p2.direccionEntrega === 'OTRA CALLE 456', 'F: con la dirección nueva', p2.direccionEntrega);
  }
  {
    // Un delivery de la tienda nace SIN zona del PdV y con envío cobrado igual
    // (el costo viene congelado del pedido). Convertirlo de ida y vuelta no
    // puede confundir ese `null` con «SIN CARGO».
    const res: any = await crearDelivery({ precioDeliveryId: null });
    await ds.getRepository(Venta).update({ id: res.venta.id } as any, { costoDelivery: 12000 } as any);
    const d0 = await leerDelivery(res.delivery.id);
    ok(d0.precioDelivery === null, 'F: el delivery web no tiene zona del PdV', d0.precioDelivery);

    await convertir(res.delivery.id, { modo: 'RETIRO' });
    const conv: any = await convertir(res.delivery.id, {
      modo: 'DELIVERY', direccion: 'calle falsa 123', precioDeliveryId: zonaCerca.id,
    });
    ok(conv?.delivery?.modo === 'DELIVERY', 'F: se convierte igual sin zona previa');
    const v = await leerVenta(res.delivery.id);
    ok(Number(v.costoDelivery) === 5000, 'F: y toma el envío de la zona elegida, no el 0 heredado', v.costoDelivery);
  }

  // ═══════ [G] Aviso de cobro ═══════
  console.log('\n[G] Aviso cuando lo cobrado supera el total nuevo');
  {
    const res: any = await crearDelivery();
    await agregarItem(res.venta.id, 20000);
    // Ronda de cobro parcial que cubre ítems + envío (20.000 + 5.000).
    await ds.getRepository(VentaItem).update(
      { venta: { id: res.venta.id } } as any, { montoCubierto: 25000 } as any,
    );

    const conv: any = await convertir(res.delivery.id, { modo: 'RETIRO' });
    ok(!!conv?.advertencia, 'G: devuelve el aviso', conv?.advertencia);
    ok(Math.round(conv.advertencia.excedente) === 5000,
      'G: el excedente es justo el envío que dejó de cobrarse', conv?.advertencia?.excedente);
    ok(Math.round(conv.advertencia.deudaBruta) === 20000,
      'G: la deuda nueva son sólo los ítems', conv?.advertencia?.deudaBruta);
  }
  {
    // Sin plata cobrada no hay aviso que dar.
    const res: any = await crearDelivery();
    await agregarItem(res.venta.id, 20000);
    const conv: any = await convertir(res.delivery.id, { modo: 'RETIRO' });
    ok(conv?.advertencia === null, 'G: sin cobros no hay aviso', conv?.advertencia);
  }

  // ═══════ [H] El modo y el envío no se despegan ═══════
  console.log('\n[H] Ningún handler vecino deja el modo y el envío incoherentes');
  {
    // Los tres handlers que mutan el `Delivery` guardan la entidad ENTERA. Si
    // alguno vuelve a leerla fuera de su transacción, escribe de vuelta el
    // `modo` que leyó y revierte una conversión concurrente — mientras
    // `venta.costoDelivery`, que la conversión ya movió, se queda como está.
    //
    // La carrera en sí se prueba sobre Postgres (`npm run test:locks-pg`),
    // donde el lock existe y se puede forzar el orden. Acá se fija el
    // invariante que sí es determinista en SQLite: después de pasar por cada
    // handler, el modo y el envío siguen contando la misma historia.
    const coherente = async (deliveryId: number, esperado: string, envioEsperado: number, nombre: string) => {
      const d = await leerDelivery(deliveryId);
      const v = await leerVenta(deliveryId);
      ok(d.modo === esperado && Number(v.costoDelivery) === envioEsperado,
        nombre, { modo: d.modo, envio: v.costoDelivery });
    };

    const res: any = await crearDelivery();
    await convertir(res.delivery.id, { modo: 'RETIRO' });

    await invokeHandler('delivery-actualizar-datos', res.delivery.id, {
      nombre: 'CLIENTE PRUEBA', telefono: '0981123456', observacion: 'TOCAR TIMBRE',
    });
    await coherente(res.delivery.id, 'RETIRO', 0, 'H: editar los datos no despega el modo del envío');

    await invokeHandler('delivery-asignar-repartidor', res.delivery.id, null);
    await coherente(res.delivery.id, 'RETIRO', 0, 'H: limpiar el repartidor tampoco');

    await invokeHandler('delivery-cambiar-estado', res.delivery.id, 'PARA_ENTREGA');
    await coherente(res.delivery.id, 'RETIRO', 0, 'H: ni cambiar de estado');

    // Y en el sentido inverso: convertir a delivery deja el envío de la zona.
    await convertir(res.delivery.id, {
      modo: 'DELIVERY', direccion: 'calle falsa 123', precioDeliveryId: zonaCerca.id,
    });
    await invokeHandler('delivery-actualizar-datos', res.delivery.id, {
      nombre: 'CLIENTE PRUEBA', telefono: '0981123456', direccion: 'CALLE FALSA 123',
    });
    await coherente(res.delivery.id, 'DELIVERY', 5000, 'H: y al revés, el envío sobrevive a la edición');
  }

  // ═══════ [I] `updateDelivery` sigue sin poder tocar el modo ═══════
  console.log('\n[I] El merge crudo sigue rechazando el modo');
  {
    const res: any = await crearDelivery();
    const e = await err(() => invokeHandler('updateDelivery', res.delivery.id, { modo: 'RETIRO' }));
    ok(/no puede modificar modo/.test(e), 'I: updateDelivery rechaza el modo', e);
    ok(/delivery-actualizar-datos|delivery-cambiar-estado/.test(e), 'I: y apunta a los canales reales', e);
  }

  // ═══════ [J] Vaciar campos de verdad ═══════
  console.log('\n[J] `actualizar-datos` puede vaciar campos');
  {
    const res: any = await crearDelivery({ observacion: 'TOCAR TIMBRE' });
    await invokeHandler('delivery-actualizar-datos', res.delivery.id, {
      nombre: 'CLIENTE PRUEBA', telefono: '0981123456', direccion: '', observacion: '',
    });
    const d = await leerDelivery(res.delivery.id);
    // Antes esto asignaba `undefined`, y TypeORM no emite UPDATE para
    // `undefined`: el dato viejo quedaba pegado sin que nadie lo notara.
    ok(d.direccion === null, 'J: vaciar la dirección la borra de verdad', d.direccion);
    ok(d.observacion === null, 'J: y la observación también', d.observacion);
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} delivery-conversion: ${passed} pasaron, ${failed} fallaron`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
