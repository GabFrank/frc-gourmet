import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Cargo } from './cargo.entity';

/**
 * Trazabilidad de cambios de cargo. Cada vez que un funcionario cambia de cargo
 * se crea un registro nuevo y se cierra el anterior con fechaHasta.
 */
@Entity('historico_cargos')
export class HistoricoCargo extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => Cargo)
  @JoinColumn({ name: 'cargo_id' })
  cargo!: Cargo;

  @Column({ name: 'fecha_desde', type: 'date' })
  fechaDesde!: Date;

  @Column({ name: 'fecha_hasta', type: 'date', nullable: true })
  fechaHasta?: Date;

  @Column({ nullable: true })
  motivo?: string;
}
