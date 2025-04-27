import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';
import { Usuario } from '../personas/usuario.entity';
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
  @ManyToOne(() => PrecioDelivery)
  @JoinColumn({ name: 'precio_delivery_id' })
  precioDelivery!: PrecioDelivery;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ nullable: true })
  direccion?: string;

  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @Column({
    type: 'varchar',
    enum: DeliveryEstado,
    default: DeliveryEstado.ABIERTO
  })
  estado!: DeliveryEstado;

  @Column({ name: 'fecha_abierto', type: 'datetime' })
  fechaAbierto!: Date;

  @Column({ name: 'fecha_para_entrega', type: 'datetime', nullable: true })
  fechaParaEntrega?: Date;

  @Column({ name: 'fecha_en_camino', type: 'datetime', nullable: true })
  fechaEnCamino?: Date;

  @Column({ name: 'fecha_entregado', type: 'datetime', nullable: true })
  fechaEntregado?: Date;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'entregado_por' })
  entregadoPor?: Usuario;
} 