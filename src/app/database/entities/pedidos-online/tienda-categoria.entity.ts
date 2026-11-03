import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Categoría de la tienda online armada a mano («Entradas», «Promos», «Pizzas»…), con su
 * orden y los productos que muestra. Es solo de la vitrina: no cambia familias ni
 * subfamilias. Si no hay ninguna activa, la carta se agrupa por familia como antes.
 */
@Entity('tienda_categorias')
export class TiendaCategoria extends BaseModel {
  @Column({ type: 'varchar', length: 80 })
  nombre!: string;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @OneToMany('TiendaCategoriaProducto', 'categoria')
  productos?: any[];
}

/** Un producto dentro de una categoría de la tienda, con su orden. Un producto puede estar en varias. */
@Entity('tienda_categoria_productos')
@Index('UQ_tienda_categoria_producto', ['categoria', 'producto'], { unique: true })
export class TiendaCategoriaProducto extends BaseModel {
  @ManyToOne('TiendaCategoria', 'productos', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoria_id' })
  categoria!: any;

  @ManyToOne('Producto', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: any;

  @Column({ type: 'int', default: 0 })
  orden!: number;
}
