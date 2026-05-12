import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `onboarding_task_overrides` para el sistema de onboarding
 * tasks en el dashboard principal. Driver-aware: usa tipos `datetime` para
 * SQLite y `TIMESTAMP` para Postgres. FK a usuarios queda explícita en
 * Postgres (ADD CONSTRAINT) y lógica en SQLite (sin constraint inline,
 * para evitar recrear la tabla).
 */
export class AddOnboardingTaskOverrides1778400000000 implements MigrationInterface {
  name = 'AddOnboardingTaskOverrides1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE "onboarding_task_overrides" (
          "id" SERIAL PRIMARY KEY,
          "task_key" varchar(60) NOT NULL,
          "estado" varchar(20) NOT NULL,
          "usuario_id" integer NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`
        ALTER TABLE "onboarding_task_overrides"
        ADD CONSTRAINT "FK_onboarding_task_overrides_usuario_id"
        FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
      `);
      // Unique compuesto (task_key, usuario_id). Postgres trata NULLs como
      // distintos por default — exactamente lo que queremos (un override
      // global con usuario_id=NULL no choca con otro per-user).
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_onboarding_task_overrides_task_user"
        ON "onboarding_task_overrides" ("task_key", "usuario_id")
      `);
    } else {
      // SQLite
      await queryRunner.query(`
        CREATE TABLE "onboarding_task_overrides" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "task_key" varchar(60) NOT NULL,
          "estado" varchar(20) NOT NULL,
          "usuario_id" integer NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      // SQLite trata NULLs como distintos en UNIQUE — funciona igual que Postgres.
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_onboarding_task_overrides_task_user"
        ON "onboarding_task_overrides" ("task_key", "usuario_id")
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_onboarding_task_overrides_task_user"`);
      await queryRunner.query(`ALTER TABLE "onboarding_task_overrides" DROP CONSTRAINT IF EXISTS "FK_onboarding_task_overrides_usuario_id"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_task_overrides"`);
    } else {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_onboarding_task_overrides_task_user"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "onboarding_task_overrides"`);
    }
  }
}
