import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Funcionario } from '../funcionario.entity';
import { DrPeriodo } from './dr-periodo.entity';
import { DrEncuestaPregunta } from './dr-encuesta-pregunta.entity';
import { drNuevoUuid } from './dr-uuid';

/**
 * Agregado de votos por (período, evaluado, pregunta). Nunca se guarda un voto
 * individual. ANONIMATO: no hereda BaseModel, id UUID aleatorio.
 *
 * Mientras el período está ABIERTO los agregados viven solo en `datos_cifrados`
 * (AES-GCM, clave fuera de la base); las columnas numéricas quedan en NULL y se
 * llenan al cerrar el período.
 */
@Entity('dr_voto_agregado')
@Index('UQ_dr_voto_agregado_periodo_eval_preg', ['periodo', 'evaluado', 'pregunta'], { unique: true })
export class DrVotoAgregado {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @ManyToOne(() => DrPeriodo, { nullable: false })
  @JoinColumn({ name: 'periodo_id' })
  periodo!: DrPeriodo;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'evaluado_id' })
  evaluado!: Funcionario;

  @ManyToOne(() => DrEncuestaPregunta, { nullable: false })
  @JoinColumn({ name: 'pregunta_id' })
  pregunta!: DrEncuestaPregunta;

  @Column({ name: 'datos_cifrados', type: 'text', nullable: true })
  datosCifrados?: string | null;

  @Column({ name: 'suma_ponderada', type: 'decimal', precision: 18, scale: 2, nullable: true })
  sumaPonderada?: number | null;

  @Column({ name: 'suma_pesos', type: 'decimal', precision: 18, scale: 2, nullable: true })
  sumaPesos?: number | null;

  @Column({ type: 'integer', nullable: true })
  cantidad?: number | null;

  @Column({ name: 'conteo_si', type: 'integer', nullable: true })
  conteoSi?: number | null;

  @Column({ name: 'conteo_no', type: 'integer', nullable: true })
  conteoNo?: number | null;

  @BeforeInsert()
  asignarId(): void {
    if (!this.id) this.id = drNuevoUuid();
  }
}
