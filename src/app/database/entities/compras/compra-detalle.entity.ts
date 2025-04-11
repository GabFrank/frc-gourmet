import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Ingrediente } from '../productos/ingrediente.entity';
import { Presentacion } from '../productos/presentacion.entity';
import { Producto } from '../productos/producto.entity';
// Import type reference to avoid circular dependency
import type { Compra } from './compra.entity';

/**
 * Entity representing purchase details
 */
@Entity('compras_detalles')
export class CompraDetalle extends BaseModel {
  @Column('decimal', { precision: 10, scale: 2 })
  cantidad!: number;

  @Column('decimal', { precision: 10, scale: 2 })
  valor!: number;

  @Column({ default: true })
  activo!: boolean;

  // Relationships - Use string reference to avoid circular dependency
  @ManyToOne('Compra', 'detalles', {
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'compra_id' })
  compra!: Compra;

  @ManyToOne(() => Producto, { nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @ManyToOne(() => Ingrediente, { nullable: true })
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente?: Ingrediente;

  @ManyToOne(() => Presentacion, { nullable: true })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion?: Presentacion;
}
