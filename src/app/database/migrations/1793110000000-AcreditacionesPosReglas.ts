import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Acreditaciones POS por medio de pago (issue #320, docs/planes/PLAN-acreditaciones-pos.md).
 *
 * ESTRICTAMENTE ADITIVO: 2 tablas nuevas y columnas nullables / con default
 * (maquinas_pos, acreditaciones_pos y pagos_detalles.medio_pos).
 * No cambia el CHECK de `acreditaciones_pos.estado` (SQLite): «vencida sin conciliar» es
 * PENDIENTE con fecha pasada en una máquina con auto_acreditar = false, así no hace falta
 * reconstruir la tabla. Sin backfill: lo existente queda como está.
 */
export class AcreditacionesPosReglas1793110000000 implements MigrationInterface {
  name = 'AcreditacionesPosReglas1793110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const id = isPg ? '"id" SERIAL PRIMARY KEY' : '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const now = isPg ? 'now()' : "(datetime('now'))";
    const dec = isPg ? 'numeric' : 'decimal';
    const T = isPg ? 'true' : '1';
    const F = isPg ? 'false' : '0';
    const auditoria = `"created_at" ${ts} NOT NULL DEFAULT ${now}, "updated_at" ${ts} NOT NULL DEFAULT ${now}, ` +
      `"created_by" integer NULL REFERENCES "usuarios"("id") ON DELETE SET NULL, ` +
      `"updated_by" integer NULL REFERENCES "usuarios"("id") ON DELETE SET NULL`;

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "maquinas_pos_reglas" (
      ${id}, ${auditoria},
      "maquina_pos_id" integer NULL REFERENCES "maquinas_pos"("id") ON DELETE CASCADE,
      "medio" varchar(20) NOT NULL,
      "plazo_dias" integer NOT NULL DEFAULT 0,
      "tipo_dias" varchar(20) NOT NULL DEFAULT 'HABILES',
      "base_plazo" varchar(20) NOT NULL DEFAULT 'PROCESO',
      "correr_a_habil" boolean NOT NULL DEFAULT ${T},
      "porcentaje_comision" ${dec}(7,3) NOT NULL DEFAULT 0,
      "redondeo_comision" ${dec}(10,4) NOT NULL DEFAULT 0,
      "porcentaje_iva_comision" ${dec}(7,3) NOT NULL DEFAULT 0,
      "porcentaje_ret_renta" ${dec}(7,3) NOT NULL DEFAULT 0,
      "porcentaje_ret_iva" ${dec}(7,3) NOT NULL DEFAULT 0,
      "divisor_iva_venta" ${dec}(7,3) NOT NULL DEFAULT 11,
      "modo" varchar(30) NOT NULL DEFAULT 'NETO',
      "verificada" boolean NOT NULL DEFAULT ${F},
      "observacion" text NULL,
      "activo" boolean NOT NULL DEFAULT ${T}
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_maquinas_pos_reglas_maquina_medio" ON "maquinas_pos_reglas" ("maquina_pos_id", "medio")`,
    );

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "conciliaciones_pos" (
      ${id}, ${auditoria},
      "cuenta_bancaria_id" integer NULL REFERENCES "cuentas_bancarias"("id") ON DELETE SET NULL,
      "fecha_credito" date NOT NULL,
      "monto_credito" ${dec}(14,2) NOT NULL,
      "monto_esperado" ${dec}(14,2) NOT NULL,
      "diferencia" ${dec}(14,2) NOT NULL DEFAULT 0,
      "referencia" varchar(100) NULL,
      "cantidad_acreditaciones" integer NULL,
      "estado" varchar(20) NOT NULL DEFAULT 'ACTIVA',
      "fecha_deshecha" ${ts} NULL
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_conciliaciones_pos_cuenta_fecha" ON "conciliaciones_pos" ("cuenta_bancaria_id", "fecha_credito")`,
    );

    const addCol = async (tabla: string, col: string, def: string) => {
      const cols: { name: string }[] = isPg
        ? await queryRunner.query(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1`, [tabla])
        : await queryRunner.query(`PRAGMA table_info("${tabla}")`);
      if (!cols.some((c) => c.name === col)) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${def}`);
    };
    await addCol('maquinas_pos', 'auto_acreditar', `boolean NOT NULL DEFAULT ${T}`);
    await addCol('pagos_detalles', 'medio_pos', 'varchar(20) NULL');
    await addCol('acreditaciones_pos', 'medio', 'varchar(20) NULL');
    await addCol('acreditaciones_pos', 'marca', 'varchar(30) NULL');
    await addCol('acreditaciones_pos', 'cuotas', 'integer NULL');
    await addCol('acreditaciones_pos', 'monto_iva_comision', `${dec}(14,2) NULL`);
    await addCol('acreditaciones_pos', 'monto_ret_renta', `${dec}(14,2) NULL`);
    await addCol('acreditaciones_pos', 'monto_ret_iva', `${dec}(14,2) NULL`);
    await addCol('acreditaciones_pos', 'regla_id', 'integer NULL');
    await addCol('acreditaciones_pos', 'conciliacion_id', 'integer NULL');
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_acreditaciones_pos_conciliacion" ON "acreditaciones_pos" ("conciliacion_id")`,
    );
  }

  /** Solo para desarrollo: en producción no se corre (revertir = versión nueva). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_acreditaciones_pos_conciliacion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conciliaciones_pos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "maquinas_pos_reglas"`);
    // SQLite ≥ 3.35 soporta DROP COLUMN; las columnas son nullables o con default, así que si no se puede, se dejan.
    const drop = async (tabla: string, col: string) => {
      try { await queryRunner.query(`ALTER TABLE "${tabla}" DROP COLUMN ${isPg ? 'IF EXISTS ' : ''}"${col}"`); } catch { /* columna ya no está */ }
    };
    for (const c of ['medio', 'marca', 'cuotas', 'monto_iva_comision', 'monto_ret_renta', 'monto_ret_iva', 'regla_id', 'conciliacion_id']) {
      await drop('acreditaciones_pos', c);
    }
    await drop('maquinas_pos', 'auto_acreditar');
    await drop('pagos_detalles', 'medio_pos');
  }
}
