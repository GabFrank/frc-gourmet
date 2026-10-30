/**
 * E2E de las fichas de cantina (venta directa).
 *
 * Cubre el plan de fichas de cantina, con foco en los riesgos que marcó la
 * auditoría del plan:
 *
 *  - el gate (sólo venta directa, y el refactor de los gates de cocina sin
 *    regresión);
 *  - la numeración POR VENTA, con fixtures de VARIOS ítems (un solo ítem
 *    esconde una numeración por ítem);
 *  - el claim idempotente bajo CONCURRENCIA real (`Promise.all`);
 *  - que `updateVenta` no deje al cliente resetear el claim ni bajar
 *    `fichasCantidad` para esquivar el guard de cancelación;
 *  - el camino a crédito SIN pagaré (antes todo lo impreso colgaba del `if`
 *    del pagaré);
 *  - una ficha por trabajo de impresión, y ticket ANTES que fichas.
 *
 * La impresora se reemplaza con `__setFichasPrintImplsForTests`: los tests ven
 * cada trabajo que se mandaría, en orden, sin hardware.
 *
 * ⚠️ Corre sólo sobre SQLite. El claim usa QueryBuilder + `affected`, el mismo
 * patrón que ya corre en Postgres en `motor.ts`, pero acá no se verifica.
 *
 * Uso: npm run test:fichas
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers, crearComandaItemsSiCorresponde } from '../electron/handlers/ventas.handler';
import { registerCuentasPorCobrarHandlers } from '../electron/handlers/cuentas-por-cobrar.handler';
import {
  registerDocumentosTicketsHandlers,
  buildFichasVenta,
  imprimirFichasSiCorresponde,
  imprimirPostConclusion,
  resolverFichaModo,
  __setFichasPrintImplsForTests,
} from '../electron/handlers/documentos-tickets.handler';
import { esVentaDirecta } from '../electron/utils/venta-directa.utils';
import type { TicketLine } from '../electron/utils/ticket.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function rechaza(patron: RegExp, nombre: string, fn: () => Promise<any>) {
  try {
    await fn();
    ok(false, nombre, 'no lanzó');
  } catch (e: any) {
    ok(patron.test(String(e?.message || e)), nombre, String(e?.message || e));
  }
}

/** Texto plano de una ficha, para buscar en ella. */
const texto = (lines: TicketLine[]): string =>
  lines.map((l: any) => {
    if (l.type === 'text') return l.text;
    if (l.type === 'kv') return `${l.key} ${l.value}`;
    if (l.type === 'columns') return l.cols.map((c: any) => c.text).join(' ');
    return '';
  }).join('\n');

