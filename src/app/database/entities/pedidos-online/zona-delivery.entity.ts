import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Zona de delivery para pedidos online: tarifa fija + monto mínimo de pedido.
 *
 * La zona se dibuja como un polígono sobre un mapa en la configuración y el
 * servidor resuelve en cuál cae el punto que eligió el cliente en el checkout.
 * El cliente NO elige zona: es un dato interno del negocio y pedirle que se
 * autoclasifique es pedirle que adivine el mapa del local.
 */
@Entity('zonas_delivery')
export class ZonaDelivery extends BaseModel {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  tarifa!: number;

  @Column({ name: 'monto_minimo', type: 'decimal', precision: 18, scale: 2, default: 0 })
  montoMinimo!: number;

  @Column({ type: 'boolean', default: true })
  activa!: boolean;

  /** Orden de despliegue en la web. */
  @Column({ type: 'int', default: 0 })
  orden!: number;

  /**
   * Contorno de la zona como GeoJSON en texto (`Polygon` o `MultiPolygon`, en
   * orden `[lng, lat]`). Se dibuja sobre un mapa en la configuración; el
   * servidor resuelve con él en qué zona cae el punto que eligió el cliente.
   * Null = zona sin dibujar todavía, que no participa de la resolución.
   */
  @Column({ type: 'text', nullable: true })
  poligono?: string | null;

  /**
   * Tarifa compartida con el delivery del PdV. Una sola fuente de precios para
   * los dos canales: si la web cotizara por su cuenta, el cajero vería dos
   * números distintos para el mismo reparto. Si es null se usa `tarifa`, que
   * queda como fallback de las zonas anteriores a este cambio.
   */
  @ManyToOne('PrecioDelivery', { nullable: true })
  @JoinColumn({ name: 'precio_delivery_id' })
  precioDelivery?: any;
}
