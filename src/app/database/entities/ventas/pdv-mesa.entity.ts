import { Column, Entity, ManyToOne, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import type { Comanda } from './comanda.entity';
import { BaseModel } from '../base.entity';
import { Reserva } from './reserva.entity';
import { Sector } from './sector.entity';
import type { Venta } from './venta.entity';

/**
 * Enum for table states
 */
export enum PdvMesaEstado {
  DISPONIBLE = 'DISPONIBLE',
  OCUPADO = 'OCUPADO'
}

/**
 * Entity representing a point of sale table
 */
@Entity('pdv_mesas')
export class PdvMesa extends BaseModel {
  @Column()
  numero!: number;

  @Column({ type: 'int', default: 4, nullable: true })
  cantidad_personas?: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  reservado!: boolean;

  @Column({
    type: 'varchar',
    enum: PdvMesaEstado,
    default: PdvMesaEstado.DISPONIBLE
  })
  estado!: PdvMesaEstado;

  /**
   * Token opaco (UUID) codificado en el QR estático de la mesa para el
   * autoservicio de pedidos (canal MESA_QR). Se resuelve la mesa por este token,
   * nunca por el número. Ver domains/pedidos-online.md (MESA_QR).
   */
  @Column({ name: 'qr_token', type: 'varchar', length: 64, nullable: true, unique: true })
  qrToken?: string;

  /**
   * Autoservicio por QR habilitado por el cajero para esta mesa (gate anti-fraude):
   * la mesa solo acepta pedidos MESA_QR mientras esté en true.
   */
  @Column({ name: 'autoservicio_activo', type: 'boolean', default: false })
  autoservicioActivo!: boolean;

  @ManyToOne(() => Reserva, { nullable: true })
  @JoinColumn({ name: 'reserva_id' })
  reserva?: Reserva;
  
  @ManyToOne(() => Sector, sector => sector.mesas, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sector?: Sector;
  
  @OneToOne('Venta', 'mesa', { nullable: true })
  venta?: Venta;

  @OneToMany('Comanda', 'pdv_mesa')
  comandas?: any[];
} 