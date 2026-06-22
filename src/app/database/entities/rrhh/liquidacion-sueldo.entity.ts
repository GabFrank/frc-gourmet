import { Column, Entity, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Moneda } from '../financiero/moneda.entity';
import { Usuario } from '../personas/usuario.entity';
import { LiquidacionSueldoEstado } from './liquidacion-sueldo-estado.enum';

@Entity('liquidaciones_sueldo')
@Index(['funcionario', 'periodo'])
export class LiquidacionSueldo extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column()
  periodo!: string; // 'YYYY-MM'

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio!: Date;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin!: Date;

  @Column({
    name: 'salario_base',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  salarioBase!: number;

  @Column({
    name: 'total_haberes',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  totalHaberes!: number;

  @Column({
    name: 'total_descuentos',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  totalDescuentos!: number;

  @Column({
    name: 'total_neto',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  totalNeto!: number;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_pago_id' })
  monedaPago!: Moneda;

  @Column({
    type: 'text',
    enum: LiquidacionSueldoEstado,
    default: LiquidacionSueldoEstado.BORRADOR,
  })
  estado!: LiquidacionSueldoEstado;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'aprobado_por_id' })
  aprobadoPor?: Usuario;

  @Column({ name: 'fecha_aprobacion', nullable: true })
  fechaAprobacion?: Date;

  @Column({ name: 'fecha_pago', nullable: true })
  fechaPago?: Date;

  @Column({ name: 'movimiento_id', type: 'int', nullable: true })
  movimientoId?: number;

  // Si el pago se hizo desde una cuenta bancaria (en vez de Caja Mayor), se
  // guarda aqui para poder revertir el saldo al anular la liquidacion.
  @Column({ name: 'cuenta_bancaria_id', type: 'int', nullable: true })
  cuentaBancariaId?: number;

  @Column({ nullable: true })
  observacion?: string;

  @Column({ name: 'comprobante_url', nullable: true })
  comprobanteUrl?: string;

  @OneToMany('LiquidacionItem', 'liquidacion')
  items?: any[];
}
