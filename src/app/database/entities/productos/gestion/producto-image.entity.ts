import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
// Import only the type to avoid circular dependency
import type { Producto } from './producto.entity';

/**
 * Entity representing a product image
 */
@Entity('producto_images')
export class ProductoImage extends BaseModel {
  @Column()
  imageUrl!: string;

  @Column({ default: false })
  isMain!: boolean;

  @Column({ name: 'orden', default: 0 })
  orden!: number;

  @Column({ name: 'producto_id' })
  productoId!: number;

  @ManyToOne('Producto', 'images', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;
}