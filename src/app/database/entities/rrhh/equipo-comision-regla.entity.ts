import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { EquipoComision } from './equipo-comision.entity';
import { ReglaComision } from './regla-comision.entity';

@Entity('equipo_comision_reglas')
export class EquipoComisionRegla extends BaseModel {
  @ManyToOne(() => EquipoComision, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipo_comision_id' })
  equipo!: EquipoComision;

  @ManyToOne(() => ReglaComision)
  @JoinColumn({ name: 'regla_comision_id' })
  reglaComision!: ReglaComision;

  @Column({ name: 'fecha_desde', type: 'date' })
  fechaDesde!: Date;

  @Column({ name: 'fecha_hasta', type: 'date', nullable: true })
  fechaHasta?: Date;

  @Column({ default: true })
  activo!: boolean;
}
