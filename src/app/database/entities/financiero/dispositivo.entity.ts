import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Printer } from '../printer.entity';

/**
 * Entity representing a hardware device
 */
@Entity('dispositivos')
export class Dispositivo extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  mac?: string;

  @Column({ default: false, name: 'is_venta' })
  isVenta!: boolean;

  @Column({ default: false, name: 'is_caja' })
  isCaja!: boolean;

  @Column({ default: false, name: 'is_touch' })
  isTouch!: boolean;

  @Column({ default: false, name: 'is_mobile' })
  isMobile!: boolean;

  @Column({ default: true })
  activo!: boolean;

  /**
   * Impresora local del dispositivo para tickets de venta y pre-cuentas.
   * Si está seteada, `getPrinterByRol(TICKET_VENTA, deviceId)` la prioriza
   * sobre el fallback global (M2M sectores_impresoras + Printer.rol).
   * Para multi-caja real donde cada PdV imprime en su propia térmica.
   */
  @ManyToOne(() => Printer, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'printer_ticket_id' })
  printerTicket?: Printer;

  @OneToMany('Caja', 'dispositivo')
  cajas!: any[];
}
