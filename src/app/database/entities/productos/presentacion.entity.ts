import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from './producto.entity';
import { CodigoBarra } from './codigo-barra.entity';
import { PrecioVenta } from './precio-venta.entity';

@Entity('presentacion')
export class Presentacion extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  cantidad!: number;

  @Column({ type: 'boolean', default: false, comment: 'Indica si esta es la presentación por defecto para el producto.' })
  principal!: boolean;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Imagen específica de la presentación (ej: botella vs litro). URL
  // `app://producto-images/<file>`. Si vacío, la UI cae al `producto.imageUrl`.
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url' })
  imageUrl?: string;

  // Relationships
  @ManyToOne(() => Producto, producto => producto.presentaciones)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @OneToMany(() => CodigoBarra, codigoBarra => codigoBarra.presentacion)
  codigosBarras?: CodigoBarra[];

  @OneToMany(() => PrecioVenta, precioVenta => precioVenta.presentacion)
  preciosVenta?: PrecioVenta[];

  // Virtual properties (not mapped to database)
  precioPrincipal?: number | null;
  codigoPrincipal?: string | null;
} 