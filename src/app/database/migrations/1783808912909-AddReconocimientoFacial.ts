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
 * Reconocimiento facial para marcación de asistencia — Fase 1 (datos).
 *
 * - Crea `funcionario_rostros` (embeddings de enrollment por funcionario). El embedding
 *   se guarda como JSON en columna `text` en ambos drivers (no `jsonb`: el driver pg
 *   devolveria el jsonb ya parseado y SQLite un string, rompiendo la consistencia; el
 *   match carga todo en memoria, no necesita queries sobre el vector).
 * - Agrega a `asistencias` las columnas de auditoría del método de registro:
 *   `metodo_registro` (MANUAL|FACIAL) y `similitud_facial` (score del match).
 * Portable SQLite/Postgres, additiva e idempotente.
 */
export class AddReconocimientoFacial1783808912909 implements MigrationInterface {
  name = 'AddReconocimientoFacial1783808912909';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsDefault = isPg ? 'now()' : "(datetime('now'))";
    const embeddingType = 'text';
    const fk = isPg
      ? `, CONSTRAINT "FK_funcionario_rostros_funcionario" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id")`
      : '';

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "funcionario_rostros" (
        "id" ${pk},
        "funcionario_id" integer NOT NULL,
        "embedding" ${embeddingType} NOT NULL,
        "dimension" integer NOT NULL,
        "modelo" varchar(50) NOT NULL,
        "thumbnail_url" varchar(500) NULL,
        "activo" boolean NOT NULL DEFAULT true,
        "created_at" ${ts} NOT NULL DEFAULT ${tsDefault},
        "updated_at" ${ts} NOT NULL DEFAULT ${tsDefault},
        "created_by" integer NULL,
        "updated_by" integer NULL${fk}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_funcionario_rostros_funcionario" ON "funcionario_rostros" ("funcionario_id")`);

    // Columnas de auditoría en asistencias
    if (!(await hasColumn(queryRunner, 'asistencias', 'metodo_registro', isPg))) {
      await queryRunner.query(`ALTER TABLE "asistencias" ADD COLUMN "metodo_registro" varchar(20) NULL`);
    }
    if (!(await hasColumn(queryRunner, 'asistencias', 'similitud_facial', isPg))) {
      await queryRunner.query(`ALTER TABLE "asistencias" ADD COLUMN "similitud_facial" numeric(5,4) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "asistencias" DROP COLUMN "similitud_facial"`);
      await queryRunner.query(`ALTER TABLE "asistencias" DROP COLUMN "metodo_registro"`);
    } catch { /* SQLite viejo */ }
    await queryRunner.query(`DROP TABLE IF EXISTS "funcionario_rostros"`);
  }
}
