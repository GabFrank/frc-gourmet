import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from '../productos/producto.entity';

@Entity('pdv_item_producto')
export class PdvItemProducto extends BaseModel {
  @Column({ nullable: true })
  nombre_alternativo?: string;

  @Column({ default: true })
  activo!: boolean;

  // Foreign keys
  @Column({ nullable: true })
  categoriaItemId?: number;

  @Column({ nullable: false })
  productoId!: number;

  // Relationships - use string reference to prevent circular dependencies
  @ManyToOne('PdvCategoriaItem', 'productos', { nullable: true })
  @JoinColumn({ name: 'categoriaItemId' })
  categoriaItem?: any;

  @ManyToOne(() => Producto, { nullable: false })
  @JoinColumn({ name: 'productoId' })
  producto!: Producto;
}

// Import after the class declaration to avoid circular dependencies
import { PdvCategoriaItem } from './pdv-categoria-item.entity'; 