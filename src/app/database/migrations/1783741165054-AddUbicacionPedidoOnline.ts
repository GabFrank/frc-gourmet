import { MigrationInterface, QueryRunner } from 'typeorm';

async function hasColumn(qr: QueryRunner, table: string, col: string, isPg: boolean): Promise<boolean> {
  if (isPg) {
    const r = await qr.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, col]);
    return r.length > 0;
  }
  const r = await qr.query(`PRAGMA table_info("${table}")`);
  return Array.isArray(r) && r.some((x: any) => x.name === col);
}

/**
 * Pedidos online — Fase D: ubicación de entrega (lat/lng del mapa).
 * Agrega `latitud` y `longitud` a `pedidos_online` para guardar el punto elegido
 * en el mapa (Leaflet) además del texto de la dirección. Portable SQLite/Postgres.
 */
export class AddUbicacionPedidoOnline1783741165054 implements MigrationInterface {
  name = 'AddUbicacionPedidoOnline1783741165054';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const type = 'numeric(10,7)';
    for (const col of ['latitud', 'longitud']) {
      if (await hasColumn(queryRunner, 'pedidos_online', col, isPg)) continue;
      await queryRunner.query(`ALTER TABLE "pedidos_online" ADD COLUMN "${col}" ${type} NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "pedidos_online" DROP COLUMN "longitud"`);
      await queryRunner.query(`ALTER TABLE "pedidos_online" DROP COLUMN "latitud"`);
    } catch { /* SQLite viejo */ }
  }
}
