import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Timbrado } from './timbrado.entity';
import { Dispositivo } from '../financiero/dispositivo.entity';

/**
 * Detalle de timbrado: asigna un rango de numeracion a un punto de expedicion
 * (tipicamente un dispositivo/caja). El sistema controla la numeracion
 * incrementando `numeroActual` dentro de `[rangoDesde, rangoHasta]`.
 */
@Entity('timbrado_detalles')
export class TimbradoDetalle extends BaseModel {
  @ManyToOne(() => Timbrado)
  @JoinColumn({ name: 'timbrado_id' })
  timbrado!: Timbrado;

  /** Dispositivo / caja asociado a este punto de expedicion (opcional). */
  @ManyToOne(() => Dispositivo, { nullable: true })
  @JoinColumn({ name: 'dispositivo_id' })
  dispositivo?: Dispositivo;

  /** Codigo de establecimiento (ej. '001'). */
  @Column({ name: 'establecimiento', default: '001' })
  establecimiento!: string;

  /** Codigo de punto de expedicion (ej. '001'). */
  @Column({ name: 'punto_expedicion', default: '001' })
  puntoExpedicion!: string;

  @Column({ type: 'int', name: 'rango_desde', default: 1 })
  rangoDesde!: number;

  @Column({ type: 'int', name: 'rango_hasta', default: 1 })
  rangoHasta!: number;

  /** Proximo numero a emitir dentro del rango. */
  @Column({ type: 'int', name: 'numero_actual', default: 1 })
  numeroActual!: number;

  @Column({ default: true })
  activo!: boolean;
}
