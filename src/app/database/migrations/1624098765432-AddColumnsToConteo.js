"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddColumnsToConteo1624098765432 = void 0;
class AddColumnsToConteo1624098765432 {
    async up(queryRunner) {
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
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE conteos DROP COLUMN tipo`);
        await queryRunner.query(`ALTER TABLE conteos DROP COLUMN fecha`);
        await queryRunner.query(`ALTER TABLE conteos DROP COLUMN observaciones`);
    }
}
exports.AddColumnsToConteo1624098765432 = AddColumnsToConteo1624098765432;
//# sourceMappingURL=1624098765432-AddColumnsToConteo.js.map