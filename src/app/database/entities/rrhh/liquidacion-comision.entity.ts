import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Usuario } from '../personas/usuario.entity';
import { LiquidacionComisionEstado } from './regla-comision-enums';

@Entity('liquidaciones_comision')
export class LiquidacionComision extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ type: 'varchar', length: 7 })
  periodo!: string;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio!: Date;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin!: Date;

  @Column({ name: 'total_calculado', type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalCalculado!: number;

  @Column({ name: 'estado', type: 'varchar', enum: LiquidacionComisionEstado, default: LiquidacionComisionEstado.BORRADOR })
  estado!: LiquidacionComisionEstado;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'aprobado_por_id' })
  aprobadoPor?: Usuario;

  @Column({ name: 'fecha_aprobacion', type: 'datetime', nullable: true })
  fechaAprobacion?: Date;

  @Column({ type: 'text', nullable: true })
  observacion?: string;
}
