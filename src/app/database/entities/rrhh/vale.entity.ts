import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { MotivoVale } from './motivo-vale.entity';
import { CajaMayor } from '../financiero/caja-mayor.entity';
import { Moneda } from '../financiero/moneda.entity';
import { FormasPago } from '../compras/forma-pago.entity';
import { Usuario } from '../personas/usuario.entity';
import { ValeEstado } from './vale-estado.enum';

/**
 * Vale o adelanto a funcionario. Estados:
 *  - SOLICITADO: registrado, sin afectar saldo de caja mayor.
 *  - CONFIRMADO: genero CajaMayorMovimiento EGRESO_VALE y descontó saldo.
 *  - DESCONTADO: ya se aplico en una liquidacion de sueldo.
 *  - ANULADO: contra-movimiento ANULACION en caja mayor.
 *
 * `esAdelanto` distingue adelanto de salario (que se descuenta automaticamente
 * en la proxima liquidacion) de vale comun.
 */
@Entity('vales')
export class Vale extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => MotivoVale, { nullable: true })
  @JoinColumn({ name: 'motivo_id' })
  motivo?: MotivoVale;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ nullable: true })
  descripcion?: string;

  @ManyToOne(() => CajaMayor, { nullable: true })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor?: CajaMayor;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @ManyToOne(() => FormasPago, { nullable: true })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: FormasPago;

  @Column({
    type: 'text',
    enum: ValeEstado,
    default: ValeEstado.SOLICITADO,
  })
  estado!: ValeEstado;

  // El default de creación lo define el formulario (esAdelanto=true). El default
  // de columna se deja en false para no requerir migración de schema; siempre se
  // envía un valor explícito al crear un vale.
  @Column({ name: 'es_adelanto', default: false })
  esAdelanto!: boolean;

  @Column({ name: 'liquidacion_id', type: 'int', nullable: true })
  liquidacionId?: number;

  @Column({ name: 'movimiento_id', type: 'int', nullable: true })
  movimientoId?: number;

  // Si el vale se egresó desde una cuenta bancaria (en vez de Caja Mayor), se
  // guarda aquí para poder revertir el débito al anular. Mutuamente excluyente
  // con cajaMayor/movimientoId.
  @Column({ name: 'cuenta_bancaria_id', type: 'int', nullable: true })
  cuentaBancariaId?: number;

  // Monto efectivamente debitado en la moneda de la cuenta bancaria (cuando la
  // cuenta está en otra moneda que el vale). La anulación revierte ESTE monto.
  @Column({ name: 'monto_cuenta_bancaria', type: 'decimal', precision: 18, scale: 2, nullable: true })
  montoCuentaBancaria?: number;

  @Column({ name: 'cotizacion', type: 'decimal', precision: 18, scale: 6, nullable: true })
  cotizacion?: number;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'autorizado_por_id' })
  autorizadoPor?: Usuario;

  @Column({ name: 'comprobante_url', nullable: true })
  comprobanteUrl?: string;
}
