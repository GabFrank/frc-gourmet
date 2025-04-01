import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddRecetaToPresentacionSabor1634567890123 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add receta_id column to producto_presentaciones_sabores table
    await queryRunner.addColumn(
      'producto_presentaciones_sabores',
      new TableColumn({
        name: 'receta_id',
        type: 'int',
        isNullable: true
      })
    );

    // Add foreign key from producto_presentaciones_sabores to producto_recetas
    await queryRunner.createForeignKey(
      'producto_presentaciones_sabores',
      new TableForeignKey({
        columnNames: ['receta_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'producto_recetas',
        onDelete: 'SET NULL'
      })
    );

    // Move existing receta_id values from producto_sabores to the appropriate records in producto_presentaciones_sabores
    await queryRunner.query(`
      UPDATE producto_presentaciones_sabores ps
      JOIN producto_sabores s ON ps.sabor_id = s.id
      SET ps.receta_id = s.receta_id
      WHERE s.receta_id IS NOT NULL
    `);

    // Remove receta_id column from producto_sabores table
    await queryRunner.dropColumn('producto_sabores', 'receta_id');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add receta_id column back to producto_sabores table
    await queryRunner.addColumn(
      'producto_sabores',
      new TableColumn({
        name: 'receta_id',
        type: 'int',
        isNullable: true
      })
    );

    // Add foreign key back to producto_sabores
    await queryRunner.createForeignKey(
      'producto_sabores',
      new TableForeignKey({
        columnNames: ['receta_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'producto_recetas',
        onDelete: 'SET NULL'
      })
    );

    // Move receta_id values back from producto_presentaciones_sabores to producto_sabores
    // Note: This might lose data if multiple presentaciones have different recipes for the same sabor
    await queryRunner.query(`
      UPDATE producto_sabores s
      JOIN producto_presentaciones_sabores ps ON s.id = ps.sabor_id
      SET s.receta_id = ps.receta_id
      WHERE ps.receta_id IS NOT NULL
      GROUP BY s.id
    `);

    // Drop receta_id column from producto_presentaciones_sabores
    await queryRunner.dropColumn('producto_presentaciones_sabores', 'receta_id');
  }
}