/** Espera (sin `sleep` del shell) a que una condición async se cumpla. */
async function esperar(cond: () => Promise<boolean>, ms = 3000): Promise<boolean> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await cond()) return true;
    await new Promise(r => setTimeout(r, 25));
  }
  return false;
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-fichas.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[fichas] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
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
  const { Moneda } = E('financiero/moneda.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { Pago } = E('compras/pago.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Adicional } = E('productos/adicional.entity');
  const { VentaItemAdicional } = E('ventas/venta-item-adicional.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { Producto } = E('productos/producto.entity');
  const { Printer } = E('printer.entity');
  const { Sector } = E('ventas/sector.entity');
  const { ProductoSector } = E('productos/producto-sector.entity');
  const { ComandaItem } = E('ventas/comanda-item.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // Cajero: opera el PdV y reimprime fichas (como el rol plantilla), pero NO
  // cancela ventas con fichas. Gerente: todo.
  const permiso = async (codigo: string) => save(Permission, { codigo, descripcion: codigo, activo: true });
  const pPdv: any = await permiso('VENTAS_PDV');
  const pReimp: any = await permiso('DOCUMENTOS_REIMPRIMIR_FICHAS');
  const pCancel: any = await permiso('VENTAS_CANCELAR_CON_FICHAS');
  const mkUsuario = async (nick: string, perms: any[]) => {
    const u: any = await save(Usuario, { nickname: nick, password: 'x', activo: true });
    const r: any = await save(Role, { descripcion: nick.toUpperCase(), activo: true });
    for (const p of perms) await save(RolePermission, { role: r, permission: p });
    await save(UsuarioRole, { usuario: u, role: r });
    return u;
  };
  const cajero: any = await mkUsuario('cajero', [pPdv, pReimp]);
  const gerente: any = await mkUsuario('gerente', [pPdv, pReimp, pCancel]);
  const mozo: any = await mkUsuario('mozo', [pPdv]);
  let usuarioActual: any = cajero;

  await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 });
  await save(FormasPago, { nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true });
  const cfg: any = await save(PdvConfig, { cantidad_mesas: 5, activo: true, autoImprimirTicketVenta: false });
  const setCfg = (data: any) => ds.getRepository(PdvConfig).update(cfg.id, data);

  // Impresora default: `getPrinterByRol` cae a `isDefault` cuando el
  // dispositivo no tiene una propia.
  await save(Printer, {
    name: 'TERMICA BARRA', type: 'EPSON', connectionType: 'network', address: '127.0.0.1',
    width: 48, isDefault: true,
  });

  const dispositivo: any = await save(Dispositivo, { nombre: 'CAJA EVENTO', activo: true });
  const conteo: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
    conteoApertura: { id: conteo.id }, dispositivo: { id: dispositivo.id },
  });

  const cerveza: any = await save(Producto, { nombre: 'CERVEZA PILSEN', tipo: 'RETAIL', activo: true });
  const gaseosa: any = await save(Producto, { nombre: 'GASEOSA', tipo: 'RETAIL', activo: true });
  const balde: any = await save(Producto, { nombre: 'BALDE 6 CERVEZAS', tipo: 'RETAIL', activo: true, fichaModo: 'POR_ITEM' });
  const entrada: any = await save(Producto, { nombre: 'ENTRADA', tipo: 'RETAIL', activo: true, fichaModo: 'NO_IMPRIME' });
  const asado: any = await save(Producto, { nombre: 'ASADO POR KILO', tipo: 'RETAIL', activo: true });

  registerVentasHandlers(ds, () => usuarioActual);
  registerCuentasPorCobrarHandlers(ds, () => usuarioActual);
  registerDocumentosTicketsHandlers(ds, () => usuarioActual);

  // Impresora simulada: registra cada trabajo y el ticket de venta.
  const trabajos: { tipo: 'FICHA' | 'TICKET'; ventaId?: number; texto: string; cutAtEnd?: boolean }[] = [];
  // Trabajos de impresión de fichas (uno por tanda): la térmica perdía el
  // principio de un trabajo que llegaba mientras cortaba el anterior.
  let trabajosFichas = 0;
  let fallar = false;
  __setFichasPrintImplsForTests({
    printSpecs: async (_p: any, specs: any[]) => {
      if (fallar) return { ok: false, error: 'SIN PAPEL' };
      trabajosFichas++;
      for (const spec of specs) trabajos.push({ tipo: 'FICHA', texto: texto(spec.lines), cutAtEnd: spec.cutAtEnd });
      return { ok: true };
    },
    printVentaTicket: async (_ds: any, ventaId: number) => {
      // Más lento que una ficha a propósito: si el orden dependiera de quién
      // termina primero, las fichas saldrían antes que el ticket.
      await new Promise(r => setTimeout(r, 60));
      trabajos.push({ tipo: 'TICKET', ventaId, texto: '' });
      return { ok: true, printed: [], errors: [] };
    },
  });
  const fichasImpresas = () => trabajos.filter(t => t.tipo === 'FICHA');

  /** Venta directa (sin mesa/comanda/delivery) con los ítems dados. */
  const nuevaVenta = async (items: { producto: any; cantidad: number | string; precio?: number; estado?: string }[], extra: any = {}) => {
    const v: any = await save(Venta, { estado: 'ABIERTA', caja: { id: caja.id }, dispositivo: { id: dispositivo.id }, ...extra });
    for (const it of items) {
      await save(VentaItem, {
        venta: { id: v.id }, producto: { id: it.producto.id }, cantidad: it.cantidad,
        precioVentaUnitario: it.precio ?? 10000, precioAdicionales: 0, descuentoUnitario: 0,
        precioCostoUnitario: 0, montoCubierto: 0, estado: it.estado ?? 'ACTIVO',
      });
    }
    return v;
  };
  /** Cobro simulado: con su `Pago`, como todos los cobros reales. */
  const nuevoPago = () => save(Pago, { estado: 'PAGADO', activo: true });
  const concluir = async (id: number, conPago = true) => ds.getRepository(Venta).update(id, {
    estado: 'CONCLUIDA', fechaCierre: new Date(), ...(conPago ? { pago: { id: (await nuevoPago()).id } } : {}),
  } as any);
  const leerVenta = (id: number) => ds.getRepository(Venta).findOneBy({ id });

  // ═══════ [1] Gate ═══════
  console.log('\n[1] Gate: sólo la venta directa emite');
  {
    ok(esVentaDirecta({ canalOrigen: 'LOCAL' }), '1: sin mesa/comanda/delivery y LOCAL → directa');
    ok(esVentaDirecta({}), '1: canalOrigen ausente cuenta como LOCAL');
    ok(!esVentaDirecta({ mesa: { id: 1 } }), '1: con mesa no es directa');
    ok(!esVentaDirecta({ comanda: { id: 1 } }), '1: con comanda no es directa');
    ok(!esVentaDirecta({ delivery: { id: 1 } }), '1: con delivery no es directa');
    ok(!esVentaDirecta({ canalOrigen: 'WEB' }), '1: un pedido web no es directa');
    ok(!esVentaDirecta({ canalOrigen: 'QR_MESA' }), '1: QR_MESA sin mesa tampoco');

    // Fichas apagadas → nada.
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    await concluir(v.id);
    const r0 = await imprimirFichasSiCorresponde(ds, v.id);
    ok(r0.emitidas === 0, '1: con fichasHabilitadas=false no emite', r0);

    await setCfg({ fichasHabilitadas: true, fichasModo: 'POR_UNIDAD' });

    // Venta ABIERTA → nada (nunca antes de cobrar).
    const abierta = await nuevaVenta([{ producto: cerveza, cantidad: 1 }]);
    ok((await imprimirFichasSiCorresponde(ds, abierta.id)).emitidas === 0, '1: una venta ABIERTA no emite');

    // Venta de mesa concluida → nada.
    const mesa: any = await save(PdvMesa, { numero: 1, estado: 'DISPONIBLE', activo: true, reservado: false });
    const deMesa = await nuevaVenta([{ producto: cerveza, cantidad: 3 }], { mesa: { id: mesa.id } });
    await concluir(deMesa.id);
    ok((await imprimirFichasSiCorresponde(ds, deMesa.id)).emitidas === 0, '1: una venta de mesa no emite');

    const web = await nuevaVenta([{ producto: cerveza, cantidad: 1 }], { canalOrigen: 'WEB' });
    await concluir(web.id);
    ok((await imprimirFichasSiCorresponde(ds, web.id)).emitidas === 0, '1: un pedido web no emite');

    trabajos.length = 0;
    const directa = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    await concluir(directa.id);
    const r1 = await imprimirFichasSiCorresponde(ds, directa.id);
    ok(r1.emitidas === 2, '1: la venta directa concluida emite', r1.emitidas);
    ok((await leerVenta(directa.id) as any).fichasCantidad === 2, '1: guarda fichasCantidad');
  }

  // ═══════ [2] Cocina: el refactor del gate no cambia quién va a cocina ═══════
  console.log('\n[2] No regresión del gate de cocina');
  {
    const barra: any = await save(Sector, { nombre: 'BARRA', activo: true });
    await save(ProductoSector, { producto: { id: gaseosa.id }, sector: { id: barra.id }, activo: true, prioridad: 1 });
    const mesa: any = await save(PdvMesa, { numero: 2, estado: 'DISPONIBLE', activo: true, reservado: false });

    const vMesa = await nuevaVenta([{ producto: gaseosa, cantidad: 1 }], { mesa: { id: mesa.id } });
    const itMesa: any = await ds.getRepository(VentaItem).findOne({ where: { venta: { id: vMesa.id } } as any });
    await crearComandaItemsSiCorresponde(ds, itMesa.id);
    const ciMesa = await ds.getRepository(ComandaItem).count({ where: { ventaItem: { id: itMesa.id } } as any });
    ok(ciMesa === 1, '2: una venta de mesa sigue creando su ComandaItem', ciMesa);

    const vWeb = await nuevaVenta([{ producto: gaseosa, cantidad: 1 }], { canalOrigen: 'WEB' });
    const itWeb: any = await ds.getRepository(VentaItem).findOne({ where: { venta: { id: vWeb.id } } as any });
    await crearComandaItemsSiCorresponde(ds, itWeb.id);
    ok(await ds.getRepository(ComandaItem).count({ where: { ventaItem: { id: itWeb.id } } as any }) === 1,
       '2: un pedido web sigue yendo a cocina');

    const vDir = await nuevaVenta([{ producto: gaseosa, cantidad: 1 }]);
    const itDir: any = await ds.getRepository(VentaItem).findOne({ where: { venta: { id: vDir.id } } as any });
    await crearComandaItemsSiCorresponde(ds, itDir.id);
    ok(await ds.getRepository(ComandaItem).count({ where: { ventaItem: { id: itDir.id } } as any }) === 0,
       '2: la venta directa sigue sin ir a cocina');
  }

  // ═══════ [3] Numeración, modos y overrides ═══════
  console.log('\n[3] Modos, numeración por venta y overrides');
  {
    // Varios ítems a propósito: con uno solo, una numeración por ítem pasaría.
    const v = await nuevaVenta([
      { producto: cerveza, cantidad: 2 },
      { producto: gaseosa, cantidad: 3 },
    ]);
    const fichas = (await buildFichasVenta(ds, v.id, { width: 48 }))!;
    ok(fichas.length === 5, '3: 2 + 3 unidades → 5 fichas', fichas.length);
    ok(fichas.map(f => f.numero).join(',') === '1,2,3,4,5', '3: correlativo 1..5', fichas.map(f => f.numero));
    ok(fichas.every(f => f.total === 5), '3: todas dicen /5');
    ok(texto(fichas[2].lines).includes('FICHA 3/5'), '3: la tercera dice FICHA 3/5', texto(fichas[2].lines));
    ok(texto(fichas[2].lines).includes('GASEOSA'), '3: la tercera ya es la gaseosa');
    ok(texto(fichas[2].lines).includes(`COD ${v.id}-3`), '3: código venta-numero', texto(fichas[2].lines));

    // POR_ITEM global.
    await setCfg({ fichasModo: 'POR_ITEM' });
    const porItem = (await buildFichasVenta(ds, v.id, { width: 48 }))!;
    ok(porItem.length === 2, '3: POR_ITEM → una ficha por ítem', porItem.length);
    ok(/^3\s+x/m.test(texto(porItem[1].lines)), '3: POR_ITEM muestra la cantidad "3  x"', texto(porItem[1].lines));
    await setCfg({ fichasModo: 'POR_UNIDAD' });

    // Overrides por producto.
    const mix = await nuevaVenta([
      { producto: cerveza, cantidad: 2 },   // hereda POR_UNIDAD → 2
      { producto: balde, cantidad: 3 },     // POR_ITEM → 1
      { producto: entrada, cantidad: 4 },   // NO_IMPRIME → 0
    ]);
    const fMix = (await buildFichasVenta(ds, mix.id, { width: 48 }))!;
    ok(fMix.length === 3, '3: override POR_ITEM y NO_IMPRIME (2 + 1 + 0)', fMix.length);
    ok(!fMix.some(f => texto(f.lines).includes('ENTRADA')), '3: NO_IMPRIME no emite ese ítem');
    ok(resolverFichaModo(null, 'POR_ITEM') === 'POR_ITEM', '3: producto null hereda el global');
    ok(resolverFichaModo('BASURA', 'POR_ITEM') === 'POR_ITEM', '3: un valor inválido del producto hereda');
    ok(resolverFichaModo(undefined, undefined) === 'POR_UNIDAD', '3: sin nada, POR_UNIDAD');

    // Cantidad decimal como string (decimal de Postgres).
    const kg = await nuevaVenta([{ producto: asado, cantidad: '1.500' }]);
    const fKg = (await buildFichasVenta(ds, kg.id, { width: 48 }))!;
    ok(fKg.length === 1, '3: cantidad 1,5 en POR_UNIDAD → 1 ficha (POR_ITEM forzado)', fKg.length);
    ok(texto(fKg[0].lines).includes('1.5'), '3: no pierde la fracción', texto(fKg[0].lines));

    // Ítems cancelados.
    const canc = await nuevaVenta([
      { producto: cerveza, cantidad: 2 },
      { producto: gaseosa, cantidad: 5, estado: 'CANCELADO' },
    ]);
    ok((await buildFichasVenta(ds, canc.id, { width: 48 }))!.length === 2, '3: los ítems cancelados no emiten');
  }

  // ═══════ [4] Precio y encabezado ═══════
  console.log('\n[4] Precio y nombre del evento');
  {
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 2, precio: 15000 }]);
    let f = (await buildFichasVenta(ds, v.id, { width: 48 }))!;
    ok(!texto(f[0].lines).includes('15.000'), '4: sin el flag no muestra precio', texto(f[0].lines));

    await setCfg({ fichasMostrarPrecio: true });
    f = (await buildFichasVenta(ds, v.id, { width: 48 }))!;
    ok(texto(f[0].lines).includes('Gs. 15.000'), '4: POR_UNIDAD muestra el unitario', texto(f[0].lines));
    await setCfg({ fichasModo: 'POR_ITEM' });
    f = (await buildFichasVenta(ds, v.id, { width: 48 }))!;
    ok(texto(f[0].lines).includes('Gs. 30.000'), '4: POR_ITEM muestra el subtotal', texto(f[0].lines));
    await setCfg({ fichasModo: 'POR_UNIDAD', fichasMostrarPrecio: false });

    // UPPERCASE al guardar + saneado CP437 al imprimir.
    usuarioActual = gerente;
    const pConf: any = await permiso('VENTAS_PDV_CONFIGURAR');
    const rolG: any = await ds.getRepository(Role).findOneBy({ descripcion: 'GERENTE' });
    await save(RolePermission, { role: rolG, permission: pConf });
    await invokeHandler('updatePdvConfig', cfg.id, { fichasNombreEvento: '  área vip  ', fichasModo: 'CUALQUIERA' });
    const guardado: any = await ds.getRepository(PdvConfig).findOneBy({ id: cfg.id });
    ok(guardado.fichasNombreEvento === 'ÁREA VIP', '4: el nombre del evento se guarda en UPPERCASE y recortado', guardado.fichasNombreEvento);
    ok(guardado.fichasModo === 'POR_UNIDAD', '4: un fichasModo inválido no se persiste', guardado.fichasModo);
    f = (await buildFichasVenta(ds, v.id, { width: 48 }))!;
    const t = texto(f[0].lines);
    ok(t.includes('AREA VIP') && !t.includes('?'), '4: "ÁREA" sale "AREA" en el papel, sin ?', t);

    // Tipos de venta: nacen habilitados y no se puede apagar todo.
    ok(guardado.pdvMesasHabilitadas === true && guardado.pdvComandasHabilitadas === true
      && guardado.pdvVentaRapidaHabilitada === true, '4: los tipos de venta nacen habilitados', guardado);
    await invokeHandler('updatePdvConfig', cfg.id, { pdvMesasHabilitadas: false, pdvComandasHabilitadas: false });
    const soloRapida: any = await ds.getRepository(PdvConfig).findOneBy({ id: cfg.id });
    ok(!soloRapida.pdvMesasHabilitadas && !soloRapida.pdvComandasHabilitadas && soloRapida.pdvVentaRapidaHabilitada,
      '4: se puede dejar sólo venta rápida', soloRapida);
    await rechaza(/PDV_SIN_TIPOS_DE_VENTA/, '4: apagar todos los tipos de venta se rechaza',
      () => invokeHandler('updatePdvConfig', cfg.id, { pdvVentaRapidaHabilitada: false, deliveryHabilitado: false }));
    const sigue: any = await ds.getRepository(PdvConfig).findOneBy({ id: cfg.id });
    ok(sigue.pdvVentaRapidaHabilitada === true && sigue.deliveryHabilitado !== false, '4: el rechazo no persiste nada', sigue);
    await invokeHandler('updatePdvConfig', cfg.id, { pdvMesasHabilitadas: true, pdvComandasHabilitadas: true });
    usuarioActual = cajero;
  }

  // ═══════ [5] Claim concurrente ═══════
  console.log('\n[5] Claim idempotente bajo concurrencia');
  {
    trabajos.length = 0;
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 3 }]);
    await concluir(v.id);
    const [a, b] = await Promise.all([
      imprimirFichasSiCorresponde(ds, v.id),
      imprimirFichasSiCorresponde(ds, v.id),
    ]);
    ok(a.emitidas + b.emitidas === 3, '5: dos disparos simultáneos emiten UNA vez', [a.emitidas, b.emitidas]);
    ok(fichasImpresas().length === 3, '5: salen 3 fichas, no 6', fichasImpresas().length);
    const otra = await imprimirFichasSiCorresponde(ds, v.id);
    ok(otra.emitidas === 0, '5: un tercer disparo tampoco emite');
    ok(fichasImpresas().every(t => t.cutAtEnd === true), '5: cada ficha es un trabajo con su corte');
  }

  // ═══════ [6] updateVenta: hook, orden y merge ═══════
  console.log('\n[6] updateVenta: ticket y fichas en orden, payload no pisa el claim');
  {
    trabajos.length = 0;
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    await invokeHandler('updateVenta', v.id, { estado: 'CONCLUIDA', fechaCierre: new Date(), pago: { id: (await nuevoPago()).id }, __imprimirTicketVenta: true });
    await esperar(async () => fichasImpresas().length === 2);
    ok(trabajos.length === 3, '6: F11 → 1 ticket + 2 fichas', trabajos.map(t => t.tipo));
    ok(trabajos[0]?.tipo === 'TICKET', '6: el ticket sale ANTES que las fichas', trabajos.map(t => t.tipo));

    trabajos.length = 0;
    const sinTicket = await nuevaVenta([{ producto: gaseosa, cantidad: 1 }]);
    await invokeHandler('updateVenta', sinTicket.id, { estado: 'CONCLUIDA', fechaCierre: new Date(), pago: { id: (await nuevoPago()).id }, __imprimirTicketVenta: false });
    await esperar(async () => fichasImpresas().length === 1);
    ok(trabajos.length === 1 && trabajos[0].tipo === 'FICHA', '6: F10 (sin ticket) igual emite fichas', trabajos.map(t => t.tipo));

    // El PdV manda la venta entera: una copia vieja trae fichas* en cero.
    const antes: any = await leerVenta(v.id);
    await invokeHandler('updateVenta', v.id, {
      nombreCliente: 'JUAN', fichasEmitidasAt: null, fichasCantidad: 0, fichasReimpresiones: 99,
    });
    const despues: any = await leerVenta(v.id);
    ok(!!despues.fichasEmitidasAt, '6: el payload no resetea el claim');
    ok(despues.fichasCantidad === antes.fichasCantidad, '6: ni baja fichasCantidad', despues.fichasCantidad);
    ok(despues.fichasReimpresiones === 0, '6: ni toca el contador de reimpresiones', despues.fichasReimpresiones);
    ok(despues.nombreCliente === 'JUAN', '6: el resto del payload sí se aplica');
  }

  // ═══════ [7] Cancelación ═══════
  console.log('\n[7] Cancelar una venta con fichas');
  {
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    await concluir(v.id);
    await imprimirFichasSiCorresponde(ds, v.id);

    usuarioActual = cajero;
    await rechaza(/VENTAS_CANCELAR_CON_FICHAS/, '7: el cajero no cancela una venta con fichas',
      () => invokeHandler('updateVenta', v.id, { estado: 'CANCELADA' }));
    await rechaza(/VENTAS_CANCELAR_CON_FICHAS/, '7: mandar fichasCantidad: 0 no esquiva el guard',
      () => invokeHandler('updateVenta', v.id, { estado: 'CANCELADA', fichasCantidad: 0 }));
    ok((await leerVenta(v.id) as any).estado === 'CONCLUIDA', '7: la venta sigue CONCLUIDA');

    usuarioActual = gerente;
    await invokeHandler('updateVenta', v.id, { estado: 'CANCELADA' });
    ok((await leerVenta(v.id) as any).estado === 'CANCELADA', '7: el gerente sí cancela');

    // Rehabilitar no vuelve a emitir: el claim sigue puesto.
    trabajos.length = 0;
    await invokeHandler('updateVenta', v.id, { estado: 'CONCLUIDA' });
    await new Promise(r => setTimeout(r, 150));
    ok(fichasImpresas().length === 0, '7: rehabilitar no reimprime fichas', fichasImpresas().length);

    // Una venta sin fichas no pide el permiso extra.
    usuarioActual = cajero;
    const sinFichas = await nuevaVenta([{ producto: entrada, cantidad: 1 }]);
    await concluir(sinFichas.id);
    await imprimirFichasSiCorresponde(ds, sinFichas.id);
    await invokeHandler('updateVenta', sinFichas.id, { estado: 'CANCELADA' });
    ok((await leerVenta(sinFichas.id) as any).estado === 'CANCELADA', '7: sin fichas, el cajero cancela como siempre');
  }

  // ═══════ [8] Reimpresión ═══════
  console.log('\n[8] Reimpresión');
  {
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    await concluir(v.id);
    await imprimirFichasSiCorresponde(ds, v.id);

    usuarioActual = mozo;
    await rechaza(/DOCUMENTOS_REIMPRIMIR_FICHAS/, '8: sin permiso no reimprime',
      () => invokeHandler('print-fichas-venta', { ventaId: v.id }));

    usuarioActual = cajero;
    trabajos.length = 0;
    const r: any = await invokeHandler('print-fichas-venta', { ventaId: v.id });
    ok(r?.ok === true, '8: el cajero reimprime', r);
    ok(fichasImpresas().length === 2 && fichasImpresas().every(t => t.texto.includes('REIMPRESION')),
       '8: salen marcadas REIMPRESION', fichasImpresas().map(t => t.texto.slice(-40)));
    ok((await leerVenta(v.id) as any).fichasReimpresiones === 1, '8: suma el contador');

    const abierta = await nuevaVenta([{ producto: cerveza, cantidad: 1 }]);
    const r2: any = await invokeHandler('print-fichas-venta', { ventaId: abierta.id });
    ok(r2?.ok === false, '8: una venta sin fichas emitidas no se reimprime', r2);
  }

  // ═══════ [9] Venta a crédito sin pagaré ═══════
  console.log('\n[9] Venta a crédito (sin pagaré)');
  {
    usuarioActual = cajero;
    trabajos.length = 0;
    const persona: any = await save(Persona, { nombre: 'CLIENTE CREDITO', tipoPersona: 'FISICA', activo: true });
    const cliente: any = await save(Cliente, {
      persona: { id: persona.id }, activo: true, credito: true, limite_credito: 999999, saldoActual: 0,
    });
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 3, precio: 5000 }], { cliente: { id: cliente.id } });
    const gs: any = await ds.getRepository(Moneda).findOneBy({ principal: true });
    await invokeHandler('cobrar-venta-credito', {
      ventaId: v.id, clienteId: cliente.id, montoTotal: 15000, monedaId: gs.id,
      cantidadCuotas: 1, frecuenciaDias: 30, imprimirPagare: false,
    });
    const salio = await esperar(async () => fichasImpresas().length === 3);
    ok(salio, '9: una venta directa a crédito sin pagaré emite sus fichas', fichasImpresas().length);
    ok((await leerVenta(v.id) as any).fichasCantidad === 3, '9: el claim vio la venta CONCLUIDA (post-commit)');
  }

  // ═══════ [10] Impresora que falla a la mitad ═══════
  console.log('\n[10] Fallo de impresión');
  {
    trabajos.length = 0;
    fallar = true;
    const v = await nuevaVenta([{ producto: cerveza, cantidad: 4 }]);
    await concluir(v.id);
    const r = await imprimirFichasSiCorresponde(ds, v.id);
    fallar = false;
    ok(r.resultado?.ok === false, '10: informa el fallo', r.resultado);
    ok(fichasImpresas().length === 0 && (r.resultado?.printed?.length ?? -1) === 0,
      '10: un solo trabajo: si falla no salió ninguna', r.resultado?.printed);
    ok(/las 4 fichas/.test(r.resultado?.errors?.[0]?.message || ''), '10: dice cuántas no salieron', r.resultado?.errors);

    // Todas las fichas de una venta van en UN trabajo, cada una con su corte.
    trabajos.length = 0;
    const antes = trabajosFichas;
    const v2 = await nuevaVenta([{ producto: cerveza, cantidad: 3 }]);
    await concluir(v2.id);
    await imprimirFichasSiCorresponde(ds, v2.id);
    ok(trabajosFichas - antes === 1 && fichasImpresas().length === 3,
      '10: 3 fichas salen en un solo trabajo de impresión', { trabajos: trabajosFichas - antes, fichas: fichasImpresas().length });
    ok(fichasImpresas().every(f => f.cutAtEnd === true), '10: cada ficha lleva su corte');
    ok(!!(await leerVenta(v.id) as any).fichasEmitidasAt, '10: queda emitida (se resuelve reimprimiendo)');

    // `imprimirPostConclusion` no lanza aunque el ticket falle.
    __setFichasPrintImplsForTests({ printVentaTicket: async () => { throw new Error('BOOM'); } });
    let lanzo = false;
    try { await imprimirPostConclusion(ds, v.id, { imprimirTicket: true }); } catch { lanzo = true; }
    ok(!lanzo, '10: un ticket que explota no corta la cadena');
  }

  // ═══════ [10b] Retomar la venta rápida abierta tras recargar el PdV ═══════
  console.log('\n[10b] getVentaRapidaAbierta');
  {
    const otroDisp: any = await save(Dispositivo, { nombre: 'OTRA TERMINAL', activo: true });
    const mesa: any = await save(PdvMesa, { numero: 77, estado: 'DISPONIBLE', activo: true, reservado: false });
    const ajena = await nuevaVenta([{ producto: cerveza, cantidad: 1 }], { dispositivo: { id: otroDisp.id } });
    await nuevaVenta([{ producto: cerveza, cantidad: 1 }], { mesa: { id: mesa.id } });
    const propia = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    const r: any = await invokeHandlerWithContext('getVentaRapidaAbierta', { deviceId: dispositivo.id }, caja.id);
    ok(r?.id === propia.id, '10b: devuelve la venta rápida ABIERTA de esta terminal', r?.id);
    const rOtra: any = await invokeHandlerWithContext('getVentaRapidaAbierta', { deviceId: otroDisp.id }, caja.id);
    ok(rOtra?.id === ajena.id, '10b: cada terminal ve sólo la suya (caja compartida)', rOtra?.id);
    await ds.getRepository(Venta).update({ id: propia.id }, { estado: 'CANCELADA' } as any);
    await ds.getRepository(Venta).update({ id: ajena.id }, { estado: 'CANCELADA' } as any);
    const rNada: any = await invokeHandlerWithContext('getVentaRapidaAbierta', { deviceId: dispositivo.id }, caja.id);
    ok(rNada?.mesa == null && (rNada == null || rNada.id !== propia.id),
      '10b: una venta de mesa o ya cerrada no se retoma como venta rápida', rNada?.id);
  }

  // ═══════ [11] Hallazgos de la auditoría de la implementación ═══════
  console.log('\n[11] Hallazgos de la auditoría');
  {
    // Sin Pago no hay fichas: concluir sin cobrar no entrega mercadería.
    const sinPago = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    await concluir(sinPago.id, false);
    ok((await imprimirFichasSiCorresponde(ds, sinPago.id)).emitidas === 0, '11: una venta CONCLUIDA sin Pago no emite');

    // Rehabilitar una venta que NUNCA emitió (fichas habilitadas después) no emite.
    usuarioActual = gerente;
    trabajos.length = 0;
    const vieja = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    await setCfg({ fichasHabilitadas: false });
    await invokeHandler('updateVenta', vieja.id, { estado: 'CONCLUIDA', pago: { id: (await nuevoPago()).id } });
    await new Promise(r => setTimeout(r, 100));
    await setCfg({ fichasHabilitadas: true });
    await invokeHandler('updateVenta', vieja.id, { estado: 'CANCELADA' });
    await invokeHandler('updateVenta', vieja.id, { estado: 'CONCLUIDA' });
    await new Promise(r => setTimeout(r, 150));
    ok(fichasImpresas().length === 0, '11: rehabilitar una venta vieja no larga fichas', fichasImpresas().length);
    ok(!(await leerVenta(vieja.id) as any).fichasEmitidasAt, '11: ni la marca como emitida');
    usuarioActual = cajero;

    // createVenta no acepta las columnas de fichas.
    const creada: any = await invokeHandler('createVenta', {
      estado: 'ABIERTA', caja: { id: caja.id }, fichasEmitidasAt: new Date(), fichasCantidad: 9,
    });
    const leida: any = await leerVenta(creada.id);
    ok(!leida.fichasEmitidasAt && leida.fichasCantidad === 0, '11: createVenta descarta fichas*', leida);

    // Precio: adicionales y descuento entran en la fórmula; decimales como string.
    await setCfg({ fichasMostrarPrecio: true });
    const vp: any = await save(Venta, { estado: 'ABIERTA', caja: { id: caja.id } });
    await save(VentaItem, {
      venta: { id: vp.id }, producto: { id: cerveza.id }, cantidad: '2.000',
      precioVentaUnitario: '10000.00', precioAdicionales: '2000.00', descuentoUnitario: '500.00',
      precioCostoUnitario: 0, montoCubierto: 0, estado: 'ACTIVO',
    });
    let fp = (await buildFichasVenta(ds, vp.id, { width: 48 }))!;
    ok(fp.length === 2 && texto(fp[0].lines).includes('Gs. 11.500'), '11: unitario = precio + adicionales - descuento', texto(fp[0].lines));
    await setCfg({ fichasModo: 'POR_ITEM' });
    fp = (await buildFichasVenta(ds, vp.id, { width: 48 }))!;
    ok(texto(fp[0].lines).includes('Gs. 23.000'), '11: POR_ITEM = unitario x cantidad', texto(fp[0].lines));
    await setCfg({ fichasModo: 'POR_UNIDAD', fichasMostrarPrecio: false });

    // Detalle: adicionales en la ficha (misma fuente que comanda y ticket).
    const queso: any = await save(Adicional, { nombre: 'EXTRA QUESO', precioBase: 2000, activo: true });
    const itP: any = await ds.getRepository(VentaItem).findOne({ where: { venta: { id: vp.id } } as any });
    await save(VentaItemAdicional, { ventaItem: { id: itP.id }, adicional: { id: queso.id }, precioCobrado: 2000, cantidad: 1, activo: true });
    fp = (await buildFichasVenta(ds, vp.id, { width: 48 }))!;
    ok(fp.every(f => texto(f.lines).includes('+ EXTRA QUESO')), '11: el adicional va en cada ficha', texto(fp[0].lines));

    // Sin nombre de evento no hay encabezado: la ficha arranca en el separador.
    await setCfg({ fichasNombreEvento: null });
    fp = (await buildFichasVenta(ds, vp.id, { width: 48 }))!;
    ok((fp[0].lines[0] as any).type === 'separator', '11: sin evento, la primera línea es el separador', fp[0].lines[0]);
    ok(!texto(fp[0].lines).includes('REIMPRESION'), '11: la emisión original NO dice REIMPRESION');

    // Ancho 32: el nombre en `big` se parte a 16 columnas.
    const largo: any = await save(Producto, { nombre: 'BALDE PROMOCIONAL SEIS CERVEZAS', tipo: 'RETAIL', activo: true });
    const vl = await nuevaVenta([{ producto: largo, cantidad: 1 }]);
    const fl = (await buildFichasVenta(ds, vl.id, { width: 32 }))!;
    const grandes = fl[0].lines.filter((l: any) => l.type === 'text' && l.size === 'big').map((l: any) => l.text);
    ok(grandes.length >= 2 && grandes.every((t: string) => t.length <= 16), '11: en 32 columnas el nombre grande se envuelve a 16', grandes);

    // Tope: una cantidad absurda no se convierte en cientos de trabajos.
    const vt = await nuevaVenta([{ producto: cerveza, cantidad: 5000 }, { producto: gaseosa, cantidad: 3 }]);
    const ft = (await buildFichasVenta(ds, vt.id, { width: 48 }))!;
    ok(ft.length === 2, '11: pasado el tope, la venta sale POR_ITEM', ft.length);

    // Delivery real (no un objeto literal): no emite.
    const dv = await nuevaVenta([{ producto: cerveza, cantidad: 2 }]);
    const del: any = await save(Delivery, { venta: { id: dv.id }, estado: 'ENTREGADO', modo: 'RETIRO', telefono: '0981000000', nombre: 'X', activo: true, fechaAbierto: new Date() });
    await ds.getRepository(Venta).update(dv.id, { delivery: { id: del.id } } as any);
    await concluir(dv.id);
    ok((await imprimirFichasSiCorresponde(ds, dv.id)).emitidas === 0, '11: un delivery real concluido no emite');

    // Reimpresión: el código lleva -R1, y una reimpresión que no imprime nada no suma.
    const vr = await nuevaVenta([{ producto: cerveza, cantidad: 1 }]);
    await concluir(vr.id);
    await imprimirFichasSiCorresponde(ds, vr.id);
    trabajos.length = 0;
    await invokeHandler('print-fichas-venta', { ventaId: vr.id });
    ok(fichasImpresas()[0]?.texto.includes(`COD ${vr.id}-1-R1`), '11: la reimpresión cambia el código (-R1)', fichasImpresas()[0]?.texto);
    fallar = true;
    trabajos.length = 0;
    const rf: any = await invokeHandler('print-fichas-venta', { ventaId: vr.id });
    fallar = false;
    ok(rf?.ok === false, '11: una reimpresión fallida devuelve ok:false');
    ok((await leerVenta(vr.id) as any).fichasReimpresiones === 1, '11: y no suma al contador');

    // Config: nombre recortado a 120 y booleanos normalizados.
    usuarioActual = gerente;
    await invokeHandler('updatePdvConfig', cfg.id, { fichasNombreEvento: 'x'.repeat(200), fichasMostrarPrecio: 'true' });
    const c2: any = await ds.getRepository(PdvConfig).findOneBy({ id: cfg.id });
    ok(c2.fichasNombreEvento.length === 120, '11: el nombre del evento se recorta a 120', c2.fichasNombreEvento.length);
    ok(c2.fichasMostrarPrecio === true, '11: un "true" string se guarda como boolean');
    usuarioActual = cajero;
  }

  // Buffer real: un trabajo con N fichas lleva N cortes y el encabezado en cada una.
  {
    const { armarBufferEscPos } = require('../electron/utils/ticket.utils');
    const specs = [1, 2, 3].map((n) => ({
      printerWidth: 32, cutAtEnd: true,
      lines: [{ type: 'text', text: 'FIESTA PATRONAL', align: 'C', size: 'tall' }, { type: 'separator', char: '=' }, { type: 'text', text: `FICHA ${n}/3` }],
    }));
    const buf: Buffer = await armarBufferEscPos({ type: 'epson', connectionType: 'lpr', width: 32, address: '127.0.0.1:1/q' }, specs);
    const latin = buf.toString('latin1');
    const cortes = (latin.match(/\x1dV/g) || []).length;
    ok(cortes === 3, '12: el buffer de 3 fichas tiene 3 cortes', cortes);
    ok((latin.match(/FIESTA PATRONAL/g) || []).length === 3 && (latin.match(/={32}/g) || []).length === 3,
      '12: cada ficha lleva su encabezado y su línea completa');
    const i1 = latin.indexOf('FICHA 1/3'), c1 = latin.indexOf('\x1dV'), h2 = latin.indexOf('FIESTA PATRONAL', c1);
    ok(i1 < c1 && c1 < h2, '12: el corte de una ficha va antes del encabezado de la siguiente');
  }

  __setFichasPrintImplsForTests({ printSpecs: null, printVentaTicket: null });
  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} fichas: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
