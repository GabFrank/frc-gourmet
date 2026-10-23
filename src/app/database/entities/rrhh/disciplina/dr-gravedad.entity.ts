import { Column, Entity } from 'typeorm';
import { BaseModel } from '../../base.entity';

/** Gravedad de un error: cuántos puntos descuenta del saldo. */
@Entity('dr_gravedad')
export class DrGravedad extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  area?: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  puntos!: number;

  /** Nombre de color del tema (no hex hardcodeado en la UI). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  color?: string | null;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
