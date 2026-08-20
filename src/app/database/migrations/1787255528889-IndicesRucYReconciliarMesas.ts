import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dos cosas sin relación entre sí, juntas porque van en el mismo PR:
 *
 * 1. Índices de búsqueda por RUC. Al facturar ahora se busca el cliente por RUC,
 *    y el RUC puede vivir en `clientes.ruc` o en `personas.documento` (el
 *    buscador de clientes ya mira los dos). No hay ningún índice sobre esas
 *    columnas.
 *
 *    **No son UNIQUE a propósito.** Las migraciones corren al arrancar la app: si
 *    alguna instalación ya tiene RUCs repetidos, un UNIQUE fallaría y dejaría la
 *    app sin arrancar. Unificar duplicados y recién después endurecer el índice
 *    queda en el backlog.
 *
 * 2. Reconciliación de mesas colgadas en OCUPADO. Hasta esta versión, marcar y
 *    liberar mesas pasaba por un handler que exigía VENTAS_PDV_CONFIGURAR, un
 *    permiso que sólo tiene GERENTE: a un mozo o cajero le fallaba en silencio y
 *    la mesa quedaba trabada. El fix corrige el flujo de acá en adelante, pero una
 *    mesa ya trabada seguiría trabada para siempre — de hecho existía un UPDATE
 *    manual documentado para esto en la skill.
 *
 *    Se libera toda mesa OCUPADO que no tenga ni venta ABIERTA ni comanda OCUPADO
 *    vinculada. Es el mismo criterio que usa `cerrarComanda`. Idempotente: si no
 *    hay nada colgado, no toca una fila.
 */
export class IndicesRucYReconciliarMesas1787255528889 implements MigrationInterface {
  name = 'IndicesRucYReconciliarMesas1787255528889';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `CREATE INDEX IF NOT EXISTS` es válido en SQLite y en Postgres >= 9.5.
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_clientes_ruc" ON "clientes" ("ruc")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_personas_documento" ON "personas" ("documento")`);

    // Reconciliación. `comandas.pdv_mesa_id` y `ventas.mesa_id` son las columnas
    // reales de las FK (verificado contra el esquema).
    await queryRunner.query(`
      UPDATE "pdv_mesas"
      SET "estado" = 'DISPONIBLE'
      WHERE "estado" = 'OCUPADO'
        AND "id" NOT IN (
          SELECT "mesa_id" FROM "ventas"
          WHERE "estado" = 'ABIERTA' AND "mesa_id" IS NOT NULL
        )
        AND "id" NOT IN (
          SELECT "pdv_mesa_id" FROM "comandas"
          WHERE "estado" = 'OCUPADO' AND "pdv_mesa_id" IS NOT NULL
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // La reconciliación no se revierte: volver a colgar mesas que ya se liberaron
    // no le sirve a nadie.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_personas_documento"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clientes_ruc"`);
  }
}
