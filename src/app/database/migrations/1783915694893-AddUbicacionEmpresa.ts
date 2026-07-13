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
 * Ubicación de la empresa para la geocerca del fichaje facial: `latitud`,
 * `longitud` (numeric) y `radio_fichaje_metros` (int). Portable SQLite/Postgres.
 */
export class AddUbicacionEmpresa1783915694893 implements MigrationInterface {
  name = 'AddUbicacionEmpresa1783915694893';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'empresa', 'latitud', isPg))) {
      await queryRunner.query(`ALTER TABLE "empresa" ADD COLUMN "latitud" numeric(10,7) NULL`);
    }
    if (!(await hasColumn(queryRunner, 'empresa', 'longitud', isPg))) {
      await queryRunner.query(`ALTER TABLE "empresa" ADD COLUMN "longitud" numeric(10,7) NULL`);
    }
    if (!(await hasColumn(queryRunner, 'empresa', 'radio_fichaje_metros', isPg))) {
      await queryRunner.query(`ALTER TABLE "empresa" ADD COLUMN "radio_fichaje_metros" integer NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "empresa" DROP COLUMN "radio_fichaje_metros"`);
      await queryRunner.query(`ALTER TABLE "empresa" DROP COLUMN "longitud"`);
      await queryRunner.query(`ALTER TABLE "empresa" DROP COLUMN "latitud"`);
    } catch { /* SQLite viejo */ }
  }
}
