import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoReglaComision, ModoValidacionComision, RecurrenciaComision } from './regla-comision-enums';

@Entity('reglas_comision')
export class ReglaComision extends BaseModel {
  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ name: 'tipo', type: 'varchar', enum: TipoReglaComision })
  tipo!: TipoReglaComision;

  @Column({ name: 'monto_base', type: 'decimal', precision: 18, scale: 2, default: 0 })
  montoBase!: number;

  @Column({ name: 'porcentaje', type: 'decimal', precision: 18, scale: 2, nullable: true })
  porcentaje?: number;

  @Column({ name: 'meta_unidades', type: 'int', nullable: true })
  metaUnidades?: number;

  @Column({ name: 'meta_monto_local', type: 'decimal', precision: 18, scale: 2, nullable: true })
  metaMontoLocal?: number;

  @Column({ name: 'modo_validacion', type: 'varchar', enum: ModoValidacionComision, default: ModoValidacionComision.TODO_O_NADA })
  modoValidacion!: ModoValidacionComision;

  @Column({ name: 'recurrencia', type: 'varchar', enum: RecurrenciaComision, default: RecurrenciaComision.INDEFINIDA })
  recurrencia!: RecurrenciaComision;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio?: Date;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin?: Date;

  @Column({ name: 'es_equipo', default: false })
  esEquipo!: boolean;

  @Column({ default: true })
  activo!: boolean;
}
