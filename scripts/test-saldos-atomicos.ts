/**
 * Test #190: los ajustes de saldo de cuentas bancarias y clientes no pierden
 * actualizaciones bajo concurrencia.
 *
 * Parte 1 (siempre): SQLite en memoria — redondeo, minCero, fila inexistente,
 *   delta inválido.
 * Parte 2 (Postgres real en 127.0.0.1:5432 o PGHOST/PGUSER/PGPASSWORD; sin PG se
 *   autosaltea como test:locks-pg):
 *   A · CONTROL: el patrón viejo (leer, sumar en memoria, guardar) en N
 *       transacciones concurrentes PIERDE updates. Si el control no pierde
 *       nada, el test no discrimina y falla.
 *   B · el helper en las mismas N transacciones suma todo.
 *   C · saldo_reservado con minCero y clientes.saldo_actual concurrentes.
 *   D · rollback: un ajuste en una transacción que falla no deja rastro.
 *   E · transferencias cruzadas A→B / B→A concurrentes terminan con saldos
 *       correctos.
 *   H · #350: editar/desactivar un cliente con `saldoActual = undefined` antes
 *       del `save()` no pisa un cobro que entró mientras tanto (con CONTROL: el
 *       save con el saldo leído sí lo pisa).
 *
 * QUÉ REVERTIR PARA QUE FALLE: cambiar `ajustar()` de saldo-atomico.utils.ts por
 * un SELECT + UPDATE con el valor calculado en memoria (caen B, C y F). E solo
 * documenta que con transferencias cruzadas la plata se conserva (deadlock = igual que antes).
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Column, DataSource, Entity, EntityManager, PrimaryColumn } from 'typeorm';
import {
  ajustarSaldoCliente,
  ajustarSaldoCuentaBancaria,
  ajustarSaldoReservadoCuentaBancaria,
} from '../electron/utils/saldo-atomico.utils';

let fallas = 0;
const ok = (cond: boolean, msg: string, data?: any) => {
  if (!cond) {
    fallas++;
    console.error(`❌ ${msg}`, data ?? '');
  } else {
    console.log(`✅ ${msg}`);
  }
};

/** Mínima, sobre la misma tabla: para probar el `save()` de la entidad después del helper. */
@Entity('cuentas_bancarias')
class CuentaT {
  @PrimaryColumn() id!: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 }) saldo!: number;
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, name: 'saldo_reservado' }) saldoReservado!: number;
  @Column({ type: 'varchar', nullable: true }) nombre!: string | null;
}

/** Mínima, para el patrón de update-cliente / delete-cliente (#350). */
@Entity('clientes')
class ClienteT {
  @PrimaryColumn() id!: number;
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, name: 'saldo_actual' }) saldoActual!: number;
  @Column({ type: 'boolean', default: true }) activo!: boolean;
}

/**
 * G · guardia estática: ningún handler vuelve a calcular un saldo en memoria.
 * Las únicas asignaciones permitidas son las que salen del helper
 * (`recalcular-saldo-cliente` fija su absoluto con un UPDATE de la columna, #350).
 */
function guardiaEstatica() {
  const raiz = path.join(__dirname, '..', 'electron');
  const archivos: string[] = [];
  const recorrer = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') recorrer(p); }
      else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) archivos.push(p);
    }
  };
  recorrer(raiz);
  const malos: string[] = [];
  const re = /\b(\w+)\.(saldo|saldoReservado|saldoActual)\s*=(?!=)\s*(.*)$/;
  for (const a of archivos) {
    const lineas = fs.readFileSync(a, 'utf8').split('\n');
    lineas.forEach((l, i) => {
      if (/^\s*(\/\*|\*|\/\/)/.test(l)) return; // comentarios
      // (`entry.saldo +=` es el Map en memoria de recalcular-saldos de caja mayor)
      if (/\.(saldo|saldoReservado|saldoActual)\s*[+-]=/.test(l) && !/\bentry\.saldo \+= delta/.test(l)) {
        malos.push(`${path.relative(raiz, a)}:${i + 1}: ${l.trim()}`);
        return;
      }
      // Después del helper no va un save() de la misma entidad (test F).
      const h = l.match(/\b(\w+)\.\w+ = await ajustarSaldo/);
      if (h) {
        const sig = lineas.slice(i + 1, i + 4).join('\n');
        if (new RegExp(`\\.save\\(([\\w]+, )?${h[1]}\\)`).test(sig)) {
          malos.push(`${path.relative(raiz, a)}:${i + 1}: save() de «${h[1]}» después del ajuste`);
        }
      }
      const m = l.match(re);
      if (!m) return;
      if (m[1] === 'saldo' && m[2] === 'saldo') return; // CajaMayorSaldo (lock propio, PR #185)
      if (/^await ajustarSaldo/.test(m[3])) return;
      malos.push(`${path.relative(raiz, a)}:${i + 1}: ${l.trim()}`);
    });
  }
  ok(malos.length === 0, `G: ningún saldo de cuenta/cliente calculado en memoria (${archivos.length} archivos)`, malos);
}

