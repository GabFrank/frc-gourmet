import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { ProductoBase } from '../core/producto-base.entity';
import type { ComboItem } from './combo-item.entity';

/**
 * Entity representing a product combo
 */
@Entity('combos')
export class Combo extends BaseModel {
  @Column({ name: 'producto_base_id' })
  productoBaseId!: number;

  @ManyToOne('ProductoBase', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_base_id' })
  productoBase!: ProductoBase;

  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  // Tipo de descuento del combo
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  porcentajeDescuento!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoDescuentoFijo!: number;

  // Validez del combo
  @Column({ type: 'datetime', nullable: true })
  fechaVigenciaInicio?: Date;

  @Column({ type: 'datetime', nullable: true })
  fechaVigenciaFin?: Date;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('ComboItem', 'combo', { onDelete: 'CASCADE' })
  items!: ComboItem[];

  // Campo calculado
  precioTotal?: number;
  costoTotal?: number;
} 