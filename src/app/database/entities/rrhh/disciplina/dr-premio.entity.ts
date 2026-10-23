import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Moneda } from '../../financiero/moneda.entity';
import { DrGrupo } from './dr-grupo.entity';
import { DrEncuesta } from './dr-encuesta.entity';
import { DrPremioMetodo, DrPremioPeriodo, DrReglaEmpate } from './dr-premio.enum';

@Entity('dr_premio')
export class DrPremio extends BaseModel {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  area?: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  monto!: number;

  @ManyToOne(() => Moneda, { nullable: true })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda | null;

  @Column({ type: 'text', enum: DrPremioPeriodo, default: DrPremioPeriodo.SEMANAL })
  periodo!: DrPremioPeriodo;

  @Column({ type: 'text', enum: DrPremioMetodo, default: DrPremioMetodo.CRITERIOS })
  metodo!: DrPremioMetodo;

  @Column({ name: 'regla_empate', type: 'text', enum: DrReglaEmpate, default: DrReglaEmpate.DIVIDIR })
  reglaEmpate!: DrReglaEmpate;

  /** Saldo inicial para el método SALDO_PUNTOS. */
  @Column({ name: 'puntos_iniciales', type: 'decimal', precision: 18, scale: 2, nullable: true })
  puntosIniciales?: number | null;

  @ManyToOne(() => DrEncuesta, { nullable: true })
  @JoinColumn({ name: 'encuesta_id' })
  encuesta?: DrEncuesta | null;

  @ManyToOne(() => DrGrupo, { nullable: true })
  @JoinColumn({ name: 'grupo_id' })
  grupo?: DrGrupo | null;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('DrCriterio', 'premio')
  criterios?: any[];
}
