import { Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { ReglaComision } from './regla-comision.entity';
import { Producto } from '../productos/producto.entity';

@Entity('regla_comision_productos')
export class ReglaComisionProducto extends BaseModel {
  @ManyToOne(() => ReglaComision, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regla_comision_id' })
  reglaComision!: ReglaComision;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;
}
