import { Entity, OneToOne, JoinColumn, ManyToMany, JoinTable, Column } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('caja_mayor_configuraciones')
export class CajaMayorConfiguracion extends BaseModel {
  @OneToOne('CajaMayor', { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor?: any;

  @ManyToMany('FormasPago', { createForeignKeyConstraints: false })
  @JoinTable({
    name: 'caja_mayor_config_formas_pago',
    joinColumn: { name: 'caja_mayor_config_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'forma_pago_id', referencedColumnName: 'id' },
  })
  formasPagoVisibles?: any[];

  @ManyToMany('CuentaBancaria', { createForeignKeyConstraints: false })
  @JoinTable({
    name: 'caja_mayor_config_cuentas_bancarias',
    joinColumn: { name: 'caja_mayor_config_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'cuenta_bancaria_id', referencedColumnName: 'id' },
  })
  cuentasBancariasVisibles?: any[];

  @Column({ name: 'mostrar_cuentas_por_pagar', type: 'boolean', default: false })
  mostrarCuentasPorPagar!: boolean;

  @Column({ name: 'mostrar_cuentas_por_cobrar', type: 'boolean', default: false })
  mostrarCuentasPorCobrar!: boolean;
}
