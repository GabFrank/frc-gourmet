import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ventas.canal_origen` — de dónde vino la venta.
 *
 * Nace de dos problemas distintos que resulta que son el mismo dato faltante:
 *
 * 1. **Cocina.** Los hooks de KDS e impresión se saltean cualquier venta sin
 *    mesa ni comanda (`ventas.handler.ts`, "Venta directa sin cocina"). Es una
 *    aproximación razonable mientras la única venta sin mesa es la del
 *    mostrador, pero deja afuera a los pedidos online de PICKUP y DELIVERY, que
 *    no tienen mesa y sí tienen que llegar a la cocina. El predicado que los
 *    hooks quieren en realidad es "esta venta va a cocina", y el canal lo
 *    responde sin abusar de la semántica de `Comanda`.
 *
 * 2. **Reportes.** Una venta materializada desde la web era indistinguible de
 *    una de mostrador: no había forma de separar el canal online en ningún
 *    reporte, aunque el pedido sí guardara su `canalOrigen`.
 *
 * Valores: `LOCAL` (default, todo lo que ya existe), `WEB` (pedido online
 * PICKUP/DELIVERY) y `QR_MESA` (autoservicio en mesa). El default preserva el
 * comportamiento de todas las ventas históricas y de la venta rápida de
 * mostrador, que sigue sin ir a cocina.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class VentaCanalOrigen1787603993308 implements MigrationInterface {
  name = 'VentaCanalOrigen1787603993308';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const varchar = isPg ? 'VARCHAR(20)' : 'varchar(20)';

    // SQLite no acepta `IF NOT EXISTS` en ADD COLUMN: se consulta el esquema.
    const t = await queryRunner.getTable('ventas');
    if (!t) return;
    if (t.columns.find((c) => c.name === 'canal_origen')) return;

    await queryRunner.query(
      `ALTER TABLE "ventas" ADD COLUMN "canal_origen" ${varchar} NOT NULL DEFAULT 'LOCAL'`,
    );

    // Los reportes por canal filtran por esta columna sobre tablas grandes.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ventas_canal_origen" ON "ventas" ("canal_origen")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`DROP INDEX IF EXISTS "idx_ventas_canal_origen"`);
      await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "canal_origen"`);
    } catch {
      // SQLite viejo no soporta DROP COLUMN.
    }
  }
}
