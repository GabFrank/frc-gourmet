import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { Usuario } from '../../personas/usuario.entity';
import { DrTipoError } from './dr-tipo-error.entity';
import { DrErrorEstado } from './dr-error-estado.enum';

@Entity('dr_error')
@Index('IDX_dr_error_funcionario_fecha', ['funcionario', 'fecha'])
export class DrError extends BaseModel {
  @Column({ type: 'date' })
  fecha!: Date;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => DrTipoError, { nullable: false })
  @JoinColumn({ name: 'tipo_error_id' })
  tipoError!: DrTipoError;

  /** Puntos copiados de la gravedad al registrar (cambios posteriores no afectan). */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  puntos!: number;

  @Column({ type: 'text', nullable: true })
  detalle?: string | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'registrado_por_id' })
  registradoPor?: Usuario | null;

  @Column({ type: 'text', enum: DrErrorEstado, default: DrErrorEstado.VIGENTE })
  estado!: DrErrorEstado;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string | null;
}
