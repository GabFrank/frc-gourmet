import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoMovimiento } from './caja-mayor-enums';
import { Usuario } from '../personas/usuario.entity';

@Entity('cajas_mayor_movimientos')
export class CajaMayorMovimiento extends BaseModel {
  @ManyToOne('CajaMayor', 'movimientos', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor!: any;

  @Column({
    type: 'varchar',
    name: 'tipo_movimiento',
    enum: TipoMovimiento
  })
  tipoMovimiento!: TipoMovimiento;

  @ManyToOne('Moneda', { nullable: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: any;

  @ManyToOne('FormasPago', { nullable: false })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago!: any;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto!: number;

  @Column()
  fecha!: Date;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'responsable_id' })
  responsable!: Usuario;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  // --- Referencias opcionales a entidades origen (Fase 1) ---

  @ManyToOne('Gasto', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'gasto_id' })
  gasto?: any;

  @ManyToOne('RetiroCaja', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'retiro_caja_id' })
  retiroCaja?: any;

  // Conteo de billetes asociado a un EGRESO_CAJA_INICIAL: el efectivo retirado de
  // caja mayor para sembrar la apertura de una caja. Ese mismo conteo se reutiliza
  // luego como conteo de apertura al "abrir caja con este conteo".
  @ManyToOne('Conteo', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'conteo_id' })
  conteo?: any;

  // --- Referencias a entidades de fases futuras (columnas int por ahora) ---
  // Se convertiran en @ManyToOne cuando se creen las entidades

  @Column({ name: 'compra_cuota_id', type: 'int', nullable: true })
  compraCuotaId?: number;

  @Column({ name: 'operacion_financiera_id', type: 'int', nullable: true })
  operacionFinancieraId?: number;

  @Column({ name: 'entrada_varia_id', type: 'int', nullable: true })
  entradaVariaId?: number;

  @Column({ name: 'cuenta_por_pagar_cuota_id', type: 'int', nullable: true })
  cuentaPorPagarCuotaId?: number;

  @Column({ name: 'cuenta_por_pagar_id', type: 'int', nullable: true })
  cuentaPorPagarId?: number;

  @Column({ name: 'cheque_id', type: 'int', nullable: true })
  chequeId?: number;

  @Column({ name: 'acreditacion_pos_id', type: 'int', nullable: true })
  acreditacionPosId?: number;

  // Trazabilidad RRHH
  @Column({ name: 'vale_id', type: 'int', nullable: true })
  valeId?: number;

  @Column({ name: 'liquidacion_sueldo_id', type: 'int', nullable: true })
  liquidacionSueldoId?: number;

  @Column({ name: 'liquidacion_comision_id', type: 'int', nullable: true })
  liquidacionComisionId?: number;

  @Column({ name: 'cuenta_por_cobrar_cuota_id', type: 'int', nullable: true })
  cuentaPorCobrarCuotaId?: number;

  // Trazabilidad Compras
  @Column({ name: 'compra_id', type: 'int', nullable: true })
  compraId?: number;

  // Contra-movimiento para anulaciones
  @ManyToOne('CajaMayorMovimiento', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'referencia_anulacion_id' })
  referenciaAnulacion?: CajaMayorMovimiento;
}
