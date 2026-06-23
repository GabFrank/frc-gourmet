import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 0 — Precios programados por día/horario.
 *
 * Agrega a `precio_venta` los campos de vigencia (días de semana, rango horario,
 * rango de fechas y prioridad). Todos nullable / con default → aditiva y segura
 * sobre datos existentes (un precio sin estos campos sigue siendo base/fallback).
 *
 * Driver-aware: SQLite vs Postgres difieren en tipos (date/integer) y en el
 * literal booleano del default. Idempotente con guard por columna existente.
 */
export class AddPrecioVentaVigencia1778700000000 implements MigrationInterface {
  name = 'AddPrecioVentaVigencia1778700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    const addColumn = async (col: string, sqliteType: string, pgType: string) => {
      const has = await this.hasColumn(queryRunner, 'precio_venta', col, isPg);
      if (has) return;
      const type = isPg ? pgType : sqliteType;
      await queryRunner.query(`ALTER TABLE "precio_venta" ADD COLUMN "${col}" ${type}`);
    };

    await addColumn('dias_semana', 'varchar(30) NULL', 'varchar(30) NULL');
    await addColumn('hora_inicio', 'varchar(5) NULL', 'varchar(5) NULL');
    await addColumn('hora_fin', 'varchar(5) NULL', 'varchar(5) NULL');
    await addColumn('fecha_inicio', 'date NULL', 'date NULL');
    await addColumn('fecha_fin', 'date NULL', 'date NULL');
    await addColumn('prioridad', 'integer NOT NULL DEFAULT 0', 'integer NOT NULL DEFAULT 0');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const cols = ['dias_semana', 'hora_inicio', 'hora_fin', 'fecha_inicio', 'fecha_fin', 'prioridad'];
    for (const col of cols) {
      try {
        await queryRunner.query(`ALTER TABLE "precio_venta" DROP COLUMN "${col}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN; no-op (reset DB es la salida).
      }
    }
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    isPg: boolean,
  ): Promise<boolean> {
    if (isPg) {
      const rows = await queryRunner.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, column],
      );
      return rows.length > 0;
    }
    const rows = await queryRunner.query(`PRAGMA table_info("${table}")`);
    return Array.isArray(rows) && rows.some((r: any) => r.name === column);
  }
}
