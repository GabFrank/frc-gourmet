import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
// Import only the type to avoid circular dependency
import type { Producto } from './producto.entity';
import type { Codigo } from './codigo.entity';
import type { PrecioVenta } from './precio-venta.entity';
import type { PresentacionSabor } from './presentacion-sabor.entity';
import type { ComboItem } from './combo-item.entity';
import { ProductoAdicional } from './producto-adicional.entity';

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
 * Método de cálculo de precios para presentaciones con sabores
 */
export enum MetodoCalculo {
  PROMEDIO = 'PROMEDIO',
  MAYOR_PRECIO = 'MAYOR_PRECIO',
  MENOR_PRECIO = 'MENOR_PRECIO',
  FIJO = 'FIJO'
}

/**
 * Entity representing a product presentation
 */
@Entity('producto_presentaciones')
export class Presentacion extends BaseModel {
  @Column({ name: 'producto_id' })
  productoId!: number;

  // add onDelete: 'CASCADE'
  @ManyToOne('Producto', 'presentaciones', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ nullable: true })
  descripcion?: string;

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

  @Column({ name: 'is_sabores', default: false })
  isSabores!: boolean;

  @Column({
    type: 'varchar',
    name: 'metodo_calculo',
    enum: MetodoCalculo,
    default: MetodoCalculo.PROMEDIO,
    nullable: true
  })
  metodoCalculo?: MetodoCalculo;

  @OneToMany('Codigo', 'presentacion')
  codigos!: Codigo[];

  @OneToMany('PrecioVenta', 'presentacion')
  preciosVenta!: PrecioVenta[];

  @OneToMany('PresentacionSabor', 'presentacion')
  presentacionesSabores!: PresentacionSabor[];

  @OneToMany('ComboItem', 'presentacion')
  comboItems!: ComboItem[];

  @OneToMany('ProductoAdicional', 'presentacion')
  productosAdicionales!: ProductoAdicional[];
}
