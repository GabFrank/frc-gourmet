import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `printer_ticket_id` a `dispositivos` para que cada PdV pueda
 * tener asignada una impresora local específica para imprimir tickets de
 * venta y pre-cuentas.
 *
 * Cuando está seteada, el routing de `getPrinterByRol(TICKET_VENTA, deviceId)`
 * la prioriza sobre el fallback global (M2M sectores_impresoras + rol global
 * de impresora). Esto permite multi-caja real donde cada PdV imprime en su
 * propia impresora térmica.
 *
 * La FK no es estricta (sin CASCADE) — si se borra una impresora, el campo
 * queda como NULL via SET NULL implícito por TypeORM.
 */
export class AddPrinterTicketToDispositivo1779200000000 implements MigrationInterface {
  name = 'AddPrinterTicketToDispositivo1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "dispositivos" ADD COLUMN "printer_ticket_id" integer NULL`);
    } catch (e: any) {
      // Idempotente: si la columna ya existe (DB con drift de synchronize), ignorar.
      if (!/duplicate column|already exists/i.test(e?.message || '')) throw e;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "dispositivos" DROP COLUMN IF EXISTS "printer_ticket_id"`);
    } else {
      try {
        await queryRunner.query(`ALTER TABLE "dispositivos" DROP COLUMN "printer_ticket_id"`);
      } catch { /* SQLite viejo */ }
    }
  }
}
