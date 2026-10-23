import { BeforeInsert, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Funcionario } from '../funcionario.entity';
import { DrPeriodo } from './dr-periodo.entity';
import { drNuevoUuid } from './dr-uuid';

/**
 * Solo registra que una persona YA votó en un período. ANONIMATO: no hereda
 * BaseModel (sin created_at/created_by/updated_*), sin fecha ni orden, id UUID
 * aleatorio. No guardar aquí nada más.
 */
@Entity('dr_participacion')
@Index('UQ_dr_participacion_periodo_func', ['periodo', 'funcionario'], { unique: true })
export class DrParticipacion {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @ManyToOne(() => DrPeriodo, { nullable: false })
  @JoinColumn({ name: 'periodo_id' })
  periodo!: DrPeriodo;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @BeforeInsert()
  asignarId(): void {
    if (!this.id) this.id = drNuevoUuid();
  }
}
