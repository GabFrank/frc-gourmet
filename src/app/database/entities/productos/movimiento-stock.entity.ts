import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Producto } from './producto.entity';
import type { Ingrediente } from './ingrediente.entity';

/**
 * Tipos de referencia para movimientos de stock
 */
export enum TipoReferencia {
  VENTA = 'VENTA',
  COMPRA = 'COMPRA',
  AJUSTE = 'AJUSTE',
  TRANSFERENCIA = 'TRANSFERENCIA',
  DESCARTE = 'DESCARTE'
}

/**
 * Entity representing stock movements for products and ingredients
 */
@Entity('producto_movimientos_stock')
export class MovimientoStock extends BaseModel {
  @Column({ name: 'producto_id', nullable: true })
  productoId?: number;

  @ManyToOne('Producto', { nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @Column({ name: 'ingrediente_id', nullable: true })
  ingredienteId?: number;

  @ManyToOne('Ingrediente', { nullable: true })
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente?: Ingrediente;

  @Column({
    name: 'tipo_medida',
    type: 'varchar'
  })
  tipoMedida!: string;

  @Column({
    name: 'cantidad_actual',
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0
  })
  cantidadActual!: number;

  @Column({
    name: 'referencia',
    type: 'int',
    nullable: true
  })
  referencia?: number;

  @Column({
    type: 'varchar',
    name: 'tipo_referencia',
    enum: TipoReferencia,
    default: TipoReferencia.AJUSTE
  })
  tipoReferencia!: TipoReferencia;

  @Column({ default: true })
  activo!: boolean;
} 