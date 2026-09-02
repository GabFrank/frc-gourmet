import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `pdv_config.permitir_pagos_terminal_ajena` y
 * `pdv_config.permitir_finalizar_terminal_ajena`.
 *
 * Una caja se abre en UNA terminal y cualquier otra puede unirse a ella para
 * lanzar ítems, pero el cobro estaba reservado a la terminal dueña sin
 * excepción posible. Estos dos flags convierten esa regla en una decisión del
 * local, y la parten en los dos actos que en la práctica se piden por separado:
 * registrar las formas de pago y cerrar la venta.
 *
 * Default `false` en las dos: es exactamente la conducta previa, así que
 * ninguna instalación cambia de comportamiento al actualizar.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class PdvConfigTerminalAjena1787842650376 implements MigrationInterface {
  name = 'PdvConfigTerminalAjena1787842650376';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // Postgres acepta el literal booleano; SQLite guarda 0/1.
    const falso = isPg ? 'false' : '0';

    const tabla = await queryRunner.getTable('pdv_config');
    if (!tabla) return;

    const columnas = [
      'permitir_pagos_terminal_ajena',
      'permitir_finalizar_terminal_ajena',
    ];
    for (const col of columnas) {
      if (tabla.columns.find((c) => c.name === col)) continue;
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ADD COLUMN "${col}" boolean NOT NULL DEFAULT ${falso}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['permitir_finalizar_terminal_ajena', 'permitir_pagos_terminal_ajena']) {
      try {
        await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "${col}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN.
      }
    }
  }
}
