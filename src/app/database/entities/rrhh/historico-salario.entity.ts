import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Moneda } from '../financiero/moneda.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Trazabilidad de cambios salariales del funcionario.
 */
@Entity('historico_salarios')
export class HistoricoSalario extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({
    name: 'salario_anterior',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  salarioAnterior?: number;

  @Column({
    name: 'salario_nuevo',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  salarioNuevo!: number;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ name: 'fecha_vigencia', type: 'date' })
  fechaVigencia!: Date;

  @Column({ nullable: true })
  motivo?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'autorizado_por_id' })
  autorizadoPor?: Usuario;
}
