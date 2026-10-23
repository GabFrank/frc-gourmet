import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { LiquidacionSueldo } from '../liquidacion-sueldo.entity';
import { DrLiquidacionPendienteEstado } from './dr-liquidacion-pendiente-estado.enum';

/**
 * Borrador de liquidación desactualizado por un cambio del módulo DR que no se
 * pudo regenerar en la misma operación. Mientras haya uno PENDIENTE para
 * (funcionario, mes) no se puede aprobar esa liquidación.
 */
@Entity('dr_liquidacion_pendiente')
@Index('IDX_dr_liq_pend_func_mes_estado', ['funcionario', 'mes', 'estado'])
export class DrLiquidacionPendiente extends BaseModel {
  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  /** 'YYYY-MM'. */
  @Column({ type: 'varchar', length: 7 })
  mes!: string;

  @ManyToOne(() => LiquidacionSueldo, { nullable: true })
  @JoinColumn({ name: 'liquidacion_id' })
  liquidacion?: LiquidacionSueldo | null;

  @Column({ type: 'text', nullable: true })
  motivo?: string | null;

  @Column({ type: 'text', enum: DrLiquidacionPendienteEstado, default: DrLiquidacionPendienteEstado.PENDIENTE })
  estado!: DrLiquidacionPendienteEstado;

  @Column({ name: 'resuelto_en', nullable: true })
  resueltoEn?: Date;
}
