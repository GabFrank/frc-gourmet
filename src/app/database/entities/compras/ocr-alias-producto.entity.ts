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

  /** Marca y contenido comprados (el producto es genérico: no se crea uno por marca). */
  @Column({ type: 'varchar', length: 120, nullable: true })
  marca?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contenido?: string | null;

  /** Código del ítem en el sistema del proveedor. Informativo, sin unique. */
  @Column({ name: 'codigo_proveedor', type: 'varchar', length: 60, nullable: true })
  codigoProveedor?: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
