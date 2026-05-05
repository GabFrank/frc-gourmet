import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Proveedor } from './proveedor.entity';

@Entity('ocr_aliases_proveedor')
@Unique('uq_ocr_alias_proveedor', ['textoOcr', 'proveedor'])
@Index(['rucOcr'])
export class OcrAliasProveedor extends BaseModel {
  @Column({ name: 'texto_ocr', type: 'varchar', length: 500 })
  textoOcr!: string;

  @Column({ name: 'ruc_ocr', type: 'varchar', length: 50, nullable: true })
  rucOcr?: string;

  @ManyToOne('Proveedor', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor!: Proveedor;

  @Column({ name: 'veces_usado', type: 'int', default: 1 })
  vecesUsado!: number;
}
