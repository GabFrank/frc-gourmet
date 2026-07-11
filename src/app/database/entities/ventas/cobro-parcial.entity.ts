import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';
import type { Venta } from './venta.entity';
import type { CobroParcialItem } from './cobro-parcial-item.entity';

/**
 * Ronda de cobro parcial de una venta.
 *
 * Agrupa una acción de "Cobro Parcial": los ítems (bruto) que cubrió y la plata
 * que entró en esa ronda (líneas `PagoDetalle` tagueadas con `cobro_parcial_id`).
 *
 * - `factorAplicado` = saldoDinero / pendienteBruto al momento de la ronda.
 *   Conecta la cobertura en bruto de los ítems con la plata realmente cobrada
 *   (así el descuento/aumento global se absorbe sin tocar lo ya pagado).
 * - `cashTotal` = plata cobrada en la ronda (moneda principal), auditoría.
 * - `activo=false` = ronda anulada; su cobertura deja de contar y
 *   `VentaItem.montoCubierto` se recomputa.
 */
@Entity('cobros_parciales')
export class CobroParcial extends BaseModel {
  @ManyToOne('Venta', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;

  @Column({ name: 'fecha' })
  fecha!: Date;

  @Column({ name: 'factor_aplicado', type: 'decimal', precision: 10, scale: 6, default: 1 })
  factorAplicado!: number;

  @Column({ name: 'cash_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
  cashTotal!: number;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('CobroParcialItem', 'cobroParcial')
  items?: CobroParcialItem[];
}
