/**
 * E2E: ninguna escritura de plata entra a una caja que ya fue CERRADA.
 *
 * Reproduce el incidente del 24/09: la pestaña del PdV se quedó con la caja
 * #122 en memoria después de que se cerrara y el backend aceptó todo — 10
 * ventas, 52 cobros (con `pago.caja` de una caja y `venta.caja` de otra), 11
 * gastos y un retiro contra una caja cerrada. Acá se cierra una caja y se
 * intenta, canal por canal, seguir escribiendo contra ella.
 *
 * ── QUÉ REVERTIR PARA QUE CADA BLOQUE FALLE ────────────────────────────────
 *  [1] createVenta ................ el `assertCajaAbiertaSiVino` de la transacción
 *                                   de `crear()` en `ventas.handler.ts`
 *  [2] createPago ................. el `assertCajaAbiertaSiVino` de `createPago`
 *  [3] createPagoDetalle .......... su guard, o volver a resolver la caja del
 *                                   pago sólo `if (validarDispositivoCaja)`
 *  [4] updateVenta CONCLUIDA ...... el guard de la transición ABIERTA→CONCLUIDA
 *  [5] delivery-crear ............. el guard dentro de la transacción
 *  [6] create-gasto-caja .......... `assertCajaOperableConAjuste`
 *  [7] create-retiro-caja ......... ídem
 *  [8] pdv-egresos ................ el `errorCajaCerrada` de `validarCaja`
 *  [9] createPago({ventaId}) ...... la derivación D4 capa 1
 * [10] cobrar-venta-credito ....... su guard
 * [11] transferir-venta-pdv (Q2) .. el bloque "Invariante de caja (Q2)", o
 *                                   volver `caja: ventaOrigen.caja` en el create
 * [11c] destino con cuenta cerrada  el bloque "M1: la caja de la VENTA DESTINO
 *                                   también cuenta" de `transferirVentaPdvInternal`
 *                                   (sin él los ítems entran a una cuenta
 *                                   incobrable y el cajero se entera al cobrar)
 * [11d] gate de terminal (P1) ..... el `assertTerminalPuedeOperar(..., 'PAGO')`
 *                                   de `resolverCajaActiva`; el sub-assert del
 *                                   opt-in cae si el gate se vuelve obligatorio
 * [12] registrarCobroParcial ...... su guard
 * [13] ajuste (D6) ................ el permiso `FINANCIERO_CAJA_AJUSTAR`, el
 *                                   motivo obligatorio o el chequeo del retiro
 *                                   de cierre INGRESADO
 * [14] CANCELADA permitido ........ meter el guard donde no va (§5.2)
 * [15] edit-gasto-caja ............ su guard, o volver a `findOneBy` sin
 *                                   `relations: ['caja']` (el guard se vuelve
 *                                   un no-op silencioso)
 * [16] anular-gasto-caja .......... ídem
 * [17] materializar + fallback .... el reintento contra la única caja abierta
 * [18] cerrarVentasAbiertasMesa ... su guard
 * [19] positivo del cobro ......... un guard que mire la caja equivocada
 * [20] flujo real (D4 capa 2) ..... la reimputación de `pago.caja` en
 *                                   `updateVenta` al adoptar `data.pago`.
 *                                   ⚠️ con `ventaId` este caso pasaría igual:
 *                                   por eso se escribe SIN `ventaId`.
 *                                   El sub-bloque (b) siembra el `Pago` POR
 *                                   REPOSITORIO con la caja ya CERRADA —el
 *                                   estado real de los 52 cobros del
 *                                   incidente, que el guard de `createPago` ya
 *                                   no deja reproducir por el handler (D3)
 * [22] deviceId ajeno ............. un guard que confunda "caja de otra
 *                                   terminal" con "caja cerrada". El
 *                                   sub-assert de `createPago` (D13) cae si la
 *                                   derivación de la caja del pago deja de
 *                                   respetar la caja del payload sin `ventaId`
 * [23] anularCobroParcial ......... meterle el guard (§5.2: es una reversa)
 * [21] delivery de caja cerrada ... el guard de `createPago` (Q1); el assert
 *                                   de `cajaCerrada` cae si `delivery-listar-
 *                                   pdv` deja de seleccionar `caja.estado`
 *                                   (ahí la UI vuelve a ofrecer el cobro)
 * [24] lock en SQLite ............. el `puedeBloquear()` del helper
 * [25] exenciones §5.2 ............ meterle `assertCajaAbierta` a `deleteVenta`,
 *                                   a `delivery-cancelar`, a `generar-retiro-
 *                                   cierre-caja` o a la cascada de
 *                                   `anular-vale` sobre el `EgresoCaja`. El
 *                                   sub-assert de `anular-egreso-caja` DIRECTO
 *                                   cae si se afloja el `validarCaja` de
 *                                   `pdv-egresos` (ahí las dos mitades de la
 *                                   regla se confunden: la reversa en cascada
 *                                   pasa, el canal directo no)
 *
 * ⚠️ **Los bloques que tocan estado GLOBAL van en `try/finally`.** [17] cierra
 * TODAS las cajas abiertas para ejercitar el fallback de una sola caja abierta;
 * si algo lanzara en el medio sin reponerlas, cada bloque siguiente correría
 * contra una base distinta de la que declara (D10).
 *
 * ⚠️ El cache de permisos es por usuario con TTL de 30 s. Los asserts de
 * permiso usan DOS USUARIOS DISTINTOS (uno con `FINANCIERO_CAJA_AJUSTAR`, otro
 * sin) y `withRequestUser`, que es el camino real de `/api/rpc`. Quitarle el
 * permiso al mismo usuario entre dos asserts haría que el test pase por el
 * cache y no por el fix.
 *
 * Uso: npm run test:caja-cerrada
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { withRequestUser } from '../electron/utils/auth.utils';
import {
  assertCajaAbierta,
  leerEstadoCaja,
  cajaDeVenta,
  cajaDePago,
} from '../electron/utils/caja-abierta.utils';
import { registerVentasHandlers, materializarPedidoOnlineEnVenta } from '../electron/handlers/ventas.handler';
import { registerComprasHandlers } from '../electron/handlers/compras.handler';
import { registerCuentasPorCobrarHandlers } from '../electron/handlers/cuentas-por-cobrar.handler';
import { registerDeliveryHandlers } from '../electron/handlers/delivery.handler';
import { registerGastosCajaHandlers } from '../electron/handlers/gastos-caja.handler';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';
import { registerPdvEgresosHandlers } from '../electron/handlers/pdv-egresos.handler';
import { registerValesHandlers } from '../electron/handlers/vales.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Invoca esperando que RECHACE con `codigo` en el mensaje. */
async function rechaza(codigo: string, nombre: string, fn: () => Promise<any>) {
  try {
    await fn();
    ok(false, nombre, 'no lanzó');
  } catch (e: any) {
    ok(String(e?.message || e).includes(codigo), nombre, String(e?.message || e));
  }
}

/** Invoca esperando que FUNCIONE. */
async function permite(nombre: string, fn: () => Promise<any>): Promise<any> {
  try {
    const r = await fn();
    ok(true, nombre);
    return r;
  } catch (e: any) {
    ok(false, nombre, String(e?.message || e));
    return null;
  }
}

