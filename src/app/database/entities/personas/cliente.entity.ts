import { Column, Entity, ManyToOne, JoinColumn, ManyToMany, JoinTable } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Persona } from './persona.entity';
import { TipoCliente } from './tipo-cliente.entity';
import { Convenio } from './convenio.entity';

/**
 * Entity representing a client with business-related attributes
 */
@Entity('clientes')
export class Cliente extends BaseModel {
  @ManyToOne(() => Persona)
  @JoinColumn({ name: 'persona_id' })
  persona!: Persona;

  @Column({ nullable: true })
  ruc?: string;

  @Column({ nullable: true })
  razon_social?: string;

  @Column({ default: false })
  tributa!: boolean;

  @ManyToOne(() => TipoCliente)
  @JoinColumn({ name: 'tipo_cliente_id' })
  tipo_cliente!: TipoCliente;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  credito!: boolean;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  limite_credito!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, name: 'saldo_actual' })
  saldoActual!: number;

  // Convenios a los que pertenece el cliente (ej. funcionario de una empresa con
  // acuerdo). Lado dueno del M2M.
  @ManyToMany(() => Convenio, (convenio: Convenio) => convenio.clientes, {
    createForeignKeyConstraints: false,
  })
  @JoinTable({
    name: 'cliente_convenios',
    joinColumn: { name: 'cliente_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'convenio_id', referencedColumnName: 'id' },
  })
  convenios?: Convenio[];
}
