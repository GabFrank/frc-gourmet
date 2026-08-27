/**
 * E2E: `computeResumenCaja` no concatena strings.
 *
 * `PagoDetalle.valor` es `decimal`, y en **Postgres** el driver lo devuelve como
 * STRING (no hay `pg.types.setTypeParser(1700)` en el repo). Las acumulaciones
 * del resumen usaban `+=` sin castear, así que dos pagos de 150.000 y 50.000
 * daban `"0150000.0050000.00"`, el efectivo esperado salía `NaN`, y el ticket de
 * cierre y el semáforo de diferencia de caja imprimían `NaN`.
 *
 * ⚠️ **Por qué un Proxy y no datos de prueba "en string".** SQLite aplica NUMERIC
 * affinity a las columnas `decimal`: insertar `'150000.00'` devuelve el número
 * `150000`, así que por la base es imposible reproducir el caso y el test daría
 * verde con el bug vivo. El Proxy envuelve el `DataSource` e interviene lo único
 * que `computeResumenCaja` usa —`getRepository().find()` y `query()`—
 * stringificando los campos decimales, que es exactamente lo que hace `pg`.
 *
 * Uso: npm run test:resumen-caja-numeros
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { computeResumenCaja } from '../electron/utils/resumen-caja.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Campos `decimal` que `pg` devolvería como string. */
const CAMPOS_DECIMALES = ['valor', 'monto', 'total', 'saldo', 'montoTotal'];

function stringificarDecimales(fila: any): any {
  if (fila == null || typeof fila !== 'object') return fila;
  if (Array.isArray(fila)) return fila.map(stringificarDecimales);
  for (const k of Object.keys(fila)) {
    const v = (fila as any)[k];
    if (CAMPOS_DECIMALES.includes(k) && typeof v === 'number') {
      (fila as any)[k] = v.toFixed(2);
    } else if (v && typeof v === 'object') {
      stringificarDecimales(v);
    }
  }
  return fila;
}

/** DataSource que se comporta como Postgres para los tipos NUMERIC. */
function comoPostgres(ds: DataSource): DataSource {
  return new Proxy(ds, {
    get(target: any, prop: any) {
      if (prop === 'getRepository') {
        return (ent: any) => {
          const repo = target.getRepository(ent);
          return new Proxy(repo, {
            get(r: any, p: any) {
              if (p === 'find' || p === 'findOne') {
                return async (...args: any[]) => stringificarDecimales(await r[p](...args));
              }
              const v = r[p];
              return typeof v === 'function' ? v.bind(r) : v;
            },
          });
        };
      }
      if (prop === 'query') {
        return async (...args: any[]) => stringificarDecimales(await target.query(...args));
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  }) as DataSource;
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-resumen-caja-numeros.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[resumen-caja-numeros] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { ConteoDetalle } = E('financiero/conteo-detalle.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaBillete } = E('financiero/moneda-billete.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { Venta } = E('ventas/venta.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const user: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const gs: any = await save(Moneda, {
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
  });
  const billete: any = await save(MonedaBillete, { moneda: { id: gs.id }, valor: 100000, activo: true });
  const efectivo: any = await save(FormasPago, { nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true });
  const tarjeta: any = await save(FormasPago, { nombre: 'TARJETA', activo: true, movimentaCaja: false });
  const dispositivo: any = await save(Dispositivo, { nombre: 'TERMINAL', activo: true });

  // Apertura: 5 billetes de 100.000 = 500.000
  const conteoAp: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
  await save(ConteoDetalle, { conteo: { id: conteoAp.id }, monedaBillete: { id: billete.id }, cantidad: 5 });

  const caja: any = await save(Caja, {
    estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
    dispositivo: { id: dispositivo.id }, conteoApertura: { id: conteoAp.id }, createdBy: { id: user.id },
  });

  // Dos ventas concluidas: 150.000 en efectivo y 50.000 en efectivo, más
  // 80.000 con tarjeta (que NO mueve el cajón) y un vuelto de 20.000.
  const mkVenta = async (lineas: { fp: any; valor: number; tipo?: string }[]) => {
    const pago: any = await save(Pago, { estado: 'PAGADO', activo: true, caja: { id: caja.id } });
    for (const l of lineas) {
      await save(PagoDetalle, {
        valor: l.valor, descripcion: 'COBRO DE VENTA', tipo: l.tipo || 'PAGO',
        pago: { id: pago.id }, moneda: { id: gs.id }, formaPago: { id: l.fp.id }, activo: true,
      });
    }
    await save(Venta, { estado: 'CONCLUIDA', caja: { id: caja.id }, pago: { id: pago.id } });
  };
  await mkVenta([{ fp: efectivo, valor: 150000 }]);
  await mkVenta([{ fp: efectivo, valor: 50000 }]);
  await mkVenta([{ fp: tarjeta, valor: 80000 }]);
  await mkVenta([{ fp: efectivo, valor: 40000 }, { fp: efectivo, valor: 20000, tipo: 'VUELTO' }]);

  // ── Con el DataSource "Postgres" ──────────────────────────────────────────
  console.log('\n[1] Resumen con decimales como string (Postgres)');
  const resumen: any = await computeResumenCaja(comoPostgres(ds), caja.id);

  const efectivoGs = resumen.efectivoPorMoneda[gs.id];
  const esperadoGs = resumen.esperadoPorMoneda[gs.id];
  const totalGs = resumen.ventasTotalPorMoneda.find((t: any) => t.monedaId === gs.id)?.total;
  const aperturaGs = resumen.conteoApertura.find((c: any) => c.monedaId === gs.id)?.total;

  ok(typeof efectivoGs === 'number' && Number.isFinite(efectivoGs),
    'el efectivo es un número finito, no una concatenación', efectivoGs);
  // 150.000 + 50.000 + 40.000 − 20.000 (vuelto) = 220.000. La tarjeta no mueve caja.
  ok(efectivoGs === 220000, 'efectivo = 220.000 (la tarjeta no mueve el cajón, el vuelto resta)', efectivoGs);
  ok(totalGs === 300000, 'total de ventas = 300.000 (incluye tarjeta, neto de vuelto)', totalGs);
  ok(aperturaGs === 500000, 'el conteo de apertura suma 500.000', aperturaGs);
  ok(Number.isFinite(esperadoGs), 'el esperado NO es NaN', esperadoGs);
  ok(esperadoGs === 720000, 'esperado = apertura 500.000 + efectivo 220.000', esperadoGs);

  // ── Contra el DataSource normal (SQLite): mismo resultado ─────────────────
  console.log('\n[2] Mismo resumen contra SQLite: idéntico');
  const resumenSqlite: any = await computeResumenCaja(ds, caja.id);
  ok(resumenSqlite.efectivoPorMoneda[gs.id] === efectivoGs, 'el efectivo coincide con el de Postgres');
  ok(resumenSqlite.esperadoPorMoneda[gs.id] === esperadoGs, 'el esperado coincide');

  console.log(`\n[resumen-caja-numeros] ${passed} OK, ${failed} fallidos`);
  await ds.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
