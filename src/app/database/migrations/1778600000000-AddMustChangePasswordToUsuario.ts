import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-3: agrega `must_change_password` a `usuarios` para poder forzar
 * cambio de password en primer login. El seed marca el admin default
 * (admin/admin) con esta flag en true y el frontend bloquea el ingreso
 * al dashboard hasta que se cambie. Default false para usuarios
 * existentes (no afecta a quien ya tiene su password personalizada).
 */
export class AddMustChangePasswordToUsuario1778600000000 implements MigrationInterface {
  name = 'AddMustChangePasswordToUsuario1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "usuarios" ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT false`
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE "usuarios" ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT 0`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "must_change_password"`);
    } else {
      // SQLite >= 3.35 soporta DROP COLUMN; fallback a tabla nueva si falla.
      try {
        await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "must_change_password"`);
      } catch {
        // No-op: en SQLite viejo dejamos la columna; reset DB es la salida.
      }
    }
  }
}
