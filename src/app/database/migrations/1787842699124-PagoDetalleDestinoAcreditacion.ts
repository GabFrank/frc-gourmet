import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `pagos_detalles.maquina_pos_id` y `pagos_detalles.cuenta_bancaria_id`.
 *
 * Al finalizar un cobro se crea una `AcreditacionPos` por cada línea pagada con
 * máquina POS y se acredita la cuenta bancaria de cada transferencia. Ese
 * vínculo línea→destino vivía **sólo en memoria** del diálogo de cobro (en el
 * `DetalleRow` del componente): no había columna donde guardarlo.
 *
 * Consecuencia, ya presente antes de este cambio: si el diálogo se cerraba y se
 * volvía a abrir, `loadExistingPago` reconstruía las filas desde la base y el
 * destino se perdía. Al finalizar, el filtro `d.maquinaPosId` no encontraba
 * nada y la acreditación no se creaba — sin error visible, porque ese bloque
 * corre en un try/catch no bloqueante.
 *
 * Con el cobro repartido entre terminales (una registra los pagos, otra
 * finaliza) la recarga deja de ser un caso raro y pasa a ser el camino normal,
 * así que el vínculo tiene que sobrevivir en la base.
 *
 * Nullable y sin FK declarada, igual que `cobro_parcial_id`: la mayoría de las
 * líneas (efectivo) no tiene destino de acreditación, y las líneas históricas
 * quedan en null sin cambiar de significado.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class PagoDetalleDestinoAcreditacion1787842699124 implements MigrationInterface {
  name = 'PagoDetalleDestinoAcreditacion1787842699124';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tabla = await queryRunner.getTable('pagos_detalles');
    if (!tabla) return;

    for (const col of ['maquina_pos_id', 'cuenta_bancaria_id']) {
      if (tabla.columns.find((c) => c.name === col)) continue;
      await queryRunner.query(
        `ALTER TABLE "pagos_detalles" ADD COLUMN "${col}" integer`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['cuenta_bancaria_id', 'maquina_pos_id']) {
      try {
        await queryRunner.query(`ALTER TABLE "pagos_detalles" DROP COLUMN "${col}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN.
      }
    }
  }
}
