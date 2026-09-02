import { Column, Entity, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CuentaCliente } from './cuenta-cliente.entity';
import { ZonaDelivery } from './zona-delivery.entity';
import { Moneda } from '../financiero/moneda.entity';
import type { PedidoOnlineItem } from './pedido-online-item.entity';
import {
  TipoPedidoOnline,
  EstadoPedidoOnline,
  CanalPedidoOnline,
  MetodoPagoOnline,
} from './pedido-online.enums';

/**
 * Pedido online (web app) — "envelope" inbound ANTES de convertirse en `Venta`.
 *
 * Entra en estado RECIBIDO; el PdV lo revisa y al **aceptar** se materializa en
 * una `Venta` (+ `Delivery` si corresponde) reutilizando los handlers de ventas,
 * y `venta_id` queda vinculado. Precios/costos se **congelan** en los items para
 * evitar disputas si el catálogo cambia después.
 *
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */
@Entity('pedidos_online')
export class PedidoOnline extends BaseModel {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  numero!: string;

  @ManyToOne(() => CuentaCliente, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_cliente_id' })
  cuentaCliente?: CuentaCliente;

  // Snapshot de contacto (por si la cuenta se edita/borra).
  @Column({ name: 'nombre_cliente', type: 'varchar', length: 150, nullable: true })
  nombreCliente?: string;

  @Column({ name: 'telefono_cliente', type: 'varchar', length: 30, nullable: true })
  telefonoCliente?: string;

  @Column({ name: 'tipo_pedido', type: 'varchar', length: 20 })
  tipoPedido!: TipoPedidoOnline;

  @Index()
  @Column({ type: 'varchar', length: 20, default: EstadoPedidoOnline.RECIBIDO })
  estado!: EstadoPedidoOnline;

  @Column({ name: 'canal_origen', type: 'varchar', length: 20, default: CanalPedidoOnline.WEB })
  canalOrigen!: CanalPedidoOnline;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 20, default: MetodoPagoOnline.EFECTIVO })
  metodoPago!: MetodoPagoOnline;

  // Programación (ASAP = null, o fecha/hora futura).
  @Column({ name: 'fecha_programada', nullable: true })
  fechaProgramada?: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ name: 'costo_envio', type: 'decimal', precision: 18, scale: 2, default: 0 })
  costoEnvio!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  total!: number;

  @ManyToOne(() => Moneda, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda;

  // Delivery
  @ManyToOne(() => ZonaDelivery, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'zona_delivery_id' })
  zonaDelivery?: ZonaDelivery;

  @Column({ name: 'direccion_entrega', type: 'text', nullable: true })
  direccionEntrega?: string;

  @Column({ name: 'referencia_direccion', type: 'varchar', length: 255, nullable: true })
  referenciaDireccion?: string;

  // Punto elegido en el mapa (Leaflet) — para el repartidor.
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitud?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitud?: number;

  @Column({ type: 'text', nullable: true })
  notas?: string;

  // Vínculos al materializar en el PdV (Fase 4). Sin FK constraint para no
  // acoplar el borrado; se resuelven por id.
  @Column({ name: 'venta_id', type: 'int', nullable: true })
  ventaId?: number;

  @Column({ name: 'delivery_id', type: 'int', nullable: true })
  deliveryId?: number;

  @Column({ name: 'mesa_id', type: 'int', nullable: true })
  mesaId?: number;

  @Column({ name: 'motivo_rechazo', type: 'varchar', length: 255, nullable: true })
  motivoRechazo?: string;

  // Timestamps por transición (para métricas / tracking).
  @Column({ name: 'fecha_aceptado', nullable: true })
  fechaAceptado?: Date;

  @Column({ name: 'fecha_listo', nullable: true })
  fechaListo?: Date;

  @Column({ name: 'fecha_entregado', nullable: true })
  fechaEntregado?: Date;

  @OneToMany('PedidoOnlineItem', 'pedido', { cascade: true })
  items?: PedidoOnlineItem[];
}
