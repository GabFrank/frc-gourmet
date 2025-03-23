import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from './producto.entity';
import { Codigo } from './codigo.entity';
import { PrecioVenta } from './precio-venta.entity';

/**
 * Tipo de medida para la presentación de un producto
 */
export enum TipoMedida {
  UNIDAD = 'UNIDAD',
  PAQUETE = 'PAQUETE',
  GRAMO = 'GRAMO',
  LITRO = 'LITRO'
}

/**
 * Entity representing a product presentation
 */
@Entity('producto_presentaciones')
export class Presentacion extends BaseModel {
  @Column({ name: 'producto_id' })
  productoId!: number;

  @ManyToOne(() => Producto, producto => producto.presentaciones)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column()
  descripcion!: string;

  @Column({
    type: 'varchar',
    name: 'tipo_medida',
    enum: TipoMedida,
    default: TipoMedida.UNIDAD
  })
  tipoMedida!: TipoMedida;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  cantidad!: number;

  @Column({ default: false })
  principal!: boolean;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany(() => Codigo, codigo => codigo.presentacion)
  codigos!: Codigo[];

  @OneToMany(() => PrecioVenta, precioVenta => precioVenta.presentacion)
  preciosVenta!: PrecioVenta[];
} 