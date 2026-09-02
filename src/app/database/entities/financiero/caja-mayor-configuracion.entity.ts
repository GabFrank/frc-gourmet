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

  /**
   * Orden persistente de las cuentas bancarias (array JSON de ids) elegido por
   * drag & drop en el diálogo de configuración. Define el ORDEN en que se
   * muestran las cards de cuentas bancarias en el sidebar de `caja-mayor-detalle`.
   * La M:M `cuentasBancariasVisibles` define QUÉ cuentas se muestran; esta
   * columna define el orden. NULL / ids faltantes → al final por id ascendente.
   */
  @Column({ name: 'cuentas_bancarias_orden', type: 'text', nullable: true })
  cuentasBancariasOrden?: string | null;

  /**
   * Tope del descuento que se puede conceder al cobrar una cuenta por cobrar,
   * como porcentaje del total del cobro. NULL = sin tope.
   *
   * Vive en la configuracion de la caja mayor y no en un ajuste global porque es
   * una regla operativa del puesto: el cobro se registra parado en una caja, y el
   * wizard manda cual es como contexto del evento.
   */
  @Column({ name: 'descuento_cpc_max_porcentaje', type: 'decimal', precision: 5, scale: 2, nullable: true })
  descuentoCpcMaxPorcentaje?: number | null;
}
