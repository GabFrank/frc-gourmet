import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Usuario } from '../../personas/usuario.entity';
import { DrPremio } from './dr-premio.entity';
import { DrEncuesta } from './dr-encuesta.entity';
import { DrPeriodoEstado } from './dr-periodo-estado.enum';

@Entity('dr_periodo')
@Index('IDX_dr_periodo_premio_desde', ['premio', 'desde'])
@Index('IDX_dr_periodo_encuesta_desde', ['encuesta', 'desde'])
export class DrPeriodo extends BaseModel {
  @ManyToOne(() => DrPremio, { nullable: true })
  @JoinColumn({ name: 'premio_id' })
  premio?: DrPremio | null;

  @ManyToOne(() => DrEncuesta, { nullable: true })
  @JoinColumn({ name: 'encuesta_id' })
  encuesta?: DrEncuesta | null;

  @Column({ type: 'date' })
  desde!: Date;

  @Column({ type: 'date' })
  hasta!: Date;

  /** Momento de apertura/cierre de la votación (encuestas). */
  @Column({ name: 'abre_en', nullable: true })
  abreEn?: Date;

  @Column({ name: 'cierra_en', nullable: true })
  cierraEn?: Date;

  @Column({ type: 'text', enum: DrPeriodoEstado, default: DrPeriodoEstado.ABIERTO })
  estado!: DrPeriodoEstado;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'cerrado_por_id' })
  cerradoPor?: Usuario | null;

  @Column({ name: 'cerrado_en', nullable: true })
  cerradoEn?: Date;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'aprobado_por_id' })
  aprobadoPor?: Usuario | null;

  @Column({ name: 'aprobado_en', nullable: true })
  aprobadoEn?: Date;
}
