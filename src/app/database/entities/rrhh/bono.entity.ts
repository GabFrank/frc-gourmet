import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Usuario } from '../personas/usuario.entity';
import { BonoTipo } from './bono-tipo.enum';
import { GastoFrecuencia } from '../financiero/caja-mayor-enums';

@Entity('bonos')
export class Bono extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({
    type: 'text',
    enum: BonoTipo,
    default: BonoTipo.OTRO,
  })
  tipo!: BonoTipo;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ nullable: true })
  motivo?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'autorizado_por_id' })
  autorizadoPor?: Usuario;

  @Column({ name: 'liquidacion_id', type: 'int', nullable: true })
  liquidacionId?: number;

  @Column({ name: 'es_recurrente', default: false })
  esRecurrente!: boolean;

  @Column({
    type: 'text',
    enum: GastoFrecuencia,
    nullable: true,
  })
  frecuencia?: GastoFrecuencia;

  @Column({ default: false })
  anulado!: boolean;
}
