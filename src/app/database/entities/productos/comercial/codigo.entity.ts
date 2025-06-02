import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Presentacion } from './presentacion.entity';

/**
 * Tipo de código para la presentación de un producto
 */
export enum TipoCodigo {
  BARRA = 'BARRA',
  QR = 'QR',
  MANUAL = 'MANUAL'
}

/**
 * Entity representing a product code
 */
@Entity('producto_codigos')
export class Codigo extends BaseModel {
  @Column({ name: 'presentacion_id' })
  presentacionId!: number;

  @ManyToOne('Presentacion', 'codigos', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion!: Presentacion;

  @Column()
  codigo!: string;

  @Column({
    type: 'varchar',
    name: 'tipo_codigo',
    enum: TipoCodigo,
    default: TipoCodigo.MANUAL
  })
  tipoCodigo!: TipoCodigo;

  @Column({ default: false })
  principal!: boolean;

  @Column({ default: true })
  activo!: boolean;
} 