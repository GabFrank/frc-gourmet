import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';

export enum AguinaldoEstado {
  CALCULADO = 'CALCULADO',
  APROBADO = 'APROBADO',
  PAGADO = 'PAGADO',
}

@Entity('aguinaldos')
@Index(['funcionario', 'anio'])
export class Aguinaldo extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ type: 'int' })
  anio!: number;

  @Column({
    name: 'monto_calculado',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  montoCalculado!: number;

  @Column({ name: 'meses_trabajados', type: 'int', default: 0 })
  mesesTrabajados!: number;

  @Column({ name: 'fecha_pago', nullable: true })
  fechaPago?: Date;

  @Column({ name: 'liquidacion_id', type: 'int', nullable: true })
  liquidacionId?: number;

  @Column({
    type: 'text',
    enum: AguinaldoEstado,
    default: AguinaldoEstado.CALCULADO,
  })
  estado!: AguinaldoEstado;
}
