import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Receta } from './receta.entity';
import { Presentacion } from './presentacion.entity';
import { Sabor } from './sabor.entity';
import { PrecioVenta } from './precio-venta.entity';

@Entity('receta_presentacion')
@Index(['presentacion', 'sabor'], { unique: true }) // Constraint único usando presentacion y sabor
export class RecetaPresentacion extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  nombre_generado!: string; // "Pizza Grande Calabresa"

  @Column({ type: 'varchar', length: 50, nullable: true, unique: true })
  sku?: string; // "PIZ-CAL-G"

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  precio_ajuste?: number; // Ajuste específico al precio base

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costo_calculado!: number; // Cache del costo calculado

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Relationships
  // ManyToOne: varias variaciones (una por presentación del sabor) comparten la misma receta base.
  @ManyToOne(() => Receta, { nullable: false, eager: true })
  @JoinColumn({ name: 'receta_id' })
  receta!: Receta;

  @ManyToOne(() => Presentacion, { nullable: false })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion!: Presentacion;

  @ManyToOne(() => Sabor, { nullable: false })
  @JoinColumn({ name: 'sabor_id' })
  sabor!: Sabor;

  @OneToMany(() => PrecioVenta, precioVenta => precioVenta.recetaPresentacion)
  preciosVenta?: PrecioVenta[];
}