async function crearTablas(m: EntityManager, pg: boolean) {
  const dec = pg ? 'numeric(14,2)' : 'decimal(14,2)';
  await m.query(`CREATE TABLE cuentas_bancarias (id integer PRIMARY KEY, saldo ${dec} NOT NULL DEFAULT 0, saldo_reservado ${dec} NOT NULL DEFAULT 0, nombre varchar NULL, updated_at timestamp NULL)`);
  await m.query(`CREATE TABLE clientes (id integer PRIMARY KEY, saldo_actual ${pg ? 'numeric(18,2)' : 'decimal(18,2)'} NOT NULL DEFAULT 0, activo boolean NOT NULL DEFAULT true, updated_at ${pg ? 'timestamp' : 'datetime'} NULL)`);
}

async function parteSqlite() {
  const ds = new DataSource({ type: 'sqlite', database: ':memory:', entities: [], synchronize: false });
  await ds.initialize();
  try {
    const m = ds.manager;
    await crearTablas(m, false);
    await m.query(`INSERT INTO cuentas_bancarias (id, saldo, saldo_reservado) VALUES (1, 100, 50)`);
    await m.query(`INSERT INTO clientes (id, saldo_actual) VALUES (7, 0)`);

    ok((await ajustarSaldoCuentaBancaria(m, 1, 0.1)) === 100.1, 'SQLite: suma y devuelve el saldo nuevo');
    ok((await ajustarSaldoCuentaBancaria(m, 1, 0.2)) === 100.3, 'SQLite: redondea a 2 decimales (0.1 + 0.2)');
    ok((await ajustarSaldoCuentaBancaria(m, 1, -200.3)) === -100, 'SQLite: puede quedar negativo (como antes)');
    ok((await ajustarSaldoReservadoCuentaBancaria(m, 1, -80, { minCero: true })) === 0, 'SQLite: saldo_reservado con minCero no baja de 0');
    ok((await ajustarSaldoReservadoCuentaBancaria(m, 1, 30)) === 30, 'SQLite: saldo_reservado suma');
    ok((await ajustarSaldoCliente(m, 7, 1234.567)) === 1234.57, 'SQLite: saldo de cliente redondeado');
    let err = '';
    try { await ajustarSaldoCuentaBancaria(m, 999, 10); } catch (e: any) { err = e.message; }
    ok(/no encontrada/.test(err), 'SQLite: cuenta inexistente lanza', err);
    err = '';
    try { await ajustarSaldoCliente(m, 7, NaN); } catch (e: any) { err = e.message; }
    ok(/delta inválido/.test(err), 'SQLite: delta NaN lanza', err);
    const [u] = await m.query('SELECT updated_at FROM cuentas_bancarias WHERE id = 1');
    ok(!!u.updated_at, 'SQLite: actualiza updated_at', u);
    const [c] = await m.query('SELECT saldo_actual FROM clientes WHERE id = 7');
    ok(Number(c.saldo_actual) === 1234.57, 'SQLite: el NaN no tocó el saldo', c);
  } finally {
    await ds.destroy();
  }
}

