import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';

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

  @OneToMany('Caja', 'dispositivo')
  cajas!: any[];
}
