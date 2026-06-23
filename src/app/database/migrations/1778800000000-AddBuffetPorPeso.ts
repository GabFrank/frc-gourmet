import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 — Producto buffet por peso.
 *
 * - producto: tara_gramos, peso_minimo_gramos, descuenta_por_receta.
 * - precio_venta: precio_minimo, precio_maximo (tope "buffet libre").
 * - venta_items: peso_bruto, peso_tara, peso_neto, precio_por_kg, aplico_libre;
 *   y cantidad pasa a numeric(10,3) en Postgres (SQLite es dinámico).
 *
 * Aditiva e idempotente (guard por columna existente). El tipo de producto
 * BUFFET_POR_PESO se guarda como string en la columna `tipo` (varchar), por lo
 * que no requiere ALTER de enum.
 */
export class AddBuffetPorPeso1778800000000 implements MigrationInterface {
  name = 'AddBuffetPorPeso1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    const add = async (table: string, col: string, type: string) => {
      if (await this.hasColumn(queryRunner, table, col, isPg)) return;
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${type}`);
    };

    const boolDefault = isPg ? 'boolean NOT NULL DEFAULT false' : 'boolean NOT NULL DEFAULT 0';

    // producto
    await add('producto', 'tara_gramos', 'decimal(10,3) NULL');
    await add('producto', 'peso_minimo_gramos', 'decimal(10,3) NULL');
    await add('producto', 'descuenta_por_receta', boolDefault);

    // precio_venta
    await add('precio_venta', 'precio_minimo', 'decimal(10,2) NULL');
    await add('precio_venta', 'precio_maximo', 'decimal(10,2) NULL');

    // venta_items
    await add('venta_items', 'peso_bruto', 'decimal(10,3) NULL');
    await add('venta_items', 'peso_tara', 'decimal(10,3) NULL');
    await add('venta_items', 'peso_neto', 'decimal(10,3) NULL');
    await add('venta_items', 'precio_por_kg', 'decimal(10,2) NULL');
    await add('venta_items', 'aplico_libre', boolDefault);

    // cantidad → 3 decimales (solo Postgres; SQLite no fija escala).
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "venta_items" ALTER COLUMN "cantidad" TYPE numeric(10,3)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drops: [string, string][] = [
      ['producto', 'tara_gramos'],
      ['producto', 'peso_minimo_gramos'],
      ['producto', 'descuenta_por_receta'],
      ['precio_venta', 'precio_minimo'],
      ['precio_venta', 'precio_maximo'],
      ['venta_items', 'peso_bruto'],
      ['venta_items', 'peso_tara'],
      ['venta_items', 'peso_neto'],
      ['venta_items', 'precio_por_kg'],
      ['venta_items', 'aplico_libre'],
    ];
    for (const [table, col] of drops) {
      try {
        await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${col}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN; no-op.
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
