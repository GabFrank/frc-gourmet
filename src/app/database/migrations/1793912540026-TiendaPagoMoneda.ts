import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F8 (docs/planes/PLAN-tienda-online-F8-pago-y-moneda.md): cómo va a pagar el
 * cliente (modalidad, moneda, «paga con», cotización y observación) y qué métodos ofrece la
 * tienda.
 *
 * ESTRICTAMENTE ADITIVO: columnas nullable. Sin datos, todo se comporta como antes (efectivo
 * contra entrega, sólo efectivo ofrecido).
 */
export class TiendaPagoMoneda1793912540026 implements MigrationInterface {
  name = 'TiendaPagoMoneda1793912540026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const dec = (p: number, s: number) => (isPg ? `numeric(${p},${s})` : `decimal(${p},${s})`);
    const agregar = async (tabla: string, columna: string, tipo: string) => {
      const t = await queryRunner.getTable(tabla);
      if (t && !t.findColumnByName(columna)) {
        await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${columna}" ${tipo} NULL`);
      }
    };
    await agregar('pedidos_online', 'pago_modalidad', 'varchar(20)');
    await agregar('pedidos_online', 'pago_moneda_id', isPg ? 'integer' : 'integer');
    await agregar('pedidos_online', 'vuelto_para', dec(18, 2));
    await agregar('pedidos_online', 'pago_cotizacion', dec(18, 4));
    await agregar('pedidos_online', 'pago_observacion', 'varchar(200)');
    await agregar('tienda_online_config', 'metodos_pago', 'text');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [tabla, col] of [
      ['tienda_online_config', 'metodos_pago'],
      ['pedidos_online', 'pago_observacion'],
      ['pedidos_online', 'pago_cotizacion'],
      ['pedidos_online', 'vuelto_para'],
      ['pedidos_online', 'pago_moneda_id'],
      ['pedidos_online', 'pago_modalidad'],
    ]) {
      const t = await queryRunner.getTable(tabla);
      if (t && t.findColumnByName(col)) await queryRunner.dropColumn(tabla, col);
    }
  }
}
