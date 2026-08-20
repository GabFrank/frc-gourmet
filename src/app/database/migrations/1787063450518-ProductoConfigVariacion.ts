import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuración de variaciones POR PRODUCTO.
 *
 * POR QUE: el máximo de sabores combinables y la estrategia de precio vivían
 * sólo en `PdvConfig` (`pizza_max_sabores` / `pizza_estrategia_precio`), o sea
 * una regla única para todo el local. Una pizza admite mitad y mitad; una
 * milanesa con variación, en general no. Con la regla global, el PdV, la PWA y
 * la carta online ofrecían combinar sabores en productos donde no corresponde.
 *
 * Ambas columnas son nullable a propósito: `null` = heredar el valor global,
 * que es el comportamiento actual de todos los productos ya cargados.
 *
 * Estrictamente aditiva. Ver docs/MIGRATIONS.md.
 */
export class ProductoConfigVariacion1787063450518 implements MigrationInterface {
  name = 'ProductoConfigVariacion1787063450518';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const int = isPg ? 'INTEGER' : 'integer';
    const varchar = isPg ? 'character varying(20)' : 'varchar(20)';

    // SQLite no soporta IF NOT EXISTS en ADD COLUMN: se consulta el esquema.
    const tabla = await queryRunner.getTable('producto');
    if (!tabla) return;

    if (!tabla.columns.find((c) => c.name === 'max_variaciones_simultaneas')) {
      await queryRunner.query(
        `ALTER TABLE "producto" ADD COLUMN "max_variaciones_simultaneas" ${int}`,
      );
    }

    if (!tabla.columns.find((c) => c.name === 'estrategia_precio_variacion')) {
      await queryRunner.query(
        `ALTER TABLE "producto" ADD COLUMN "estrategia_precio_variacion" ${varchar}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres soporta DROP COLUMN directo; en SQLite depende de la versión, así
    // que se intenta y se ignora el fallo: revertir sólo pierde el override por
    // producto y la app vuelve a la regla global.
    for (const columna of ['estrategia_precio_variacion', 'max_variaciones_simultaneas']) {
      try {
        await queryRunner.query(`ALTER TABLE "producto" DROP COLUMN "${columna}"`);
      } catch {
        /* SQLite viejo: la columna queda, es inofensiva. */
      }
    }
  }
}
