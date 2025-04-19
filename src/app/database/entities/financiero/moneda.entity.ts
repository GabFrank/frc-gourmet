import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PrecioVenta } from '../productos/precio-venta.entity';

/**
 * Entity representing a currency
 */
@Entity('monedas')
export class Moneda extends BaseModel {
  @Column()
  denominacion!: string;

  @Column()
  simbolo!: string;

  @Column({ nullable: true })
  flagIcon!: string;

  @Column({ nullable: true })
  countryCode!: string;

  @Column({ nullable: true, type: 'text' })
  flagIconBase64!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  principal!: boolean;

  @OneToMany(() => PrecioVenta, precioVenta => precioVenta.moneda)
  preciosVenta!: PrecioVenta[];
}
