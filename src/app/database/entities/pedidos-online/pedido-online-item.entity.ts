import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PedidoOnline } from './pedido-online.entity';

/**
 * Ítem de un pedido online. Espejo liviano de la selección del cliente, con
 * precio **congelado** (snapshot) al momento del pedido. La personalización
 * (adicionales, observaciones, sabores, quita de ingredientes) se guarda como
 * JSON legible; al aceptar el pedido en el PdV se traduce a `VentaItem` con sus
 * sub-entidades. Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */
@Entity('pedido_online_items')
export class PedidoOnlineItem extends BaseModel {
  @ManyToOne(() => PedidoOnline, (p) => p.items, { onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'pedido_online_id' })
  pedido!: PedidoOnline;

  @Column({ name: 'producto_id', type: 'int' })
  productoId!: number;

  @Column({ name: 'presentacion_id', type: 'int', nullable: true })
  presentacionId?: number;

  // Snapshots legibles para no depender del catálogo al mostrar el pedido.
  @Column({ name: 'nombre_producto', type: 'varchar', length: 255 })
  nombreProducto!: string;

  @Column({ name: 'nombre_presentacion', type: 'varchar', length: 255, nullable: true })
  nombrePresentacion?: string;

  @Column({ type: 'decimal', precision: 18, scale: 3, default: 1 })
  cantidad!: number;

  @Column({ name: 'precio_unitario', type: 'decimal', precision: 18, scale: 2, default: 0 })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  subtotal!: number;

  /**
   * Personalización elegida por el cliente, como JSON:
   * `{ adicionales: [{id,nombre,precio}], observaciones: [{id?,texto}], sabores: [...], notas }`.
   * Snapshot: se traduce a las sub-entidades de VentaItem al aceptar.
   */
  @Column({ type: 'text', nullable: true })
  personalizacion?: string;
}
