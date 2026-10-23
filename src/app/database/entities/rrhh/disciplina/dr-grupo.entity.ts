import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';

/** Grupo de trabajo del módulo Disciplina y Reconocimiento (ej. EQUIPO COCINA). */
@Entity('dr_grupo')
export class DrGrupo extends BaseModel {
  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  /** Área configurable: COCINA, SALON, DELIVERY... */
  @Column({ type: 'varchar', length: 60, nullable: true })
  area?: string | null;

  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('DrGrupoMiembro', 'grupo')
  miembros?: any[];
}
