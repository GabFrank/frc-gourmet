import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Comanda } from './comanda.entity';
import { Sector } from './sector.entity';

export enum ComandaItemEstado {
  PENDIENTE = 'PENDIENTE',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO = 'LISTO',
  ENTREGADO = 'ENTREGADO',
  CANCELADO = 'CANCELADO',
}

@Entity('comanda_items')
export class ComandaItem extends BaseModel {
  @ManyToOne(() => Comanda, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comanda_id' })
  comanda!: Comanda;

  @ManyToOne('VentaItem', { nullable: false })
  @JoinColumn({ name: 'venta_item_id' })
  ventaItem!: any;

  // KDS: sector donde se prepara este item. El ruteo (M2M producto_sectores)
  // genera un ComandaItem por sector → estado de preparación independiente.
  @ManyToOne(() => Sector, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sector?: Sector;

  @Column({
    type: 'varchar',
    enum: ComandaItemEstado,
    default: ComandaItemEstado.PENDIENTE,
  })
  estado!: ComandaItemEstado;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacion?: string;

  // KDS: timestamp al pasar a EN_PREPARACION (métricas de tiempo de prep).
  @Column({ nullable: true, name: 'fecha_en_preparacion' })
  fechaEnPreparacion?: Date;

  @Column({ nullable: true, name: 'fecha_listo' })
  fechaListo?: Date;

  @Column({ default: true })
  activo!: boolean;
}
