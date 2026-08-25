/**
 * E2E: cobro parcial por ítems (PdV).
 *
 * Ejercita los handlers REALES (registrarCobroParcial / getEstadoCobroVenta /
 * anularCobroParcial) contra SQLite, validando:
 *  - cobro parcial de un ítem entero → PAGADO,
 *  - fracción de un ítem → PARCIAL,
 *  - descuento global aplicado DESPUÉS de un cobro parcial → sin crédito
 *    retroactivo; la ronda final cierra en saldo 0 con todos los ítems PAGADO,
 *  - anti-doble-cobro (tope por ítem),
 *  - anulación de una ronda → cobertura recomputada.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-cobro-parcial-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { TipoDetalle } from '../src/app/database/entities/compras/pago-detalle.entity';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

function estadoDe(estado: any, itemId: number): string {
  return (estado.items || []).find((i: any) => i.id === itemId)?.estado;
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-cobro-parcial.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[cobro-parcial] Migraciones OK.');

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');
  const { Venta } = require('../src/app/database/entities/ventas/venta.entity');
  const { VentaItem } = require('../src/app/database/entities/ventas/venta-item.entity');
  const { Pago } = require('../src/app/database/entities/compras/pago.entity');
  const { PagoDetalle } = require('../src/app/database/entities/compras/pago-detalle.entity');
  const { CobroParcial } = require('../src/app/database/entities/ventas/cobro-parcial.entity');

  // Seed: usuario admin con VENTAS_PDV (atender) + VENTAS_COBRAR (registrar plata).
  // `registrarCobroParcial` pide VENTAS_COBRAR desde 2026-08: registrar un cobro
  // es del cajero, no de quien atiende la mesa.
  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true } as any));
  const permCobrar = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'VENTAS_COBRAR', descripcion: 'COBRAR', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: permCobrar } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  // Venta ABIERTA con 3 ítems: A=10000, B=20000, C=30000 (deudaBruta=60000)
  const venta = await ds.getRepository(Venta).save(ds.getRepository(Venta).create({ estado: 'ABIERTA' } as any));
  const mkItem = (pvu: number) => ds.getRepository(VentaItem).save(ds.getRepository(VentaItem).create({
    venta, precioCostoUnitario: 0, precioVentaUnitario: pvu, cantidad: 1, estado: 'ACTIVO',
  } as any));
  const A = await mkItem(10000);
  const B = await mkItem(20000);
  const C = await mkItem(30000);

  const pago = await ds.getRepository(Pago).save(ds.getRepository(Pago).create({ estado: 'ABIERTO', activo: true } as any));
  (venta as any).pago = pago;
  await ds.getRepository(Venta).save(venta);

  const mkDetalle = async (valor: number, tipo: any) => {
    const d = await ds.getRepository(PagoDetalle).save(ds.getRepository(PagoDetalle).create({
      valor, descripcion: tipo, tipo, pago, activo: true,
    } as any));
    return d.id;
  };

  registerVentasHandlers(ds, () => admin);

  // ── Estado inicial ──────────────────────────────────────────────────────
  let estado = await invokeHandlerWithContext('getEstadoCobroVenta', undefined, venta.id);
  ok(estado.deudaBruta === 60000, 'deudaBruta inicial = 60000', estado.deudaBruta);
  ok(estado.pendienteBruto === 60000, 'pendienteBruto inicial = 60000', estado.pendienteBruto);
  ok(estadoDe(estado, A.id) === 'PENDIENTE', 'A inicial PENDIENTE');

  // ── R1: cobro parcial de A entero (10000) ───────────────────────────────
  const d1 = await mkDetalle(10000, TipoDetalle.PAGO);
  estado = await invokeHandlerWithContext('registrarCobroParcial', undefined, venta.id, {
    imputaciones: [{ ventaItemId: A.id, brutoCubierto: 10000 }],
    pagoDetalleIds: [d1], cashTotalPrincipal: 10000, factorAplicado: 1,
  });
  ok(estadoDe(estado, A.id) === 'PAGADO', 'R1: A PAGADO');
  ok(estadoDe(estado, B.id) === 'PENDIENTE', 'R1: B PENDIENTE');
  ok(estado.totalCubierto === 10000, 'R1: totalCubierto = 10000', estado.totalCubierto);
  ok(estado.pendienteBruto === 50000, 'R1: pendienteBruto = 50000', estado.pendienteBruto);
  const d1row = await ds.getRepository(PagoDetalle).findOne({ where: { id: d1 } });
  ok(!!(d1row as any).cobroParcialId, 'R1: PagoDetalle tagueado con la ronda');

  // ── R2: fracción de B (10000 de 20000) ──────────────────────────────────
  const d2 = await mkDetalle(10000, TipoDetalle.PAGO);
  estado = await invokeHandlerWithContext('registrarCobroParcial', undefined, venta.id, {
    imputaciones: [{ ventaItemId: B.id, brutoCubierto: 10000 }],
    pagoDetalleIds: [d2], cashTotalPrincipal: 10000, factorAplicado: 1,
  });
  ok(estadoDe(estado, B.id) === 'PARCIAL', 'R2: B PARCIAL');
  ok(estado.pendienteBruto === 40000, 'R2: pendienteBruto = 40000', estado.pendienteBruto);

  // ── Anti-doble-cobro: intentar cubrir A de nuevo debe fallar ────────────
  let threw = false;
  try {
    await invokeHandlerWithContext('registrarCobroParcial', undefined, venta.id, {
      imputaciones: [{ ventaItemId: A.id, brutoCubierto: 5000 }],
      pagoDetalleIds: [], cashTotalPrincipal: 5000, factorAplicado: 1,
    });
  } catch { threw = true; }
  ok(threw, 'anti-doble-cobro: cubrir un ítem ya pagado lanza error');

  // ── R3: descuento global 10000 DESPUÉS + ronda final ────────────────────
  // deudaNeta pasa a 50000. Pagado hasta ahora = 20000 → saldo 30000.
  await mkDetalle(10000, TipoDetalle.DESCUENTO);
  const d3 = await mkDetalle(30000, TipoDetalle.PAGO); // paga el resto
  // Ronda final: cubre todo lo pendiente (B: 10000, C: 30000). factor=30000/40000=0.75
  estado = await invokeHandlerWithContext('registrarCobroParcial', undefined, venta.id, {
    imputaciones: [{ ventaItemId: B.id, brutoCubierto: 10000 }, { ventaItemId: C.id, brutoCubierto: 30000 }],
    pagoDetalleIds: [d3], cashTotalPrincipal: 30000, factorAplicado: 0.75,
  });
  ok(estadoDe(estado, B.id) === 'PAGADO', 'R3: B PAGADO');
  ok(estadoDe(estado, C.id) === 'PAGADO', 'R3: C PAGADO');
  ok(estado.pendienteBruto === 0, 'R3: pendienteBruto = 0 (todo cubierto)', estado.pendienteBruto);
  ok(estado.descuentoGlobal === 10000, 'R3: descuentoGlobal = 10000', estado.descuentoGlobal);

  // Invariante de dinero: deudaNeta - pagos = 0 (sin crédito retroactivo)
  const detalles = await ds.getRepository(PagoDetalle).find({ where: { pago: { id: pago.id }, activo: true }, relations: ['pago'] });
  let pagos = 0, descuentos = 0;
  for (const d of detalles) {
    if (d.tipo === TipoDetalle.PAGO) pagos += Number(d.valor);
    else if (d.tipo === TipoDetalle.DESCUENTO) descuentos += Number(d.valor);
  }
  const saldoDinero = (60000 - descuentos) - pagos;
  ok(saldoDinero === 0, 'invariante: saldoDinero = 0 al cubrir todo', { pagos, descuentos, saldoDinero });

  // ── R4: anular la ronda final ───────────────────────────────────────────
  const rondaFinal = await ds.getRepository(CobroParcial).findOne({ where: { venta: { id: venta.id }, activo: true }, order: { id: 'DESC' }, relations: ['venta'] });
  estado = await invokeHandlerWithContext('anularCobroParcial', undefined, rondaFinal!.id);
  ok(estadoDe(estado, B.id) === 'PARCIAL', 'R4: tras anular, B vuelve a PARCIAL');
  ok(estadoDe(estado, C.id) === 'PENDIENTE', 'R4: tras anular, C vuelve a PENDIENTE');
  ok(estado.pendienteBruto === 40000, 'R4: pendienteBruto = 40000 tras anular', estado.pendienteBruto);
  const d3row = await ds.getRepository(PagoDetalle).findOne({ where: { id: d3 } });
  ok((d3row as any).activo === false, 'R4: PagoDetalle de la ronda anulada queda inactivo');

  // ── Un producto con variación no se vende sin su variación ──────────────
  //
  // El diálogo del PdV no deja avanzar sin elegir tamaño y sabor, pero esa
  // validación es de la UI: `/api/rpc` es default-allow, así que un cliente con
  // `VENTAS_PDV` podía llamar `createVentaItem` directo y meter «1 PAPAS
  // FRITAS» sin tamaño ni sabor —y con el precio que quisiera—. El ítem entraba
  // a la venta, a la comanda de cocina y al ticket sin describir nada vendible.
  {
    console.log('\n[variación] un producto con variación exige su variación');
    const { Producto } = require('../src/app/database/entities/productos/producto.entity');
    const pVar: any = await ds.getRepository(Producto).save(
      ds.getRepository(Producto).create({
        nombre: 'PAPAS CON VARIACION', tipo: 'ELABORADO_CON_VARIACION', activo: true,
      } as any),
    );
    const pPlano: any = await ds.getRepository(Producto).save(
      ds.getRepository(Producto).create({ nombre: 'GASEOSA', tipo: 'RETAIL', activo: true } as any),
    );

    const crear = async (payload: any) => {
      try { return { ok: true, r: await invokeHandlerWithContext('createVentaItem', undefined, payload) }; }
      catch (e: any) { return { ok: false, err: String(e?.message || e) }; }
    };
    const base = { venta: { id: venta.id }, cantidad: 1, precioVentaUnitario: 1, precioCostoUnitario: 0, estado: 'ACTIVO' };

    const sinVariacion = await crear({ ...base, producto: { id: pVar.id } });
    ok(!sinVariacion.ok && /variación/i.test(sinVariacion.err || ''),
       'sin recetaPresentacion, el backend rechaza el ítem', sinVariacion.err);

    // Con la variación presente el gate deja pasar. Se asierta que el error
    // —si lo hay— ya NO es el del gate: armar una RecetaPresentacion completa
    // (receta + presentación + sabor + precios) para esto sería montar medio
    // catálogo, y lo que se mide acá es el gate, no la FK.
    const conVariacion = await crear({ ...base, producto: { id: pVar.id }, recetaPresentacion: { id: 1 } });
    ok(!/se vende por variación/i.test((conVariacion as any).err || ''),
       'con la variación elegida, el gate ya no interviene', (conVariacion as any).err);

    const plano = await crear({ ...base, producto: { id: pPlano.id } });
    ok(plano.ok, 'un producto sin variación no se ve afectado', (plano as any).err);
  }

  await ds.destroy();
  console.log(`\n[cobro-parcial] ${passed} OK, ${failed} FALLARON`);
  // Salida explícita: registerVentasHandlers deja un setInterval (retry comanda)
  // que mantiene vivo el event loop.
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
