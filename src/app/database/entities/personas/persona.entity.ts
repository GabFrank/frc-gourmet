import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';
import { DocumentoTipo } from './documento-tipo.enum';
import { PersonaTipo } from './persona-tipo.enum';
import { Sexo } from './sexo.enum';
import { EstadoCivil } from './estado-civil.enum';

/**
 * Entity representing a person (either individual or company)
 */
@Entity('personas')
export class Persona extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  apellido?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  fechaNacimiento?: Date;

  @Column({
    type: 'text',
    enum: Sexo,
    nullable: true
  })
  sexo?: Sexo;

  @Column({
    name: 'estado_civil',
    type: 'text',
    enum: EstadoCivil,
    nullable: true
  })
  estadoCivil?: EstadoCivil;

  @Column({
    type: 'text',
    enum: DocumentoTipo,
    default: DocumentoTipo.CI
  })
  tipoDocumento!: DocumentoTipo;

  @Column({ nullable: true })
  documento?: string;

  @Column({
    type: 'text',
    enum: PersonaTipo,
    default: PersonaTipo.FISICA
  })
  tipoPersona!: PersonaTipo;

  @Column({ default: true })
  activo!: boolean;

  @Column({ nullable: true })
  imageUrl?: string;
}
