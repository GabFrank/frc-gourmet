import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cierre de los huecos del módulo de delivery antes de su primer uso real.
 *
 * Agrega tres cosas, todas aditivas:
 *
 * 1. `ventas.costo_delivery` — el costo del envío CONGELADO. Hasta ahora el
 *    único lugar donde vivía era `delivery.precio_delivery_id`, que el diálogo
 *    de cobro no leía: el envío no se cobraba nunca. Se persiste el monto (y no
 *    sólo la FK) porque el precio de una zona cambia con el tiempo y el ticket
 *    de una venta vieja tiene que seguir mostrando lo que se cobró.
 *
 * 2. `deliveries.entregado_por_funcionario_id` — el repartidor es un
 *    `Funcionario`, no un `Usuario`: rara vez tiene usuario del sistema, y así
 *    queda enganchado a comisiones/liquidaciones. La columna vieja
 *    `entregado_por` NO se dropea (regla de migraciones aditivas); nunca llegó
 *    a escribirse porque el botón ENVIAR tenía un TODO, así que no hay datos
 *    que portar.
 *
 * 3. Las once columnas de configuración de delivery en `pdv_config`, que hasta
 *    ahora eran constantes en el código del componente.
 *
 * Ver docs/DIAGNOSTICO-DELIVERY.md y docs/MIGRATIONS.md.
 */
export class DeliveryCostoRepartidorYConfig1787564255118 implements MigrationInterface {
  name = 'DeliveryCostoRepartidorYConfig1787564255118';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const int = isPg ? 'INTEGER' : 'integer';
    const bool = isPg ? 'BOOLEAN' : 'boolean';
    const decimal = isPg ? 'NUMERIC(18,2)' : 'decimal(18,2)';
    // SQLite no acepta `IF NOT EXISTS` en ADD COLUMN: se consulta el esquema.
    const addColumn = async (tabla: string, columna: string, definicion: string) => {
      const t = await queryRunner.getTable(tabla);
      if (!t) return;
      if (t.columns.find((c) => c.name === columna)) return;
      await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${columna}" ${definicion}`);
    };

    // 1 · Costo del envío congelado en la venta.
    await addColumn('ventas', 'costo_delivery', `${decimal} NULL`);

    // 2 · Repartidor (Funcionario). Sin FK declarada: el resto de las columnas
    // de relación de este esquema tampoco la declaran en SQLite, y agregarla
    // sólo en Postgres divergiría los dos baselines.
    await addColumn('deliveries', 'entregado_por_funcionario_id', `${int} NULL`);

    // 3 · Configuración de delivery del PdV.
    const cfg: Array<[string, string]> = [
      ['delivery_habilitado', `${bool} NOT NULL DEFAULT true`],
      ['delivery_precio_default_id', `${int} NULL`],
      ['delivery_cobro_anticipado_default', `${bool} NOT NULL DEFAULT false`],
      ['delivery_requiere_direccion', `${bool} NOT NULL DEFAULT true`],
      ['delivery_requiere_repartidor', `${bool} NOT NULL DEFAULT true`],
      ['delivery_telefono_min_digitos', `${int} NOT NULL DEFAULT 4`],
      ['delivery_page_size', `${int} NOT NULL DEFAULT 20`],
      ['delivery_mostrar_pendientes_otras_cajas', `${bool} NOT NULL DEFAULT true`],
      ['delivery_auto_imprimir_al_crear', `${bool} NOT NULL DEFAULT false`],
      ['delivery_auto_imprimir_al_enviar', `${bool} NOT NULL DEFAULT false`],
    ];
    for (const [columna, definicion] of cfg) {
      await addColumn('pdv_config', columna, definicion);
    }

    // Índice para la consulta nueva de la lista: los pendientes de CUALQUIER
    // caja se filtran por estado, no por caja.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_deliveries_estado" ON "deliveries" ("estado")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const drop = async (tabla: string, columna: string) => {
      try {
        await queryRunner.query(`ALTER TABLE "${tabla}" DROP COLUMN "${columna}"`);
      } catch {
        /* SQLite viejo no soporta DROP COLUMN; la columna sobrante es inofensiva. */
      }
    };

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_deliveries_estado"`);
    for (const columna of [
      'delivery_auto_imprimir_al_enviar',
      'delivery_auto_imprimir_al_crear',
      'delivery_mostrar_pendientes_otras_cajas',
      'delivery_page_size',
      'delivery_telefono_min_digitos',
      'delivery_requiere_repartidor',
      'delivery_requiere_direccion',
      'delivery_cobro_anticipado_default',
      'delivery_precio_default_id',
      'delivery_habilitado',
    ]) {
      await drop('pdv_config', columna);
    }
    await drop('deliveries', 'entregado_por_funcionario_id');
    await drop('ventas', 'costo_delivery');
  }
}
