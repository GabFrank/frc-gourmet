import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `delivery_requiere_direccion` pasa a arrancar en `false`.
 *
 * La dirección se exigía al dar de alta el delivery, pero el mostrador toma
 * pedidos por teléfono y muchas veces la dirección llega después (el cliente la
 * manda por WhatsApp, o es un conocido cuya dirección ya se sabe). Con el campo
 * obligatorio el cajero no podía ni crear el delivery, y de paso el Enter en
 * OBSERVACIÓN no saltaba al botón CREAR porque el botón estaba deshabilitado.
 *
 * Sigue siendo configurable en *Configuración del PdV → Delivery*: lo que
 * cambia es el default, no la capacidad de exigirla.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class DireccionDeliveryOpcional1787668984617 implements MigrationInterface {
  name = 'DireccionDeliveryOpcional1787668984617';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // SQLite no soporta ALTER COLUMN ... SET DEFAULT. El default de la columna
    // sólo importa para filas nuevas y `pdv_config` es una fila única que ya
    // existe, así que en SQLite alcanza con el UPDATE.
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ALTER COLUMN "delivery_requiere_direccion" SET DEFAULT false`,
      );
    }

    const t = await queryRunner.getTable('pdv_config');
    if (!t) return;
    if (!t.columns.find((c) => c.name === 'delivery_requiere_direccion')) return;
    await queryRunner.query(
      `UPDATE "pdv_config" SET "delivery_requiere_direccion" = ${isPg ? 'false' : '0'}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ALTER COLUMN "delivery_requiere_direccion" SET DEFAULT true`,
      );
    }
  }
}
