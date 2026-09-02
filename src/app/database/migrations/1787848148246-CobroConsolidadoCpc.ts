import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cobro consolidado de cuentas por cobrar (concepto COBRO_CLIENTE) con descuento.
 *
 * El motor de pago consolidado pasa a cubrir tambien eventos de INGRESO. Nada de
 * eso necesita esquema nuevo: el concepto y el tipo de origen son varchar, y la
 * linea de descuento reusa `pagos_consolidados_detalles` dejando en null las
 * columnas de caja/cuenta/movimiento, que ya son nullable.
 *
 * Lo que si hace falta:
 *
 * - `pagos_consolidados.monto_descuento` / `motivo_descuento`: cuanto se condono en
 *   el evento y por que. Derivable de los detalles, pero se guarda para que un
 *   listado separe cobrado de perdonado sin join.
 * - `movimientos_cliente.pago_consolidado_id`: un cobro con descuento deja DOS
 *   movimientos de cuenta corriente por cuota (PAGO + AJUSTE_NEGATIVO). Sin esta
 *   columna la anulacion tendria que adivinar cuales revertir.
 * - `caja_mayor_configuraciones.descuento_cpc_max_porcentaje`: tope del descuento.
 *   NULL = sin tope.
 *
 * Aditiva y driver-aware. `ADD COLUMN ... IF NOT EXISTS` es invalido en SQLite,
 * asi que se consulta el esquema antes de cada ALTER.
 *
 * Ver docs/MIGRATIONS.md y .claude/skills/frc-gourmet-expert/domains/financiero-cpp-cpc.md.
 */
export class CobroConsolidadoCpc1787848148246 implements MigrationInterface {
  name = 'CobroConsolidadoCpc1787848148246';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const decimal18 = isPg ? 'NUMERIC(18,2)' : 'decimal(18,2)';
    const decimal5 = isPg ? 'NUMERIC(5,2)' : 'decimal(5,2)';
    const varchar255 = isPg ? 'VARCHAR(255)' : 'varchar(255)';
    const int = isPg ? 'INTEGER' : 'integer';

    const addColumn = async (tabla: string, columna: string, tipoYExtras: string) => {
      const t = await queryRunner.getTable(tabla);
      if (!t) return;
      if (t.columns.find((c) => c.name === columna)) return;
      await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${columna}" ${tipoYExtras}`);
    };

    await addColumn('pagos_consolidados', 'monto_descuento', `${decimal18} NOT NULL DEFAULT 0`);
    await addColumn('pagos_consolidados', 'motivo_descuento', varchar255);
    await addColumn('movimientos_cliente', 'pago_consolidado_id', int);
    await addColumn('caja_mayor_configuraciones', 'descuento_cpc_max_porcentaje', decimal5);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drop = async (tabla: string, columna: string) => {
      try {
        await queryRunner.query(`ALTER TABLE "${tabla}" DROP COLUMN "${columna}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN.
      }
    };
    await drop('caja_mayor_configuraciones', 'descuento_cpc_max_porcentaje');
    await drop('movimientos_cliente', 'pago_consolidado_id');
    await drop('pagos_consolidados', 'motivo_descuento');
    await drop('pagos_consolidados', 'monto_descuento');
  }
}
