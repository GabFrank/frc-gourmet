import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Cargo } from '../cargo.entity';
import { Funcionario } from '../funcionario.entity';

/** Función general (de un cargo) o específica (de un funcionario): exactamente uno de los dos. */
@Entity('ft_funcion')
export class FtFuncion extends BaseModel {
  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ type: 'text', nullable: true })
  detalle?: string | null;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;

  @ManyToOne(() => Cargo, { nullable: true })
  @JoinColumn({ name: 'cargo_id' })
  cargo?: Cargo | null;

  @ManyToOne(() => Funcionario, { nullable: true })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario?: Funcionario | null;
}
