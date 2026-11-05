import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F9 (docs/planes/PLAN-tienda-online-F9-detalle-pedido-y-login.md): solicitud de
 * cancelación del cliente, proveedor de WhatsApp para los códigos de ingreso y teléfono del local.
 *
 * ESTRICTAMENTE ADITIVO: columnas nullable. Sin datos, todo se comporta como antes.
 */
export class TiendaDetallePedido1793919146544 implements MigrationInterface {
  name = 'TiendaDetallePedido1793919146544';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const agregar = async (tabla: string, columna: string, tipo: string) => {
      const t = await queryRunner.getTable(tabla);
      if (t && !t.findColumnByName(columna)) {
        await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${columna}" ${tipo} NULL`);
      }
    };
    await agregar('pedidos_online', 'cancelacion_solicitada_en', isPg ? 'timestamp' : 'datetime');
    await agregar('pedidos_online', 'cancelacion_motivo', 'varchar(200)');
    await agregar('pedidos_online', 'cancelacion_respuesta', 'varchar(200)');
    await agregar('tienda_online_config', 'whatsapp_proveedor', 'varchar(20)');
    await agregar('tienda_online_config', 'telefono_contacto', 'varchar(30)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [tabla, col] of [
      ['tienda_online_config', 'telefono_contacto'],
      ['tienda_online_config', 'whatsapp_proveedor'],
      ['pedidos_online', 'cancelacion_respuesta'],
      ['pedidos_online', 'cancelacion_motivo'],
      ['pedidos_online', 'cancelacion_solicitada_en'],
    ]) {
      const t = await queryRunner.getTable(tabla);
      if (t && t.findColumnByName(col)) await queryRunner.dropColumn(tabla, col);
    }
  }
}
