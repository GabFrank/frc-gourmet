import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `deliveries.modo`: DELIVERY (se reparte) o RETIRO (el cliente lo busca).
 *
 * Antes, un pedido para retirar sólo existía como `PedidoOnline` con
 * `tipoPedido = PICKUP` y **no generaba ningún `Delivery`**, así que su venta
 * no aparecía en la lista del PdV y hacía falta una pantalla paralela para
 * poder cobrarla. Un retiro comparte con un delivery todo lo que importa
 * —cliente, ítems, cocina, cobro, cancelación— y se diferencia sólo en las
 * tres cosas que dependen de que alguien lo lleve: dirección, costo de envío y
 * repartidor. Modelarlo como un modo del mismo registro es lo que permite que
 * haya un solo camino en toda la operación.
 *
 * Default `DELIVERY`: todo lo que ya existe es un reparto, así que la columna
 * no cambia el sentido de ningún registro viejo.
 *
 * Además, **backfill**: los pedidos PICKUP ya aceptados y sin cerrar se quedan
 * sin ningún lugar donde cobrarse en cuanto la pantalla paralela desaparece,
 * así que se les crea acá su `Delivery` en modo RETIRO y se lo vincula a la
 * venta que ya tenían.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class DeliveryModoRetiro1787677459724 implements MigrationInterface {
  name = 'DeliveryModoRetiro1787677459724';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    const t = await queryRunner.getTable('deliveries');
    if (!t) return;
    if (!t.columns.find((c) => c.name === 'modo')) {
      await queryRunner.query(
        `ALTER TABLE "deliveries" ADD COLUMN "modo" varchar NOT NULL DEFAULT 'DELIVERY'`,
      );
    }

    // ── Backfill de los retiros web en curso ────────────────────────────
    const pedidos = await queryRunner.getTable('pedidos_online');
    if (!pedidos) return;

    const enCurso: any[] = await queryRunner.query(`
      SELECT p.id, p.venta_id, p.nombre_cliente, p.telefono_cliente, p.notas, p.estado
      FROM "pedidos_online" p
      WHERE p.tipo_pedido = 'PICKUP'
        AND p.venta_id IS NOT NULL
        AND p.delivery_id IS NULL
        AND p.estado IN ('ACEPTADO', 'EN_PREPARACION', 'LISTO')
    `);

    // Placeholder por driver: Postgres numera ($1), SQLite usa `?`.
    const ph = (n: number) => (isPg ? `$${n}` : '?');
    const ahora = isPg ? 'now()' : `datetime('now')`;
    const falso = isPg ? 'false' : '0';

    for (const p of enCurso) {
      // El estado del delivery espeja el del pedido: LISTO en el pedido es
      // "pronto para que lo retiren", que del lado del reparto es PARA_ENTREGA.
      const estado = p.estado === 'LISTO' ? 'PARA_ENTREGA' : 'ABIERTO';

      await queryRunner.query(
        `INSERT INTO "deliveries"
           ("created_at", "updated_at", "nombre", "telefono", "observacion",
            "estado", "modo", "fecha_abierto", "cobro_anticipado")
         VALUES (${ahora}, ${ahora}, ${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)},
                 'RETIRO', ${ahora}, ${falso})`,
        [p.nombre_cliente ?? null, p.telefono_cliente ?? null, p.notas ?? null, estado],
      );

      // `RETURNING` no existe en SQLite viejo, así que se lee el último id.
      // Corre dentro de la transacción de la migración y en un arranque, sin
      // nadie más escribiendo: no hay carrera posible.
      const nuevo: any[] = await queryRunner.query(
        `SELECT id FROM "deliveries" ORDER BY id DESC LIMIT 1`,
      );
      const deliveryId = nuevo?.[0]?.id;
      if (!deliveryId) continue;

      await queryRunner.query(
        `UPDATE "ventas" SET "delivery_id" = ${ph(1)} WHERE "id" = ${ph(2)}`,
        [deliveryId, p.venta_id],
      );
      await queryRunner.query(
        `UPDATE "pedidos_online" SET "delivery_id" = ${ph(1)} WHERE "id" = ${ph(2)}`,
        [deliveryId, p.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sólo la columna: los `Delivery` creados por el backfill se dejan: son
    // ventas reales y borrarlos dejaría las ventas apuntando a la nada.
    try {
      await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "modo"`);
    } catch {
      // SQLite viejo no soporta DROP COLUMN.
    }
  }
}
