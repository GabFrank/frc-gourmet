import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('entradas_varias')
export class EntradaVaria extends BaseModel {
  @ManyToOne('EntradaVariaCategoria', { nullable: false })
  @JoinColumn({ name: 'entrada_varia_categoria_id' })
  entradaVariaCategoria!: any;

  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @ManyToOne('Moneda', { nullable: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: any;

  @ManyToOne('FormasPago', { nullable: false })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago!: any;

  @Column()
  fecha!: Date;

  @ManyToOne('CajaMayor', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor?: any;

  // Destino alternativo: cuenta bancaria (cuando el ingreso entra directo a una cuenta)
  @ManyToOne('CuentaBancaria', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria?: any;

  @Column({ name: 'numero_comprobante', type: 'varchar', length: 100, nullable: true })
  numeroComprobante?: string;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ default: false })
  anulado!: boolean;
}
