import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';
import { Usuario } from '../personas/usuario.entity';
import { Funcionario } from '../rrhh/funcionario.entity';
import { PrecioDelivery } from './precio-delivery.entity';

/**
 * Enum for delivery states
 */
export enum DeliveryEstado {
  ABIERTO = 'ABIERTO',
  PARA_ENTREGA = 'PARA_ENTREGA',
  EN_CAMINO = 'EN_CAMINO',
  ENTREGADO = 'ENTREGADO',
  CANCELADO = 'CANCELADO'
}

/**
 * Entity representing a delivery
 */
@Entity('deliveries')
export class Delivery extends BaseModel {
  @ManyToOne(() => PrecioDelivery, { nullable: true })
  @JoinColumn({ name: 'precio_delivery_id' })
  precioDelivery?: PrecioDelivery;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @Column({ nullable: true })
  nombre?: string;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacion?: string;

  @Column({
    type: 'varchar',
    enum: DeliveryEstado,
    default: DeliveryEstado.ABIERTO
  })
  estado!: DeliveryEstado;

  @Column({ name: 'fecha_abierto' })
  fechaAbierto!: Date;

  @Column({ name: 'fecha_para_entrega', nullable: true })
  fechaParaEntrega?: Date;

  @Column({ name: 'fecha_en_camino', nullable: true })
  fechaEnCamino?: Date;

  @Column({ name: 'fecha_entregado', nullable: true })
  fechaEntregado?: Date;

  @Column({ name: 'fecha_cancelacion', nullable: true })
  fechaCancelacion?: Date;

  @Column({ name: 'motivo_cancelacion', type: 'varchar', length: 500, nullable: true })
  motivoCancelacion?: string;

  @Column({ name: 'cobro_anticipado', default: false })
  cobroAnticipado!: boolean;

  /**
   * @deprecated El repartidor se modela como `Funcionario`, no como `Usuario`:
   * un repartidor rara vez tiene usuario del sistema. La columna se conserva
   * (nunca llegó a escribirse: el botón ENVIAR tenía un TODO) para no romper
   * instalaciones existentes. Usar `entregadoPorFuncionario`.
   */
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'entregado_por' })
  entregadoPor?: Usuario;

  /** Repartidor que llevó el pedido. Se asigna al pasar a EN_CAMINO. */
  @ManyToOne(() => Funcionario, { nullable: true })
  @JoinColumn({ name: 'entregado_por_funcionario_id' })
  entregadoPorFuncionario?: Funcionario;
} 