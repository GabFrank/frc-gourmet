import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hace configurable EN QUÉ ETAPA el repartidor es obligatorio.
 *
 * Hasta ahora `delivery_requiere_repartidor` era un único booleano y el candado
 * estaba cableado a EN_CAMINO (`delivery.handler.ts`, "Seleccioná el repartidor
 * antes de enviar el pedido"). Eso impide una operación real: que el pedido
 * salga y recién después se registre quién lo llevó.
 *
 * El booleano viejo pasa a significar sólo "el repartidor es bloqueante", y esta
 * columna nueva dice dónde bloquea:
 *
 * - `EN_CAMINO`  — hay que elegirlo para enviar el pedido (comportamiento actual)
 * - `ENTREGADO`  — el pedido puede salir sin repartidor, pero no se puede dar por
 *                  finalizado sin registrarlo
 *
 * Default `EN_CAMINO` a propósito: con el booleano viejo en `true` (su default),
 * la combinación reproduce **exactamente** el comportamiento de hoy, así que la
 * migración no cambia la operación de ningún local hasta que alguien toque la
 * configuración.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class DeliveryRepartidorEtapa1787602817736 implements MigrationInterface {
  name = 'DeliveryRepartidorEtapa1787602817736';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const varchar = isPg ? 'VARCHAR(20)' : 'varchar(20)';

    // SQLite no acepta `IF NOT EXISTS` en ADD COLUMN: se consulta el esquema.
    const t = await queryRunner.getTable('pdv_config');
    if (!t) return;
    if (t.columns.find((c) => c.name === 'delivery_repartidor_etapa')) return;

    await queryRunner.query(
      `ALTER TABLE "pdv_config" ADD COLUMN "delivery_repartidor_etapa" `
      + `${varchar} NOT NULL DEFAULT 'EN_CAMINO'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SQLite viejo no soporta DROP COLUMN; en Postgres sí. Tolerante a ambos.
    try {
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "delivery_repartidor_etapa"`);
    } catch {
      // no-op
    }
  }
}
