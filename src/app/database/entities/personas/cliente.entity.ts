import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Persona } from './persona.entity';
import { TipoCliente } from './tipo-cliente.entity';

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

  @Column({ type: 'float', default: 0 })
  limite_credito!: number;
} 