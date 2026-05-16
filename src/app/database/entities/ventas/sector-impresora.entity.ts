import { Column, Entity, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Sector } from './sector.entity';
import { Printer } from '../printer.entity';

/**
 * Rol de la impresora dentro de un sector. Permite que un sector tenga
 * impresoras distintas para comandas (cocina), tickets de venta (caja) y
 * pre-cuentas. Una misma impresora física puede aparecer en múltiples
 * sectores con roles distintos.
 */
export enum SectorImpresoraRol {
  COMANDA = 'COMANDA',
  TICKET_VENTA = 'TICKET_VENTA',
  PRECUENTA = 'PRECUENTA',
}

/**
 * Junction M2M Sector↔Printer con rol — define a qué impresora(s) van las
 * comandas/tickets/precuentas de cada sector.
 *
 * **Multi-impresora por sector** es soportado: un sector "COCINA" puede
 * tener 2 impresoras configuradas con rol=COMANDA y la comanda se imprime
 * en ambas (útil para redundancia o cocina caliente + cocina fría sin sub-sectores).
 */
@Entity('sectores_impresoras')
@Unique(['sector', 'printer', 'rol'])
export class SectorImpresora extends BaseModel {
  @ManyToOne(() => Sector, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'sector_id' })
  sector!: Sector;

  @ManyToOne(() => Printer, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'printer_id' })
  printer!: Printer;

  @Column({ type: 'varchar', length: 30, default: SectorImpresoraRol.COMANDA })
  rol!: SectorImpresoraRol;

  @Column({ default: true })
  activo!: boolean;

  /** Observación opcional — útil para distinguir varias impresoras del mismo rol. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  observacion?: string;
}
