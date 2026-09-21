import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';

export enum MovimientoBancarioTipo {
  ENTRADA_MANUAL = 'ENTRADA_MANUAL',
  SALIDA_MANUAL = 'SALIDA_MANUAL',
  AJUSTE_POSITIVO = 'AJUSTE_POSITIVO',
  AJUSTE_NEGATIVO = 'AJUSTE_NEGATIVO',
  // Asiento bancario generado al acreditar una AcreditacionPos (auto o verificada).
  // Tiene tipo propio para etiquetarse como "Acreditación POS" y poder ocultarse
  // por defecto de la lista consolidada (es un movimiento de alto volumen/ruidoso).
  ACREDITACION_POS = 'ACREDITACION_POS',
}

@Entity('movimientos_bancarios')
export class MovimientoBancario extends BaseModel {
  @ManyToOne('CuentaBancaria', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria!: any;

  // Cuenta bancaria de DESTINO (terceros): a quién va la transferencia
  // Nullable: solo se usa en movimientos que son transferencias a terceros (pago consolidado)
  @ManyToOne('CuentaBancariaDestino', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_destino_id' })
  cuentaBancariaDestino?: any;

  @Column({ type: 'int', name: 'cuenta_bancaria_destino_id', nullable: true })
  cuentaBancariaDestinoId?: number;

  @Column({
    type: 'varchar',
    enum: MovimientoBancarioTipo,
    name: 'tipo_movimiento',
  })
  tipoMovimiento!: MovimientoBancarioTipo;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column()
  fecha!: Date;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ name: 'numero_comprobante', type: 'varchar', length: 100, nullable: true })
  numeroComprobante?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'responsable_id' })
  responsable?: Usuario;

  @Column({ default: false })
  anulado!: boolean;
}
