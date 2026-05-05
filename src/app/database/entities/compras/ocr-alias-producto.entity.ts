import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Proveedor } from './proveedor.entity';

@Entity('ocr_aliases_producto')
@Unique('uq_ocr_alias_producto', ['proveedor', 'textoOcr', 'producto'])
@Index(['proveedor', 'textoOcr'])
export class OcrAliasProducto extends BaseModel {
  @Column({ name: 'texto_ocr', type: 'varchar', length: 500 })
  textoOcr!: string;

  @ManyToOne('Proveedor', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor!: Proveedor;

  @ManyToOne('Producto', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'producto_id' })
  producto!: any;

  @ManyToOne('Presentacion', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion?: any;

  @Column({ name: 'veces_usado', type: 'int', default: 1 })
  vecesUsado!: number;
}
