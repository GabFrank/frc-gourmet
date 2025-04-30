import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';

/**
 * Entity representing a reservation
 */
@Entity('reservas')
export class Reserva extends BaseModel {
  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @Column()
  nombre_cliente!: string;

  @Column()
  numero_cliente!: string;

  @Column({ type: 'datetime' })
  fecha_hora_reserva!: Date;

  @Column({ type: 'int', default: 1 })
  cantidad_personas!: number;

  @Column({ type: 'text', nullable: true })
  motivo?: string;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ default: true })
  activo!: boolean;
} 