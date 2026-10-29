import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

// Unicidad de (cajaMayor, moneda, formaPago) manejada en el handler actualizarSaldo()
@Entity('cajas_mayor_saldos')
export class CajaMayorSaldo extends BaseModel {
  @ManyToOne('CajaMayor', 'saldos', { nullable: false })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor!: any;

  @ManyToOne('Moneda', { nullable: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: any;

  @ManyToOne('FormasPago', { nullable: false })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago!: any;

  // (18,2): con (10,2) Postgres desbordaba a partir de 100.000.000 Gs (#340).
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  saldo!: number;
}
