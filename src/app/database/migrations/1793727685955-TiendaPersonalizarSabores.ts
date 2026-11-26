import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F6b (docs/planes/PLAN-tienda-pizza-personalizar-sabor.md): interruptor
 * «Personalizar sabores» en la configuración de la tienda.
 *
 * ESTRICTAMENTE ADITIVO: una columna booleana que nace APAGADA. Apagada, la tienda no ofrece
 * personalizar cada sabor y el alta de pedidos rechaza esas personalizaciones, así que el local
 * no cambia nada hasta prenderla a mano.
 */
export class TiendaPersonalizarSabores1793727685955 implements MigrationInterface {
  name = 'TiendaPersonalizarSabores1793727685955';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const falso = isPg ? 'false' : '0';
    const tabla = await queryRunner.getTable('tienda_online_config');
    if (tabla && !tabla.findColumnByName('personalizar_sabores')) {
      await queryRunner.query(
        `ALTER TABLE "tienda_online_config" ADD COLUMN "personalizar_sabores" boolean NOT NULL DEFAULT ${falso}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tabla = await queryRunner.getTable('tienda_online_config');
    if (tabla && tabla.findColumnByName('personalizar_sabores')) {
      await queryRunner.dropColumn('tienda_online_config', 'personalizar_sabores');
    }
  }
}
