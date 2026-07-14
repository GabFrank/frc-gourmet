import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notificaciones (Email + WhatsApp) + recuperacion de contrasenha.
 *
 * Crea las tablas del modulo de notificaciones:
 *  - configuraciones_notificacion (key/value: SMTP, Evolution, switch global)
 *  - eventos_notificacion        (catalogo de eventos on/off por funcion)
 *  - receptores_notificacion     (personas / emails / numeros / grupos)
 *  - suscripciones_notificacion  (ruteo evento <-> receptor por canal)
 *  - logs_notificacion           (auditoria + dedupe)
 *  - password_reset_tokens       (codigos de recuperacion, solo hash)
 *
 * Portable SQLite/Postgres. Timestamp = epoch-millis real (precision de ms)
 * para evitar colision con migraciones de otras ramas no mergeadas.
 */
export class AddNotificaciones1782606189440 implements MigrationInterface {
  name = 'AddNotificaciones1782606189440';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    if (isPg) {
      const id = `"id" SERIAL PRIMARY KEY`;
      const audit = `
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" integer NULL,
        "updated_by" integer NULL`;

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "configuraciones_notificacion" (
          ${id},
          "clave" varchar NOT NULL,
          "valor" varchar NULL,
          "tipo" varchar NOT NULL DEFAULT 'STRING',
          "descripcion" varchar NULL,
          "activo" boolean NOT NULL DEFAULT true,
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "eventos_notificacion" (
          ${id},
          "codigo" varchar NOT NULL,
          "nombre" varchar NOT NULL,
          "descripcion" varchar NULL,
          "canal" varchar NOT NULL DEFAULT 'AMBOS',
          "activo" boolean NOT NULL DEFAULT true,
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receptores_notificacion" (
          ${id},
          "tipo" varchar NOT NULL DEFAULT 'EMAIL',
          "nombre" varchar NOT NULL,
          "valor" varchar NULL,
          "persona_id" integer NULL,
          "activo" boolean NOT NULL DEFAULT true,
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "suscripciones_notificacion" (
          ${id},
          "evento_id" integer NULL,
          "receptor_id" integer NULL,
          "canal" varchar NOT NULL DEFAULT 'WHATSAPP',
          "activo" boolean NOT NULL DEFAULT true,
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "logs_notificacion" (
          ${id},
          "evento_codigo" varchar NOT NULL,
          "canal" varchar NOT NULL,
          "destino" varchar NULL,
          "destinoNombre" varchar NULL,
          "estado" varchar NOT NULL,
          "asunto" varchar NULL,
          "mensaje" text NULL,
          "error" text NULL,
          "proveedor_message_id" varchar NULL,
          "fecha_envio" TIMESTAMP NOT NULL,
          "clave_dedupe" varchar NULL,
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
          ${id},
          "usuario_id" integer NULL,
          "token_hash" varchar NOT NULL,
          "canal" varchar NOT NULL,
          "destino" varchar NULL,
          "expira_en" TIMESTAMP NOT NULL,
          "intentos" integer NOT NULL DEFAULT 0,
          "usado" boolean NOT NULL DEFAULT false,
          "activo" boolean NOT NULL DEFAULT true,
          ${audit}
        )`);
    } else {
      const id = `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL`;
      const audit = `
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        "created_by" integer,
        "updated_by" integer`;

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "configuraciones_notificacion" (
          ${id},
          "clave" varchar NOT NULL,
          "valor" varchar,
          "tipo" varchar NOT NULL DEFAULT ('STRING'),
          "descripcion" varchar,
          "activo" boolean NOT NULL DEFAULT (1),
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "eventos_notificacion" (
          ${id},
          "codigo" varchar NOT NULL,
          "nombre" varchar NOT NULL,
          "descripcion" varchar,
          "canal" varchar NOT NULL DEFAULT ('AMBOS'),
          "activo" boolean NOT NULL DEFAULT (1),
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receptores_notificacion" (
          ${id},
          "tipo" varchar NOT NULL DEFAULT ('EMAIL'),
          "nombre" varchar NOT NULL,
          "valor" varchar,
          "persona_id" integer,
          "activo" boolean NOT NULL DEFAULT (1),
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "suscripciones_notificacion" (
          ${id},
          "evento_id" integer,
          "receptor_id" integer,
          "canal" varchar NOT NULL DEFAULT ('WHATSAPP'),
          "activo" boolean NOT NULL DEFAULT (1),
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "logs_notificacion" (
          ${id},
          "evento_codigo" varchar NOT NULL,
          "canal" varchar NOT NULL,
          "destino" varchar,
          "destinoNombre" varchar,
          "estado" varchar NOT NULL,
          "asunto" varchar,
          "mensaje" text,
          "error" text,
          "proveedor_message_id" varchar,
          "fecha_envio" datetime NOT NULL,
          "clave_dedupe" varchar,
          ${audit}
        )`);
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
          ${id},
          "usuario_id" integer,
          "token_hash" varchar NOT NULL,
          "canal" varchar NOT NULL,
          "destino" varchar,
          "expira_en" datetime NOT NULL,
          "intentos" integer NOT NULL DEFAULT (0),
          "usado" boolean NOT NULL DEFAULT (0),
          "activo" boolean NOT NULL DEFAULT (1),
          ${audit}
        )`);
    }

    // Indices (portables a ambos drivers)
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notif_config_clave" ON "configuraciones_notificacion" ("clave")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notif_evento_codigo" ON "eventos_notificacion" ("codigo")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notif_susc_evento_receptor_canal" ON "suscripciones_notificacion" ("evento_id", "receptor_id", "canal")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notif_log_clave_dedupe" ON "logs_notificacion" ("clave_dedupe")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notif_reset_activo" ON "password_reset_tokens" ("activo")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notif_reset_activo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notif_log_clave_dedupe"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notif_susc_evento_receptor_canal"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notif_evento_codigo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notif_config_clave"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "logs_notificacion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suscripciones_notificacion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "receptores_notificacion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "eventos_notificacion"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "configuraciones_notificacion"`);
  }
}
