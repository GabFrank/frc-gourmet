import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRefreshTokens1778353819592 implements MigrationInterface {
    name = 'AddRefreshTokens1778353819592'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "created_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')), "token_hash" varchar NOT NULL, "issued_at" datetime NOT NULL, "expires_at" datetime NOT NULL, "revoked_at" datetime, "ip" varchar, "user_agent" varchar, "created_by" integer, "updated_by" integer, "usuario_id" integer NOT NULL, CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"), CONSTRAINT "FK_refresh_tokens_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE)`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_usuario_id" ON "refresh_tokens" ("usuario_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_usuario_id"`);
        await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_token_hash"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    }
}
