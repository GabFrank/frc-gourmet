import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { FtPlantillaTarea } from './ft-plantilla-tarea.entity';
import { FtCanalAviso, FtMomentoAviso } from './ft.enums';

/**
 * Cuándo y por dónde avisar de una tarea. Nivel 1 persona/encargado, 2 grupo ADM,
 * 3 propuesta de falta (ft_propuesta_falta, nunca multa directa).
 */
@Entity('ft_regla_aviso')
export class FtReglaAviso extends BaseModel {
  @ManyToOne(() => FtPlantillaTarea, (p) => p.reglas, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plantilla_id' })
  plantilla!: FtPlantillaTarea;

  @Column({ type: 'text', enum: FtMomentoAviso })
  momento!: FtMomentoAviso;

  @Column({ type: 'integer', default: 0 })
  minutos!: number;

  @Column({ type: 'integer', default: 1 })
  nivel!: number;

  @Column({ type: 'text', enum: FtCanalAviso, default: FtCanalAviso.APP })
  canal!: FtCanalAviso;

  /** Destino configurable (teléfono o grupo); vacío = el de ft_config / el encargado. */
  @Column({ type: 'text', nullable: true })
  destino?: string | null;

  @Column({ default: true })
  activo!: boolean;
}
