import { Column, Entity, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from './producto.entity';
import { Sector } from '../ventas/sector.entity';

/**
 * Junction M2M Producto↔Sector — declara los sectores en los que se imprime
 * la comanda de un producto cuando se vende.
 *
 * **Multi-sector por producto** (requerimiento explícito): un mismo producto
 * puede pertenecer a más de un sector. Cuando se agrega a una comanda, la
 * impresión se duplica a las impresoras de TODOS sus sectores asociados.
 *
 * Ejemplos de uso:
 * - "PIZZA MARGHERITA" → COCINA (preparación) + CAJA (control)
 * - "WHISKY" → BAR (preparación) + GERENCIA (control de high-ticket)
 * - Solo "GASEOSA" → BAR (un solo sector)
 *
 * Si un producto no tiene ningún `ProductoSector` declarado, la comanda
 * se rutea al sector default del Dispositivo/Caja. Si no hay tampoco eso,
 * cae en "SIN SECTOR" (warning).
 */
@Entity('producto_sectores')
@Unique(['producto', 'sector'])
export class ProductoSector extends BaseModel {
  @ManyToOne(() => Producto, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @ManyToOne(() => Sector, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'sector_id' })
  sector!: Sector;

  /**
   * Orden de impresión cuando hay múltiples sectores. Menor = se imprime
   * primero. Default 0; útil para que la cocina reciba antes que el control
   * gerencial, por ejemplo.
   */
  @Column({ type: 'int', default: 0 })
  prioridad!: number;

  @Column({ default: true })
  activo!: boolean;
}
