import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { EquipoComision } from './equipo-comision.entity';
import { Funcionario } from './funcionario.entity';

@Entity('equipo_comision_miembros')
export class EquipoComisionMiembro extends BaseModel {
  @ManyToOne(() => EquipoComision, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_comision_id' })
  equipo!: EquipoComision;

  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ name: 'porcentaje_reparto', type: 'decimal', precision: 18, scale: 2, default: 0 })
  porcentajeReparto!: number;
}
