import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from '../productos/producto.entity';
import { Presentacion } from '../productos/presentacion.entity';
import type { Compra } from './compra.entity';

@Entity('compras_detalles')
export class CompraDetalle extends BaseModel {
  @Column('decimal', { precision: 10, scale: 3, default: 0 })
  cantidad!: number;

  @Column('decimal', { precision: 14, scale: 2, name: 'costo_unitario_presentacion', default: 0 })
  costoUnitarioPresentacion!: number;

  @Column('decimal', { precision: 14, scale: 2, default: 0 })
  subtotal!: number;

  @Column('decimal', { precision: 14, scale: 3, name: 'cantidad_unidad_base', default: 0 })
  cantidadUnidadBase!: number;

  @Column({ default: true })
  activo!: boolean;

  @ManyToOne('Compra', 'detalles', {
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'compra_id' })
  compra!: Compra;

  @ManyToOne(() => Producto, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @ManyToOne(() => Presentacion, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion?: Presentacion;
}
