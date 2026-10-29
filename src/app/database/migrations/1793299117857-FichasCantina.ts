import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fichas de cantina para la venta directa (cantina de eventos).
 *
 * - `pdv_config`: `fichas_habilitadas`, `fichas_modo`, `fichas_mostrar_precio`,
 *   `fichas_nombre_evento`.
 * - `producto.ficha_modo` (null = hereda el global).
 * - `ventas`: `fichas_emitidas_at` (claim idempotente de la emisión),
 *   `fichas_cantidad`, `fichas_reimpresiones`.
 *
 * ESTRICTAMENTE ADITIVO. `fichas_habilitadas` nace en `false`, así que ninguna
 * instalación cambia de comportamiento al actualizar.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class FichasCantina1793299117857 implements MigrationInterface {
  name = 'FichasCantina1793299117857';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // Postgres acepta el literal booleano; SQLite guarda 0/1.
    const falso = isPg ? 'false' : '0';
    const ts = isPg ? 'timestamp' : 'datetime';

    const columnas: { tabla: string; col: string; ddl: string }[] = [
      { tabla: 'pdv_config', col: 'fichas_habilitadas', ddl: `boolean NOT NULL DEFAULT ${falso}` },
      { tabla: 'pdv_config', col: 'fichas_modo', ddl: `varchar(20) NOT NULL DEFAULT 'POR_UNIDAD'` },
      { tabla: 'pdv_config', col: 'fichas_mostrar_precio', ddl: `boolean NOT NULL DEFAULT ${falso}` },
      { tabla: 'pdv_config', col: 'fichas_nombre_evento', ddl: `varchar(120) NULL` },
      { tabla: 'producto', col: 'ficha_modo', ddl: `varchar(20) NULL` },
      { tabla: 'ventas', col: 'fichas_emitidas_at', ddl: `${ts} NULL` },
      { tabla: 'ventas', col: 'fichas_cantidad', ddl: `integer NOT NULL DEFAULT 0` },
      { tabla: 'ventas', col: 'fichas_reimpresiones', ddl: `integer NOT NULL DEFAULT 0` },
    ];

    for (const { tabla, col, ddl } of columnas) {
      if (await hasColumn(queryRunner, tabla, col)) continue;
      await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${ddl}`);
    }

    if (isPg) {
      await queryRunner.query(
        `COMMENT ON COLUMN "producto"."ficha_modo" IS 'POR_UNIDAD | POR_ITEM | NO_IMPRIME. null = usar el global de PdvConfig.'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columnas: [string, string][] = [
      ['ventas', 'fichas_reimpresiones'],
      ['ventas', 'fichas_cantidad'],
      ['ventas', 'fichas_emitidas_at'],
      ['producto', 'ficha_modo'],
      ['pdv_config', 'fichas_nombre_evento'],
      ['pdv_config', 'fichas_mostrar_precio'],
      ['pdv_config', 'fichas_modo'],
      ['pdv_config', 'fichas_habilitadas'],
    ];
    for (const [tabla, col] of columnas) {
      try {
        await queryRunner.query(`ALTER TABLE "${tabla}" DROP COLUMN "${col}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN.
      }
    }
  }
}

async function hasColumn(queryRunner: QueryRunner, tabla: string, col: string): Promise<boolean> {
  const t = await queryRunner.getTable(tabla);
  return !!t?.columns.find((c) => c.name === col);
}
