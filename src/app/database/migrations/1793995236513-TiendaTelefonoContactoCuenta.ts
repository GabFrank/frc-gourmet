import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online: teléfono de contacto de la cuenta del cliente.
 *
 * Quien entra con Google o con email no tiene teléfono, y el pedido llegaba sin cómo llamarlo.
 * El checkout lo pide y queda acá para la próxima vez. Es un dato de CONTACTO, sin verificar: no
 * va en `telefono` (único, el del ingreso por código de WhatsApp) para que nadie pueda anotar el
 * número de otra persona y quedarse después con el ingreso de esa persona.
 *
 * ESTRICTAMENTE ADITIVO: una columna nullable.
 */
export class TiendaTelefonoContactoCuenta1793995236513 implements MigrationInterface {
  name = 'TiendaTelefonoContactoCuenta1793995236513';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('cuentas_cliente');
    if (t && !t.findColumnByName('telefono_contacto')) {
      await queryRunner.query(`ALTER TABLE "cuentas_cliente" ADD COLUMN "telefono_contacto" varchar(30) NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const t = await queryRunner.getTable('cuentas_cliente');
    if (t && t.findColumnByName('telefono_contacto')) await queryRunner.dropColumn('cuentas_cliente', 'telefono_contacto');
  }
}
