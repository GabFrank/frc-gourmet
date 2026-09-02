import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill de `deliveries.precio_delivery_id` para los repartos que nacieron de
 * un pedido de la tienda online.
 *
 * `materializarPedidoOnlineEnVenta` creaba el `Delivery` pasando el costo
 * congelado del pedido pero **no la zona**: la zona quedaba sólo en
 * `pedidos_online.zona_delivery_id` y del lado del PdV el reparto figuraba sin
 * zona. Mientras nadie agrupara por zona no se notaba; en cuanto los informes
 * de venta empiezan a contar envíos por zona, todo lo que entró por la web cae
 * en "SIN ZONA" y el gráfico dice que el único canal con zonas conocidas es el
 * mostrador.
 *
 * El alta ya quedó corregida. Esta migración recupera lo que se perdió hasta
 * acá, resolviendo la zona por el mismo camino que usa el alta ahora:
 * `pedidos_online.zona_delivery_id` → `zonas_delivery.precio_delivery_id`, que
 * es la tarifa compartida entre los dos canales.
 *
 * Es **aditiva**: sólo escribe filas cuyo `precio_delivery_id` está en NULL, así
 * que no puede pisar una zona ya asignada a mano desde el diálogo del PdV. Las
 * zonas anteriores a la unificación de tarifas tienen `precio_delivery_id` en
 * NULL y no participan: no hay zona que sellar.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class BackfillZonaDeliveryPedidosOnline1787877249492 implements MigrationInterface {
  name = 'BackfillZonaDeliveryPedidosOnline1787877249492';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Instalaciones sin la tienda online no tienen estas tablas: no hay nada
    // que backfillear y la consulta reventaría.
    for (const tabla of ['deliveries', 'pedidos_online', 'zonas_delivery']) {
      if (!(await queryRunner.getTable(tabla))) return;
    }

    // Subconsulta correlacionada: la soportan los dos drivers, así que no hace
    // falta ramificar entre `UPDATE ... FROM` (Postgres) y la forma de SQLite.
    //
    // El `modo = 'DELIVERY'` es defensivo: un RETIRO no tiene zona por
    // definición, y si un pedido PICKUP quedó con `zona_delivery_id` cargado
    // (la web lo permite antes de que el cliente cambie de opinión), sellarle
    // una zona lo contaría como envío en los informes.
    await queryRunner.query(`
      UPDATE "deliveries"
      SET "precio_delivery_id" = (
        SELECT "z"."precio_delivery_id"
        FROM "pedidos_online" "p"
        JOIN "zonas_delivery" "z" ON "z"."id" = "p"."zona_delivery_id"
        WHERE "p"."delivery_id" = "deliveries"."id"
          AND "z"."precio_delivery_id" IS NOT NULL
      )
      WHERE "deliveries"."precio_delivery_id" IS NULL
        AND "deliveries"."modo" = 'DELIVERY'
        AND EXISTS (
          SELECT 1
          FROM "pedidos_online" "p2"
          JOIN "zonas_delivery" "z2" ON "z2"."id" = "p2"."zona_delivery_id"
          WHERE "p2"."delivery_id" = "deliveries"."id"
            AND "z2"."precio_delivery_id" IS NOT NULL
        )
    `);
  }

  public async down(): Promise<void> {
    // No-op a propósito: revertir significaría borrar zonas correctas sin poder
    // distinguir las que puso este backfill de las que cargó un cajero después.
    // La ausencia de zona era el bug, no el estado al que se quiera volver.
  }
}
