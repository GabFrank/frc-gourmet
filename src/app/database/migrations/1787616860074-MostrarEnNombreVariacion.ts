import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `mostrar_en_nombre` en `presentacion` y `sabor`.
 *
 * El nombre de una variación se arma como `producto + tamaño + sabor`, y a veces
 * una de esas partes no aporta nada:
 *
 * - QUESADILLAS tiene una presentación llamada «TRADICIONAL» que es puro relleno
 *   —se cargó así porque el nombre de la presentación es obligatorio y no hay
 *   forma de dejarlo vacío—, y el ítem termina imprimiéndose como
 *   «QUESADILLAS TRADICIONAL CARNE».
 * - MILANESITA, PICADA, TILAPIA y POLLITO tienen un único sabor, también llamado
 *   «TRADICIONAL», que no distingue nada: «MILANESITA DON FRANCO GRANDE
 *   TRADICIONAL».
 *
 * Se resuelve marcando el registro, no adivinando por el nombre: una heurística
 * del tipo «si se llama TRADICIONAL, ocultalo» rompería los casos donde
 * TRADICIONAL **sí** distingue (AROS DE CEBOLLA y PAPAS FRITAS tienen
 * TRADICIONAL vs BACON Y CHEDDAR).
 *
 * Default `true`: con la migración sola no cambia ningún nombre. Los registros
 * que corresponda los marca el operador desde la pantalla de producto.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class MostrarEnNombreVariacion1787616860074 implements MigrationInterface {
  name = 'MostrarEnNombreVariacion1787616860074';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const bool = isPg ? 'BOOLEAN' : 'boolean';
    const def = isPg ? 'true' : '1';

    // SQLite no acepta `IF NOT EXISTS` en ADD COLUMN: se consulta el esquema.
    const addColumn = async (tabla: string) => {
      const t = await queryRunner.getTable(tabla);
      if (!t) return;
      if (t.columns.find((c) => c.name === 'mostrar_en_nombre')) return;
      await queryRunner.query(
        `ALTER TABLE "${tabla}" ADD COLUMN "mostrar_en_nombre" ${bool} NOT NULL DEFAULT ${def}`,
      );
    };

    await addColumn('presentacion');
    await addColumn('sabor');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "sabor" DROP COLUMN "mostrar_en_nombre"`);
      await queryRunner.query(`ALTER TABLE "presentacion" DROP COLUMN "mostrar_en_nombre"`);
    } catch {
      // SQLite viejo no soporta DROP COLUMN.
    }
  }
}
