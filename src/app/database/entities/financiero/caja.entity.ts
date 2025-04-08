import { Column, Entity, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Enumeration for cash register states
 */
export enum CajaEstado {
  ABIERTO = 'ABIERTO',
  CERRADO = 'CERRADO',
  CANCELADO = 'CANCELADO'
}

/**
 * Entity representing a cash register
 */
@Entity('cajas')
export class Caja extends BaseModel {
  @ManyToOne('Dispositivo', 'cajas', { nullable: false })
  @JoinColumn({ name: 'dispositivo_id' })
  dispositivo!: any;

  @Column({ type: 'datetime', name: 'fecha_apertura' })
  fechaApertura!: Date;

  @Column({ type: 'datetime', name: 'fecha_cierre', nullable: true })
  fechaCierre?: Date;

  @OneToOne('Conteo', 'cajaApertura', { nullable: false, cascade: true })
  @JoinColumn({ name: 'conteo_apertura_id' })
  conteoApertura!: any;

  @OneToOne('Conteo', 'cajaCierre', { nullable: true, cascade: true })
  @JoinColumn({ name: 'conteo_cierre_id' })
  conteoCierre?: any;

  @Column({
    type: 'varchar',
    enum: CajaEstado,
    default: CajaEstado.ABIERTO
  })
  estado!: CajaEstado;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  revisado!: boolean;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'revisado_por' })
  revisadoPor?: Usuario;
}
