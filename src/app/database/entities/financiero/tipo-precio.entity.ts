import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Entity representing a price type (e.g. retail, wholesale, special discount)
 */
@Entity('financiero_tipo_precio')
export class TipoPrecio extends BaseModel {
  @Column({ length: 100 })
  descripcion!: string;

  @Column({ default: false })
  autorizacion!: boolean;

  @Column({ name: 'autorizado_por', nullable: true })
  autorizadoPorId?: number;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'autorizado_por' })
  autorizadoPor?: Usuario;

  @Column({ default: true })
  activo!: boolean;
}
