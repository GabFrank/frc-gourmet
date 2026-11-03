/**
 * Proceso auxiliar de `test:locks-pg` [G]: emite UNA factura contra Postgres.
 *
 * Existe porque dentro de un mismo proceso `withFacturaLock` ya serializa las
 * emisiones, así que dos llamadas desde el mismo Node no prueban el
 * `FOR UPDATE` de `create-factura`. Dos procesos con su propia conexión, sí: es
 * el caso de dos nodos (o dos instancias de Electron) contra el mismo Postgres.
 *
 * Protocolo: argv[2] = JSON `{ usuarioId, payload }`. Conecta, imprime `READY`,
 * espera una línea `GO` por stdin, emite e imprime `RESULT <json>`.
 */
import 'reflect-metadata';
import './_electron-mock';
import * as readline from 'readline';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerFacturacionHandlers } from '../electron/handlers/facturacion.handler';

async function main() {
  const { usuarioId, payload } = JSON.parse(process.argv[2] || '{}');
  const base: any = getDataSourceOptions('.tmp', {
    type: 'postgres',
    host: process.env['FRC_PG_HOST'] || 'localhost',
    port: process.env['FRC_PG_PORT'] ? Number(process.env['FRC_PG_PORT']) : 5432,
    database: process.env['FRC_PG_DATABASE'] || 'frc_gourmet_locktest',
    username: process.env['FRC_PG_USERNAME'] || process.env['USER'] || 'postgres',
    password: process.env['FRC_PG_PASSWORD'] || undefined,
  });
  const ds = new DataSource({ ...base, synchronize: false, migrationsRun: false } as any);
  await ds.initialize();
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const usuario = await ds.getRepository(Usuario).findOneBy({ id: usuarioId });
  registerFacturacionHandlers(ds, () => usuario as any);

  const rl = readline.createInterface({ input: process.stdin });
  console.log('READY');
  await new Promise<void>((res) => rl.on('line', (l) => { if (l.trim() === 'GO') res(); }));
  rl.close();

  let resultado: any;
  try {
    const f: any = await invokeHandler('create-factura', payload);
    resultado = { ok: true, id: f?.id, numero: f?.numeroFactura };
  } catch (e: any) {
    resultado = { ok: false, error: String(e?.message || e) };
  }
  console.log(`RESULT ${JSON.stringify(resultado)}`);
  await ds.destroy();
  process.exit(0);
}
main().catch((e) => { console.log(`RESULT ${JSON.stringify({ ok: false, error: String(e?.message || e) })}`); process.exit(1); });