const CAJA_CERRADA = 'CAJA_CERRADA';

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-caja-cerrada.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[caja-cerrada] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, data: any) => R(e).save(R(e).create(data as any) as any);

  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { ConteoDetalle } = E('financiero/conteo-detalle.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaBillete } = E('financiero/moneda-billete.entity');
  const { EgresoCaja } = E('financiero/egreso-caja.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { Vale } = E('rrhh/vale.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { CajaMayor } = E('financiero/caja-mayor.entity');
  const { RetiroCaja } = E('financiero/retiro-caja.entity');
  const { GastoCaja } = E('financiero/gasto-caja.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { CobroParcial } = E('ventas/cobro-parcial.entity');
  const { CuentaPorPagar } = E('financiero/cuenta-por-pagar.entity');
  const { CuentaPorPagarCuota } = E('financiero/cuenta-por-pagar-cuota.entity');

  // ── Usuarios ─────────────────────────────────────────────────────────────
  // DOS usuarios distintos a propósito (ver el aviso del encabezado sobre el
  // cache de permisos): el gerente ajusta cajas cerradas, el cajero no.
  const permisos: Record<string, any> = {};
  for (const codigo of [
    'VENTAS_PDV', 'VENTAS_COBRAR', 'COMPRAS_GESTIONAR', 'CAJA_MAYOR_OPERAR',
    'FINANCIERO_CAJA_GESTIONAR', 'FINANCIERO_CAJA_VER', 'FINANCIERO_CAJA_AJUSTAR',
    'PDV_PAGAR_VALE', 'PDV_PAGAR_COMPRA', 'PEDIDOS_ONLINE_GESTIONAR',
    'RRHH_VALE_CONFIRMAR', 'PDV_ANULAR_EGRESO',
  ]) {
    permisos[codigo] = await save(Permission, { codigo, descripcion: codigo, activo: true });
  }
  const conRol = async (nickname: string, codigos: string[]) => {
    const u: any = await save(Usuario, { nickname, password: 'x', activo: true });
    const rol: any = await save(Role, { descripcion: nickname.toUpperCase(), activo: true });
    for (const c of codigos) await save(RolePermission, { role: rol, permission: permisos[c] });
    await save(UsuarioRole, { usuario: u, role: rol });
    return u;
  };
  // El cajero tiene TODO lo operativo y NO tiene FINANCIERO_CAJA_AJUSTAR: así
  // cada rechazo se atribuye al guard de caja y no a un permiso faltante.
  const cajero: any = await conRol('cajero', [
    'VENTAS_PDV', 'VENTAS_COBRAR', 'COMPRAS_GESTIONAR', 'CAJA_MAYOR_OPERAR',
    'FINANCIERO_CAJA_GESTIONAR', 'FINANCIERO_CAJA_VER', 'PDV_PAGAR_VALE',
    'PDV_PAGAR_COMPRA', 'PEDIDOS_ONLINE_GESTIONAR', 'RRHH_VALE_CONFIRMAR',
    'PDV_ANULAR_EGRESO',
  ]);
  const gerente: any = await conRol('gerente', [
    'VENTAS_PDV', 'VENTAS_COBRAR', 'COMPRAS_GESTIONAR', 'CAJA_MAYOR_OPERAR',
    'FINANCIERO_CAJA_GESTIONAR', 'FINANCIERO_CAJA_VER', 'FINANCIERO_CAJA_AJUSTAR',
    'PDV_PAGAR_VALE', 'PDV_PAGAR_COMPRA', 'PEDIDOS_ONLINE_GESTIONAR',
    'RRHH_VALE_CONFIRMAR', 'PDV_ANULAR_EGRESO',
  ]);

  /** Ejecuta `fn` como `usuario`, por el mismo camino que usa `/api/rpc`. */
  const como = <T>(usuario: any, fn: () => Promise<T>): Promise<T> =>
    Promise.resolve(withRequestUser(usuario, fn) as Promise<T>);

  // ── Datos base ───────────────────────────────────────────────────────────
  await save(PdvConfig, { cantidad_mesas: 0, activo: true });
  const terminal: any = await save(Dispositivo, { nombre: 'TERMINAL PRINCIPAL', activo: true });
  const tablet: any = await save(Dispositivo, { nombre: 'TABLET MOZO', activo: true });
  const gs: any = await save(Moneda, {
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
  });
  const efectivo: any = await save(FormasPago, {
    nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true,
  });
  const zona: any = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 5000, activo: true });

  // ── Un funcionario y una cuota de compra REALES (D8) ─────────────────────
  // El bloque [8] usaba `funcionarioId: 1` / `cuotaId: 1`, que no existen: el
  // assert sólo discriminaba si el guard de caja corría ANTES de la búsqueda de
  // la FK. Con filas reales, lo único que puede hacer fallar el canal es el
  // guard — que es lo que el bloque dice medir. (`validarCaja` es de hecho la
  // primera sentencia tras el `ensurePermission` en los dos handlers,
  // `pdv-egresos.handler.ts:139` y `:291`; el test ya no depende de eso.)
  const cargoBase: any = await save(Cargo, { nombre: 'CAJERO', activo: true });
  const personaFuncBase: any = await save(Persona, {
    nombre: 'FUNCIONARIO', apellido: 'DE PRUEBA', tipoPersona: 'FISICA', activo: true,
  });
  const funcionarioBase: any = await save(Funcionario, {
    persona: { id: personaFuncBase.id }, cargo: { id: cargoBase.id }, fechaIngreso: '2025-01-01',
    salarioBase: 2500000, monedaSalario: { id: gs.id }, activo: true, ipsActivo: false, esJornalero: false,
  });
  const cppBase: any = await save(CuentaPorPagar, {
    descripcion: 'COMPRA DE PRUEBA', tipo: 'COMPRA', montoTotal: 100000, montoPagado: 0,
    moneda: { id: gs.id }, fechaInicio: '2025-01-01', cantidadCuotas: 1, estado: 'ACTIVO',
  });
  const cuotaBase: any = await save(CuentaPorPagarCuota, {
    cuentaPorPagar: { id: cppBase.id }, numero: 1, fechaVencimiento: '2025-02-01',
    monto: 100000, montoPagado: 0, estado: 'PENDIENTE',
  });

  let seqMesa = 0;
  const nuevaMesa = async (): Promise<any> => await save(PdvMesa, {
    numero: ++seqMesa, estado: 'DISPONIBLE', activo: true, reservado: false,
  });

  /**
   * `Caja.conteoApertura` es NOT NULL: toda caja nace con su conteo.
   *
   * ⚠️ **Sin `dispositivoId`, la caja nace en una terminal NUEVA.** Desde la
   * Fase 2 hay un índice único parcial que prohíbe dos cajas `ABIERTO` en el
   * mismo dispositivo; este fixture antes reusaba `terminal` para todas y
   * dejaba cuatro abiertas a la vez, que es justo el estado que el PR declara
   * imposible. Cada bloque que sólo necesita "otra caja abierta" se lleva su
   * propia terminal; los que sí dependen de la terminal principal la piden
   * explícita.
   */
  let seqTerminal = 0;
  const nuevaCaja = async (dispositivoId?: number): Promise<any> => {
    const disp = dispositivoId ?? (await save(Dispositivo, {
      nombre: `TERMINAL AUX ${++seqTerminal}`, activo: true,
    })).id;
    dispositivoId = disp;
    const conteo: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
    return await save(Caja, {
      estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
      conteoApertura: { id: conteo.id }, dispositivo: { id: dispositivoId },
    });
  };
  const cerrarCaja = async (cajaId: number) => {
    await R(Caja).update(cajaId, { estado: 'CERRADO', fechaCierre: new Date() } as any);
  };

  registerVentasHandlers(ds, () => cajero);
  registerComprasHandlers(ds, () => cajero);
  registerCuentasPorCobrarHandlers(ds, () => cajero);
  registerDeliveryHandlers(ds, () => cajero);
  registerGastosCajaHandlers(ds, () => cajero);
  registerCajaMayorHandlers(ds, () => cajero);
  registerPdvEgresosHandlers(ds, () => cajero);
  registerValesHandlers(ds, () => cajero);

  // ── El escenario del bug: una caja abierta que trabaja bien, y se cierra ──
  console.log('\n[0] Fixture: la caja trabaja normal ANTES de cerrarse');
  const cajaCerrada: any = await nuevaCaja(terminal.id);
  const mesaPrevia: any = await nuevaMesa();
  const ventaPrevia: any = await permite('venta creada con la caja abierta',
    () => invokeHandler('createVenta', { estado: 'ABIERTA', caja: { id: cajaCerrada.id }, mesa: { id: mesaPrevia.id } }));
  const pagoPrevio: any = await permite('pago creado con la caja abierta',
    () => invokeHandler('createPago', { estado: 'ABIERTO', caja: { id: cajaCerrada.id }, activo: true }));
  await cerrarCaja(cajaCerrada.id);
  console.log(`  · caja #${cajaCerrada.id} CERRADA`);

  // La caja de hoy: todo lo que se rechaza contra la cerrada tiene que seguir
  // funcionando contra ésta.
  // Se reusa la terminal principal a propósito: la anterior ya está CERRADO,
  // así que el índice único parcial no se viola, y el bloque [22] necesita que
  // la caja viva NO sea la de la tablet.
  const cajaAbierta: any = await nuevaCaja(terminal.id);

  // ── 1 · createVenta ──────────────────────────────────────────────────────
  console.log('\n[1] createVenta');
  await rechaza(CAJA_CERRADA, 'no se crea una venta en la caja cerrada',
    () => invokeHandler('createVenta', { estado: 'ABIERTA', caja: { id: cajaCerrada.id } }));
  ok(
    (await R(Venta).count({ where: { caja: { id: cajaCerrada.id }, id: (ventaPrevia as any).id + 1 } as any })) === 0,
    'no quedó ninguna venta nueva en la caja cerrada',
  );

  // ── 2 · createPago ───────────────────────────────────────────────────────
  console.log('\n[2] createPago');
  await rechaza(CAJA_CERRADA, 'no se abre un pago en la caja cerrada',
    () => invokeHandler('createPago', { estado: 'ABIERTO', caja: { id: cajaCerrada.id }, activo: true }));

  // ── 3 · createPagoDetalle ────────────────────────────────────────────────
  // El `Pago` ya existía (se abrió con la caja abierta): lo que se prueba es
  // que agregar plata sobre él, con la caja ya cerrada, se rechaza. La caja se
  // resuelve server-side desde el pago, SIN depender del flag de terminal.
  console.log('\n[3] createPagoDetalle');
  await rechaza(CAJA_CERRADA, 'no se agrega una línea a un pago de caja cerrada',
    () => invokeHandler('createPagoDetalle', {
      valor: 1000, descripcion: 'COBRO DE VENTA', tipo: 'PAGO',
      pago: { id: pagoPrevio.id }, moneda: { id: gs.id }, formaPago: { id: efectivo.id }, activo: true,
    }));

  // ── 4 · updateVenta ABIERTA → CONCLUIDA ──────────────────────────────────
  console.log('\n[4] updateVenta → CONCLUIDA');
  await rechaza(CAJA_CERRADA, 'no se concluye una venta de la caja cerrada',
    () => invokeHandler('updateVenta', ventaPrevia.id, { estado: 'CONCLUIDA', fechaCierre: new Date() }));
  ok(
    (await R(Venta).findOneBy({ id: ventaPrevia.id }))?.estado === 'ABIERTA',
    'la venta sigue ABIERTA tras el rechazo',
  );

  // ── 5 · delivery-crear ───────────────────────────────────────────────────
  console.log('\n[5] delivery-crear');
  await rechaza(CAJA_CERRADA, 'no se crea un delivery en la caja cerrada',
    () => invokeHandler('delivery-crear', {
      cajaId: cajaCerrada.id, telefono: '0981123456', nombre: 'CLIENTE',
      direccion: 'AVDA SIEMPRE VIVA 742', precioDeliveryId: zona.id,
    }));

  // ── 6 · create-gasto-caja ────────────────────────────────────────────────
  console.log('\n[6] create-gasto-caja');
  await rechaza(CAJA_CERRADA, 'no se registra un gasto en la caja cerrada',
    () => invokeHandler('create-gasto-caja', {
      cajaId: cajaCerrada.id, monto: 50000, descripcion: 'HIELO',
      monedaId: gs.id, formaPagoId: efectivo.id,
    }));

  // ── 7 · create-retiro-caja ───────────────────────────────────────────────
  console.log('\n[7] create-retiro-caja');
  await rechaza(CAJA_CERRADA, 'no se registra un retiro en la caja cerrada',
    () => invokeHandler('create-retiro-caja', {
      caja: { id: cajaCerrada.id }, observacion: 'RETIRO MANUAL',
      detalles: [{ moneda: { id: gs.id }, formaPago: { id: efectivo.id }, monto: 100000 }],
    }));

  // ── 8 · egresos del cajón: mensaje unificado ─────────────────────────────
  // Estos ya exigían caja abierta; lo que se agrega es el código CAJA_CERRADA
  // para que el PdV los trate igual que a los demás.
  // ⚠️ `funcionarioId` y `cuotaId` apuntan a filas REALES (D8): con ids
  // inexistentes el rechazo podía venir del `findOne` de la FK y el assert
  // pasaba sin ejercitar el guard.
  console.log('\n[8] pdv-egresos (mensaje unificado)');
  await rechaza(CAJA_CERRADA, 'crear-vale-caja usa el código CAJA_CERRADA',
    () => invokeHandler('crear-vale-caja', {
      cajaId: cajaCerrada.id, funcionarioId: funcionarioBase.id, monedaId: gs.id,
      monto: 50000, formaPagoId: efectivo.id,
    }));
  await rechaza(CAJA_CERRADA, 'pagar-compra-cuota-caja usa el código CAJA_CERRADA',
    () => invokeHandler('pagar-compra-cuota-caja', {
      cajaId: cajaCerrada.id, cuotaId: cuotaBase.id,
      lineas: [{ monto: 1000, monedaId: gs.id, formaPagoId: efectivo.id }],
    }));

  // ── 9 · D4 capa 1: la caja del Pago sale de la VENTA ─────────────────────
  console.log('\n[9] createPago({ ventaId }) deriva la caja de la venta');
  const cajaOtra: any = await nuevaCaja(tablet.id);
  const ventaEnOtra: any = await invokeHandler('createVenta', { estado: 'ABIERTA', caja: { id: cajaOtra.id } });
  const pagoDerivado: any = await permite('el cobro con ventaId pasa',
    () => invokeHandler('createPago', {
      estado: 'ABIERTO', activo: true,
      caja: { id: cajaAbierta.id },     // la caja del PdV: NO es la de la venta
      ventaId: ventaEnOtra.id,
    }));
  ok(
    (await cajaDePago(ds, pagoDerivado?.id)) === cajaOtra.id,
    'el Pago quedó en la caja de la VENTA, no en la del payload',
    { pago: await cajaDePago(ds, pagoDerivado?.id), venta: cajaOtra.id, payload: cajaAbierta.id },
  );

  // ── 10 · cobrar-venta-credito ────────────────────────────────────────────
  console.log('\n[10] cobrar-venta-credito');
  const personaCli: any = await save(Persona, { nombre: 'CLIENTE CREDITO', tipoPersona: 'FISICA', activo: true });
  const cliente: any = await save(Cliente, {
    persona: { id: personaCli.id }, activo: true, credito: true, limite_credito: 9999999, saldoActual: 0,
  });
  const ventaCredito: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaCerrada.id }, cliente: { id: cliente.id } });
  await rechaza(CAJA_CERRADA, 'no se cierra a crédito una venta de la caja cerrada',
    () => invokeHandler('cobrar-venta-credito', {
      ventaId: ventaCredito.id, clienteId: cliente.id, montoTotal: 5000,
      monedaId: gs.id, cantidadCuotas: 1, frecuenciaDias: 30, forzar: true,
    }));
  // Positivo (D6): el mismo canal, con la caja ABIERTA, tiene que concluir. Sin
  // este assert un guard de más —mirar la caja equivocada, o exigir caja abierta
  // donde no corresponde— rompería el crédito del turno sin que nada se queje.
  {
    const ventaCreditoViva: any = await save(Venta, {
      estado: 'ABIERTA', caja: { id: cajaAbierta.id }, cliente: { id: cliente.id },
    });
    const res: any = await permite('cobrar a crédito una venta de la caja ABIERTA funciona',
      () => invokeHandler('cobrar-venta-credito', {
        ventaId: ventaCreditoViva.id, clienteId: cliente.id, montoTotal: 5000,
        monedaId: gs.id, cantidadCuotas: 1, frecuenciaDias: 30, forzar: true,
      }));
    ok(res?.success !== false, 'el handler no devolvió el rechazo de límite de crédito', res?.message);
    ok(
      (await R(Venta).findOneBy({ id: ventaCreditoViva.id }))?.estado === 'CONCLUIDA',
      'la venta a crédito quedó CONCLUIDA',
    );
  }

  // ── 11 · transferir-venta-pdv con origen cerrado (Q2) ────────────────────
  console.log('\n[11] transferir-venta-pdv · caja de origen cerrada (Q2)');
  const mkMesaConVenta = async (cajaId: number) => {
    const mesa: any = await nuevaMesa();
    const venta: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaId }, mesa: { id: mesa.id } });
    await save(VentaItem, {
      venta: { id: venta.id }, cantidad: 1, precioVentaUnitario: 20000, precioCostoUnitario: 0,
      estado: 'ACTIVO', precioAdicionales: 0, descuentoUnitario: 0, montoCubierto: 0,
    });
    await R(PdvMesa).update(mesa.id, { estado: 'OCUPADO' } as any);
    return { mesa, venta };
  };
  {
    const { mesa: origen } = await mkMesaConVenta(cajaCerrada.id);
    const destino: any = await nuevaMesa();
    await rechaza(CAJA_CERRADA, 'sin cajaActivaId (cliente viejo) se rechaza',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
      }));
  }
  {
    const { mesa: origen } = await mkMesaConVenta(cajaCerrada.id);
    const destino: any = await nuevaMesa();
    await rechaza(CAJA_CERRADA, 'con una cajaActivaId también cerrada se rechaza',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
        alcance: 'COMPLETA', cajaActivaId: cajaCerrada.id,
      }));
  }
  {
    // Rama "mover la venta entera" (re-apunte): la venta se reimputa a la caja activa.
    const { mesa: origen, venta } = await mkMesaConVenta(cajaCerrada.id);
    const destino: any = await nuevaMesa();
    const res: any = await permite('con cajaActivaId abierta la transferencia pasa',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id,
      }));
    ok(res?.reapunte === true, 'es un re-apunte (el destino estaba libre)', res);
    ok(
      (await cajaDeVenta(ds, venta.id)) === cajaAbierta.id,
      'la venta movida quedó en la caja ACTIVA, no en la cerrada',
      { venta: await cajaDeVenta(ds, venta.id), activa: cajaAbierta.id },
    );
  }
  {
    // Rama "venta destino nueva": el destino ya tiene cuenta abierta, así que
    // los ítems se mueven y la venta origen se cancela; después se repite con
    // el destino libre para verificar la venta NUEVA.
    const { mesa: origen } = await mkMesaConVenta(cajaCerrada.id);
    const destinoMesa: any = await nuevaMesa();
    const destinoVenta: any = await save(Venta, {
      estado: 'ABIERTA', caja: { id: cajaAbierta.id }, mesa: { id: destinoMesa.id },
    });
    await R(PdvMesa).update(destinoMesa.id, { estado: 'OCUPADO' } as any);
    const res: any = await permite('transferencia a un destino que ya tenía cuenta',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destinoMesa.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id,
      }));
    ok(res?.ventaDestinoId === destinoVenta.id, 'los ítems fueron a la cuenta ya abierta del destino', res);
  }
  {
    // Control: con la caja de origen ABIERTA nada cambia (no hereda la activa).
    const { mesa: origen, venta } = await mkMesaConVenta(cajaOtra.id);
    const destino: any = await nuevaMesa();
    await permite('con la caja de origen abierta la transferencia sigue igual',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id,
      }));
    ok(
      (await cajaDeVenta(ds, venta.id)) === cajaOtra.id,
      'la venta conserva SU caja: el cajaActivaId sólo actúa con el origen cerrado',
    );
  }

  // ── 11c · M1: el DESTINO ya tiene una cuenta, y su caja está cerrada ─────
  // El hueco que dejó Q2: cuando el destino ya tiene una venta abierta, los
  // ítems se mudan a ESA venta y hasta ahora nadie miraba su caja. Se podían
  // mover ítems a una cuenta imputada a una caja CERRADA y el cajero se enteraba
  // recién al cobrar, con la cuenta ya incobrable.
  //
  // ⚠️ El ORIGEN va con la caja ABIERTA a propósito: si estuviera cerrado, el
  // rechazo podría venir del guard de origen y el bloque no probaría nada.
  console.log('\n[11c] transferir-venta-pdv · el destino ya tenía cuenta en una caja CERRADA');
  {
    // (a) Sin `cajaActivaId`: se rechaza. Antes del fix la transferencia pasaba.
    const { mesa: origen } = await mkMesaConVenta(cajaAbierta.id);
    const destinoMesa: any = await nuevaMesa();
    const cajaDelDestino: any = await nuevaCaja();
    const ventaDestino: any = await save(Venta, {
      estado: 'ABIERTA', caja: { id: cajaDelDestino.id }, mesa: { id: destinoMesa.id },
    });
    await R(PdvMesa).update(destinoMesa.id, { estado: 'OCUPADO' } as any);
    await cerrarCaja(cajaDelDestino.id);

    await rechaza(CAJA_CERRADA, 'sin cajaActivaId, transferir a una cuenta de caja cerrada se rechaza',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destinoMesa.id },
        alcance: 'COMPLETA',
      }));
    ok(
      (await cajaDeVenta(ds, ventaDestino.id)) === cajaDelDestino.id,
      'la cuenta destino sigue en su caja cerrada (no se tocó nada)',
    );
    ok(
      (await R(VentaItem).count({ where: { venta: { id: ventaDestino.id } } as any })) === 0,
      'y ningún ítem entró a la cuenta incobrable',
    );

    // (b) Con una `cajaActivaId` abierta: se REIMPUTA la cuenta destino, mismo
    //     criterio que Q2. Los `Pago` ya registrados NO se mueven.
    const pagoPrevioDestino: any = await save(Pago, {
      estado: 'ABIERTO', activo: true, caja: { id: cajaDelDestino.id },
    });
    await R(Venta).update(ventaDestino.id, { pago: { id: pagoPrevioDestino.id } } as any);

    const res: any = await permite('con cajaActivaId abierta la transferencia pasa',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destinoMesa.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id,
      }));
    ok(res?.ventaDestinoId === ventaDestino.id, 'los ítems fueron a la cuenta que ya existía', res);
    ok(
      (await cajaDeVenta(ds, ventaDestino.id)) === cajaAbierta.id,
      'la cuenta destino quedó REIMPUTADA a la caja activa',
      { destino: await cajaDeVenta(ds, ventaDestino.id), activa: cajaAbierta.id },
    );
    ok(
      (await R(VentaItem).count({ where: { venta: { id: ventaDestino.id } } as any })) === 1,
      'y el ítem transferido está en ella',
    );
    ok(
      (await cajaDePago(ds, pagoPrevioDestino.id)) === cajaDelDestino.id,
      'el Pago ya registrado NO se movió (Q2: los cobros viejos se quedan donde estaban)',
      { pago: await cajaDePago(ds, pagoPrevioDestino.id), original: cajaDelDestino.id },
    );
  }
  {
    // (c) Control: con el destino en una caja ABIERTA no se reimputa nada.
    const { mesa: origen } = await mkMesaConVenta(cajaAbierta.id);
    const destinoMesa: any = await nuevaMesa();
    const cajaDelDestino: any = await nuevaCaja();
    const ventaDestino: any = await save(Venta, {
      estado: 'ABIERTA', caja: { id: cajaDelDestino.id }, mesa: { id: destinoMesa.id },
    });
    await R(PdvMesa).update(destinoMesa.id, { estado: 'OCUPADO' } as any);
    await permite('con el destino en una caja abierta la transferencia sigue igual',
      () => invokeHandler('transferir-venta-pdv', {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destinoMesa.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id,
      }));
    ok(
      (await cajaDeVenta(ds, ventaDestino.id)) === cajaDelDestino.id,
      'la cuenta destino conserva SU caja: la reimputación sólo actúa si está cerrada',
    );
  }

  // ── 11d · P1: la cajaActivaId pasa el MISMO gate de terminal que el cobro ──
  // `cajaActivaId` viene del payload. Sin gate, un cliente con VENTAS_PDV podía
  // reimputar una cuenta a cualquier caja abierta —incluida la de otra
  // terminal— y desviar el arqueo del turno. Es **opt-in con el mismo flag que
  // el cobro** (`validarDispositivoCaja`): inventar acá una política
  // obligatoria habría bloqueado la transferencia en instalaciones donde el
  // cobro entre terminales sí está permitido.
  console.log('\n[11d] transferir-venta-pdv · gate de terminal sobre cajaActivaId (P1)');
  {
    // `cajaAbierta` es de `terminal`; el request llega desde la `tablet`.
    const { mesa: origen } = await mkMesaConVenta(cajaCerrada.id);
    const destino: any = await nuevaMesa();
    await rechaza('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO',
      'con el flag, una cajaActivaId de OTRA terminal se rechaza por el gate',
      () => invokeHandlerWithContext('transferir-venta-pdv', { deviceId: tablet.id }, {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id, validarDispositivoCaja: true,
      }));
    ok(
      (await R(Venta).count({ where: { mesa: { id: destino.id } } as any })) === 0,
      'no se creó ninguna cuenta en el destino tras el rechazo del gate',
    );
  }
  {
    // Opt-in: SIN el flag, el mismo request pasa (misma semántica que el cobro).
    const { mesa: origen, venta } = await mkMesaConVenta(cajaCerrada.id);
    const destino: any = await nuevaMesa();
    await permite('sin el flag, el mismo request desde otra terminal pasa (el gate es opt-in)',
      () => invokeHandlerWithContext('transferir-venta-pdv', { deviceId: tablet.id }, {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id,
      }));
    ok(
      (await cajaDeVenta(ds, venta.id)) === cajaAbierta.id,
      'y la venta quedó reimputada a la caja activa',
    );
  }
  {
    // Y con el flag, desde la terminal DUEÑA de la caja activa, pasa.
    const { mesa: origen, venta } = await mkMesaConVenta(cajaCerrada.id);
    const destino: any = await nuevaMesa();
    await permite('con el flag, desde la terminal dueña de la caja activa, pasa',
      () => invokeHandlerWithContext('transferir-venta-pdv', { deviceId: terminal.id }, {
        origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id },
        alcance: 'COMPLETA', cajaActivaId: cajaAbierta.id, validarDispositivoCaja: true,
      }));
    ok(
      (await cajaDeVenta(ds, venta.id)) === cajaAbierta.id,
      'la venta quedó en la caja activa validada por el gate',
    );
  }


  // ── 12 · registrarCobroParcial ───────────────────────────────────────────
  console.log('\n[12] registrarCobroParcial');
  const itemCerrado: any = await save(VentaItem, {
    venta: { id: ventaPrevia.id }, cantidad: 1, precioVentaUnitario: 10000, precioCostoUnitario: 0,
    estado: 'ACTIVO', precioAdicionales: 0, descuentoUnitario: 0, montoCubierto: 0,
  });
  await rechaza(CAJA_CERRADA, 'no se registra un cobro parcial en la caja cerrada',
    () => invokeHandler('registrarCobroParcial', ventaPrevia.id, {
      imputaciones: [{ ventaItemId: itemCerrado.id, brutoCubierto: 10000 }],
      pagoDetalleIds: [], cashTotalPrincipal: 10000, factorAplicado: 1,
    }));

  // ── 13 · Ajuste post-cierre (D6) ─────────────────────────────────────────
  console.log('\n[13] Ajuste post-cierre: flag + permiso + motivo');
  // Sin el permiso: el rechazo tiene que hablar del PERMISO, no de la caja.
  await como(cajero, () => rechaza('FINANCIERO_CAJA_AJUSTAR',
    'sin FINANCIERO_CAJA_AJUSTAR el ajuste se rechaza por permiso',
    () => invokeHandler('create-gasto-caja', {
      cajaId: cajaCerrada.id, monto: 30000, descripcion: 'GASTO QUE FALTO',
      monedaId: gs.id, formaPagoId: efectivo.id, ajuste: { motivo: 'FALTABA CARGAR' },
    })));
  // Con el permiso pero sin motivo: tampoco.
  await como(gerente, () => rechaza('motivo',
    'el ajuste exige motivo no vacío',
    () => invokeHandler('create-gasto-caja', {
      cajaId: cajaCerrada.id, monto: 30000, descripcion: 'GASTO QUE FALTO',
      monedaId: gs.id, formaPagoId: efectivo.id, ajuste: { motivo: '   ' },
    })));
  // Con permiso + motivo: escribe Y deja la traza.
  const gastoAjuste: any = await como(gerente, () => permite('el gerente agrega el gasto que faltó',
    () => invokeHandler('create-gasto-caja', {
      cajaId: cajaCerrada.id, monto: 30000, descripcion: 'GASTO QUE FALTO',
      monedaId: gs.id, formaPagoId: efectivo.id, ajuste: { motivo: 'faltaba cargar' },
    })));
  {
    const c: any = await R(Caja).findOne({ where: { id: cajaCerrada.id }, relations: ['revisadoPor'] });
    ok(c?.revisado === true, 'la caja queda marcada como revisada');
    ok(c?.motivoAjuste === 'FALTABA CARGAR', 'el motivo se guarda en MAYÚSCULAS', c?.motivoAjuste);
    ok((c?.revisadoPor as any)?.id === gerente.id, 'queda quién ajustó', (c?.revisadoPor as any)?.id);
  }
  // Con la caja ABIERTA el flag se ignora (el front puede mandarlo siempre).
  await como(cajero, () => permite('con la caja abierta el flag `ajuste` se ignora',
    () => invokeHandler('create-gasto-caja', {
      cajaId: cajaAbierta.id, monto: 1000, descripcion: 'HIELO',
      monedaId: gs.id, formaPagoId: efectivo.id, ajuste: { motivo: 'IRRELEVANTE' },
    })));
  ok(
    (await R(Caja).findOneBy({ id: cajaAbierta.id }))?.revisado !== true,
    'una caja abierta NO se marca revisada por mandar el flag',
  );

  // Exención §5.2: `ingresar-retiro-caja` mueve un retiro ya existente a Caja
  // Mayor. No toca el arqueo de la caja de venta, así que funciona con la caja
  // cerrada — y bloquear ese camino dejaría la plata del cierre en el limbo.
  const cajaMayor: any = await save(CajaMayor, {
    nombre: 'CAJA MAYOR', estado: 'ABIERTA', fechaApertura: new Date(),
    responsable: { id: gerente.id }, activo: true,
  });
  const retiroFlotante: any = await save(RetiroCaja, {
    caja: { id: cajaCerrada.id }, estado: 'FLOTANTE', origen: 'MANUAL',
    fechaRetiro: new Date(), observacion: 'RETIRO PREVIO',
  });
  await como(gerente, () => permite('ingresar-retiro-caja funciona sobre una caja cerrada',
    () => invokeHandler('ingresar-retiro-caja', retiroFlotante.id, cajaMayor.id)));

  // Y con el retiro del cierre ya INGRESADO, el ajuste se bloquea (misma
  // condición que `puede-ajustar-caja`).
  const cajaConCierreIngresado: any = await nuevaCaja();
  await cerrarCaja(cajaConCierreIngresado.id);
  await save(RetiroCaja, {
    caja: { id: cajaConCierreIngresado.id }, estado: 'INGRESADO', origen: 'CIERRE',
    fechaRetiro: new Date(), fechaIngreso: new Date(), cajaMayor: { id: cajaMayor.id },
  });
  await como(gerente, () => rechaza('ya fue ingresado a Caja Mayor',
    'con el retiro de cierre INGRESADO el ajuste se bloquea',
    () => invokeHandler('create-gasto-caja', {
      cajaId: cajaConCierreIngresado.id, monto: 1000, descripcion: 'TARDE',
      monedaId: gs.id, formaPagoId: efectivo.id, ajuste: { motivo: 'TARDE' },
    })));
  // Precedencia (D16): al CAJERO, que no tiene FINANCIERO_CAJA_AJUSTAR, el
  // rechazo le tiene que llegar por el PERMISO —que es lo que efectivamente le
  // falta— y no por el retiro ya ingresado, que es un problema de otro. El
  // permiso se chequea dentro del helper, ANTES de mirar el retiro del cierre.
  {
    let msgCajero = '';
    try {
      await como(cajero, () => invokeHandler('create-gasto-caja', {
        cajaId: cajaConCierreIngresado.id, monto: 1000, descripcion: 'TARDE',
        monedaId: gs.id, formaPagoId: efectivo.id, ajuste: { motivo: 'TARDE' },
      }));
    } catch (e: any) { msgCajero = String(e?.message || e); }
    ok(msgCajero.includes('FINANCIERO_CAJA_AJUSTAR'), 'al cajero le falta el PERMISO…', msgCajero);
    ok(!/ya fue ingresado a Caja Mayor/.test(msgCajero), '…y no se le habla del retiro del cierre', msgCajero);
  }

  // Retiro con ajuste: el otro canal de D6.
  await como(gerente, () => permite('create-retiro-caja con ajuste + permiso escribe',
    () => invokeHandler('create-retiro-caja', {
      caja: { id: cajaCerrada.id }, observacion: 'RETIRO QUE FALTO',
      ajuste: { motivo: 'FALTABA EL RETIRO' },
      detalles: [{ moneda: { id: gs.id }, formaPago: { id: efectivo.id }, monto: 100000 }],
    })));

  // ── 14 · CANCELADA sigue permitida sobre caja cerrada (§5.2) ─────────────
  console.log('\n[14] Cancelar una venta de caja cerrada (exención §5.2)');
  const ventaACancelar: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaCerrada.id } });
  await permite('cancelar una venta de la caja cerrada funciona (resta, no agrega)',
    () => invokeHandler('updateVenta', ventaACancelar.id, { estado: 'CANCELADA' }));
  ok(
    (await R(Venta).findOneBy({ id: ventaACancelar.id }))?.estado === 'CANCELADA',
    'la venta quedó CANCELADA',
  );

  // ── 15/16 · edit y anular gasto ──────────────────────────────────────────
  console.log('\n[15/16] edit-gasto-caja y anular-gasto-caja');
  // Un gasto que nació con la caja abierta y ahora hay que corregir/anular.
  const cajaGastos: any = await nuevaCaja();
  const gastoVivo: any = await invokeHandler('create-gasto-caja', {
    cajaId: cajaGastos.id, monto: 12000, descripcion: 'SERVILLETAS',
    monedaId: gs.id, formaPagoId: efectivo.id,
  });
  const gastoAAnular: any = await invokeHandler('create-gasto-caja', {
    cajaId: cajaGastos.id, monto: 8000, descripcion: 'BOLSAS',
    monedaId: gs.id, formaPagoId: efectivo.id,
  });
  await cerrarCaja(cajaGastos.id);
  await como(gerente, () => rechaza(CAJA_CERRADA, 'editar un gasto de caja cerrada se rechaza',
    () => invokeHandler('edit-gasto-caja', gastoVivo.id, { monto: 15000 })));
  ok(
    Number((await R(GastoCaja).findOneBy({ id: gastoVivo.id }))?.monto) === 12000,
    'el gasto conserva su monto tras el rechazo',
  );
  await como(gerente, () => rechaza(CAJA_CERRADA, 'anular un gasto de caja cerrada se rechaza',
    () => invokeHandler('anular-gasto-caja', gastoAAnular.id, 'ERROR DE CARGA')));
  // D7: con el CAJERO (sin FINANCIERO_CAJA_AJUSTAR) el rechazo tiene que ser
  // por el PERMISO, no por la caja: mandó la llave del ajuste, así que el
  // problema ya no es "no sabías que estaba cerrada" sino "no podés ajustarla".
  // Es el orden de reglas del helper: primero la caja (sin `ajuste` → CAJA_CERRADA),
  // después el permiso (con `ajuste` → FINANCIERO_CAJA_AJUSTAR).
  {
    let msgEdit = '';
    try {
      await como(cajero, () => invokeHandler('edit-gasto-caja', gastoVivo.id, {
        monto: 15000, ajuste: { motivo: 'MONTO MAL CARGADO' },
      }));
    } catch (e: any) { msgEdit = String(e?.message || e); }
    ok(msgEdit.includes('FINANCIERO_CAJA_AJUSTAR'), 'edit con ajuste y sin permiso: habla del PERMISO', msgEdit);
    ok(!msgEdit.includes(CAJA_CERRADA), '…y NO de CAJA_CERRADA (mandó la llave)', msgEdit);

    let msgAnular = '';
    try {
      await como(cajero, () => invokeHandler('anular-gasto-caja', gastoAAnular.id, 'ERROR DE CARGA',
        { ajuste: { motivo: 'NO CORRESPONDIA' } }));
    } catch (e: any) { msgAnular = String(e?.message || e); }
    ok(msgAnular.includes('FINANCIERO_CAJA_AJUSTAR'), 'anular con ajuste y sin permiso: habla del PERMISO', msgAnular);
    ok(!msgAnular.includes(CAJA_CERRADA), '…y NO de CAJA_CERRADA', msgAnular);
  }
  ok(
    Number((await R(GastoCaja).findOneBy({ id: gastoVivo.id }))?.monto) === 12000,
    'el gasto sigue sin tocar tras los dos rechazos por permiso',
  );

  await como(gerente, () => permite('editar con ajuste + permiso funciona',
    () => invokeHandler('edit-gasto-caja', gastoVivo.id, { monto: 15000, ajuste: { motivo: 'MONTO MAL CARGADO' } })));
  ok(
    Number((await R(GastoCaja).findOneBy({ id: gastoVivo.id }))?.monto) === 15000,
    'el gasto quedó corregido',
  );
  await como(gerente, () => permite('anular con ajuste + permiso funciona',
    () => invokeHandler('anular-gasto-caja', gastoAAnular.id, 'ERROR DE CARGA', { ajuste: { motivo: 'NO CORRESPONDIA' } })));
  ok(
    (await R(GastoCaja).findOneBy({ id: gastoAAnular.id }))?.estado === 'ANULADO',
    'el gasto quedó ANULADO',
  );

  // ── 17 · materializar un pedido online con la caja elegida ya cerrada ────
  // `aceptar-pedido-online` es best-effort a propósito (el cliente ya fue
  // notificado): un rechazo seco dejaría el pedido ACEPTADO sin `Venta`.
  console.log('\n[17] materializarPedidoOnlineEnVenta · fallback (B7)');
  const nuevoPedido = async (): Promise<any> => await save(PedidoOnline, {
    numero: `PO-CC-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    tipoPedido: 'PICKUP', estado: 'ACEPTADO', canalOrigen: 'WEB', metodoPago: 'EFECTIVO',
    subtotal: 45000, costoEnvio: 0, total: 45000,
    nombreCliente: 'CLIENTE WEB', telefonoCliente: '0981999888',
  });
  // El fallback exige que haya UNA sola caja abierta, así que este bloque
  // aísla el estado global: baja las que estén abiertas y las repone al salir.
  {
    const previas: any[] = await R(Caja).find({ where: { estado: 'ABIERTO' } });
    for (const c of previas) await cerrarCaja(c.id);
    const reponer = async () => {
      for (const c of previas) {
        await R(Caja).update(c.id, { estado: 'ABIERTO', fechaCierre: null } as any);
      }
    };

    // ⚠️ `try/finally` (D10): entre el cierre global y la reposición hay
    // escrituras que pueden lanzar. Sin el `finally`, un fallo acá dejaba TODAS
    // las cajas cerradas y los bloques siguientes corrían contra una base que no
    // es la que declaran — un falso rojo (o peor, un falso verde) a diez bloques
    // de distancia de la causa.
    try {
      const cajaSola: any = await nuevaCaja();
      const pedidoA = await nuevoPedido();
      const mat: any = await permite('con la caja elegida cerrada, materializa contra la única abierta',
        () => materializarPedidoOnlineEnVenta(ds, pedidoA.id, { cajaId: cajaCerrada.id }, cajero.id));
      ok(
        mat?.ventaId != null && (await cajaDeVenta(ds, mat.ventaId)) === cajaSola.id,
        'la venta del pedido quedó en la caja abierta, no en la cerrada',
        { caja: mat?.ventaId ? await cajaDeVenta(ds, mat.ventaId) : null, esperada: cajaSola.id },
      );

      // Sin NINGUNA caja abierta: no materializa, pero devuelve un mensaje en
      // español que la bandeja de pedidos muestra tal cual.
      await cerrarCaja(cajaSola.id);
      const pedidoB = await nuevoPedido();
      let mensaje = '';
      try {
        await materializarPedidoOnlineEnVenta(ds, pedidoB.id, { cajaId: cajaCerrada.id }, cajero.id);
      } catch (e: any) { mensaje = String(e?.message || e); }
      ok(
        /no hay ninguna caja abierta/i.test(mensaje),
        'sin caja abierta devuelve un mensaje en español, no un código críptico',
        mensaje,
      );
      ok(
        (await R(PedidoOnline).findOneBy({ id: pedidoB.id }))?.ventaId == null,
        'el pedido queda sin venta (no se materializó contra la cerrada)',
      );

    } finally {
      await reponer();
    }
  }

  // ── 18 · cerrarVentasAbiertasMesa ────────────────────────────────────────
  console.log('\n[18] cerrarVentasAbiertasMesa');
  {
    const mesa: any = await nuevaMesa();
    const v: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaCerrada.id }, mesa: { id: mesa.id } });
    await rechaza(CAJA_CERRADA, 'no se concluyen las ventas de mesa de una caja cerrada',
      () => invokeHandler('cerrarVentasAbiertasMesa', mesa.id, 'CONCLUIDA'));
    ok(
      (await R(Venta).findOneBy({ id: v.id }))?.estado === 'ABIERTA',
      'ninguna venta quedó CONCLUIDA',
    );
    await permite('cancelarlas desde la mesa sigue funcionando (§5.2)',
      () => invokeHandler('cerrarVentasAbiertasMesa', mesa.id, 'CANCELADA'));
  }

  // ── 19 · Positivo: el cobro normal del turno no se rompe ─────────────────
  console.log('\n[19] Positivo · cobro completo sobre la caja ABIERTA');
  {
    const mesa: any = await nuevaMesa();
    const venta: any = await permite('venta nueva en la caja abierta',
      () => invokeHandler('createVenta', { estado: 'ABIERTA', caja: { id: cajaAbierta.id }, mesa: { id: mesa.id } }));
    const pago: any = await permite('createPago sin rechazo',
      () => invokeHandler('createPago', {
        estado: 'ABIERTO', caja: { id: cajaAbierta.id }, activo: true, ventaId: venta.id,
      }));
    await permite('createPagoDetalle sin rechazo',
      () => invokeHandler('createPagoDetalle', {
        valor: 20000, descripcion: 'COBRO DE VENTA', tipo: 'PAGO',
        pago: { id: pago.id }, moneda: { id: gs.id }, formaPago: { id: efectivo.id }, activo: true,
      }));
    await permite('updateVenta → CONCLUIDA sin rechazo',
      () => invokeHandler('updateVenta', venta.id, { estado: 'CONCLUIDA', pago, fechaCierre: new Date() }));
    ok(
      (await R(Venta).findOneBy({ id: venta.id }))?.estado === 'CONCLUIDA',
      'la venta quedó CONCLUIDA',
    );
  }

  // ── 20 · D4 capa 2: el flujo REAL de un cliente viejo ────────────────────
  // `createPago` SIN `ventaId` (es lo que manda un desktop desactualizado) con
  // la caja del PdV, y después `updateVenta(id, { pago })`. Es el assert
  // central: con `ventaId` este caso pasaría aunque la capa 2 no existiera.
  console.log('\n[20] D4 capa 2 · cobro por el flujo real, SIN ventaId');
  {
    const ventaDeOtraCaja: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaOtra.id } });
    const pagoViejo: any = await permite('createPago sin ventaId, con la caja del PdV',
      () => invokeHandler('createPago', { estado: 'ABIERTO', caja: { id: cajaAbierta.id }, activo: true }));
    ok(
      (await cajaDePago(ds, pagoViejo.id)) === cajaAbierta.id,
      'antes de adoptarlo, el Pago está en la caja del PdV (la equivocada)',
    );
    await permite('la venta adopta el pago',
      () => invokeHandler('updateVenta', ventaDeOtraCaja.id, { pago: pagoViejo }));
    ok(
      (await cajaDePago(ds, pagoViejo.id)) === cajaOtra.id,
      'updateVenta reimputó pago.caja a la caja de la VENTA',
      { pago: await cajaDePago(ds, pagoViejo.id), venta: cajaOtra.id },
    );
  }
  // (b) La pre-condición REAL del incidente (D3): el `Pago` ya estaba imputado a
  //     una caja CERRADA cuando la venta lo adoptó — es el estado en que
  //     quedaron los 52 cobros del 24/09. El guard de `createPago` ya no deja
  //     llegar a ese estado por el handler, así que el `Pago` se siembra POR
  //     REPOSITORIO, salteando el handler a propósito: lo que se mide acá es la
  //     capa 2 (`updateVenta`), que es la que tiene que reparar el dato viejo.
  {
    const cajaMuerta: any = await nuevaCaja();
    await cerrarCaja(cajaMuerta.id);
    const cajaViva: any = await nuevaCaja();
    const ventaViva: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaViva.id } });
    const pagoHuerfano: any = await save(Pago, {
      estado: 'ABIERTO', activo: true, caja: { id: cajaMuerta.id },
    });
    ok(
      (await cajaDePago(ds, pagoHuerfano.id)) === cajaMuerta.id,
      'el Pago sembrado arranca en una caja CERRADA (el estado pre-fix)',
    );
    await permite('la venta adopta un pago que venía de una caja cerrada',
      () => invokeHandler('updateVenta', ventaViva.id, { pago: pagoHuerfano }));
    ok(
      (await cajaDePago(ds, pagoHuerfano.id)) === cajaViva.id,
      'updateVenta lo reimputó a la caja ABIERTA de la venta',
      { pago: await cajaDePago(ds, pagoHuerfano.id), venta: cajaViva.id },
    );
  }

  // ── 21 · Q1 · cobrar un delivery vivo de una caja cerrada ────────────────
  console.log('\n[21] Q1 · delivery pendiente de una caja cerrada: sólo cancelar');
  {
    const deli: any = await invokeHandler('delivery-crear', {
      cajaId: cajaOtra.id, telefono: '0981555444', nombre: 'DELIVERY VIEJO',
      direccion: 'CALLE 1', precioDeliveryId: zona.id,
    });
    await cerrarCaja(cajaOtra.id);
    await rechaza(CAJA_CERRADA, 'cobrarlo se rechaza aunque el PdV tenga otra caja abierta',
      () => invokeHandler('createPago', {
        estado: 'ABIERTO', caja: { id: cajaAbierta.id }, activo: true, ventaId: deli.venta.id,
      }));
    // La lista del PdV tiene que DECIRLO en la fila: sin este dato el diálogo
    // muestra el botón de cobro y el cajero se come el rechazo recién al
    // confirmar el pago. Es lo que consume el chip «CAJA CERRADA: SOLO
    // CANCELAR» y lo que apaga el botón PAGO.
    {
      const lista: any = await invokeHandler('delivery-listar-pdv', cajaAbierta.id, { page: 1, pageSize: 50 });
      const fila = (lista?.data || []).find((d: any) => Number(d?.id) === Number(deli.delivery.id));
      ok(fila != null, 'el delivery de la caja cerrada sigue apareciendo en la lista del PdV');
      ok(fila?.cajaCerrada === true, 'y viene marcado con cajaCerrada = true', fila?.cajaCerrada);
      ok(fila?.otraCaja === true, 'además de otraCaja (es de otro turno)', fila?.otraCaja);
    }

    await permite('cancelar ese delivery sigue permitido',
      () => invokeHandler('updateVenta', deli.venta.id, { estado: 'CANCELADA' }));
  }

  // ── 22 · deviceId ajeno sobre una caja ABIERTA ───────────────────────────
  // El mozo de la PWA opera desde otra terminal. El guard nuevo no tiene que
  // confundir "caja de otra terminal" con "caja cerrada".
  console.log('\n[22] Positivo · deviceId ajeno sobre caja abierta');
  await permite('el mozo (otro deviceId) crea la venta en la caja abierta de la terminal',
    () => invokeHandlerWithContext('createVenta', { deviceId: tablet.id }, {
      estado: 'ABIERTA', caja: { id: cajaAbierta.id },
    }));
  // D13: el canal donde el pago quedaba imputado a la caja equivocada es
  // `createPago`, no `createVenta`. Sin `ventaId` la caja del payload manda, y
  // un deviceId ajeno no la cambia ni la convierte en "cerrada".
  {
    const pagoMozo: any = await permite('el mozo (otro deviceId) abre un pago en la caja abierta',
      () => invokeHandlerWithContext('createPago', { deviceId: tablet.id }, {
        estado: 'ABIERTO', caja: { id: cajaAbierta.id }, activo: true,
      }));
    ok(
      (await cajaDePago(ds, pagoMozo?.id)) === cajaAbierta.id,
      'el Pago quedó en la caja del payload (sin ventaId, es la que manda)',
      { pago: await cajaDePago(ds, pagoMozo?.id), esperada: cajaAbierta.id },
    );
    await permite('y agregarle una línea tampoco se confunde con caja cerrada',
      () => invokeHandlerWithContext('createPagoDetalle', { deviceId: tablet.id }, {
        valor: 1000, descripcion: 'COBRO DE VENTA', tipo: 'PAGO',
        pago: { id: pagoMozo.id }, moneda: { id: gs.id }, formaPago: { id: efectivo.id }, activo: true,
      }));
  }

  // ── 23 · anularCobroParcial sobre caja cerrada (§5.2) ────────────────────
  console.log('\n[23] anularCobroParcial · exención §5.2');
  {
    const cajaRonda: any = await nuevaCaja();
    const venta: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaRonda.id } });
    const item: any = await save(VentaItem, {
      venta: { id: venta.id }, cantidad: 1, precioVentaUnitario: 10000, precioCostoUnitario: 0,
      estado: 'ACTIVO', precioAdicionales: 0, descuentoUnitario: 0, montoCubierto: 0,
    });
    const ronda: any = await permite('la ronda se registra con la caja abierta',
      () => invokeHandler('registrarCobroParcial', venta.id, {
        imputaciones: [{ ventaItemId: item.id, brutoCubierto: 10000 }],
        pagoDetalleIds: [], cashTotalPrincipal: 10000, factorAplicado: 1,
      }));
    const rondaId = (await R(CobroParcial).findOne({
      where: { venta: { id: venta.id }, activo: true } as any, order: { id: 'DESC' },
    }))?.id;
    await cerrarCaja(cajaRonda.id);
    await permite('anular esa ronda con la caja ya cerrada funciona (es una reversa)',
      () => invokeHandler('anularCobroParcial', rondaId));
    ok(ronda != null, 'la ronda existía antes de anularla');
    ok(
      (await R(CobroParcial).findOneBy({ id: rondaId }))?.activo === false,
      'la ronda quedó desactivada',
    );
  }

  // ── 24 · El helper mismo: lock omitido en SQLite ─────────────────────────
  // El repo tenía dos comentarios contradictorios sobre si el driver ignora o
  // rechaza los locks. Acá queda fijado: en SQLite la rama del lock no corre y
  // `leerEstadoCaja` no lanza.
  console.log('\n[24] El helper · lock en SQLite');
  await permite('leerEstadoCaja con lock read no lanza en SQLite',
    () => ds.transaction(async (m) => leerEstadoCaja(m, cajaAbierta.id, { lock: 'read' })));
  await permite('leerEstadoCaja con lock write tampoco',
    () => ds.transaction(async (m) => leerEstadoCaja(m, cajaAbierta.id, { lock: 'write' })));
  await permite('assertCajaAbierta sobre la caja abierta pasa',
    () => assertCajaAbierta(ds, cajaAbierta.id));
  await rechaza(CAJA_CERRADA, 'assertCajaAbierta sobre una caja inexistente rechaza',
    () => assertCajaAbierta(ds, 999999));
  {
    const est = await leerEstadoCaja(ds, cajaCerrada.id);
    ok(est?.estado === 'CERRADO', 'leerEstadoCaja devuelve el estado sin relaciones', est?.estado);
    ok(est?.fechaCierre != null, 'y la fecha de cierre, que es la que sale en el mensaje');
  }
  {
    let msg = '';
    try { await assertCajaAbierta(ds, cajaCerrada.id); } catch (e: any) { msg = String(e?.message || e); }
    ok(msg.startsWith('CAJA_CERRADA:'), 'el mensaje arranca con el prefijo CAJA_CERRADA', msg);
    ok(msg.includes(`#${cajaCerrada.id}`), 'el mensaje nombra la caja', msg);
    ok(/ya fue cerrada el \d{2}\/\d{2}\/\d{4}/.test(msg), 'el mensaje dice cuándo se cerró', msg);
  }

  // ── 25 · Las exenciones de §5.2 que el guard NO puede tocar ──────────────
  // El riesgo de este PR no es sólo "falta un guard": es ponerlo de más. Cada
  // caso de acá es una operación que RESTA o que no mueve plata, y bloquearla
  // deja basura que nadie puede limpiar después (no hay reapertura de cajas):
  // ventas vacías colgadas de una mesa, deliveries eternos, vales anulados con
  // el egreso todavía descontando del cierre, y el retiro del cierre sin
  // generar. Los bloques [13], [14] y [23] ya cubren `ingresar-retiro-caja`,
  // CANCELADA y `anularCobroParcial`; acá van las cuatro que faltaban.
  console.log('\n[25] Exenciones §5.2 · lo que sigue funcionando sobre caja cerrada');

  // (a) `deleteVenta` — sólo borra ventas SIN ítems: no hay plata ni arqueo que
  //     mover. Es limpieza de mesas, no un canal de caja.
  {
    const vacia: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaCerrada.id } });
    await permite('deleteVenta borra una venta vacía de la caja cerrada',
      () => invokeHandler('deleteVenta', vacia.id));
    ok((await R(Venta).findOneBy({ id: vacia.id })) === null, 'la venta vacía se borró');

    // Y con ítems sigue fallando por los ÍTEMS. Si el guard se colara acá, el
    // mensaje cambiaría y el cajero quedaría sin saber qué tiene que sacar.
    const conItems: any = await save(Venta, { estado: 'ABIERTA', caja: { id: cajaCerrada.id } });
    await save(VentaItem, {
      venta: { id: conItems.id }, cantidad: 1, precioVentaUnitario: 5000, precioCostoUnitario: 0,
      estado: 'ACTIVO', precioAdicionales: 0, descuentoUnitario: 0, montoCubierto: 0,
    });
    let msgDel = '';
    try { await invokeHandler('deleteVenta', conItems.id); } catch (e: any) { msgDel = String(e?.message || e); }
    ok(
      /items asociados/i.test(msgDel) && !msgDel.includes(CAJA_CERRADA),
      'con ítems falla por los ÍTEMS, no por CAJA_CERRADA',
      msgDel,
    );
  }

  // (b) `delivery-cancelar` — el canal REAL del PdV (el bloque [21] cancela por
  //     `updateVenta`, que es otro camino). Es la única salida que le queda a un
  //     delivery de una caja que ya se cerró: si esto se bloqueara, el pedido
  //     quedaría vivo para siempre.
  {
    const cajaDeli: any = await nuevaCaja();
    const deli: any = await invokeHandler('delivery-crear', {
      cajaId: cajaDeli.id, telefono: '0981777666', nombre: 'DELIVERY A CANCELAR',
      direccion: 'CALLE 2', precioDeliveryId: zona.id,
    });
    await cerrarCaja(cajaDeli.id);
    const res: any = await permite('delivery-cancelar funciona con la caja ya cerrada',
      () => invokeHandler('delivery-cancelar', deli.delivery.id, 'cliente se arrepintio'));
    ok(res?.delivery?.estado === 'CANCELADO', 'el delivery quedó CANCELADO', res?.delivery?.estado);
    ok(
      (await R(Venta).findOneBy({ id: deli.venta.id }))?.estado === 'CANCELADA',
      'y su venta también',
    );
  }

  // (c) `generar-retiro-cierre-caja` (manual) — sólo tiene sentido SOBRE una
  //     caja cerrada: es la plata del cierre yendo a Caja Mayor. Además es
  //     idempotente por `conteoCierre`, que es lo que permite reintentarlo
  //     cuando el automático del cierre falló.
  {
    const cajaRetiro: any = await nuevaCaja();
    const billete: any = await save(MonedaBillete, { moneda: { id: gs.id }, valor: 100000, activo: true });
    const conteoCierre: any = await save(Conteo, { activo: true, tipo: 'CIERRE', fecha: new Date() });
    await save(ConteoDetalle, {
      conteo: { id: conteoCierre.id }, monedaBillete: { id: billete.id }, cantidad: 2, activo: true,
    });
    await R(Caja).save({
      id: cajaRetiro.id, estado: 'CERRADO', fechaCierre: new Date(),
      conteoCierre: { id: conteoCierre.id },
    } as any);

    const r1: any = await como(gerente, () => permite('generar-retiro-cierre-caja corre sobre la caja cerrada',
      () => invokeHandler('generar-retiro-cierre-caja', cajaRetiro.id)));
    const r2: any = await como(gerente, () => permite('y volver a llamarlo no falla',
      () => invokeHandler('generar-retiro-cierre-caja', cajaRetiro.id)));
    ok(r1?.id != null && r1.id === r2?.id, 'es idempotente: devuelve el MISMO retiro', { r1: r1?.id, r2: r2?.id });
    ok(
      (await R(RetiroCaja).count({ where: { caja: { id: cajaRetiro.id }, origen: 'CIERRE' } as any })) === 1,
      'quedó un solo RetiroCaja de origen CIERRE (no se duplicó)',
    );
  }

  // (d) `anular-vale` → anula en cascada el `EgresoCaja` del cajón, aunque la
  //     caja ya esté cerrada. Bloquearlo dejaría el vale ANULADO y el egreso
  //     vivo: un faltante fantasma imposible de sacar del arqueo.
  //     El contraste es el canal DIRECTO `anular-egreso-caja`, que sí exige
  //     caja abierta: las dos mitades de la regla, en el mismo bloque.
  {
    const cargo: any = await save(Cargo, { nombre: 'MOZO', activo: true });
    const personaFunc: any = await save(Persona, { nombre: 'MOZO', apellido: 'DEL TURNO', tipoPersona: 'FISICA', activo: true });
    const funcionario: any = await save(Funcionario, {
      persona: { id: personaFunc.id }, cargo: { id: cargo.id }, fechaIngreso: '2025-01-01',
      salarioBase: 2500000, monedaSalario: { id: gs.id }, activo: true, ipsActivo: false, esJornalero: false,
    });

    const cajaVale: any = await nuevaCaja();
    const creado: any = await permite('el vale se paga del cajón con la caja abierta',
      () => invokeHandler('crear-vale-caja', {
        cajaId: cajaVale.id, funcionarioId: funcionario.id, monedaId: gs.id,
        monto: 50000, formaPagoId: efectivo.id,
      }));
    await cerrarCaja(cajaVale.id);

    // El canal directo sigue exigiendo caja abierta (§5.2, ya estaba bien).
    await rechaza(CAJA_CERRADA, 'anular-egreso-caja DIRECTO sigue exigiendo caja abierta',
      () => invokeHandler('anular-egreso-caja', creado.egreso.id, 'ERROR DE CARGA'));
    ok(
      (await R(EgresoCaja).findOneBy({ id: creado.egreso.id }))?.estado === 'ACTIVO',
      'el egreso sigue ACTIVO tras el rechazo del canal directo',
    );

    // La reversa en cascada, en cambio, pasa.
    await como(gerente, () => permite('anular-vale funciona aunque su caja ya esté cerrada',
      () => invokeHandler('anular-vale', creado.vale.id, 'CARGADO POR ERROR')));
    ok(
      (await R(Vale).findOneBy({ id: creado.vale.id }))?.estado === 'ANULADO',
      'el vale quedó ANULADO',
    );
    ok(
      (await R(EgresoCaja).findOneBy({ id: creado.egreso.id }))?.estado === 'ANULADO',
      'y el EgresoCaja del cajón se anuló en cascada (sin faltante fantasma)',
    );
  }

  console.log(`\n[caja-cerrada] ${passed} OK, ${failed} fallidos`);
  await ds.destroy();
  // D15: la base temporal se borra al terminar. `nuevaDb` la borraba sólo al
  // ARRANCAR, así que entre corridas quedaban `.tmp/*.db` acumulándose.
  try { if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile); } catch { /* best-effort */ }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
