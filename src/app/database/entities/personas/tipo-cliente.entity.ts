import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing client types with different attributes for business rules
 */
@Entity('tipo_clientes')
export class TipoCliente extends BaseModel {
  @Column()
  descripcion!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  credito!: boolean;

  @Column({ default: false })
  descuento!: boolean;

  @Column({ type: 'float', default: 0 })
  porcentaje_descuento!: number;
} 