import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Asistencia } from './asistencia.entity';
import { Usuario } from '../personas/usuario.entity';
import { PenalizacionTipo } from './penalizacion-tipo.enum';

@Entity('penalizaciones')
export class Penalizacion extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => Asistencia, { nullable: true })
  @JoinColumn({ name: 'asistencia_id' })
  asistencia?: Asistencia;

  @Column({
    type: 'text',
    enum: PenalizacionTipo,
    default: PenalizacionTipo.OTRO,
  })
  tipo!: PenalizacionTipo;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  monto!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'registrado_por_id' })
  registradoPor?: Usuario;

  @Column({ default: false })
  anulada!: boolean;

  @Column({ name: 'auto_generada', default: false })
  autoGenerada!: boolean;
}
