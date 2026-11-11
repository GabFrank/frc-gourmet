import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online: la forma de pago online (cuenta de IC Pay, Bancard…) se vincula a una máquina POS.
 *
 * Lo cobrado online no entraba a ningún lado: ni a la caja ni a Bancos. Con la máquina, al aceptar
 * el pedido se crea su acreditación (monto real cobrado por el proveedor, en la moneda de la cuenta
 * del POS, con la comisión y el plazo de sus reglas), como un cobro con tarjeta.
 *
 * ESTRICTAMENTE ADITIVO: una columna nullable, sin FK declarada (igual que pagos_detalles.maquina_pos_id).
 */
export class TiendaFormaPagoOnlinePos1794427578823 implements MigrationInterface {
  name = 'TiendaFormaPagoOnlinePos1794427578823';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('formas_pago_online');
    if (t && !t.findColumnByName('maquina_pos_id')) {
      await queryRunner.query(`ALTER TABLE "formas_pago_online" ADD COLUMN "maquina_pos_id" integer NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('formas_pago_online');
    if (t && t.findColumnByName('maquina_pos_id')) await queryRunner.dropColumn('formas_pago_online', 'maquina_pos_id');
  }
}
