/**
 * E2E: gate de "terminal ajena" sobre una caja compartida.
 *
 * Una caja se abre en UNA terminal; cualquier otra puede unirse para lanzar
 * items. Quién puede además registrar pagos y quién puede finalizar la venta lo
 * deciden dos flags de `PdvConfig`, y este test fija la matriz completa contra
 * SQLite, invocando los handlers reales con el `deviceId` del request.
 *
 * Uso: npm run test:terminal-caja
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerComprasHandlers } from '../electron/handlers/compras.handler';
import { registerCuentasPorCobrarHandlers } from '../electron/handlers/cuentas-por-cobrar.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Invoca esperando que RECHACE con `codigo`. */
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

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-terminal-caja.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[terminal-caja] Migraciones OK.');

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
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Venta } = E('ventas/venta.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Persona } = E('personas/persona.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // Un cajero con los permisos mínimos del cobro. El gate por terminal es
  // ortogonal a los permisos: este usuario los tiene todos y aun así lo frena.
  const cajero: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'CAJERO', activo: true });
  for (const codigo of ['VENTAS_PDV', 'VENTAS_COBRAR', 'COMPRAS_GESTIONAR']) {
    const perm: any = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role: rol, permission: perm });
  }
  await save(UsuarioRole, { usuario: cajero, role: rol });

  const gs: any = await save(Moneda, {
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
  });
  const fpEfectivo: any = await save(FormasPago, {
    nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true,
  });

  const terminalDuena: any = await save(Dispositivo, { nombre: 'TERMINAL PRINCIPAL', activo: true });
  const terminalAjena: any = await save(Dispositivo, { nombre: 'TABLET MOZO', activo: true });

  const cfg: any = await save(PdvConfig, { cantidad_mesas: 5, activo: true });
  const setFlags = async (pagos: boolean, finalizar: boolean) => {
    await ds.getRepository(PdvConfig).update(cfg.id, {
      permitirPagosTerminalAjena: pagos,
      permitirFinalizarTerminalAjena: finalizar,
    } as any);
  };

  registerVentasHandlers(ds, () => cajero);
  registerComprasHandlers(ds, () => cajero);
  registerCuentasPorCobrarHandlers(ds, () => cajero);

  /** Invoca un handler como si el request viniera de `deviceId`. */
  const comoTerminal = (deviceId: number | null, canal: string, ...args: any[]) =>
    invokeHandlerWithContext(canal, deviceId == null ? undefined : { deviceId }, ...args);

  let seqMesa = 0;
  // `Caja.conteoApertura` es NOT NULL: toda caja nace con su conteo de apertura.
  const nuevaCaja = async (dispositivoId: number | null): Promise<any> => {
    const conteo: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
    return await save(Caja, {
      estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
      conteoApertura: { id: conteo.id },
      ...(dispositivoId ? { dispositivo: { id: dispositivoId } } : {}),
    });
  };
  const nuevaVenta = async (cajaId: number): Promise<any> => {
    const mesa: any = await save(PdvMesa, { numero: ++seqMesa, estado: 'DISPONIBLE', activo: true, reservado: false });
    return await save(Venta, { estado: 'ABIERTA', caja: { id: cajaId }, mesa: { id: mesa.id } });
  };
  const abrirPago = (deviceId: number | null, cajaId: number) =>
    comoTerminal(deviceId, 'createPago', {
      estado: 'ABIERTO', caja: { id: cajaId }, activo: true, validarDispositivoCaja: true,
    });
  const agregarLinea = (deviceId: number | null, pagoId: number) =>
    comoTerminal(deviceId, 'createPagoDetalle', {
      valor: 1000, descripcion: 'COBRO DE VENTA', tipo: 'PAGO',
      pago: { id: pagoId }, moneda: { id: gs.id }, formaPago: { id: fpEfectivo.id },
      activo: true, validarDispositivoCaja: true,
    });
  const finalizarVenta = (deviceId: number | null, ventaId: number) =>
    comoTerminal(deviceId, 'updateVenta', ventaId, {
      estado: 'CONCLUIDA', fechaCierre: new Date(), __validarDispositivoCaja: true,
    });

  const D = terminalDuena.id;   // dueña
  const A = terminalAjena.id;   // ajena

  // ── 1. Terminal dueña: siempre puede, con cualquier config ────────────────
  console.log('\n[1] Terminal dueña');
  await setFlags(false, false);
  {
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    const pago = await permite('dueña registra el pago', () => abrirPago(D, caja.id));
    await permite('dueña agrega la línea', () => agregarLinea(D, pago.id));
    await permite('dueña finaliza', () => finalizarVenta(D, venta.id));
  }

  // ── 2. Terminal ajena con todo apagado: la conducta previa ────────────────
  console.log('\n[2] Terminal ajena · ambos flags en false');
  {
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    await rechaza('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO', 'ajena NO registra pago',
      () => abrirPago(A, caja.id));
    await rechaza('FINALIZACION_NO_PERMITIDA_EN_ESTE_DISPOSITIVO', 'ajena NO finaliza',
      () => finalizarVenta(A, venta.id));
    await rechaza('FINALIZACION_NO_PERMITIDA_EN_ESTE_DISPOSITIVO', 'ajena NO cierra las ventas de la mesa',
      () => comoTerminal(A, 'cerrarVentasAbiertasMesa', (venta.mesa as any).id, 'CONCLUIDA', { validarDispositivoCaja: true }));

    // El hueco que existía: con el Pago ya creado por la dueña, la ajena podía
    // seguir agregando líneas porque createPagoDetalle no estaba gateado.
    const pago = await abrirPago(D, caja.id);
    await rechaza('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO', 'ajena NO agrega líneas a un pago ya abierto',
      () => agregarLinea(A, pago.id));
  }

  // ── 3. Sólo pagos habilitado: carga sí, cierre no ─────────────────────────
  console.log('\n[3] Terminal ajena · sólo pagos');
  await setFlags(true, false);
  {
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    const pago = await permite('ajena registra el pago', () => abrirPago(A, caja.id));
    await permite('ajena agrega la línea', () => agregarLinea(A, pago.id));
    await rechaza('FINALIZACION_NO_PERMITIDA_EN_ESTE_DISPOSITIVO', 'ajena sigue sin poder finalizar',
      () => finalizarVenta(A, venta.id));
    await permite('la dueña finaliza lo que cargó la ajena', () => finalizarVenta(D, venta.id));
  }

  // ── 4. Sólo finalizar habilitado ──────────────────────────────────────────
  console.log('\n[4] Terminal ajena · sólo finalizar');
  await setFlags(false, true);
  {
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    await rechaza('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO', 'ajena NO registra pago',
      () => abrirPago(A, caja.id));
    await permite('ajena finaliza', () => finalizarVenta(A, venta.id));
  }

  // ── 5. Ambos habilitados ──────────────────────────────────────────────────
  console.log('\n[5] Terminal ajena · ambos flags en true');
  await setFlags(true, true);
  {
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    const pago = await permite('ajena registra el pago', () => abrirPago(A, caja.id));
    await permite('ajena agrega la línea', () => agregarLinea(A, pago.id));
    await permite('ajena finaliza', () => finalizarVenta(A, venta.id));

    const guardada: any = await ds.getRepository(Venta).findOne({ where: { id: venta.id }, relations: ['caja'] });
    ok(guardada?.estado === 'CONCLUIDA', 'la venta quedó CONCLUIDA');
    // Lo que el gate NO cambia: la plata sigue siendo de la caja abierta.
    ok((guardada?.caja as any)?.id === caja.id, 'la venta sigue perteneciendo a la caja original');
  }

  // ── 6. Casos donde el dispositivo no se puede determinar ──────────────────
  console.log('\n[6] Dispositivo indeterminado (no se bloquea)');
  await setFlags(false, false);
  {
    // Instalación de un solo equipo: nadie configuró `deviceId`.
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    await permite('sin device en el request no se bloquea', () => abrirPago(null, caja.id));
    await permite('sin device tampoco se bloquea la finalización', () => finalizarVenta(null, venta.id));
  }
  {
    // `Caja.dispositivo` es NOT NULL en el schema, así que una caja sin
    // dispositivo no se puede crear: la rama "dispositivoCajaId == null" del
    // helper sólo se alcanza si la caja no existe (id inválido). Se verifica
    // que en ese caso tampoco bloquee, en vez de fabricar un estado imposible.
    // No se puede insertar (la FK falla), pero lo que importa es que el fallo
    // NO venga del gate: sin caja resoluble no hay dispositivo con qué comparar.
    let mensaje = '';
    try {
      await comoTerminal(A, 'createPago', {
        estado: 'ABIERTO', caja: { id: 999999 }, activo: true, validarDispositivoCaja: true,
      });
    } catch (e: any) { mensaje = String(e?.message || e); }
    ok(
      mensaje !== '' && !mensaje.includes('COBRO_NO_PERMITIDO_EN_ESTE_DISPOSITIVO'),
      'caja inexistente: el gate no es el que rechaza',
      mensaje,
    );
  }

  // ── 7. Los pagos de compra no se ven afectados ────────────────────────────
  console.log('\n[7] Compras: sin flag, sin gate');
  {
    const caja = await nuevaCaja(D);
    const pago = await permite('createPago sin validarDispositivoCaja pasa desde cualquier terminal',
      () => comoTerminal(A, 'createPago', { estado: 'ABIERTO', caja: { id: caja.id }, activo: true }));
    await permite('createPagoDetalle sin el flag tampoco se gatea',
      () => comoTerminal(A, 'createPagoDetalle', {
        valor: 500, descripcion: 'PAGO COMPRA', tipo: 'PAGO',
        pago: { id: pago.id }, moneda: { id: gs.id }, formaPago: { id: fpEfectivo.id }, activo: true,
      }));
  }

  // ── 8. Transiciones que NO son "finalizar un cobro" ───────────────────────
  console.log('\n[8] Transiciones fuera del gate');
  {
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    await permite('cancelar una venta desde la ajena no pasa por el gate',
      () => comoTerminal(A, 'updateVenta', venta.id, { estado: 'CANCELADA', __validarDispositivoCaja: true }));

    // rehabilitarVenta: CANCELADA → CONCLUIDA, desde el historial. No es un
    // cobro del PdV, así que queda deliberadamente fuera.
    await permite('rehabilitar una venta cancelada queda fuera del gate',
      () => comoTerminal(A, 'updateVenta', venta.id, { estado: 'CONCLUIDA', __validarDispositivoCaja: true }));
  }

  // ── 9. Venta a crédito ────────────────────────────────────────────────────
  console.log('\n[9] Venta a crédito');
  {
    const persona: any = await save(Persona, { nombre: 'CLIENTE TEST', tipoPersona: 'FISICA', activo: true });
    const cliente: any = await save(Cliente, {
      persona: { id: persona.id }, activo: true, credito: true, limite_credito: 999999, saldoActual: 0,
    });
    const caja = await nuevaCaja(D);
    const venta = await nuevaVenta(caja.id);
    await ds.getRepository(Venta).update(venta.id, { cliente: { id: cliente.id } } as any);

    const payload = (forzar = false) => ({
      ventaId: venta.id, clienteId: cliente.id, montoTotal: 5000, monedaId: gs.id,
      cantidadCuotas: 1, frecuenciaDias: 30, forzar, __validarDispositivoCaja: true,
    });
    await setFlags(false, false);
    await rechaza('FINALIZACION_NO_PERMITIDA_EN_ESTE_DISPOSITIVO', 'ajena NO cierra a crédito',
      () => comoTerminal(A, 'cobrar-venta-credito', payload()));
    // Sólo el flag de finalizar: la línea CREDITO no mueve el cajón
    // (`movimentaCaja: false`), así que no exige el permiso de pagos.
    await setFlags(false, true);
    await permite('con permiso de finalizar, la ajena cierra a crédito',
      () => comoTerminal(A, 'cobrar-venta-credito', payload()));
  }

  console.log(`\n[terminal-caja] ${passed} OK, ${failed} fallidos`);
  await ds.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
