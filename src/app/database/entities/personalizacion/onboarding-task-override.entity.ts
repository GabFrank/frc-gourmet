import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Override manual del estado de una tarea de onboarding. Las tareas se
 * autodetectan por queries sobre las entidades del dominio; este override
 * permite marcar manualmente una tarea como MANUAL ("ya lo hice, no tengo
 * data") o SKIPPED ("no aplica a mi negocio").
 *
 * Si `usuario` es null → override global (lo ven todos). Si tiene valor →
 * override per-user (solo aplica a SHORTCUT_PERSONAL en la convención actual).
 */
@Entity('onboarding_task_overrides')
@Unique(['taskKey', 'usuario'])
export class OnboardingTaskOverride extends BaseModel {
  @Column({ type: 'varchar', length: 60, name: 'task_key' })
  taskKey!: string;

  @Column({ type: 'varchar', length: 20 })
  estado!: 'MANUAL' | 'SKIPPED';

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario | null;
}
