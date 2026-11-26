/**
 * Acreditación en Bancos de lo cobrado por la tienda online (máquina POS de la forma de pago online).
 *
 *   npm run test:acreditacion-pago-online   (y -pg)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { installHandlerRegistry, invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';

const PG = process.argv.includes('--pg');
const TAG = PG ? '[acred-online-pg]' : '[acred-online]';
let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function lanza(fn: () => Promise<any>): Promise<string> {
  try { await fn(); return ''; } catch (e: any) { return String(e?.message || e); }
}

async function abrirBase(): Promise<{ ds: DataSource; cerrar: () => Promise<void> } | null> {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!PG) {
    const dbFile = path.join(tmpDir, 'test-acreditacion-pago-online.db');
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    const ds = new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
    await ds.initialize();
    return { ds, cerrar: async () => { await ds.destroy(); } };
  }
  const conn = {
    host: process.env['FRC_PG_HOST'] || 'localhost',
    port: process.env['FRC_PG_PORT'] ? Number(process.env['FRC_PG_PORT']) : 5432,
    username: process.env['FRC_PG_USERNAME'] || process.env['USER'] || 'postgres',
    password: process.env['FRC_PG_PASSWORD'] || undefined,
  };
  const nombre = `frc_gourmet_acredonline_${process.pid}`;
  const admin = new DataSource({ type: 'postgres', ...conn, database: 'postgres' } as any);
  try { await admin.initialize(); } catch (e: any) {
    console.log(`${TAG} SALTEADO: no hay Postgres disponible (${String(e.message).split('\n')[0]}).`);
    return null;
  }
  await admin.query(`CREATE DATABASE "${nombre}"`);
  const ds = new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', ...conn, database: nombre } as any) as any), synchronize: false, migrationsRun: false });
  await ds.initialize();
  return { ds, cerrar: async () => { await ds.destroy(); await admin.query(`DROP DATABASE IF EXISTS "${nombre}"`); await admin.destroy(); } };
}

async function main() {
  const base = await abrirBase();
  if (!base) process.exit(0);
  const { ds, cerrar } = base;
  await ds.runMigrations({ transaction: 'each' });
  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const R = (e: any) => ds.getRepository(e);
  const save = (ent: any, data: any): Promise<any> => R(ent).save(R(ent).create(data as any) as any);
  const { Moneda } = E('financiero/moneda.entity');
  const { CuentaBancaria } = E('financiero/cuenta-bancaria.entity');
  const { MaquinaPos } = E('financiero/maquina-pos.entity');
  const { MaquinaPosRegla } = E('financiero/maquina-pos-regla.entity');
  const { AcreditacionPos } = E('financiero/acreditacion-pos.entity');
  const { FormaPagoOnline } = E('pedidos-online/forma-pago-online.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { acreditarCobroOnline, montoCobradoEn } = require('../electron/utils/acreditacion-pago-online.utils');

  await save(Moneda, { denominacion: 'GUARANI', simbolo: '₲', principal: true, activo: true, decimales: 0 });
  const usd = await save(Moneda, { denominacion: 'DOLAR', simbolo: '$', countryCode: 'US', principal: false, activo: true, decimales: 2 });
  const brl = await save(Moneda, { denominacion: 'REAL', simbolo: 'R$', countryCode: 'BR', principal: false, activo: true, decimales: 2 });
  const cbUsd = await save(CuentaBancaria, { nombre: 'IC PAY', banco: 'IC', numeroCuenta: 'IC-1', moneda: usd, saldo: 0, activo: true });
  const cbBrl = await save(CuentaBancaria, { nombre: 'IC BRL', banco: 'IC', numeroCuenta: 'IC-2', moneda: brl, saldo: 0, activo: true });
  const posUsd = await save(MaquinaPos, { nombre: 'IC PAY PIX', cuentaBancaria: cbUsd, porcentajeComision: 0, minutosAcreditacion: 0, autoAcreditar: true, activo: true });
  await save(MaquinaPosRegla, { maquinaPos: posUsd, medio: 'QR', plazoDias: 1, porcentajeComision: 3, activo: true });
  const posBrl = await save(MaquinaPos, { nombre: 'IC BRL', cuentaBancaria: cbBrl, porcentajeComision: 0, minutosAcreditacion: 0, autoAcreditar: true, activo: true });
  const fUsd = await save(FormaPagoOnline, { proveedor: 'ICPAY', nombre: 'PIX', activo: true, orden: 1, configJson: '{}', maquinaPosId: posUsd.id });
  const fSin = await save(FormaPagoOnline, { proveedor: 'ICPAY', nombre: 'PIX 2', activo: true, orden: 2, configJson: '{}' });
  const datos = JSON.stringify({ qr: { moneda: 'BRL', monto: '7.01' }, usd: '1.23', pygPorUsd: 6350 });
  let n = 0;
  const pedido = async (forma: any, extra: any = {}) => save(PedidoOnline, {
    numero: `PO-AC-${++n}`, tipoPedido: 'PICKUP', estado: 'ACEPTADO', subtotal: 7000, total: 7000, metodoPago: 'ICPAY',
    pagoModalidad: 'ONLINE', estadoPago: 'PAGADO', pagoMonto: 7000, pagoProveedor: 'ICPAY', pagoDatosJson: datos, formaPagoOnlineId: forma?.id ?? null, ...extra,
  });

  console.log('\n[1] Monto cobrado por moneda');
  const p0 = { pagoDatosJson: datos, pagoMonto: 7000, total: 7000 } as any;
  ok(montoCobradoEn(p0, 'USD') === 1.23 && montoCobradoEn(p0, 'BRL') === 7.01 && montoCobradoEn(p0, 'PYG') === 7000, '1: USD, BRL y guaraníes salen de lo que guardó el cobro');
  ok(montoCobradoEn({ pagoDatosJson: JSON.stringify({ qr: { moneda: 'USDT', monto: '5' }, usd: '5' }) } as any, 'BRL') === null, '1: un cobro en USDT no tiene monto en reales');

  console.log('\n[2] Acreditación');
  const p1 = await pedido(fUsd);
  const r1 = await acreditarCobroOnline(ds, p1.id, 9001, null);
  const a1: any = await R(AcreditacionPos).findOne({ where: { ventaId: 9001 }, relations: ['cuentaBancaria', 'maquinaPos'] });
  ok(r1.creada === true && a1 && Number(a1.montoOriginal) === 1.23 && a1.cuentaBancaria?.id === cbUsd.id && a1.medio === 'QR', '2: cuenta en dólares → se acredita US$ 1,23 por QR en IC PAY', { r1, a1 });
  ok(Math.abs(Number(a1.montoComision) - 0.04) < 0.006 && Math.abs(Number(a1.montoEsperado) - 1.19) < 0.006 && a1.estado === 'PENDIENTE', '2: con la comisión de la regla QR (3 %) y pendiente hasta el plazo', a1);
  const r1b = await acreditarCobroOnline(ds, p1.id, 9001, null);
  ok(r1b.creada === false && (await R(AcreditacionPos).count({ where: { ventaId: 9001 } })) === 1, '2: dos veces no la duplica', r1b);
  await R(FormaPagoOnline).update({ id: fUsd.id }, { maquinaPosId: posBrl.id });
  const p2 = await pedido(fUsd);
  const r2: any = await acreditarCobroOnline(ds, p2.id, 9002, null);
  ok(r2.creada === true && r2.moneda === 'BRL' && r2.monto === 7.01, '2: cuenta en reales → R$ 7,01 (lo cobrado), no el total convertido', r2);
  await R(FormaPagoOnline).update({ id: fUsd.id }, { maquinaPosId: posUsd.id });

  console.log('\n[3] Cuándo no');
  const r3: any = await acreditarCobroOnline(ds, (await pedido(fSin)).id, 9003, null);
  ok(r3.creada === false && /máquina POS/.test(r3.motivo), '3: forma sin máquina → no se acredita', r3);
  const r4: any = await acreditarCobroOnline(ds, (await pedido(fUsd, { estadoPago: 'PENDIENTE' })).id, 9004, null);
  ok(r4.creada === false && r4.motivo === 'sin cobro online', '3: sin cobrar → no', r4);
  const r5: any = await acreditarCobroOnline(ds, (await pedido(fUsd, { pagoDatosJson: null })).id, 9005, null);
  ok(r5.creada === false && /cuánto cobró/.test(r5.motivo), '3: sin datos del cobro → no inventa el monto', r5);
  ok((await R(AcreditacionPos).count()) === 2, '3: solo las dos acreditaciones esperadas');

  await cerrar();
  console.log(`\n${TAG} RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