async function partePostgres() {
  const base = {
    host: process.env['PGHOST'] || '127.0.0.1',
    port: Number(process.env['PGPORT'] || 5432),
    username: process.env['PGUSER'] || 'postgres',
    password: process.env['PGPASSWORD'] || '',
  };
  const db = `test_saldos_190_${process.pid}`;
  const admin = new DataSource({ type: 'postgres', ...base, database: 'postgres', entities: [], connectTimeoutMS: 3000 } as any);
  try { await admin.initialize(); } catch (e: any) {
    console.log(`⏭️  sin Postgres (${String(e?.message).split('\n')[0]}): salteo la parte Postgres`);
    return;
  }
  await admin.query(`CREATE DATABASE ${db}`);
  const N = 20;
  const ds = new DataSource({ type: 'postgres', ...base, database: db, entities: [CuentaT, ClienteT], extra: { max: N } } as any);
  await ds.initialize();
  try {
    await crearTablas(ds.manager, true);
    await ds.query(`INSERT INTO cuentas_bancarias (id, saldo, saldo_reservado) VALUES (1, 0, 0), (2, 0, 0), (3, 1000, 1000), (4, 1000, 0)`);
    await ds.query(`INSERT INTO clientes (id, saldo_actual) VALUES (7, 0)`);
    const pausa = () => new Promise((r) => setTimeout(r, 20));

    // A · control: read-modify-write como el código viejo
    await Promise.all(Array.from({ length: N }, () => ds.transaction(async (m) => {
      const [fila] = await m.query('SELECT saldo FROM cuentas_bancarias WHERE id = 2');
      await pausa();
      await m.query('UPDATE cuentas_bancarias SET saldo = $1 WHERE id = 2', [Number(fila.saldo) + 10]);
    })));
    const [ctl] = await ds.query('SELECT saldo FROM cuentas_bancarias WHERE id = 2');
    ok(Number(ctl.saldo) < N * 10, `A: el patrón viejo pierde updates (control; quedó ${ctl.saldo} de ${N * 10})`);

    // B · helper
    await Promise.all(Array.from({ length: N }, () => ds.transaction(async (m) => {
      await m.query('SELECT saldo FROM cuentas_bancarias WHERE id = 1');
      await pausa();
      await ajustarSaldoCuentaBancaria(m, 1, 10);
    })));
    const [b] = await ds.query('SELECT saldo FROM cuentas_bancarias WHERE id = 1');
    ok(Number(b.saldo) === N * 10, `B: con el helper no se pierde ninguno (${b.saldo})`);

    // C · reservado con minCero + cliente
    await Promise.all(Array.from({ length: N }, (_, i) => ds.transaction(async (m) => {
      await pausa();
      await ajustarSaldoReservadoCuentaBancaria(m, 3, -10, { minCero: true });
      await ajustarSaldoCliente(m, 7, i % 2 ? 15.5 : -5.25);
    })));
    const [c3] = await ds.query('SELECT saldo_reservado FROM cuentas_bancarias WHERE id = 3');
    const [c7] = await ds.query('SELECT saldo_actual FROM clientes WHERE id = 7');
    ok(Number(c3.saldo_reservado) === 1000 - N * 10, `C: saldo_reservado concurrente (${c3.saldo_reservado})`);
    ok(Number(c7.saldo_actual) === (N / 2) * 15.5 - (N / 2) * 5.25, `C: saldo de cliente concurrente (${c7.saldo_actual})`);
    const r0 = await ds.transaction((m) => ajustarSaldoReservadoCuentaBancaria(m, 4, -5, { minCero: true }));
    ok(r0 === 0, 'C: minCero en Postgres (GREATEST)', r0);

    // D · rollback
    try {
      await ds.transaction(async (m) => {
        await ajustarSaldoCuentaBancaria(m, 1, 999);
        throw new Error('falla simulada');
      });
    } catch { /* esperado */ }
    const [d] = await ds.query('SELECT saldo FROM cuentas_bancarias WHERE id = 1');
    ok(Number(d.saldo) === N * 10, 'D: el rollback revierte el ajuste', d);

    // E · transferencias cruzadas (patrón caja-mayor: origen −, destino +)
    await ds.query('UPDATE cuentas_bancarias SET saldo = 1000 WHERE id IN (3, 4)');
    let deadlocks = 0;
    await Promise.all(Array.from({ length: N }, (_, i) => ds.transaction(async (m) => {
      const [o, de] = i % 2 ? [3, 4] : [4, 3];
      await ajustarSaldoCuentaBancaria(m, o, -7);
      await pausa();
      await ajustarSaldoCuentaBancaria(m, de, 7);
    }).catch((e) => { if (/deadlock/i.test(e.message)) deadlocks++; else throw e; })));
    const [e3] = await ds.query('SELECT saldo FROM cuentas_bancarias WHERE id = 3');
    const [e4] = await ds.query('SELECT saldo FROM cuentas_bancarias WHERE id = 4');
    // Postgres puede abortar alguna por deadlock (igual que con el save() de
    // antes, que lockeaba en el mismo orden): lo que no puede pasar es perder
    // plata. La que aborta se revierte entera, así que la suma se conserva.
    ok(Number(e3.saldo) + Number(e4.saldo) === 2000, `E: se conserva la suma (${e3.saldo} + ${e4.saldo}, deadlocks ${deadlocks})`);

    // F · por qué los handlers ya NO hacen `save()` de la entidad después del
    // helper (hallazgo crítico de la auditoría del plan): TypeORM relee la fila y
    // reescribe toda columna que difiera de la entidad, que se cargó ANTES. Con
    // un ajuste concurrente de la OTRA columna de saldo, el save la pisa.
    await ds.query('UPDATE cuentas_bancarias SET saldo = 0, saldo_reservado = 0 WHERE id = 1');
    const conSave = async (guardar: boolean) => {
      const q = ds.createQueryRunner();
      await q.connect(); await q.startTransaction();
      try {
        const cb = await q.manager.findOne(CuentaT, { where: { id: 1 } });
        // otra PC reserva un cheque diferido y commitea en el medio
        await ds.transaction((m) => ajustarSaldoReservadoCuentaBancaria(m, 1, 50));
        cb!.saldo = await ajustarSaldoCuentaBancaria(q.manager, cb!.id, 10);
        if (guardar) await q.manager.save(CuentaT, cb!);
        await q.commitTransaction();
      } finally { await q.release(); }
      const [r] = await ds.query('SELECT saldo, saldo_reservado FROM cuentas_bancarias WHERE id = 1');
      return r;
    };
    const fCtl = await conSave(true);
    ok(Number(fCtl.saldo_reservado) === 0, `F: CONTROL — helper + save() de la entidad vieja pisa saldo_reservado (${fCtl.saldo_reservado})`);
    await ds.query('UPDATE cuentas_bancarias SET saldo = 0, saldo_reservado = 0 WHERE id = 1');
    const fOk = await conSave(false);
    ok(Number(fOk.saldo) === 10 && Number(fOk.saldo_reservado) === 50, `F: helper sin save() conserva las dos columnas (${fOk.saldo} / ${fOk.saldo_reservado})`);

    // H · #350: editar un cliente (save de la entidad entera) mientras entra un cobro
    const editarCliente = async (sinSaldo: boolean) => {
      await ds.query('UPDATE clientes SET saldo_actual = 100, activo = true WHERE id = 7');
      const cli = await ds.manager.findOne(ClienteT, { where: { id: 7 } });
      // otra PC cobra (−30) y commitea con el diálogo de edición abierto
      await ds.transaction((m) => ajustarSaldoCliente(m, 7, -30));
      cli!.activo = false;
      if (sinSaldo) (cli as any).saldoActual = undefined;
      await ds.manager.save(ClienteT, cli!);
      const [r] = await ds.query('SELECT saldo_actual, activo FROM clientes WHERE id = 7');
      return r;
    };
    const hCtl = await editarCliente(false);
    ok(Number(hCtl.saldo_actual) === 100, `H: CONTROL — save() con el saldo leído pisa el cobro (${hCtl.saldo_actual})`);
    const hOk = await editarCliente(true);
    ok(Number(hOk.saldo_actual) === 70 && hOk.activo === false, `H: con saldoActual = undefined guarda la edición y conserva el cobro (${hOk.saldo_actual}, activo ${hOk.activo})`);
  } finally {
    await ds.destroy();
    await admin.query(`DROP DATABASE IF EXISTS ${db}`);
    await admin.destroy();
  }
}

(async () => {
  console.log('Test #190 saldos atómicos');
  guardiaEstatica();
  await parteSqlite();
  await partePostgres();
  if (fallas) {
    console.error(`\n${fallas} falla(s)`);
    process.exit(1);
  }
  console.log('\nOK');
})().catch((e) => { console.error(e); process.exit(1); });
