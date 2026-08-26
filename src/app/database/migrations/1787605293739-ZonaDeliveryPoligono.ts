import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Zonas de delivery dibujadas sobre un mapa.
 *
 * Antes el costo del envío de un pedido online se resolvía con un
 * `zonaDeliveryId` que el cliente tenía que mandar. En la práctica nunca lo
 * mandaba —el checkout no tenía selector— así que el envío quedaba siempre en 0.
 * Y el selector tampoco era la solución: **la zona es un dato interno del
 * negocio**, y pedirle al cliente que se autoclasifique es pedirle que adivine
 * el mapa del local. Si adivina mal, o el local pierde plata o el cliente se
 * lleva una sorpresa.
 *
 * Ahora la zona se dibuja como un polígono en la configuración y el servidor
 * resuelve en cuál cae el punto que el cliente eligió en el mapa (que ya viajaba
 * en el pedido). Beneficio lateral: el cliente deja de mandar la zona, así que
 * desaparece la clase entera de problema de "mandar la zona barata".
 *
 * Dos columnas:
 *
 * - `poligono`: GeoJSON como TEXTO, no un tipo geométrico. No hay PostGIS en el
 *   stack y la regla del repo es que el esquema funcione igual en SQLite y en
 *   Postgres; el cálculo (point-in-polygon por ray casting) corre en JS.
 * - `precio_delivery_id`: la tarifa pasa a salir de la tabla que ya usa el
 *   delivery del PdV. Sin esto habría dos precios para la misma zona —uno para
 *   la web y otro para el mostrador— y el cajero vería dos números distintos
 *   para el mismo reparto. `tarifa` se conserva como fallback de las zonas
 *   viejas que todavía no apunten a un precio.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class ZonaDeliveryPoligono1787605293739 implements MigrationInterface {
  name = 'ZonaDeliveryPoligono1787605293739';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const text = isPg ? 'TEXT' : 'text';
    const int = isPg ? 'INTEGER' : 'integer';

    const t = await queryRunner.getTable('zonas_delivery');
    if (!t) return;

    const addColumn = async (columna: string, definicion: string) => {
      const tabla = await queryRunner.getTable('zonas_delivery');
      if (!tabla || tabla.columns.find((c) => c.name === columna)) return;
      await queryRunner.query(`ALTER TABLE "zonas_delivery" ADD COLUMN "${columna}" ${definicion}`);
    };

    await addColumn('poligono', `${text} NULL`);
    await addColumn('precio_delivery_id', `${int} NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "zonas_delivery" DROP COLUMN "precio_delivery_id"`);
      await queryRunner.query(`ALTER TABLE "zonas_delivery" DROP COLUMN "poligono"`);
    } catch {
      // SQLite viejo no soporta DROP COLUMN.
    }
  }
}
