import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Comanda } from './comanda.entity';

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

  @Column({
    type: 'varchar',
    enum: ComandaItemEstado,
    default: ComandaItemEstado.PENDIENTE,
  })
  estado!: ComandaItemEstado;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacion?: string;

  @Column({ nullable: true, name: 'fecha_listo' })
  fechaListo?: Date;

  @Column({ default: true })
  activo!: boolean;

  // ─── Impresión de comanda (multi-sector) ────────────────────────────────
  // `impreso` queda en true SOLO cuando todas las impresiones del item se
  // completan (todos sus sectores recibieron el ticket). Para detalle
  // por-sector ver `impresiones`.
  @Column({ default: false })
  impreso!: boolean;

  @Column({ type: 'datetime', nullable: true, name: 'fecha_impresion' })
  fechaImpresion?: Date;

  // JSON serializado: `[{sectorId, printerId, ts, ok, error?}]` con el log
  // de cada intento de impresión. Permite reimprimir solo lo que falló por
  // sector y auditar quién imprimió qué cuándo. Usamos `text` por compat
  // dual-driver (en Postgres podría ser jsonb pero el handler ya parsea con
  // JSON.parse — overkill).
  @Column({ type: 'text', nullable: true })
  impresiones?: string;
}
