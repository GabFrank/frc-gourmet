import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Persona } from '../personas/persona.entity';
import { Usuario } from '../personas/usuario.entity';
import { Moneda } from '../financiero/moneda.entity';
import { Cargo } from './cargo.entity';
import { MotivoEgreso } from './motivo-egreso.enum';

/**
 * Funcionario / empleado. Vinculado a una Persona y opcionalmente a un Usuario.
 */
@Entity('funcionarios')
export class Funcionario extends BaseModel {
  @ManyToOne(() => Persona)
  @JoinColumn({ name: 'persona_id' })
  persona!: Persona;

  @Index({ unique: true })
  @Column({ name: 'codigo_interno', nullable: true })
  codigoInterno?: string;

  @ManyToOne(() => Cargo)
  @JoinColumn({ name: 'cargo_id' })
  cargo!: Cargo;

  @Column({ name: 'fecha_ingreso', type: 'date' })
  fechaIngreso!: Date;

  @Column({ name: 'fecha_egreso', type: 'date', nullable: true })
  fechaEgreso?: Date;

  @Column({
    name: 'motivo_egreso',
    type: 'text',
    enum: MotivoEgreso,
    nullable: true,
  })
  motivoEgreso?: MotivoEgreso;

  @Column({
    name: 'salario_base',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  salarioBase!: number;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_salario_id' })
  monedaSalario!: Moneda;

  @Column({ name: 'es_jornalero', default: false })
  esJornalero!: boolean;

  @Column({
    name: 'valor_jornal',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  valorJornal?: number;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: Usuario;

  @Column({ name: 'ips_activo', default: false })
  ipsActivo!: boolean;

  @Column({ name: 'numero_ips', nullable: true })
  numeroIps?: string;

  @Column({ name: 'cuenta_bancaria_propia', nullable: true })
  cuentaBancariaPropia?: string;

  @Column({ nullable: true })
  observacion?: string;

  @Column({ default: true })
  activo!: boolean;
}
