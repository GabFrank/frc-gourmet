import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColumnsToConteo1624098765432 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if columns already exist before adding them
        const conteoTable = await queryRunner.getTable("conteos");

        if (!conteoTable?.findColumnByName("tipo")) {
            await queryRunner.query(`ALTER TABLE conteos ADD COLUMN tipo VARCHAR(255) NULL`);
        }

        if (!conteoTable?.findColumnByName("fecha")) {
            await queryRunner.query(`ALTER TABLE conteos ADD COLUMN fecha DATETIME NULL`);
        }

        if (!conteoTable?.findColumnByName("observaciones")) {
            await queryRunner.query(`ALTER TABLE conteos ADD COLUMN observaciones TEXT NULL`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE conteos DROP COLUMN tipo`);
        await queryRunner.query(`ALTER TABLE conteos DROP COLUMN fecha`);
        await queryRunner.query(`ALTER TABLE conteos DROP COLUMN observaciones`);
    }
}
