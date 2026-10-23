import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { DrGrupo } from './dr-grupo.entity';
import { DrGrupoRol } from './dr-grupo-rol.enum';

@Entity('dr_grupo_miembro')
@Index('UQ_dr_grupo_miembro_grupo_funcionario', ['grupo', 'funcionario'], { unique: true })
export class DrGrupoMiembro extends BaseModel {
  @ManyToOne(() => DrGrupo, (g) => g.miembros, { nullable: false })
  @JoinColumn({ name: 'grupo_id' })
  grupo!: DrGrupo;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ type: 'text', enum: DrGrupoRol, default: DrGrupoRol.MIEMBRO })
  rol!: DrGrupoRol;

  /** Peso del voto de esta persona en las encuestas del grupo. */
  @Column({ name: 'peso_voto', type: 'decimal', precision: 18, scale: 2, default: 1 })
  pesoVoto!: number;

  @Column({ default: true })
  activo!: boolean;
}
