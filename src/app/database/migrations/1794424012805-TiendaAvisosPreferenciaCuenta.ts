import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online: el cliente elige en «Mi cuenta» si quiere los avisos del pedido por WhatsApp.
 *
 * NULL = todavía no eligió (manda la casilla de cada checkout, que viene destildada). TRUE/FALSE =
 * lo eligió (en la cuenta o en la casilla del último checkout) y vale también para los pedidos en
 * curso: apagarlo corta los avisos que faltan.
 *
 * ESTRICTAMENTE ADITIVO: una columna nullable.
 */
export class TiendaAvisosPreferenciaCuenta1794424012805 implements MigrationInterface {
  name = 'TiendaAvisosPreferenciaCuenta1794424012805';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('cuentas_cliente');
    if (t && !t.findColumnByName('avisos_whatsapp')) {
      await queryRunner.query(`ALTER TABLE "cuentas_cliente" ADD COLUMN "avisos_whatsapp" boolean NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('cuentas_cliente');
    if (t && t.findColumnByName('avisos_whatsapp')) await queryRunner.dropColumn('cuentas_cliente', 'avisos_whatsapp');
  }
}
